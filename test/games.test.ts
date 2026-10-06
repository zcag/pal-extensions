// games against the repo's own manifests: a canned `extensions.list` with
// the games, a `fun` extension that is no game (gifs, a grid), one that is
// not fun (calc), one not loaded (wordle), one whose manifest is gone, and
// games itself; and a canned `store.state` offering games not installed
// (pong, one for this platform; one for another; one with no build that
// runs here; one already installed; a fun one with no view palette). The
// rows (every game by title, the ones on offer under Not installed), the
// showcase (every game by title, the ones on offer after; the strip, the
// keys that walk it), the pick (a push of an installed game; an install,
// then the push, for one on offer), the game while it installs, an install
// that fails, and the pictures: fetched once from the listing's url (its
// dark twin first) into the cache, and the tree pushed again when they land.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AvailableExtension, StoreResult, View, ViewNode } from "../.pal/sdk/src/index.ts";
import { Host } from "../.pal/host/test/harness.ts";

const REPO = join(import.meta.dir, "..");
/** A game's manifest from the copies in games-shelf/ (zcag/pal-games has the games), the rest from this repo. */
const rootOf = (name: string) => (existsSync(join(REPO, name, "pal.json")) ? REPO : join(import.meta.dir, "games-shelf"));
const ext = (name: string, loaded = true) => ({ name, version: "0.1.0", root: rootOf(name), loaded, store: false, bundled: true });
const INSTALLED = [...["games", "snake", "solitaire", "blackjack", "minesweeper", "yahtzee", "crossword", "sudoku", "2048", "gifs", "calc"].map((n) => ext(n)), ext("wordle", false), { ...ext("gone"), root: "/nowhere" }];
const PLATFORM = process.platform === "darwin" ? "macos" : "linux";
const listing = (title: string, over: Partial<AvailableExtension["listing"]> = {}) => ({ title, description: "", tagline: `${title}, the game`, features: [], category: "fun", keywords: [], icon: { tile: { glyph: "g", bg: "green" } }, author: "pal", platforms: null, play: true, palettes: [{ id: title.toLowerCase(), title, kind: "view" }], screenshots: [], requires: [], suggests: [], ...over });
const offer = (name: string, over: Partial<AvailableExtension> = {}, l: Partial<AvailableExtension["listing"]> = {}): AvailableExtension => ({ name, registry: "pal", installed: false, bundled: false, installable: true, listing: listing(name[0].toUpperCase() + name.slice(1), l), ...over });
const AVAILABLE = [
  offer("pong"),
  offer("tetris", {}, { platforms: [PLATFORM === "macos" ? "linux" : "macos"] }),
  offer("chess", { installable: false, blocked: "needs pal with protocol 9" }),
  offer("snake", { installed: true }),
  offer("quotes", {}, { palettes: [{ id: "quotes", title: "Quotes", kind: "list" }] }),
  offer("weather", {}, { category: "reference" }),
];

const cache = mkdtempSync(join(tmpdir(), "pal-games-test-"));
process.env.PAL_GAMES_CACHE = cache;
const { offered } = await import("../games/index.ts");
const { rowsShown, vertical } = await import("../games/showcase.ts");

/** pal's site for the pictures: a PNG at every `-dark.png`, nothing at the light ones, counting the asks. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const asked: string[] = [];
const site = Bun.serve({ port: 0, fetch: (r) => { asked.push(new URL(r.url).pathname); return r.url.endsWith("-dark.png") ? new Response(PNG, { headers: { "content-type": "image/png" } }) : new Response("no", { status: 404 }); } });

const find = (n: ViewNode, pred: (n: ViewNode) => boolean, out: ViewNode[] = []): ViewNode[] => {
  if (pred(n)) out.push(n);
  if (n.type === "stack") for (const c of n.children) find(c, pred, out);
  return out;
};
const texts = (v: View) => find(v.tree, (n) => n.type === "text").map((n) => (n as { value: string }).value);
/** The grid's covers, by the game each opens on a click. */
const strip = (v: View) => find(v.tree, (n) => typeof n.action === "string" && n.action.startsWith("go:")).map((n) => n.action!.slice(3));
const hero = (v: View) => find(v.tree, (n) => typeof n.key === "string" && n.key.startsWith("info-"))[0]!.key!.slice(5);
/** The first push since `from` the predicate takes (a push may land before the test looks). */
const pushed = async (pred: (spec: string) => boolean, from = 0) => {
  const hit = () => host.viewUpdates("games", { palette: "games" }).slice(from).find((u) => pred(JSON.stringify(u.spec)));
  await host.until(() => !!hit(), 3000, "the push");
  return JSON.stringify(hit()!.spec);
};
const open = () => host.request<View>("view", { extension: "games", palette: "games" });
const pick = async (action: string) => (await host.pick("games", "games", "games", action)) as { view?: View; push?: unknown; keep?: true };

