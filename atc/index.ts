// atc: every Claude Code session on every machine an atc server lists
// (github.com/zcag/atc), in the panel and on the bar. atc knows each
// session's state exactly (Claude Code's own background service says it),
// so nothing here is guessed: a session needs you, it is your turn, it is
// working, or it stopped. From pal a session is read and answered as a
// chat, a permission prompt allowed or refused, a turn interrupted, a new
// session started in any folder on any machine, an earlier conversation
// found and resumed, and what a session made (servers, files, links)
// opened. atc's event stream (live.ts) keeps the bar and an open chat
// current within a couple of seconds.
//
// The server comes from the settings, else from `atc login` on this
// machine (api.ts). Sending a message is `POST /send`, which pastes it into
// the session's prompt; a key on a permission prompt goes through the
// session's terminal (keys.ts); a stopped session is resumed first.
import { bar, clipboard, errorMessage, failed, hint, home, mdEscape, now, state, terminal, toast, truncate, view as liveView, when, type Accessory, type Action, type Arg, type BarCtx, type BarItem, type Ctx, type Detail, type Effect, type Extension, type Item, type LinkParams, type Metadata, type View } from "@zcag/pal";
import * as api from "./api.ts";
import { ApiError, NotSetUp, conf, server, type Message, type Session } from "./api.ts";
import { render as renderChat, sendable } from "./chat.ts";
import { KEY, sendKeys } from "./keys.ts";
import * as live from "./live.ts";
import { ASK, GLYPH, STATE, activity, allows, askOf, at, current, folder, interruptTitle, interrupts, keyOf, ordered, render as renderPopover, short, since, subtitle, tokens, type PopoverState } from "./view.ts";

const EXT = "atc", ITEM = "sessions";
/** Two reads within this share one fetch (the bar and a palette ask together); the stream keeps the list fresher anyway. */
const LIST_TTL_MS = 1500;
/** A resumed session takes a moment to be ready for a message; asked every `RESUME_POLL_MS` up to `RESUME_WAIT_MS`. */
export const RESUME_POLL_MS = 1000, RESUME_WAIT_MS = 30_000;
/** After a send the field closes and opens again empty this long after (the panel clears a field only when it closes). */
const REOPEN_MS = 60;

// ---- the list ---------------------------------------------------------------------

/** atc's live list: the stream's when it is fresh, else fetched (and fed to the stream's listeners). */
async function sessions(force = false): Promise<Session[]> {
  live.start();
  const c = live.cached();
  if (!force && c && Date.now() - c.at < LIST_TTL_MS) return c.list;
  const list = await api.live();
  live.feed(list);
  return list;
}

/** A session by its conversation id, its background id, or (for a link) words of its title. */
function find(list: Session[], key: string): Session | undefined {
  const k = key.trim().toLowerCase();
  return list.find((s) => s.sessionId === key || s.id === key) ?? list.find((s) => s.sessionId.startsWith(k) || s.id?.startsWith(k)) ?? list.find((s) => (s.title || "").toLowerCase().includes(k) || (s.name || "").toLowerCase().includes(k));
}

/** The one a bare open of the chat means: the first that needs you, else your turn, else whatever ran last. */
const urgent = (list: Session[]) => ordered(list).find((s) => !s.parked);

const problemOf = (e: unknown) => (e instanceof NotSetUp ? "No atc server yet: set it under Settings › Extensions › atc, or run atc login" : e instanceof ApiError && e.auth ? "atc refused the token: check it under Settings › Extensions › atc" : errorMessage(e));

// ---- acting on a session ------------------------------------------------------------------

/** Ready for a message: live sessions as they are, a stopped or past one resumed and waited for. The background id to send to. */
async function ready(s: Session): Promise<string> {
  if (s.attachable && s.id) return s.id;
  if (s.kind === "interactive" && s.pid) throw new Error(`"${s.title}" is open in a terminal; type into it there`);
  const id = await api.resume(s.sessionId);
  for (let waited = 0; waited < RESUME_WAIT_MS; waited += RESUME_POLL_MS) {
    const x = (await sessions(true)).find((y) => y.id === id);
    if (x?.attachable) return id;
    await new Promise((r) => setTimeout(r, RESUME_POLL_MS));
  }
  throw new Error(`"${s.title}" did not come back within ${RESUME_WAIT_MS / 1000} s`);
}

/** The text and the attached files' paths as one message, the way atc's page puts an upload into a prompt. */
const compose = (text: string, files: string[]) => [text.trim(), ...files.map((f) => `@${f}`)].filter(Boolean).join(" ");

async function sendTo(s: Session, text: string, files: string[] = []): Promise<string> {
  const id = await ready(s);
  await api.send(id, compose(text, files));
  return id;
}

