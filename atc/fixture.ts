// Writes test/shots/atc.json and bar-atc.json, the store screenshots'
// fixtures: the palettes listed through the host harness against the atc
// mock (test/atc-mock.ts, invented sessions on invented machines) at the
// fixed clock, the chat Enter opens recorded as its effect, the bar item
// rendered the same way with its popover and the chat over it.
// `bun run atc/fixture.ts`, then `make shots EXT=atc`.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pinClock, settle, writeFixture } from "../.pal/app/scripts/fixture-kit.ts";
import type { View } from "../.pal/sdk/src/protocol.ts";

// Before the mock and the harness load: the mock dates its sessions by the SDK's clock, read once at load.
pinClock();
process.env.ATC_CONFIG_DIR = mkdtempSync(join(tmpdir(), "atc-config-"));
const { AtcMock, PARSER, TOKEN } = await import("../test/atc-mock.ts");
const { Host } = await import("../.pal/host/test/harness.ts");

const mock = new AtcMock();
const host = await Host.bundled({ settings: { atc: { settings: { url: mock.url, token: TOKEN, open: "browser" } } }, only: ["atc"], timeout: 8000 });

try {
  const p = host.loaded().find((l) => l.extension === "atc")!.palettes;
  const meta = (name: string) => p.find((x) => x.name === name)!;
  const items = await host.list("atc", "sessions");
  const details = Object.fromEntries(await Promise.all(items.slice(0, 4).map(async (r) => [r.id, await host.detail("atc", "sessions", r.id)])));
  const chat = await host.request<View>("view", { extension: "atc", palette: "chat", args: { session: PARSER } });
  const folders = await host.list("atc", "new");
  const fixture = {
    palettes: {
      sessions: { title: meta("sessions").title, icon: meta("sessions").icon, live: true, tier: "primary", placeholder: meta("sessions").placeholder, filters: meta("sessions").filters, items, details },
      new: { title: meta("new").title, icon: meta("new").icon, live: true, placeholder: meta("new").placeholder, items: folders },
    },
    effects: { [`sessions/${PARSER}:chat`]: { view: chat } },
    shots: {
      "1-list": { palette: "sessions", keys: ["wait:300"], caption: "Every session on every machine atc lists: the ones that need you first, with what each is doing or asking to run" },
      "2-detail": { palette: "sessions", keys: ["cmd+i", "wait:400"], caption: "The pane: what it asks, your last message and its last reply; the machine, folder, model and context below" },
      "3-chat": { palette: "sessions", keys: ["enter", "wait:400"], caption: "Enter opens the chat: the conversation live, the command it asks to run with cmd+y to allow and cmd+. to say no, a field to reply" },
      "4-new": { palette: "new", keys: ["wait:300"], caption: "New Session: a folder on any machine, the first message typed after Tab" },
      "5-actions": { palette: "sessions", keys: ["cmd+k", "wait:300"], caption: "⌘K on a session: allow, say no, open it in a terminal or atc's page, its outputs, pin, park, rename, stop" },
    },
  };
  const hosts = { hosts: { [mock.url]: "https://atc.example" } };
  writeFixture("atc", await settle(fixture, hosts));
  console.log(`atc.json: ${items.length} sessions, ${folders.length} folders`);

  const item = await host.render("atc", "sessions", { reason: "cli" });
  const view = (item.menu as { view: View }).view;
  const popChat = await host.request<View>("view", { extension: "atc", palette: "chat", args: { session: PARSER }, compact: true });
  const bar = {
    key: "atc/sessions",
    title: "Sessions",
    // The manifest's `needs` rule makes the item urgent while a session needs you; the core applies it after render, so the fixture shows it as drawn.
    item: { ...item, urgent: true, menu: { view } },
    states: [{ id: "chat", item: { menu: { view: popChat } } }],
    shots: {
      "menubar": { target: "menubar", caption: "On the menu bar: how many sessions need you, are your turn and are working, an alarm while one needs you" },
      "popover": { target: "menubar", popover: true, caption: "A click opens the popover: every session by state on every machine; Enter opens its chat, y allows, i says no" },
      "popover-chat": { target: "menubar", popover: true, state: "chat", caption: "The chat in the popover: what it asks and the conversation, answered without opening pal" },
      "sketchybar": { target: "sketchybar", caption: "On sketchybar: the three counts in red, amber and blue" },
    },
  };
  writeFileSync(new URL("../test/shots/bar-atc.json", import.meta.url), JSON.stringify(await settle(bar, hosts)) + "\n");
  console.log(`bar-atc.json: ${item.segments?.map((s) => s.text).join("/")}`);
} finally {
  host.kill();
  mock.stop();
}
