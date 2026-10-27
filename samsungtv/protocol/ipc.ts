// Samsung's IP Control on :1516: JSON-RPC 2.0 over HTTPS POST to `/` (a
// self-signed certificate), `Accept: application/json` or the TV answers an
// empty body. `createAccessToken`, with no params, puts the TV's own Allow
// prompt up and answers `{ AccessToken }`; every other call carries it in
// `params.AccessToken`. A token the TV does not know, or none, answers a
// flat `{"code":-32700,"message":"Parse error"}` with no `error` around it.
// The TV resets a connection that overlaps another, so calls to one TV go
// one at a time. Needs Settings › Connections › Network › Expert Settings ›
// IP Remote on. Checked on a 2024 QE75QN85D, 2026-10-27; the method list is
// TheFab21/ha-samsungtv-smart's IP_Control_Protocol_Reference.md. A getter
// is the method with only the token; a setter the same method with its value.
import type { Picture, PictureField, SoundOutput } from "../types.ts";

export const PORT = 1516;
/** The Allow prompt stays up about 30 s. */
export const PAIR_MS = 35_000;
const CALL_MS = 3000;

/** The TV does not know the token (or there is none): pair again. */
export class Unpaired extends Error {
  constructor() { super("The TV no longer knows pal's sound control; pair it again"); }
}

/** What a TV with IP Remote off does: nothing answers on 1516. */
export const OFF = "IP Remote is off on the TV (Settings › Connections › Network › Expert Settings)";

export type Wire = { port?: number; secure?: boolean; timeoutMs?: number; signal?: AbortSignal };

const queues = new Map<string, Promise<unknown>>();
function serial<T>(key: string, f: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).then(f, f);
  const tail = next.catch(() => {});
  queues.set(key, tail);
  void tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return next;
}

/** An answer's `result`; the flat -32700 as `Unpaired`, any other error in the TV's words. */
export function result(j: any, method: string): unknown {
  const err = j?.error ?? (j && typeof j === "object" && "code" in j ? j : undefined);
  if (err?.code === -32700) throw new Unpaired();
  if (err) throw new Error(`The TV refused ${method}: ${err.message ?? err.code}`);
  if (!j || typeof j !== "object" || !("result" in j)) throw new Error(`The TV gave no answer to ${method}`);
  return j.result;
}

export async function call(address: string, method: string, params: Record<string, unknown> | undefined, w: Wire = {}): Promise<unknown> {
  const secure = w.secure ?? true, port = w.port ?? PORT;
  const host = address.includes(":") && !address.startsWith("[") ? `[${address}]` : address;
  return serial(`${address}:${port}`, async () => {
    const signal = AbortSignal.any([AbortSignal.timeout(w.timeoutMs ?? CALL_MS), ...(w.signal ? [w.signal] : [])]);
    const r = await fetch(`${secure ? "https" : "http"}://${host}:${port}/`, {
      method: "POST", signal, headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params && { params }) }),
      // Bun's fetch takes `tls`: the TV's certificate is its own.
      tls: { rejectUnauthorized: false },
    } as RequestInit);
    return result(await r.json().catch(() => undefined), method);
  });
}

const auth = (token: string, more: Record<string, unknown> = {}) => ({ AccessToken: token, ...more });

/** Put the TV's Allow prompt up; its token once Allow is pressed. */
export async function createAccessToken(address: string, w: Wire = {}): Promise<string> {
  const r = (await call(address, "createAccessToken", undefined, { timeoutMs: PAIR_MS, ...w })) as { AccessToken?: unknown } | null;
  if (typeof r?.AccessToken !== "string" || !r.AccessToken) throw new Error("The TV gave no token for sound control");
  return r.AccessToken;
}

/** `speakerSelect, volume, mute, pictureSize, pictureMode, soundMode, inputSource` on a 2024 QE75QN85D. */
export type TvStates = { speakerSelect?: string; volume?: number; mute?: string; inputSource?: string; pictureMode?: string; [k: string]: unknown };
export const getTVStates = async (address: string, token: string, w?: Wire) => ((await call(address, "getTVStates", auth(token), w)) ?? {}) as TvStates;

/** The TV's own speakers; the rest are what `externalSpeakerControl` lists, by their `deviceId`. */
export const INTERNAL = "internal";

/** `[{ deviceName, deviceId }]`, or `{}` while the receiver is off. */
export function parseSpeakers(r: unknown): SoundOutput[] {
  return (Array.isArray(r) ? r : []).filter((s) => s && s.deviceId).map((s) => ({ id: String(s.deviceId), name: String(s.deviceName ?? s.deviceId) }));
}
export const speakers = async (address: string, token: string, w?: Wire) => parseSpeakers(await call(address, "externalSpeakerControl", auth(token), w));