/** The atc CLI, for `atc attach` in a terminal; launchd's PATH has none of the usual places. */
function atcCli(): string | undefined {
  return Bun.which("atc") ?? ["~/.local/bin/atc", "~/go/bin/atc", "/opt/homebrew/bin/atc", "/usr/local/bin/atc"].map(home).find((p) => Bun.file(p).size > 0);
}

function openIn(s: Session, how?: "terminal" | "browser"): Effect {
  const pref = how ?? conf().open ?? "auto";
  const cli = atcCli();
  if (pref !== "browser" && s.attachable && s.id && cli) {
    const why = terminal.open([cli, "attach", s.id], conf().terminal ?? "auto");
    return why ? toast("Could not open a terminal", why, "failure") : { hide: true };
  }
  if (pref === "terminal" && !cli) return { open: api.webUrl(s.sessionId), hud: "No atc command on this machine: opened the web page" };
  return { open: api.webUrl(s.sessionId) };
}

async function keys(s: Session, bytes: string, done: string): Promise<Effect> {
  if (!s.id || !s.attachable) return toast("Not here", "A terminal session is answered in its terminal", "failure");
  try { await sendKeys(s.id, bytes); } catch (e) { return failed(done.toLowerCase(), e); }
  live.restart();
  return { keep: true, hud: done };
}

/** The actions every place that holds a session shares (palette rows, the popover, the chat); undefined for one the caller handles itself. */
async function act(s: Session, action: string, values?: Record<string, unknown>): Promise<Effect | undefined> {
  switch (action) {
    case "allow": return allows(s) ? keys(s, KEY.enter, ASK[askOf(s)].allowed!) : toast("Nothing to allow", ASK[askOf(s)].allow ? "It is not asking for anything" : "A question is answered where its options show", "failure");
    case "interrupt": return interrupts(s) ? keys(s, KEY.escape, s.state === "needs-you" ? ASK[askOf(s)].refused : "Interrupted") : toast("Nothing to interrupt", undefined, "failure");
    case "terminal": return openIn(s, "terminal");
    case "web": return openIn(s, "browser");
    case "outputs": return { push: { extension: EXT, palette: "outputs", args: { session: s.sessionId }, title: truncate(s.title, 32) } };
    case "copy-id": return { copy: s.sessionId };
    case "copy-resume": return { copy: `claude --resume ${s.sessionId}` };
    case "copy-folder": return { copy: s.cwd };
    case "pin": case "unpin": case "park": case "unpark": {
      const field = action.endsWith("pin") ? "pinned" : "parked";
      try { await api.patch(s.sessionId, { [field]: !action.startsWith("un") }); } catch (e) { return failed(action, e); }
      live.restart();
      return { keep: true, hud: DONE[action] };
    }
    case "rename": return { form: { id: s.sessionId, title: "Rename", fields: [{ kind: "text", id: "name", label: "Name", default: s.name || s.title, required: true }], submit: { id: "rename-save", title: "Rename" } } };
    case "rename-save": {
      try { await api.patch(s.sessionId, { name: String(values?.name ?? "").trim() }); } catch (e) { return failed("rename", e); }
      live.restart();
      return { keep: true, hud: "Renamed" };
    }
    case "stop": {
      if (!s.id) return toast("Not a background session", "Only atc's background sessions stop from here", "failure");
      try { await api.stop(s.id); } catch (e) { return failed("stop it", e); }
      live.restart();
      return { keep: true, hud: `Stopped ${truncate(s.title, 40)}` };
    }
    case "remove": {
      if (!s.id) return toast("Nothing to remove", "Only a stopped background session leaves the list", "failure");
      try { await api.remove(s.id); } catch (e) { return failed("remove it", e); }
      live.restart();
      return { keep: true, hud: "Removed from the list" };
    }
    case "resume": {
      try { await ready(s); } catch (e) { return failed("resume it", e); }
      return chatPush(s.sessionId, s.title);
    }
  }
  return undefined;
}

const DONE: Record<string, string> = { pin: "Pinned", unpin: "Unpinned", park: "Parked", unpark: "Unparked", stop: "Stopped" };
const MULTI = new Set(["pin", "unpin", "park", "unpark", "stop", "copy-id", "copy-resume", "copy-folder"]);

async function actMany(list: Session[], action: string): Promise<Effect> {
  if (action.startsWith("copy-")) return { copy: list.map((s) => (action === "copy-id" ? s.sessionId : action === "copy-folder" ? s.cwd : `claude --resume ${s.sessionId}`)).join("\n") };
  let n = 0;
  for (const s of list) { const r = await act(s, action); if (r && !r.toast) n++; }
  return { keep: true, hud: `${DONE[action] ?? "Done"}: ${n} session${n === 1 ? "" : "s"}` };
}

