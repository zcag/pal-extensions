// The real driver: finds TVs (mDNS `_samsungmsf._tcp`, whose TXT `se`
// names the REST base, plus SSDP for TVs that answer it), pairs (the
// Allow prompt), and keeps one connection per TV. The connection is the
// remote websocket while the screen is on (keys, text, the app list),
// and a poll of REST and UPnP every `POLL_MS` for what the websocket does
// not tell: power, volume and mute, the app in front, a DLNA sender's
// media. With IP Control paired the poll also asks it what the TV is
// showing (the input, the exact volume, the picture mode, the sound output
// in use, whether the screen is on); the outputs themselves are listed when
// asked (a remote opening, a switch) and as the TV comes on (in standby it
// lists none). A remote that drops while the TV is on is reopened with
// backoff; one that drops because the TV went to standby is not.
import * as ipc from "./protocol/ipc.ts";
import * as rest from "./protocol/rest.ts";
import { Remote, KEYS, appsMsg, parseApps, clickMsg, iconMsg, imeText, keyMsg, moveMsg, remoteUrl, textEndMsg, textMsg } from "./protocol/remote.ts";
import { ssdp, wol } from "./protocol/net.ts";
import * as upnp from "./protocol/upnp.ts";
import type { App, AppState, ChangeEvent, Conn, Driver, Found, Input, Key, Keyboard, Media, Paired, Pairing, Picture, PictureField, Power, Press, Sound } from "./types.ts";

/** How often REST and UPnP are asked while a connection is open. */
export const POLL_MS = 3000;
/** Connect with a token: the TV answers at once or not at all. */
const CONNECT_MS = 5000;
/** The Allow prompt stays up about 30 s on current TVs. */
export const PAIR_MS = 35_000;
const HOLD_MS = 1000;
const RETRY_MIN_MS = 2000, RETRY_MAX_MS = 30_000;
/** How long a turn-on waits for the TV to say it is on. */
const WAKE_MS = 20_000;
/** How long a switch (sound, input, picture mode) waits for the TV to report it, asking every `STEP_MS`. */
const SWITCH_MS = 8000, STEP_MS = 400;
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * What the local api can switch, measured on a 2024 QE75QN85D: KEY_HDMI
 * moves to the next HDMI input, KEY_SOURCE opens the TV's own input menu,
 * KEY_TV goes to the tuner; the numbered KEY_HDMI1..4 do nothing there.
 * The current input is not told over these, so none is marked.
 */
export const INPUTS: Input[] = [
  { id: "hdmi", name: "Next HDMI", sure: true },
  { id: "source", name: "Input menu", sure: true },
  { id: "tv", name: "TV", sure: false },
];

/** With IP Control: the ports, the one on screen told (`getTVStates.inputSource`). */
export const PORTS: Input[] = [
  { id: "hdmi1", name: "HDMI 1", sure: true }, { id: "hdmi2", name: "HDMI 2", sure: true },
  { id: "hdmi3", name: "HDMI 3", sure: true }, { id: "hdmi4", name: "HDMI 4", sure: true },
  { id: "tv", name: "TV", sure: true },
];

/**
 * Where the driver talks: the TV's own ports by default; the tests point
 * every channel at one local server (`port`, plain ws) instead.
 */
export type Wiring = { port?: number; secure?: boolean; pollMs?: number; stepMs?: number };

