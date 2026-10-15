// The Flash games' page: a game package's surface/index.html loads the kit
// and this, from the flash extension it requires (pal serves its files at
// `/__ext/flash/` on the game's own origin), with game.json and the SWF
// beside the page. It plays the SWF in Ruffle filling the view, keeps the
// game's SharedObjects in the game's storage (`saves`, synced as
// `{ "each": "latest" }`) and posts its score to the game's board.
import type { SurfaceKit } from "@zcag/pal";
import { at, readSol } from "./amf.ts";
import { absolute, better, relative, scoreSource } from "./saves.ts";

declare const pal: SurfaceKit;

type Game = { swf: string; content?: string; renderer?: string; score?: { from: string; board: string; order?: "asc" | "desc" } };
type RufflePlayer = HTMLElement & { ruffle(): { load(o: { url: string; base?: string }): Promise<void>; suspend(): void; resume(): void; isPlaying: boolean; volume: number } };

const HOST = location.hostname;
const ROOT = new URL("../", location.href).pathname;
const RUFFLE = new URL("./ruffle/", import.meta.url).href;

// Ruffle keeps SharedObjects in localStorage by property access, which an
// opaque frame refuses: an in-memory one stands in, filled from the saves.
const mem = new Map<string, string>();
let quiet = false;
let queued = false;
const listeners: (() => void)[] = [];
const saves = () => Object.fromEntries([...mem].map(([k, v]) => [relative(k, HOST, ROOT), v]));
const write = () => {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    void pal.storage.set("saves", saves());
    for (const l of listeners) l();
  });
};
const store = {
  getItem: (k: string) => mem.get(String(k)) ?? null,
  setItem: (k: string, v: string) => { if (quiet) return; mem.set(String(k), String(v)); write(); },
  removeItem: (k: string) => { if (!quiet && mem.delete(String(k))) write(); },
  clear: () => { if (quiet) return; mem.clear(); write(); },
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
const methods = new Set(Object.keys(store));
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: new Proxy(store, {
    get: (t, k) => (typeof k === "string" && methods.has(k) ? t[k as keyof typeof t] : typeof k === "string" ? mem.get(k) : undefined),
    set: (_, k, v) => { store.setItem(String(k), v); return true; },
    deleteProperty: (_, k) => { store.removeItem(String(k)); return true; },
    has: (_, k) => typeof k === "string" && (methods.has(k) || mem.has(k)),
    ownKeys: () => [...mem.keys()],
    getOwnPropertyDescriptor: (_, k) => (typeof k === "string" && mem.has(k) ? { value: mem.get(k), enumerable: true, configurable: true, writable: true } : undefined),
  }),
});

// ExternalInterface.call runs `new Function("return (name)(...arguments);")`,
// which the page's CSP refuses: that one shape, for a dotted name, is
// answered without eval.
const RealFunction = Function;
const CALL = /^return \(([\w$]+(?:\.[\w$]+)*)\)\(\.\.\.arguments\);$/;
function NoEvalFunction(...args: string[]) {
  const m = args.length === 1 ? CALL.exec(String(args[0])) : null;
  if (!m) return RealFunction(...args);
  const path = m[1].split(".");
  return (...a: unknown[]) => {
    const owner = path.slice(0, -1).reduce<any>((o, k) => o?.[k], window);
    const fn = owner?.[path.at(-1)!];
    if (typeof fn !== "function") throw new TypeError(`${m[1]} is not a function`);
    return fn.apply(owner, a);
  };
}
NoEvalFunction.prototype = RealFunction.prototype;
(window as any).Function = NoEvalFunction;

function hydrate(saves: unknown) {
  mem.clear();
  if (saves && typeof saves === "object") for (const [k, v] of Object.entries(saves)) if (typeof v === "string") mem.set(absolute(k, HOST, ROOT), v);
}

function scores(game: Game) {
  const src = game.score && scoreSource(game.score.from);
  if (!game.score || !src) return;
  const { board, order = "desc" } = game.score;
  let best: number | undefined;
  const offer = (v: unknown, post: boolean) => {
    if (typeof v !== "number" || !better(order, v, best)) return;
    best = v;
    if (post) void pal.score(board, v);
  };
  if (src.kind === "ei") {
    (window as any)[src.fn] = (v: unknown) => offer(Number(v), true);
    return;
  }
  const read = (post: boolean) => {
    for (const [k, v] of mem) {
      if (!k.endsWith(`/${src.name}`)) continue;
      try { offer(at(readSol(v).data, src.path), post); } catch (e) { console.warn("flash: the save is not readable", e); }
    }
  };
  read(false);
  listeners.push(() => read(true));
}

