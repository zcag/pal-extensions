// Writes test/shots/games.json, the store screenshots' fixture: the
// showcase as index.ts draws it through the host harness, from the repos'
// own manifests. The machine it shows is a 0.9 one: the games come from
// pal's registry (docs/design/distribution.md, "What is bundled"),
// Solitaire, Wordle and Snake are installed, and every other game the
// registry lists is on offer after them. The pictures are the games' own
// store screenshots (pal-games, beside this repo), put in the showcase's
// cache as if downloaded and inlined here as small JPEGs (the gallery has
// no `icon://` scheme; `sips`, so this runs on a Mac). The last shot is
// Wordle's leaderboards, as boards.ts draws them from a canned board (the
// core's `leaderboard.get`) and a canned list of boards (pal's server, a
// local one here).
// `bun run games/fixture.ts`, then `make shots EXT=games`.
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Host, extensionsByName } from "../.pal/host/test/harness.ts";
import { pinClock, writeFixture } from "../.pal/app/scripts/fixture-kit.ts";
import type { AvailableExtension, Effect, LeaderboardRow, View } from "../.pal/sdk/src/index.ts";
import manifest from "./pal.json" with { type: "json" };

const INSTALLED = new Set(["games", "solitaire", "wordle", "snake"]);
const cache = mkdtempSync(join(tmpdir(), "pal-games-fixture-"));
process.env.PAL_GAMES_CACHE = cache;
const { fileOf } = await import("./showcase.ts");

pinClock();
const dirs = extensionsByName();
const names = [...dirs.keys()].sort();
const installed = names.filter((n) => INSTALLED.has(n)).map((name) => ({ name, version: "0.1.0", root: dirname(dirs.get(name)!), loaded: true, store: name !== "games", bundled: name === "games" }));
const available: AvailableExtension[] = names.map((name) => {
  const m = JSON.parse(readFileSync(join(dirs.get(name)!, "pal.json"), "utf8"));
  const s = m.store ?? {};
  // The listing's screenshots as pal-pack writes them (a cover keeps its crop), each picture in the cache as the showcase would have fetched it.
  const shots = ((s.screenshots ?? []) as { file: string; caption?: string; cover?: [number, number, number, number] }[]).filter((x) => !x.file.startsWith("bar-")).map((x) => ({ url: `https://pal.cagdas.io/extensions/${name}/screenshots/${x.file}`, caption: x.caption ?? "", ...(x.cover && { cover: x.cover }), local: join(dirs.get(name)!, "screenshots", x.file.replace(/\.png$/, "-dark.png")) }));
  if (s.category === "fun") for (const x of shots) if (existsSync(x.local)) copyFileSync(x.local, fileOf(x.url));
  return {
    name, registry: "pal", installed: INSTALLED.has(name), bundled: name === "games", installable: true,
    listing: {
      title: m.title ?? name, description: m.description ?? "", tagline: s.tagline ?? "", features: s.features ?? [], category: s.category ?? "", keywords: m.keywords ?? [], icon: m.icon ?? null, author: m.author ?? "",
      platforms: s.platforms ?? null, play: !!s.play, palettes: Object.entries(m.palettes ?? {}).map(([id, p]: [string, any]) => ({ id, title: p.title ?? m.title ?? id, kind: p.kind ?? "list" })),
      screenshots: shots.map(({ local: _, ...x }) => x), requires: m.requires ?? [], suggests: m.suggests ?? [],
    },
  };
});

/** Every `icon://` file picture in the trees as a JPEG data url, fitted to the size it asks for (0, the file itself: 1000, as much as a zoomed cover shows). */
const inlined = new Map<string, string>();
function inline<T>(x: T): T {
  return JSON.parse(JSON.stringify(x).replace(/icon:\/\/localhost\/file\?path=([^&"]+)&size=(\d+)/g, (url, path, size) => {
    // The app's route refuses a thumbnail over 256 px (a 404, a broken picture): fail here, since the gallery would draw it anyway.
    if (Number(size) > 256) throw new Error(`fixture: ${url} asks for a ${size} px thumbnail; the app fits at most 256`);
    if (!inlined.has(url)) {
      const out = join(cache, `inline-${inlined.size}.jpg`);
      Bun.spawnSync(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "80", "-Z", String(Number(size) || 1000), decodeURIComponent(path), "--out", out]);
      inlined.set(url, `data:image/jpeg;base64,${readFileSync(out).toString("base64")}`);
    }
    return inlined.get(url)!;
  }));
}

// Today's Wordle board: guesses, fewest first; anonymous players among them, and you.
const row = (rank: number, name: string, value: number, anon = false, me = false): LeaderboardRow => ({ rank, name, anon, value, at: 1790000000, me });
const board = { board: null, me: null, rows: [row(1, "quillon", 2), row(2, "Teal Fox", 3, true), row(3, "ada", 3), row(4, "kemal", 3, false, true), row(5, "Brisk Heron", 4, true), row(6, "noor", 4), row(7, "bilge", 5), row(8, "Quiet Lynx", 6, true)] };
const server = Bun.serve({ port: 0, fetch: () => Response.json({ boards: [{ id: "daily/301" }, { id: "daily/300" }, { id: "daily/299" }, { id: "streak" }] }) });
process.env.PAL_ACCOUNT_API = `http://127.0.0.1:${server.port}`;
const host = await Host.bundled({ only: ["games"], core: { "extensions.list": () => installed, "store.state": () => ({ available }), "leaderboard.get": () => board, "account.get": () => ({ signedIn: true, handle: "kemal" }) } });
try {
  const pick = async (action: string) => ((await host.pick("games", "games", "games", action)) as Effect & { view: View }).view;
  // Opens on Snake II (the first installed); right walks the strip; v jumps to Vortex, on offer.
  const open = await host.request<View>("view", { extension: "games", palette: "games" });
  const next = await pick("next");
  const vortex = await pick("jump:v");
  await host.request<View>("view", { extension: "games", palette: "leaderboards", args: { game: "wordle" } });
  const has = (v: View) => JSON.stringify(v.tree).includes("quillon") && JSON.stringify(v.tree).includes("Wordle #301");
  await host.until(() => host.viewUpdates("games", { palette: "leaderboards" }).some((u) => has(u.spec as View)), 5000, "the board");
  const boards = host.viewUpdates("games", { palette: "leaderboards" }).map((u) => u.spec as View).find(has)!;
  writeFixture("games", {
    palettes: {
      games: { title: manifest.title, icon: manifest.icon, view: "view", tree: inline(open) },
      offer: { title: manifest.title, icon: manifest.icon, view: "view", tree: inline(vortex) },
      leaderboards: { title: "Leaderboards", icon: manifest.icon, view: "view", tree: boards },
    },
    effects: { "games/games:next": { view: inline(next) } },
    shots: {
      "1-showcase": { palette: "games", keys: ["wait:300", "right", "wait:900"], caption: "The game you are on at the top, its screenshot and what it is; the covers under it walk every game, yours first" },
      "2-not-installed": { palette: "offer", keys: ["wait:600"], caption: "A game you do not have yet, marked Not installed: Enter installs it and starts it" },
      "3-leaderboards": { palette: "leaderboards", keys: ["wait:1000"], caption: "A game's leaderboards: today's Wordle, fewest guesses first, anonymous players marked and your own row ringed" },
    },
  });
  console.log(`wrote test/shots/games.json: ${readdirSync(cache).length} pictures, ${inlined.size} inlined`);
} finally {
  host.kill();
  server.stop(true);
  rmSync(cache, { recursive: true, force: true });
}