export function makeDriver(w: Wiring = {}): Driver {
  const restPort = w.port ?? 8001, upnpPort = w.port ?? 9197;
  const remote = (address: string, token?: string) => remoteUrl(address, token, { port: w.port, secure: w.secure ?? !w.port });
  const probe = (address: string) => rest.info(address, 2000, restPort);
  const ipcWire: ipc.Wire = { port: w.port, secure: w.secure ?? !w.port };

  return {
    probe,
    async scan(timeoutMs) {
      const [m, s] = await Promise.all([mdns(timeoutMs).catch(() => []), ssdp(timeoutMs).catch(() => [])]);
      const found = (await Promise.all([...new Set([...m, ...s])].map((a) => probe(a)))).filter((f): f is Found => !!f && f.tokenAuth);
      return [...new Map(found.map((f) => [f.id, f])).values()].sort((a, b) => a.name.localeCompare(b.name));
    },
    async pair(found) {
      let cancel = () => {};
      const token = (async () => {
        const r = await Promise.race([
          Remote.connect(remote(found.address), PAIR_MS),
          new Promise<never>((_, rej) => { cancel = () => rej(new Error("The pairing was cancelled")); }),
        ]);
        r.close();
        if (!r.token) throw new Error(`${found.name} allowed pal but gave no token; is it a 2016 or later Tizen TV?`);
        return r.token;
      })();
      return { token, cancel: () => cancel() } satisfies Pairing;
    },
    async pairSound(device) {
      const ac = new AbortController();
      const token = ipc.createAccessToken(device.address, { ...ipcWire, signal: ac.signal }).catch((e) => { throw new Error(soundRefusal(e, ac.signal.aborted)); });
      return { token, cancel: () => ac.abort() } satisfies Pairing;
    },
    async connect(device) {
      const c = new RealConn(device, { remote, restPort, upnpPort, ipc: ipcWire, pollMs: w.pollMs ?? POLL_MS, stepMs: w.stepMs ?? STEP_MS });
      await c.start();
      return c;
    },
    async wake(device) {
      if (!device.mac) throw new Error("The TV's MAC address is not known, so it cannot be woken; turn it on once by hand");
      await wol(device.mac, device.address);
    },
  };
}

export const realDriver = makeDriver();

/** Why IP Control's pairing did not give a token, in words: cancelled, no one answering the prompt, IP Remote off. */
function soundRefusal(e: unknown, cancelled: boolean): string {
  if (cancelled) return "The pairing was cancelled";
  if ((e as Error)?.name === "TimeoutError") return "No one pressed Allow on the TV in time";
  if (e instanceof TypeError) return ipc.OFF;
  return "The TV did not allow sound control";
}

/**
 * TVs answering mDNS: `_samsungmsf._tcp` (the TXT's `se` is the REST base,
 * `http://<ip>:8001/api/v2/`), and `_airplay._tcp` with
 * `manufacturer=Samsung`: on hornet bonjour-service never heard the
 * former from a 2024 TV that `dns-sd -B` lists, while the latter came at once.
 */
async function mdns(timeoutMs: number): Promise<string[]> {
  const { Bonjour } = await import("bonjour-service");
  return new Promise((resolve) => {
    const b = new Bonjour(), out = new Set<string>();
    const ipv4 = (xs?: string[]) => xs?.find((x) => /^\d+\.\d+\.\d+\.\d+$/.test(x) && !x.startsWith("169.254."));
    const txt = (s: { txt?: unknown }) => (s.txt ?? {}) as Record<string, string>;
    b.find({ type: "samsungmsf", protocol: "tcp" }, (s) => {
      const a = /^https?:\/\/([^:/]+)/.exec(String(txt(s).se ?? ""))?.[1] ?? ipv4(s.addresses);
      if (a) out.add(a);
    });
    b.find({ type: "airplay", protocol: "tcp" }, (s) => {
      const a = /samsung/i.test(txt(s).manufacturer ?? "") ? ipv4(s.addresses) : undefined;
      if (a) out.add(a);
    });
    setTimeout(() => { b.destroy(); resolve([...out]); }, timeoutMs);
  });
}

type Wired = { remote: (address: string, token?: string) => string; restPort: number; upnpPort: number; ipc: ipc.Wire; pollMs: number; stepMs: number };

class RealConn implements Conn {
  private r: Remote | undefined;
  private opening: Promise<void> | undefined;
  private listeners = new Set<(e: ChangeEvent) => void>();
  private closed = false;
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private retryMs = RETRY_MIN_MS;
  private retryAt = 0;
  token: string;
  private st: { power: Power; volume?: number; muted?: boolean; front?: AppState; media?: Media; keyboard: Keyboard; sound?: Sound; input?: Input["id"]; picture?: Picture } = { power: "unknown", keyboard: { open: false } };
  ipcToken: string | undefined;
  private appList: App[] | undefined;
  /** The TV left `ed.installedApp.get` unanswered once: not asked again on this connection. */
  private unlisted = false;