// ---- the chat ------------------------------------------------------------------------------

/** Per open chat (by the key it was opened with): the session it resolved to and the conversation fetched for it. */
type Chat = { key: string; sid?: string; messages: Message[]; start: number; attached: string[]; seen?: string; problem?: string };
const chats = new Map<string, Chat>();
const chatPush = (key: string, title?: string): Effect => ({ push: { extension: EXT, palette: "chat", args: { session: key }, ...(title && { title: truncate(title, 32) }) } });

async function loadChat(c: Chat, s: Session | undefined, force = false) {
  if (!s) return;
  c.sid = s.sessionId;
  const stamp = `${s.updated}|${s.state}|${s.activity ?? ""}`;
  if (!force && c.seen === stamp && c.messages.length) return;
  c.seen = stamp;
  try {
    const p = await api.transcript(s.sessionId);
    c.messages = p.messages ?? [];
    c.start = p.start;
    c.problem = undefined;
  } catch (e) {
    // A session just started has no transcript yet.
    c.problem = e instanceof ApiError && e.status === 404 ? undefined : problemOf(e);
  }
}

/** A placeholder for a session atc does not list (yet): one just started, or gone. */
const placeholder = (key: string): Session => ({ sessionId: key, kind: "background", state: "working", attachable: false, title: "Starting…", cwd: "" });

async function chatView(key: string | undefined, compact?: boolean, force = false): Promise<View> {
  let list: Session[] = [];
  try { list = await sessions(); } catch (e) {
    return renderChat({ s: { ...placeholder(key ?? "atc"), title: "atc", state: "stopped" }, messages: [], more: false, attached: [], now: now(), compact, problem: problemOf(e) });
  }
  let s = key ? find(list, key) : urgent(list);
  if (!s && key) s = (await api.history("", 200).catch(() => [] as Session[])).find((x) => x.sessionId === key);
  const k = key ?? s?.sessionId ?? "atc";
  let c = chats.get(k);
  if (!c) { c = { key: k, messages: [], start: 0, attached: [] }; chats.set(k, c); }
  await loadChat(c, s, force);
  const v = renderChat({ s: s ?? placeholder(k), messages: c.messages, more: c.start > 0, attached: c.attached, now: now(), compact, problem: !s && !key ? "Nothing to show: no session is running" : c.problem });
  return { ...v, id: k };
}

async function chatPick(key: string, action: string, ctx?: Ctx): Promise<Effect> {
  const c = chats.get(key) ?? { key, messages: [], start: 0, attached: [] };
  chats.set(key, c);
  const list = await sessions().catch(() => [] as Session[]);
  const s = find(list, c.sid ?? key) ?? (await api.history("", 200).catch(() => [] as Session[])).find((x) => x.sessionId === (c.sid ?? key));
  if (!s) return toast("Session not found", "atc no longer lists it", "failure");
  const redraw = async (): Promise<Effect> => ({ view: await chatView(key, ctx?.compact) });
  switch (action) {
    case "send": {
      const text = String(ctx?.values?.input ?? "");
      if (!text.trim() && !c.attached.length) return { keep: true };
      try { await sendTo(s, text, c.attached); } catch (e) { return failed("send it", e); }
      c.attached = [];
      live.restart();
      const v = await chatView(key, ctx?.compact, true);
      // The field empties only by closing: answer without it, then put it back.
      setTimeout(() => liveView.update(v, { palette: "chat", id: key }).catch(() => {}), REOPEN_MS);
      const { input: _, ...closed } = v;
      return { view: closed };
    }
    case "attach-clipboard": {
      const [e] = await clipboard.list({ limit: 1 }).catch(() => []);
      if (!e) return toast("The clipboard is empty", undefined, "failure");
      if (e.kind === "text") return { view: { ...(await chatView(key, ctx?.compact)), input: { value: `${String(ctx?.values?.input ?? "")}${e.text ?? ""}`, placeholder: "Message", submit: "send" } } };
      const paths = e.kind === "image" ? [e.image!] : e.files ?? [];
      try { for (const p of paths) c.attached.push(await api.upload(s.sessionId, p)); } catch (err) { return failed("attach it", err); }
      return redraw();
    }
    case "detach": c.attached = []; return redraw();
    case "older": {
      if (!c.start) return { keep: true };
      try { const p = await api.transcript(s.sessionId, c.start); c.messages = [...(p.messages ?? []), ...c.messages]; c.start = p.start; } catch (e) { return failed("fetch older messages", e); }
      return { view: renderChat({ s, messages: c.messages, more: c.start > 0, attached: c.attached, now: now(), compact: ctx?.compact }) };
    }
    case "copy-reply": {
      const r = [...c.messages].reverse().find((m) => m.role === "assistant" && m.text);
      return r ? { copy: r.text! } : toast("No reply yet", undefined, "failure");
    }
  }
  const r = await act(s, action, ctx?.values);
  if (!r) return { keep: true };
  return r.keep ? { ...r, ...(await redraw()) } : r;
}

