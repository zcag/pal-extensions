// What the palettes, the bar and the conversation view share: each
// network's name, glyph and colour, the lists fetched from Wisp kept a few
// seconds (the panel showing asks the bar and every palette at once) and
// dropped whenever the event stream says something moved, the groups the
// strip counts by, and the formatting of times and lines.
import { clock, dayName, mdEscape, now, oneLine, type TagColor, type TileColorName } from "@zcag/pal";
import * as api from "./api.ts";
import type { Account, AccountCounts, Badge, Channel, Conversation, Counts, Message, Split, View } from "./api.ts";

/** Glyphs from the bundled Nerd Font's `md-` set. */
export const GLYPH = {
  wisp: "\u{f0687}", whatsapp: "\u{f05a3}", gmail: "\u{f02ab}", imap: "\u{f01ee}", slack: "\u{f04b1}", telegram: "\u{f2c6}",
  sms: "\u{f0369}", instagram: "\u{f02fe}", linkedin: "\u{f033b}", x: "\u{f0544}", phone: "\u{f011c}", other: "\u{f0361}",
  todo: "\u{f014e}", waiting: "\u{f0b56}", at: "\u{f0065}", search: "\u{f0349}", alert: "\u{f0028}", read: "\u{f012d}", unread: "\u{f0b92}",
  archive: "\u{f003c}", reply: "\u{f045a}", web: "\u{f03cc}", copy: "\u{f018f}", image: "\u{f02e9}", file: "\u{f0219}", voice: "\u{f036c}", clip: "\u{f03e2}",
  group: "\u{f000e}", screener: "\u{f0b59}", github: "\u{f02a4}", summary: "\u{f0ea6}", person: "\u{f0004}", compose: "\u{f0653}",
} as const;

type Net = { name: string; glyph: string; color: TagColor; tile: TileColorName };
const NETS: Record<string, Net> = {
  whatsapp: { name: "WhatsApp", glyph: GLYPH.whatsapp, color: "green", tile: "green" },
  gmail: { name: "Gmail", glyph: GLYPH.gmail, color: "red", tile: "red" },
  imap: { name: "Mail", glyph: GLYPH.imap, color: "blue", tile: "blue" },
  slack: { name: "Slack", glyph: GLYPH.slack, color: "violet", tile: "violet" },
  telegram: { name: "Telegram", glyph: GLYPH.telegram, color: "blue", tile: "cyan" },
  sms: { name: "SMS", glyph: GLYPH.sms, color: "teal", tile: "teal" },
  instagram: { name: "Instagram", glyph: GLYPH.instagram, color: "pink", tile: "pink" },
  linkedin: { name: "LinkedIn", glyph: GLYPH.linkedin, color: "blue", tile: "blue" },
  x: { name: "X", glyph: GLYPH.x, color: "grey", tile: "ink" },
  phone: { name: "Phone", glyph: GLYPH.phone, color: "amber", tile: "amber" },
  github: { name: "GitHub", glyph: GLYPH.github, color: "grey", tile: "ink" },
};
// ---- the networks, as the server describes them --------------------------------------------
// Names, brand colours and logos come from Wisp (`/api/v1/networks`), so a
// connector it gains needs nothing here; NETS above stays as the font glyph
// and tag colour each network falls back to.

const NETWORKS_MS = 3_600_000;
let known = new Map<string, api.Network>(), knownAt = 0;

/** The server's networks, fetched at most hourly; a failure keeps what was there. */
export async function loadNetworks(refresh = false) {
  if (!refresh && known.size && now() - knownAt < NETWORKS_MS) return;
  try { known = new Map((await api.networks()).map((n) => [n.channel, n])); knownAt = now(); } catch { /* the glyphs stand in */ }
}
export const forgetNetworks = () => { known = new Map(); knownAt = 0; };

/**
 * An SVG in `currentColor` as a picture (`{ image }`, a data url): in
 * `color`, or `mono`, a template the bar inks (and so does a near-black
 * colour, which would vanish on a dark bar).
 */
export function inked(svg: string, color: string | undefined, mono = false): Picture {
  const template = mono || dark(color);
  return picture(svg.replaceAll("currentColor", template ? "#000000" : hex(color)), template);
}