  constructor(readonly device: Paired, private w: Wired) { this.token = device.token; this.ipcToken = device.ipcToken; }

  get remoteUp() { return !!this.r?.open; }
  private emit(e: ChangeEvent) { for (const l of this.listeners) { try { l(e); } catch {} } }

  /** The first poll, then the remote when the screen is on: a TV in standby still connects, with keys waiting for it to wake. */
  async start() {
    await this.poll();
    if (this.st.power === "off") throw new Error(`${this.device.name} does not answer; is it on and on this network?`);
    if (this.st.power === "on") await this.openRemote().catch(() => {});
    this.schedule();
  }

  private schedule() {
    if (this.closed) return;
    this.pollTimer = setTimeout(async () => { await this.poll().catch(() => {}); this.schedule(); }, this.w.pollMs);
  }

  /** One round of REST and UPnP, and IP Control when it is paired; each change said once. */
  private async poll() {
    const a = this.device.address;
    const info = await rest.info(a, 2000, this.w.restPort);
    let power: Power = info?.power ?? "off";
    // REST can say on while the panel is dark; IP Control's powerControl knows.
    if (power === "on" && this.ipcToken && !(await this.withIpc((t) => ipc.screenOn(a, t, this.w.ipc)).catch(() => true))) power = "standby";
    if (power !== this.st.power) {
      this.st.power = power;
      this.emit({ kind: "power" });
      if (power !== "on") { this.st.volume = this.st.muted = this.st.input = undefined; this.setFront(undefined); this.setMedia(undefined); }
      else if (this.ipcToken) void this.readSound().catch(() => {});
    }
    if (power !== "on") return;
    if (!this.r && !this.opening && Date.now() >= this.retryAt) void this.openRemote().catch(() => {});
    const [upnpVol, upnpMute, media, front, states] = await Promise.all([
      upnp.soap(a, upnp.RC, "GetVolume", { Channel: "Master" }, 2000, this.w.upnpPort).then((f) => Number(f.CurrentVolume), () => undefined),
      upnp.soap(a, upnp.RC, "GetMute", { Channel: "Master" }, 2000, this.w.upnpPort).then((f) => f.CurrentMute === "1", () => undefined),
      this.readMedia().catch(() => undefined),
      this.readFront(),
      this.ipcToken ? this.readStates().catch(() => undefined) : undefined,
    ]);
    if (upnpVol !== undefined && !Number.isNaN(upnpVol)) await this.probeLevel(upnpVol);
    // IP Control tells the level the soundbar plays at too, where UPnP reads 0.
    const vol = states?.volume ?? (upnpVol !== undefined && !Number.isNaN(upnpVol) ? upnpVol : undefined);
    const mute = states?.mute ? states.mute === "muteOn" : upnpMute;
    if ((vol !== undefined && vol !== this.st.volume) || (mute !== undefined && mute !== this.st.muted)) {
      if (vol !== undefined) this.st.volume = vol;
      if (mute !== undefined) this.st.muted = mute;
      this.emit({ kind: "volume" });
    }
    if (states) this.takeStates(states);
    this.setMedia(media);
    this.setFront(front);
  }

  /** What `getTVStates` said beyond the volume: the input, the picture mode, the output in use. */
  private takeStates(s: ipc.TvStates) {
    const input = ipc.inputId(s.inputSource) as Input["id"] | undefined;
    if (input !== this.st.input) { this.st.input = input; this.emit({ kind: "input" }); }
    if (s.pictureMode && s.pictureMode !== this.st.picture?.mode) { this.st.picture = { values: {}, ...this.st.picture, mode: s.pictureMode }; this.emit({ kind: "picture" }); }
    const outs = this.st.sound?.outputs;
    if (outs) this.setSound({ outputs: outs, current: ipc.currentOf(s.speakerSelect, outs) });
  }

  private async readMedia() {
    const [t, p] = await Promise.all([upnp.soap(this.device.address, upnp.AVT, "GetTransportInfo", {}, 2000, this.w.upnpPort), upnp.soap(this.device.address, upnp.AVT, "GetPositionInfo", {}, 2000, this.w.upnpPort)]);
    return upnp.mediaOf(t, p, Date.now());
  }