let host: Host;
let installed = INSTALLED;
let avail = AVAILABLE;
let answer: (name: string) => StoreResult | Promise<StoreResult> = (name) => ({ name, ok: true, loaded: true });
const installs: unknown[] = [];
beforeAll(async () => {
  host = await Host.bundled({
    only: ["games"],
    core: {
      "extensions.list": () => installed,
      "store.state": () => ({ available: avail }),
      "store.install": (p: any) => { installs.push(p); return answer(p.name); },
    },
  });
});
afterAll(() => { host?.kill(); site.stop(true); rmSync(cache, { recursive: true, force: true }); });

test("offered: fun, a view palette, this platform, a build that runs here, not installed", () => {
  expect(offered(AVAILABLE, new Set()).map((g) => g.extension)).toEqual(["pong"]);
  expect(offered(AVAILABLE, new Set(["pong"]))).toEqual([]);
});

test("the grid: every game by title, the installed ones first, then the ones on offer; the first opens", async () => {
  const v = await open();
  expect(strip(v)).toEqual(["2048/2048", "blackjack/blackjack", "crossword/crossword", "minesweeper/minesweeper", "snake/snake", "solitaire/solitaire", "sudoku/sudoku", "yahtzee/yahtzee", "pong/pong"]);
  // Covers ask the app for a thumbnail it serves (256 px at most), never more.
  expect(JSON.stringify(v.tree)).not.toMatch(/size=(?:2[6-9]\d|[3-9]\d\d)/);
  expect(hero(v)).toBe("2048/2048");
  expect(v.title).toBe("1 of 9");
  expect(v.actions.map((a) => a.id)).toContain("boards");
});

test("the grid shows two rows of five, scrolling only when the cursor leaves them; up and down keep the column", () => {
  expect(rowsShown(17, 0)).toEqual([0, 2]);
  expect(rowsShown(17, 9)).toEqual([0, 2]);
  expect(rowsShown(17, 10)).toEqual([1, 3]);
  expect(rowsShown(17, 16)).toEqual([2, 4]);
  expect(rowsShown(17, 12)).toEqual([2, 4]);
  expect(rowsShown(17, 6)).toEqual([1, 3]);
  expect(rowsShown(3, 2)).toEqual([0, 1]);
  expect(vertical(17, 2, 1)).toBe(7);
  expect(vertical(17, 2, -1)).toBe(2);
  // Below a short last row: its last game; from the last row, nowhere.
  expect(vertical(17, 13, 1)).toBe(16);
  expect(vertical(17, 16, 1)).toBe(16);
  rowsShown(17, 0);
});

test("the keys walk the grid: next and previous round the ends, up and down a row, a letter to the next game starting with it, a click to the cover", async () => {
  await open();
  expect(hero((await pick("prev")).view!)).toBe("pong/pong");
  expect(hero((await pick("next")).view!)).toBe("2048/2048");
  expect(hero((await pick("next")).view!)).toBe("blackjack/blackjack");
  expect(hero((await pick("down")).view!)).toBe("sudoku/sudoku");
  expect(hero((await pick("up")).view!)).toBe("blackjack/blackjack");
  expect(hero((await pick("jump:s")).view!)).toBe("snake/snake");
  const solitaire = (await pick("jump:s")).view!;
  expect(hero(solitaire)).toBe("solitaire/solitaire");
  expect(texts(solitaire)).toContain("Solitaire");
  expect(hero((await pick("go:2048/2048")).view!)).toBe("2048/2048");
  // The cursor is kept: the next open lands where the last one left.
  expect(hero(await open())).toBe("2048/2048");
});

test("Enter pushes an installed game's palette; cmd+L its leaderboards", async () => {
  await open();
  await pick("jump:s");
  expect(await pick("play")).toEqual({ push: { extension: "snake", palette: "snake" } });
  expect(await pick("boards")).toEqual({ push: { extension: "games", palette: "leaderboards", args: { game: "snake" } } });
});

test("a game on offer says so; Enter installs it from its registry, the game says Installing meanwhile, then pushes it", async () => {
  await open();
  const v = (await pick("jump:p")).view!;
  expect(texts(v)).toEqual(expect.arrayContaining(["Pong", "Pong, the game"]));
  expect(find(v.tree, (n) => n.type === "badge").map((n) => (n as { text: string }).text)).toEqual(["Not installed"]);
  expect(v.actions[0]).toMatchObject({ id: "install", title: "Install and play", shortcut: "enter" });
  let release!: () => void;
  answer = (name) => new Promise((r) => { release = () => r({ name, ok: true, loaded: true }); });
  try {
    const picked = pick("install");
    await host.until(() => installs.length === 1);
    await pushed((spec) => spec.includes("Installing…"));
    release();
    expect(await picked).toEqual({ push: { extension: "pong", palette: "pong" } });
    expect(installs[0]).toEqual({ name: "pong", registry: "pal", from: "games" });
  } finally {
    answer = (name) => ({ name, ok: true, loaded: true });
  }
});

