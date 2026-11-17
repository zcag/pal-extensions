// The model over Wisp's v1 API (wisp/api.ts, the Wisp extension's own
// client and its server and token): the WhatsApp account's chats with the
// unread ones' newest messages, a chat's last twenty messages as a
// conversation, the archive search, people, and the phone behind a chat.
// Pure where it can be (the message shapes, the labels, the links:
// `msgOf`, `mediaLabel`, `chatLink`, `vcard` take no network), the loaders
// memoised so the bar item and the palettes share one chat list within
// `CHATS_FRESH_MS`.
import { existsSync } from "node:fs";
import { errorMessage, mdEscape, oneLine, settings, when } from "@zcag/pal";
import * as wisp from "../wisp/api.ts";

export type Conf = { send?: boolean; open?: "auto" | "app" | "web" };
export const conf = (): Conf => settings.get<Conf>("whatsapp");
export const log = (msg: string) => console.error(`[whatsapp] ${msg}`);

/** Wisp holds no WhatsApp account (or none turned on). */
export class NoAccount extends Error { constructor() { super("Wisp has no WhatsApp account"); } }

export type Chat = {
  /** Wisp's conversation id, as a row's id. */
  id: string;
  name: string;
  group: boolean;
  unread: number;
  /** Unix ms of the newest message. */
  at: number;
  /** The newest message as one line: Wisp's preview, or what the unread run says (with the sender for a group). */
  last?: string;
  /** Who wrote the newest message, when known (the unread run was fetched): "You", the chat's name, a group member. */
  who?: string;
  /** The newest incoming message's id, for a reply that quotes or a reaction. */
  latestId?: number;
  latestFromMe?: boolean;
  /** Your reaction on that message, so React can take it back. */
  latestMine?: string;
  /** Wisp's path to the picture. */
  avatarPath?: string;
  /** The picture as a data url, once fetched. */
  avatar?: string;
};

export type Msg = {
  id: number;
  at: number;
  fromMe: boolean;
  /** "You" for an outgoing message, else the sender's name. */
  who: string;
  /** The sender's address on WhatsApp (`<phone>@s.whatsapp.net`, a `@lid`). */
  from: string;
  /** The text, or the media label (`mediaLabel`) when there is none. */
  text: string;
  kind: string;
  /** Your own reaction on it. */
  mine?: string;
  /** Wisp's path to a photo or sticker in it. */
  imagePath?: string;
  /** That picture as a data url, when fetched. */
  image?: string;
};

/** How long one chat list serves the bar and the palettes. */
export const CHATS_FRESH_MS = 30_000;
/** Wisp answers 200 conversations a page; this many pages are the list. */
export const CHAT_PAGES = 3;
/** Unread chats whose newest messages are fetched, so their rows say who said what. */
export const MAX_RUNS = 12;
/** Messages fetched per unread chat for the row and the popover; the pane asks for `PANE_MSGS`. */
export const RUN_MSGS = 5;
export const PANE_MSGS = 20;
/** The chats whose pictures are fetched with the list (Wisp scales each to 64 px; the rest keep the initial). */
export const PICTURE_WARM = 48;
export const SEARCH_LIMIT = 40;
export const PEOPLE_LIMIT = 50;
/** Wisp's recent people span every network, so the empty query asks for this many to keep the WhatsApp ones that are among them. */
export const RECENT_PEOPLE = 500;

const ms = (iso: string | undefined) => (iso ? Date.parse(iso) || 0 : 0);
/** The digits of a WhatsApp address with a phone in it (`<phone>@s.whatsapp.net`, `@c.us`); undefined for a LID or a group. */
export const phoneOfJid = (jid: string): string | undefined => /^(\d{6,})@(s\.whatsapp\.net|c\.us)$/.exec(jid)?.[1];

// ---- message shapes --------------------------------------------------------------------------

/** What a message reads as on a row and in the pane: the kind in brackets, the caption, file name or transcript after it. */
export function mediaLabel(kind: string, body: string): string {
  const label: Record<string, string> = { image: "photo", video: "video", gif: "GIF", voice: "voice message", audio: "audio", document: "document", sticker: "sticker", location: "location", contact: "contact card", poll: "poll", call: "call" };
  const text = body.trim();
  const l = label[kind] ?? (kind === "text" || kind === "email" || !kind ? "" : kind.replace(/_/g, " "));
  if (!l) return text;
  return text ? `[${l}] ${text}` : `[${l}]`;
}

