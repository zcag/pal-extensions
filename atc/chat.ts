// A session as a chat (`View` in `@zcag/pal`), pure over what atc gave:
// a header (the state with its age, the title, the machine, folder,
// branch, model and context), then the conversation oldest to newest: a
// prompt a sunken block with a rail in the accent colour, a reply its
// markdown drawn through the SDK's `md`, a tool call one compact row
// (its name and what it ran). Under the last entry, what the session is
// doing now: a working line, or for a permission prompt a card with the
// command and the two keys. The search row is the message field the whole
// time, so typing and Enter sends; the keys are modifier combos for that
// reason. Files attached for the next message ride as badges over it.
// The tree is cut at a node budget from the newest entry back, so a long
// conversation shows its end and says how much is above.
import { POPOVER_W, ago, column, keyHint, md, row, text, truncate, type Action, type View, type ViewNode } from "@zcag/pal";
import type { Message, Session } from "./api.ts";
import { ASK, CLAUDE, STATE, activity, allows, askOf, folder, interruptTitle, interrupts, since, tokens } from "./view.ts";

export type ChatState = {
  s: Session;
  messages: Message[];
  /** atc has older pages (`cmd+[` fetches the next). */
  more: boolean;
  /** Uploaded paths that go with the next message. */
  attached: string[];
  now: number;
  compact?: boolean;
  /** Fetching the transcript failed: the line says why, the header still draws. */
  problem?: string;
};

/** Of the host's 2000 nodes per tree, what the conversation may use; a single reply may use at most `PER_REPLY`. */
export const BUDGET = 1600, PER_REPLY = 220;
/** nf-md-cog for a tool row, nf-md-shield_alert for the prompt card, nf-md-paperclip for an attachment. */
const COG = "\u{f0493}", SHIELD = "\u{f0ecc}", CLIP = "\u{f03e2}";

const count = (n: ViewNode): number => 1 + ("children" in n && n.children ? n.children.reduce((a, c) => a + count(c), 0) : 0);
const paragraphs = (t: string) => t.trim().split(/\n{2,}/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);

function header(st: ChatState): ViewNode[] {
  const s = st.s;
  const meta = [s.host, folder(s.cwd), s.branch && s.branch !== "HEAD" ? s.branch : undefined, s.model?.replace(/^claude-/, ""), s.context ? `${tokens(s.context)} context` : undefined, s.permissionMode === "bypassPermissions" ? "no permission prompts" : undefined].filter(Boolean).join(" · ");
  const age = since(s);
  return [
    row([
      text(CLAUDE, { style: "glyph", size: "lg", color: STATE[s.state].color, width: 24, align: "center" }),
      column([text(s.title || folder(s.cwd), { style: "title", size: "md", minWidth: 0 })], { key: "t", gap: 0, grow: true }),
      { type: "badge", key: "state", text: age ? `${STATE[s.state].tag} · ${ago(age, { now: st.now, short: true })}` : STATE[s.state].tag, color: STATE[s.state].color },
    ], { key: "head", gap: 2, minHeight: 28 }),
    text(meta, { key: "meta", size: "xs", color: "muted", width: st.compact ? POPOVER_W : 680 }),
    { type: "divider", key: "rule-top" },
  ];
}

// The chat's paragraphs carry no `width`: a width clips a text to one line, these wrap in their column.
function userNode(m: Message, k: string): ViewNode {
  return row(
    [{ type: "tile", key: "rail", width: 3, height: 22, color: "accent", fill: "solid" }, column(paragraphs(m.text ?? "").map((p, j) => text(p, { key: `p${j}`, size: "sm" })), { key: "body", gap: 1, grow: true })],
    { key: k, surface: "sunken", radius: true, padding: 2, gap: 2, align: "start" },
  );
}

function assistantNode(m: Message, k: string, compact?: boolean): ViewNode {
  const { tree } = md.render(m.text ?? "", { width: compact ? POPOVER_W - 24 : 660, maxNodes: PER_REPLY, padding: 0, shift: 2, where: "atc's web page" });
  return column([tree], { key: k, gap: 1, padding: 1 });
}

function toolNode(m: Message, k: string): ViewNode {
  return row(
    [
      text(COG, { style: "glyph", size: "sm", color: "muted", width: 16, align: "center" }),
      text(m.tool ?? "tool", { size: "xs", weight: "semibold", width: 72 }),
      column([text(m.detail ?? "", { style: "mono", size: "xs", color: "muted", minWidth: 0 })], { key: "d", gap: 0, grow: true }),
    ],
    { key: k, gap: 1, minHeight: 20, padding: 1, radius: true },
  );
}

