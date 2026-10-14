// Writes test/shots/flash.json, the store screenshots' fixture: the palette
// and its action. `bun run flash/fixture.ts`, then `make shots EXT=flash`.
import { Host } from "../.pal/host/test/harness.ts";
import { pinClock, writeFixture } from "../.pal/app/scripts/fixture-kit.ts";

pinClock();
const host = await Host.bundled();
try {
  const meta = host.loaded().find((l) => l.extension === "flash")!.palettes[0];
  writeFixture("flash", {
    palettes: { flash: { title: meta.title, icon: meta.icon, items: await host.list("flash", "flash") } },
    shots: {
      "1-add": { palette: "flash", keys: [], caption: "Follows the Flash games collection; it asks for a password, then its games show in Games" },
      "2-actions": { palette: "flash", keys: ["cmd+k"], caption: "One thing to do: add the collection" },
    },
  });
  console.log("wrote test/shots/flash.json");
} finally {
  host.kill();
}
