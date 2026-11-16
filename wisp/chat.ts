// A conversation as a view (`View` in `@zcag/pal`), pure over what Wisp
// gave: a header (the picture, the title, the network and account, the To
// do and unread as badges), then the messages oldest to newest under a
// line per day, theirs on the left and yours on the right, runs by one
// sender folded under one name (a group names each sender), a photo drawn
// inline, other attachments as badges, reactions under the text, a mail's
// subject over its body. The search row is the message field the whole
// time (where the account lets you send), so typing and Enter sends; the
// other keys are modifier combos for that reason. Wisp's summary leads,
// a card under the header; a suggested reply fills the field; a voice
// message shows its transcript. `cmd+up` and `cmd+down` walk a cursor over
// the messages (`selected`) for `cmd+r`, a reply to that message, and
// `cmd+shift+e`, a reaction. The tree is cut at a node budget from the
// newest message back.
import { column, dayName, keyHint, row, text, truncate, type Action, type TagColor, type View, type ViewNode } from "@zcag/pal";
import type { AI, Conversation, Message } from "./api.ts";
import { GLYPH, LABEL, isTodo, line, short, until } from "./data.ts";
import { avatarColor, initial } from "./view.ts";

export type ChatState = {
  c: Conversation;
  /** The account's label, the network's name, glyph and colour. */
  account: string;
  network: { name: string; glyph: string; color: TagColor };
  messages: Message[];
  /** Photos fetched for the view, by attachment id. */
  images: Record<number, string>;
  /** The picture of the conversation, and of each sender by their `avatar` path. */
  avatar?: string;
  senders: Record<string, string>;
  /** Wisp has older messages (`cmd+[`). */
  more: boolean;
  /** The account lets you send from here. */
  canSend: boolean;
  /** The network keeps an unread mark (Gmail, WhatsApp, Telegram). */
  canUnread: boolean;
  now: number;
  compact?: boolean;
  problem?: string;
  /** Wisp's summary and suggested reply for it, when Wisp has a model. */
  ai?: AI;
  /** The message the cursor is on, by id. */
  cursor?: number;
  /** The message the next send replies to. */
  replyTo?: Message;
  /** What the field holds: a suggested reply put there. */
  fill?: string;
};

const pending = (r?: { state: string }) => r?.state === "queued" || r?.state === "running";
const AUDIO = new Set(["voice", "audio"]);
/** A voice or audio message without its words yet: a click on it asks for them. */
const untranscribed = (m: Message) => !m.transcript && m.attachments.some((a) => AUDIO.has(a.kind));
const who = (m: Message) => (m.fromMe ? "You" : m.sender.name || "Them");

/** Of the host's 2000 nodes per tree, what the messages may use. */
export const BUDGET = 1500;
const MAIL = new Set(["gmail", "imap"]);
/** A message body is cut here in the view; the whole of it is in Wisp. */
const MAX_TEXT = 1800;

const count = (n: ViewNode): number => 1 + ("children" in n && n.children ? n.children.reduce((a, c) => a + count(c), 0) : 0);
const paragraphs = (t: string) => t.trim().split(/\n{2,}/).map((p) => p.replace(/[ \t]*\n[ \t]*/g, " ").trim()).filter(Boolean);

function face(src: string | undefined, name: string, size: number, key: string): ViewNode {
  if (src) return { type: "image", key, src, width: size, height: size, mask: "circle", alt: name };
  return { type: "tile", key, width: size, height: size, text: initial(name), color: avatarColor(name), fill: "solid" };
}