  /** The visible app among those listed (the catalog's when no list was read yet). */
  private async readFront(): Promise<AppState | undefined> {
    const ids = (this.appList ?? rest.CATALOG).map((x) => x.id);
    const states = await Promise.all(ids.map((id) => rest.appState(this.device.address, id, 2000, this.w.restPort)));
    return states.find((s) => s?.visible);
  }

  private setFront(f: AppState | undefined) {
    if (f?.id === this.st.front?.id && f?.visible === this.st.front?.visible) return;
    this.st.front = f; this.emit({ kind: "app" });
  }
  private setMedia(m: Media | undefined) {
    const k = (x?: Media) => (x ? `${x.state}|${x.url}|${x.position}` : "");
    if (k(m) === k(this.st.media)) return;
    this.st.media = m; this.emit({ kind: "media" });
  }

  /** Open the remote (one attempt at a time); a later drop schedules the next attempt, backing off. */
  private openRemote(): Promise<void> {
    if (this.r?.open) return Promise.resolve();
    return (this.opening ??= (async () => {
      try {
        const r = await Remote.connect(this.w.remote(this.device.address, this.token), CONNECT_MS);
        if (this.closed) { r.close(); return; }
        this.r = r; this.retryMs = RETRY_MIN_MS;
        if (r.token && r.token !== this.token) { this.token = r.token; this.emit({ kind: "token", token: r.token }); }
        r.on((e) => this.onEvent(e.event, e.data));
        r.onClose((why) => {
          if (this.r !== r) return;
          this.r = undefined;
          if (this.st.keyboard.open) { this.st.keyboard = { open: false }; this.emit({ kind: "keyboard" }); }
          this.emit({ kind: "connection", up: false, error: why });
          this.retryAt = Date.now() + this.retryMs; this.retryMs = Math.min(RETRY_MAX_MS, this.retryMs * 2);
        });
        this.emit({ kind: "connection", up: true });
      } catch (e) {
        this.retryAt = Date.now() + this.retryMs; this.retryMs = Math.min(RETRY_MAX_MS, this.retryMs * 2);
        this.emit({ kind: "connection", up: false, error: errorMessage(e) });
        throw e;
      } finally { this.opening = undefined; }
    })());
  }

  private onEvent(event: string, data: any) {
    if (event === "ms.remote.imeStart") this.st.keyboard = { open: true };
    else if (event === "ms.remote.imeUpdate") this.st.keyboard = { open: true, text: imeText(data) };
    else if (event === "ms.remote.imeEnd") this.st.keyboard = { open: false };
    else return;
    this.emit({ kind: "keyboard" });
  }

  /** The remote, opened now when the TV is on and it is not; why not, in words. */
  private async remote(): Promise<Remote> {
    if (this.r?.open) return this.r;
    // Network standby keeps the websocket on some TVs (KEY_POWER wakes from there); off is off.
    if (this.st.power === "off") throw new Error(`${this.device.name} is off`);
    await this.openRemote();
    if (!this.r) throw new Error("The TV's remote is not connected");
    return this.r;
  }

  async rawKey(code: string, press: Press = "tap") {
    const r = await this.remote();
    if (press === "tap") return r.send(keyMsg(code));
    r.send(keyMsg(code, "Press"));
    await sleep(HOLD_MS);
    r.send(keyMsg(code, "Release"));
  }
  key(key: Key, press?: Press) { return this.rawKey(KEYS[key], press); }
  async pointer(dx: number, dy: number) { (await this.remote()).send(moveMsg(dx, dy)); }
  async click() { (await this.remote()).send(clickMsg()); }

  power() { return this.st.power; }

  /** Standby with a working remote: KEY_POWER. Always Wake-on-LAN too (off, or a remote that will not open), then wait for "on". */
  async turnOn() {
    if (this.st.power === "on") return;
    if (this.st.power === "standby") await this.rawKey(KEYS.power).catch(() => {});
    if (this.device.mac) await wol(this.device.mac, this.device.address).catch(() => {});
    const until = Date.now() + WAKE_MS;
    while (Date.now() < until && !this.closed) {
      await this.poll().catch(() => {});
      if (this.power() === "on") return;
      await sleep(1000);
    }
    throw new Error(this.device.mac ? `${this.device.name} did not wake; is "Power on with mobile" on in its settings?` : `${this.device.name} did not wake, and its MAC address is not known for Wake-on-LAN`);
  }
  async turnOff() {
    if (this.st.power !== "on") return;
    await this.rawKey(KEYS.power);
  }