// While a chat is shown, every change atc streams about its session redraws it.
let hooked = false;
function hookViews() {
  if (hooked) return;
  hooked = true;
  live.listen(async (list) => {
    for (const ev of liveView.open()) {
      if (ev.extension !== EXT || ev.palette !== "chat" || !ev.id) continue;
      const c = chats.get(ev.id);
      const s = find(list, c?.sid ?? ev.id);
      if (!c || !s || c.seen === `${s.updated}|${s.state}|${s.activity ?? ""}`) continue;
      liveView.update(await chatView(ev.id, ev.compact), { palette: "chat", id: ev.id }).catch(() => {});
    }
    renderBar().then((item) => bar.update(ITEM, item, EXT)).catch(() => {});
  });
  liveView.onHidden((ev) => { if (ev.palette === "chat" && ev.id && !liveView.open().some((o) => o.id === ev.id)) chats.delete(ev.id); }, EXT);
}

// ---- the sessions palette ---------------------------------------------------------------

const ARGS: Arg[] = [{ id: "text", placeholder: "Message" }];
const FILTERS = [{ id: "all", title: "All" }, { id: "needs", title: "Needs you" }, { id: "running", title: "Running" }, { id: "pinned", title: "Pinned" }];

function rowActions(s: Session): Action[] {
  const live = !!s.id && s.attachable;
  return [
    { id: "chat", title: sendable(s) ? "Open the chat (sends what is typed first)" : "Open the chat" },
    ...(allows(s) ? [{ id: "allow", title: ASK[askOf(s)].allow!, shortcut: "cmd+y" }] : []),
    ...(interrupts(s) ? [{ id: "interrupt", title: interruptTitle(s), shortcut: "cmd+." }] : []),
    ...(live ? [{ id: "terminal", title: "Open in a terminal", shortcut: "cmd+o" }] : []),
    ...(s.state === "stopped" ? [{ id: "resume", title: "Resume", shortcut: "cmd+shift+r" }] : []),
    { id: "web", title: "Open in atc's web page", shortcut: "cmd+shift+o" },
    { id: "outputs", title: "Outputs", shortcut: "cmd+u" },
    { id: s.pinned ? "unpin" : "pin", title: s.pinned ? "Unpin" : "Pin", shortcut: "cmd+shift+p", multi: true as const },
    { id: s.parked ? "unpark" : "park", title: s.parked ? "Unpark" : "Park", multi: true as const },
    { id: "rename", title: "Rename", shortcut: "cmd+shift+e" },
    { id: "copy-resume", title: "Copy resume command", shortcut: "cmd+c", multi: true as const },
    { id: "copy-id", title: "Copy session id", shortcut: "cmd+shift+c", multi: true as const },
    { id: "copy-folder", title: "Copy folder path", multi: true as const },
    ...(s.id && s.attachable && s.kind === "background" ? [{ id: "stop", title: "Stop the session", shortcut: "cmd+d", style: "destructive" as const, multi: true as const, confirm: "Stop it? The conversation is kept and can be resumed." }] : []),
    ...(s.id && s.state === "stopped" ? [{ id: "remove", title: "Remove from the list", style: "destructive" as const }] : []),
  ];
}

function item(s: Session, hosts: boolean): Item {
  const acc: Accessory[] = [{ tag: s.parked ? "parked" : STATE[s.state].tag, color: s.parked ? "grey" : STATE[s.state].color }];
  if (s.pinned) acc.unshift({ text: "pinned" });
  if (s.context) acc.push({ text: tokens(s.context) });
  const t = since(s);
  if (t) acc.push({ date: t });
  return {
    id: s.sessionId,
    name: s.title || folder(s.cwd),
    subtitle: subtitle(s, hosts),
    icon: { glyph: "\u{ec82}", color: s.parked ? "slate" : ({ red: "red", amber: "amber", blue: "blue", grey: "slate" } as const)[STATE[s.state].color as "red" | "amber" | "blue" | "grey"] },
    keywords: [s.host ?? "", folder(s.cwd), s.branch ?? "", s.id ?? "", s.name ?? ""].filter(Boolean),
    accessories: acc,
    actions: rowActions(s),
    ...(sendable(s) && { args: ARGS }),
  };
}

