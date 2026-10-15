// Writes test/shots/flash.json, the store screenshots' fixture: the palette
// before the collection is followed, offering to add it, and its actions.
// `bun run flash/fixture.ts`, then `make shots EXT=flash`.
import type { View } from "../.pal/sdk/src/index.ts";
import { Host } from "../.pal/host/test/harness.ts";
import { pinClock, writeFixture } from "../.pal/app/scripts/fixture-kit.ts";

pinClock();
const host = await Host.bundled({ only: ["flash"], core: { "extensions.list": () => [], "store.state": () => ({ registries: [], available: [] }) } });
try {
  const meta = host.loaded().find((l) => l.extension === "flash")!.palettes[0];
  const add = await host.request<View>("view", { extension: "flash", palette: "flash" });
  writeFixture("flash", {
    palettes: { flash: { title: meta.title, icon: meta.icon, view: "view", tree: add } },
    shots: {
      "1-add": { palette: "flash", keys: [], caption: "Until the Flash games collection is added, the palette offers to add it; it asks for a password, then its games show here as in Games" },
      "2-actions": { palette: "flash", keys: ["cmd+k"], caption: "One thing to do until then: add the collection" },
    },
  });
  console.log("wrote test/shots/flash.json");
} finally {
  host.kill();
}