/** A Wisp message as one of the conversation's. */
export function msgOf(m: wisp.Message, chatName: string, group: boolean): Msg {
  const who = m.fromMe ? "You" : m.sender.name?.trim() || (group ? "" : chatName) || "Unknown";
  const file = m.attachments.find((a) => a.filename)?.filename;
  const picture = m.attachments.find((a) => (a.kind === "image" || a.kind === "sticker") && a.url);
  const text = m.deleted ? "[message deleted]" : mediaLabel(m.kind, m.text || m.transcript || (m.kind === "document" ? file ?? "" : ""));
  const mine = m.reactions.find((r) => r.fromMe)?.emoji;
  return { id: m.id, at: ms(m.sentAt), fromMe: m.fromMe, who, from: m.sender.id, text: text || "(no text)", kind: m.kind, ...(mine && { mine }), ...(picture?.url && { imagePath: picture.url }) };
}

/** WhatsApp's own quick reactions, in its order. */
export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export { oneLine };
/** A moment as the SDK writes it: the clock today, the day before it otherwise. */
export const clock = (t: number) => when(t);

/** The pane: one paragraph per message, `**who** · time`, then the text (a media label in italics, or the picture itself with its caption under it), markup escaped for marked. */
export function conversationMarkdown(msgs: Msg[]): string {
  return msgs.map((m) => {
    const head = `**${mdEscape(m.who)}** · ${clock(m.at)}`;
    const media = /^\[([^\]]+)\]\s?([\s\S]*)$/.exec(m.text);
    const caption = media?.[2] ? mdEscape(media[2]) : "";
    const body = !media ? mdEscape(m.text) : m.image ? `![${media[1]}](${m.image})${caption ? `\n\n${caption}` : ""}` : `_[${media[1]}]_${caption ? ` ${caption}` : ""}`;
    return `${head}\n\n${body.trim()}`;
  }).join("\n\n");
}

// ---- links ---------------------------------------------------------------------------------------

export type Opener = "app" | "web";

/** Where a chat opens for the `open` setting's value: `app` or `web` as said; `auto` is the desktop app when installed (macOS), else the web client. */
export function opener(setting: string | undefined, platform = process.platform, appInstalled = whatsappInstalled): Opener {
  if (setting === "app" || setting === "web") return setting;
  return platform === "darwin" && appInstalled() ? "app" : "web";
}
/** The opener the settings ask for now. */
export const currentOpener = (): Opener => opener(conf().open);

const APP_PATHS = ["/Applications/WhatsApp.app", `${process.env.HOME ?? ""}/Applications/WhatsApp.app`];
export const whatsappInstalled = (): boolean => APP_PATHS.some((p) => existsSync(p));

/**
 * The link into a chat: `whatsapp://send?phone=` in the app and
 * `https://web.whatsapp.com/send?phone=` on the web for a person (the
 * number with no `+`); a group has no link of its own on either, so
 * the app or the web client opens at the top.
 */
export function chatLink(phone: string | undefined, where: Opener, text?: string): string {
  const q = new URLSearchParams();
  if (phone) q.set("phone", phone.replace(/\D/g, ""));
  if (text) q.set("text", text);
  const s = q.toString();
  if (where === "app") return s ? `whatsapp://send?${s}` : "whatsapp://";
  return s ? `https://web.whatsapp.com/send?${s}` : "https://web.whatsapp.com/";
}

/** A contact as a vCard 3.0 the Contacts app and a phone both import. */
export const vcard = (name: string, phone: string): string => `BEGIN:VCARD\nVERSION:3.0\nFN:${name.replace(/[\n\r]/g, " ")}\nTEL;TYPE=CELL:+${phone.replace(/\D/g, "")}\nEND:VCARD`;

/** `905551234567` as `+90 555 123 45 67`: the country code, then the last ten digits in three, three, two, two. */
export function prettyPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length < 8) return `+${d}`;
  const local = d.slice(-10), cc = d.slice(0, -10);
  return `+${cc ? `${cc} ` : ""}${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 8)} ${local.slice(8)}`.trim();
}

// ---- the account ---------------------------------------------------------------------------------

let account: Promise<number> | undefined;

/** Wisp's WhatsApp account: the first one turned on, asked once. */
export function accountId(): Promise<number> {
  account ??= wisp.accounts().then((all) => {
    const a = all.find((x) => x.channel === "whatsapp" && x.enabled) ?? all.find((x) => x.channel === "whatsapp");
    if (!a) throw new NoAccount();
    return a.id;
  }).catch((e) => { account = undefined; throw e; });
  return account;
}

