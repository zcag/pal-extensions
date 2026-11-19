// wisp: view.ts's popover and chat.ts's conversation from made-up rows
// (tabs, sections, the field, the budget), then the extension through the
// harness against wisp-mock.ts: the inbox palette's views and its writes,
// the pane, the conversation (read on open, send, the field put back,
// photos inline; Wisp's summary, a suggested reply into the field, a reply
// to one message, a reaction, a transcript), Conversations and New Message,
// search, accounts, the bar's strip per network, account
// or in all with a due To do and the for-you fact, its popover keys, the
// stream redrawing it, the links, and a refused token or no server.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { render as renderChat, BUDGET, type ChatState } from "../wisp/chat.ts";
import { MAX_ROWS, READ_SHOWN, render as renderPopover, visible, type PopRow, type PopState } from "../wisp/view.ts";
import type { Item, View, ViewNode } from "../.pal/sdk/src/protocol.ts";
import { checkView } from "../.pal/sdk/src/view.ts";
import { Host } from "../.pal/host/test/harness.ts";
import { ADA, DESIGN, DRAFT, FAMILY, GRACE, KARGO, LEASE, Q4, RELEASES, SUMMARY, T0, TOKEN, TOM, WispMock, conversations, iso, messages } from "./wisp-mock.ts";

const X = "wisp";
const nodes = (n: ViewNode): ViewNode[] => [n, ...("children" in n && n.children ? n.children.flatMap(nodes) : [])];
const texts = (v: View) => nodes(v.tree).flatMap((n) => (n.type === "text" ? [n.value] : []));
const ids = (v: View) => v.actions.filter((a) => !a.hidden).map((a) => a.id);
const tags = (i: Item) => (i.accessories ?? []).flatMap((a) => ("tag" in a ? [a.tag] : []));