function header(st: ChatState): ViewNode[] {
  const c = st.c;
  const badges: ViewNode[] = [];
  if (isTodo(c)) badges.push({ type: "badge", key: "todo", text: c.triage.state === "waiting" ? `Waiting${c.triage.until ? ` · ${until(c.triage.until, st.now)}` : ""}` : c.triage.until && Date.parse(c.triage.until) > st.now ? `To do · ${until(c.triage.until, st.now)}` : "To do", color: "amber" });
  if (c.triage.state === "done") badges.push({ type: "badge", key: "done", text: "Done", color: "grey" });
  if (c.unread) badges.push({ type: "badge", key: "unread", text: `${c.unread} unread`, color: st.network.color });
  if (c.screener) badges.push({ type: "badge", key: "screener", text: "In the Screener", color: "violet" });
  const meta = [st.network.name, st.account !== st.network.name ? st.account : undefined, c.kind === "direct" ? undefined : c.kind].filter(Boolean).join(" · ");
  return [
    row([
      face(st.avatar, c.title, 32, "face"),
      column([
        text(c.title, { style: "title", size: "md", minWidth: 0 }),
        row([text(st.network.glyph, { style: "glyph", size: "xs", color: st.network.color }), text(meta, { size: "xs", color: "muted" })], { key: "meta", gap: 1 }),
      ], { key: "t", gap: 0, grow: true }),
      ...(badges.length ? [row(badges, { key: "badges", gap: 1 })] : []),
    ], { key: "head", gap: 2, minHeight: 36 }),
    { type: "divider", key: "rule-top" },
  ];
}

function summaryNode(st: ChatState): ViewNode[] {
  const x = st.ai?.summary;
  if (!x) return [];
  if (!x.text) return [text(pending(x) ? "Summarizing…" : `No summary: ${x.error || x.state}`, { key: "summary", size: "xs", color: "faint" })];
  return [row([
    text(GLYPH.summary, { style: "glyph", size: "md", color: "accent", width: 20, align: "center" }),
    column([
      text(pending(x) ? "Summary · a newer one is on its way" : x.stale ? "Summary · newer messages came after it" : "Summary", { key: "h", size: "xs", weight: "semibold", color: "muted" }),
      ...paragraphs(x.text).slice(0, 6).map((t, j) => text(t, { key: `s${j}`, size: "sm" })),
    ], { key: "c", gap: 1, grow: true }),
  ], { key: "summary", surface: "elevated", radius: true, padding: 2, gap: 2, align: "start", transition: { enter: "fade", exit: "fade" } })];
}

function attachments(m: Message, st: ChatState): ViewNode[] {
  return m.attachments.map((a): ViewNode => {
    const img = st.images[a.id];
    if (img) return { type: "image", key: `a${a.id}`, src: img, width: st.compact ? 220 : 280, height: st.compact ? 165 : 210, mask: "rounded", alt: a.filename ?? "Photo", action: `attachment:${a.id}` };
    const glyph = a.kind === "image" || a.kind === "video" || a.kind === "sticker" ? GLYPH.image : a.kind === "voice" || a.kind === "audio" ? GLYPH.voice : GLYPH.file;
    const ask = AUDIO.has(a.kind) && !m.transcript;
    return row([text(glyph, { style: "glyph", size: "sm", color: "muted" }), text(a.filename ? truncate(a.filename, 40) : LABEL[a.kind] ?? "File", { size: "xs" }), ...(ask ? [text("· click for its words", { key: "ask", size: "xs", color: "faint" })] : [])], { key: `a${a.id}`, gap: 1, padding: 1, radius: true, surface: "sunken", action: ask ? `transcribe:${m.id}` : `attachment:${a.id}` });
  });
}

/** One message: its subject (mail), its text in paragraphs, the attachments, the reactions, the time and its state. */
function bubble(m: Message, st: ChatState, showName: boolean): ViewNode {
  const mail = MAIL.has(st.c.channel);
  const body = m.deleted ? [text("Deleted", { key: "del", size: "sm", color: "faint" })] : paragraphs((m.text ?? "").slice(0, MAX_TEXT) + ((m.text ?? "").length > MAX_TEXT ? "…" : "")).slice(0, 12).map((p, j) => text(p, { key: `p${j}`, size: "sm" }));
  const foot = [short(m.sentAt, st.now), m.edited ? "edited" : "", m.fromMe && m.status && m.status !== "sent" && m.status !== "delivered" && m.status !== "read" ? m.status : ""].filter(Boolean).join(" · ");
  return column([
    ...(showName && !m.fromMe ? [text(m.sender.name || "Them", { key: "who", size: "xs", weight: "semibold", color: avatarTag(m.sender.name) })] : []),
    ...(m.subject && mail ? [text(m.subject, { key: "subj", size: "sm", weight: "semibold" })] : []),
    ...body,
    ...attachments(m, st),
    ...(m.transcript ? [text(`“${m.transcript.trim().slice(0, MAX_TEXT)}”`, { key: "tr", size: "sm", color: "muted" })] : []),
    ...(m.reactions.length ? [text(m.reactions.map((r) => r.emoji).join(" "), { key: "re", size: "sm" })] : []),
    text(foot, { key: "foot", size: "xs", color: "faint", align: m.fromMe ? "end" : "start" }),
  ], { key: "b", gap: 1, padding: 2, radius: true, align: "start", surface: m.fromMe ? "elevated" : "sunken" });
}