// ---- chats --------------------------------------------------------------------------------------

let chatList: { at: number; chats: Chat[] } | undefined;
let loading: Promise<Chat[]> | undefined;
const byId = new Map<string, Chat>();
/** The unread run per chat, keyed by the chat's newest time so a refresh where nothing moved fetches nothing. */
const runs = new Map<string, { at: number; msgs: Msg[] }>();

/** The chats, unread first then newest first, one list shared for `CHATS_FRESH_MS` (or `refresh`); one fetch at a time. */
export function loadChats(refresh = false): Promise<Chat[]> {
  if (!refresh && chatList && Date.now() - chatList.at < CHATS_FRESH_MS) return Promise.resolve(chatList.chats);
  loading ??= fetchChats().then((c) => { chatList = { at: Date.now(), chats: c }; return c; }).finally(() => { loading = undefined; });
  return loading;
}
export const dropChats = () => { chatList = undefined; };

async function fetchChats(): Promise<Chat[]> {
  const acc = await accountId();
  const raw: wisp.Conversation[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < CHAT_PAGES; i++) {
    const page = await wisp.conversations("all", { account: acc, limit: 200, cursor });
    raw.push(...page.conversations);
    if (!(cursor = page.next)) break;
  }
  const list = raw.filter((c) => c.kind === "direct" || c.kind === "group").map(chatOf).sort((a, b) => (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0) || b.at - a.at);
  byId.clear();
  for (const c of list) byId.set(c.id, c);
  await Promise.all([
    // The unread chats' newest messages, so the row and the popover say who said what; memoised on the chat's time.
    ...list.filter((c) => c.unread > 0).slice(0, MAX_RUNS).map(async (c) => {
      try { settleLatest(c, await unreadRun(c)); } catch (e) { log(`messages ${c.id}: ${errorMessage(e)}`); }
    }),
    ...list.slice(0, PICTURE_WARM).map(async (c) => { c.avatar = await wisp.picture(c.avatarPath); }),
  ]);
  return list;
}

const chatOf = (c: wisp.Conversation): Chat => ({
  id: String(c.id),
  name: c.title?.trim() || `Chat ${c.id}`,
  group: c.kind === "group",
  unread: c.unread ?? 0,
  at: ms(c.lastMessageAt),
  ...(c.lastPreview?.trim() && { last: (c.lastFromMe && !/^You: /.test(c.lastPreview) ? "You: " : "") + c.lastPreview.trim() }),
  ...(c.avatar && { avatarPath: c.avatar }),
});

/** The row's newest line and the message a reply or reaction targets, from the chat's latest messages. */
export function settleLatest(c: Chat, run: Msg[]): void {
  const top = run[run.length - 1];
  if (top) { c.last = top.who === "You" ? `You: ${top.text}` : c.group ? `${top.who}: ${top.text}` : top.text; c.who = top.who; }
  const incoming = [...run].reverse().find((m) => !m.fromMe);
  c.latestId = incoming?.id ?? top?.id;
  c.latestFromMe = !incoming;
  c.latestMine = incoming?.mine;
}

/** The newest `RUN_MSGS` of an unread chat, oldest first, from the memo when the chat has not moved. */
async function unreadRun(c: Chat): Promise<Msg[]> {
  const have = runs.get(c.id);
  if (have && have.at === c.at) return have.msgs;
  const msgs = await conversation(c, Math.min(Math.max(c.unread, 1), RUN_MSGS), false);
  runs.set(c.id, { at: c.at, msgs });
  return msgs;
}

const phones = new Map<string, string>();

/** The last `n` messages of a chat, oldest first; `pictures` fetches the photos in them for the pane. A direct chat's incoming sender tells its phone. */
export async function conversation(c: Chat, n = PANE_MSGS, pictures = true): Promise<Msg[]> {
  const page = await wisp.messages(Number(c.id), { limit: n });
  const msgs = page.messages.slice(-n).map((m) => msgOf(m, c.name, c.group));
  if (!c.group && !phones.has(c.id)) { const p = msgs.map((m) => (m.fromMe ? undefined : phoneOfJid(m.from))).find(Boolean); if (p) phones.set(c.id, p); }
  if (pictures) await Promise.all(msgs.map(async (m) => { if (m.imagePath) m.image = await wisp.picture(m.imagePath, wisp.PHOTO_PX); }));
  return msgs;
}

