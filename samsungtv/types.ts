// The one contract between the extension (palettes, views, the bar item)
// and whatever talks to a Samsung TV: the real driver (device.ts: the
// remote websocket, the REST api on 8001, UPnP on 9197,
// IP Control on 1516 for the sound output, the input, the exact volume and
// the picture, Wake-on-LAN) and
// the fake one the tests and the fixture use (fake.ts). Only current
// Tizen TVs (2016 on, token auth); nothing here knows an older protocol.

/** A Samsung TV seen on the network (SSDP, then its `/api/v2/` answer). */
export type Found = {
  /** Stable across address changes: the TV's `duid` (`uuid:…`). */
  id: string;
  /** As the TV names itself, entities decoded: `75" Neo QLED`. */
  name: string;
  address: string;
  /** `QE75QN85DBTXTK`. */
  model: string;
  /** Wi-Fi or wired MAC, `F4:DD:06:41:3A:4C`: what Wake-on-LAN needs. */
  mac?: string;
  power: Power;
  /** The TV says it takes tokens (`TokenAuthSupport`); every TV this extension supports does. */
  tokenAuth: boolean;
  /** `FrameTVSupport`. */
  frame?: boolean;
};

/** A paired TV as storage keeps it: the token is what the TV gave when Allow was pressed; `ipcToken` what its IP Control gave (sound control), when that was allowed too. */
export type Paired = { id: string; name: string; address: string; model: string; mac?: string; token: string; ipcToken?: string; pairedAt: number };

/** Where the TV's sound goes: its own speakers (`internal`) or an external output it lists (`QSYM-RECEIVER` Q-Symphony, `RCV-1` a soundbar on HDMI eARC). */
export type SoundOutput = { id: string; name: string };
/** The outputs as the TV lists them, the TV's speakers first; `current` the one it plays on, when it says. */
export type Sound = { outputs: SoundOutput[]; current?: string };

/**
 * `on`: the screen is on. `standby`: the TV answers on the network with
 * the screen off (network standby; `KEY_POWER` or Wake-on-LAN brings it
 * back). `off`: nothing answers. `unknown`: not asked yet.
 */
export type Power = "on" | "standby" | "off" | "unknown";

/** Remote buttons, as the UI names them; `KEYS` maps each to the TV's `KEY_*` code. */
export type Key =
  | "up" | "down" | "left" | "right" | "select" | "back" | "home" | "menu" | "exit"
  | "play" | "pause" | "play_pause" | "stop" | "rewind" | "forward" | "previous" | "next"
  | "volume_up" | "volume_down" | "mute" | "power"
  | "channel_up" | "channel_down" | "channel_list" | "guide" | "info" | "tools"
  | "source" | "hdmi" | "tv" | "hdmi1" | "hdmi2" | "hdmi3" | "hdmi4"
  | "red" | "green" | "yellow" | "blue"
  | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

/** The picture values a slider sets, each in the TV's own range (ipc.ts `FIELDS`). */
export type PictureField = "backlight" | "contrast" | "brightness" | "sharpness" | "color" | "tint";
/** The picture as IP Control reads it: the mode as the TV reports it (`FilmmakerMode`, `StandardHDR`), the values, the colour tone (`Warm2`). */
export type Picture = { mode?: string; values: Partial<Record<PictureField, number>>; tone?: string };

/** `Click` a key, or hold it: `Press` then `Release` after `holdMs`. */
export type Press = "tap" | "hold";

/** An input: a key (device.ts `INPUTS`) without IP Control, a port with it (`hdmi1`, `tv`). `sure`: seen working on a current TV; the numbered HDMI keys did nothing on a 2024 one. */
export type Input = { id: "tv" | "hdmi" | "hdmi1" | "hdmi2" | "hdmi3" | "hdmi4" | "source"; name: string; sure: boolean };

/** An installed app. `type` is the TV's `app_type` (2 web app, 4 native), which picks how it is launched. */
export type App = { id: string; name: string; type?: number; icon?: string };

/** One app's state as the REST api tells it: installed (a 404 is not), running, in front. */
export type AppState = { id: string; name: string; running: boolean; visible: boolean };

/** What the TV renders for a DLNA sender (UPnP AVTransport); nothing about what an app plays. */
export type Media = { state: "playing" | "paused" | "stopped" | "transitioning" | "idle"; title?: string; url?: string; position?: number; duration?: number; at: number };

/** The on-screen keyboard: open while a text field has focus (`ms.remote.imeStart` … `imeEnd`). */
export type Keyboard = { open: boolean; text?: string };

/** What changed; the extension re-reads `Conn` getters and redraws. `token`: the TV issued a new one, store it. */
export type ChangeEvent =
  | { kind: "power" }
  | { kind: "volume" }
  | { kind: "app" }
  | { kind: "media" }
  | { kind: "keyboard" }
  | { kind: "token"; token: string }
  | { kind: "sound" }
  | { kind: "input" }
  | { kind: "picture" }
  /** The TV no longer knows the IP Control token: drop it, offer pairing again. */
  | { kind: "ipcLost" }
  | { kind: "connection"; up: boolean; error?: string };

