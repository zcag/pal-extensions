// Wisp's integration API (`/api/v1`, its docs/API.md): the counts, the
// accounts, the conversations of a view, a conversation's messages, search,
// and the actions. A token of scope `client` ("App of yours" in Wisp's
// Accounts > Agent tokens) acts as the user, so a send or a mark read goes
// through wherever the account lets the user send; a `send` token acts as
// an agent and only reaches accounts that let agents act, a `read` token
// changes nothing. Pictures and attachments are fetched with the token
// into data urls, since a view draws `data:` pictures only.
import { getCACertificates, rootCertificates } from "node:tls";
import { settings } from "@zcag/pal";

export const EXT = "wisp";
export type Split = "network" | "account" | "total";
export type Conf = { url?: string; token?: string; read_on_open?: boolean };
export const conf = (): Conf => settings.get<Conf>(EXT);
export const log = (msg: string) => console.error(`[wisp] ${msg}`);

const HTTP_MS = 15_000;

export const base = () => (conf().url ?? "").trim().replace(/\/+$/, "");

/** No server or no token in the settings. */
export class NotSetUp extends Error { constructor(readonly missing: "url" | "token") { super(missing === "url" ? "No Wisp server: set its address under Settings › Extensions › Wisp" : "No token: make one in Wisp (Accounts › Agent tokens, App of yours) and paste it under Settings › Extensions › Wisp"); } }
/** The server could not be reached. */
export class Unreachable extends Error { constructor(readonly url: string, detail: string) { super(`Wisp is unreachable at ${url}: ${detail}`); } }
/** The server refused: `status` and its message. */
export class ApiError extends Error { constructor(readonly status: number, message: string) { super(message); } }

// ---- wire shapes (docs/API.md; fields may be added, so everything unknown is ignored) ----

export type Channel = "whatsapp" | "gmail" | "imap" | "slack" | "telegram" | "sms" | "instagram" | "linkedin" | "x" | "phone" | "demo" | string;
export type AccountCounts = { id: number; label: string; channel: Channel; counted: boolean; unread: number; inbox: number; todo: number; now: number };
export type Counts = { unread: number; inbox: number; todo: number; now: number; screener: number; forMe?: number; accounts: AccountCounts[] };
export type AccountState = "connected" | "syncing" | "starting" | "setup" | "degraded" | "disconnected" | "error" | "stopped" | string;
export type Account = { id: number; channel: Channel; label: string; identity: string; enabled: boolean; state: AccountState; detail?: string; sendPolicy: "user" | "agents" | "none" | string; countUnread: boolean; unread: number };
export type Triage = { state: "inbox" | "todo" | "waiting" | "done" | string; until?: string };
export type Conversation = {
  id: number; accountId: number; channel: Channel; kind: "direct" | "group" | "channel" | "thread" | "broadcast" | string; title: string;
  avatar?: string; lastMessageAt?: string; lastPreview: string; lastFromMe: boolean; unread: number; forMe?: number; counted: boolean;
  triage: Triage; split?: "people" | "work" | "groups" | "feed" | "paper" | string; waitsOnYou: boolean; screener: boolean;
};
export type Sender = { id: string; name: string; avatar?: string };
export type Attachment = { id: number; kind: "image" | "video" | "audio" | "voice" | "document" | "sticker" | string; mime: string; filename?: string; size?: number; url?: string };
export type Reaction = { emoji: string; sender: Sender; fromMe: boolean };
export type Message = {
  id: number; conversationId: number; sender: Sender; fromMe: boolean; sentAt: string; kind: string; subject?: string; text: string;
  transcript?: string; status?: string; edited: boolean; deleted: boolean; attachments: Attachment[]; reactions: Reaction[];
};
export type Page<T> = { next?: string } & T;
export type Person = { id: number; name: string; avatar?: string; channels: Channel[]; lastMessageAt?: string; lastPreview?: string; lastFromMe: boolean; unread: number };
export type Reach = { accountId: number; channel: Channel; account: string; address: string; conversationId?: number; canSend: boolean };
/** A summary or a suggested reply: `state` is `ready`, or `queued` / `running` while Wisp's model works on it, `failed`. */
export type AIResult = { text?: string; at?: string; stale: boolean; state: string; error?: string };
export type AI = { available: boolean; summary?: AIResult; draft?: AIResult };
export type Hit = { conversationId: number; conversationTitle: string; channel: Channel; message: Message };
export type View = "inbox" | "now" | "todo" | "screener" | "all";