/**
 * Which output `getTVStates.speakerSelect` names: an external one's id
 * (`QSYM-RECEIVER`), `internal`; some firmware says only `external`, which
 * is the one external output when there is one. Undefined when it is not clear.
 */
export function currentOf(speakerSelect: string | undefined, outputs: SoundOutput[]): string | undefined {
  const s = (speakerSelect ?? "").toLowerCase();
  if (!s) return undefined;
  if (s === INTERNAL) return INTERNAL;
  const hit = outputs.find((o) => o.id.toLowerCase() === s);
  if (hit) return hit.id;
  const ext = outputs.filter((o) => o.id !== INTERNAL);
  return s === "external" && ext.length === 1 ? ext[0].id : undefined;
}

/** The TV's speakers through `speakerSelectControl`, an external one through `externalSpeakerControl` with its name and id. */
export const selectOutput = (address: string, token: string, out: SoundOutput, w?: Wire) =>
  out.id === INTERNAL
    ? call(address, "speakerSelectControl", auth(token, { speakerSelect: "Internal" }), w)
    : call(address, "externalSpeakerControl", auth(token, { deviceName: out.name, deviceId: out.id }), w);

/** One method with the token and `params`: a getter without them, a setter with its value. */
export const control = (address: string, token: string, method: string, params: Record<string, unknown> = {}, w?: Wire) => call(address, method, auth(token, params), w);

/** The input as the TV names it (`HDMI1`, `TV`) to the id the remote uses (`hdmi1`, `tv`). */
export const inputId = (source: string | undefined) => (source ? source.toLowerCase().replace(/[^a-z0-9]/g, "") : undefined);
/** The other way: `hdmi2` to `HDMI2`. */
export const inputSource = (id: string) => id.toUpperCase();

/** `powerOn` while the screen is on; the TV does not answer in standby. */
export const screenOn = async (address: string, token: string, w?: Wire) => ((await control(address, token, "powerControl", {}, w)) as { power?: string } | null)?.power !== "powerOff";

/** The picture modes the TV takes by these ids (OCF names, the same in every menu language), in the order the chips draw them. */
export const MODES = [["Standard", "Standard"], ["Movie", "Movie"], ["FilmmakerMode", "Filmmaker"], ["Dynamic", "Dynamic"], ["Eco", "Eco"]] as const;
/** A mode the TV reports, HDR or PC variants included (`StandardHDR`), to the one the chips name. */
export const modeOf = (reported: string | undefined) => MODES.find(([id]) => reported?.startsWith(id))?.[0] ?? reported;
export const modeName = (mode: string | undefined) => MODES.find(([id]) => id === modeOf(mode))?.[1] ?? mode;

/** Each picture value: its method, and the range the TV takes (Frame 2024/2025, the reference). */
export const FIELDS: Record<PictureField, { method: string; min: number; max: number }> = {
  backlight: { method: "backlightControl", min: 0, max: 50 },
  contrast: { method: "contrastControl", min: 0, max: 50 },
  brightness: { method: "brightnessControl", min: -5, max: 5 },
  sharpness: { method: "sharpnessControl", min: 0, max: 20 },
  color: { method: "colorControl", min: 0, max: 50 },
  tint: { method: "tintControl", min: -15, max: 15 },
};
export const TONES = ["Cool", "Standard", "Warm1", "Warm2"] as const;

const num = (x: unknown) => (x === undefined || x === null || x === "" || Number.isNaN(Number(x)) ? undefined : Number(x));

/** The mode, every value and the colour tone: `getVideoStates` gives five values, the backlight and the tone are asked on their own. */
export async function picture(address: string, token: string, w?: Wire): Promise<Picture> {
  const ask = (method: string) => control(address, token, method, {}, w).catch((e) => { if (e instanceof Unpaired) throw e; return undefined; }) as Promise<Record<string, unknown> | undefined>;
  const [mode, video, backlight, tone] = await Promise.all(["pictureModeControl", "getVideoStates", "backlightControl", "colorToneControl"].map(ask));
  const values: Picture["values"] = {};
  for (const f of Object.keys(FIELDS) as PictureField[]) {
    const v = num(f === "backlight" ? backlight?.backlight : video?.[f]);
    if (v !== undefined) values[f] = v;
  }
  return { mode: mode?.pictureMode as string | undefined, values, tone: tone?.colorTone as string | undefined };
}