async function list(ctx?: Ctx): Promise<Item[]> {
  let all: Session[];
  try { all = await sessions(ctx?.refresh); } catch (e) { return [hint("problem", problemOf(e), server().url || undefined)]; }
  const rows = ordered(all).filter((s) => {
    switch (ctx?.filter) {
      case "needs": return s.state === "needs-you";
      case "running": return s.state === "working" || s.state === "needs-you";
      case "pinned": return !!s.pinned;
      default: return true;
    }
  });
  const hosts = new Set(all.map((s) => s.host)).size > 1;
  return rows.length ? rows.map((s) => item(s, hosts)) : [hint("none", ctx?.filter && ctx.filter !== "all" ? "Nothing here" : "No sessions", "New Session starts one")];
}

async function detail(id: string): Promise<Detail> {
  const s = find(await sessions().catch(() => []), id);
  if (!s) return { markdown: "atc no longer lists this session." };
  const md: string[] = [];
  const doing = activity(s.activity);
  if (s.state === "needs-you") md.push(askOf(s) === "run" ? `**Asks to run** \`${mdEscape(doing || "a tool")}\`` : `**${ASK[askOf(s)].heading}**`);
  else if (s.state === "working" && doing) md.push(`*Working:* ${mdEscape(doing)}`);
  if (s.lastPrompt) md.push(`**You**\n\n${mdEscape(s.lastPrompt)}`);
  if (s.lastReply) md.push(`**Claude**\n\n${s.lastReply}`);
  const meta: Metadata[] = [
    { label: "State", tags: [{ text: s.parked ? "parked" : STATE[s.state].tag, color: s.parked ? "grey" : STATE[s.state].color }] },
    ...(s.host ? [{ label: "Machine", value: s.host }] : []),
    { label: "Folder", value: short(s.cwd) },
    ...(s.branch && s.branch !== "HEAD" ? [{ label: "Branch", value: s.branch }] : []),
    ...(s.model ? [{ label: "Model", value: s.model }] : []),
    ...(s.context ? [{ label: "Context", value: `${tokens(s.context)} tokens` }] : []),
    ...(s.permissionMode ? [{ label: "Permissions", value: s.permissionMode === "bypassPermissions" ? "never asks" : s.permissionMode }] : []),
    ...(s.startedAt ? [{ label: "Started", value: when(at(s.startedAt)) }] : []),
    ...(s.updated ? [{ label: "Last activity", value: when(at(s.updated)) }] : []),
    ...(s.servers?.length ? [{ label: "Serving", value: s.servers.map((p) => `:${p}`).join(" ") }] : []),
    { label: "Kind", value: s.kind === "interactive" ? "in a terminal" : s.kind },
    { label: "Session", value: s.sessionId },
  ];
  return { markdown: md.join("\n\n") || "*Nothing said yet.*", metadata: meta };
}

async function pick(id: string, action?: string, ctx?: Ctx): Promise<Effect> {
  if (id.startsWith("hint:")) return { keep: true };
  const list = await sessions().catch(() => [] as Session[]);
  const ids = ctx?.ids ?? [id];
  if (action && MULTI.has(action) && ids.length > 1) return actMany(ids.map((x) => find(list, x)).filter((x): x is Session => !!x), action);
  const s = find(list, id);
  if (!s) return toast("Session not found", "atc no longer lists it", "failure");
  if (!action || action === "chat") {
    const text = String(ctx?.values?.text ?? "").trim();
    if (text) { try { await sendTo(s, text); } catch (e) { return failed("send it", e); } live.restart(); }
    return chatPush(s.sessionId, s.title);
  }
  return (await act(s, action, ctx?.values)) ?? { keep: true };
}

// ---- new sessions ------------------------------------------------------------------------

const NEW_ARGS: Arg[] = [{ id: "prompt", placeholder: "First message" }, { id: "name", placeholder: "Name" }];

async function folders(): Promise<Item[]> {
  let me: api.Me;
  try { me = await api.me(); } catch (e) { return [hint("problem", problemOf(e))]; }
  const hosts = me.hosts?.length ? me.hosts : [me.host];
  const all = await Promise.all(hosts.map(async (h) => ({ h, dirs: await api.dirs(h === me.host ? undefined : h).catch(() => [] as api.Dir[]) })));
  const many = hosts.length > 1;
  const rows: Item[] = [];
  for (const { h, dirs } of all) {
    for (const d of dirs) {
      rows.push({
        id: `${h}\t${d.path}`,
        name: short(d.path),
        subtitle: [many ? h : undefined, d.recent ? "recent" : undefined, d.git ? "git" : undefined].filter(Boolean).join(" · "),
        icon: d.git ? "\u{f02a2}" : "\u{f024b}",
        keywords: [h, folder(d.path)],
        args: NEW_ARGS,
        actions: [{ id: "start", title: `Start a session${many ? ` on ${h}` : ""}` }, ...(d.git ? [{ id: "worktree", title: "Start in a new worktree", shortcut: "cmd+enter" }] : [])],
      });
    }
  }
  rows.push({ id: "other", name: "Another folder…", subtitle: "Any folder, on any machine", icon: "\u{f0257}", actions: [{ id: "form", title: "Choose" }] });
  return rows;
}

