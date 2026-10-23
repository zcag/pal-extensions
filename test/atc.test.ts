// atc: view.ts's popover and chat.ts's chat from made-up sessions (the
// order, what each kind of ask offers, the field, the node budget), then
// the extension through the harness against atc-mock.ts: the sessions
// palette and its pane, the chat (send, resume first, allow and say no
// through the terminal's websocket, the clipboard), the bar item and its
// popover keys, the event stream redrawing the bar, new sessions on either
// machine, earlier conversations, outputs, the links, a refused token and
// no server at all.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUDGET, render as renderChat, type ChatState } from "../atc/chat.ts";
import { render as renderPopover, ordered, type PopoverState } from "../atc/view.ts";
import type { Item, View, ViewNode } from "../.pal/sdk/src/protocol.ts";
import { checkView } from "../.pal/sdk/src/view.ts";
import { Host } from "../.pal/host/test/harness.ts";
import { AtcMock, CHANGELOG, MIGRATE, PARKED, PARSER, PLAN, RELEASE, SPIKE, T0, TERMINAL, TOKEN, initial, transcripts } from "./atc-mock.ts";

const X = "atc";
// No `atc login` of this machine's leaks in: the fallback reads an empty folder.
process.env.ATC_CONFIG_DIR = mkdtempSync(join(tmpdir(), "atc-config-"));

const nodes = (n: ViewNode): ViewNode[] => [n, ...("children" in n && n.children ? n.children.flatMap(nodes) : [])];
const texts = (v: View) => nodes(v.tree).flatMap((n) => (n.type === "text" ? [n.value] : []));
const keycaps = (v: View) => nodes(v.tree).flatMap((n) => (n.type === "keycap" ? [n.keys] : []));
const ids = (v: View) => v.actions.filter((a) => !a.hidden).map((a) => a.id);
const by = (id: string) => initial().find((s) => s.sessionId === id)!;
const tags = (i: Item) => (i.accessories ?? []).flatMap((a) => ("tag" in a ? [a.tag] : []));

describe("atc views", () => {
  const pop = (o: Partial<PopoverState> = {}): View => checkView(renderPopover({ sessions: initial(), now: T0, ...o }));
  const chat = (o: Partial<ChatState> & Pick<ChatState, "s">): View => checkView(renderChat({ messages: [], more: false, attached: [], now: T0, ...o }));

  test("popover: needs you, your turn, working, stopped, then parked; the machine named on every row; keys by what the cursor's session asks", () => {
    expect(ordered(initial()).map((s) => s.sessionId)).toEqual([PARSER, RELEASE, PLAN, CHANGELOG, TERMINAL, MIGRATE, SPIKE, PARKED]);
    const v = pop();
    expect(texts(v)).toEqual(expect.arrayContaining(["Needs you", "Your turn", "Working", "Stopped", "Parked", "studio · parser · fix-flaky-parser · Bash: go test ./parser/... -count=20", "laptop · ~"]));
    expect(keycaps(v)).toEqual(["enter", "y", "i", "n", "p"]);
    expect(ids(v)).toEqual(["chat", "allow", "interrupt", "terminal", "web", "outputs", "pin", "park", "stop", "new", "history", "pal"]);
    expect(v.actions.find((a) => a.id === "interrupt")!.title).toBe("Say no");
    // A question has no allow (Enter would pick its first answer unread); a plan's allow approves it; a terminal session has neither.
    expect(ids(pop({ cursor: RELEASE }))).not.toContain("allow");
    expect(v.actions.length).toBeGreaterThan(0);
    const plan = pop({ cursor: PLAN });
    expect(plan.actions.find((a) => a.id === "allow")!.title).toBe("Approve the plan");
    expect(plan.actions.find((a) => a.id === "interrupt")!.title).toBe("Keep planning");
    expect(ids(pop({ cursor: TERMINAL }))).toEqual(["chat", "web", "outputs", "pin", "park", "new", "history", "pal"]);
    expect(texts(pop({ sessions: [], problem: "atc is unreachable at http://x: refused" }))).toEqual(expect.arrayContaining(["atc is out of reach", "atc is unreachable at http://x: refused"]));
  });

  test("chat: the ask as a card with its keys, the field only where a message can go, a stopped one resumed first, attachments as badges, the budget from the newest back", () => {
    const run = chat({ s: by(PARSER), messages: transcripts[PARSER] });
    expect(texts(run)).toEqual(expect.arrayContaining(["Fix the flaky parser test", "Asks to run", "Bash: go test ./parser/... -count=20"]));
    expect(keycaps(run)).toEqual(expect.arrayContaining(["cmd+y", "cmd+."]));
    expect(run.input).toEqual({ placeholder: "Message", submit: "send" });
    const question = chat({ s: by(RELEASE) });
    expect(texts(question)).toEqual(expect.arrayContaining(["Asks you a question", "Answer it where its options show: cmd+o opens the terminal"]));
    expect(ids(question)).not.toContain("allow");
    const terminal = chat({ s: by(TERMINAL) });
    expect(terminal.input).toBeUndefined();
    expect(ids(terminal)).toEqual(["web", "outputs", "copy-reply"]);
    expect(chat({ s: by(SPIKE) }).input!.placeholder).toBe("Message (resumes it first)");
    expect(texts(chat({ s: by(MIGRATE) }))).toContain("Working · Edit: internal/db/migrate.go");
    const att = chat({ s: by(CHANGELOG), attached: ["/home/ana/.cache/atc/uploads/x/101500-shot.png"] });
    expect(nodes(att.tree).some((n) => n.type === "badge" && n.text.endsWith("shot.png"))).toBe(true);
    expect(ids(att)).toContain("detach");
    const long = Array.from({ length: 1000 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: `message ${i}`, time: "" }));
    const cut = chat({ s: by(CHANGELOG), messages: long });
    expect(nodes(cut.tree).length).toBeLessThan(BUDGET + 60);
    expect(texts(cut)).toContain("message 999");
    expect(texts(cut).some((t) => /^\d+ earlier entries are not drawn/.test(t))).toBe(true);
  });
});

