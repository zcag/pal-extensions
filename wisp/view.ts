// The bar popover as a render tree (`View` in `@zcag/pal`), pure: the
// gallery and the tests render a fixture state with this same function.
// Every account's inbox in one place: one row of chips over the rows (All,
// then as many networks as fit, those with something unread first; the
// rest fold into a +N chip that shows every network until a tab is picked;
// a click, Tab or a digit switches), then
// three blocks: Unread (what is meant for you first), the To dos that are
// due, and the read ones as a line each, the first few of them until `a`
// shows the rest. An unread or To do row is the picture (the initial on a
// tile while there is none), the conversation, its last line, the time,
// the network's glyph and the unread count or the To do's state; a read
// line is the glyph, the name, the last line and the time. A cursor (`selected`) the arrows move and a click sets; rows the
// shell can mark (`mark`) for `m`, `t` and `e` over them all. An account
// that needs attention is a line at the foot. Replying turns the search row
// into a text field (`View.input`). Nothing waiting is one calm line.
import { POPOVER_W, column, keyHint, row, text, type Action, type HexColor, type TagColor, type View, type ViewNode } from "@zcag/pal";
import { GLYPH } from "./data.ts";

export type PopRow = {
  id: number;
  title: string;
  /** The last message on one line, "You: " before one of yours. */
  line: string;
  time: string;
  /** Unread messages; 0 for a due To do that is read. */
  n: number;
  /** Something unread is meant for you: a mention, a reply in a thread you follow. */
  forMe: boolean;
  channel: string;
  glyph: string;
  color: TagColor;
  group: boolean;
  /** "To do", "Waiting", or the date it came back, on a To do row. */
  todo?: string;
  avatar?: string;
};
/** A network's tab: its logo (a data url) when it has one, else its glyph; `n` its unread conversations. */
export type Tab = { id: string; title: string; glyph: string; color: TagColor; n: number; logo?: string };
export type Trouble = { id: number; label: string; glyph: string; state: string; detail?: string };
export type PopState = {
  rows: PopRow[];
  tabs: Tab[];
  /** `all` or a channel. */
  tab: string;
  /** The row the keys act on, by id. */
  cursor?: number;
  replying?: number;
  draft?: string;
  /** Every read conversation, not only the first few. */
  allRead?: boolean;
  /** A chip for every network, over as many rows as they take. */
  allTabs?: boolean;
  /** The To dos dated for later, said at inbox zero. */
  later: number;
  trouble: Trouble[];
  /** Wisp could not be asked: the line says why. */
  problem?: string;
};

const AVATAR = 28, DOT = 6;
const ROW_W = POPOVER_W - 8, SIDE_W = 56, TEXT_W = ROW_W - DOT - 4 - AVATAR - SIDE_W - 2 * 8;
const LINE_GLYPH_W = 16, LINE_NAME_W = 96, LINE_TIME_W = 40, LINE_TEXT_W = ROW_W - LINE_GLYPH_W - LINE_NAME_W - LINE_TIME_W - 3 * 8;
/** Read conversations listed before `a` shows the rest. */
export const READ_SHOWN = 4;
/** A chip's width as drawn (padding, the 14 px logo, its count), so the row takes as many as fit. */
const TABS_W = POPOVER_W - 24, CHIP_GAP = 4, chipW = (label: number, n = 0) => 8 + label + (n ? 4 + 7 * String(n).length : 0);
const ALL_W = 20, LOGO_W = 14, MORE_W = 22;
/** The most rows the popover draws (a real inbox holds hundreds, past the view's node limit); the ones that want you go first. */
export const MAX_ROWS = 40;

