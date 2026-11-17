// WhatsApp: data.ts's pure parts by import (the media labels, a Wisp
// message as one of the conversation's, the links, the opener, the vCard,
// the phone spelling) and view.ts's tree from a state; then the extension
// through the harness against whatsapp-mock.ts (Wisp's mock with a
// WhatsApp account): the chat rows with their pictures, the unread run's
// sender, the pane as a conversation, the unread palette, the search, the
// contacts from Wisp's people, mark read and unread, every send refused
// with `send` off and made with it on (a message, a quoted reply, a
// reaction and its removal), the bar item and its popover keys, the
// links, the stream, a wrong token, Wisp not set up, Wisp unreachable.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chatLink, conversationMarkdown, mediaLabel, msgOf, opener, phoneOfJid, prettyPhone, REACTIONS, vcard } from "../whatsapp/data.ts";
import { initial, initialIcon, render, type BarState } from "../whatsapp/view.ts";
import type { Item, View, ViewNode } from "../.pal/sdk/src/protocol.ts";
import { checkView } from "../.pal/sdk/src/view.ts";
import { Host, marksOf, stored, bundledIcon } from "../.pal/host/test/harness.ts";
import { FAMILY, HIKE as HIKE_ID, KARGO as KARGO_ID, MARA as MARA_ID, TOKEN, TOMAS as TOMAS_ID, WhatsAppMock, chatMessages } from "./whatsapp-mock.ts";
import { iso } from "./wisp-mock.ts";

const X = "whatsapp";
const MARA = String(MARA_ID), HIKE = String(HIKE_ID), TOMAS = String(TOMAS_ID);

const nodes = (n: ViewNode): ViewNode[] => [n, ...("children" in n ? n.children.flatMap(nodes) : [])];
const texts = (v: View) => nodes(v.tree).flatMap((n) => (n.type === "text" ? [n.value] : []));
const keycaps = (v: View) => nodes(v.tree).flatMap((n) => (n.type === "keycap" ? [n.keys] : []));
const viewOf = (x: unknown): View => {
  const o = x as { view?: View; menu?: { view?: View } };
  const v = o.view ?? o.menu?.view;
  if (!v) throw new Error("no view");
  return v;
};
const tags = (i: Item) => (i.accessories ?? []).flatMap((a) => ("tag" in a ? [a.tag] : []));

