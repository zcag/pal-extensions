// atc's HTTP API (github.com/zcag/atc): every Claude Code session on the
// machines one atc server lists, what each is doing, and the calls that
// act on them. The server and its token come from the settings, else from
// what `atc login` saved on this machine (`client.json` in atc's config folder), so
// a machine that already uses the atc CLI needs no setup; a server that
// trusts the caller's tailnet takes no token at all. Every call is typed
// here: a session is addressed by its background id (`id`, eight hex
// characters, what stop, send and attach take) or its conversation id
// (`sessionId`, what the transcript, outputs, rename and resume take).
import { readFileSync } from "node:fs";
import { getCACertificates, rootCertificates } from "node:tls";
import { home, settings } from "@zcag/pal";

export type Opener = "auto" | "terminal" | "browser";
export type Conf = { url?: string; token?: string; open?: Opener; terminal?: "auto" | "kitty" | "Terminal" | "iTerm2" | "Ghostty" | "Alacritty" };
export const conf = (): Conf => settings.get<Conf>("atc");

export const log = (msg: string) => console.error(`[atc] ${msg}`);

const HTTP_MS = 15_000;

/** atc's own config folder, found the way the atc command finds it. */
const configDir = () => process.env.ATC_CONFIG_DIR || (process.env.XDG_CONFIG_HOME ? `${process.env.XDG_CONFIG_HOME}/atc` : home("~/.config/atc"));

/** What `atc login` wrote; read on every call, so a login made after pal started is picked up. */
function saved(): { url?: string; token?: string } {
  try { return JSON.parse(readFileSync(`${configDir()}/client.json`, "utf8")); } catch { return {}; }
}

/** The server and token in use: the settings', else the atc CLI's own login. Empty `url` means there is nothing to ask. */
export function server(): { url: string; token: string } {
  const c = conf(), s = saved();
  const url = (c.url?.trim() || s.url?.trim() || "").replace(/\/+$/, "");
  return { url, token: c.token?.trim() || (url === s.url?.replace(/\/+$/, "") ? s.token?.trim() : "") || "" };
}

/** No server in the settings and no `atc login` on this machine. */
export class NotSetUp extends Error { constructor() { super("No atc server: set one under Settings › Extensions › atc, or run atc login"); } }
/** The server could not be reached (refused, timed out, no such host). */
export class Unreachable extends Error { constructor(readonly url: string, detail: string) { super(`atc is unreachable at ${url}: ${detail}`); } }
/** The server refused: `status` and its message; `auth` for a 401 (the token). */
export class ApiError extends Error { constructor(readonly status: number, message: string, readonly auth = false) { super(message); } }

// ---- wire shapes -----------------------------------------------------------------

export type State = "needs-you" | "your-turn" | "working" | "stopped" | "past";

/** `GET /api/sessions` and `/api/history` rows. A live background session has `id`; a terminal one (`kind: interactive`) and a past one do not. */
export type Session = {
  sessionId: string;
  host?: string;
  id?: string;
  kind: "background" | "interactive" | "transcript" | string;
  state: State;
  attachable: boolean;
  pid?: number;
  title: string;
  name?: string;
  cwd: string;
  startCwd?: string;
  branch?: string;
  model?: string;
  permissionMode?: string;
  lastPrompt?: string;
  /** Tokens in the context window. */
  context?: number;
  promptAt?: string;
  /** What it is doing or asking to do: "Bash  Run the tests". */
  activity?: string;
  lastReply?: string;
  startedAt?: string;
  updated?: string;
  servers?: number[];
  /** The published pages it linked (atc's `ATC_FEATURED`), newest last. */
  pages?: Link[];
  pinned?: boolean;
  parked?: boolean;
  /** The app it is a run of (a scheduled or preset agent), not a conversation. */
  app?: string;
  /** Its final reply summed up, once atc's model has read it; only ever for the reply it holds now. */
  summary?: Summary;
  /** A summary of the current reply is on its way. */
  summarizing?: boolean;
};

/**
 * A turn's final message at three lengths: `status` one line (often led by
 * a label, "Done:", "Found:"), `gist` a line per topic, `overview` labelled
 * lines for a long one. A short reply comes back as itself (`model`
 * `verbatim`).
 */
export type Summary = { reply: string; status: string; gist?: string[]; overview?: string[]; model: string; at: string };

/** A link a session gave; a published page also has its `title` and a preview `image` (a server path). */
export type Link = { url: string; at: string; title?: string; image?: string; kind?: string };

/** One entry of `GET /api/sessions/{sid}/transcript`: a prompt, a reply, or a tool call with its one-line `detail`. */
export type Message = { role: "user" | "assistant" | "tool" | string; text?: string; tool?: string; detail?: string; time?: string };
/** A page of the transcript: the newest messages up to `before` (a byte offset; `start` is the next page's `before`, 0 at the top). */
export type Page = { messages: Message[]; start: number; size: number };

export type Outputs = {
  servers: { url: string; port: number; localOnly?: boolean; running: boolean; seen?: string }[] | null;
  /** Published pages (atc's `ATC_FEATURED`), apart from `links`. */
  featured?: Link[] | null;
  links: Link[] | null;
  /** A file the session wrote, edited or read; `url` a signed link that serves it for a while. */
  files: { path: string; kind: string; op: string; at: string; size: number; url: string }[] | null;
};