describe("wisp views", () => {
  const row = (o: Partial<PopRow> & Pick<PopRow, "id" | "title">): PopRow => ({ line: "hi", time: "10:00", n: 1, forMe: false, channel: "whatsapp", glyph: "x", color: "green", group: false, ...o });
  const read = Array.from({ length: 6 }, (_, i) => row({ id: 11 + i, title: `R${i}`, n: 0 }));
  const rows = [row({ id: 1, title: "Ada" }), row({ id: 2, title: "Q4", channel: "gmail", color: "red", forMe: true }), row({ id: 3, title: "Grace", n: 0, todo: "to do", channel: "gmail" }), ...read];
  const pop = (o: Partial<PopState> = {}): View => checkView(renderPopover({ rows, tabs: [{ id: "whatsapp", title: "WhatsApp", glyph: "w", color: "green", n: 1 }, { id: "gmail", title: "Gmail", glyph: "g", color: "red", n: 2 }], tab: "all", later: 0, trouble: [], ...o }));

  test("popover: one row of chips, Unread (for you first) then To do then the first read lines, the keys by the cursor's row, a tab narrowing the rows, the reply field, inbox zero", () => {
    const v = pop();
    expect(texts(v)).toEqual(expect.arrayContaining(["All", "Unread", "To do", "Read", "2 more", "Show all"]));
    expect(visible({ rows, tab: "all" }).map((r) => r.id)).toEqual([2, 1, 3, 11, 12, 13, 14]);
    expect(visible({ rows, tab: "all", allRead: true })).toHaveLength(9);
    expect(texts(pop({ allRead: true }))).not.toContain("2 more");
    expect(v.title).toBe("2 unread · 1 for you · 1 to do");
    expect(ids(v)).toEqual(["open", "preview", "reply", "read", "todo", "later", "archive", "web", "pal", "all-read"]);
    expect(pop({ cursor: 3 }).actions.find((a) => a.id === "todo")!.title).toBe("Clear the To do");
    expect(ids(pop({ cursor: 3 }))).toContain("unread");
    expect(visible({ rows, tab: "gmail" }).map((r) => r.id)).toEqual([2, 3]);
    expect(pop({ tab: "gmail" }).actions.find((a) => a.id === "tab:gmail")!.shortcut).toBe("3");
    // More networks than fit: one row, the rest behind +N, which shows them all over two rows; every tab keeps its action, the ninth and on without a key.
    const ten = Array.from({ length: 10 }, (_, i) => ({ id: `n${i}`, title: `N${i}`, glyph: "x", color: "grey" as const, n: 1 }));
    const many = pop({ tabs: ten });
    expect(many.actions.find((a) => a.id === "tab:n9")).toMatchObject({ title: "Only N9" });
    expect(many.actions.find((a) => a.id === "tab:n9")!.hidden).toBeUndefined();
    expect(many.actions.find((a) => a.id === "tab:n9")!.shortcut).toBeUndefined();
    expect(many.actions.find((a) => a.id === "tab:n0")).toMatchObject({ hidden: true, shortcut: "2" });
    const find = (n: unknown, key: string): any => { const o = n as { key?: string; children?: unknown[] }; return o.key === key ? o : o.children?.map((c) => find(c, key)).find(Boolean); };
    expect(find(many.tree, "tabs").children.length).toBe(9);
    expect(find(many.tree, "tab-more")).toMatchObject({ action: "more-tabs" });
    expect(find(pop({ tabs: ten, tab: "n8" }).tree, "tab-n8")).toBeDefined();
    const open = pop({ tabs: ten, allTabs: true });
    expect([find(open.tree, "tab-n9"), find(open.tree, "tab-more"), find(open.tree, "tabs1")]).toEqual([expect.anything(), undefined, expect.anything()]);
    expect(find(open.tree, "tab-fewer")).toMatchObject({ action: "fewer-tabs" });
    // Few networks with room to spare: a chip each, none folded, unread or not.
    expect(find(pop({ tabs: ten.slice(0, 5).map((x, i) => ({ ...x, n: i ? 0 : 1 })) }).tree, "tab-more")).toBeUndefined();
    expect(pop({ replying: 1, draft: "on my way" }).input).toEqual({ value: "on my way", placeholder: "Message Ada", submit: "send", cancel: "cancel" });
    expect(texts(pop({ rows: [], later: 2 }))).toEqual(expect.arrayContaining(["Inbox zero", "Nothing waiting; 2 To dos for later"]));
    expect(texts(pop({ trouble: [{ id: 4, label: "Acme", glyph: "s", state: "degraded", detail: "2 conversations could not sync" }] }))).toContain("Acme: 2 conversations could not sync");
    expect(texts(pop({ rows: [], problem: "Wisp is unreachable at http://x: refused" }))).toContain("Wisp is out of reach");
    // A real inbox: 300 conversations, the unread ones oldest. The view stays under the node limit (checkView): every unread row, the first read ones and `a` for the rest, which still stop at MAX_ROWS with the inbox in pal for what is past it.
    const big = Array.from({ length: 300 }, (_, i) => row({ id: 100 + i, title: `C${i}`, n: i >= 290 ? 1 : 0 }));
    const capped = pop({ rows: big });
    expect(visible({ rows: big, tab: "all" })).toHaveLength(10 + READ_SHOWN);
    expect(visible({ rows: big, tab: "all" }).filter((r) => r.n).length).toBe(10);
    expect(texts(capped)).toEqual(expect.arrayContaining(["290", `${300 - 10 - READ_SHOWN} more`, "Show all"]));
    const every = pop({ rows: big, allRead: true });
    expect(visible({ rows: big, tab: "all", allRead: true })).toHaveLength(MAX_ROWS);
    expect(texts(every)).toEqual(expect.arrayContaining([`${300 - MAX_ROWS} more`, "pal"]));
  });

  test("conversation: a line per day, theirs and yours, a group's senders, the photo inline, the field where sending is allowed, the budget from the newest back", () => {
    const c = conversations().find((x) => x.id === ADA)!;
    const st = (o: Partial<ChatState> = {}): View => checkView(renderChat({ c, account: "WhatsApp", network: { name: "WhatsApp", glyph: "w", color: "green" }, messages: messages()[ADA], images: { 9001: "data:image/png;base64,AA==" }, senders: {}, more: true, canSend: true, canUnread: true, now: T0, ...o }));
    const v = st();
    expect(texts(v)).toEqual(expect.arrayContaining(["Ada Lindqvist", "Yesterday", "Today", "Are we still on for tonight?", "👍", "Older messages: cmd+["]));
    expect(nodes(v.tree).some((n) => n.type === "badge" && n.text === "2 unread")).toBe(true);
    expect(nodes(v.tree).some((n) => n.type === "image" && n.src.startsWith("data:image/png") && n.action === "attachment:9001")).toBe(true);
    expect(v.input).toEqual({ placeholder: "Message Ada Lindqvist", submit: "send" });
    expect(ids(v)).toEqual(["send", "todo", "later", "waiting", "archive", "read", "web", "copy-last", "older", "prev-message", "next-message", "reply-to", "react"]);
    expect(st({ canSend: false }).input).toBeUndefined();
    const fam = conversations().find((x) => x.id === FAMILY)!;
    expect(texts(st({ c: fam, messages: messages()[FAMILY] })).filter((t) => t === "Mum" || t === "Tom")).toEqual(["Mum", "Tom", "Mum", "Tom"]);
    // A voice message without its words asks for them on a click.
    expect(nodes(st({ c: fam, messages: messages()[FAMILY] }).tree).some((n) => n.action === "transcribe:14")).toBe(true);
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
    expect(loaded.palettes.map((p) => [p.name, p.title])).toEqual([["inbox", "Inbox"], ["conversations", "Conversations"], ["new", "New Message"], ["conversation", "Conversation"], ["search", "Search Wisp"], ["accounts", "Wisp Accounts"]]);
    expect(loaded.bar.map((b) => b.id)).toEqual(["inbox"]);
    expect(Object.keys(loaded.manifest.links ?? {})).toEqual(["open", "search", "send", "new"]);
  });

  test("inbox: Wisp's Inbox under its sections with pictures, counts and To dos; the other views; the pane; the writes", async () => {
    mock.reset();
    const rows = await host.list(X, "inbox", "", { refresh: true });
    expect(rows.map((r) => [r.id, r.section])).toEqual([[String(GRACE), "To do"], [String(ADA), "People"], [String(TOM), "People"], [String(Q4), "Work"], [String(RELEASES), "Work"], [String(DESIGN), "Work"], [String(FAMILY), "Groups"], [String(KARGO), "Paper"]]);
    const ada = rows[1];
    expect(ada).toMatchObject({ name: "Ada Lindqvist", subtitle: "Are we still on for tonight?", icon: { image: expect.stringMatching(/^data:image\/svg\+xml;base64,/) }, args: [{ id: "text" }] });
    expect(ada.keywords).toEqual(["WhatsApp", "WhatsApp"]);
    // Pictures are asked for at the size they are drawn, never the originals.
    expect(mock.calls.find((c) => c.path === `/api/v1/conversations/${ADA}/avatar`)!.query).toBe("?v=1&size=64");
    expect(tags(ada)).toEqual(["2"]);
    expect(tags(rows[2])).toEqual([]);
    expect(tags(rows[4])).toEqual(["@3"]);
    expect(tags(rows[0])).toEqual(["to do"]);
    expect(rows[7].args).toBeUndefined();
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
    expect(mock.calls.find((c) => c.path === "/api/v1/attachments/9001")!.query).toBe("?size=560");
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

  test("conversation extras: the summary on top, a suggested reply into the field, a reply to one message, a reaction, a voice message's words", async () => {
    mock.reset();
    host.viewShown(X, { palette: "conversation" }, String(ADA));
    const v = await view({ id: ADA });
    expect(texts(v)).toEqual(expect.arrayContaining(["Summary", SUMMARY]));
    expect((await host.detail(X, "inbox", String(ADA))).markdown).toContain(`**Summary**`);
    // Asked, queued, then made: the field takes it.
    const asked = await host.pick(X, "conversation", String(ADA), "ask-draft");
    expect(texts(asked.view as View)).toContain("Writing a suggested reply…");
    await host.advanceUntil(2000, () => host.viewUpdates(X, { palette: "conversation" }).some((u) => (u.spec as View).input?.value === DRAFT), "the draft in the field");
    // The cursor on Ada's first message, a reply to it, sent with replyTo; the draft is forgotten.
    await host.pick(X, "conversation", String(ADA), "prev-message");
    const back = await host.pick(X, "conversation", String(ADA), "prev-message");
    expect(nodes((back.view as View).tree).find((n) => n.selected)!.key).toBe("m3");
    const r = await host.pick(X, "conversation", String(ADA), "reply-to");
    expect((r.view as View).input).toMatchObject({ placeholder: "Reply to Ada Lindqvist", cancel: "cancel-reply" });
    expect(texts(r.view as View)).toContain("Replying to Ada Lindqvist: I will");
    await host.pick(X, "conversation", String(ADA), "send", { values: { input: DRAFT } });
    expect(mock.posted(`/api/v1/conversations/${ADA}/messages`).at(-1)!.body).toEqual({ text: DRAFT, replyTo: 3 });
    expect(mock.posted(`/api/v1/conversations/${ADA}/draft`).map((c) => c.method)).toEqual(["POST", "DELETE"]);
    // A reaction through its form; a voice message transcribed and drawn.
    expect((await host.pick(X, "conversation", String(ADA), "react")).form!.fields[0].id).toBe("emoji");
    expect(await host.pick(X, "conversation", String(ADA), "react-send", { values: { emoji: "❤️" } })).toMatchObject({ toast: { title: "Reacted ❤️" } });
    expect(mock.posted("/api/v1/messages/4/react")[0].body).toEqual({ emoji: "❤️" });
    host.viewShown(X, { palette: "conversation" }, String(FAMILY));
    await view({ id: FAMILY });
    expect(await host.pick(X, "conversation", String(FAMILY), "transcribe:14")).toMatchObject({ hud: "Transcribing" });
    await host.advanceUntil(2000, () => host.viewUpdates(X, { palette: "conversation" }).some((u) => texts(u.spec as View).includes("“Running ten minutes late, start without me”")), "the transcript");
  });

  test("Conversations by name; New Message: a person with a conversation opens it, one without gets the form, sent through compose", async () => {
    mock.reset();
    expect((await host.list(X, "conversations", "", { refresh: true })).map((r) => r.id)).toContain(String(LEASE));
    const folks = await host.list(X, "new", "");
    expect(folks.map((r) => [r.name, r.subtitle?.split(" · ")[0]])).toEqual([["Ada Lindqvist", "WhatsApp"], ["Lin Park", "Gmail"]]);
    expect(await host.pick(X, "new", "p1")).toMatchObject({ push: { palette: "conversation", args: { id: ADA } } });
    const form = (await host.pick(X, "new", "p2")).form!;
    expect((form.fields[0] as { options: { id: string }[] }).options.map((o) => o.id)).toEqual(["2||lin@example.com", "3||lin@acme.example"]);
    const sent = await host.pick(X, "new", "p2", "compose", { values: { via: "3||lin@acme.example", text: "Numbers attached" } });
    expect(sent).toMatchObject({ push: { palette: "conversation" }, hud: "Sent to Lin Park" });
    expect(mock.posted("/api/v1/compose")[0].body).toEqual({ accountId: 3, to: ["lin@acme.example"], text: "Numbers attached" });
    expect(await link("new", { to: "lin" })).toEqual({ push: { extension: X, palette: "new", query: "lin" } });
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

  test("bar: a mark and count per network in the bar's ink (on a capsule, in colour, as glyphs; per account, one count), the due To do, a badged person's own count after the @ (their network's logo with the badge on it, out of the network's count), the facts; a click on a network opens its tab; the popover's keys; the stream redraws it", async () => {
    mock.reset();
    const item = await host.render(X, "inbox", { reason: "every" });
    // Mono: every count in the bar's ink but the @, a filled mark as a template the bar inks, a line drawing's place taken by the font's solid glyph; no band.
    expect(item.background).toBeUndefined();
    expect(item.segments!.map((s) => [s.id, s.text, s.color])).toEqual([["for_me", "1", "red"], ["badge:person:101", "1", undefined], ["whatsapp", "1", undefined], ["gmail", "1", undefined], ["sms", "1", undefined], ["todo", "1", undefined]]);
    expect(item.segments![1].tooltip).toBe("WhatsApp: 1 unread from Ada");
    expect(item.states).toEqual({ unread: 4, for_me: 1, todo: 1, now: 2, badged: 1, trouble: 1 });
    const icons = Object.fromEntries(item.segments!.map((s) => [s.id, s.icon]));
    expect(icons.gmail).toEqual({ image: expect.stringMatching(/^data:image\/svg\+xml;utf8,.*%23000000/), template: true });
    expect(typeof icons.sms).toBe("string");
    expect(typeof icons.for_me).toBe("string");
    // Ada's count: WhatsApp's mark with her badge on its corner, one template; out of WhatsApp's count above.
    expect(icons["badge:person:101"]).toEqual({ image: expect.stringMatching(/mask.*%23000000.*%23000000/), template: true });
    expect((await host.render(X, "inbox", { reason: "every", settings: { look: "capsule" } })).background).toBe("subtle");
    // Colour: the marks in their brand colours (a near-black one inks), the counts too, no band; glyphs: the font's marks.
    const colour = await host.render(X, "inbox", { reason: "every", settings: { look: "colour" } });
    expect(colour.background).toBeUndefined();
    expect(colour.segments!.map((s) => [s.id, s.color])).toEqual([["for_me", "red"], ["badge:person:101", undefined], ["whatsapp", "green"], ["gmail", "red"], ["sms", "teal"], ["todo", "amber"]]);
    expect(Object.fromEntries(colour.segments!.map((s) => [s.id, s.icon])).gmail).toEqual({ image: expect.stringMatching(/%23EA4335/) });
    expect(Object.fromEntries(colour.segments!.map((s) => [s.id, s.icon]))["badge:person:101"]).toEqual({ image: expect.stringMatching(/%2325D366.*%23d6409f/) });
    const glyphs = await host.render(X, "inbox", { reason: "every", settings: { look: "glyphs" } });
    expect(glyphs.segments!.every((s) => typeof s.icon === "string" || s.id.startsWith("badge:"))).toBe(true);
    // A click on a segment is `segment:<id>`: the popover on that network's tab (a per-account count on its network's), the @ on All.
    const onGmail = (await host.barAction(X, "inbox", "segment:gmail", ctx)).view as View;
    expect(texts(onGmail)).toContain("Q4 plan");
    expect(texts(onGmail)).not.toContain("Ada Lindqvist");
    expect(texts((await host.barAction(X, "inbox", "segment:a1", ctx)).view as View)).toContain("Ada Lindqvist");
    expect(texts((await host.barAction(X, "inbox", "segment:for_me", ctx)).view as View)).toEqual(expect.arrayContaining(["Ada Lindqvist", "Q4 plan"]));
    const onBadge = (await host.barAction(X, "inbox", "segment:badge:person:101", ctx)).view as View;
    expect(texts(onBadge)).toEqual(expect.arrayContaining(["Ada Lindqvist", "Q4 plan"]));
    expect(JSON.stringify(onBadge).match(/"key":"badge"/g)).toHaveLength(1);
    // The networks' glyphs stand for Wisp's: its own leads only one count.
    expect(item.icon).toBeUndefined();
    expect(item.empty!.icon).toBeDefined();
    expect(item.tooltip!.split("\n")[0]).toBe("1 for you · Ada 1 · WhatsApp 1, Gmail 1, SMS 1 · 1 To do due");
    const per = await host.render(X, "inbox", { reason: "every", settings: { split: "account", uncounted: true } });
    expect(per.segments!.map((s) => [s.id, s.text])).toEqual([["for_me", "1"], ["badge:person:101", "1"], ["a1", "1"], ["a3", "1"], ["a4", "1"], ["a5", "1"], ["todo", "1"]]);
    const one = await host.render(X, "inbox", { reason: "every", settings: { split: "total" } });
    expect(one.segments!.map((s) => [s.id, s.text, s.icon])).toEqual([["for_me", "1", expect.any(String)], ["badge:person:101", "1", expect.anything()], ["all", "3", undefined], ["todo", "1", expect.any(String)]]);
    expect(one.icon).toBeDefined();
    await host.render(X, "inbox", { reason: "every", settings: {} });
    // The popover: a tab to WhatsApp, its unread first (Ada, then Family before the read Tom), mark read (Family stays, read), the reply field and a send.
    expect(texts((await host.barAction(X, "inbox", "tab:whatsapp", ctx)).view as View)).not.toContain("Q4 plan");
    expect(await host.barAction(X, "inbox", "open", ctx)).toMatchObject({ push: { palette: "conversation", args: { id: ADA } } });
    await host.barAction(X, "inbox", "down", ctx);
    expect(await host.barAction(X, "inbox", "read", ctx)).toMatchObject({ hud: "Marked read: Family" });
    expect((await host.barAction(X, "inbox", "reply", ctx)).view).toMatchObject({ input: { placeholder: "Message Family" } });
    expect(await host.barAction(X, "inbox", "send", { ...ctx, values: { input: "omw" } })).toMatchObject({ toast: { title: "Sent" } });
    expect(mock.posted(`/api/v1/conversations/${FAMILY}/messages`).at(-1)!.body).toEqual({ text: "omw" });
    expect(await host.barAction(X, "inbox", "account:4", ctx)).toEqual({ open: `${mock.url}/accounts/4` });
    expect(await host.barAction(X, "inbox", "pal", ctx)).toEqual({ push: { extension: X, palette: "inbox" } });
    await host.until(() => mock.streaming > 0);
    // A page of newer read ones arrives with it: the unread Q4 plan, now past Wisp's first page, still leads the popover.
    mock.convs.push(...Array.from({ length: 200 }, (_, i) => ({ ...conversations()[0], badge: undefined, id: 1000 + i, title: `Read ${i}`, lastMessageAt: iso(0), unread: 0 })));
    mock.convs.push({ ...conversations()[0], badge: undefined, id: 200, accountId: 5, channel: "sms", title: "BANK", lastMessageAt: iso(0), lastPreview: "Your code is 4411", unread: 1 });
    mock.emit("message.new", { conversationId: 200, accountId: 5, channel: "sms", sender: "BANK", conversationTitle: "BANK" });
    const next = await host.nextUpdate(X, "inbox", (i) => i.segments?.find((s) => s.id === "sms")?.text === "2");
    expect(next.segments!.find((s) => s.id === "sms")!.text).toBe("2");
    expect(texts((await host.barAction(X, "inbox", "tab:all", ctx)).view as View)).toContain("Q4 plan");
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