// ---- requests ------------------------------------------------------------------------

/** Bun's roots and the ones this machine trusts, so a server behind a private CA (Caddy's `tls internal`) answers as in a browser. */
let trusted: string[] | undefined;
export const tls = () => ({ ca: (trusted ??= [...rootCertificates, ...(() => { try { return getCACertificates("system"); } catch { return []; } })()]) });

function server(): { url: string; token: string } {
  const url = base(), token = (conf().token ?? "").trim();
  if (!url) throw new NotSetUp("url");
  if (!token) throw new NotSetUp("token");
  return { url, token };
}

export const headers = (): Record<string, string> => ({ authorization: `Bearer ${server().token}` });

type Params = Record<string, string | number | boolean | undefined>;

async function call(method: "GET" | "POST" | "DELETE", path: string, params?: Params, body?: unknown, accept = "application/json"): Promise<Response> {
  const { url, token } = server();
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== "") q.set(k, String(v));
  const qs = q.toString();
  try {
    return await fetch(`${url}${path}${qs ? (path.includes("?") ? "&" : "?") + qs : ""}`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept, ...(body !== undefined && { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_MS),
      tls: tls(),
    });
  } catch (e) {
    const detail = e instanceof Error ? (e.name === "TimeoutError" ? `did not answer within ${HTTP_MS / 1000} s` : e.message.replace(/^fetch failed:?\s*/i, "") || e.name) : String(e);
    throw new Unreachable(url, detail);
  }
}

async function request<T>(method: "GET" | "POST" | "DELETE", path: string, params?: Params, body?: unknown): Promise<T> {
  const r = await call(method, path, params, body);
  const text = await r.text();
  if (!r.ok) {
    let msg = text.trim();
    try { msg = (JSON.parse(text) as { error?: string }).error ?? msg; } catch { /* not JSON */ }
    throw new ApiError(r.status, msg || `${r.status} ${r.statusText}`);
  }
  try { return (text ? JSON.parse(text) : null) as T; } catch { return null as T; }
}

export const counts = () => request<Counts>("GET", "/api/v1/counts");
export const accounts = async () => (await request<{ accounts: Account[] }>("GET", "/api/v1/accounts")).accounts;
export const conversations = (view: View, o: { account?: number; limit?: number; cursor?: string; unread?: boolean } = {}) =>
  request<Page<{ conversations: Conversation[] }>>("GET", "/api/v1/conversations", { view, account: o.account, limit: o.limit ?? 200, cursor: o.cursor, unread: o.unread ? 1 : undefined });
export const conversation = (id: number) => request<Conversation>("GET", `/api/v1/conversations/${id}`);
export const messages = (id: number, o: { limit?: number; cursor?: string } = {}) =>
  request<Page<{ conversation: Conversation; messages: Message[] }>>("GET", `/api/v1/conversations/${id}/messages`, { limit: o.limit ?? 40, cursor: o.cursor });
