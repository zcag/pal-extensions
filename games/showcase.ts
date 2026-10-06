// The Games showcase: the game the cursor is on at the top, its own
// screenshot cut to the game itself beside its title and tagline, and every game's cover under it in a grid of `COLS`, `ROWS` rows at
// a time, scrolling with the cursor.
//
// The pictures are the store's screenshots (the game's cover shot, else its
// first; the `-dark` twin), downloaded once into a cache folder and drawn
// through the app's `icon://` file scheme, so a tree carries paths rather
// than bytes. A screenshot is the panel centred on a wallpaper
// (docs/design/screenshots.md: 1440 by 900, the panel's body at `BODY`).
// Every picture is a crop: a box clipping the whole screenshot, scaled so
// the crop fills it and shifted onto it by spacers beside it. The top one
// is the panel's body, the whole game; a grid tile is the game's `cover`,
// the part of the shot its fixture picked to show it up close (the body
// when it has none). A game whose picture is not here yet shows its glyph
// on a well until it lands, and the tree is pushed again then (`view.update`).
//
// The grid draws every cover, always, inside a window `ROWS` rows and a bit
// tall: scrolling moves the whole grid in the window (a spacer above or
// below it), so the covers slide (`move`) rather than come and go, and the
// next row's covers peeking in at the bottom say there is more.
import { existsSync, statSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { column, row, text, thumbnailUrl, type Action, type OwnIcon, type View, type ViewNode } from "@zcag/pal";

export const PALETTE = "games";

/** What the showcase draws of a game; `index.ts` gathers them. */
export type Shown = { id: string; title: string; tagline: string; icon?: OwnIcon; shot?: string; crop?: Rect; installed: boolean; boards?: boolean; installing?: boolean; failed?: string };
/** `[x, y, w, h]` in a screenshot's pixels. */
export type Rect = [number, number, number, number];

const MAC = process.platform === "darwin";
/** The downloaded screenshots; `PAL_GAMES_CACHE` for the tests and the fixture. */
const CACHE = process.env.PAL_GAMES_CACHE || (MAC ? join(homedir(), "Library/Caches/pal/games") : join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "pal/games"));
/** A picture older than this is fetched again (its url stays the same across builds). */
const MAX_AGE_MS = 7 * 86_400_000;

/** A store screenshot's size, and where the panel's body sits in it. */
const SHOT = { w: 1440, h: 900 };
const BODY = { x: 150, y: 194, w: 1140, h: 558 };
const WHOLE: Rect = [BODY.x, BODY.y, BODY.w, BODY.h];

/**
 * The sizes, laid out for the panel's body (372 px under the title line,
 * 728 across inside the padding): the hero, then `ROWS` rows of `COLS`
 * covers and `PEEK` px of the next. A cover sits in a `FRAME` px frame
 * that carries the cursor's ring: inside a clipping box the ring is drawn
 * inset (ui.css), and over the picture itself it would be painted over.
 */
const HERO_W = 236, THUMB_W = 130, COLS = 5, ROWS = 2, GAP = 8, FRAME = 4;
const COVER_H = Math.round((THUMB_W * BODY.h) / BODY.w), LABEL_H = 20, TILE_W = THUMB_W + 2 * FRAME, TILE_H = COVER_H + 2 * FRAME + 4 + LABEL_H, ROW_H = TILE_H + GAP, PEEK = 16;

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
 * A picture `w` wide of the body's shape showing `crop` of the screenshot
 * at `path`: the whole picture scaled so the crop fills the box, shifted
 * onto it by a spacer beside it (the box centres what it holds and clips
 * the rest). Drawn from the file itself: a zoomed crop wants every pixel.
 */
function cover(g: Shown, w: number, path: string | undefined, crop: Rect, extra: Record<string, unknown>): ViewNode {
  const h = Math.round((w * BODY.h) / BODY.w);
  const box = { width: w, height: h, radius: true, align: "center", justify: "center", gap: 0, ...extra } as const;
  if (!path) {
    const mark = glyphOf(g.icon);
    return column([text(mark?.glyph ?? g.title.slice(0, 1), { style: mark ? "glyph" : "title", size: w > THUMB_W ? "xl" : "lg", ...(mark?.color && { color: mark.color as "green" }) })], { ...box, surface: "sunken" });
  }
  const [cx, cy, cw, ch] = crop;
  const k = Math.max(w / cw, h / ch);
  const iw = Math.round(SHOT.w * k), ih = Math.round(SHOT.h * k);
  // How far the crop's centre sits from the picture's, in box px: twice that in a spacer on the other side moves it to the box's centre.
  const dx = Math.round(2 * ((cx + cw / 2) * k - iw / 2)), dy = Math.round(2 * ((cy + ch / 2) * k - ih / 2));
  const spacer = (size: number): ViewNode[] => (size ? [{ type: "spacer", size: Math.abs(size) }] : []);
  const across = row([...(dx < 0 ? spacer(dx) : []), { type: "image", src: thumbnailUrl(path, 0), width: iw, height: ih, alt: g.title }, ...(dx > 0 ? spacer(dx) : [])], { gap: 0 });
  return column([...(dy < 0 ? spacer(dy) : []), across, ...(dy > 0 ? spacer(dy) : [])], box);
}

