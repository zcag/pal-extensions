// A stand-in Samsung TV for the tests and the fixture:
// `PAL_SAMSUNGTV_FAKE=<dir>` swaps the real driver for this one. The TV's
// whole state is `<dir>/tv.json` (FakeTv below), read on every call, so a
// test changes the TV by writing the file; a write is also noticed
// (`fs.watch` on the directory) and told to the open connection as a
// change, the way the real one's poll would find it. Every command lands
// as one JSON line in `<dir>/log`. Pairing answers with `token` unless
// `deny` says the TV refuses; sound control's pairing with `ipcToken`,
// and with no `ipcToken` the TV is one with IP Remote off. With it paired
// the TV tells its input, picture and sound output as the real one does.
import { appendFileSync, readFileSync, renameSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";
import { INPUTS, PORTS } from "./device.ts";
import { FIELDS, INTERNAL, OFF, inputId, inputSource, modeOf } from "./protocol/ipc.ts";
import type { App, AppState, ChangeEvent, Conn, Driver, Found, Input, Keyboard, Media, Paired, Picture, Power, SoundOutput } from "./types.ts";

export type FakeTv = {
  found: Found[];
  /** What Allow hands out. */
  token: string;
  /** Pairing is refused with this message (Deny, the prompt timing out). */
  deny?: string;
  /** connect() fails with this message. */
  down?: string;
  power: Power;
  volume?: number;
  /** false: the TV refuses an exact level (its sound on the soundbar), only steps. */
  levelOk?: boolean;
  muted?: boolean;
  apps: App[];
  /** The app in front, by id. */
  front?: string;
  media?: Media;
  keyboard: Keyboard;
  /** App icons as base64, by the app's `icon` path. */
  icons?: Record<string, string>;
  /** What IP Control's Allow hands out, and the token it knows; unset: IP Remote is off. */
  ipcToken?: string;
  /** IP Control's pairing is refused with this message. */
  ipcDeny?: string;
  /** The external sound outputs the TV lists, and the id of the one it plays on (`internal`: its speakers). */
  speakers?: SoundOutput[];
  speaker?: string;
  /** The input on screen as IP Control names it (`HDMI1`); `direct: false` makes the TV refuse inputSourceControl, so Next HDMI steps to it. */
  input?: string;
  direct?: boolean;
  /** The picture; Dynamic refuses the values, as the TV does. */
  picture?: Picture;
};

export function fakeDriver(dir: string): Driver {
  const file = join(dir, "tv.json");
  let last: FakeTv | undefined;
  const read = (): FakeTv => { try { return (last = JSON.parse(readFileSync(file, "utf8"))); } catch (e) { if (last) return last; throw e; } };
  const write = (f: (tv: FakeTv) => void) => { const tv = read(); f(tv); writeFileSync(`${file}.tmp`, JSON.stringify(tv)); renameSync(`${file}.tmp`, file); };
  const log = (entry: Record<string, unknown>) => appendFileSync(join(dir, "log"), `${JSON.stringify(entry)}\n`);

  return {
    async scan() { log({ op: "scan" }); return read().found; },
    async probe(address) { return read().found.find((f) => f.address === address); },
    async pair(found) {
      log({ op: "pair", id: found.id });
      const tv = read();
      let cancel = () => {};
      const token = tv.deny ? Promise.reject(new Error(tv.deny)) : Promise.race([Promise.resolve(tv.token), new Promise<string>((_, rej) => { cancel = () => rej(new Error("The pairing was cancelled")); })]);
      token.catch(() => {});
      return { token, cancel: () => { log({ op: "cancel" }); cancel(); } };
    },
    async pairSound(device) {
      log({ op: "pairSound", address: device.address });
      const tv = read();
      const token = tv.ipcDeny || !tv.ipcToken ? Promise.reject(new Error(tv.ipcDeny ?? OFF)) : Promise.resolve(tv.ipcToken);
      token.catch(() => {});
      return { token, cancel: () => log({ op: "cancelSound" }) };
    },
    async wake(device) { log({ op: "wake", mac: device.mac }); write((tv) => { tv.power = "on"; }); },
    async connect(device: Paired): Promise<Conn> {
      const tv0 = read();
      log({ op: "connect", id: device.id, token: device.token });
      if (tv0.down) throw new Error(tv0.down);
      const listeners = new Set<(e: ChangeEvent) => void>();
      const emit = (e: ChangeEvent) => { for (const l of listeners) l(e); };
      const watcher = watch(dir, (_ev, name) => { if (name === "tv.json") for (const kind of ["power", "volume", "app", "media", "keyboard", "sound", "input", "picture"] as const) emit({ kind }); });
      const did = (op: string, extra: Record<string, unknown> = {}) => log({ op, ...extra });
      const on = () => read().power === "on";
      const need = () => { if (!on()) throw new Error(`${device.name} is ${read().power === "standby" ? "in standby" : "off"}`); };
      let ipcToken = device.ipcToken;
      const known = () => !!ipcToken && read().ipcToken === ipcToken;
      const ipcCheck = () => {
        if (!ipcToken) throw new Error("Sound control is not paired");
        if (!known()) { ipcToken = undefined; emit({ kind: "ipcLost" }); throw new Error("The TV no longer knows pal's sound control; pair it again"); }
      };
      const conn: Conn = {
        device,
        token: device.token,
        get ipcToken() { return ipcToken; },
        setIpcToken(t) { ipcToken = t; emit({ kind: "sound" }); },
        sound: () => (known() ? { outputs: [{ id: INTERNAL, name: "TV Speaker" }, ...(read().speakers ?? [])], current: read().speaker } : undefined),
        async readSound() { if (ipcToken) { ipcCheck(); did("readSound"); } },
        async setSoundOutput(id) { ipcCheck(); did("sound", { id }); write((tv) => { tv.speaker = id; }); },
        async reconnectSound() {
          ipcCheck();
          const back = read().speaker;
          if (!back || back === INTERNAL) throw new Error("The sound is on the TV's speakers already; there is nothing to reconnect");
          for (const id of [INTERNAL, back]) { did("sound", { id }); write((tv) => { tv.speaker = id; }); }
        },
        picture: () => (known() ? read().picture : undefined),
        async readPicture() { ipcCheck(); did("readPicture"); },
        async setPictureMode(mode) { ipcCheck(); did("pictureMode", { mode }); write((tv) => { tv.picture = { values: {}, ...tv.picture, mode }; }); },
        async setPicture(field, value) {
          ipcCheck();
          if (modeOf(read().picture?.mode) === "Dynamic") throw new Error(`The TV refused ${FIELDS[field].method}: Failed`);
          did("picture", { field, value }); write((tv) => { tv.picture = { ...tv.picture, values: { ...tv.picture?.values, [field]: value } }; });
        },
        async setColorTone(tone) { ipcCheck(); did("tone", { tone }); write((tv) => { tv.picture = { values: {}, ...tv.picture, tone }; }); },
        async openUrl(url) { ipcCheck(); did("open", { url }); },
        get remoteUp() { return on(); },
        async key(key, press = "tap") {
          need(); did("key", { key, press });
          if (key === "power") write((tv) => { tv.power = "standby"; });
        },
        async rawKey(code, press = "tap") { need(); did("key", { code, press }); },
        async pointer(dx, dy) { need(); did("pointer", { dx, dy }); },
        async click() { need(); did("click"); },
        power: () => read().power,
        async turnOn() { did("power", { to: "on" }); write((tv) => { tv.power = "on"; }); },
        async turnOff() { did("power", { to: "off" }); write((tv) => { tv.power = "standby"; }); },
        volume: () => (on() ? read().volume : undefined),
        levelSettable: () => (on() ? read().levelOk ?? true : undefined),
        async setVolume(level) { if (read().levelOk === false && !known()) throw new Error("The TV takes only volume up and down while its sound is on another speaker"); did("volume", { level }); write((tv) => { tv.volume = level; }); },
        muted: () => (on() ? read().muted : undefined),
        async setMuted(muted) { did("mute", { muted }); write((tv) => { tv.muted = muted; }); },
        inputs: () => (ipcToken ? PORTS : INPUTS),
        input: () => (known() && on() ? (inputId(read().input) as Input["id"] | undefined) : undefined),
        async setInput(id) {
          need();
          const path = !known() || id === "hdmi" || id === "source" ? "key" : read().direct === false ? "stepped" : "direct";
          did("input", { id, path });
          if (path !== "key") write((tv) => { tv.input = inputSource(id); });
          return path;
        },
        async apps() { return read().apps; },
        foreground(): AppState | undefined {
          const tv = read(), a = tv.apps.find((x) => x.id === tv.front);
          return on() && a ? { id: a.id, name: a.name, running: true, visible: true } : undefined;
        },
        async launch(id) { need(); did("launch", { id }); write((tv) => { tv.front = id; }); },
        async quit(id) { did("quit", { id }); write((tv) => { if (tv.front === id) tv.front = undefined; }); },
        async icon(app) { const b = app.icon && read().icons?.[app.icon]; return b ? new Uint8Array(Buffer.from(b, "base64")) : null; },
        media: () => (on() ? read().media : undefined),
        keyboard: () => read().keyboard,
        async type(text, done = false) { need(); did("type", { text, done }); write((tv) => { tv.keyboard = done ? { open: false } : { open: true, text: (tv.keyboard.text ?? "") + text }; }); },
        on(l) { listeners.add(l); return () => listeners.delete(l); },
        async close() { watcher.close(); listeners.clear(); did("close"); },
      };
      return conn;
    },
  };
}
