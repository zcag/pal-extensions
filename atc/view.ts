// The sessions as the bar's popover (`View` in `@zcag/pal`), pure: index.ts
// hands in what atc listed, the tests and the screenshot fixture made-up
// ones. A section per state in atc's order (needs you, your turn, working,
// stopped), a row per session: the machine's tag, the title, the folder and
// branch with what it is doing or asking under it, the context it holds and
// the age. The row the keys act on wears the ring; a click moves it, and
// Enter opens its chat.
import { POPOVER_W, ago, column, keyHint, row, text, type Action, type TagColor, type View, type ViewNode } from "@zcag/pal";
import type { Session, State } from "./api.ts";

export type PopoverState = { sessions: Session[]; cursor?: string; now: number; /** A message waiting in the bar, shown as a muted line under the rows (unreachable, not set up). */ problem?: string };

export const STATE_ORDER: State[] = ["needs-you", "your-turn", "working", "stopped"];
export const STATE: Record<State, { title: string; tag: string; color: TagColor }> = {
  "needs-you": { title: "Needs you", tag: "needs you", color: "red" },
  "your-turn": { title: "Your turn", tag: "your turn", color: "amber" },
  working: { title: "Working", tag: "working", color: "blue" },
  stopped: { title: "Stopped", tag: "stopped", color: "grey" },
  past: { title: "Earlier", tag: "earlier", color: "grey" },
};
/** nf-cod-claude. */
export const CLAUDE = "\u{ec82}";
/** nf-md-radar: atc's own mark on the bar and the tile. */
export const GLYPH = "\u{f0437}";