function info(g: Shown): ViewNode {
  const badges: ViewNode[] = [
    ...(g.installing ? [{ type: "badge", text: "Installing…", color: "blue" } as ViewNode] : !g.installed ? [{ type: "badge", text: "Not installed", color: "grey" } as ViewNode] : []),
    ...(g.boards ? [{ type: "badge", text: "Leaderboards", color: "violet" } as ViewNode] : []),
  ];
  return column([
    row([text(g.title, { style: "headline" }), ...badges], { gap: 2 }),
    text(g.tagline, { style: "body" }),
    ...(g.failed ? [text(`Could not install: ${g.failed}`, { size: "sm", color: "destructive" })] : []),
  ], { key: `info-${g.id}`, flex: 1, gap: 1, height: Math.round((HERO_W * BODY.h) / BODY.w), transition: { enter: "fade", exit: "none" } });
}

/** The grid's first row in view, kept so the window moves only when the cursor leaves it. */
let top = 0;

/** The rows in view: `top` moved the least that puts the cursor's row in the window. */
export function rowsShown(n: number, at: number): [number, number] {
  const rows = Math.ceil(n / COLS), r = Math.floor(at / COLS);
  if (r < top) top = r;
  else if (r >= top + ROWS) top = r - ROWS + 1;
  top = Math.max(0, Math.min(top, rows - ROWS));
  return [top, Math.min(rows, top + ROWS)];
}

function grid(all: Shown[], at: number, paths: (string | undefined)[]): ViewNode {
  const rows: ViewNode[] = [];
  for (let r = 0; r < all.length; r += COLS) {
    rows.push(row(all.slice(r, r + COLS).map((g, k) => {
      const i = r + k;
      return column([
        column([cover(g, THUMB_W, paths[i], g.crop ?? WHOLE, {})], { padding: 1, gap: 0, radius: true, ...(i === at && { selected: true }) }),
        column([text(g.title, { size: "sm", align: "center", width: TILE_W, ...(i === at ? { weight: "semibold" } : { color: "muted" }) })], { height: LABEL_H, gap: 0 }),
      ], { key: `g-${g.id}`, transition: { move: true }, gap: 1, align: "center", width: TILE_W, height: TILE_H, action: `go:${g.id}` });
    }), { gap: 2, align: "start" }));
  }
  const n = rows.length, height = n * TILE_H + (n - 1) * GAP, width = COLS * TILE_W + (COLS - 1) * GAP;
  const content = column(rows, { key: "covers", gap: 2, width, height });
  const view = ROWS * ROW_H + PEEK;
  if (height <= view) return column([content], { key: "grid", gap: 0 });
  // The window starts at a row's top, so a cut row is only ever the next one's covers peeking in under the rows in view (a row cut above would show only its titles).
  const [first] = rowsShown(all.length, at);
  const off = first * ROW_H;
  // Centred in the window, the grid and a spacer of `s` below it (or of `-s` above it) put the grid's top at `-off`.
  const s = Math.round(view - height + 2 * off);
  const spacer: ViewNode = { type: "spacer", key: "scroll", size: Math.abs(s) };
  return column(s < 0 ? [spacer, content] : [content, spacer], { key: "grid", height: view, width, justify: "center", align: "center", gap: 0 });
}

/** Every key a title starts with, once: a letter or a digit jumps to the next game starting with it. */
const initials = (all: Shown[]) => [...new Set(all.map((g) => g.title[0]?.toLowerCase()).filter((c): c is string => !!c && /[a-z0-9]/.test(c)))];

/** Where `up`/`down` land: a row up or down, the same column, held at the ends (the last row may be short). */
export const vertical = (n: number, at: number, by: 1 | -1) => { const to = at + by * COLS; return to < 0 ? at : to >= n ? (Math.floor(at / COLS) < Math.floor((n - 1) / COLS) ? n - 1 : at) : to; };

export function actionsOf(all: Shown[], at: number): Action[] {
  const g = all[at];
  if (!g) return [];
  return [
    g.installed ? { id: "play", title: "Play", shortcut: "enter" } : { id: "install", title: g.failed ? "Try the install again" : "Install and play", shortcut: "enter" },
    ...(g.boards ? [{ id: "boards", title: "Leaderboards", shortcut: "cmd+l" }] : []),
    { id: "next", title: "Next game", shortcut: ["right", "tab"] },
    { id: "prev", title: "Previous game", shortcut: ["left", "shift+tab"] },
    { id: "down", title: "The game below", shortcut: "down", hidden: true as const },
    { id: "up", title: "The game above", shortcut: "up", hidden: true as const },
    ...initials(all).map((c) => ({ id: `jump:${c}`, title: `Next game starting with ${c.toUpperCase()}`, shortcut: c, hidden: true as const })),
    // A click on a cover goes to it: every cover is drawn.
    ...all.map((x) => ({ id: `go:${x.id}`, title: x.title, hidden: true as const })),
  ];
}

/** The tree for the game at `at`; `redraw` pushes it again once a missing picture lands. */
export function showcase(all: Shown[], at: number, redraw: () => void): View {
  const g = all[at]!;
  const paths = all.map((x) => picture(x.shot, redraw));
  return {
    id: PALETTE,
    // The crumb says Games; the title line says where the cursor is.
    title: `${at + 1} of ${all.length}`,
    keys: "actions",
    tree: column([
      row([
        column([cover(g, HERO_W, paths[at], WHOLE, {})], { key: `hero-${g.id}`, transition: { enter: "fade", exit: "none" } }),
        info(g),
      ], { key: "top", gap: 4, align: "start" }),
      grid(all, at, paths),
    ], { key: "games", padding: 3, gap: 2 }),
    actions: actionsOf(all, at),
  };
}
