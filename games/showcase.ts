// The Games showcase: the game the cursor is on large, its own screenshot
// cut to the game itself, its title, tagline and what it is beside it, and
// a strip of every game's cover under it that slides with the cursor.
//
// The pictures are the store's screenshots (the listing's first one, its
// `-dark` twin), downloaded once into a cache folder and drawn through the
// app's `icon://` file scheme, so a tree carries paths rather than bytes.
// A screenshot is the panel centred on a wallpaper (docs/design/screenshots.md:
// 1440 by 900, the panel's body at `BODY`); a cover is a box of the body's
// shape that clips the whole picture scaled so the body fills it. A game
// whose picture is not here yet shows its glyph on a well until it lands,
// and the tree is pushed again then (`view.update`).
import { existsSync, statSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { column, row, text, thumbnailUrl, type Action, type OwnIcon, type View, type ViewNode } from "@zcag/pal";

export const PALETTE = "games";

/** What the showcase draws of a game; `index.ts` gathers them. */
export type Shown = { id: string; title: string; tagline: string; description: string; icon?: OwnIcon; shot?: string; installed: boolean; boards?: boolean; installing?: boolean; failed?: string };

const MAC = process.platform === "darwin";
/** The downloaded screenshots; `PAL_GAMES_CACHE` for the tests and the fixture. */
const CACHE = process.env.PAL_GAMES_CACHE || (MAC ? join(homedir(), "Library/Caches/pal/games") : join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "pal/games"));
/** A picture older than this is fetched again (its url stays the same across builds). */
const MAX_AGE_MS = 7 * 86_400_000;

/** A store screenshot's size, and where the panel's body sits in it. */
const SHOT = { w: 1440, h: 900 };
const BODY = { x: 150, y: 194, w: 1140, h: 558 };

/** The hero's width, the strip's covers' width, how many covers the strip shows. */
const HERO_W = 470, THUMB_W = 96, STRIP = 7;

// ---- the pictures ------------------------------------------------------------------------------

const fetching = new Map<string, Promise<void>>();
const missed = new Set<string>();

export const fileOf = (url: string) => join(CACHE, `${createHash("sha1").update(url).digest("hex").slice(0, 16)}.png`);
const fresh = (path: string) => { try { return Date.now() - statSync(path).mtimeMs < MAX_AGE_MS; } catch { return false; } };

/** The dark twin of a screenshot url (`1-board.png` → `1-board-dark.png`): the cover is art, and dark art sits well in both themes. */
const darkOf = (url: string) => (/-dark\.png$/.test(url) ? url : url.replace(/\.png$/, "-dark.png"));

async function download(url: string): Promise<void> {
  for (const u of [darkOf(url), url]) {
    const r = await fetch(u, { signal: AbortSignal.timeout(15_000) }).catch(() => undefined);
    if (!r?.ok || !r.headers.get("content-type")?.startsWith("image/")) continue;
    const path = fileOf(url), tmp = `${path}.${process.pid}.tmp`;
    await mkdir(CACHE, { recursive: true });
    await writeFile(tmp, Buffer.from(await r.arrayBuffer()));
    await rename(tmp, path);
    return;
  }
  missed.add(url);
}

/** The picture's path when it is here; otherwise it is fetched (once) and `then` runs when it lands. */
function picture(url: string | undefined, then: () => void): string | undefined {
  if (!url || missed.has(url)) return undefined;
  const path = fileOf(url);
  const have = existsSync(path);
  if ((!have || !fresh(path)) && !fetching.has(url)) {
    fetching.set(url, download(url).catch(() => { missed.add(url); }).finally(() => { fetching.delete(url); then(); }));
  }
  return have ? path : undefined;
}

// ---- the tree ----------------------------------------------------------------------------------

/** Brand colours as the tag palette names the nearest. */
const TAG: Record<string, string> = { red: "red", orange: "amber", amber: "amber", green: "green", teal: "teal", cyan: "teal", blue: "blue", indigo: "violet", violet: "violet", pink: "pink" };
const glyphOf = (icon?: OwnIcon) => (icon && typeof icon === "object" && "tile" in icon && "glyph" in icon.tile ? { glyph: icon.tile.glyph, color: TAG[icon.tile.bg] } : undefined);

/**
 * A cover `w` wide: a box of the body's shape clipping the screenshot,
 * scaled so the body fills the box and centred on it (the spacer under the
 * picture lifts it by the body's offset from the picture's centre).
 */
