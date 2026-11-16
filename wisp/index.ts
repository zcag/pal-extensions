// Wisp (github.com/zcag/wisp), the owner's self-hosted inbox for WhatsApp,
// Gmail, Slack, Telegram, SMS and more, through its integration API
// (api.ts). Six palettes and a bar item over one data layer (data.ts):
// Inbox lists a Wisp view (Inbox, Now, To do, Screener, All) with every
// account's conversations in one list; Conversations is every recent one,
// reached by name from pal's root; Conversation is a view of one (chat.ts)
// to read and answer, with Wisp's AI summary and suggested reply; New
// Message writes to a person from Wisp's people; Search is Wisp's own
// search language; Accounts says how each connection is doing. The bar item counts unread
// per network (or per account, or in all) as coloured glyphs on one
// strip, and its popover (view.ts) is the whole inbox behind tabs. The
// event stream (live.ts) redraws the bar and an open conversation as
// messages arrive.
import { bar, errorMessage, failed, hint, mdEscape, now, preview, settings, state, toast, truncate, view as liveView, type Accessory, type Action, type Arg, type BarCtx, type BarItem, type Ctx, type Detail, type Effect, type Extension, type Form, type Item, type LinkParams, type View } from "@zcag/pal";
import * as api from "./api.ts";
import { ApiError, EXT, NotSetUp, Unreachable, accountUrl, conf, forgetPictures, log, picture, webUrl, type AI, type Account, type Conversation, type Counts, type Message, type Person, type Split } from "./api.ts";
import { render as renderChat, type ChatState } from "./chat.ts";
import { GLYPH, SECTION_ORDER, accounts, counts, drop, forMe, groups, healthy, isDue, isGroup, isTodo, line, list, markdown, net, one, plural, preview as lastLine, sectionOf, short, tabs, until } from "./data.ts";
import * as live from "./live.ts";
import { actions as popActions, avatarColor, current, initial, render as renderPopover, visible, type PopRow, type PopState } from "./view.ts";

const ITEM = "inbox";
const SETTINGS_URL = "pal://settings/extensions";
const REOPEN_MS = 60;
/** Rows of a list that get their picture fetched; the rest wear the network's glyph. */
const PICTURES = 60;
/** Photos of a conversation drawn inline, the newest. */
const PHOTOS = 8;
const UNREAD_MARK = new Set(["gmail", "whatsapp", "telegram"]);
/** How often an open conversation asks Wisp whether its summary, suggested reply or transcript is done, and for how many rounds at most. */
const POLL_MS = 2000, POLL_ROUNDS = 45;
const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

// Another server or token: nothing fetched applies, and the stream follows the new one.
settings.onChange(() => { drop(); forgetPictures(); live.restart(); }, EXT);

// ---- failures ---------------------------------------------------------------------------------

const SETTINGS_ACTION: Action[] = [{ id: "settings", title: "Open Wisp settings" }];

function problemOf(e: unknown): string {
  if (e instanceof ApiError && e.status === 401) return "Wisp refused the token: make one under Accounts › Agent tokens (App of yours)";
  if (e instanceof ApiError && e.status === 403) return `Wisp refused: ${e.message}`;
  return errorMessage(e);
}

function failure(e: unknown): Item[] {
  if (e instanceof NotSetUp) return [hint(e.missing, e.missing === "url" ? "Wisp server is not set" : "Wisp token is not set", e.message, { actions: SETTINGS_ACTION, icon: GLYPH.alert })];
  if (e instanceof Unreachable) return [hint("unreachable", "Wisp is unreachable", e.message, { actions: SETTINGS_ACTION, icon: GLYPH.alert })];
  if (e instanceof ApiError && e.status === 401) return [hint("auth", "Wisp refused the token", "Make one in Wisp under Accounts › Agent tokens (App of yours) and paste it under Settings › Extensions › Wisp", { actions: SETTINGS_ACTION, icon: GLYPH.alert })];
  log(errorMessage(e));
  return [hint("error", "Wisp did not answer", errorMessage(e), { icon: GLYPH.alert })];
}
const guard = async (f: () => Promise<Item[]>): Promise<Item[]> => { try { return await f(); } catch (e) { return failure(e); } };

/** Something changed through pal: every list is stale, and the bar is told. */
function changed() {
  drop();
  bar.refresh(ITEM, EXT).catch(() => {});
}

// ---- accounts as the rows need them ---------------------------------------------------------------

type Accs = Map<number, Account>;
const accountMap = async (): Promise<Accs> => new Map((await accounts().catch(() => [] as Account[])).map((a) => [a.id, a]));
const canSend = (accs: Accs, c: Conversation) => accs.get(c.accountId)?.sendPolicy !== "none";
const accountLabel = (accs: Accs, c: Conversation) => accs.get(c.accountId)?.label ?? net(c.channel).name;

// ---- actions shared by the rows, the popover and the conversation ------------------------------------

