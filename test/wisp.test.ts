// wisp: view.ts's popover and chat.ts's conversation from made-up rows
// (tabs, sections, the field, the budget), then the extension through the
// harness against wisp-mock.ts: the inbox palette's views and its writes,
// the pane, the conversation (read on open, send, the field put back,
// photos inline), search, accounts, the bar's strip per network, account
// or in all with a due To do and the for-you fact, its popover keys, the
// stream redrawing it, the links, and a refused token or no server.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { render as renderChat, BUDGET, type ChatState } from "../wisp/chat.ts";
import { render as renderPopover, visible, type PopRow, type PopState } from "../wisp/view.ts";
import type { Item, View, ViewNode } from "../.pal/sdk/src/protocol.ts";
import { checkView } from "../.pal/sdk/src/view.ts";
import { Host } from "../.pal/host/test/harness.ts";
import { ADA, FAMILY, GRACE, KARGO, LEASE, Q4, RELEASES, T0, TOKEN, WispMock, conversations, iso, messages } from "./wisp-mock.ts";

const X = "wisp";
const nodes = (n: ViewNode): ViewNode[] => [n, ...("children" in n && n.children ? n.children.flatMap(nodes) : [])];
const texts = (v: View) => nodes(v.tree).flatMap((n) => (n.type === "text" ? [n.value] : []));
const ids = (v: View) => v.actions.filter((a) => !a.hidden).map((a) => a.id);
const tags = (i: Item) => (i.accessories ?? []).flatMap((a) => ("tag" in a ? [a.tag] : []));

describe("wisp views", () => {
  const row = (o: Partial<PopRow> & Pick<PopRow, "id" | "title">): PopRow => ({ line: "hi", time: "10:00", n: 1, forMe: false, channel: "whatsapp", glyph: "x", color: "green", section: "People", group: false, ...o });
  const rows = [row({ id: 1, title: "Ada" }), row({ id: 2, title: "Q4", channel: "gmail", color: "red", section: "Work" }), row({ id: 3, title: "Grace", n: 0, todo: "to do", section: "To do", channel: "gmail" })];
  const pop = (o: Partial<PopState> = {}): View => checkView(renderPopover({ rows, tabs: [{ id: "whatsapp", title: "WhatsApp", glyph: "w", color: "green", n: 1 }, { id: "gmail", title: "Gmail", glyph: "g", color: "red", n: 2 }], tab: "all", later: 0, trouble: [], ...o }));

  test("popover: tabs, a due To do first then the splits, the keys by the cursor's row, a tab narrowing the rows, the reply field, inbox zero", () => {
    const v = pop();
    expect(texts(v)).toEqual(expect.arrayContaining(["All", "To do", "People", "Work"]));
    expect(visible({ rows, tab: "all" }).map((r) => r.id)).toEqual([3, 1, 2]);
    expect(v.title).toBe("2 unread · 1 to do");
    expect(ids(v)).toEqual(["open", "preview", "reply", "unread", "todo", "later", "archive", "web", "pal"]);
    expect(v.actions.find((a) => a.id === "todo")!.title).toBe("Clear the To do");
    expect(ids(pop({ cursor: 1 }))).toContain("read");
    expect(visible({ rows, tab: "gmail" }).map((r) => r.id)).toEqual([3, 2]);
    expect(pop({ tab: "gmail" }).actions.find((a) => a.id === "tab:gmail")!.shortcut).toBe("3");
    expect(pop({ replying: 1, draft: "on my way" }).input).toEqual({ value: "on my way", placeholder: "Message Ada", submit: "send", cancel: "cancel" });
    expect(texts(pop({ rows: [], later: 2 }))).toEqual(expect.arrayContaining(["Inbox zero", "Nothing waiting; 2 To dos for later"]));
    expect(texts(pop({ trouble: [{ id: 4, label: "Acme", glyph: "s", state: "degraded", detail: "2 conversations could not sync" }] }))).toContain("Acme: 2 conversations could not sync");
    expect(texts(pop({ rows: [], problem: "Wisp is unreachable at http://x: refused" }))).toContain("Wisp is out of reach");
  });

  test("conversation: a line per day, theirs and yours, a group's senders, the photo inline, the field where sending is allowed, the budget from the newest back", () => {
    const c = conversations().find((x) => x.id === ADA)!;
    const st = (o: Partial<ChatState> = {}): View => checkView(renderChat({ c, account: "WhatsApp", network: { name: "WhatsApp", glyph: "w", color: "green" }, messages: messages()[ADA], images: { 9001: "data:image/png;base64,AA==" }, senders: {}, more: true, canSend: true, canUnread: true, now: T0, ...o }));
    const v = st();
    expect(texts(v)).toEqual(expect.arrayContaining(["Ada Lindqvist", "Yesterday", "Today", "Are we still on for tonight?", "👍", "Older messages: cmd+["]));
    expect(nodes(v.tree).some((n) => n.type === "badge" && n.text === "2 unread")).toBe(true);
    expect(nodes(v.tree).some((n) => n.type === "image" && n.src.startsWith("data:image/png") && n.action === "attachment:9001")).toBe(true);
    expect(v.input).toEqual({ placeholder: "Message Ada Lindqvist", submit: "send" });
    expect(ids(v)).toEqual(["send", "todo", "later", "waiting", "archive", "read", "web", "copy-last", "older"]);
    expect(st({ canSend: false }).input).toBeUndefined();
    const fam = conversations().find((x) => x.id === FAMILY)!;
    expect(texts(st({ c: fam, messages: messages()[FAMILY] })).filter((t) => t === "Mum" || t === "Tom")).toEqual(["Mum", "Tom", "Mum"]);
    const long = Array.from({ length: 900 }, (_, i) => ({ ...messages()[ADA][2], id: 1000 + i, text: `message ${i}` }));
    const cut = st({ messages: long });
    expect(nodes(cut.tree).length).toBeLessThan(BUDGET + 80);
    expect(texts(cut)).toContain("message 899");
  });
});