  /**
   * Whether the TV takes an exact level. With its sound on the soundbar
   * (the QE75QN85D and an HW-Q600C, 2026-10-04) it reads 0 and refuses
   * `SetVolume` even to the level it has (501 Action Failed), while the
   * volume keys still reach the soundbar: then only steps. Asked by setting
   * the level it reads, once a connection and again a minute after a refusal,
   * since the sound can move back to the TV's speakers.
   */
  levelSettable() { return this.levelOk || (this.ipcToken && this.ipcLevelOk !== false ? true : this.levelOk); }
  private levelOk: boolean | undefined;
  /** IP Control's directVolumeControl refused a level once on this connection. */
  private ipcLevelOk: boolean | undefined;
  private probedAt = 0;
  private async probeLevel(vol: number) {
    if (this.levelOk === true || (this.levelOk === false && Date.now() - this.probedAt < 60_000)) return;
    this.probedAt = Date.now();
    const ok = await upnp.soap(this.device.address, upnp.RC, "SetVolume", { Channel: "Master", DesiredVolume: vol }, 2000, this.w.upnpPort).then(() => true, () => false);
    if (ok !== this.levelOk) { this.levelOk = ok; this.emit({ kind: "volume" }); }
  }
  volume() { return this.st.volume; }
  /** UPnP while the TV takes it; with its sound on the soundbar, IP Control's directVolumeControl. */
  async setVolume(level: number) {
    const v = Math.round(Math.min(100, Math.max(0, level)));
    const ok = this.levelOk !== false && (await upnp.soap(this.device.address, upnp.RC, "SetVolume", { Channel: "Master", DesiredVolume: v }, 2000, this.w.upnpPort).then(() => true, () => false));
    if (!ok) {
      if (this.levelOk !== false) { this.levelOk = false; this.probedAt = Date.now(); this.emit({ kind: "volume" }); }
      if (!this.ipcToken || this.ipcLevelOk === false) throw new Error("The TV takes only volume up and down while its sound is on another speaker");
      try { await this.withIpc((t) => ipc.control(this.device.address, t, "directVolumeControl", { volume: v }, this.w.ipc)); } catch (e) {
        if (!(e instanceof ipc.Unpaired)) { this.ipcLevelOk = false; this.emit({ kind: "volume" }); }
        throw new Error("The TV takes only volume up and down while its sound is on another speaker");
      }
      this.ipcLevelOk = true;
    } else this.levelOk = true;
    if (v !== this.st.volume) { this.st.volume = v; this.emit({ kind: "volume" }); }
  }
  muted() { return this.st.muted; }
  async setMuted(m: boolean) {
    const ok = await upnp.soap(this.device.address, upnp.RC, "SetMute", { Channel: "Master", DesiredMute: m ? 1 : 0 }, 2000, this.w.upnpPort).then(() => true, (e) => { if (!this.ipcToken) throw e; return false; });
    if (!ok) await this.withIpc((t) => ipc.control(this.device.address, t, "muteControl", { mute: m ? "muteOn" : "muteOff" }, this.w.ipc));
    if (m !== this.st.muted) { this.st.muted = m; this.emit({ kind: "volume" }); }
  }