/** 09:00 tomorrow, or `days` from now, local time. */
function morning(days = 1): string {
  const d = new Date(now());
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

const DONE: Record<string, string> = { read: "Marked read", unread: "Marked unread", todo: "To do", "clear-todo": "To do cleared", later: "To do tomorrow", waiting: "Waiting on them", archive: "Done" };

/** One write on one conversation. */
async function write(id: number, action: string, c?: Conversation): Promise<void> {
  switch (action) {
    case "read": return api.markRead(id);
    case "unread": return api.markUnread(id);
    case "todo": return c && isTodo(c) ? api.clearTodo(id) : api.todo(id);
    case "clear-todo": return api.clearTodo(id);
    case "later": return api.todo(id, { until: morning() });
    case "waiting": return api.todo(id, { waiting: true, until: morning(3) });
    case "archive": return api.archive(id);
  }
  throw new Error(`no action ${action}`);
}

/** A write over every id; the HUD says what was done, a toast names what was refused. */
async function writeAll(ids: number[], action: string): Promise<Effect> {
  const refused: string[] = [];
  let label = "", what = DONE[action];
  for (const id of ids) {
    const c = await one(id).catch(() => undefined);
    label = c?.title ?? label;
    if (action === "todo" && c && isTodo(c)) what = DONE["clear-todo"];
    try { await write(id, action, c); } catch (e) {
      log(`${action} ${id}: ${errorMessage(e)}`);
      refused.push(`${c?.title ?? id}: ${e instanceof ApiError && e.status === 501 ? "the network has no unread mark" : problemOf(e)}`);
    }
  }
  changed();
  if (refused.length) return toast(`Could not do it: ${what}`, refused.join("\n"), "failure");
  return { keep: true, hud: ids.length > 1 ? `${what}: ${ids.length} conversations` : `${what}: ${label}` };
}

const pushConversation = (c: Pick<Conversation, "id" | "title">): Effect => ({ push: { extension: EXT, palette: "conversation", args: { id: c.id }, title: truncate(c.title, 32) } });

// ---- rows -----------------------------------------------------------------------------------------

const initialIcon = (name: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${avatarColor(name)}"/><text x="32" y="42" font-family="system-ui" font-size="32" font-weight="700" fill="#fff" text-anchor="middle">${initial(name).replace(/[<>&]/g, "")}</text></svg>`;
  return { image: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` };
};

function accessories(c: Conversation): Accessory[] {
  const a: Accessory[] = [];
  if (c.unread) a.push({ tag: forMe(c) ? `@${c.unread}` : String(c.unread), color: forMe(c) ? "red" : net(c.channel).color });
  else if (c.triage.state === "waiting") a.push({ tag: c.triage.until ? `waiting · ${until(c.triage.until)}` : "waiting", color: "amber" });
  else if (isTodo(c)) a.push({ tag: c.triage.until && !isDue(c) ? until(c.triage.until) : "to do", color: "amber" });
  if (c.lastMessageAt) a.push({ date: c.lastMessageAt });
  return a;
}

function rowActions(c: Conversation, send: boolean): Action[] {
  const todo = isTodo(c);
  return [
    { id: "open", title: "Open the conversation" },
    { id: c.unread ? "read" : "unread", title: c.unread ? "Mark read" : "Mark unread", shortcut: "cmd+enter", multi: true },
    ...(send ? [{ id: "reply", title: "Send a message", shortcut: "cmd+shift+r", args: true as const }] : []),
    { id: todo ? "clear-todo" : "todo", title: todo ? "Clear the To do" : "To do", shortcut: "cmd+t", multi: true },
    { id: "later", title: "To do tomorrow morning", shortcut: "cmd+shift+t", multi: true },
    { id: "waiting", title: "Waiting on them (a To do again in 3 days)", shortcut: "cmd+shift+w", multi: true },
    { id: "archive", title: "Done (archive)", shortcut: "cmd+e", multi: true },
    { id: "web", title: "Open in Wisp", shortcut: "cmd+o", multi: true },
    { id: "copy", title: "Copy the last message", shortcut: "cmd+c" },
  ];
}

const ARGS: Arg[] = [{ id: "text", placeholder: "Message", required: true }];

async function conversationRow(c: Conversation, accs: Accs, pic: boolean, section?: string): Promise<Item> {
  const n = net(c.channel);
  const avatar = pic ? await picture(c.avatar) : undefined;
  const send = canSend(accs, c);
  return {
    id: String(c.id),
    name: c.title,
    subtitle: truncate(lastLine(c), 110),
    icon: avatar ? { image: avatar } : pic ? initialIcon(c.title) : { glyph: n.glyph, color: n.tile },
    keywords: [n.name, accountLabel(accs, c), ...(isGroup(c) ? ["group"] : [])],
    section,
    accessories: accessories(c),
    ...(send && { args: ARGS }),
    actions: rowActions(c, send),
  };
}

/** The rows, under Wisp's sections in its order (a due To do first) when `sectioned`, newest first inside each. */
async function rows(cs: Conversation[], sectioned: boolean): Promise<Item[]> {
  const accs = await accountMap();
  const order = sectioned ? SECTION_ORDER.flatMap((s) => cs.filter((c) => sectionOf(c) === s)) : cs;
  return Promise.all(order.map((c, i) => conversationRow(c, accs, i < PICTURES, sectioned ? sectionOf(c) : undefined)));
}

/** The pane: the account and the state over the latest messages. */
async function pane(id: number): Promise<Detail> {
  const [{ conversation: c, messages }, accs, ai] = await Promise.all([api.messages(id, { limit: 15 }), accountMap(), api.ai(id).catch(() => undefined)]);
  const sum = ai?.summary?.text ? `> **Summary${ai.summary.stale ? " (newer messages came after it)" : ""}**\n>\n> ${mdEscape(ai.summary.text.trim()).replace(/\n+/g, "\n>\n> ")}\n\n` : "";
  const chips: Detail["chips"] = [];
  if (c.unread) chips.push({ text: `${plural(c.unread, "message")} unread`, color: net(c.channel).color });
  if (isTodo(c)) chips.push({ text: c.triage.state === "waiting" ? "Waiting on them" : c.triage.until && !isDue(c) ? `To do ${until(c.triage.until)}` : "To do", color: "amber" });
  return {
    caption: [net(c.channel).name, accountLabel(accs, c), isGroup(c) ? c.kind : undefined].filter(Boolean).join(" · "),
    title: c.title,
    ...(chips.length && { chips }),
    markdown: sum + (messages.length ? markdown(messages) : "_No messages yet_"),
    metadata: [{ label: "Open", link: { text: "In Wisp", href: webUrl(c.id) } }],
  };
}

async function pickConversation(id: number, action: string | undefined, ctx?: Ctx): Promise<Effect> {
  const ids = (ctx?.ids ?? [String(id)]).map(Number);
  switch (action) {
    case undefined: case "open": return pushConversation(await one(id));
    case "reply": case "send": {
      const text = String(ctx?.values?.text ?? "").trim();
      if (!text) return pushConversation(await one(id));
      try { await api.send(id, text); } catch (e) { return failed("send it", problemOf(e)); }
      changed();
      return toast("Sent", `${(await one(id).catch(() => undefined))?.title ?? ""}: ${truncate(text, 60)}`);
    }
    case "web": return { open: ids.map((x) => webUrl(x)) };
    case "copy": {
      const { messages } = await api.messages(id, { limit: 1 });
      return messages[0] ? { copy: messages[0].text || line(messages[0]) } : toast("No message to copy", undefined, "failure");
    }
  }
  return writeAll(ids, action);
}

const pickHint = (id: string): Effect | void => (["hint:url", "hint:token", "hint:auth", "hint:unreachable"].includes(id) ? { open: SETTINGS_URL } : undefined);

// ---- the inbox palette ----------------------------------------------------------------------------

const VIEWS = [
  { id: "inbox", title: "Inbox" },
  { id: "now", title: "Now" },
  { id: "todo", title: "To do" },
  { id: "screener", title: "Screener" },
  { id: "all", title: "All" },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];
const EMPTY: Record<ViewId, [string, string]> = {
  inbox: ["Inbox zero", "Nothing unread and no To do due"],
  now: ["Nothing waits on you", "No conversation waits on your reply"],
  todo: ["No To dos", "cmd+t on a conversation makes it one"],
  screener: ["The Screener is empty", "No first-time sender waits to be let in"],
  all: ["No conversations", "Wisp has none yet"],
};

async function inboxRows(ctx?: Ctx): Promise<Item[]> {
  hook();
  live.start();
  const v = (VIEWS.some((x) => x.id === ctx?.filter) ? ctx!.filter : "inbox") as ViewId;
  const cs = await list(v, !!ctx?.refresh);
  if (!cs.length) return [hint("empty", EMPTY[v][0], EMPTY[v][1], { icon: GLYPH.read })];
  return rows(cs, v === "inbox" || v === "all");
}

async function conversationRows(ctx?: Ctx): Promise<Item[]> {
  hook();
  live.start();
  const cs = await list("all", !!ctx?.refresh);
  return cs.length ? rows(cs, false) : [hint("empty", EMPTY.all[0], EMPTY.all[1], { icon: GLYPH.read })];
}

// ---- new message: a person, then the account to write from ------------------------------------------------

const folks = new Map<string, Person>();

async function peopleRows(query = "", ctx?: Ctx): Promise<Item[]> {
  const found = await api.people(query.trim(), 30);
  folks.clear();
  const items = await Promise.all(found.map(async (p): Promise<Item> => {
    folks.set(`p${p.id}`, p);
    const avatar = await picture(p.avatar);
    return {
      id: `p${p.id}`,
      name: p.name,
      subtitle: [p.channels.map((c) => net(c).name).join(", "), p.lastPreview && truncate((p.lastFromMe ? "You: " : "") + p.lastPreview, 80)].filter(Boolean).join(" · "),
      icon: avatar ? { image: avatar } : initialIcon(p.name),
      keywords: p.channels.map((c) => net(c).name),
      accessories: [...(p.unread ? [{ tag: String(p.unread), color: "blue" as const }] : []), ...(p.lastMessageAt ? [{ date: p.lastMessageAt }] : [])],
      actions: [{ id: "write", title: `Write to ${p.name}` }, { id: "web", title: "Open in Wisp", shortcut: "cmd+o" }],
    };
  }));
  const out = items.length ? items : [hint("none", query.trim() ? "Nobody by that name" : "No people yet", "Wisp's people are everyone you have talked with, on every network", { icon: GLYPH.person })];
  ctx?.partial?.(out);
  return out;
}

const via = (r: api.Reach) => `${r.accountId}|${r.conversationId ?? ""}|${r.address}`;

function writeForm(p: Person, reach: api.Reach[], errors?: Record<string, string>, text = ""): Form {
  const first = reach.find((r) => r.conversationId) ?? reach[0];
  return {
    id: `p${p.id}`,
    title: `Write to ${p.name}`,
    fields: [
      { kind: "select", id: "via", label: "From", default: via(first), options: reach.map((r) => ({ id: via(r), title: `${net(r.channel).name} (${r.account}) · ${r.address}${r.conversationId ? "" : " · a new conversation"}` })) },
      { kind: "textarea", id: "text", label: "Message", required: true, default: text, placeholder: `To ${p.name}` },
    ],
    submit: { id: "compose", title: "Send" },
    errors,
  };
}

async function pickPerson(id: string, action: string | undefined, ctx?: Ctx): Promise<Effect> {
  const pid = Number(id.slice(1));
  if (action === "web") return { open: `${api.base()}/people/${pid}` };
  const p = await api.person(pid);
  const reach = p.reach.filter((r) => r.canSend);
  if (!reach.length) return toast(`Nothing can write to ${p.name}`, "No account of yours that lets you send reaches them", "failure");
  if (action !== "compose") return reach.length === 1 && reach[0].conversationId ? pushConversation({ id: reach[0].conversationId, title: p.name }) : { form: writeForm(p, reach) };
  const text = String(ctx?.values?.text ?? "").trim();
  const r = reach.find((x) => via(x) === String(ctx?.values?.via ?? "")) ?? reach[0];
  if (!text) return { form: writeForm(p, reach, { text: "Required" }) };
  try {
    const conv = r.conversationId ?? (await api.compose(r.accountId, r.address, text)).conversationId;
    if (r.conversationId) await api.send(r.conversationId, text);
    changed();
    return conv ? { ...pushConversation({ id: conv, title: p.name }), hud: `Sent to ${p.name}` } : { hud: `Sent to ${p.name}` };
  } catch (e) { return { form: writeForm(p, reach, { text: problemOf(e) }, text) }; }
}

// ---- search -------------------------------------------------------------------------------------------

const hits = new Map<string, api.Hit>();
let searchSeq = 0, lastSearch: Item[] = [];

async function searchRows(query = "", ctx?: Ctx): Promise<Item[]> {
  const q = query.trim();
  if (q.length < 2) return [hint("search", "Search Wisp", "Words from any message on every account; from:, in:whatsapp, is:unread, has:attachment, after:7d and \"phrases\" work as in Wisp", { icon: GLYPH.search })];
  const seq = ++searchSeq;
  const found = await api.search(q, 60);
  if (seq !== searchSeq) return lastSearch;
  hits.clear();
  const items = found.hits.map((h): Item => {
    const id = `${h.conversationId}:${h.message.id}`;
    hits.set(id, h);
    const n = net(h.channel);
    const who = h.message.fromMe ? "You" : h.message.sender.name;
    return {
      id,
      name: truncate(line(h.message), 110) || "(no text)",
      subtitle: who && who !== h.conversationTitle ? `${who} in ${h.conversationTitle}` : h.conversationTitle,
      icon: { glyph: n.glyph, color: n.tile },
      keywords: [h.conversationTitle, who, n.name],
      accessories: [{ date: h.message.sentAt }],
      actions: [
        { id: "open", title: "Open the conversation" },
        { id: "web", title: "Open in Wisp at this message", shortcut: "cmd+o" },
        { id: "copy", title: "Copy the message", shortcut: "cmd+c", multi: true },
      ],
    };
  });
  const bad = found.invalid.length ? [hint("invalid", `Not understood: ${found.invalid.join(", ")}`, "Wisp searched without them")] : [];
  lastSearch = items.length ? [...bad, ...items] : [...bad, hint("none", "Nothing found", `No message matches ${q}`, { icon: GLYPH.search })];
  ctx?.partial?.(lastSearch);
  return lastSearch;
}

function pickHit(id: string, action: string | undefined, ctx?: Ctx): Effect | Promise<Effect> {
  if (action === "copy") return { copy: (ctx?.ids ?? [id]).map((x) => hits.get(x)?.message.text ?? "").filter(Boolean).join("\n") };
  const h = hits.get(id);
  if (!h) return { keep: true };
  if (action === "web") return { open: webUrl(h.conversationId, h.message.id) };
  return pushConversation({ id: h.conversationId, title: h.conversationTitle });
}

// ---- accounts ---------------------------------------------------------------------------------------------

const STATE: Record<string, { tag: string; color: "green" | "amber" | "red" | "grey" | "blue" }> = {
  connected: { tag: "connected", color: "green" }, syncing: { tag: "syncing", color: "blue" }, starting: { tag: "starting", color: "blue" },
  setup: { tag: "needs setup", color: "amber" }, degraded: { tag: "degraded", color: "amber" }, disconnected: { tag: "disconnected", color: "red" },
  error: { tag: "error", color: "red" }, stopped: { tag: "stopped", color: "grey" },
};

async function accountRows(ctx?: Ctx): Promise<Item[]> {
  const list = await accounts(!!ctx?.refresh);
  if (!list.length) return [hint("none", "No accounts", "Add one in Wisp")];
  return list.map((a): Item => {
    const n = net(a.channel), s = a.enabled ? STATE[a.state] ?? { tag: a.state, color: "grey" as const } : { tag: "off", color: "grey" as const };
    return {
      id: String(a.id),
      name: a.label,
      subtitle: [n.name, a.identity, a.detail].filter(Boolean).join(" · "),
      icon: { glyph: n.glyph, color: n.tile },
      keywords: [n.name, a.channel],
      section: a.enabled && !healthy(a) ? "Needs attention" : "Accounts",
      accessories: [...(a.unread ? [{ tag: String(a.unread), color: n.color }] : []), { tag: s.tag, color: s.color }],
      actions: [{ id: "open", title: "Open in Wisp" }, { id: "inbox", title: "Its inbox in Wisp", shortcut: "cmd+o" }],
    };
  }).sort((a, b) => (a.section === b.section ? 0 : a.section === "Needs attention" ? -1 : 1));
}

// ---- the conversation view -----------------------------------------------------------------------------

/** Per open conversation: what was fetched for it. */
type Open = {
  id: number; messages: Message[]; next?: string; c?: Conversation; images: Record<number, string>; senders: Record<string, string>; avatar?: string; problem?: string; readSent?: boolean;
  ai?: AI; cursor?: number; replyTo?: Message; fill?: string; reacting?: number;
  /** Asked this open: a suggested reply that fills the field when it is ready, a message whose transcript is on its way. */
  wantDraft?: boolean; transcribing?: number; poll?: ReturnType<typeof setTimeout>; rounds?: number;
};
const opened = new Map<number, Open>();

const idOf = (ctx?: Ctx): number | undefined => { const v = (ctx?.args as { id?: unknown } | undefined)?.id; const n = Number(v); return Number.isFinite(n) && n > 0 ? n : undefined; };

async function load(o: Open, older = false) {
  const page = await api.messages(o.id, { limit: 40, cursor: older ? o.next : undefined });
  o.c = page.conversation;
  const have = new Set(o.messages.map((m) => m.id));
  o.messages = older ? [...page.messages.filter((m) => !have.has(m.id)), ...o.messages] : page.messages;
  o.next = page.next;
  o.problem = undefined;
  const photos = o.messages.flatMap((m) => m.attachments.filter((a) => (a.kind === "image" || a.kind === "sticker") && a.url)).slice(-PHOTOS);
  const faces = isGroup(o.c) ? [...new Set(o.messages.map((m) => m.sender.avatar).filter((x): x is string => !!x))] : [];
  const [avatar] = await Promise.all([
    picture(o.c.avatar),
    api.ai(o.id).then((x) => { o.ai = x; }, () => {}),
    ...photos.map(async (a) => { const d = await picture(a.url, api.PHOTO_PX); if (d) o.images[a.id] = d; }),
    ...faces.map(async (f) => { const d = await picture(f); if (d) o.senders[f] = d; }),
  ]);
  o.avatar = avatar as string | undefined;
}

async function state_(o: Open, compact?: boolean): Promise<ChatState> {
  const accs = await accountMap();
  const c = o.c ?? ({ id: o.id, accountId: 0, channel: "", kind: "direct", title: "Conversation", lastPreview: "", lastFromMe: false, unread: 0, counted: true, triage: { state: "inbox" }, waitsOnYou: false, screener: false } as Conversation);
  return {
    c, account: accountLabel(accs, c), network: net(c.channel), messages: o.messages, images: o.images, senders: o.senders, avatar: o.avatar,
    more: !!o.next, canSend: !!o.c && canSend(accs, c), canUnread: UNREAD_MARK.has(c.channel), now: now(), compact, problem: o.problem,
    ai: o.ai, cursor: o.cursor, replyTo: o.replyTo, fill: o.fill,
  };
}

const busyAI = (o: Open) => [o.ai?.summary, o.ai?.draft].some((x) => x?.state === "queued" || x?.state === "running");

/** While Wisp works on something this view asked for, ask again every POLL_MS and draw what came: a summary, the suggested reply into the field, a transcript. */
function poll(o: Open) {
  clearTimeout(o.poll);
  if (!busyAI(o) && !o.transcribing && !(o.wantDraft && o.fill === undefined)) return;
  if ((o.rounds = (o.rounds ?? 0) + 1) > POLL_ROUNDS) { o.transcribing = undefined; o.wantDraft = false; return; }
  o.poll = setTimeout(async () => {
    if (!opened.has(o.id)) return;
    o.ai = await api.ai(o.id).catch(() => o.ai);
    if (o.wantDraft && o.ai?.draft?.state === "ready" && o.ai.draft.text) { o.fill = o.ai.draft.text; o.wantDraft = false; }
    if (o.transcribing) {
      try { await load(o); } catch { /* the next round */ }
      if (o.messages.find((m) => m.id === o.transcribing)?.transcript) o.transcribing = undefined;
    }
    await redrawOpen(o.id);
    poll(o);
  }, POLL_MS);
}

async function conversationView(ctx?: Ctx, fresh = true): Promise<View> {
  hook();
  const id = idOf(ctx) ?? (await list("inbox").catch(() => [] as Conversation[]))[0]?.id;
  if (!id) return { title: "Wisp", id: "none", keys: "actions", tree: { type: "text", value: "Nothing to open: the inbox is empty", style: "muted", size: "sm" }, actions: [{ id: "web", title: "Open Wisp", shortcut: "cmd+o" }] };
  let o = opened.get(id);
  if (!o) { o = { id, messages: [], images: {}, senders: {} }; opened.set(id, o); }
  if (fresh || !o.c) { try { await load(o); } catch (e) { o.problem = problemOf(e); } }
  if (busyAI(o)) { o.rounds = 0; poll(o); }
  // Opening is reading, as in Wisp: once per open, in the background, and the view redrawn when it lands.
  if (o.c?.unread && conf().read_on_open !== false && !o.readSent) {
    o.readSent = true;
    const target = o;
    api.markRead(id).then(async () => {
      changed();
      if (target.c) target.c = { ...target.c, unread: 0, forMe: 0 };
      await redrawOpen(id);
    }).catch((e) => log(`read on open ${id}: ${errorMessage(e)}`));
  }
  return renderChat(await state_(o, ctx?.compact));
}

/** Every open level of this conversation drawn again from what was fetched. */
async function redrawOpen(id: number, refetch = false) {
  const o = opened.get(id);
  if (!o) return;
  if (refetch) { try { await load(o); } catch (e) { o.problem = problemOf(e); } }
  for (const ev of liveView.open()) {
    if (ev.extension !== EXT || ev.palette !== "conversation" || ev.id !== String(id)) continue;
    liveView.update(renderChat(await state_(o, ev.compact)), { palette: "conversation", id: String(id) }).catch(() => {});
  }
}

async function conversationPick(viewId: string, action: string, ctx?: Ctx): Promise<Effect> {
  const id = Number(viewId);
  const o = opened.get(id) ?? { id, messages: [], images: {}, senders: {} };
  opened.set(id, o);
  const redraw = async (): Promise<Effect> => ({ view: renderChat(await state_(o, ctx?.compact)) });
  const at = (d: number) => {
    const i = o.messages.findIndex((m) => m.id === o.cursor);
    const next = i < 0 ? (d < 0 ? o.messages.length - 1 : 0) : Math.max(0, Math.min(o.messages.length - 1, i + d));
    return o.messages[next];
  };
  /** The message a reply or a reaction is for: the cursor's, else the newest of theirs. */
  const target = () => o.messages.find((m) => m.id === o.cursor) ?? [...o.messages].reverse().find((m) => !m.fromMe) ?? o.messages.at(-1);
  if (action.startsWith("transcribe:")) {
    const mid = Number(action.slice(11));
    try { await api.transcribe(mid); } catch (e) { return failed("transcribe it", problemOf(e)); }
    o.transcribing = mid; o.rounds = 0; poll(o);
    return { keep: true, hud: "Transcribing" };
  }
  if (action.startsWith("attachment:")) {
    const a = o.messages.flatMap((m) => m.attachments.map((x) => ({ m, x }))).find(({ x }) => String(x.id) === action.slice(11));
    return { open: a ? webUrl(id, a.m.id) : webUrl(id) };
  }
  switch (action) {
    case "send": {
      const text = String(ctx?.values?.input ?? "").trim();
      if (!text) return { keep: true };
      try { await api.send(id, text, o.replyTo?.id); } catch (e) { return failed("send it", problemOf(e)); }
      if (o.fill !== undefined) api.forgetDraft(id).catch(() => {});
      o.replyTo = undefined; o.fill = undefined; o.cursor = undefined;
      changed();
      try { await load(o); } catch { /* the stream brings it */ }
      const v = renderChat(await state_(o, ctx?.compact));
      // The field empties only by closing: answer without it, then put it back.
      setTimeout(() => liveView.update(v, { palette: "conversation", id: viewId }).catch(() => {}), REOPEN_MS);
      const { input: _, ...closed } = v;
      return { view: closed };
    }
    case "older": {
      if (!o.next) return { keep: true };
      try { await load(o, true); } catch (e) { return failed("fetch older messages", e); }
      return redraw();
    }
    case "ask-summary": case "ask-draft": {
      try { o.ai = await api.askAI(id, action === "ask-summary" ? "summary" : "draft"); } catch (e) { return failed(action === "ask-summary" ? "summarize it" : "suggest a reply", problemOf(e)); }
      if (action === "ask-draft") { o.wantDraft = true; o.fill = undefined; if (o.ai.draft?.state === "ready" && o.ai.draft.text && !o.ai.draft.stale) { o.fill = o.ai.draft.text; o.wantDraft = false; } }
      o.rounds = 0; poll(o);
      return redraw();
    }
    case "prev-message": case "next-message": o.cursor = at(action === "prev-message" ? -1 : 1)?.id; return redraw();
    case "reply-to": o.replyTo = target(); o.cursor = o.replyTo?.id; return redraw();
    case "cancel-reply": o.replyTo = undefined; return redraw();
    case "react": {
      const m = target();
      if (!m) return { keep: true };
      o.reacting = m.id;
      const mine = m.reactions.find((r) => r.fromMe)?.emoji;
      return { form: { id: viewId, title: `React to ${m.fromMe ? "your message" : m.sender.name || "it"}`, fields: [{ kind: "select", id: "emoji", label: "Reaction", default: mine ?? REACTIONS[0], description: truncate(line(m), 80), options: [...REACTIONS.map((e) => ({ id: e, title: e })), ...(mine ? [{ id: "", title: "Take mine back" }] : [])] }], submit: { id: "react-send", title: "React" } } };
    }
    case "react-send": {
      const m = o.messages.find((x) => x.id === o.reacting);
      if (!m) return { keep: true };
      const emoji = String(ctx?.values?.emoji ?? ""), mine = m.reactions.find((r) => r.fromMe)?.emoji;
      try { if (emoji) await api.react(m.id, emoji); else if (mine) await api.unreact(m.id, mine); } catch (e) { return failed("react", problemOf(e)); }
      try { await load(o); } catch { /* the stream brings it */ }
      redrawOpen(id).catch(() => {});
      return toast(emoji ? `Reacted ${emoji}` : "Reaction taken back", truncate(line(m), 60));
    }
    case "web": return { open: webUrl(id) };
    case "copy-last": {
      const m = [...o.messages].reverse().find((x) => !x.deleted);
      return m ? { copy: m.text || line(m) } : toast("No message to copy", undefined, "failure");
    }
  }
  const r = await writeAll([id], action);
  if (r.toast) return r;
  if (action === "unread") o.readSent = true;
  try { await load(o); } catch { /* keep what is shown */ }
  return { ...(await redraw()), ...(r.hud && { hud: r.hud }) };
}

// ---- live: the stream redraws the bar and the open conversations --------------------------------------------

let hooked = false, busy = false, again = false;
const touched = new Set<number>();

/** What the stream said moved, fetched again: the bar, and the open conversations it named. Events during a round make one more round. */
async function follow() {
  if (busy) { again = true; return; }
  busy = true;
  try {
    do {
      again = false;
      drop();
      const ids = [...touched];
      touched.clear();
      bar.update(ITEM, await renderBar(), EXT).catch(() => {});
      for (const id of ids) { const o = opened.get(id); if (o) { o.readSent = false; await redrawOpen(id, true); } }
    } while (again);
  } finally { busy = false; }
}

function hook() {
  if (hooked) return;
  hooked = true;
  live.listen((ev) => {
    if (ev.type === "message.new" || ev.type === "todo.due") touched.add(ev.data.conversationId);
    follow().catch((e) => log(`follow: ${errorMessage(e)}`));
  });
  liveView.onHidden((ev) => {
    if (ev.palette !== "conversation" || !ev.id || liveView.open().some((o) => o.id === ev.id)) return;
    clearTimeout(opened.get(Number(ev.id))?.poll);
    opened.delete(Number(ev.id));
  }, EXT);
}

// ---- the bar item ----------------------------------------------------------------------------------------------

type BarSettings = { split?: Split; uncounted?: boolean; color?: boolean };
let barConf: BarSettings = {};
let tab = "all", cursor: number | undefined, replying: number | undefined, draft: string | undefined;
let last: { rows: Conversation[]; counts?: Counts; accs: Account[]; problem?: string } = { rows: [], accs: [] };

async function popRows(cs: Conversation[]): Promise<PopRow[]> {
  return Promise.all(cs.map(async (c): Promise<PopRow> => {
    const n = net(c.channel);
    return {
      id: c.id, title: c.title, line: lastLine(c), time: short(c.lastMessageAt), n: c.unread, forMe: forMe(c), channel: c.channel, glyph: n.glyph, color: n.color,
      section: sectionOf(c), group: isGroup(c), avatar: await picture(c.avatar),
      ...(isTodo(c) && !c.unread && { todo: c.triage.state === "waiting" ? "waiting" : "to do" }),
    };
  }));
}

async function popState(): Promise<PopState> {
  const rows = await popRows(last.rows);
  const t = tabs(last.rows, last.counts);
  if (tab !== "all" && !t.some((x) => x.id === tab)) tab = "all";
  if (replying && !rows.some((r) => r.id === replying)) { replying = undefined; draft = undefined; }
  const later = (await list("todo").catch(() => [] as Conversation[])).filter((c) => !isDue(c)).length;
  const st: PopState = { rows, tabs: t, tab, cursor, replying, draft, later, problem: last.problem, trouble: last.accs.filter((a) => !healthy(a)).map((a) => ({ id: a.id, label: a.label, glyph: net(a.channel).glyph, state: a.state, detail: a.detail })) };
  cursor = current(st)?.id;
  return { ...st, cursor };
}

async function fetchBar(refresh: boolean) {
  try {
    const [c, rows, accs] = await Promise.all([counts(refresh), list("inbox", refresh), accounts(refresh)]);
    last = { rows, counts: c, accs };
  } catch (e) {
    last = { ...last, problem: problemOf(e) };
    if (e instanceof NotSetUp) last = { rows: [], accs: [], problem: e.message };
    throw e;
  }
}

/** The facts the manifest's rules and anyone's states read: `wisp/unread`, `wisp/for_me`, `wisp/todo`, `wisp/now`, `wisp/trouble`. */
function facts(): Record<string, number> {
  const c = last.counts;
  return {
    unread: c?.unread ?? 0,
    for_me: c?.forMe ?? last.rows.filter(forMe).length,
    todo: last.rows.filter((r) => isDue(r)).length,
    now: c?.now ?? 0,
    trouble: last.accs.filter((a) => !healthy(a)).length,
  };
}

export function strip(c: Counts | undefined, rows: Conversation[], s: BarSettings): Pick<BarItem, "segments" | "tooltip"> {
  if (!c) return {};
  const gs = groups(c, s.split ?? "network", !!s.uncounted).filter((g) => g.unread > 0);
  const due = rows.filter((r) => isDue(r)).length, mine = c.forMe ?? 0;
  const segments: NonNullable<BarItem["segments"]> = [];
  if (mine) segments.push({ id: "for_me", icon: GLYPH.at, text: String(mine), color: "red", tooltip: `${plural(mine, "conversation")} with something meant for you` });
  segments.push(...gs.slice(0, 8 - segments.length - (due ? 1 : 0)).map((g) => ({
    id: g.id, icon: s.split === "total" ? undefined : g.glyph, text: String(g.unread), ...(s.color !== false && s.split !== "total" && { color: g.color }), tooltip: `${g.title}: ${g.unread} unread`,
  })));
  if (due) segments.push({ id: "todo", icon: GLYPH.todo, text: String(due), color: "amber", tooltip: `${plural(due, "To do")} due` });
  const lead = rows.filter((r) => r.unread).slice(0, 3).map((r) => `${r.title}: ${truncate(lastLine(r), 60)}`);
  const words = [mine ? `${mine} for you` : "", gs.map((g) => `${g.title} ${g.unread}`).join(", "), due ? `${plural(due, "To do")} due` : ""].filter(Boolean);
  return { segments, tooltip: [words.join(" · ") || "Nothing unread", ...lead].join("\n") };
}

async function renderBar(ctx?: BarCtx): Promise<BarItem> {
  hook();
  if (ctx?.settings) barConf = ctx.settings as BarSettings;
  if (ctx?.reason === "wake" || ctx?.reason === "network") live.restart();
  live.start();
  try { await fetchBar(ctx?.reason === "every" || ctx?.reason === "wake" || ctx?.reason === "update" || ctx?.reason === "cli"); } catch (e) {
    if (e instanceof NotSetUp) return { hidden: true, states: { unread: null, for_me: null, todo: null, now: null, trouble: null } };
  }
  const states = facts();
  for (const [k, v] of Object.entries(states)) state.set(k, v, EXT).catch(() => {});
  const menu = { view: renderPopover(await popState()) };
  const empty = { icon: GLYPH.wisp, tooltip: last.problem ?? "Nothing unread", menu };
  if (last.problem && !last.counts) return { icon: GLYPH.wisp, stale: true, tooltip: last.problem, menu, empty, states };
  // The networks' glyphs say what the Wisp glyph would: it leads only one count, or a strip with nothing to count.
  const s = strip(last.counts, last.rows, barConf);
  const glyphs = (barConf.split ?? "network") !== "total" && !!s.segments?.length;
  return { ...(!glyphs && { icon: GLYPH.wisp }), ...s, ...(last.problem && { stale: true }), menu, empty, states };
}

const redrawPop = async (): Promise<Effect> => ({ view: renderPopover(await popState()) });

async function popAction(action: string, ctx?: BarCtx): Promise<Effect> {
  if (ctx?.settings) barConf = ctx.settings as BarSettings;
  if (action === "pal") return { push: { extension: EXT, palette: "inbox" } };
  if (action.startsWith("at:")) { cursor = Number(action.slice(3)); return redrawPop(); }
  if (action.startsWith("tab:")) { tab = action.slice(4); cursor = undefined; return redrawPop(); }
  if (action.startsWith("account:")) return { open: accountUrl(Number(action.slice(8))) };
  if (action.startsWith("segment:")) { const id = action.slice(8); tab = id === "todo" || id === "all" ? "all" : id.startsWith("a") ? last.rows.find((r) => `a${r.accountId}` === id)?.channel ?? "all" : id; cursor = undefined; return redrawPop(); }
  const st = await popState();
  const v = visible(st), cur = current(st);
  switch (action) {
    case "down": case "up": {
      if (!v.length) return redrawPop();
      const i = Math.max(0, v.findIndex((r) => r.id === cur?.id));
      cursor = v[(i + (action === "down" ? 1 : v.length - 1)) % v.length].id;
      return redrawPop();
    }
    case "next-tab": case "prev-tab": {
      const ids = ["all", ...st.tabs.map((t) => t.id)];
      tab = ids[(ids.indexOf(tab) + (action === "next-tab" ? 1 : ids.length - 1)) % ids.length];
      cursor = undefined;
      return redrawPop();
    }
    case "web": return { open: ctx?.ids?.length ? ctx.ids.map((x) => webUrl(Number(x))) : cur ? webUrl(cur.id) : webUrl() };
  }
  if (!cur) return { keep: true };
  switch (action) {
    case "open": return pushConversation(cur);
    case "preview": return preview(await pane(cur.id).catch((e) => ({ markdown: `_${problemOf(e)}_` })), cur.title, popActions(st), ["open", "reply", cur.n ? "read" : "unread", "todo", "archive", "web"]);
    case "reply": replying = cur.id; draft = ""; return redrawPop();
    case "cancel": replying = undefined; draft = undefined; return redrawPop();
    case "send": {
      const text = String(ctx?.values?.input ?? "").trim();
      const to = replying;
      if (!to) return redrawPop();
      if (!text) return { ...(await redrawPop()), toast: { title: "Nothing to send", message: "Type the message first", style: "failure" } };
      try { await api.send(to, text); } catch (e) { draft = text; return { ...(await redrawPop()), toast: { title: "Could not send", message: problemOf(e), style: "failure" } }; }
      replying = undefined; draft = undefined;
      drop();
      await fetchBar(true).catch(() => {});
      return { ...(await redrawPop()), toast: { title: "Sent", message: `${cur.title}: ${truncate(text, 60)}`, style: "success" } };
    }
  }
  const ids = ctx?.ids?.length ? ctx.ids.map(Number) : [cur.id];
  const i = v.findIndex((r) => r.id === cur.id);
  const r = await writeAll(ids, action);
  if (r.toast) return r;
  await fetchBar(true).catch(() => {});
  // The cursor stays at its index: the next conversation slides under it.
  const next = visible(await popState());
  cursor = next.find((x) => x.id === cur.id)?.id ?? next[Math.min(i, next.length - 1)]?.id;
  return { keep: true, view: renderPopover(await popState()), hud: r.hud };
}

// ---- links ------------------------------------------------------------------------------------------------------

async function findConversation(what: string): Promise<Conversation> {
  const s = what.trim();
  if (!s) throw new Error("conversation is required");
  if (/^\d+$/.test(s)) return one(Number(s));
  const lower = s.toLowerCase();
  for (const v of ["inbox", "all"] as const) {
    const cs = await list(v);
    const c = cs.find((x) => x.title.toLowerCase() === lower) ?? cs.find((x) => x.title.toLowerCase().includes(lower));
    if (c) return c;
  }
  throw new Error(`no conversation "${s}"`);
}

async function link(route: string, params: LinkParams): Promise<Effect | void> {
  switch (route) {
    case "open": return params.conversation ? pushConversation(await findConversation(String(params.conversation))) : { push: { extension: EXT, palette: "inbox" } };
    case "search": return { push: { extension: EXT, palette: "search", query: String(params.q ?? "") } };
    case "new": return { push: { extension: EXT, palette: "new", query: String(params.to ?? "") } };
    case "send": {
      const c = await findConversation(String(params.conversation ?? ""));
      const text = String(params.text ?? "").trim();
      if (!text) throw new Error("text is required");
      await api.send(c.id, text);
      changed();
      return { hud: `Sent to ${truncate(c.title, 40)}` };
    }
  }
}

export default {
  link,
  palettes: {
    inbox: {
      title: "Inbox",
      live: true,
      lazy: true,
      multi: true,
      placeholder: "Find a conversation by name, network or account",
      filters: VIEWS.map((v) => ({ id: v.id, title: v.title })),
      list: (_q, ctx) => guard(() => inboxRows(ctx)),
      pick: (id, action, ctx) => (id.startsWith("hint:") ? pickHint(id) : pickConversation(Number(id), action, ctx)),
      detail: async (id) => { if (id.startsWith("hint:")) return; try { return await pane(Number(id)); } catch (e) { return { markdown: `_${problemOf(e)}_` }; } },
    },
    conversations: {
      title: "Conversations",
      live: true,
      lazy: true,
      multi: true,
      placeholder: "Any conversation by name, network or account",
      list: (_q, ctx) => guard(() => conversationRows(ctx)),
      pick: (id, action, ctx) => (id.startsWith("hint:") ? pickHint(id) : pickConversation(Number(id), action, ctx)),
      detail: async (id) => { if (id.startsWith("hint:")) return; try { return await pane(Number(id)); } catch (e) { return { markdown: `_${problemOf(e)}_` }; } },
    },
    new: {
      title: "New Message",
      input: true,
      placeholder: "A person's name, a number or an address",
      list: (q, ctx) => guard(() => peopleRows(q, ctx)),
      pick: (id, action, ctx) => (id.startsWith("hint:") ? pickHint(id) : pickPerson(id, action, ctx)),
    },
    conversation: {
      title: "Conversation",
      view: (ctx) => conversationView(ctx),
      pick: (id, action, ctx) => conversationPick(id, action ?? "send", ctx),
    },
    search: {
      title: "Search Wisp",
      input: true,
      multi: true,
      placeholder: "Words, from:, in:, is:unread, after:7d",
      list: (q, ctx) => guard(() => searchRows(q, ctx)),
      pick: (id, action, ctx) => (id.startsWith("hint:") ? pickHint(id) : pickHit(id, action, ctx)),
      detail: async (id) => { const h = hits.get(id); if (!h) return; try { return await pane(h.conversationId); } catch (e) { return { markdown: `_${problemOf(e)}_` }; } },
    },
    accounts: {
      title: "Wisp Accounts",
      lazy: true,
      placeholder: "An account",
      list: (_q, ctx) => guard(() => accountRows(ctx)),
      pick: (id, action) => (id.startsWith("hint:") ? pickHint(id) : { open: action === "inbox" ? `${api.base()}/inbox?account=${id}` : accountUrl(Number(id)) }),
    },
  },
  bar: {
    [ITEM]: { render: renderBar, onAction: (action, ctx) => popAction(action, ctx) },
  },
  dispose: () => { live.stop(); },
} satisfies Extension;