describe("wisp", () => {
  let mock: WispMock;
  let host: Host;
  const settings = (extra: Record<string, unknown> = {}) => ({ url: mock.url, token: TOKEN, ...extra });
  const ctx = { reason: "open" as const, compact: true as const };
  const view = (args?: unknown) => host.request<View>("view", { extension: X, palette: "conversation", args });
  const link = (route: string, params: Record<string, unknown>) => host.request<Record<string, unknown>>("link", { extension: X, route, params });

  beforeAll(async () => {
    mock = new WispMock();
    host = await Host.bundled({ settings: { [X]: { settings: settings() } }, only: [X], timeout: 8000 });
  });
  afterAll(() => { host.kill(); mock.stop(); });

  test("meta: four palettes, the bar item, three links, the settings; no warnings", () => {
    const loaded = host.loaded().find((l) => l.extension === X)!;
    expect(loaded.warnings).toEqual([]);
    expect(loaded.palettes.map((p) => [p.name, p.title])).toEqual([["inbox", "Inbox"], ["conversation", "Conversation"], ["search", "Search Wisp"], ["accounts", "Wisp Accounts"]]);
    expect(loaded.bar.map((b) => b.id)).toEqual(["inbox"]);
    expect(Object.keys(loaded.manifest.links ?? {})).toEqual(["open", "search", "send"]);
  });

  test("inbox: Wisp's Inbox under its sections with pictures, counts and To dos; the other views; the pane; the writes", async () => {
    mock.reset();
    const rows = await host.list(X, "inbox", "", { refresh: true });
    expect(rows.map((r) => [r.id, r.section])).toEqual([[String(GRACE), "To do"], [String(ADA), "People"], [String(Q4), "Work"], [String(RELEASES), "Work"], [String(FAMILY), "Groups"], [String(KARGO), "Paper"]]);
    const ada = rows[1];
    expect(ada).toMatchObject({ name: "Ada Lindqvist", subtitle: "Are we still on for tonight?", icon: { image: expect.stringMatching(/^data:image\/svg\+xml;base64,/) }, args: [{ id: "text" }] });
    expect(ada.keywords).toEqual(["WhatsApp", "WhatsApp"]);
    expect(tags(ada)).toEqual(["2"]);
    expect(tags(rows[3])).toEqual(["@3"]);
    expect(tags(rows[0])).toEqual(["to do"]);
    expect(rows[5].args).toBeUndefined();
    expect((await host.list(X, "inbox", "", { filter: "todo" })).map((r) => [r.id, tags(r)[0]])).toEqual([[String(GRACE), "to do"], [String(LEASE), expect.stringMatching(/^\w{3} \d+ \w{3} \d\d:\d\d$/)]]);
    expect((await host.list(X, "inbox", "", { filter: "screener" }))[0].name).toBe("The Screener is empty");
    const d = await host.detail(X, "inbox", String(Q4));
    expect(d).toMatchObject({ caption: "Gmail · Work", title: "Q4 plan", chips: [{ text: "1 message unread" }] });
    expect(d.markdown).toContain("**Lin Park**");
    expect(await host.pick(X, "inbox", String(ADA))).toEqual({ push: { extension: X, palette: "conversation", args: { id: ADA }, title: "Ada Lindqvist" } });
    expect(await host.pick(X, "inbox", String(Q4), "read", { ids: [String(Q4), String(KARGO)] })).toMatchObject({ hud: "Marked read: 2 conversations" });
    expect(mock.posted(`/api/v1/conversations/${KARGO}/read`)).toHaveLength(1);
    expect(await host.pick(X, "inbox", String(KARGO), "unread")).toMatchObject({ toast: { style: "failure", message: "KARGO: the network has no unread mark" } });
    expect(await host.pick(X, "inbox", String(FAMILY), "later")).toMatchObject({ hud: "To do tomorrow: Family" });
    expect(Date.parse((mock.posted(`/api/v1/conversations/${FAMILY}/todo`)[0].body as { until: string }).until)).toBeGreaterThan(T0);
    expect(await host.pick(X, "inbox", String(GRACE), "todo")).toMatchObject({ hud: "To do cleared: Grace Okafor" });
    expect(await host.pick(X, "inbox", String(RELEASES), "archive")).toMatchObject({ hud: "Done: #releases" });
    expect(await host.pick(X, "inbox", String(ADA), "reply", { values: { text: "yes, 8pm" } })).toMatchObject({ toast: { title: "Sent" } });
    expect(mock.posted(`/api/v1/conversations/${ADA}/messages`)[0].body).toEqual({ text: "yes, 8pm" });
    expect(await host.pick(X, "inbox", String(ADA), "web", { ids: [String(ADA), String(Q4)] })).toEqual({ open: [`${mock.url}/all/${ADA}`, `${mock.url}/all/${Q4}`] });
  });

  test("conversation: opening reads it; the photo inline; a message sent and the field put back; older messages; To do and done redraw it", async () => {
    mock.reset();
    host.viewShown(X, { palette: "conversation" }, String(ADA));
    const v = await view({ id: ADA });
    expect(v.title).toBe("Ada Lindqvist");
    expect(nodes(v.tree).some((n) => n.type === "image" && n.action === "attachment:9001")).toBe(true);
    await host.until(() => mock.posted(`/api/v1/conversations/${ADA}/read`).length === 1);
    const r = await host.pick(X, "conversation", String(ADA), "send", { values: { input: "see you at 8" } });
    expect(mock.posted(`/api/v1/conversations/${ADA}/messages`).at(-1)!.body).toEqual({ text: "see you at 8" });
    expect((r.view as View).input).toBeUndefined();
    expect(texts(r.view as View)).toContain("see you at 8");
    expect((await host.nextViewUpdate(X, { palette: "conversation" }, (u) => !!(u.spec as View).input)).spec).toMatchObject({ input: { submit: "send" } });
    await host.pick(X, "conversation", String(ADA), "older");
    expect(mock.calls.some((c) => c.path === `/api/v1/conversations/${ADA}/messages`)).toBe(true);
    const todo = await host.pick(X, "conversation", String(ADA), "todo");
    expect(todo).toMatchObject({ hud: "To do: Ada Lindqvist" });
    expect(nodes((todo.view as View).tree).some((n) => n.type === "badge" && n.text === "To do")).toBe(true);
    expect(await host.pick(X, "conversation", String(ADA), "attachment:9001")).toEqual({ open: `${mock.url}/all/${ADA}?m=1` });
    // SMS here may not send: no field, and a bare open is the newest in the inbox.
    expect((await view({ id: KARGO })).input).toBeUndefined();
    expect((await view()).id).toBe(String(ADA));
  });

  test("search and accounts: hits open their conversation or Wisp at the message; the account that needs attention first", async () => {
    mock.reset();
    const hits = await host.list(X, "search", "parcel");
    expect(hits[0]).toMatchObject({ name: "Your parcel is out for delivery", subtitle: "KARGO" });
    expect(await host.pick(X, "search", hits[0].id)).toMatchObject({ push: { palette: "conversation", args: { id: KARGO } } });
    expect(await host.pick(X, "search", hits[0].id, "web")).toEqual({ open: `${mock.url}/all/${KARGO}?m=41` });
    expect((await host.list(X, "search", "x"))[0].id).toBe("hint:search");
    const accs = await host.list(X, "accounts", "", { refresh: true });
    expect(accs.map((a) => [a.name, a.section, tags(a).at(-1)])).toEqual([["Acme", "Needs attention", "degraded"], ["WhatsApp", "Accounts", "connected"], ["Personal", "Accounts", "connected"], ["Work", "Accounts", "syncing"], ["SMS", "Accounts", "connected"]]);
    expect(await host.pick(X, "accounts", "4")).toEqual({ open: `${mock.url}/accounts/4` });
  });

  test("bar: a glyph and count per network (per account, one count), the due To do, the facts; the popover's keys; the stream redraws it", async () => {
    mock.reset();
    const item = await host.render(X, "inbox", { reason: "every" });
    expect(item.segments!.map((s) => [s.id, s.text, s.color])).toEqual([["for_me", "1", "red"], ["whatsapp", "2", "green"], ["gmail", "1", "red"], ["sms", "1", "teal"], ["todo", "1", "amber"]]);
    expect(item.states).toEqual({ unread: 4, for_me: 1, todo: 1, now: 2, trouble: 1 });
    expect(item.tooltip!.split("\n")[0]).toBe("1 for you · WhatsApp 2, Gmail 1, SMS 1 · 1 To do due");
    const per = await host.render(X, "inbox", { reason: "every", settings: { split: "account", uncounted: true } });
    expect(per.segments!.map((s) => [s.id, s.text])).toEqual([["for_me", "1"], ["a1", "2"], ["a3", "1"], ["a4", "1"], ["a5", "1"], ["todo", "1"]]);
    const one = await host.render(X, "inbox", { reason: "every", settings: { split: "total" } });
    expect(one.segments!.map((s) => [s.id, s.text, s.icon])).toEqual([["for_me", "1", expect.any(String)], ["all", "4", undefined], ["todo", "1", expect.any(String)]]);
    await host.render(X, "inbox", { reason: "every", settings: {} });
    // The popover: the cursor on the To do, a tab to WhatsApp, down, mark read, the reply field and a send.
    expect(texts((await host.barAction(X, "inbox", "tab:whatsapp", ctx)).view as View)).not.toContain("Q4 plan");
    expect(await host.barAction(X, "inbox", "open", ctx)).toMatchObject({ push: { palette: "conversation", args: { id: ADA } } });
    await host.barAction(X, "inbox", "down", ctx);
    expect(await host.barAction(X, "inbox", "read", ctx)).toMatchObject({ hud: "Marked read: Family" });
    expect((await host.barAction(X, "inbox", "reply", ctx)).view).toMatchObject({ input: { placeholder: "Message Ada Lindqvist" } });
    expect(await host.barAction(X, "inbox", "send", { ...ctx, values: { input: "omw" } })).toMatchObject({ toast: { title: "Sent" } });
    expect(mock.posted(`/api/v1/conversations/${ADA}/messages`).at(-1)!.body).toEqual({ text: "omw" });
    expect(await host.barAction(X, "inbox", "account:4", ctx)).toEqual({ open: `${mock.url}/accounts/4` });
    expect(await host.barAction(X, "inbox", "pal", ctx)).toEqual({ push: { extension: X, palette: "inbox" } });
    await host.until(() => mock.streaming > 0);
    mock.convs.push({ ...conversations()[0], id: 200, accountId: 5, channel: "sms", title: "BANK", lastMessageAt: iso(0), lastPreview: "Your code is 4411", unread: 1 });
    mock.emit("message.new", { conversationId: 200, accountId: 5, channel: "sms", sender: "BANK", conversationTitle: "BANK" });
    const next = await host.nextUpdate(X, "inbox", (i) => i.segments?.find((s) => s.id === "sms")?.text === "2");
    expect(next.segments!.find((s) => s.id === "sms")!.text).toBe("2");
  });

  test("links: open by words of the title, search, send", async () => {
    mock.reset();
    expect(await link("open", { conversation: "family" })).toMatchObject({ push: { palette: "conversation", args: { id: FAMILY } } });
    expect(await link("open", {})).toEqual({ push: { extension: X, palette: "inbox" } });
    expect(await link("search", { q: "kargo" })).toEqual({ push: { extension: X, palette: "search", query: "kargo" } });
    expect(await link("send", { conversation: "ada", text: "running late" })).toEqual({ hud: "Sent to Ada Lindqvist" });
  });

  test("a refused token and no server say so in the palette and keep the bar quiet", async () => {
    host.changeSettings(X, { settings: settings({ token: "wrong" }) });
    expect((await host.list(X, "inbox", "", { refresh: true }))[0]).toMatchObject({ id: "hint:auth", name: "Wisp refused the token" });
    host.changeSettings(X, { settings: settings({ url: "", token: "" }) });
    expect((await host.list(X, "inbox", "", { refresh: true }))[0].id).toBe("hint:url");
    expect((await host.render(X, "inbox", { reason: "every" })).hidden).toBe(true);
    host.changeSettings(X, { settings: settings() });
  });
});