export const search = (q: string, limit = 50) => request<{ hits: Hit[]; conversations: { conversationId: number; matches: number }[]; capped: boolean; invalid: string[] }>("GET", "/api/v1/search", { q, limit });
export const send = async (id: number, text: string, replyTo?: number) => (await request<{ message: Message }>("POST", `/api/v1/conversations/${id}/messages`, undefined, { text, ...(replyTo && { replyTo }) })).message;
export const markRead = (id: number) => request<void>("POST", `/api/v1/conversations/${id}/read`);
export const markUnread = (id: number) => request<void>("POST", `/api/v1/conversations/${id}/unread`);
export const todo = (id: number, o: { until?: string; waiting?: boolean } = {}) => request<void>("POST", `/api/v1/conversations/${id}/todo`, undefined, o);
export const clearTodo = (id: number) => request<void>("DELETE", `/api/v1/conversations/${id}/todo`);
export const archive = (id: number) => request<void>("POST", `/api/v1/conversations/${id}/archive`);
export const people = async (q: string, limit = 30) => (await request<{ people: Person[] }>("GET", "/api/v1/people", { q, limit })).people;
export const person = (id: number) => request<Person & { reach: Reach[] }>("GET", `/api/v1/people/${id}`);
export const compose = (accountId: number, to: string, text: string) => request<{ conversationId?: number; message?: Message }>("POST", "/api/v1/compose", undefined, { accountId, to: [to], text });
export const ai = (id: number) => request<AI>("GET", `/api/v1/conversations/${id}/ai`);
export const askAI = (id: number, kind: "summary" | "draft") => request<AI>("POST", `/api/v1/conversations/${id}/${kind}`);
export const forgetDraft = (id: number) => request<void>("DELETE", `/api/v1/conversations/${id}/draft`);
export const transcribe = (message: number) => request<void>("POST", `/api/v1/messages/${message}/transcribe`);
export const react = (message: number, emoji: string) => request<void>("POST", `/api/v1/messages/${message}/react`, undefined, { emoji });
export const unreact = (message: number, emoji: string) => request<void>("DELETE", `/api/v1/messages/${message}/react`, { emoji });

/** The event stream's request (`live.ts` reads it). */
export const events = (signal: AbortSignal) => {
  const { url, token } = server();
  return fetch(`${url}/api/v1/events?types=unread.changed,message.new,todo.due`, { headers: { authorization: `Bearer ${token}`, accept: "text/event-stream" }, signal, tls: tls() });
};

// ---- pictures --------------------------------------------------------------------------

/**
 * The pixels a picture is asked for at (Wisp's `?size=`, scaled to fit as
 * a JPEG): an avatar drawn at 28 or 32 px and a photo at 280, twice over
 * for a Retina screen. A view's tree carries them inline on every update,
 * so the originals would make each popover hundreds of KB.
 */
export const AVATAR_PX = 64, PHOTO_PX = 560;
/** What is kept at most of one answer, should a server ignore `size`. */
const MAX_BYTES = 256 * 1024;
const pictures = new Map<string, Promise<string | undefined>>();

/** A Wisp path (an `avatar`, an attachment `url`) as a data url at `px`, fetched once per path and size (Wisp versions a picture's path, so a kept one is never stale); undefined for a miss or not a picture. */
export function picture(path: string | undefined, px = AVATAR_PX): Promise<string | undefined> {
  if (!path) return Promise.resolve(undefined);
  const key = `${path}|${px}`;
  let p = pictures.get(key);
  if (!p) {
    p = call("GET", path, { size: px }, undefined, "image/*").then(async (r) => {
      const type = r.headers.get("content-type")?.split(";")[0] ?? "";
      if (!r.ok || !type.startsWith("image/")) return undefined;
      const buf = Buffer.from(await r.arrayBuffer());
      return buf.length && buf.length <= MAX_BYTES ? `data:${type};base64,${buf.toString("base64")}` : undefined;
    }).catch(() => undefined);
    pictures.set(key, p);
  }
  return p;
}
export const forgetPictures = () => pictures.clear();

/** Where a conversation opens in Wisp's web client (a message in it with `m`). */
export const webUrl = (id?: number, message?: number) => `${base()}${id ? `/all/${id}` : "/inbox"}${message ? `?m=${message}` : ""}`;
export const accountUrl = (id: number) => `${base()}/accounts/${id}`;
