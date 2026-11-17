// The bar popover as a render tree (`View` in `@zcag/pal`), pure: the
// gallery and the tests render a fixture state with this same function.
// Every account's inbox in one place: a tab per network over the rows
// (All first; a click, Tab or a digit switches), then the rows under
// Wisp's own sections (a due To do first, then People, Work, Groups, Feed,
// Paper), each the picture (the initial on a tile in the network's colour
// while there is none), the conversation, its last line, the time, the
// network's glyph and the unread count, or the To do's state. A row that
// wants you (unread, or a To do that is due) leads with a dot and is drawn
// in full ink; one already read recedes to the muted greys. A cursor (`selected`) the arrows move and a click sets; rows the
// shell can mark (`mark`) for `m`, `t` and `e` over them all. An account
// that needs attention is a line at the foot. Replying turns the search row
// into a text field (`View.input`). Nothing waiting is one calm line.
import { POPOVER_W, column, keyHint, row, text, type Action, type HexColor, type TagColor, type View, type ViewNode } from "@zcag/pal";
import { GLYPH, SECTION_ORDER } from "./data.ts";

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
  section: string;
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
  /** The To dos dated for later, said at inbox zero. */
  later: number;
  trouble: Trouble[];
  /** Wisp could not be asked: the line says why. */
  problem?: string;
};

const AVATAR = 28, DOT = 6;
const ROW_W = POPOVER_W - 8, SIDE_W = 56, TEXT_W = ROW_W - DOT - 4 - AVATAR - SIDE_W - 2 * 8;