function newForm(hosts: string[], values?: Record<string, unknown>, errors?: Record<string, string>): Effect {
  return { form: {
    id: "other",
    title: "New Session",
    fields: [
      ...(hosts.length > 1 ? [{ kind: "select" as const, id: "host", label: "Machine", options: hosts.map((h) => ({ id: h, title: h })), default: String(values?.host ?? hosts[0]) }] : []),
      { kind: "text", id: "dir", label: "Folder", placeholder: "~/proj/app", required: true, default: String(values?.dir ?? "~") },
      { kind: "textarea", id: "prompt", label: "First message", default: String(values?.prompt ?? "") },
      { kind: "text", id: "name", label: "Name", default: String(values?.name ?? "") },
      { kind: "checkbox", id: "worktree", label: "Worktree", text: "In a new git worktree" },
    ],
    submit: { id: "create", title: "Start" },
    ...(errors && { errors }),
  } };
}

async function startOne(o: { host?: string; dir: string; prompt?: string; name?: string; worktree?: boolean }, me?: api.Me): Promise<Effect> {
  let id: string;
  try { id = await api.start({ ...o, host: o.host && o.host !== me?.host ? o.host : undefined }); } catch (e) { return failed("start it", e); }
  live.restart();
  return chatPush(id, o.name || folder(o.dir));
}

async function newPick(id: string, action?: string, ctx?: Ctx): Promise<Effect> {
  if (id.startsWith("hint:")) return { keep: true };
  const me = await api.me().catch(() => undefined);
  const v = ctx?.values ?? {};
  if (id === "other") {
    if (action !== "create") return newForm(me?.hosts ?? [], v);
    const dir = String(v.dir ?? "").trim();
    if (!dir.startsWith("/") && !dir.startsWith("~")) return newForm(me?.hosts ?? [], v, { dir: "A full path, or one under ~" });
    return startOne({ host: v.host ? String(v.host) : undefined, dir, prompt: String(v.prompt ?? ""), name: String(v.name ?? ""), worktree: !!v.worktree }, me);
  }
  const [host, dir] = id.split("\t");
  return startOne({ host, dir, prompt: String(v.prompt ?? ""), name: String(v.name ?? ""), worktree: action === "worktree" }, me);
}

// ---- earlier conversations ---------------------------------------------------------------

async function historyList(): Promise<Item[]> {
  let all: Session[];
  try { all = await api.history("", 300); } catch (e) { return [hint("problem", problemOf(e))]; }
  const hosts = new Set(all.map((s) => s.host)).size > 1;
  return all.map((s) => ({
    id: s.sessionId,
    name: s.title || folder(s.cwd),
    subtitle: [hosts ? s.host : undefined, short(s.cwd), s.lastPrompt ? truncate(s.lastPrompt.replace(/\s+/g, " "), 80) : undefined].filter(Boolean).join(" · "),
    icon: "\u{f02da}",
    keywords: [s.host ?? "", folder(s.cwd), s.branch ?? ""].filter(Boolean),
    accessories: [...(s.context ? [{ text: tokens(s.context) }] : []), ...(s.updated ? [{ date: at(s.updated) }] : [])],
    args: ARGS,
    actions: [
      { id: "chat", title: "Read it (a message resumes it)" },
      { id: "resume", title: "Resume", shortcut: "cmd+enter" },
      { id: "web", title: "Open in atc's web page", shortcut: "cmd+shift+o" },
      { id: "copy-resume", title: "Copy resume command", shortcut: "cmd+c", multi: true },
      { id: "copy-id", title: "Copy session id", shortcut: "cmd+shift+c", multi: true },
    ],
  }));
}

async function historyPick(id: string, action?: string, ctx?: Ctx): Promise<Effect> {
  if (id.startsWith("hint:")) return { keep: true };
  const all = await api.history("", 300).catch(() => [] as Session[]);
  const ids = ctx?.ids ?? [id];
  if (action?.startsWith("copy-") && ids.length > 1) return actMany(ids.map((x) => all.find((s) => s.sessionId === x)).filter((x): x is Session => !!x), action);
  const s = all.find((x) => x.sessionId === id) ?? find(await sessions().catch(() => []), id);
  if (!s) return toast("Conversation not found", undefined, "failure");
  if (!action || action === "chat") {
    const text = String(ctx?.values?.text ?? "").trim();
    if (text) { try { await sendTo(s, text); } catch (e) { return failed("send it", e); } live.restart(); }
    return chatPush(s.sessionId, s.title);
  }
  return (await act(s, action, ctx?.values)) ?? { keep: true };
}