/** A run of `ms` as the row's age wants it, from an ISO time. */
export const at = (iso?: string) => (iso ? Date.parse(iso) || 0 : 0);
/** When the state began, as near as the row knows: the prompt for a working one, else the last write. */
export const since = (s: Session) => (s.state === "working" && s.promptAt ? at(s.promptAt) : at(s.updated) || at(s.promptAt));
export const folder = (p: string) => (/^\/(?:home|Users)\/[^/]+\/?$/.test(p) ? "~" : p.slice(p.lastIndexOf("/") + 1) || p);
/** `/home/x/proj/a` and `/Users/x/proj/a` as `~/proj/a`: the folders of every machine read alike. */
export const short = (p: string) => p.replace(/^\/(?:home|Users)\/[^/]+(?=\/|$)/, "~");
/** 156643 as "157k". */
export const tokens = (n?: number) => (n === undefined ? "" : n >= 999_500 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
/** "Bash  Run the tests" (atc's tool, two spaces, the summary) as "Bash: Run the tests". */
export const activity = (a?: string) => (a ? a.replace(/^(\S+)\s{2,}/, "$1: ").trim() : "");
/**
 * What a session that needs you is asking. A permission prompt (Enter allows,
 * Escape refuses), a plan to approve (the same two keys), or a question,
 * whose Enter would pick its first answer unread: that one is answered where
 * its options show, so it gets no allow key.
 */
export type Ask = "run" | "plan" | "question";
export const askOf = (s: Session): Ask => { const t = s.activity?.split(/\s/)[0]; return t === "AskUserQuestion" ? "question" : t === "ExitPlanMode" ? "plan" : "run"; };
export const ASK: Record<Ask, { heading: string; allow?: string; allowed?: string; refuse: string; refused: string }> = {
  run: { heading: "Asks to run", allow: "Allow", allowed: "Allowed", refuse: "Say no", refused: "Said no" },
  plan: { heading: "Has a plan for you to approve", allow: "Approve the plan", allowed: "Plan approved", refuse: "Keep planning", refused: "Kept planning" },
  question: { heading: "Asks you a question", refuse: "Dismiss the question", refused: "Question dismissed" },
};
/** Allow is offered: a background session asking to run something or to go ahead with a plan. */
export const allows = (s: Session) => s.state === "needs-you" && !!s.id && s.attachable && !!ASK[askOf(s)].allow;
/** Escape is offered: a background session asking, or working. */
export const interrupts = (s: Session) => !!s.id && s.attachable && (s.state === "needs-you" || s.state === "working");
export const interruptTitle = (s: Session) => (s.state === "needs-you" ? ASK[askOf(s)].refuse : "Interrupt");

/** A message can go in, and its terminal opens here: a background session (live, or resumed first when stopped) or a past conversation; one started in a terminal is typed into only there. */
export const sendable = (s: Session) => !!s.id || s.state === "stopped" || s.state === "past";

/** The key a session goes by in rows and actions: the conversation id, which every session has. */
export const keyOf = (s: Session) => s.sessionId;

/** In atc's order, parked ones last within the live list; past ones never come here. */
export const ordered = (list: Session[]): Session[] => {
  const live = list.filter((s) => s.state !== "past");
  return [...STATE_ORDER.flatMap((st) => live.filter((s) => s.state === st && !s.parked)), ...live.filter((s) => s.parked)];
};
export const current = (st: PopoverState): Session | undefined => { const rows = ordered(st.sessions); return rows.find((s) => keyOf(s) === st.cursor) ?? rows[0]; };
/** Several machines in the list: each row names its own. */
const multiHost = (list: Session[]) => new Set(list.map((s) => s.host)).size > 1;

/** What the row says under its title: the machine, the folder and branch, then what it is doing or asking. */
export function subtitle(s: Session, hosts: boolean): string {
  const where = [hosts ? s.host : undefined, folder(s.cwd), s.branch && s.branch !== "HEAD" ? s.branch : undefined].filter(Boolean).join(" · ");
  const doing = s.state === "needs-you" && askOf(s) !== "run" ? ASK[askOf(s)].heading.toLowerCase() : (s.state === "working" || s.state === "needs-you") && activity(s.activity);
  return doing ? `${where} · ${doing}` : where;
}

const OUTER_PAD = 12, AGE_W = 36, GAP = 8;
const TITLE_W = POPOVER_W - 2 * OUTER_PAD - 8 - 20 - GAP - AGE_W - GAP - 96;

function header(title: string, n: number, color: TagColor, key: string): ViewNode {
  return row([text(title, { size: "xs", weight: "semibold", color: "muted" }), { type: "badge", key: "n", text: String(n), color }], { key, gap: 1, minHeight: 22 });
}

function sessionRow(s: Session, focused: boolean, st: PopoverState, hosts: boolean): ViewNode {
  const lead = s.state === "needs-you" && keyOf(s) === keyOf(ordered(st.sessions)[0]);
  return row(
    [
      text(CLAUDE, { style: "glyph", size: "md", color: s.parked ? "faint" : STATE[s.state].color, width: 20, align: "center" }),
      column([
        text(s.title || folder(s.cwd), lead ? { style: "headline", size: "xl", minWidth: 0 } : { size: "md", weight: focused ? "semibold" : "medium", width: TITLE_W }),
        text(subtitle(s, hosts), { size: "xs", color: "muted", width: TITLE_W }),
      ], { key: "t", gap: lead ? 1 : 0, grow: true }),
      { type: "badge", key: "state", text: s.parked ? "parked" : STATE[s.state].tag, color: s.parked ? "grey" : STATE[s.state].color },
      text(ago(since(s), { now: st.now, short: true }), { style: "mono", size: "xs", color: "muted", width: AGE_W, align: "end" }),
    ],
    { key: keyOf(s), mark: keyOf(s), padding: 1, minHeight: 42, radius: true, action: `at:${keyOf(s)}`, ...(focused && { selected: true }), transition: { enter: "fade", exit: "fade" } },
  );
}

function empty(problem?: string): ViewNode {
  return column(
    [
      { type: "tile", key: "tile", width: 48, height: 48, text: GLYPH, color: "neutral", fill: "soft" },
      text(problem ? "atc is out of reach" : "No sessions", { style: "title", size: "lg" }),
      text(problem ?? "Nothing is running on any machine atc lists. n starts one.", { style: "muted", size: "sm", align: "center" }),
    ],
    { key: "empty", padding: 5, gap: 2, align: "center", justify: "center" },
  );
}

function hints(s?: Session): ViewNode {
  const kids: ViewNode[] = [];
  if (s) {
    kids.push(...keyHint("enter", "chat"));
    if (allows(s)) kids.push(...keyHint("y", ASK[askOf(s)].allow!.toLowerCase()));
    if (interrupts(s)) kids.push(...keyHint("i", interruptTitle(s).toLowerCase()));
  }
  kids.push(...keyHint("n", "new"), ...keyHint("p", "in pal"));
  return row(kids, { key: "hints", gap: 1, minHeight: 22 });
}

/** Every action the popover answers to; the first listed is Enter. A click on a row moves the ring (`at:<key>`, hidden). */
export function actions(st: PopoverState): Action[] {
  const rows = ordered(st.sessions);
  const s = current(st);
  const base: Action[] = [
    { id: "new", title: "New session", shortcut: ["n", "cmd+n"] },
    { id: "history", title: "Earlier conversations", shortcut: "h" },
    { id: "pal", title: "Open Sessions in pal", shortcut: "p" },
  ];
  if (!s) return base;
  const live = !!s.id && s.state !== "stopped";
  return [
    { id: "chat", title: "Open the chat", shortcut: ["enter", "r"] },
    ...(allows(s) ? [{ id: "allow", title: ASK[askOf(s)].allow!, shortcut: ["y", "cmd+y"] }] : []),
    ...(interrupts(s) ? [{ id: "interrupt", title: interruptTitle(s), shortcut: ["i", "cmd+."] }] : []),
    ...(sendable(s) ? [{ id: "terminal", title: "Open its terminal in pal", shortcut: ["o", "cmd+o"] }] : []),
    ...(s.attachable ? [{ id: "attach", title: "Open in a terminal app (atc attach)", shortcut: "a" }] : []),
    { id: "web", title: "Open in atc's web page", shortcut: ["w", "cmd+shift+o"] },
    { id: "outputs", title: "Outputs", shortcut: "u" },
    { id: s.pinned ? "unpin" : "pin", title: s.pinned ? "Unpin" : "Pin", multi: true as const },
    { id: s.parked ? "unpark" : "park", title: s.parked ? "Unpark" : "Park", multi: true as const },
    ...(live && s.kind === "background" ? [{ id: "stop", title: "Stop the session", shortcut: ["x", "cmd+d"], style: "destructive" as const, multi: true as const, confirm: "Stop it? The conversation is kept and can be resumed." }] : []),
    ...base,
    { id: "down", title: "Next", shortcut: ["down", "j"], hidden: true as const },
    { id: "up", title: "Previous", shortcut: ["up", "k"], hidden: true as const },
    ...rows.map((x): Action => ({ id: `at:${keyOf(x)}`, title: `Select ${x.title}`, hidden: true })),
  ];
}

export function render(st: PopoverState): View {
  const rows = ordered(st.sessions);
  const cur = current(st);
  const hosts = multiHost(rows);
  const kids: ViewNode[] = [];
  if (!rows.length) kids.push(empty(st.problem));
  else {
    let section: string | undefined;
    for (const s of rows) {
      const name = s.parked ? "parked" : s.state;
      if (name !== section) {
        section = name;
        const n = rows.filter((x) => (s.parked ? x.parked : !x.parked && x.state === s.state)).length;
        kids.push(s.parked ? header("Parked", n, "grey", "h-parked") : header(STATE[s.state].title, n, STATE[s.state].color, `h-${s.state}`));
      }
      kids.push(sessionRow(s, keyOf(s) === (cur && keyOf(cur)), st, hosts));
    }
    if (st.problem) kids.push(text(st.problem, { key: "problem", size: "xs", color: "destructive" }));
  }
  kids.push({ type: "divider", key: "rule" }, hints(cur));
  const n = rows.filter((s) => !s.parked).length;
  return { tree: column(kids, { key: "popover", padding: 3, gap: 1 }), actions: actions(st), title: n ? `${n} session${n === 1 ? "" : "s"}` : "atc", id: "sessions", keys: "actions" };
}