const AVATAR_COLORS: HexColor[] = ["#1d6a73", "#2a9d8f", "#e76f51", "#f4a261", "#6a4c93", "#1982c4", "#8ac926", "#ff595e"];
export const avatarColor = (name: string): HexColor => { let h = 5381; for (const ch of name) h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; };
export const initial = (name: string) => { const n = name.replace(/^[#@+\s]+/, "").trim(); return n ? [...n][0]!.toUpperCase() : "?"; };

/** The rows the tab shows, in section order: what the cursor walks. */
export function visible(st: Pick<PopState, "rows" | "tab">): PopRow[] {
  const rows = st.tab === "all" ? st.rows : st.rows.filter((r) => r.channel === st.tab);
  return SECTION_ORDER.flatMap((s) => rows.filter((r) => r.section === s)).concat(rows.filter((r) => !SECTION_ORDER.includes(r.section)));
}
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

const TABS_PER_ROW = 7;

function tabsNode(st: PopState): ViewNode[] {
  if (st.tabs.length < 2) return [];
  const all = st.tabs.reduce((n, t) => n + t.n, 0);
  const count = (n: number, on: boolean): ViewNode[] => (n ? [text(String(n), { key: "n", size: "xs", weight: on ? "semibold" : "regular", color: on ? undefined : "muted" })] : []);
  const one = (id: string, label: ViewNode[], on: boolean): ViewNode =>
    row(label, { key: `tab-${id}`, gap: 1, padding: 1, radius: true, surface: on ? "elevated" : undefined, action: `tab:${id}` });
  const tabs = [
    one("all", [text("All", { size: "xs", weight: "semibold", color: st.tab === "all" ? undefined : "muted" }), ...count(all, st.tab === "all")], st.tab === "all"),
    ...st.tabs.map((t) => one(t.id, [t.logo ? { type: "image", key: "logo", src: t.logo, width: 14, height: 14, alt: t.title } : text(t.glyph, { style: "glyph", size: "sm", color: t.color }), ...count(t.n, st.tab === t.id)], st.tab === t.id)),
  ];
  const per = Math.ceil(tabs.length / Math.ceil(tabs.length / TABS_PER_ROW));
  const rows = Array.from({ length: Math.ceil(tabs.length / per) }, (_, i) => row(tabs.slice(i * per, (i + 1) * per), { key: `tabs${i || ""}`, gap: 1, minHeight: 26 }));
  return rows.length > 1 ? [column(rows, { key: "tabrows", gap: 0 })] : rows;
}

function sections(st: PopState, cur: PopRow | undefined): ViewNode[] {
  const rows = visible(st);
  const names = [...new Set(rows.map((r) => r.section))];
  return names.map((s) => {
    const of = rows.filter((r) => r.section === s);
    const label = row([text(s, { size: "xs", weight: "semibold", color: "muted" }), text(String(of.length), { size: "xs", color: "faint" })], { key: `h-${s}`, gap: 1, padding: 1, minHeight: 22 });
    return column([label, ...of.map((r) => rowNode(r, r.id === cur?.id, st.replying === r.id))], { key: `s-${s}`, gap: 0 });
  });
}

function troubleNode(st: PopState): ViewNode[] {
  return st.trouble.map((t) => row([
    text(GLYPH.alert, { style: "glyph", size: "sm", color: "amber", width: 16, align: "center" }),
    text(`${t.label}: ${t.detail || t.state}`, { size: "xs", color: "muted", minWidth: 0 }),
  ], { key: `trouble-${t.id}`, gap: 1, minHeight: 20, action: `account:${t.id}` }));
}

function hints(st: PopState, cur: PopRow | undefined): ViewNode {
  if (st.replying) return row([...keyHint("enter", "send"), ...keyHint("escape", "cancel")], { key: "hints", gap: 1, minHeight: 22 });
  const kids: ViewNode[] = [];
  if (cur) kids.push(...keyHint("enter", "open"), ...keyHint("r", "reply"), ...keyHint("m", cur.n ? "read" : "unread"), ...keyHint("t", "to do"), ...keyHint("e", "done"));
  else kids.push(...keyHint("w", "Wisp"));
  kids.push(...keyHint("p", "pal"));
  return row(kids, { key: "hints", gap: 1, minHeight: 22 });
}

export function actions(st: PopState): Action[] {
  const v = visible(st), cur = current(st);
  const clicks: Action[] = [
    ...v.map((r): Action => ({ id: `at:${r.id}`, title: `Go to ${r.title}`, hidden: true })),
    ...st.trouble.map((t): Action => ({ id: `account:${t.id}`, title: `Open ${t.label} in Wisp`, hidden: true })),
    { id: "tab:all", title: "All", hidden: true, shortcut: "1" },
    // Every tab is clickable; the first eight also answer 2 to 9.
    ...st.tabs.map((t, i): Action => ({ id: `tab:${t.id}`, title: t.title, hidden: true, ...(i < 8 && { shortcut: String(i + 2) }) })),
  ];
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
  const unread = st.rows.filter((r) => r.n > 0).length, todo = st.rows.filter((r) => r.todo).length;
  let tree: ViewNode;
  if (st.problem && !st.rows.length) {
    tree = column([
      { type: "tile", key: "zero", width: 48, height: 48, text: "!", color: "amber", fill: "soft" },
      text("Wisp is out of reach", { style: "title", key: "zero-t" }),
      text(st.problem, { style: "muted", size: "sm", align: "center" }),
      row([...keyHint("w", "Wisp"), ...keyHint("p", "pal")], { key: "hints", gap: 1, minHeight: 22 }),
    ], { key: "compact", padding: 3, gap: 2, align: "center" });
  } else if (!st.rows.length) {
    tree = column([
      { type: "tile", key: "zero", width: 48, height: 48, text: "✓", color: "teal", fill: "soft" },
      text("Inbox zero", { style: "title", key: "zero-t" }),
      text(st.later ? `Nothing waiting; ${st.later} To do${st.later === 1 ? "" : "s"} for later` : "Nothing unread and nothing to do", { style: "muted", size: "sm", align: "center" }),
      ...troubleNode(st),
      hints(st, undefined),
    ], { key: "compact", padding: 3, gap: 2, align: "center" });
  } else {
    tree = column([
      ...tabsNode(st),
      ...(shown.length ? sections(st, cur) : [text("Nothing here", { key: "none", style: "muted", size: "sm", align: "center" })]),
      ...troubleNode(st),
      hints(st, cur),
    ], { key: "compact", padding: 3, gap: 2 });
  }
  const replying = st.rows.find((r) => r.id === st.replying);
  const title = replying ? `Reply to ${replying.title}` : [unread && `${unread} unread`, todo && `${todo} to do`].filter(Boolean).join(" · ") || "Wisp";
  return {
    tree,
    actions: actions(st),
    title,
    id: "inbox",
    keys: "actions",
    ...(replying && { input: { value: st.draft ?? "", placeholder: `Message ${replying.title}`, submit: "send", cancel: "cancel" } }),
  };
}
