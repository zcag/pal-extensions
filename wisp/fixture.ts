// Writes test/shots/wisp.json and bar-wisp.json, the store screenshots'
// fixtures: the inbox listed through the host harness against the Wisp
// mock (test/wisp-mock.ts, invented people on invented accounts) at the
// fixed clock, the conversation Enter opens recorded as its effect, the bar
// item rendered the same way with its popover and the conversation over it.
// `bun run wisp/fixture.ts`, then `make shots EXT=wisp`.
import { writeFileSync } from "node:fs";
import { pinClock, settle, writeFixture } from "../.pal/app/scripts/fixture-kit.ts";
import type { View } from "../.pal/sdk/src/protocol.ts";

// Before the mock and the harness load: the mock dates its messages by the SDK's clock, read once at load.
pinClock();
const { ADA, FAMILY, TOKEN, WispMock } = await import("../test/wisp-mock.ts");
const { Host } = await import("../.pal/host/test/harness.ts");

const mock = new WispMock();
const host = await Host.bundled({ settings: { wisp: { settings: { url: mock.url, token: TOKEN, read_on_open: false } } }, only: ["wisp"], timeout: 8000 });

try {
  const p = host.loaded().find((l) => l.extension === "wisp")!.palettes;
  const meta = (name: string) => p.find((x) => x.name === name)!;
  const items = await host.list("wisp", "inbox");
  const details = Object.fromEntries(await Promise.all(items.slice(0, 3).map(async (r) => [r.id, await host.detail("wisp", "inbox", r.id)])));
  const chat = await host.request<View>("view", { extension: "wisp", palette: "conversation", args: { id: ADA } });
  const fixture = {
    palettes: {
      inbox: { title: meta("inbox").title, icon: meta("inbox").icon, live: true, placeholder: meta("inbox").placeholder, filters: meta("inbox").filters, items, details },
    },
    effects: { [`inbox/${ADA}:open`]: { view: chat } },
    shots: {
      "1-list": { palette: "inbox", keys: ["wait:300"], caption: "Every account's inbox in one list, under Wisp's sections: the picture, the last line, the unread count in the network's colour, a To do that is due" },
      "2-detail": { palette: "inbox", keys: ["down", "down", "down", "cmd+i", "wait:400"], caption: "The pane: the latest messages of the conversation, its account and what is unread" },
      "3-conversation": { palette: "inbox", keys: ["down", "enter", "wait:400"], caption: "Enter opens the conversation: messages by day, the photo inline, a field that sends on Enter; cmd+t makes it a To do, cmd+e marks it done" },
      "4-actions": { palette: "inbox", keys: ["cmd+k", "wait:300"], caption: "⌘K on a conversation: read or unread, send a message, To do, tomorrow, waiting on them, done, open in Wisp" },
    },
  };
  const hosts = { hosts: { [mock.url]: "https://wisp.example" } };
  writeFixture("wisp", await settle(fixture, hosts));
  console.log(`wisp.json: ${items.length} conversations`);

  const item = await host.render("wisp", "inbox", { reason: "cli" });
  const view = (item.menu as { view: View }).view;
  const popChat = await host.request<View>("view", { extension: "wisp", palette: "conversation", args: { id: FAMILY }, compact: true });
  const bar = {
    key: "wisp/inbox",
    title: "Inbox",
    item: { ...item, menu: { view } },
    states: [{ id: "conversation", item: { menu: { view: popChat } } }],
    shots: {
      "menubar": { target: "menubar", caption: "On the menu bar: an @ count for mentions meant for you, each network's glyph with its unread count, the To dos that are due" },
      "popover": { target: "menubar", popover: true, caption: "A click opens every inbox behind a tab per network: Enter opens a conversation, r replies, m marks read, t makes a To do, e marks it done" },
      "popover-conversation": { target: "menubar", popover: true, state: "conversation", caption: "A group conversation in the popover, each sender named, answered without opening pal" },
      "sketchybar": { target: "sketchybar", caption: "On sketchybar: the same counts, each network in its colour and the @ in red" },
    },
  };
  writeFileSync(new URL("../test/shots/bar-wisp.json", import.meta.url), JSON.stringify(await settle(bar, hosts)) + "\n");
  console.log(`bar-wisp.json: ${item.segments?.map((s) => s.text).join("/")}`);
} finally {
  host.kill();
  mock.stop();
}