  inputs() { return this.ipcToken ? PORTS : INPUTS; }
  input() { return this.ipcToken ? this.st.input : undefined; }
  /** IP Control's inputSourceControl took a port on this connection (true), or refused one (false: Next HDMI from then on). */
  private direct: boolean | undefined;
  async setInput(id: Input["id"]): Promise<"direct" | "stepped" | "key"> {
    if (!this.ipcToken || id === "hdmi" || id === "source") { await this.rawKey(KEYS[id]); return "key"; }
    if (this.st.input === id) return "direct";
    if (this.direct !== false) {
      try {
        await this.withIpc((t) => ipc.control(this.device.address, t, "inputSourceControl", { inputSource: ipc.inputSource(id) }, this.w.ipc));
        if (await this.waitStates((s) => ipc.inputId(s.inputSource) === id)) { this.direct = true; return "direct"; }
      } catch (e) { if (e instanceof ipc.Unpaired) throw e; }
      this.direct = false;
    }
    if (id === "tv") { await this.rawKey(KEYS.tv); await this.waitStates((s) => ipc.inputId(s.inputSource) === id); return "key"; }
    for (let i = 0; i < PORTS.length && this.st.input !== id; i++) {
      const was = this.st.input;
      await this.rawKey(KEYS.hdmi);
      await this.waitStates((s) => ipc.inputId(s.inputSource) !== was);
    }
    if (this.st.input !== id) throw new Error(`The TV did not move to ${PORTS.find((p) => p.id === id)?.name ?? id}`);
    return "stepped";
  }

  /** Read `getTVStates` until `done` holds or `SWITCH_MS` passes; each read taken in. */
  private async waitStates(done: (s: ipc.TvStates) => boolean): Promise<boolean> {
    const until = Date.now() + SWITCH_MS;
    for (;;) {
      const s = await this.readStates();
      this.takeStates(s);
      if (done(s)) return true;
      if (Date.now() >= until || this.closed) return false;
      await sleep(this.w.stepMs);
    }
  }

  /** `ed.installedApp.get` when the remote is up and it answers with apps; else every catalog app the TV has, over REST. */
  async apps(): Promise<App[]> {
    // A 2024 QE75QN85D never answers `ed.installedApp.get`: asked once, then the known ids alone (a list waited 5 s on it every time and ran the index's 10 s out).
    if (!this.unlisted && (this.r?.open || this.st.power === "on")) {
      const r = await this.remote().catch(() => undefined);
      const e = r && (await r.request(appsMsg(), "ed.installedApp.get", 2000).catch(() => undefined));
      const listed = e ? parseApps(e.data) : [];
      if (listed.length) return (this.appList = listed);
      if (r && !e) this.unlisted = true;
    }
    const states = await Promise.all(rest.CATALOG.map((a) => rest.appState(this.device.address, a.id, 2000, this.w.restPort)));
    const seen = new Set<string>(), out: App[] = [];
    rest.CATALOG.forEach((a, i) => { if (states[i] && !seen.has(a.name)) { seen.add(a.name); out.push({ id: a.id, name: a.name }); } });
    return (this.appList = out);
  }
  foreground() { return this.st.front; }

  /**
   * Over REST: on a 2024 QE75QN85D the websocket's `ed.apps.launch` (native
   * or deep link) opened nothing, while `POST /api/v2/applications/<id>`
   * brought the app up at once.
   */
  launch(id: string) { return rest.appRequest(this.device.address, id, "POST", 3000, this.w.restPort); }
  quit(id: string) { return rest.appRequest(this.device.address, id, "DELETE", 3000, this.w.restPort); }
  async icon(app: App): Promise<Uint8Array | null> {
    if (!app.icon) return null;
    const e = await (await this.remote()).request(iconMsg(app.icon), "ed.apps.icon", 5000);
    const b64 = e?.data?.imageBase64;
    return typeof b64 === "string" && b64 ? new Uint8Array(Buffer.from(b64, "base64")) : null;
  }

  media() { return this.st.media; }
  keyboard() { return this.st.keyboard; }
  async type(text: string, done = false) {
    const r = await this.remote();
    if (text) r.send(textMsg(text));
    if (done) r.send(textEndMsg());
  }