test("an install that fails says why on the game, until the next try", async () => {
  await open();
  await pick("jump:p");
  answer = (name) => ({ name, ok: false, error: "offline: pal.cagdas.io is not reachable" });
  try {
    const v = (await pick("install")).view!;
    expect(texts(v)).toContain("Could not install: offline: pal.cagdas.io is not reachable");
    expect(v.actions[0]).toMatchObject({ id: "install", title: "Try the install again" });
    answer = (name) => ({ name, ok: true, loaded: false, error: "SyntaxError" });
    expect(texts((await pick("install")).view!)).toContain("Could not install: SyntaxError");
    answer = (name) => ({ name, ok: true, loaded: true });
    await pick("install");
    expect(texts(await open()).some((t) => t.startsWith("Could not install"))).toBe(false);
  } finally {
    answer = (name) => ({ name, ok: true, loaded: true });
  }
});

test("pictures: the listing's first screenshot, its dark twin, fetched once into the cache; the tree is pushed when it lands", async () => {
  const url = `http://127.0.0.1:${site.port}/extensions/pong/screenshots/1-play.png`;
  avail = AVAILABLE.map((a) => (a.name === "pong" ? { ...a, listing: { ...a.listing, screenshots: [{ url, caption: "" }] } } : a));
  try {
    const from = host.viewUpdates("games", { palette: "games" }).length;
    // Not here yet: Pong's cover is its glyph on a well, and the fetch started.
    expect(JSON.stringify((await open()).tree)).not.toContain("icon://");
    expect(await pushed((spec) => spec.includes("icon://localhost/file"), from)).toContain(encodeURIComponent(cache));
    expect(asked).toEqual(["/extensions/pong/screenshots/1-play-dark.png"]);
    // Drawn from the cache from now on, without asking again.
    expect(JSON.stringify((await pick("jump:p")).view!.tree)).toContain("icon://localhost/file");
    expect(asked).toHaveLength(1);
  } finally {
    avail = AVAILABLE;
  }
});

test("the cover: the shot with a crop, not the first; the grid tile shows that crop, the top the whole game", async () => {
  const base = `http://127.0.0.1:${site.port}/extensions/pong/screenshots`;
  avail = AVAILABLE.map((a) => (a.name === "pong" ? { ...a, listing: { ...a.listing, screenshots: [{ url: `${base}/1-menu.png` }, { url: `${base}/2-rally.png`, cover: [600, 300, 400, 200] as [number, number, number, number] }] } } : a));
  try {
    await open();
    await pick("jump:p");
    await host.until(() => asked.includes("/extensions/pong/screenshots/2-rally-dark.png"), 3000, "the cover shot");
    expect(asked).not.toContain("/extensions/pong/screenshots/1-menu-dark.png");
  } finally {
    avail = AVAILABLE;
  }
});

test("past two rows, every cover is drawn in a window that slides; the cursor's row is in it", async () => {
  avail = [...AVAILABLE, ...["qix", "rogue", "tron"].map((n) => offer(n))];
  try {
    await open();
    const v = (await pick("go:2048/2048")).view!;
    // Twelve games: three rows, all of them drawn, a window two rows and a bit tall with the spacer that places them.
    expect(strip(v)).toHaveLength(12);
    const scroll = () => find(v.tree, (n) => n.key === "scroll");
    expect(scroll()).toHaveLength(1);
    const last = (await pick("prev")).view!;
    expect(hero(last)).toBe("tron/tron");
    // Centred in the window: at the top a spacer over the grid holds it down to its first row; at the bottom one under it lifts it.
    const above = (t: View) => (find(t.tree, (n) => n.key === "grid")[0] as { children: ViewNode[] }).children[0]!.key === "scroll";
    expect(above(v)).toBe(true);
    expect(above(last)).toBe(false);
    expect(strip(last)).toHaveLength(12);
    expect(rowsShown(12, 11)).toEqual([1, 3]);
  } finally {
    avail = AVAILABLE;
    await open();
  }
});

test("what came out in the last week comes first, newest first, marked New; then the installed games, then the rest", async () => {
  const day = 86_400, t = Math.floor(Date.now() / 1000);
  const out = (name: string, ago: number) => (a: AvailableExtension) => (a.name === name ? { ...a, listing: { ...a.listing, released: t - ago * day } } : a);
  avail = [...AVAILABLE, offer("qix")].map(out("pong", 2)).map(out("qix", 30)).map(out("snake", 1));
  try {
    await open();
    const v = (await pick("go:snake/snake")).view!;
    expect(strip(v).slice(0, 3)).toEqual(["snake/snake", "pong/pong", "2048/2048"]);
    // Qix came out a month ago: with the others on offer, by title.
    expect(strip(v).at(-1)).toBe("qix/qix");
    expect(find(v.tree, (n) => n.type === "badge").map((n) => (n as { text: string }).text)).toContain("New");
    expect(find((await pick("go:2048/2048")).view!.tree, (n) => n.type === "badge").map((n) => (n as { text: string }).text)).not.toContain("New");
  } finally {
    avail = AVAILABLE;
  }
});

test("no games: says where to get them", async () => {
  installed = [ext("calc")];
  try {
    // Pong is still on offer: it shows, not the message.
    expect(hero(await open())).toBe("pong/pong");
    avail = [];
    expect(texts(await open())).toEqual(["No games yet", "The store's Fun shelf has them"]);
  } finally {
    installed = INSTALLED;
    avail = AVAILABLE;
  }
});