/** One live session with one paired TV: the remote websocket when the screen is on, REST and UPnP polled. */
export interface Conn {
  readonly device: Paired;
  /** The token in use: the TV may hand out a new one on any connect (`token` events say so later); store it when it differs from `device.token`. */
  readonly token: string;
  /** The remote websocket is open (keys, text, apps, launch); REST and UPnP work without it. */
  readonly remoteUp: boolean;

  key(key: Key, press?: Press): Promise<void>;
  /** A raw `KEY_*` code, for what `Key` does not name. */
  rawKey(code: string, press?: Press): Promise<void>;
  /** Move the pointer by a delta and click (the touchpad remotes' cursor); only some apps show it. */
  pointer(dx: number, dy: number): Promise<void>;
  click(): Promise<void>;

  power(): Power;
  turnOn(): Promise<void>;
  turnOff(): Promise<void>;

  /** 0..100 as the TV counts it, undefined until read. */
  volume(): number | undefined;
  /** Whether the TV takes an exact level (`setVolume`); false while its sound is on another speaker and only the keys step it, undefined before it was asked. */
  levelSettable(): boolean | undefined;
  setVolume(level: number): Promise<void>;
  muted(): boolean | undefined;
  setMuted(muted: boolean): Promise<void>;

  /** With IP Control the ports (HDMI 1 to 4, TV), else the keys that step through them. */
  inputs(): Input[];
  /** The input on screen, from IP Control; undefined without it. */
  input(): Input["id"] | undefined;
  /**
   * Switch the input: straight to a port through IP Control, else (or when
   * the TV refuses that) Next HDMI pressed until it reports the port; a key
   * input (`hdmi`, `source`) is pressed. Answers how it got there.
   */
  setInput(id: Input["id"]): Promise<"direct" | "stepped" | "key">;

  /** The installed apps (`ed.installedApp.get`), else the known catalog checked one by one over REST. */
  apps(): Promise<App[]>;
  /** The app in front, when one is (REST `visible`), from the apps last listed. */
  foreground(): AppState | undefined;
  /** Open an app (REST: the websocket's launch opened nothing on a 2024 TV, and no deep link did). */
  launch(id: string): Promise<void>;
  quit(id: string): Promise<void>;
  /** An app's icon, PNG/JPEG bytes from the TV, or null. */
  icon(app: App): Promise<Uint8Array | null>;

  media(): Media | undefined;

  keyboard(): Keyboard;
  /** Send text to the focused field (the TV appends it), then end the input when `done`. */
  type(text: string, done?: boolean): Promise<void>;

  /** The IP Control token in use; undefined: sound control is not paired. */
  readonly ipcToken: string | undefined;
  /** A token just paired (or undefined to forget it): used from now on, the outputs read again. */
  setIpcToken(token: string | undefined): void;
  /** The sound outputs as last read; undefined without an IP Control token or before a read. */
  sound(): Sound | undefined;
  /** Read the outputs and the current one from the TV (`sound` when they changed, `ipcLost` when the token went). */
  readSound(): Promise<void>;
  /** Switch the sound to an output, then wait for the TV to report it. */
  setSoundOutput(id: string): Promise<void>;
  /** Move the sound to the TV's speakers and back to the output it was on, each step waited on: what wakes a soundbar that went quiet. */
  reconnectSound(): Promise<void>;

  /** The picture as last read; the mode alone until `readPicture`, undefined without IP Control. */
  picture(): Picture | undefined;
  readPicture(): Promise<void>;
  setPictureMode(mode: string): Promise<void>;
  /** A value in the TV's range; refused in a mode that does not take it (Dynamic). */
  setPicture(field: PictureField, value: number): Promise<void>;
  setColorTone(tone: string): Promise<void>;
  /** Open a web page in the TV's browser. */
  openUrl(url: string): Promise<void>;

  on(listener: (e: ChangeEvent) => void): () => void;
  close(): Promise<void>;
}

/** A pairing in progress: the TV shows "Allow pal?" until someone presses Allow (or Deny, or it times out). */
export interface Pairing {
  /** The token once Allow is pressed; refused with the TV's reason. */
  readonly token: Promise<string>;
  cancel(): void;
}

/** The whole outside world, swapped for a fake in tests. */
export interface Driver {
  scan(timeoutMs: number): Promise<Found[]>;
  /** One TV by address: its `/api/v2/` answer, or undefined when nothing answers there. */
  probe(address: string): Promise<Found | undefined>;
  pair(found: Found): Promise<Pairing>;
  /** IP Control's own Allow prompt, for the sound output; its token. Refused when IP Remote is off on the TV. */
  pairSound(device: Pick<Paired, "address" | "name">): Promise<Pairing>;
  connect(device: Paired): Promise<Conn>;
  /** Wake-on-LAN, with no connection: what turns a TV on from off. */
  wake(device: Pick<Paired, "address" | "mac">): Promise<void>;
}