type Picture = { image: string; template?: true };
const hex = (color: string | undefined) => (/^#[0-9a-f]{6}$/i.test(color ?? "") ? color! : "#000000");
const dark = (color: string | undefined) => { const h = hex(color); const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return 0.2126 * r + 0.7152 * g + 0.0722 * b < 48; };
const picture = (svg: string, template: boolean): Picture => ({ image: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, ...(template && { template: true as const }) });

/** The server's mark for a network; `solid` leaves out a line drawing, which beside filled marks reads as another set (the caller's glyph stands in for it). */
function mark(c: Channel, solid: boolean): api.Network | undefined {
  const n = known.get(c);
  return n?.logo && !(solid && n.logo.includes('stroke="currentColor"')) ? n : undefined;
}

/** A network's logo from the server's mark (`inked`); none while the server has not said, or for a network without a mark. */
export function logo(c: Channel, mono = false, solid = false): Picture | undefined {
  const n = mark(c, solid);
  return n && inked(n.logo!, n.color, mono);
}

/** A person's badge in its colour (`inked`), or in the bar's ink with `mono`. */
export const badgeMark = (b: Badge, mono = false) => inked(b.svg, b.color, mono);

/** An SVG document placed in a box of another, at `x`,`y` and `size` across. */
const place = (svg: string, x: number, y: number, size: number) => svg.replace(/^<svg\b/, `<svg x="${x}" y="${y}" width="${size}" height="${size}"`);

/**
 * A network's logo with a person's badge on its corner, one square picture
 * (the bar draws each segment's picture square): the logo cut away around
 * the badge so the two read apart in one ink. Both in their colours, or
 * both a template when `mono` or either is too dark for a dark bar.
 */
export function logoWithBadge(c: Channel, b: Badge, mono = false, solid = false): Picture | undefined {
  const n = mark(c, solid);
  if (!n) return undefined;
  const template = mono || dark(n.color) || dark(b.color);
  const paint = (svg: string, color: string) => svg.replaceAll("currentColor", template ? "#000000" : hex(color));
  return picture(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><mask id="cut"><rect width="24" height="24" fill="#fff"/><circle cx="18" cy="18" r="7.5" fill="#000"/></mask></defs><g mask="url(#cut)">${place(paint(n.logo!, n.color ?? ""), 0, 0, 20)}</g>${place(paint(b.svg, b.color), 11, 11, 14)}</svg>`, template);
}

export function net(c: Channel): Net {
  const fallback = NETS[c] ?? { name: c ? c[0].toUpperCase() + c.slice(1) : "Other", glyph: GLYPH.other, color: "grey" as const, tile: "slate" as const };
  const name = known.get(c)?.name;
  return name ? { ...fallback, name } : fallback;
}

// ---- the lists, shared for FRESH_MS ---------------------------------------------------------

export const FRESH_MS = 4000;
type Kept<T> = { at: number; value?: T; pending?: Promise<T> };
const kept = new Map<string, Kept<unknown>>();

function cached<T>(key: string, fetch: () => Promise<T>, refresh = false, ttl = FRESH_MS): Promise<T> {
  const k = kept.get(key) as Kept<T> | undefined;
  if (k?.pending) return k.pending;
  if (!refresh && k?.value !== undefined && now() - k.at < ttl) return Promise.resolve(k.value);
  const pending = fetch().then((value) => { kept.set(key, { at: now(), value }); return value; }, (e) => { kept.delete(key); throw e; });
  kept.set(key, { at: k?.at ?? 0, value: k?.value, pending });
  return pending;
}

/** Everything fetched is stale: the stream said something moved, or a write here changed it. */
export const drop = () => kept.clear();

export const counts = (refresh = false) => cached<Counts>("counts", api.counts, refresh);
export const accounts = (refresh = false) => cached<Account[]>("accounts", api.accounts, refresh, 60_000);
export const list = (view: View, refresh = false, unread = false) => cached<Conversation[]>(`list:${view}${unread ? ":unread" : ""}`, async () => (await api.conversations(view, { unread })).conversations, refresh);
/** The inbox's first page with every unread conversation in it: one past the page (an old one, unread) is added at the end. */
export async function inbox(refresh = false): Promise<Conversation[]> {
  const [page, unread] = await Promise.all([list("inbox", refresh), list("inbox", refresh, true)]);
  const seen = new Set(page.map((c) => c.id));
  return [...page, ...unread.filter((c) => !seen.has(c.id))];
}

/** One conversation: from a list already at hand, else fetched. */
export async function one(id: number): Promise<Conversation> {
  for (const k of kept.values()) {
    const v = k.value;
    if (Array.isArray(v)) { const c = (v as Conversation[]).find((x) => x?.id === id && "triage" in x); if (c) return c; }
  }
  return api.conversation(id);
}

// ---- groups: what the strip counts by ---------------------------------------------------------

export type Group = { id: string; title: string; glyph: string; color: TagColor; unread: number; channel?: Channel; accounts: number[] };

/** The counted accounts' unread as groups: one per network, per account, or one in all. Accounts that do not count toward the total join only with `uncounted`. */
export function groups(c: Counts, split: Split, uncounted = false): Group[] {
  const accs = c.accounts.filter((a) => a.counted || uncounted);
  if (split === "total") return [{ id: "all", title: "Wisp", glyph: GLYPH.wisp, color: "teal", unread: uncounted ? accs.reduce((n, a) => n + a.unread, 0) : c.unread, accounts: accs.map((a) => a.id) }];
  const out = new Map<string, Group>();
  for (const a of accs) {
    const id = split === "account" ? `a${a.id}` : a.channel;
    const g = out.get(id) ?? { id, title: split === "account" ? a.label : net(a.channel).name, glyph: net(a.channel).glyph, color: net(a.channel).color, unread: 0, channel: a.channel, accounts: [] };
    g.unread += a.unread;
    g.accounts.push(a.id);
    out.set(id, g);
  }
  return [...out.values()];
}

/** The groups a conversation list can be filtered by in the popover: one per network the rows come from, in the counts' order. */
export function tabs(rows: Conversation[], c: Counts | undefined): { id: string; title: string; glyph: string; color: TagColor; n: number; logo?: string }[] {
  const order = [...new Set([...(c?.accounts ?? []).map((a) => a.channel), ...rows.map((r) => r.channel)])];
  return order.flatMap((ch) => {
    const of = rows.filter((r) => r.channel === ch);
    // A template logo (X's black) has no ink in a view: the glyph stands in.
    const l = logo(ch);
    return of.length ? [{ id: ch, title: net(ch).name, glyph: net(ch).glyph, color: net(ch).color, n: of.filter((r) => r.unread).length, ...(l && !l.template && { logo: l.image }) }] : [];
  });
}

export const accountOf = (c: Counts | undefined, id: number): AccountCounts | undefined => c?.accounts.find((a) => a.id === id);

// ---- states of a conversation ---------------------------------------------------------------

export const isTodo = (c: Conversation) => c.triage.state === "todo" || c.triage.state === "waiting";
/** A To do whose day has come (or with none): what the Inbox view lists among the unread. */
export const isDue = (c: Conversation, at = now()) => isTodo(c) && (!c.triage.until || Date.parse(c.triage.until) <= at);
export const forMe = (c: Conversation) => (c.forMe ?? 0) > 0;
export const isGroup = (c: Conversation) => c.kind !== "direct";

/** The section a conversation is listed under: a due To do first, then Wisp's splits. */
export const SPLITS: Record<string, string> = { people: "People", work: "Work", groups: "Groups", feed: "Feed", paper: "Paper" };
export const SECTION_ORDER = ["To do", "People", "Work", "Groups", "Feed", "Paper", "Other"];
export const sectionOf = (c: Conversation) => (isDue(c) && !c.unread ? "To do" : SPLITS[c.split ?? ""] ?? (isGroup(c) ? "Groups" : "Other"));

// ---- formatting ---------------------------------------------------------------------------------

const DAY_MS = 86_400_000;
/** A row's time: the clock today, the weekday this week, else the date. */
export function short(t: string | undefined, ref = now()): string {
  if (!t) return "";
  const d = new Date(t), r = new Date(ref);
  if (d.toDateString() === r.toDateString()) return clock(d);
  if (ref - d.getTime() < 6 * DAY_MS) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return dayName(d).split(" ").slice(1).join(" ");
}

/** When a dated To do comes back, in words. */
export function until(t: string | undefined, ref = now()): string {
  if (!t) return "";
  const d = new Date(t), r = new Date(ref);
  if (d.getTime() <= ref) return "due";
  if (d.toDateString() === r.toDateString()) return `today ${clock(d)}`;
  if (d.toDateString() === new Date(ref + DAY_MS).toDateString()) return `tomorrow ${clock(d)}`;
  return `${dayName(d)} ${clock(d)}`;
}

/** A message on one line: the media's label when there is no text, the subject of a mail before its text. */
export function line(m: Pick<Message, "text" | "subject" | "kind" | "attachments" | "deleted">): string {
  if (m.deleted) return "Deleted";
  const text = oneLine(m.text ?? "");
  const media = m.attachments?.[0] ? LABEL[m.attachments[0].kind] ?? "File" : undefined;
  const body = text || (media ? `[${media}]` : "");
  return m.subject && !body.startsWith(m.subject) ? `${m.subject} · ${body}` : body;
}
export const LABEL: Record<string, string> = { image: "Photo", video: "Video", audio: "Audio", voice: "Voice message", document: "Document", sticker: "Sticker" };

/** A conversation's last line with who said it in a group. */
export function preview(c: Conversation): string {
  const p = oneLine(c.lastPreview ?? "");
  if (!p) return isGroup(c) ? "Group" : "";
  return c.lastFromMe && !/^you:/i.test(p) ? `You: ${p}` : p;
}

/** The pane: the latest messages as a conversation, each `**who** · time` over its text. */
export function markdown(msgs: Message[]): string {
  return msgs.map((m) => {
    const who = m.fromMe ? "You" : m.sender.name || "Them";
    const head = `**${mdEscape(who)}** · ${short(m.sentAt)}`;
    const subject = m.subject ? `\n\n_${mdEscape(m.subject)}_` : "";
    const media = m.attachments.map((a) => `_[${LABEL[a.kind] ?? "File"}${a.filename ? `: ${mdEscape(a.filename)}` : ""}]_`).join(" ");
    const text = m.deleted ? "_Deleted_" : mdEscape((m.text ?? "").trim().slice(0, 2000));
    const reacts = m.reactions.length ? `\n\n${m.reactions.map((r) => r.emoji).join(" ")}` : "";
    return `${head}${subject}\n\n${[text, media].filter(Boolean).join("\n\n")}${reacts}`;
  }).join("\n\n");
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A healthy account, or one that only catches up. */
export const healthy = (a: Account) => !a.enabled || ["connected", "syncing", "starting"].includes(a.state);