// ---- outputs ---------------------------------------------------------------------------------

async function outputsList(ctx?: Ctx): Promise<Item[]> {
  const only = (ctx?.args as { session?: string } | undefined)?.session;
  let list: Session[];
  try { list = await sessions(); } catch (e) { return [hint("problem", problemOf(e))]; }
  const which = only ? list.filter((s) => s.sessionId === only) : ordered(list).filter((s) => !s.parked && s.state !== "stopped");
  const got = await Promise.all(which.map(async (s) => ({ s, o: await api.outputs(s.sessionId).catch(() => undefined) })));
  const rows: Item[] = [];
  for (const { s, o } of got) {
    if (!o) continue;
    const from = only ? "" : ` · ${truncate(s.title, 40)}`;
    for (const v of o.servers ?? []) if (v.running) rows.push({ id: `srv\t${v.url}`, name: v.url, subtitle: `server${from}`, icon: "\u{f048b}", url: v.url, accessories: [{ tag: "running", color: "green" }], actions: [{ id: "open", title: "Open" }, { id: "copy", title: "Copy address", shortcut: "cmd+c" }] });
    for (const f of (o.files ?? []).slice(0, 30)) rows.push({ id: `file\t${api.absolute(f.url)}\t${f.path}`, name: folder(f.path), subtitle: `${f.op} · ${short(f.path)}${from}`, icon: f.kind === "image" ? "\u{f02e9}" : "\u{f0214}", accessories: [{ date: at(f.at) }], actions: [{ id: "open", title: "Open" }, { id: "copy", title: "Copy path", shortcut: "cmd+c" }] });
    for (const l of (o.links ?? []).slice(0, 20)) rows.push({ id: `link\t${l.url}`, name: l.url, subtitle: `link${from}`, url: l.url, accessories: [{ date: at(l.at) }], actions: [{ id: "open", title: "Open" }, { id: "copy", title: "Copy link", shortcut: "cmd+c" }] });
  }
  return rows.length ? rows : [hint("none", "Nothing yet", only ? "This session has started no server and written or linked nothing" : "No running session has made anything yet")];
}

function outputsPick(id: string, action?: string, ctx?: Ctx): Effect {
  if (id.startsWith("hint:")) return { keep: true };
  const ids = ctx?.ids ?? [id];
  const target = (x: string) => { const [kind, u, path] = x.split("\t"); return action === "copy" ? (kind === "file" ? path : u) : u; };
  return action === "copy" ? { copy: ids.map(target).join("\n") } : { open: ids.map(target) };
}

// ---- the bar item ------------------------------------------------------------------------------

let cursor: string | undefined;
let lastList: Session[] = [];
let lastProblem: string | undefined;

function popoverState(): PopoverState {
  const st: PopoverState = { sessions: lastList, cursor, now: now(), problem: lastProblem };
  const c = current(st);
  cursor = c && keyOf(c);
  return st;
}

export function barItem(list: Session[], problem?: string): BarItem {
  const menu = { view: renderPopover(popoverState()) };
  if (problem && !list.length) return { hidden: true, ...(server().url && { empty: { icon: GLYPH, tooltip: problem, menu } }) };
  const shown = list.filter((s) => !s.parked && s.state !== "past");
  const n = (st: string) => shown.filter((s) => s.state === st).length;
  const needs = n("needs-you"), turn = n("your-turn"), working = n("working");
  if (!needs && !turn && !working) return { hidden: true, empty: { icon: GLYPH, tooltip: "Nothing running", menu } };
  const segments = [
    ...(needs ? [{ id: "needs", text: String(needs), color: "red" as const, tooltip: `${needs} need${needs === 1 ? "s" : ""} you` }] : []),
    ...(turn ? [{ id: "turn", text: String(turn), color: "amber" as const, tooltip: `${turn} your turn` }] : []),
    ...(working ? [{ id: "working", text: String(working), color: "blue" as const, tooltip: `${working} working` }] : []),
  ];
  const words = [needs && `${needs} need${needs === 1 ? "s" : ""} you`, turn && `${turn} your turn`, working && `${working} working`].filter(Boolean);
  const lead = shown.find((s) => s.state === "needs-you");
  return { icon: GLYPH, segments, ...(problem && { stale: true }), tooltip: `${words.join(", ")}${lead ? `\n${lead.title}: ${askOf(lead) === "run" ? activity(lead.activity) || "asks to run a tool" : ASK[askOf(lead)].heading.toLowerCase()}` : ""}`, menu };
}

/** The counts as states (`atc/needs_you`, `atc/your_turn`, `atc/working`), for a rule or a state of the user's to compose. */
function publish(list: Session[]) {
  const n = (st: string) => list.filter((s) => !s.parked && s.state === st).length;
  state.set("needs_you", n("needs-you"), EXT).catch(() => {});
  state.set("your_turn", n("your-turn"), EXT).catch(() => {});
  state.set("working", n("working"), EXT).catch(() => {});
}