/** What the session is doing now, under the last entry. */
function now(st: ChatState): ViewNode[] {
  const s = st.s, what = activity(s.activity);
  if (s.state === "needs-you") {
    const ask = askOf(s);
    const keys: ViewNode[] = [];
    if (allows(s)) keys.push(...keyHint("cmd+y", ASK[ask].allow!.toLowerCase(), { action: "allow" }));
    if (interrupts(s)) keys.push(...keyHint("cmd+.", interruptTitle(s).toLowerCase(), { action: "interrupt" }));
    const where = !s.id || !s.attachable ? "A terminal session: answer it in its terminal" : ask === "question" ? "Answer it where its options show: cmd+o opens the terminal" : undefined;
    return [row([
      text(SHIELD, { style: "glyph", size: "lg", color: "red", width: 24, align: "center" }),
      column([
        text(ASK[ask].heading, { size: "xs", weight: "semibold", color: "red" }),
        ...(ask === "run" ? [text(what || "a tool (open the terminal to see which)", { key: "what", style: "mono", size: "sm", minWidth: 0 })] : []),
        ...(where ? [text(where, { key: "where", size: "xs", color: "muted" })] : []),
        ...(keys.length ? [row(keys, { key: "keys", gap: 1 })] : []),
      ], { key: "c", gap: 1, grow: true }),
    ], { key: "asks", surface: "elevated", radius: true, padding: 2, gap: 2, align: "start" })];
  }
  if (s.state === "working") return [text(what ? `Working · ${what}` : "Working", { key: "working", size: "xs", color: "accent" })];
  return [];
}

/** A message can go in: a background session (live, or resumed first when stopped) or a past conversation; a terminal session is typed into only there. */
export const sendable = (s: Session) => !!s.id || s.state === "stopped" || s.state === "past";

export function hints(st: ChatState): ViewNode {
  const s = st.s, kids: ViewNode[] = sendable(s) ? [...keyHint("enter", "send")] : [text("A terminal session: reply in its terminal", { key: "where", size: "xs", color: "muted" })];
  // A prompt's own keys are on its card; a working turn's interrupt is here.
  if (s.state === "working" && interrupts(s)) kids.push(...keyHint("cmd+.", "interrupt"));
  if (sendable(s)) kids.push(...keyHint("cmd+shift+v", "attach"));
  if (s.attachable) kids.push(...keyHint("cmd+o", "terminal"));
  return row(kids, { key: "hints", gap: 1, minHeight: 22 });
}

export function actions(st: ChatState): Action[] {
  const s = st.s;
  return [
    ...(sendable(s) ? [{ id: "send", title: "Send" }] : []),
    ...(allows(s) ? [{ id: "allow", title: ASK[askOf(s)].allow!, shortcut: "cmd+y" }] : []),
    ...(interrupts(s) ? [{ id: "interrupt", title: interruptTitle(s), shortcut: "cmd+." }] : []),
    ...(sendable(s) ? [{ id: "attach-clipboard", title: "Attach what is on the clipboard", shortcut: "cmd+shift+v" }] : []),
    ...(st.attached.length ? [{ id: "detach", title: "Drop the attachments", shortcut: "cmd+shift+backspace" }] : []),
    ...(s.attachable ? [{ id: "terminal", title: "Open in a terminal", shortcut: "cmd+o" }] : []),
    { id: "web", title: "Open in atc's web page", shortcut: "cmd+shift+o" },
    { id: "outputs", title: "Outputs", shortcut: "cmd+u" },
    { id: "copy-reply", title: "Copy the last reply", shortcut: "cmd+shift+c" },
    ...(st.more ? [{ id: "older", title: "Older messages", shortcut: "cmd+[" }] : []),
  ];
}

export function render(st: ChatState): View {
  const s = st.s;
  const head = header(st);
  // Newest first until the budget is spent, then put back in order.
  const body: ViewNode[] = [];
  let used = 0, cut = 0;
  for (let i = st.messages.length - 1; i >= 0; i--) {
    const m = st.messages[i], k = `m${i}`;
    const node = m.role === "user" ? userNode(m, k) : m.role === "assistant" ? assistantNode(m, k, st.compact) : m.role === "tool" ? toolNode(m, k) : undefined;
    if (!node) continue;
    const n = count(node);
    if (used + n > BUDGET) { cut = i + 1; break; }
    used += n;
    body.unshift(node);
  }
  const kids: ViewNode[] = [...head];
  if (cut || st.more) kids.push(text(cut ? `${cut} earlier entries are not drawn; atc's web page has them all` : "Older messages: cmd+[", { key: "earlier", size: "xs", color: "faint", align: "center" }));
  if (st.problem) kids.push(text(st.problem, { key: "problem", size: "sm", color: "destructive" }));
  else if (!body.length) kids.push(text("Nothing said yet", { key: "none", style: "muted", size: "sm", align: "center" }));
  kids.push(...body, ...now(st));
  if (st.attached.length) kids.push(row(st.attached.map((p, i) => ({ type: "badge" as const, key: `f${i}`, text: `${CLIP} ${truncate(folder(p).replace(/^\d{6}-/, ""), 28)}`, color: "violet" as const })), { key: "attached", gap: 1 }));
  kids.push({ type: "divider", key: "rule" }, hints(st));
  const stopped = s.state === "stopped" || s.state === "past";
  return {
    tree: column(kids, { key: "chat", padding: 3, gap: 2 }),
    actions: actions(st),
    title: truncate(s.title || folder(s.cwd), 48),
    id: s.sessionId,
    keys: "actions",
    ...(sendable(s) && { input: { placeholder: stopped ? "Message (resumes it first)" : "Message", submit: "send" } }),
  };
}
