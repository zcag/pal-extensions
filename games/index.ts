// Games: every game pal has, and every game a registry offers for this
// machine, as a showcase (showcase.ts): the game the cursor is on large,
// with its screenshot, and a strip of covers to walk. A game is an
// extension the store shelves under Fun with a view palette: the installed
// ones read from their manifests on every open (so a new game is listed
// without a change here), the others from the registries' listings
// (`extensions.available()`), after the installed ones. Enter opens an
// installed game; on one not installed it installs it, waits for it to
// load, then opens it. An install that fails says why on that game. An
// installed game that declares leaderboards has a second action,
// Leaderboards (cmd+L), the view in boards.ts; the root's Leaderboards row
// opens it too.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { column, errorMessage, extensions, text, view, type AvailableExtension, type Effect, type Extension, type InstalledExtension, type OwnIcon, type View } from "@zcag/pal";
import { PALETTE as BOARDS, boardsPick, boardsView } from "./boards.ts";
import { PALETTE, showcase, type Shown } from "./showcase.ts";

type Manifest = { title?: string; description?: string; icon?: OwnIcon; store?: { category?: string; tagline?: string }; palettes?: Record<string, { kind?: string; title?: string; icon?: OwnIcon }>; leaderboards?: unknown[] };
export type Game = { extension: string; palette: string; title: string; tagline: string; description: string; icon?: OwnIcon; installed: boolean; registry?: string; boards?: boolean; /** The store's first screenshot. */ shot?: string };

/** This machine as a listing's `platforms` names it. */
const PLATFORM = process.platform === "darwin" ? "macos" : process.platform;

async function manifest(e: InstalledExtension): Promise<Manifest> {
  try { return JSON.parse(await readFile(join(e.root, e.name, "pal.json"), "utf8")); } catch { return {}; }
}

/** Installed games: each view palette of a loaded `fun` extension (not this one's own Leaderboards). */
async function installed(): Promise<Game[]> {
  const found = await Promise.all((await extensions.list()).filter((e) => e.loaded && e.name !== "games").map(async (e) => {
    const m = await manifest(e);
    if (m.store?.category !== "fun") return [];
    return Object.entries(m.palettes ?? {}).filter(([, p]) => p.kind === "view").map(([palette, p]) => ({
      extension: e.name, palette, title: p.title ?? m.title ?? e.name, tagline: m.store?.tagline ?? "", description: m.description ?? "", icon: p.icon ?? m.icon, installed: true,
      ...(Array.isArray(m.leaderboards) && m.leaderboards.length && { boards: true }),
    }));
  }));
  return found.flat();
}

/** Games a registry lists that are not installed: `fun`, a view palette, for this platform, a build that runs here. */
export function offered(available: AvailableExtension[], have: Set<string>): Game[] {
  return available.filter((a) => !a.installed && !have.has(a.name) && a.installable && a.listing.category === "fun" && (!a.listing.platforms?.length || a.listing.platforms.includes(PLATFORM)))
    .flatMap((a) => a.listing.palettes.filter((p) => p.kind === "view").map((p) => ({ extension: a.name, palette: p.id, title: p.title || a.listing.title || a.name, tagline: a.listing.tagline, description: a.listing.description, icon: a.listing.icon as OwnIcon | undefined, installed: false, registry: a.registry })));
}

/** Every game, by title: the installed ones and the ones on offer. A registry that cannot be asked leaves only the installed ones. */
export async function games(): Promise<Game[]> {
  const [mine, available] = await Promise.all([installed(), extensions.available().catch(() => [] as AvailableExtension[])]);
  const more = offered(available, new Set(mine.map((g) => g.extension)));
  // The pictures come from the listings, the installed games' too.
  const shotOf = (name: string) => { const s = available.find((a) => a.name === name)?.listing.screenshots[0]; return typeof s === "string" ? s : s?.url; };
  // A name two registries list shows once, pal's first as the core orders them.
  const seen = new Set<string>();
  const all = [...mine, ...more].filter((g) => { const k = `${g.extension}/${g.palette}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.title.localeCompare(b.title));
  return all.map((g) => { const shot = shotOf(g.extension); return shot ? { ...g, shot } : g; });
}

/** Installs running from here, and the last failure per extension (shown on the game until the next try). */
const installing = new Set<string>();
const failed = new Map<string, string>();

/** The game the cursor is on (`extension/palette`), kept across opens. */
let cursor: string | undefined;

/** The order the showcase walks: the installed games, then the ones on offer. */
async function shelf(): Promise<Shown[]> {
  const all = await games();
  return [...all.filter((g) => g.installed), ...all.filter((g) => !g.installed)].map((g) => ({
    id: `${g.extension}/${g.palette}`, title: g.title, tagline: g.tagline, description: g.description, icon: g.icon, shot: g.shot, installed: g.installed,
    ...(g.boards && { boards: true }), ...(installing.has(g.extension) && { installing: true }), ...(failed.has(g.extension) && { failed: failed.get(g.extension) }),
  }));
}

const redraw = () => void draw().then((v) => view.update(v, { palette: PALETTE })).catch(() => {});

async function draw(): Promise<View> {
  const all = await shelf();
  if (!all.length) return { id: PALETTE, title: "Games", tree: column([text("No games yet", { style: "title" }), text("The store's Fun shelf has them", { style: "muted" })], { padding: 4, grow: true, align: "center", justify: "center" }), actions: [] };
  const at = Math.max(0, all.findIndex((g) => g.id === cursor));
  cursor = all[at]!.id;
  return showcase(all, at, redraw);
}

async function pick(action: string | undefined): Promise<Effect | void> {
  const all = await shelf();
  const at = Math.max(0, all.findIndex((g) => g.id === cursor));
  const step = (by: number) => { cursor = all[(at + by + all.length) % all.length]?.id; };
  if (action === "next") step(1);
  else if (action === "prev") step(-1);
  else if (action?.startsWith("go:")) cursor = action.slice(3);
  else if (action?.startsWith("jump:")) {
    const c = action.slice(5);
    // The next game after the cursor starting with it, round the end.
    for (let k = 1; k <= all.length; k++) { const g = all[(at + k) % all.length]!; if (g.title.toLowerCase().startsWith(c)) { cursor = g.id; break; } }
  } else if (cursor && (action === "play" || action === "install" || action === "boards")) return start(cursor, action);
  return { view: await draw() };
}

async function start(id: string, action: string): Promise<Effect> {
  const [extension, palette] = id.split("/") as [string, string];
  if (action === "boards") return { push: { extension: "games", palette: BOARDS, args: { game: extension } } };
  if (action === "play") return { push: { extension, palette } };
  const g = (await games()).find((x) => x.extension === extension && x.palette === palette);
  installing.add(extension);
  failed.delete(extension);
  redraw();
  try {
    const r = await extensions.install(extension, { from: "games", ...(g?.registry && { registry: g.registry }) });
    if (!r.ok || r.loaded === false) throw new Error(r.error || (r.loaded === false ? "it installed but failed to load" : "the install did not go through"));
    return { push: { extension, palette } };
  } catch (e) {
    failed.set(extension, errorMessage(e));
    installing.delete(extension);
    return { view: await draw() };
  } finally {
    installing.delete(extension);
  }
}

export default {
  palettes: {
    [PALETTE]: {
      title: "Games",
      view: () => draw(),
      pick: (_id, action) => pick(action),
    },
    [BOARDS]: {
      title: "Leaderboards",
      view: (ctx) => boardsView(ctx?.args),
      pick: (id, action) => boardsPick(id, action),
    },
  },
} satisfies Extension;