// A game asks for its other files by the URLs they had on the web
// (`http://host/path?x`); the package keeps them under `content/host/path`.
const contentRule = (base: string): [RegExp, string] => [new RegExp(`^https?://(?!${location.host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/)([^?#]+).*$`), `${base}$1`];

const loadScript = (src: string) => new Promise<void>((ok, fail) => {
  const s = document.createElement("script");
  s.src = src;
  s.onload = () => ok();
  s.onerror = () => fail(new Error(`${src} did not load`));
  document.head.append(s);
});

function fail(why: string) {
  document.body.textContent = "";
  const p = document.createElement("p");
  p.textContent = `This game could not start. ${why}`;
  p.style.cssText = "margin:auto;color:var(--pal-fg-muted, #999);font:14px var(--pal-font-ui, sans-serif)";
  document.body.append(p);
  pal.ready();
}

async function main() {
  document.documentElement.style.cssText = "height:100%;background:#000";
  document.body.style.cssText = "margin:0;height:100%;display:flex;overflow:hidden";
  // Ruffle cancels every key it is given, so the panel's cmd combos (⌘M, ⌘W) would never leave the frame: let them.
  addEventListener("keydown", (e) => { if (e.metaKey || e.ctrlKey) Object.defineProperty(e, "preventDefault", { value() {} }); }, true);
  const game = (await (await fetch(new URL("./game.json", location.href))).json()) as Game;
  hydrate(await pal.storage.get("saves"));
  (window as any).RufflePlayer = {
    config: {
      publicPath: RUFFLE, polyfills: false, autoplay: "on", unmuteOverlay: "hidden", splashScreen: false,
      letterbox: "on", scale: "showAll", forceScale: true, forceAlign: true, backgroundColor: "#000000",
      contextMenu: "off", showSwfDownload: false, warnOnUnsupportedContent: false,
      allowScriptAccess: true, allowNetworking: "all", openUrlMode: "deny", logLevel: "warn",
      ...(game.renderer && { preferredRenderer: game.renderer }),
      urlRewriteRules: game.content ? [contentRule(new URL(game.content, location.href).href)] : [],
    },
  };
  await loadScript(`${RUFFLE}ruffle.js`);
  scores(game);
  let player: RufflePlayer | undefined;
  let sound = (await pal.settings()).sound !== false, muted = (await pal.storage.get("muted")) === true;
  const loud = () => { if (player) player.ruffle().volume = sound && !muted ? 1 : 0; };
  const start = async () => {
    player = (window as any).RufflePlayer.newest().createPlayer() as RufflePlayer;
    player.style.cssText = "width:100%;height:100%;display:block";
    document.body.append(player);
    const url = new URL(game.swf, location.href).href;
    await player.ruffle().load({ url, base: new URL(".", url).href });
    loud();
    player.focus();
  };
  const stop = () => { quiet = true; player?.remove(); player = undefined; quiet = false; };
  pal.onSettings((s) => { sound = s.sound !== false; loud(); });
  pal.onAction((id) => { if (id !== "mute") return; muted = !muted; void pal.storage.set("muted", muted); loud(); });
  pal.onHidden(() => { window.dispatchEvent(new Event("pagehide")); player?.ruffle().suspend(); });
  pal.onShown(() => { window.dispatchEvent(new Event("pageshow")); player?.ruffle().resume(); player?.focus(); });
  // Saves from another machine: the running game holds its own copy and would
  // write it back over them, so it starts again on the ones that came in.
  pal.storage.onChange((key, value) => {
    if (key !== "saves") return;
    const now = saves(), next = (value ?? {}) as Record<string, unknown>;
    if (Object.keys(now).length === Object.keys(next).length && Object.keys(now).every((k) => now[k] === next[k])) return;
    stop();
    hydrate(value);
    void start();
  });
  await start();
  pal.ready();
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