export type Dir = { path: string; recent?: boolean; git?: boolean };
/** A named session to start: a folder on a machine, and standing instructions (`brief`, a file) it is given. */
export type Preset = { name: string; dir: string; brief?: string; host?: string };
/** The plan's limits: a window per kind (the session's five hours, the week), how much is used and when it resets. */
export type Limits = { plan?: string; windows: { key: string; label: string; percent: number; resetsAt?: string; severity?: string }[]; error?: string };
/** What a session spent: tokens, the cost at API prices, its subagents', how long Claude worked. */
export type Usage = { total: number; cost: number; turns: number; toolCalls: number; activeSeconds: number; subagents?: { count: number; total: number; cost: number } };
export type Me = { host: string; home: string; hosts: string[]; peers?: { name: string; error?: string }[] };

// ---- requests --------------------------------------------------------------------

type Params = Record<string, string | number | boolean | undefined>;

export function url(path: string, params?: Params): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return `${server().url}${path}${s ? `?${s}` : ""}`;
}

/**
 * The certificates a server may present: Bun's own roots and the ones this
 * machine trusts, so an atc behind a reverse proxy with a private CA (Caddy's
 * `tls internal`, trusted in the keychain) answers as it does in a browser.
 */
let trusted: string[] | undefined;
export const tls = () => ({ ca: (trusted ??= [...rootCertificates, ...(() => { try { return getCACertificates("system"); } catch { return []; } })()]) });

export const headers = (): Record<string, string> => { const t = server().token; return t ? { authorization: `Bearer ${t}` } : {}; };

/** One call: the token on it, the answer as JSON, the failures typed. */
export async function request<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, params?: Params, body?: unknown | FormData): Promise<T> {
  const base = server().url;
  if (!base) throw new NotSetUp();
  const form = body instanceof FormData;
  let r: Response;
  try {
    r = await fetch(url(path, params), {
      method,
      headers: { ...headers(), accept: "application/json", ...(body !== undefined && !form && { "content-type": "application/json" }) },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_MS),
      tls: tls(),
    });
  } catch (e) {
    const detail = e instanceof Error ? (e.name === "TimeoutError" ? `did not answer within ${HTTP_MS / 1000} s` : e.message.replace(/^fetch failed:?\s*/i, "") || e.name) : String(e);
    throw new Unreachable(base, detail);
  }
  const text = await r.text();
  if (!r.ok) throw new ApiError(r.status, text.trim() || `${r.status} ${r.statusText}`, r.status === 401);
  try { return (text ? JSON.parse(text) : null) as T; } catch { return null as T; }
}

const enc = encodeURIComponent;

export const me = () => request<Me>("GET", "/api/me");
export const live = () => request<Session[]>("GET", "/api/sessions");
export const history = (q = "", limit = 100) => request<Session[]>("GET", "/api/history", { q, limit });
export const transcript = (sid: string, before?: number) => request<Page>("GET", `/api/sessions/${enc(sid)}/transcript`, { before });
export const outputs = (sid: string) => request<Outputs>("GET", `/api/sessions/${enc(sid)}/outputs`);
export const dirs = (host?: string) => request<Dir[]>("GET", "/api/dirs", { host });
/** A new background session in `dir` on `host` (the server's own when absent); its background id. */
export const start = async (o: { dir?: string; prompt?: string; name?: string; worktree?: boolean; host?: string; preset?: string }) =>
  (await request<{ id: string }>("POST", "/api/sessions", { host: o.host }, { dir: o.dir ?? "", prompt: o.prompt ?? "", name: o.name ?? "", worktree: !!o.worktree, ...(o.preset && { preset: o.preset }) })).id;
export const presets = () => request<Preset[] | null>("GET", "/api/presets");
/** Summarize the session's final reply again; the new one arrives on the list. */
export const summarize = (sid: string) => request<unknown>("POST", `/api/sessions/${enc(sid)}/summary`);
export const usage = (sid: string) => request<Usage>("GET", `/api/sessions/${enc(sid)}/usage`);
export const limits = () => request<Limits>("GET", "/api/usage/limits");
export const resume = async (sid: string) => (await request<{ id: string }>("POST", `/api/sessions/${enc(sid)}/resume`)).id;
/** The text pasted into the session's prompt and submitted, as if typed there. */
export const send = (id: string, text: string) => request<unknown>("POST", `/api/sessions/${enc(id)}/send`, undefined, { text });
export const stop = (id: string) => request<unknown>("POST", `/api/sessions/${enc(id)}/stop`);
export const remove = (id: string) => request<unknown>("DELETE", `/api/sessions/${enc(id)}`);
export const patch = (sid: string, p: { name?: string; pinned?: boolean; parked?: boolean }) => request<unknown>("PATCH", `/api/sessions/${enc(sid)}`, undefined, p);

/** A file onto the session's machine (atc keeps it under its cache); the path it was saved at, for a prompt to name. */
export async function upload(sid: string, file: string): Promise<string> {
  const f = Bun.file(file);
  if (!(await f.exists())) throw new Error(`No such file: ${file}`);
  const form = new FormData();
  form.set("file", f, file.slice(file.lastIndexOf("/") + 1));
  return (await request<{ path: string }>("POST", `/api/sessions/${enc(sid)}/upload`, undefined, form)).path;
}

/** A page's preview (`Link.image`, served by atc with the token) as a `data:` url a row can show; undefined when there is none. */
export async function image(path: string): Promise<string | undefined> {
  try {
    const r = await fetch(absolute(path), { headers: headers(), signal: AbortSignal.timeout(HTTP_MS), tls: tls() });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !type.startsWith("image/")) return undefined;
    return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch { return undefined; }
}

/** The session's page in atc's web app. */
export const webUrl = (sid: string) => `${server().url}/#/s/${sid}`;
/** A file link from `outputs` is relative to the server. */
export const absolute = (u: string) => (/^https?:/.test(u) ? u : `${server().url}${u.startsWith("/") ? "" : "/"}${u}`);