  sound() { return this.ipcToken ? this.st.sound : undefined; }
  private setSound(s: Sound | undefined) {
    if (JSON.stringify(s) === JSON.stringify(this.st.sound)) return;
    this.st.sound = s; this.emit({ kind: "sound" });
  }
  setIpcToken(token: string | undefined) {
    this.ipcToken = token;
    if (token) void this.readSound().catch(() => {});
    else { this.setSound(undefined); this.st.input = undefined; this.st.picture = undefined; this.emit({ kind: "input" }); this.emit({ kind: "picture" }); }
  }
  /** One IP Control exchange with the token; a token the TV no longer knows is dropped and said (`ipcLost`). */
  private async withIpc<T>(f: (token: string) => Promise<T>): Promise<T> {
    const t = this.ipcToken;
    if (!t) throw new Error("Sound control is not paired");
    try { return await f(t); } catch (e) {
      if (e instanceof ipc.Unpaired && this.ipcToken === t) { this.setIpcToken(undefined); this.emit({ kind: "ipcLost" }); }
      throw e;
    }
  }
  private readStates() { return this.withIpc((t) => ipc.getTVStates(this.device.address, t, this.w.ipc)); }
  async readSound() {
    if (!this.ipcToken) return;
    const [external, states] = await this.withIpc((t) => Promise.all([ipc.speakers(this.device.address, t, this.w.ipc), ipc.getTVStates(this.device.address, t, this.w.ipc)]));
    const outputs = [{ id: ipc.INTERNAL, name: "TV Speaker" }, ...external];
    this.setSound({ outputs, current: ipc.currentOf(states.speakerSelect, outputs) });
  }
  /**
   * Ask for the output, then read until the TV reports it. A firmware that
   * says only `external` reports an external output that way: taken as the
   * one asked for.
   */
  async setSoundOutput(id: string) {
    if (!this.st.sound) await this.readSound();
    const outputs = this.st.sound?.outputs ?? [];
    const out = outputs.find((o) => o.id === id);
    if (!out) throw new Error("The TV does not list that sound output");
    await this.withIpc((t) => ipc.selectOutput(this.device.address, t, out, this.w.ipc));
    const now = (said: string | undefined) => ipc.currentOf(said, outputs) ?? (id !== ipc.INTERNAL && said && said.toLowerCase() !== ipc.INTERNAL ? id : undefined);
    let said: string | undefined;
    await this.waitStates((s) => now((said = s.speakerSelect)) === id);
    this.setSound({ outputs, current: now(said) });
    if (now(said) !== id) throw new Error(`The TV did not switch the sound to ${out.name}`);
  }
  async reconnectSound() {
    if (!this.st.sound) await this.readSound();
    const back = this.st.sound?.current;
    if (!back) throw new Error("The TV has not said which output plays");
    if (back === ipc.INTERNAL) throw new Error("The sound is on the TV's speakers already; there is nothing to reconnect");
    await this.setSoundOutput(ipc.INTERNAL);
    await this.setSoundOutput(back);
  }

  picture() { return this.ipcToken ? this.st.picture : undefined; }
  async readPicture() {
    const p = await this.withIpc((t) => ipc.picture(this.device.address, t, this.w.ipc));
    this.st.picture = { ...p, mode: p.mode ?? this.st.picture?.mode };
    this.emit({ kind: "picture" });
  }
  async setPictureMode(mode: string) {
    await this.withIpc((t) => ipc.control(this.device.address, t, "pictureModeControl", { pictureMode: mode }, this.w.ipc));
    if (!(await this.waitStates((s) => ipc.modeOf(s.pictureMode) === mode))) throw new Error(`The TV did not switch to ${ipc.modeName(mode)}`);
    await this.readPicture().catch(() => {});
  }
  async setPicture(field: PictureField, value: number) {
    const f = ipc.FIELDS[field], v = Math.round(Math.min(f.max, Math.max(f.min, value)));
    await this.withIpc((t) => ipc.control(this.device.address, t, f.method, { [field]: v }, this.w.ipc));
    this.st.picture = { ...this.st.picture, values: { ...this.st.picture?.values, [field]: v } };
    this.emit({ kind: "picture" });
  }
  async setColorTone(tone: string) {
    await this.withIpc((t) => ipc.control(this.device.address, t, "colorToneControl", { colorTone: tone }, this.w.ipc));
    this.st.picture = { values: {}, ...this.st.picture, tone };
    this.emit({ kind: "picture" });
  }
  async openUrl(url: string) {
    await this.withIpc((t) => ipc.control(this.device.address, t, "directAccessControl", { applicationName: "webBrowser", url }, this.w.ipc));
  }

  on(l: (e: ChangeEvent) => void) { this.listeners.add(l); return () => this.listeners.delete(l); }
  async close() {
    this.closed = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.listeners.clear();
    this.r?.close(); this.r = undefined;
  }
}