const TAGS: TagColor[] = ["blue", "green", "amber", "violet", "pink", "teal", "red"];
function avatarTag(name: string): TagColor { let h = 5381; for (const ch of name) h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0; return TAGS[h % TAGS.length]; }

function messageNode(m: Message, prev: Message | undefined, st: ChatState): ViewNode {
  const group = st.c.kind !== "direct";
  const first = !prev || prev.fromMe !== m.fromMe || prev.sender.id !== m.sender.id || Date.parse(m.sentAt) - Date.parse(prev.sentAt) > 15 * 60_000;
  const gutter = st.compact ? 28 : 64;
  const on = st.cursor === m.id || undefined;
  if (m.fromMe) return row([{ type: "spacer", key: "l", size: gutter }, bubble(m, st, false)], { key: `m${m.id}`, gap: 2, align: "start", justify: "end", selected: on, transition: { enter: "fade" } });
  const pic = group ? [first ? face(st.senders[m.sender.avatar ?? ""], m.sender.name || "?", 24, "who") : { type: "spacer", key: "who", size: 24 } as ViewNode] : [];
  return row([...pic, bubble(m, st, group && first), { type: "spacer", key: "r", size: gutter }], { key: `m${m.id}`, gap: 2, align: "start", selected: on, transition: { enter: "fade" } });
}

function dayLine(t: string, ref: number): string {
  const d = new Date(t), r = new Date(ref);
  if (d.toDateString() === r.toDateString()) return "Today";
  if (d.toDateString() === new Date(ref - 86_400_000).toDateString()) return "Yesterday";
  return dayName(d);
}

function replyingNode(st: ChatState): ViewNode[] {
  const out: ViewNode[] = [];
  if (pending(st.ai?.draft)) out.push(text("Writing a suggested reply…", { key: "drafting", size: "xs", color: "faint" }));
  const m = st.replyTo;
  if (m) out.push(row([
    text(GLYPH.reply, { style: "glyph", size: "sm", color: "accent", width: 16, align: "center" }),
    text(`Replying to ${who(m)}: ${truncate(line(m), 80)}`, { key: "to", size: "xs", minWidth: 0 }),
    ...keyHint("cmd+backspace", "cancel"),
  ], { key: "replying", gap: 1, minHeight: 22 }));
  return out;
}

export function hints(st: ChatState): ViewNode {
  const kids: ViewNode[] = st.canSend ? [...keyHint("enter", "send")] : [text("Sending is off for this account in Wisp", { key: "off", size: "xs", color: "muted" })];
  kids.push(...keyHint("cmd+t", isTodo(st.c) ? "clear to do" : "to do"), ...keyHint("cmd+e", "done"));
  if (st.canUnread) kids.push(...keyHint("cmd+u", st.c.unread ? "read" : "unread"));
  kids.push(...keyHint("cmd+o", "Wisp"));
  return row(kids, { key: "hints", gap: 1, minHeight: 22 });
}