describe("atc", () => {
  let mock: AtcMock;
  let host: Host;
  const settings = (extra: Record<string, unknown> = {}) => ({ url: mock.url, token: TOKEN, open: "browser", ...extra });
  const ctx = { reason: "open" as const, compact: true as const };
  const view = (args?: unknown) => host.request<View>("view", { extension: X, palette: "chat", args });
  const link = (route: string, params: Record<string, unknown>) => host.request<Record<string, unknown>>("link", { extension: X, route, params });

  beforeAll(async () => {
    mock = new AtcMock();
    host = await Host.bundled({ settings: { [X]: { settings: settings() } }, only: [X], timeout: 8000 });
  });
  afterAll(() => { host.kill(); mock.stop(); });

  test("meta: five palettes, the bar item, three links, the settings; no warnings", () => {
    const loaded = host.loaded().find((l) => l.extension === X)!;
    expect(loaded.warnings).toEqual([]);
    expect(loaded.palettes.map((p) => [p.name, p.title, p.live, p.input, p.lazy, p.tier])).toEqual([
      ["sessions", "Sessions", true, false, true, "primary"],
      ["chat", "Chat", false, true, undefined, undefined],
      ["new", "New Session", true, false, true, undefined],
      ["history", "Earlier Conversations", false, false, true, undefined],
      ["outputs", "Outputs", true, false, true, undefined],
    ]);
    expect(loaded.bar.map((b) => [b.id, b.refresh?.every])).toEqual([["sessions", 30]]);
    expect(Object.keys(loaded.manifest.links ?? {})).toEqual(["open", "send", "new"]);
    expect(loaded.manifest.settings!.map((s) => [s.id, s.kind, s.default])).toEqual([["url", "text", ""], ["token", "secret", ""], ["open", "select", "auto"], ["terminal", "select", "auto"]]);
  });

  test("sessions: atc's order with the machine, folder, branch and what each asks; the args where a message can go; the pane; the filters", async () => {
    const rows = await host.list(X, "sessions");
    expect(rows.map((r) => r.id)).toEqual([PARSER, RELEASE, PLAN, CHANGELOG, TERMINAL, MIGRATE, SPIKE, PARKED]);
    expect(rows[0]).toMatchObject({ name: "Fix the flaky parser test", subtitle: "studio · parser · fix-flaky-parser · Bash: go test ./parser/... -count=20", args: [{ id: "text", placeholder: "Message" }] });
    expect(tags(rows[0])).toEqual(["needs you"]);
    expect(rows[0].actions!.slice(0, 3).map((a) => a.id)).toEqual(["chat", "allow", "interrupt"]);
    expect(rows.find((r) => r.id === TERMINAL)!.args).toBeUndefined();
    expect(tags(rows.find((r) => r.id === PARKED)!)).toEqual(["parked"]);
    expect((await host.list(X, "sessions", "", { filter: "needs" })).map((r) => r.id)).toEqual([PARSER, RELEASE, PLAN]);
    const d = await host.detail(X, "sessions", PARSER);
    expect(d.markdown).toContain("**Asks to run** `Bash: go test ./parser/... -count=20`");
    expect(d.metadata).toEqual(expect.arrayContaining([{ label: "Machine", value: "studio" }, { label: "Context", value: "92k tokens" }]));
    expect((await host.detail(X, "sessions", RELEASE)).markdown).toContain("**Asks you a question**");
  });

  test("chat: Enter pushes it (sending what was typed first); the view; a message sent, a stopped one resumed first, the field reopened empty", async () => {
    expect(await host.pick(X, "sessions", CHANGELOG)).toEqual({ push: { extension: X, palette: "chat", args: { session: CHANGELOG }, title: "Write the changelog" } });
    expect(await host.pick(X, "sessions", CHANGELOG, "chat", { values: { text: "add the date" } })).toMatchObject({ push: { palette: "chat" } });
    expect(mock.posted("/api/sessions/ad516e84/send").at(-1)!.body).toEqual({ text: "add the date" });
    const v = await view({ session: CHANGELOG });
    expect(texts(v)).toEqual(expect.arrayContaining(["Write the changelog", "write the changelog for 2.4 from the merged pull requests"]));
    // A bare open is the session that needs you most.
    expect((await view()).title).toBe("Fix the flaky parser test");
    host.viewShown(X, { palette: "chat" }, CHANGELOG);
    const r = await host.pick(X, "chat", CHANGELOG, "send", { values: { input: "and the migration notes" } });
    expect(mock.posted("/api/sessions/ad516e84/send").at(-1)!.body).toEqual({ text: "and the migration notes" });
    expect((r.view as View).input).toBeUndefined();
    expect((await host.nextViewUpdate(X, { palette: "chat" }, (u) => !!(u.spec as View).input)).spec).toMatchObject({ input: { submit: "send" } });
    expect(await host.pick(X, "chat", SPIKE, "send", { values: { input: "pick this up again" } })).toHaveProperty("view");
    expect(mock.calls.filter((c) => c.method === "POST").slice(-2).map((c) => c.path)).toEqual([`/api/sessions/${SPIKE}/resume`, "/api/sessions/d0849bb7/send"]);
    expect(await host.pick(X, "chat", TERMINAL, "send", { values: { input: "hi" } })).toMatchObject({ toast: { title: "Could not send it" } });
    // The clipboard's text goes into the field.
    expect((await host.pick(X, "chat", CHANGELOG, "attach-clipboard", { values: { input: "see: " } })).view).toMatchObject({ input: { value: "see: hello world" } });
  });

  test("allow and say no: the key written into the session's terminal at the size it already has; a question gets no allow", async () => {
    const allow = host.pick(X, "chat", PARSER, "allow");
    await host.until(() => !!mock.keys["6f1d2a40"]);
    expect(await host.after(allow, 300)).toMatchObject({ hud: "Allowed" });
    expect(mock.keys["6f1d2a40"]).toEqual(["\r"]);
    expect(mock.resized).toEqual([{ cols: 157, rows: 52 }]);
    expect(await host.pick(X, "sessions", RELEASE, "allow")).toMatchObject({ toast: { title: "Nothing to allow", message: "A question is answered where its options show" } });
    const no = host.pick(X, "sessions", RELEASE, "interrupt");
    await host.until(() => !!mock.keys["7a2e3b51"]);
    expect(await host.after(no, 300)).toMatchObject({ hud: "Question dismissed" });
    expect(mock.keys["7a2e3b51"]).toEqual(["\x1b"]);
  });

  test("bar: a count per state, the lead's ask in the tooltip, the states published; the popover's keys; the stream redraws it", async () => {
    mock.sessions = initial();
    const item = await host.render(X, "sessions", { reason: "every" });
    expect(item.segments!.map((s) => [s.id, s.text, s.color])).toEqual([["needs", "3", "red"], ["turn", "2", "amber"], ["working", "1", "blue"]]);
    expect(item.tooltip).toBe("3 need you, 2 your turn, 1 working\nFix the flaky parser test: Bash: go test ./parser/... -count=20");
    expect(await host.barAction(X, "sessions", "down", ctx)).toHaveProperty("view");
    expect(await host.barAction(X, "sessions", "chat", ctx)).toMatchObject({ push: { palette: "chat", args: { session: RELEASE } } });
    expect(await host.barAction(X, "sessions", "new", ctx)).toEqual({ push: { extension: X, palette: "new" } });
    await host.until(() => mock.streaming > 0);
    mock.sessions = mock.sessions.map((s) => (s.state === "needs-you" ? { ...s, state: "working" as const } : s));
    mock.emit();
    const next = await host.nextUpdate(X, "sessions", (i) => i.segments?.length === 2);
    expect(next.segments!.map((s) => s.id)).toEqual(["turn", "working"]);
  });

  test("new: the folders of both machines with the first message in the bar; a start on the peer names it; another folder through a form", async () => {
    const rows = await host.list(X, "new");
    expect(rows.map((r) => [r.name, r.subtitle])).toEqual([["~/proj/api", "studio · recent · git"], ["~/proj/parser", "studio · recent · git"], ["~/scratch", "studio"], ["~/proj/app", "laptop · recent · git"], ["Another folder…", "Any folder, on any machine"]]);
    const go = await host.pick(X, "new", "laptop\t/Users/ana/proj/app", "worktree", { values: { prompt: "bump the version", name: "release" } });
    expect(go).toMatchObject({ push: { palette: "chat", title: "release" } });
    expect(mock.calls.filter((c) => c.method === "POST").at(-1)).toEqual({ method: "POST", path: "/api/sessions?host=laptop", body: { dir: "/Users/ana/proj/app", prompt: "bump the version", name: "release", worktree: true } });
    await host.pick(X, "new", "studio\t/home/ana/scratch", "start", { values: { prompt: "", name: "" } });
    expect(mock.calls.filter((c) => c.method === "POST").at(-1)!.path).toBe("/api/sessions");
    expect((await host.pick(X, "new", "other")).form!.fields.map((f) => f.id)).toEqual(["host", "dir", "prompt", "name", "worktree"]);
    expect((await host.pick(X, "new", "other", "create", { values: { dir: "proj" } })).form!.errors).toEqual({ dir: "A full path, or one under ~" });
  });

  test("history and outputs: earlier conversations read or resumed; what a session made, opened or copied", async () => {
    const h = await host.list(X, "history");
    expect(h.at(-1)).toMatchObject({ name: "Rename the config keys", subtitle: "studio · ~/proj/app · rename max_conns to max_connections everywhere" });
    expect(await host.pick(X, "history", h.at(-1)!.id)).toMatchObject({ push: { palette: "chat" } });
    const o = await host.list(X, "outputs", "", { args: { session: MIGRATE } });
    expect(o.map((r) => [r.name, r.subtitle])).toEqual([["http://studio:5173", "server"], ["migrate.go", "edited · ~/proj/api/internal/db/migrate.go"], ["https://www.postgresql.org/docs/current/sql-copy.html", "link"]]);
    expect(await host.pick(X, "outputs", o[1].id)).toEqual({ open: [`${mock.url}/api/sessions/x/o/tok/home/ana/proj/api/internal/db/migrate.go`] });
    expect(await host.pick(X, "outputs", o[1].id, "copy")).toEqual({ copy: "/home/ana/proj/api/internal/db/migrate.go" });
  });

  test("links: send with a file uploaded and named in the message, open by words of the title, new", async () => {
    const file = join(process.env.ATC_CONFIG_DIR!, "shot.png");
    await Bun.write(file, "png");
    expect(await link("send", { session: "changelog", text: "this one", file: [file] })).toEqual({ hud: "Sent to Write the changelog" });
    expect(mock.posted("/api/sessions/ad516e84/send").at(-1)!.body).toEqual({ text: `this one @/home/ana/.cache/atc/uploads/${CHANGELOG}/101500-shot.png` });
    expect(await link("open", { session: "postgres" })).toMatchObject({ push: { args: { session: MIGRATE } } });
    expect(await link("new", { dir: "~/proj/api", prompt: "add an index" })).toMatchObject({ push: { palette: "chat" } });
  });

  test("a refused token and no server at all say so in the palette and keep the bar quiet", async () => {
    host.changeSettings(X, { settings: settings({ token: "wrong" }) });
    expect((await host.list(X, "sessions", "", { refresh: true }))[0]).toMatchObject({ id: "hint:problem", name: "atc refused the token: check it under Settings › Extensions › atc" });
    host.changeSettings(X, { settings: settings({ url: "", token: "" }) });
    expect((await host.list(X, "sessions", "", { refresh: true }))[0].name).toBe("No atc server yet: set it under Settings › Extensions › atc, or run atc login");
    expect(await host.render(X, "sessions", { reason: "every" })).toEqual({ hidden: true });
    host.changeSettings(X, { settings: settings() });
  });
});