const AVATAR_COLORS: HexColor[] = ["#1d6a73", "#2a9d8f", "#e76f51", "#f4a261", "#6a4c93", "#1982c4", "#8ac926", "#ff595e"];
export const avatarColor = (name: string): HexColor => { let h = 5381; for (const ch of name) h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; };
export const initial = (name: string) => { const n = name.replace(/^[#@+\s]+/, "").trim(); return n ? [...n][0]!.toUpperCase() : "?"; };

/** A block's rows past what is drawn: `all-read` shows the rest of the read ones, `pal` (past `MAX_ROWS`) opens the inbox in pal. */
type Block = { name: "Unread" | "To do" | "Read"; rows: PopRow[]; total: number; more?: "all-read" | "pal" };

/** The tab's rows in their blocks, at most `MAX_ROWS` in all: Unread (meant for you first), the To dos, then the read ones (the first few unless `allRead`). */
export function blocks(st: Pick<PopState, "rows" | "tab" | "allRead">): Block[] {
  const rows = st.tab === "all" ? st.rows : st.rows.filter((r) => r.channel === st.tab);
  const unread = rows.filter((r) => r.n > 0), todo = rows.filter((r) => !r.n && r.todo), read = rows.filter((r) => !r.n && !r.todo);
  let room = MAX_ROWS;
  const block = (name: Block["name"], all: PopRow[], want = all): Block => {
    const drawn = want.slice(0, room);
    room -= drawn.length;
    const more = drawn.length === all.length ? undefined : name === "Read" && !st.allRead && room > 0 ? "all-read" : "pal";
    return { name, rows: drawn, total: all.length, ...(more && { more }) };
  };
  return [
    block("Unread", [...unread.filter((r) => r.forMe), ...unread.filter((r) => !r.forMe)]),
    block("To do", todo),
    block("Read", read, st.allRead ? read : read.slice(0, READ_SHOWN)),
  ].filter((b) => b.total);
}
/** The rows the tab shows, in block order: what the cursor walks. */
export const visible = (st: Pick<PopState, "rows" | "tab" | "allRead">): PopRow[] => blocks(st).flatMap((b) => b.rows);
export const current = (st: PopState): PopRow | undefined => { const v = visible(st); return v.find((r) => r.id === st.cursor) ?? v[0]; };

function avatar(r: PopRow, quiet: boolean): ViewNode {
  if (r.avatar) return { type: "image", key: "av", src: r.avatar, width: AVATAR, height: AVATAR, mask: "circle", alt: r.title };
  return { type: "tile", key: "av", width: AVATAR, height: AVATAR, text: initial(r.title), color: quiet ? "neutral" : avatarColor(r.title), fill: quiet ? "soft" : "solid" };
}

function rowNode(r: PopRow, focused: boolean, replying: boolean): ViewNode {
  const wants = r.n > 0 || !!r.todo;
  const tint = r.forMe ? "red" : r.n ? "blue" : "amber";
  const count: ViewNode = r.n ? { type: "badge", key: "n", text: r.forMe ? `@${r.n}` : String(r.n), color: r.forMe ? "red" : r.color } : r.todo ? { type: "badge", key: "n", text: r.todo, color: "amber" } : { type: "spacer", key: "n", size: 1 };
  const dot: ViewNode = wants ? { type: "tile", key: "dot", width: DOT, height: DOT, color: tint, fill: "solid" } : { type: "spacer", key: "dot", size: DOT };
  return row(
    [
      row([dot, avatar(r, !wants)], { key: "lead", gap: 1 }),
      column([
        text(r.title, { size: "md", weight: wants ? "semibold" : "regular", color: wants ? undefined : "muted", width: TEXT_W }),
        text(r.line || " ", { size: "sm", color: replying ? "accent" : wants ? undefined : "faint", width: TEXT_W }),
      ], { key: "t", gap: 0 }),
      column([
        row([text(r.glyph, { style: "glyph", size: "xs", color: wants ? r.color : "faint" }), text(r.time, { size: "xs", weight: wants ? "medium" : "regular", color: wants ? "muted" : "faint" })], { key: "when", gap: 1, justify: "end" }),
        row([count], { key: "c", gap: 0, justify: "end" }),
      ], { key: "side", gap: 1, width: SIDE_W, align: "end" }),
    ],
    { key: `r${r.id}`, mark: String(r.id), padding: 1, minHeight: 44, radius: true, surface: focused ? "elevated" : undefined, selected: focused || undefined, action: `at:${r.id}`, transition: { enter: "fade", exit: "fade" } },
  );
}

const allCount = (st: Pick<PopState, "tabs">) => st.tabs.reduce((n, t) => n + t.n, 0);

/** The network tabs that get a chip on the one row: the open one, then those with something unread, then the rest, as many as fit beside All and a +N for what does not; every one with `allTabs`. */
export function chips(st: Pick<PopState, "tabs" | "tab" | "allTabs">): { shown: Tab[]; folded: Tab[] } {
  if (st.allTabs) return { shown: st.tabs, folded: [] };
  const open = st.tabs.find((t) => t.id === st.tab);
  const order = [...(open ? [open] : []), ...st.tabs.filter((t) => t !== open && t.n), ...st.tabs.filter((t) => t !== open && !t.n)];
  let room = TABS_W - chipW(ALL_W, allCount(st));
  const pick = new Set<Tab>();
  for (const [i, t] of order.entries()) {
    const w = CHIP_GAP + chipW(LOGO_W, t.n);
    if (w + (i < order.length - 1 ? CHIP_GAP + chipW(MORE_W) : 0) > room) break;
    pick.add(t);
    room -= w;
  }
  return { shown: st.tabs.filter((t) => pick.has(t)), folded: st.tabs.filter((t) => !pick.has(t)) };
}

function tabsNode(st: PopState): ViewNode[] {
  if (st.tabs.length < 2) return [];
  const all = allCount(st);
  const { shown, folded } = chips(st);
  const count = (n: number, on: boolean): ViewNode[] => (n ? [text(String(n), { key: "n", size: "xs", weight: on ? "semibold" : "regular", color: on ? undefined : "muted" })] : []);
  const one = (id: string, label: ViewNode[], on: boolean, action = `tab:${id}`): ViewNode =>
    row(label, { key: `tab-${id}`, gap: 1, padding: 1, radius: true, surface: on ? "elevated" : undefined, action });
  const chipsOf = [
    { w: chipW(ALL_W, all), node: one("all", [text("All", { size: "xs", weight: "semibold", color: st.tab === "all" ? undefined : "muted" }), ...count(all, st.tab === "all")], st.tab === "all") },
    ...shown.map((t) => ({ w: chipW(LOGO_W, t.n), node: one(t.id, [t.logo ? { type: "image", key: "logo", src: t.logo, width: 14, height: 14, alt: t.title } : text(t.glyph, { style: "glyph", size: "sm", color: t.color }), ...count(t.n, st.tab === t.id)], st.tab === t.id) })),
    ...(folded.length ? [{ w: chipW(MORE_W), node: one("more", [text(`+${folded.length}`, { size: "xs", color: "muted" })], false, "more-tabs") }] : []),
    ...(st.allTabs ? [{ w: chipW(MORE_W + 8), node: one("fewer", [text("Less", { size: "xs", color: "muted" })], false, "fewer-tabs") }] : []),
  ];
  const lines: ViewNode[][] = [[]];
  let used = 0;
  for (const c of chipsOf) {
    if (lines.at(-1)!.length && used + CHIP_GAP + c.w > TABS_W) { lines.push([]); used = 0; }
    used += (lines.at(-1)!.length ? CHIP_GAP : 0) + c.w;
    lines.at(-1)!.push(c.node);
  }
  const rows = lines.map((l, i) => row(l, { key: `tabs${i || ""}`, gap: 1, minHeight: 26 }));
  return rows.length > 1 ? [column(rows, { key: "tabrows", gap: 0 })] : rows;
}

function lineNode(r: PopRow, focused: boolean): ViewNode {
  return row([
    text(r.glyph, { style: "glyph", size: "xs", color: "faint", width: LINE_GLYPH_W, align: "center" }),
    text(r.title, { size: "sm", color: "muted", width: LINE_NAME_W }),
    text(r.line || " ", { size: "sm", color: "faint", width: LINE_TEXT_W }),
    text(r.time, { size: "xs", color: "faint", width: LINE_TIME_W, align: "end" }),
  ], { key: `r${r.id}`, mark: String(r.id), gap: 2, padding: 1, minHeight: 26, radius: true, surface: focused ? "elevated" : undefined, selected: focused || undefined, action: `at:${r.id}`, transition: { enter: "fade", exit: "fade" } });
}

function sections(st: PopState, cur: PopRow | undefined): ViewNode[] {
  return blocks(st).map((b) => {
    const label = row([text(b.name, { size: "xs", weight: "semibold", color: "muted" }), text(String(b.total), { size: "xs", color: "faint" })], { key: `h-${b.name}`, gap: 1, padding: 1, minHeight: 22 });
    const hidden = b.total - b.rows.length;
    const more = b.more ? [row([text(`${hidden} more`, { size: "xs", color: "muted" }), ...(b.more === "pal" ? keyHint("p", "pal") : keyHint("a", "Show all"))], { key: "more", gap: 1, minHeight: 24, justify: "center", action: b.more })] : [];
    const rows = b.rows.map((r) => (b.name === "Read" ? lineNode(r, r.id === cur?.id) : rowNode(r, r.id === cur?.id, st.replying === r.id)));
    return column([label, ...rows, ...more], { key: `s-${b.name}`, gap: 0 });
  });
}

function troubleNode(st: PopState): ViewNode[] {
  return st.trouble.map((t) => row([
    text(GLYPH.alert, { style: "glyph", size: "sm", color: "amber", width: 16, align: "center" }),
    text(`${t.label}: ${t.detail || t.state}`, { size: "xs", color: "muted", minWidth: 0 }),
  ], { key: `trouble-${t.id}`, gap: 1, minHeight: 20, action: `account:${t.id}` }));
}

/** The two ways out of an empty popover, which has no rows to put an action on. */
const wayOut = (): ViewNode => row([...keyHint("w", "Wisp"), ...keyHint("p", "pal")], { key: "hints", gap: 1, minHeight: 22 });

export function actions(st: PopState): Action[] {
  const v = visible(st), cur = current(st), chipped = new Set(chips(st).shown);
  const clicks: Action[] = [
    ...v.map((r): Action => ({ id: `at:${r.id}`, title: `Go to ${r.title}`, hidden: true })),
    ...st.trouble.map((t): Action => ({ id: `account:${t.id}`, title: `Open ${t.label} in Wisp`, hidden: true })),
    { id: "tab:all", title: "All", hidden: true, shortcut: "1" },
    // A chip is clickable, the first eight networks also answer 2 to 9; one folded behind +N is listed in the actions.
    ...st.tabs.map((t, i): Action => ({ id: `tab:${t.id}`, title: chipped.has(t) ? t.title : `Only ${t.title}`, ...(chipped.has(t) && { hidden: true as const }), ...(i < 8 && { shortcut: String(i + 2) }) })),
  ];
  if (chips(st).folded.length) clicks.push({ id: "more-tabs", title: "Show every network", hidden: true });
  if (st.allTabs) clicks.push({ id: "fewer-tabs", title: "Fewer networks", hidden: true });
  if (blocks(st).some((b) => b.more === "all-read")) clicks.push({ id: "all-read", title: "Show every read conversation", ...(st.replying ? { hidden: true as const } : { shortcut: "a" }) });
  if (st.replying) return [{ id: "send", title: "Send" }, { id: "cancel", title: "Cancel reply" }, ...clicks];
  return [
    ...(cur ? [
      { id: "open", title: `Open ${cur.title}` },
      { id: "preview", title: "Preview", shortcut: "space" },
      { id: "reply", title: `Reply to ${cur.title}`, shortcut: "r" },
      { id: cur.n ? "read" : "unread", title: cur.n ? "Mark read" : "Mark unread", shortcut: "m", multi: true },
      { id: "todo", title: cur.todo ? "Clear the To do" : "To do", shortcut: "t", multi: true },
      { id: "later", title: "To do tomorrow morning", shortcut: "l", multi: true },
      { id: "archive", title: "Done (archive)", shortcut: "e", multi: true },
    ] as Action[] : []),
    { id: "web", title: cur ? "Open in Wisp" : "Open Wisp", shortcut: "w", multi: true },
    { id: "pal", title: "Open the inbox in pal", shortcut: "p" },
    ...(st.tabs.length > 1 ? [{ id: "next-tab", title: "Next tab", shortcut: "tab", hidden: true }, { id: "prev-tab", title: "Previous tab", shortcut: "shift+tab", hidden: true }] as Action[] : []),
    { id: "down", title: "Next row", shortcut: ["down", "j"], hidden: true },
    { id: "up", title: "Previous row", shortcut: ["up", "k"], hidden: true },
    ...clicks,
  ];
}

export function render(st: PopState): View {
  const cur = current(st);
  const shown = visible(st);
  const unread = st.rows.filter((r) => r.n > 0).length, mine = st.rows.filter((r) => r.forMe).length, todo = st.rows.filter((r) => r.todo).length;
  let tree: ViewNode;
  if (st.problem && !st.rows.length) {
    tree = column([
      { type: "tile", key: "zero", width: 48, height: 48, text: "!", color: "amber", fill: "soft" },
      text("Wisp is out of reach", { style: "title", key: "zero-t" }),
      text(st.problem, { style: "muted", size: "sm", align: "center" }),
      wayOut(),
    ], { key: "compact", padding: 3, gap: 2, align: "center" });
  } else if (!st.rows.length) {
    tree = column([
      { type: "tile", key: "zero", width: 48, height: 48, text: "✓", color: "teal", fill: "soft" },
      text("Inbox zero", { style: "title", key: "zero-t" }),
      text(st.later ? `Nothing waiting; ${st.later} To do${st.later === 1 ? "" : "s"} for later` : "Nothing unread and nothing to do", { style: "muted", size: "sm", align: "center" }),
      ...troubleNode(st),
      wayOut(),
    ], { key: "compact", padding: 3, gap: 2, align: "center" });
  } else {
    tree = column([
      ...tabsNode(st),
      ...(shown.length ? sections(st, cur) : [text("Nothing here", { key: "none", style: "muted", size: "sm", align: "center" })]),
      ...troubleNode(st),
    ], { key: "compact", padding: 3, gap: 2 });
  }
  const replying = st.rows.find((r) => r.id === st.replying);
  const title = replying ? `Reply to ${replying.title}` : [unread && `${unread} unread`, mine && `${mine} for you`, todo && `${todo} to do`].filter(Boolean).join(" · ") || "Wisp";
  return {
    tree,
    actions: actions(st),
    title,
    id: "inbox",
    keys: "actions",
    ...(replying && { input: { value: st.draft ?? "", placeholder: `Message ${replying.title}`, submit: "send", cancel: "cancel" } }),
  };
}