function cover(g: Shown, w: number, path: string | undefined, extra: Record<string, unknown>): ViewNode {
  const h = Math.round((w * BODY.h) / BODY.w);
  const box = { width: w, height: h, radius: true, align: "center", justify: "center", ...extra } as const;
  if (!path) {
    const mark = glyphOf(g.icon);
    return column([text(mark?.glyph ?? g.title.slice(0, 1), { style: mark ? "glyph" : "title", size: w > 200 ? "xl" : "lg", ...(mark?.color && { color: mark.color as "green" }) })], { ...box, surface: "sunken" });
  }
  const iw = Math.round((w * SHOT.w) / BODY.w), ih = Math.round((iw * SHOT.h) / SHOT.w);
  const lift = Math.round((2 * (BODY.y + BODY.h / 2 - SHOT.h / 2) * iw) / SHOT.w);
  return column([
    { type: "image", src: thumbnailUrl(path, w > 200 ? 0 : 480), width: iw, height: ih, alt: g.title },
    { type: "spacer", size: lift },
  ], { ...box, gap: 0 });
}

function info(g: Shown): ViewNode {
  const badges: ViewNode[] = [
    ...(g.installing ? [{ type: "badge", text: "Installing…", color: "blue" } as ViewNode] : !g.installed ? [{ type: "badge", text: "Not installed", color: "grey" } as ViewNode] : []),
    ...(g.boards ? [{ type: "badge", text: "Leaderboards", color: "violet" } as ViewNode] : []),
  ];
  return column([
    ...(badges.length ? [row(badges, { gap: 1 })] : []),
    text(g.title, { style: "headline" }),
    text(g.tagline, { style: "body" }),
    ...(g.description && g.description !== g.tagline ? [text(g.description, { style: "muted", size: "sm" })] : []),
    ...(g.failed ? [text(`Could not install: ${g.failed}`, { size: "sm", color: "destructive" })] : []),
  ], { key: `info-${g.id}`, flex: 1, gap: 2, height: Math.round((HERO_W * BODY.h) / BODY.w), transition: { enter: "fade", exit: "none" } });
}

/** The strip's window: `STRIP` covers around the cursor, held at the ends. */
export function windowOf(n: number, at: number): [number, number] {
  const start = Math.max(0, Math.min(at - Math.floor(STRIP / 2), n - STRIP));
  return [start, Math.min(n, start + STRIP)];
}

function strip(all: Shown[], at: number, paths: (string | undefined)[]): ViewNode {
  const [from, to] = windowOf(all.length, at);
  const cells: ViewNode[] = [];
  for (let i = from; i < to; i++) {
    const g = all[i]!;
    if (i > from && all[i - 1]!.installed && !g.installed) cells.push({ type: "divider", key: "split", transition: { move: true } } as ViewNode);
    cells.push(column([
      cover(g, THUMB_W, paths[i], { ...(i === at && { selected: true }) }),
      text(g.title, { size: "xs", align: "center", width: THUMB_W, ...(i === at ? { weight: "semibold" } : { color: "muted" }) }),
    ], { key: `g-${g.id}`, transition: { move: true, enter: "fade" }, gap: 1, align: "center", action: `go:${g.id}` }));
  }
  return row(cells, { key: "strip", gap: 2, justify: "center", align: "start" });
}

/** Every key a title starts with, once: a letter or a digit jumps to the next game starting with it. */
const initials = (all: Shown[]) => [...new Set(all.map((g) => g.title[0]?.toLowerCase()).filter((c): c is string => !!c && /[a-z0-9]/.test(c)))];

export function actionsOf(all: Shown[], at: number): Action[] {
  const g = all[at];
  if (!g) return [];
  return [
    g.installed ? { id: "play", title: "Play", shortcut: "enter" } : { id: "install", title: g.failed ? "Try the install again" : "Install and play", shortcut: "enter" },
    ...(g.boards ? [{ id: "boards", title: "Leaderboards", shortcut: "cmd+l" }] : []),
    { id: "next", title: "Next game", shortcut: ["right", "down", "tab"] },
    { id: "prev", title: "Previous game", shortcut: ["left", "up", "shift+tab"] },
    ...initials(all).map((c) => ({ id: `jump:${c}`, title: `Next game starting with ${c.toUpperCase()}`, shortcut: c, hidden: true as const })),
    // A click on a cover in the strip goes to it: the covers in the window.
    ...all.slice(...windowOf(all.length, at)).map((x) => ({ id: `go:${x.id}`, title: x.title, hidden: true as const })),
  ];
}

/** The tree for the game at `at`; `redraw` pushes it again once a missing picture lands. */
export function showcase(all: Shown[], at: number, redraw: () => void): View {
  const g = all[at]!;
  const paths = all.map((x) => picture(x.shot, redraw));
  return {
    id: PALETTE,
    // The crumb says Games; the title line says where in the strip the cursor is.
    title: `${at + 1} of ${all.length}`,
    keys: "actions",
    tree: column([
      row([
        column([cover(g, HERO_W, paths[at], {})], { key: `hero-${g.id}`, transition: { enter: "fade", exit: "none" } }),
        info(g),
      ], { key: "top", gap: 4, align: "start" }),
      strip(all, at, paths),
    ], { key: "games", padding: 4, gap: 4 }),
    actions: actionsOf(all, at),
  };
}