/** A chat by id, from the list at hand or a fresh one; one the list lacks is asked of Wisp. */
export async function chat(id: string): Promise<Chat> {
  const have = byId.get(id);
  if (have) return have;
  await loadChats();
  const listed = byId.get(id);
  if (listed) return listed;
  const c = chatOf(await wisp.conversation(Number(id)));
  c.avatar = await wisp.picture(c.avatarPath);
  return c;
}

/** The chats with something unread, the list's order. */
export const unreadChats = async (refresh = false): Promise<Chat[]> => (await loadChats(refresh)).filter((c) => c.unread > 0);

// ---- phones and people ------------------------------------------------------------------------------

/**
 * The phone behind a direct chat: an incoming message's sender, else the
 * person Wisp merged the chat into (`/people?q=` by its name, the reach
 * whose conversation it is); undefined for a group or a chat with no
 * number Wisp knows (a LID-only sender).
 */
export async function phoneOf(c: Chat): Promise<string | undefined> {
  if (c.group) return undefined;
  if (!phones.has(c.id)) await conversation(c, PANE_MSGS, false).catch(() => undefined);
  if (!phones.has(c.id)) {
    for (const p of (await wisp.people(c.name, 5).catch(() => [])).filter((p) => p.channels.includes("whatsapp")).slice(0, 3)) {
      const reach = (await wisp.person(p.id).catch(() => undefined))?.reach.find((r) => r.channel === "whatsapp" && String(r.conversationId) === c.id);
      if (reach) { const d = reach.address.replace(/\D/g, ""); if (d) phones.set(c.id, d); break; }
    }
  }
  return phones.get(c.id);
}

export type Person = { id: string; name: string; avatar?: string; last?: string; at: number; phone?: string; conversation?: string };

const people = new Map<string, Person>();

/** People with a WhatsApp identity: the best matches for `q`, or the most recent without one. */
export async function findPeople(q: string): Promise<Person[]> {
  const found = (await wisp.people(q.trim(), q.trim() ? PEOPLE_LIMIT : RECENT_PEOPLE)).filter((p) => p.channels.includes("whatsapp"));
  return Promise.all(found.map(async (p, i) => {
    const avatar = p.avatar && i < PICTURE_WARM ? await wisp.picture(p.avatar) : undefined;
    const person: Person = { ...people.get(String(p.id)), id: String(p.id), name: p.name, at: ms(p.lastMessageAt), ...(p.lastPreview && { last: (p.lastFromMe ? "You: " : "") + p.lastPreview }), ...(avatar && { avatar }) };
    people.set(person.id, person);
    return person;
  }));
}

/** A person with the number and the chat Wisp reaches them at on WhatsApp, asked once. */
export async function personReach(id: string): Promise<Person> {
  const have = people.get(id);
  if (have?.phone !== undefined) return have;
  const p = await wisp.person(Number(id));
  const r = p.reach.find((x) => x.channel === "whatsapp");
  const person: Person = { ...have, id, name: p.name, at: ms(p.lastMessageAt), phone: r?.address.replace(/\D/g, "") ?? "", ...(r?.conversationId && { conversation: String(r.conversationId) }) };
  people.set(id, person);
  return person;
}

// ---- search ---------------------------------------------------------------------------------------------

export type Hit = { id: string; chatId: string; chat: string; who: string; text: string; at: number; fromMe: boolean; group: boolean };

/** Wisp's hits for `q` on WhatsApp (its search language: prefixes, accents folded, operators), newest first as Wisp ranks them. */
export async function search(q: string): Promise<Hit[]> {
  await loadChats().catch(() => []);
  const found = await wisp.search(`${q} in:whatsapp`, SEARCH_LIMIT);
  return found.hits.filter((h) => h.channel === "whatsapp").map((h) => {
    const listed = byId.get(String(h.conversationId));
    const group = listed?.group ?? false;
    const m = msgOf(h.message, h.conversationTitle, group);
    return { id: String(m.id), chatId: String(h.conversationId), chat: h.conversationTitle, who: m.who, text: oneLine(m.text), at: m.at, fromMe: m.fromMe, group };
  });
}

/** Forget everything memoised (settings changed, tests). */
export const resetData = () => { chatList = undefined; account = undefined; byId.clear(); runs.clear(); phones.clear(); people.clear(); wisp.forgetPictures(); };