async function renderBar(ctx?: BarCtx): Promise<BarItem> {
  hookViews();
  if (ctx?.reason === "wake" || ctx?.reason === "network") live.restart();
  try { lastList = await sessions(ctx?.reason === "every" || ctx?.reason === "open" || ctx?.reason === "wake"); lastProblem = undefined; } catch (e) { lastProblem = problemOf(e); if (e instanceof NotSetUp) lastList = []; }
  publish(lastList);
  return barItem(lastList, lastProblem);
}

async function popoverAction(action: string, ctx: BarCtx): Promise<Effect> {
  switch (action) {
    case "pal": return { push: { extension: EXT, palette: "sessions" } };
    case "new": return { push: { extension: EXT, palette: "new" } };
    case "history": return { push: { extension: EXT, palette: "history" } };
  }
  const st = popoverState();
  const rows = ordered(st.sessions);
  const redraw = (): Effect => ({ view: renderPopover(popoverState()) });
  if (action.startsWith("at:")) { cursor = action.slice(3); return redraw(); }
  if (action === "down" || action === "up") {
    if (!rows.length) return { keep: true };
    const i = rows.findIndex((s) => keyOf(s) === cursor);
    cursor = keyOf(rows[(i + (action === "down" ? 1 : rows.length - 1)) % rows.length]);
    return redraw();
  }
  if (ctx.ids && ctx.ids.length > 1 && MULTI.has(action)) return actMany(ctx.ids.map((k) => rows.find((r) => keyOf(r) === k)).filter((x): x is Session => !!x), action);
  const s = current(st);
  if (!s) return { keep: true };
  if (action === "chat") { hookViews(); return chatPush(s.sessionId, s.title); }
  const r = await act(s, action, ctx.values);
  if (!r) return { keep: true };
  if (r.keep) { lastList = await sessions(true).catch(() => lastList); return { ...redraw(), ...(r.hud && { hud: r.hud }) }; }
  return r;
}

// ---- links ---------------------------------------------------------------------------------

async function link(route: string, params: LinkParams): Promise<Effect | void> {
  const list = await sessions();
  const named = (k: unknown) => { const s = find(list, String(k ?? "")); if (!s) throw new Error(`no session "${k}"`); return s; };
  switch (route) {
    case "open": return chatPush(params.session ? named(params.session).sessionId : (urgent(list)?.sessionId ?? ""));
    case "send": {
      const s = named(params.session);
      const files = params.file ? await Promise.all((Array.isArray(params.file) ? params.file : [params.file]).map((f) => api.upload(s.sessionId, home(String(f))))) : [];
      await sendTo(s, String(params.text ?? ""), files);
      live.restart();
      return { hud: `Sent to ${truncate(s.title, 40)}` };
    }
    case "new": {
      const me = await api.me().catch(() => undefined);
      return startOne({ host: params.host ? String(params.host) : undefined, dir: String(params.dir), prompt: String(params.prompt ?? ""), name: String(params.name ?? ""), worktree: !!params.worktree }, me);
    }
  }
}

export default {
  link,
  palettes: {
    sessions: {
      title: "Sessions",
      live: true,
      multi: true,
      placeholder: "Find a session by title, machine, folder or branch",
      filters: FILTERS,
      list: (_q, ctx) => list(ctx),
      detail,
      pick,
      suggest: async () => {
        const all = await sessions().catch(() => [] as Session[]);
        const hosts = new Set(all.map((s) => s.host)).size > 1;
        return ordered(all).filter((s) => !s.parked && (s.state === "needs-you" || s.state === "your-turn")).slice(0, 2).map((s) => ({ ...item(s, hosts), section: "Claude" }));
      },
    },
    chat: {
      title: "Chat",
      view: (ctx) => { hookViews(); return chatView((ctx?.args as { session?: string } | undefined)?.session, ctx?.compact); },
      pick: (id, action, ctx) => chatPick(id, action ?? "send", ctx),
    },
    new: { title: "New Session", live: true, placeholder: "A folder on any machine", list: folders, pick: newPick },
    history: { title: "Earlier Conversations", placeholder: "Find a conversation by title, folder or what you asked", list: historyList, pick: historyPick, multi: true },
    outputs: { title: "Outputs", live: true, multi: true, placeholder: "Servers, files and links your sessions made", list: (_q, ctx) => outputsList(ctx), pick: outputsPick },
  },
  bar: {
    [ITEM]: { render: renderBar, onAction: popoverAction },
  },
  dispose: () => live.stop(),
} satisfies Extension;