describe("whatsapp helpers", () => {
  test("mediaLabel: text as is, media in brackets with the caption, file name or transcript after it", () => {
    expect(mediaLabel("text", " hi ")).toBe("hi");
    expect(mediaLabel("image", "")).toBe("[photo]");
    expect(mediaLabel("image", "look")).toBe("[photo] look");
    expect(mediaLabel("voice", "on my way")).toBe("[voice message] on my way");
    expect(mediaLabel("document", "cv.pdf")).toBe("[document] cv.pdf");
    expect(mediaLabel("contact", "")).toBe("[contact card]");
    expect(mediaLabel("some_new_kind", "")).toBe("[some new kind]");
  });

  test("msgOf: the sender's name, You for ours, the chat's name for a nameless sender in a direct chat; a photo's path, a transcript, a deleted message, your reaction", () => {
    const all = chatMessages();
    const [ask, mine, photo] = all[MARA_ID]!;
    expect(msgOf(ask!, "Mara Lind", false)).toEqual({ id: ask!.id, at: Date.parse(ask!.sentAt), fromMe: false, who: "Mara Lind", from: "905551234567@s.whatsapp.net", text: "can you look at the parser before standup?", kind: "text" });
    expect(msgOf(mine!, "Mara Lind", false)).toMatchObject({ who: "You", fromMe: true });
    expect(msgOf(photo!, "Mara Lind", false)).toMatchObject({ text: "[photo]", imagePath: "/api/v1/attachments/9101" });
    expect(msgOf(all[HIKE_ID]![2]!, "Weekend hike", true)).toMatchObject({ who: "Tomas Ruiz", text: "[voice message] running late, start without me" });
    expect(msgOf({ ...ask!, sender: { id: "x", name: "" } }, "Mara Lind", false).who).toBe("Mara Lind");
    expect(msgOf({ ...ask!, sender: { id: "x", name: "" } }, "Weekend hike", true).who).toBe("Unknown");
    expect(msgOf({ ...ask!, deleted: true }, "Mara Lind", false).text).toBe("[message deleted]");
    expect(msgOf({ ...ask!, reactions: [{ emoji: "👍", sender: { id: "", name: "" }, fromMe: true }] }, "Mara Lind", false).mine).toBe("👍");
    expect(phoneOfJid("905551234567@s.whatsapp.net")).toBe("905551234567");
    expect(phoneOfJid("905551234567@c.us")).toBe("905551234567");
    expect(phoneOfJid("301122334455667@lid")).toBeUndefined();
  });

  test("conversationMarkdown: the sender in bold with the time, media in italics, a picture inline, markup escaped", () => {
    const at = Date.parse("2026-09-17T09:41:00+03:00");
    const md = conversationMarkdown([
      { id: 1, at, fromMe: false, who: "Mara *Lind*", from: "", text: "see #4471 <now>", kind: "text" },
      { id: 2, at, fromMe: true, who: "You", from: "", text: "ok", kind: "text" },
      { id: 3, at, fromMe: false, who: "Mara", from: "", text: "[photo] the cabin", kind: "image" },
      { id: 4, at, fromMe: false, who: "Mara", from: "", text: "[photo] the *lake*", kind: "image", image: "data:image/jpeg;base64,/9j/" },
    ]);
    const paragraphs = md.split("\n\n");
    expect(paragraphs[0]).toMatch(/^\*\*Mara \\\*Lind\\\*\*\* · /);
    expect(paragraphs[1]).toBe("see \\#4471 \\<now\\>");
    expect(paragraphs[3]).toBe("ok");
    expect(paragraphs[5]).toBe("_[photo]_ the cabin");
    expect(paragraphs.slice(7)).toEqual(["![photo](data:image/jpeg;base64,/9j/)", "the \\*lake\\*"]);
  });

  test("links: the app and the web client, a group at the top, the opener by setting and platform, the vCard, the phone spelling", () => {
    expect(chatLink("+90 555 123 45 67", "app")).toBe("whatsapp://send?phone=905551234567");
    expect(chatLink("905551234567", "web")).toBe("https://web.whatsapp.com/send?phone=905551234567");
    expect(chatLink("905551234567", "web", "hi there")).toBe("https://web.whatsapp.com/send?phone=905551234567&text=hi+there");
    expect(chatLink(undefined, "app")).toBe("whatsapp://");
    expect(chatLink(undefined, "web")).toBe("https://web.whatsapp.com/");
    expect(opener("app", "linux", () => false)).toBe("app");
    expect(opener("web", "darwin", () => true)).toBe("web");
    expect(opener("auto", "darwin", () => true)).toBe("app");
    expect(opener("auto", "darwin", () => false)).toBe("web");
    expect(opener(undefined, "linux", () => true)).toBe("web");
    expect(vcard("Mara Lind", "905551234567")).toBe("BEGIN:VCARD\nVERSION:3.0\nFN:Mara Lind\nTEL;TYPE=CELL:+905551234567\nEND:VCARD");
    expect(prettyPhone("905551234567")).toBe("+90 555 123 45 67");
    expect(prettyPhone("15551234567")).toBe("+1 555 123 45 67");
    expect(prettyPhone("12345")).toBe("+12345");
    expect(initial("+90 555")).toBe("9");
    expect(initial("mara")).toBe("M");
    expect(initialIcon("Mara").image).toMatch(/^data:image\/svg\+xml;utf8,.*%3EM%3C/);
  });

  test("view: the sections, the cursor, the hints, the reply field; nothing unread is one calm line", () => {
    const rows: BarState["rows"] = [
      { id: MARA, name: "Mara Lind", group: false, text: "standup in 20?", time: "09:39", n: 3 },
      { id: HIKE, name: "Weekend hike", group: true, text: "Ola Berg: [location]", time: "09:32", n: 5, avatar: "data:image/svg+xml;base64,PHN2Zy8+" },
    ];
    const v = checkView(render({ rows, focus: 1, canSend: true }));
    expect(v).toMatchObject({ id: "unread", keys: "actions", title: "2 chats unread" });
    expect(texts(v)).toEqual(expect.arrayContaining(["Direct messages", "Groups", "Mara Lind", "standup in 20?", "Weekend hike", "Ola Berg: [location]"]));
    const stacks = nodes(v.tree).filter((n): n is Extract<ViewNode, { type: "stack" }> => n.type === "stack" && !!n.action?.startsWith("focus:"));
    expect(stacks.map((s) => [s.action, !!s.selected])).toEqual([[`focus:${MARA}`, false], [`focus:${HIKE}`, true]]);
    expect(nodes(v.tree).find((n) => n.type === "tile")).toMatchObject({ text: "M", fill: "solid" });
    expect(nodes(v.tree).find((n) => n.type === "image")).toMatchObject({ mask: "circle", alt: "Weekend hike" });
    expect(keycaps(v)).toEqual(["enter", "space", "r", "m", "i", "a", "p"]);
    expect(v.actions.slice(0, 8).map((a) => [a.id, a.shortcut])).toEqual([["open", undefined], ["preview", "space"], ["reply", "r"], ["read", "m"], ["ignore", "i"], ["read-all", ["a", "cmd+shift+a"]], ["open-whatsapp", "o"], ["open-pal", "p"]]);
    // Every row can be marked (its chat id), and `m` runs over every marked row; offered even with the cursor on a read chat.
    expect(marksOf(v.tree)).toEqual([MARA, HIKE]);
    expect(v.actions.find((a) => a.id === "read")).toMatchObject({ multi: true });
    const onRead = checkView(render({ rows: [{ ...rows[0]!, n: 0 }, rows[1]!], focus: 0, canSend: true }));
    expect(onRead.actions.find((a) => a.id === "read")).toMatchObject({ title: "Mark as read", multi: true });
    // Send off: no reply key, no hint.
    const off = checkView(render({ rows, focus: 0, canSend: false }));
    expect(keycaps(off)).toEqual(["enter", "space", "m", "i", "a", "p"]);
    expect(off.actions.map((a) => a.id)).not.toContain("reply");
    // Replying: the field, Send and Cancel first, the hints for them.
    const replying = checkView(render({ rows, focus: 0, canSend: true, replying: MARA, draft: "on my way" }));
    expect(replying.input).toEqual({ value: "on my way", placeholder: "Message Mara Lind", submit: "send", cancel: "cancel" });
    expect(replying.title).toBe("Reply to Mara Lind");
    expect(keycaps(replying)).toEqual(["enter", "escape"]);
    // Recent chats while nothing is unread: no counts, no read keys; no rows at all is the calm line.
    const recent = checkView(render({ rows: rows.map((r) => ({ ...r, n: 0 })), focus: 0, canSend: false }));
    expect(recent.title).toBe("WhatsApp");
    expect(texts(recent)).toEqual(expect.arrayContaining(["Recent", "Recent groups"]));
    expect(keycaps(recent)).toEqual(["enter", "space", "o", "p"]);
    const zero = checkView(render({ rows: [], focus: 0, canSend: false }));
    expect(texts(zero)).toEqual(expect.arrayContaining(["Nothing unread", "Every chat is read"]));
  });
});