export function actions(st: ChatState): Action[] {
  const c = st.c, todo = isTodo(c);
  return [
    ...(st.canSend ? [{ id: "send", title: "Send" }] : []),
    { id: todo ? "clear-todo" : "todo", title: todo ? "Clear the To do" : "To do", shortcut: "cmd+t" },
    { id: "later", title: "To do tomorrow morning", shortcut: "cmd+shift+t" },
    { id: "waiting", title: "Waiting on them (a To do again in 3 days)", shortcut: "cmd+shift+w" },
    { id: "archive", title: "Done (archive)", shortcut: "cmd+e" },
    ...(st.canUnread || c.unread ? [{ id: c.unread ? "read" : "unread", title: c.unread ? "Mark read" : "Mark unread", shortcut: "cmd+u" }] : []),
    { id: "web", title: "Open in Wisp", shortcut: "cmd+o" },
    { id: "copy-last", title: "Copy the last message", shortcut: "cmd+shift+c" },
    ...(st.more ? [{ id: "older", title: "Older messages", shortcut: "cmd+[" }] : []),
    ...(st.ai?.available ? [
      { id: "ask-summary", title: st.ai.summary?.text ? "Summarize again" : "Summarize", shortcut: "cmd+shift+s" },
      ...(st.canSend ? [{ id: "ask-draft", title: "Suggest a reply", shortcut: "cmd+shift+d" }] : []),
    ] : []),
    ...(st.messages.length ? [
      { id: "prev-message", title: "Previous message", shortcut: "cmd+up" },
      { id: "next-message", title: "Next message", shortcut: "cmd+down" },
      ...(st.canSend ? [{ id: "reply-to", title: "Reply to this message", shortcut: "cmd+r" }] : []),
      { id: "react", title: "React to this message", shortcut: "cmd+shift+e" },
    ] : []),
    ...(st.replyTo ? [{ id: "cancel-reply", title: "Stop replying to it", shortcut: "cmd+backspace" }] : []),
    ...st.messages.flatMap((m) => m.attachments.filter((a) => m.transcript || !AUDIO.has(a.kind)).map((a) => ({ id: `attachment:${a.id}`, title: `Open ${a.filename ?? LABEL[a.kind] ?? "the file"}`, hidden: true as const }))),
    ...st.messages.filter(untranscribed).map((m) => ({ id: `transcribe:${m.id}`, title: "Transcribe the voice message", hidden: true as const })),
  ];
}

export function render(st: ChatState): View {
  const head = header(st);
  const body: ViewNode[] = [];
  let used = 0, cut = 0;
  for (let i = st.messages.length - 1; i >= 0; i--) {
    const m = st.messages[i], prev = st.messages[i - 1];
    const nodes: ViewNode[] = [messageNode(m, prev, st)];
    if (!prev || new Date(prev.sentAt).toDateString() !== new Date(m.sentAt).toDateString()) nodes.unshift(text(dayLine(m.sentAt, st.now), { key: `d${m.id}`, size: "xs", color: "faint", align: "center" }));
    const n = nodes.reduce((a, x) => a + count(x), 0);
    if (used + n > BUDGET) { cut = i + 1; break; }
    used += n;
    body.unshift(...nodes);
  }
  const kids: ViewNode[] = [...head, ...summaryNode(st)];
  if (cut || st.more) kids.push(text(cut ? `${cut} earlier messages are not drawn; Wisp has them all (cmd+o)` : "Older messages: cmd+[", { key: "earlier", size: "xs", color: "faint", align: "center" }));
  if (st.problem) kids.push(text(st.problem, { key: "problem", size: "sm", color: "destructive" }));
  else if (!body.length) kids.push(text("No messages yet", { key: "none", style: "muted", size: "sm", align: "center" }));
  kids.push(...body, { type: "divider", key: "rule" }, ...replyingNode(st), hints(st));
  return {
    tree: column(kids, { key: "chat", padding: 3, gap: 2 }),
    actions: actions(st),
    title: truncate(st.c.title, 48),
    id: String(st.c.id),
    follow: true,
    keys: "actions",
    ...(st.canSend && { input: {
      ...(st.fill !== undefined && { value: st.fill }),
      placeholder: st.replyTo ? `Reply to ${who(st.replyTo)}` : MAIL.has(st.c.channel) ? `Reply to ${truncate(st.c.title, 40)}` : `Message ${truncate(st.c.title, 40)}`,
      submit: "send",
      ...(st.replyTo && { cancel: "cancel-reply" }),
    } }),
  };
}