describe("whatsapp", () => {
  let mock: WhatsAppMock;
  let host: Host;
  const wispSettings = (extra: Record<string, unknown> = {}) => ({ url: mock.url, token: TOKEN, ...extra });
  const settings = (extra: Record<string, unknown> = {}) => ({ open: "web", ...extra });
  /** Search and Contacts wait this long after a keystroke before they ask (SEARCH_WAIT_MS, whatsapp/index.ts). */
  const SEARCH_WAIT_MS = 300;
  const list = async (palette: string, q = "", ctx?: Parameters<Host["list"]>[3]) => {
    const r = host.list(X, palette, q, ctx);
    if (palette === "search" || (palette === "contacts" && q)) await host.advance(SEARCH_WAIT_MS);
    return r;
  };
  const ctx = { reason: "open" as const, compact: true as const };
  const gets = (path: string | RegExp) => mock.calls.filter((c) => c.method === "GET" && (typeof path === "string" ? c.path === path : path.test(c.path)));
  const wrote = (kind: string) => mock.writes(kind).map((c) => Number(c.path.split("/")[4]));
  const relist = () => list("chats", "", { refresh: true });

  beforeAll(async () => {
    stored.clear();
    mock = new WhatsAppMock();
    host = await Host.bundled({ settings: { [X]: { settings: settings() }, wisp: { settings: wispSettings() } }, only: [X, "wisp"], timeout: 8000 });
  });
  afterAll(() => { host.kill(); mock.stop(); });

  test("meta: the tile, four palettes (chats live primary with a pane, unread live, search and contacts input), the bar item, two links, the settings, Wisp required", () => {
    const loaded = host.loaded().find((l) => l.extension === X)!;
    expect(loaded.warnings).toEqual([]);
    expect(loaded.manifest.icon).toEqual(bundledIcon("whatsapp"));
    expect(loaded.manifest.requires).toEqual(["wisp"]);
    expect(loaded.palettes.map((p) => [p.name, p.title, p.live, p.input, p.lazy, p.tier, p.detail])).toEqual([
      ["chats", "Chats", true, false, true, "primary", "lazy"],
      ["unread", "Unread", true, false, true, undefined, "lazy"],
      ["search", "Search WhatsApp", false, true, undefined, undefined, "lazy"],
      ["contacts", "Contacts", false, true, undefined, undefined, undefined],
    ]);
    expect(loaded.bar.map((b) => [b.id, b.refresh?.every])).toEqual([["unread", 30]]);
    expect(Object.keys(loaded.manifest.links ?? {})).toEqual(["open", "search"]);
    expect(loaded.manifest.settings!.map((s) => [s.id, s.kind, s.default])).toEqual([["send", "boolean", false], ["open", "select", "auto"]]);
    for (const p of Object.values(loaded.manifest.palettes ?? {})) for (const k of p.keys ?? []) expect(["cmd+i", "cmd+r", "cmd+k", "cmd+backspace"]).not.toContain(k.keys);
  });

  test("chats: the WhatsApp account's, unread first with the run's sender, the pictures, the group tag, the count, the time; the broadcast and the SMS left out", async () => {
    const rows = await list("chats");
    expect(rows.map((r) => [r.name, r.section])).toEqual([["Mara Lind", "Unread"], ["Weekend hike", "Unread"], ["Tomas Ruiz", "Unread"], ["Family", "Recent"], ["Ola Berg", "Recent"], ["Lina Kova", "Recent"], ["pal beta", "Recent"], ["Acme Support", "Recent"]]);
    // The account found once; the conversations of it alone.
    expect(gets("/api/v1/accounts")).toHaveLength(1);
    expect(new URLSearchParams(gets("/api/v1/conversations")[0]!.query).get("account")).toBe("1");
    expect(rows[0]).toMatchObject({ id: MARA, subtitle: "standup in 20?", keywords: ["chat"] });
    expect((rows[0].icon as { image: string }).image).toStartWith("data:image/svg+xml;base64,");
    expect(tags(rows[0])).toEqual(["3"]);
    expect(rows[0].accessories).toContainEqual({ date: Date.parse(iso(2)) });
    // A group's newest message names its sender and a media message its kind; the sender is a keyword.
    expect(rows[1]).toMatchObject({ name: "Weekend hike", subtitle: "Ola Berg: [location]", keywords: ["group", "Ola Berg"] });
    expect(tags(rows[1])).toEqual(["5"]);
    expect(tags(rows[3])).toEqual(["group"]);
    expect(rows[2]).toMatchObject({ subtitle: "the cabin is booked, sending the map", icon: initialIcon("Tomas Ruiz") });
    expect(rows[3]).toMatchObject({ name: "Family", subtitle: "You: Dinner at eight on Sunday?", icon: "\u{f0849}" });
    expect(rows[6]).toMatchObject({ name: "pal beta", subtitle: "Group" });
    expect(rows[0].actions!.map((a) => a.id)).toEqual(["open", "read", "web", "copy-number", "ignore", "unread"]);
    expect(rows[0].args).toBeUndefined();
    expect(rows[3].actions!.map((a) => a.id)).toEqual(["open", "unread", "web", "copy-name", "read"]);
    expect(rows[0].actions![1]).toEqual({ id: "read", title: "Mark as read", shortcut: "cmd+enter", multi: true });
    // Messages only for the unread three; a second listing inside the window is the shared list.
    expect(gets(/\/messages$/).map((c) => Number(c.path.split("/")[4])).sort()).toEqual([MARA_ID, HIKE_ID, TOMAS_ID]);
    const n = mock.calls.length;
    await list("chats");
    expect(mock.calls.length).toBe(n);
  });

  test("the pane: the last messages as a conversation with the sender, the time and a photo; the chat's number from its messages, or from Wisp's people for a LID", async () => {
    const d = await host.detail(X, "chats", MARA);
    const md = d.markdown!;
    expect(md.split("\n\n").filter((p) => p.startsWith("**")).map((p) => p.split(" · ")[0])).toEqual(["**Mara Lind**", "**You**", "**Mara Lind**", "**Mara Lind**", "**Mara Lind**"]);
    expect(md).toContain("![photo](data:image/svg+xml;base64,");
    expect(md.endsWith("standup in 20?")).toBe(true);
    expect(d).toMatchObject({ caption: "Direct message · +90 555 123 45 67", title: "Mara Lind", chips: [{ text: "3 messages unread", color: "green" }] });
    expect(d.metadata).toEqual([
      { label: "Newest", value: expect.any(String) },
      { label: "Open", link: { text: "In the web client", href: "https://web.whatsapp.com/send?phone=905551234567" } },
    ]);
    const g = await host.detail(X, "chats", HIKE);
    expect(g.markdown!.split("\n\n").filter((p) => p.startsWith("**")).map((p) => p.split(" · ")[0])).toEqual(["**Ola Berg**", "**You**", "**Tomas Ruiz**", "**Lina Kova**", "**Ola Berg**"]);
    expect(g.markdown).toContain("_[voice message]_ running late, start without me");
    expect(g.caption).toBe("Group");
    expect((await host.detail(X, "chats", "206")).caption).toBe("Direct message · +90 555 333 44 55");
    expect(gets("/api/v1/people/14")).toHaveLength(1);
  });

  test("unread: the three, direct messages then groups; nothing unread is one hint", async () => {
    const rows = await list("unread");
    expect(rows.map((r) => [r.name, r.section])).toEqual([["Mara Lind", "Direct messages"], ["Weekend hike", "Groups"], ["Tomas Ruiz", "Direct messages"]]);
    for (const id of [MARA_ID, HIKE_ID, TOMAS_ID]) mock.chat(id).unread = 0;
    try {
      expect((await list("unread", "", { refresh: true })).map((r) => [r.id, r.name])).toEqual([["hint:none", "Nothing unread"]]);
    } finally { mock.reset(); await relist(); }
  });

  test("open: the web client with the chat's number, a group at the top with a HUD line, copy number and name, the app by setting", async () => {
    expect(await host.pick(X, "chats", MARA)).toEqual({ open: "https://web.whatsapp.com/send?phone=905551234567" });
    expect(await host.pick(X, "chats", HIKE)).toEqual({ open: "https://web.whatsapp.com/", hud: "Weekend hike is a group: WhatsApp opens at the top" });
    expect(await host.pick(X, "chats", HIKE, "copy-name")).toEqual({ copy: "Weekend hike" });
    expect(await host.pick(X, "chats", MARA, "copy-number", { ids: [MARA, TOMAS] })).toEqual({ copy: "+905551234567\n+905559876543" });
    host.changeSettings(X, { settings: settings({ open: "app" }) });
    await host.until(() => host.coreCalls.length > 0);
    expect(await host.pick(X, "chats", TOMAS)).toEqual({ open: "whatsapp://send?phone=905559876543" });
    host.changeSettings(X, { settings: settings() });
  });

  test("mark read and unread through Wisp, over the marked rows too; the list is fetched again after and the bar told", async () => {
    const refreshes = () => host.coreCalls.filter((c) => c.method === "bar.refresh" && (c.params as { extension: string }).extension === X).length;
    const n = refreshes();
    expect(await host.pick(X, "chats", MARA, "read")).toEqual({ keep: true, toast: { title: "Marked read", message: "Mara Lind" } });
    expect(refreshes()).toBe(n + 1);
    expect(await host.pick(X, "unread", HIKE, "read", { ids: [HIKE, TOMAS] })).toEqual({ keep: true, toast: { title: "Marked read", message: "2 chats" } });
    expect(wrote("read")).toEqual([MARA_ID, HIKE_ID, TOMAS_ID]);
    expect(await list("unread")).toMatchObject([{ id: "hint:none" }]);
    expect(await host.pick(X, "chats", MARA, "unread")).toEqual({ keep: true, toast: { title: "Marked unread", message: "Mara Lind" } });
    expect(wrote("unread")).toEqual([MARA_ID]);
    expect((await list("chats"))[0]).toMatchObject({ id: MARA, section: "Unread" });
    mock.reset();
    await relist();
  });

  test("send off: no message, no reaction, no reply field, whatever the pick asks; nothing reaches Wisp", async () => {
    const before = mock.calls.length;
    expect(await host.pick(X, "chats", MARA, "reply")).toEqual({ keep: true, toast: { title: "Sending is off", message: "Turn on send under Settings › Extensions › WhatsApp", style: "failure" } });
    expect(await host.pick(X, "chats", MARA, "send", { values: { text: "hi" } })).toMatchObject({ toast: { title: "Sending is off", style: "failure" } });
    expect(await host.pick(X, "chats", MARA, "react")).toMatchObject({ toast: { title: "Reactions are off", style: "failure" } });
    expect(await host.pick(X, "chats", MARA, "react-send", { values: { emoji: "👍" } })).toMatchObject({ toast: { title: "Reactions are off", style: "failure" } });
    const bar = checkView(viewOf(await host.render(X, "unread", { reason: "load" })));
    expect(bar.actions.map((a) => a.id)).not.toContain("reply");
    expect(checkView(viewOf(await host.barAction(X, "unread", "reply", ctx))).input).toBeUndefined();
    expect(mock.calls.slice(before).filter((s) => s.method !== "GET")).toEqual([]);
  });

  test("send on: the message form (the latest message quotable), a plain send, a quoted reply, the empty text refused, a reaction from the six and its removal", async () => {
    host.changeSettings(X, { settings: settings({ send: true }) });
    await host.until(() => host.coreCalls.length > 0);
    const rows = await relist();
    expect(rows[0].actions!.map((a) => a.id)).toEqual(["open", "read", "reply", "react", "web", "copy-number", "ignore", "unread"]);
    expect(rows[0].args).toEqual([{ id: "text", placeholder: "Message", required: true }, { id: "quote", placeholder: "Reply", kind: "select", default: "", options: [{ id: "", title: "New message" }, { id: "quote", title: "Quote “standup in 20?”" }] }]);
    expect(rows[3].args).toEqual([{ id: "text", placeholder: "Message", required: true }]);
    const latest = mock.msgs[MARA_ID]!.at(-1)!.id;
    expect(await host.pick(X, "chats", MARA, "reply", { values: { text: "see you there", quote: "" } })).toEqual({ keep: true, toast: { title: "Sent", message: "Mara Lind: see you there" } });
    expect(await host.pick(X, "chats", MARA, "reply", { values: { text: "yes", quote: "quote" } })).toMatchObject({ toast: { title: "Sent" } });
    expect(mock.writes("messages").map((c) => c.body)).toEqual([{ text: "see you there" }, { text: "yes", replyTo: latest }]);
    expect(await host.pick(X, "chats", MARA, "reply", { values: { text: " ", quote: "" } })).toMatchObject({ form: { errors: { text: "Required" } } });
    const form = (await host.pick(X, "chats", TOMAS, "reply")).form!;
    expect(form).toMatchObject({ id: TOMAS, title: "Message Tomas Ruiz", submit: { id: "send", title: "Send" } });
    expect(form.fields.map((f) => [f.id, f.kind])).toEqual([["text", "textarea"], ["quote", "checkbox"]]);
    expect(await host.pick(X, "chats", TOMAS, "send", { values: { text: "on my way", quote: true } })).toEqual({ keep: true, toast: { title: "Sent", message: "Tomas Ruiz: on my way" } });
    expect(mock.writes("messages").at(-1)!.body).toEqual({ text: "on my way", replyTo: mock.msgs[TOMAS_ID]![0]!.id });
    // A read chat's latest message is fetched at form time: Family's newest is ours, so nothing to quote and nothing to react to.
    expect((await host.pick(X, "chats", String(FAMILY), "reply")).form!.fields.map((f) => f.id)).toEqual(["text"]);
    expect(await host.pick(X, "chats", String(FAMILY), "react")).toMatchObject({ toast: { title: "Nothing to react to" } });
    const react = (await host.pick(X, "chats", HIKE, "react")).form!;
    expect(react).toMatchObject({ id: HIKE, title: "React in Weekend hike", submit: { id: "react-send" } });
    expect((react.fields[0] as { options: { id: string }[] }).options.map((o) => o.id)).toEqual([...REACTIONS, ""]);
    expect(await host.pick(X, "chats", HIKE, "react-send", { values: { emoji: "❤️" } })).toEqual({ keep: true, toast: { title: "Reacted ❤️", message: "Weekend hike" } });
    expect(await host.pick(X, "chats", HIKE, "react-send", { values: { emoji: "" } })).toMatchObject({ toast: { title: "Reaction removed" } });
    const target = mock.msgs[HIKE_ID]!.at(-1)!.id;
    expect(mock.calls.filter((c) => c.path === `/api/v1/messages/${target}/react`).map((c) => [c.method, c.body ?? c.query])).toEqual([["POST", { emoji: "❤️" }], ["DELETE", `?emoji=${encodeURIComponent("❤️")}`]]);
    mock.reset();
    host.changeSettings(X, { settings: settings() });
    await relist();
  });

  test("search: Wisp's WhatsApp hits with the chat, the sender and the time; another network's left out; Enter opens the chat, cmd+c copies; the pane is the chat's; Wisp failing is one hint", async () => {
    expect((await list("search", "t")).map((r) => r.id)).toEqual(["hint:search"]);
    const rows = await list("search", "parser");
    expect(rows.map((r) => [r.name, r.subtitle])).toEqual([["can you look at the parser before standup?", "Mara Lind"], ["the invoice for september is missing the parser line", "You in Acme Support"]]);
    expect(new URLSearchParams(gets("/api/v1/search").at(-1)!.query).get("q")).toBe("parser in:whatsapp");
    expect(rows[0].accessories).toEqual([{ date: Date.parse(iso(40)) }]);
    expect(rows[0].actions!.map((a) => [a.id, a.shortcut])).toEqual([["open", undefined], ["copy", "cmd+c"], ["web", "cmd+shift+o"]]);
    expect((await list("search", "trailhead"))[0]).toMatchObject({ subtitle: "Lina Kova in Weekend hike", icon: "\u{f0849}" });
    expect(await host.pick(X, "search", rows[0].id)).toEqual({ open: "https://web.whatsapp.com/send?phone=905551234567" });
    expect(await host.pick(X, "search", rows[0].id, "copy")).toEqual({ copy: "can you look at the parser before standup?" });
    expect((await host.detail(X, "search", rows[1].id)).title).toBe("Acme Support");
    expect((await list("search", "zzzz")).map((r) => r.name)).toEqual(["No messages found"]);
    mock.failWith = 502;
    try { expect(await list("search", "parser")).toMatchObject([{ id: "hint:down", name: "WhatsApp search is unavailable", subtitle: "Wisp answered 502: broken" }]); } finally { mock.failWith = 0; }
  });

  test("contacts: Wisp's people on WhatsApp, the recent ones or the matches, the picture and the latest line; open, copy number, copy vCard from the reach", async () => {
    const rows = await list("contacts");
    expect(rows.map((r) => [r.name, r.subtitle])).toEqual([["Mara Lind", "standup in 20?"], ["Tomas Ruiz", "the cabin is booked, sending the map"], ["Ola Berg", "Thanks, got it"], ["Lina Kova", "see you friday"], ["Dana Ruiz", undefined]]);
    expect((rows[0].icon as { image: string }).image).toStartWith("data:image/svg+xml;base64,");
    expect(rows[0].actions!.map((a) => [a.id, a.shortcut])).toEqual([["open", undefined], ["copy-number", "cmd+c"], ["copy-vcard", "cmd+shift+c"], ["web", "cmd+shift+o"]]);
    expect((await list("contacts", "ruiz")).map((r) => r.name)).toEqual(["Tomas Ruiz", "Dana Ruiz"]);
    expect(await list("contacts", "nobody")).toMatchObject([{ id: "hint:none", name: "Nobody found" }]);
    expect(await host.pick(X, "contacts", "15")).toEqual({ open: "https://web.whatsapp.com/send?phone=905550001122" });
    expect(await host.pick(X, "contacts", "11", "copy-number")).toEqual({ copy: "+905551234567" });
    expect(await host.pick(X, "contacts", "11", "copy-vcard")).toEqual({ copy: vcard("Mara Lind", "905551234567"), hud: "Copied Mara Lind as a vCard" });
    expect(await host.pick(X, "contacts", "11", "copy-number", { ids: ["11", "13"] })).toEqual({ copy: "+905551234567\n+905551112233" });
    expect(gets("/api/v1/people/11")).toHaveLength(1);
  });

  test("the bar item: the count of unread chats, the popover's rows with the pictures as data urls; one list shared with the palettes", async () => {
    const before = gets("/api/v1/conversations").length;
    const item = await host.render(X, "unread", { reason: "cli" });
    expect(item).toMatchObject({ icon: "\u{f05a3}", badge: 3, tooltip: "3 chats unread: 2 direct messages, 1 group", states: { unread: 3, direct: 2 } });
    await list("unread");
    expect(gets("/api/v1/conversations")).toHaveLength(before + 1);
    const view = checkView(viewOf(item));
    expect(view).toMatchObject({ id: "unread", keys: "actions", title: "3 chats unread" });
    const stacks = nodes(view.tree).filter((n): n is Extract<ViewNode, { type: "stack" }> => n.type === "stack" && !!n.action?.startsWith("focus:"));
    expect(stacks.map((s) => s.action)).toEqual([`focus:${MARA}`, `focus:${TOMAS}`, `focus:${HIKE}`]);
    const images = nodes(view.tree).filter((n): n is Extract<ViewNode, { type: "image" }> => n.type === "image");
    expect(images.map((i) => [i.alt, i.src.slice(0, 26)])).toEqual([["Mara Lind", "data:image/svg+xml;base64,"], ["Weekend hike", "data:image/svg+xml;base64,"]]);
    expect(keycaps(view)).toEqual(["enter", "space", "m", "i", "a", "p"]);
    expect(item).not.toHaveProperty("urgent");
  });

  test("ignore: an unread chat leaves the count, the popover and the Unread section until its next message, still unread (nothing sent); Show again by hand", async () => {
    await host.render(X, "unread", { reason: "cli" });
    const before = mock.calls.length;
    expect(await host.pick(X, "chats", TOMAS, "ignore")).toEqual({ keep: true, toast: { title: "Ignored until the next message", message: "Tomas Ruiz" } });
    expect(mock.calls.length).toBe(before);
    expect(await host.render(X, "unread", { reason: "update" })).toMatchObject({ badge: 2, states: { unread: 2, direct: 1 } });
    expect((await list("unread")).map((r) => r.name)).toEqual(["Mara Lind", "Weekend hike"]);
    const rows = await list("unread", "", { filter: "ignored" });
    expect(rows.map((r) => [r.name, r.section])).toEqual([["Tomas Ruiz", "Ignored until the next message"]]);
    expect(rows[0].actions!.find((a) => a.id === "unignore")).toMatchObject({ title: "Show again" });
    // His next message: counted again, the entry gone.
    Object.assign(mock.chat(TOMAS_ID), { unread: 2, lastMessageAt: iso(0) });
    try {
      expect(await host.render(X, "unread", { reason: "cli" })).toMatchObject({ badge: 3 });
      expect(Object.keys((stored.get(`${X}\0ignored`) ?? {}) as object)).toEqual([]);
    } finally { mock.reset(); await host.render(X, "unread", { reason: "cli" }); }
    await host.barAction(X, "unread", `focus:${TOMAS}`, ctx);
    expect(texts(checkView(viewOf(await host.barAction(X, "unread", "ignore", ctx))))).not.toContain("Tomas Ruiz");
    expect(await host.pick(X, "unread", TOMAS, "unignore")).toMatchObject({ toast: { title: "Shown again", message: "Tomas Ruiz" } });
    expect(await host.render(X, "unread", { reason: "update" })).toMatchObject({ badge: 3 });
    await host.barAction(X, "unread", `focus:${MARA}`, ctx);
  });

  test("popover keys: the cursor, Enter opens, space previews, r opens the field and Enter sends, Escape cancels, m and a mark read, o and p; a chat id as the action", async () => {
    host.changeSettings(X, { settings: settings({ send: true }) });
    await host.until(() => host.coreCalls.length > 0);
    await host.render(X, "unread", { reason: "cli" });
    let r = await host.barAction(X, "unread", "down", ctx);
    expect(nodes(checkView(viewOf(r)).tree).filter((n) => n.type === "stack" && !!n.selected).map((n) => n.action)).toEqual([`focus:${TOMAS}`]);
    expect(await host.barAction(X, "unread", "open", ctx)).toEqual({ open: "https://web.whatsapp.com/send?phone=905559876543" });
    await host.barAction(X, "unread", `focus:${HIKE}`, ctx);
    expect(await host.barAction(X, "unread", "open", ctx)).toEqual({ open: "https://web.whatsapp.com/", hud: "Weekend hike is a group: WhatsApp opens at the top" });
    const pv = await host.barAction(X, "unread", "preview", ctx) as { show: { title: string; actions: { id: string }[] } };
    expect(pv.show.title).toBe("Weekend hike");
    expect(pv.show.actions.map((a) => a.id)).toEqual(["open", "reply", "read", "ignore", "web"]);
    r = await host.barAction(X, "unread", "reply", ctx);
    expect(checkView(viewOf(r)).input).toEqual({ value: "", placeholder: "Message Weekend hike", submit: "send", cancel: "cancel" });
    expect((await host.barAction(X, "unread", "send", { ...ctx, values: { input: " " } })).toast).toMatchObject({ title: "Nothing to send" });
    r = await host.barAction(X, "unread", "send", { ...ctx, values: { input: "see you at the trailhead" } });
    expect(r.toast).toEqual({ title: "Sent", message: "Weekend hike: see you at the trailhead", style: "success" });
    expect(mock.writes("messages").map((c) => [c.path, c.body])).toEqual([[`/api/v1/conversations/${HIKE}/messages`, { text: "see you at the trailhead" }]]);
    await host.barAction(X, "unread", "reply", ctx);
    expect(checkView(viewOf(await host.barAction(X, "unread", "cancel", ctx))).input).toBeUndefined();
    mock.reset();
    await host.render(X, "unread", { reason: "cli" });
    await host.barAction(X, "unread", `focus:${HIKE}`, ctx);
    expect(await host.barAction(X, "unread", "read", ctx)).toEqual({ keep: true, hud: "Weekend hike: read" });
    expect(await host.barAction(X, "unread", "read", { ...ctx, ids: [MARA, TOMAS] })).toEqual({ keep: true, hud: "Marked 2 read" });
    expect(await host.barAction(X, "unread", "read-all", ctx)).toEqual({ keep: true, hud: "Marked read" });
    expect(wrote("read")).toEqual([HIKE_ID, MARA_ID, TOMAS_ID]);
    expect(await host.barAction(X, "unread", "open-pal", ctx)).toEqual({ push: { extension: X, palette: "unread" } });
    expect(await host.barAction(X, "unread", "open-whatsapp", ctx)).toEqual({ open: "https://web.whatsapp.com/" });
    expect(await host.barAction(X, "unread", MARA)).toEqual({ open: "https://web.whatsapp.com/send?phone=905551234567" });
    const stays = await host.render(X, "unread", { reason: "cli" });
    expect(stays).toMatchObject({ tooltip: "Nothing unread", states: { unread: 0, direct: 0 }, empty: { icon: "\u{f05a3}", tooltip: "Nothing unread" } });
    expect(texts(checkView(viewOf(stays.empty!)))).toEqual(expect.arrayContaining(["Recent", "Mara Lind", "Weekend hike"]));
    mock.reset();
    host.changeSettings(X, { settings: settings() });
    await relist();
  });

  test("links: open by Wisp's id, by number or WhatsApp id, by name (a chat, then a person), the refusals; search pushes the palette with the query", async () => {
    const open = (chat?: string) => host.request<unknown>("link", { extension: X, route: "open", params: chat === undefined ? {} : { chat } });
    expect(await open(TOMAS)).toEqual({ open: "https://web.whatsapp.com/send?phone=905559876543" });
    expect(await open("+90 555 000 11 22")).toEqual({ open: "https://web.whatsapp.com/send?phone=905550001122" });
    expect(await open("905550001122@s.whatsapp.net")).toEqual({ open: "https://web.whatsapp.com/send?phone=905550001122" });
    expect(await open("mara")).toEqual({ open: "https://web.whatsapp.com/send?phone=905551234567" });
    expect(await open("Dana")).toEqual({ open: "https://web.whatsapp.com/send?phone=905550001122" });
    await expect(open("nobody")).rejects.toThrow('no chat or contact named "nobody"');
    await expect(open()).rejects.toThrow("chat is required");
    expect(await host.request<unknown>("link", { extension: X, route: "search", params: { q: "cabin" } })).toEqual({ push: { extension: X, palette: "search", query: "cabin" } });
  });

  test("the stream: a WhatsApp message refreshes the bar at once, another network's does not; the WhatsApp unread moving does", async () => {
    const refreshes = () => host.coreCalls.filter((c) => c.method === "bar.refresh" && (c.params as { extension: string }).extension === X).length;
    await host.render(X, "unread", { reason: "cli" });
    await host.until(() => mock.streaming > 0, 3000, "the stream");
    await host.advance(300);
    const n = refreshes();
    mock.emit("message.new", { conversationId: KARGO_ID, accountId: 5, channel: "sms" });
    await host.advance(300);
    expect(refreshes()).toBe(n);
    mock.emit("message.new", { conversationId: MARA_ID, accountId: 1, channel: "whatsapp" });
    mock.emit("message.new", { conversationId: MARA_ID, accountId: 1, channel: "whatsapp" });
    await host.advanceUntil(300, () => refreshes() > n, "a refresh");
    await host.advance(300);
    expect(refreshes()).toBe(n + 1);
    // The first count is the baseline (Wisp opens the stream with one); a move from it refreshes, a count that stays does not.
    mock.emit("unread.changed", { unread: 9, accounts: [{ accountId: 1, unread: 3 }] });
    mock.emit("unread.changed", { unread: 8, accounts: [{ accountId: 1, unread: 3 }, { accountId: 5, unread: 0 }] });
    await host.advance(300);
    expect(refreshes()).toBe(n + 1);
    mock.emit("unread.changed", { unread: 7, accounts: [{ accountId: 1, unread: 2 }] });
    await host.advanceUntil(300, () => refreshes() > n + 1, "a refresh");
  });

  test("a wrong token is a hint naming Wisp's setting; Wisp not set up a hint and a hidden bar item; an unreachable server names the url", async () => {
    host.changeSettings("wisp", { settings: wispSettings({ token: "wrong" }) });
    await host.until(() => host.coreCalls.length > 0);
    expect(await relist()).toMatchObject([{ id: "hint:auth", name: "Wisp refused the token", subtitle: "401: check the token under Settings › Extensions › Wisp", actions: [{ id: "settings", title: "Open Wisp settings" }] }]);
    expect(await host.pick(X, "chats", "hint:auth")).toEqual({ open: "pal://settings/extensions" });
    host.changeSettings("wisp", { settings: wispSettings({ token: "" }) });
    await host.until(() => host.coreCalls.length > 0);
    expect(await relist()).toMatchObject([{ id: "hint:setup", name: "Wisp is not set up" }]);
    expect(await host.render(X, "unread", { reason: "cli" })).toEqual({ hidden: true, states: { unread: null, direct: null } });
    host.changeSettings("wisp", { settings: wispSettings({ url: "http://127.0.0.1:1" }) });
    await host.until(() => host.coreCalls.length > 0);
    expect(await relist()).toMatchObject([{ id: "hint:unreachable", name: "Wisp is unreachable at http://127.0.0.1:1" }]);
    host.changeSettings("wisp", { settings: wispSettings() });
    await host.until(() => host.coreCalls.length > 0);
    expect((await relist())[0]).toMatchObject({ id: MARA });
  });
});
