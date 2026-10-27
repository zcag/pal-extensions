// Play on Apple TV: a link (a YouTube video, a Netflix title, an Apple TV+
// page) sent to the TV in one key, from
// wherever it is. Copied: pal reads its own clipboard history every two
// seconds while an Apple TV is paired, and a new playable link becomes the
// offer, which the bar item shows for 90 s, the remote shows as a banner
// and the empty root's Now section leads with for 10 min. Typed or pasted
// at the root: the palette answers inline with a "Play on <TV>" row. And
// the palette itself lists, newest first, the offer, the browser tab in
// front when it plays something, every link in the clipboard history, and
// what was played before. A YouTube video opens in the TV's YouTube app
// at its start time; the browser tab's video starts where the tab is (the
// DevTools probe's position), and a tab playing what the TV now plays is
// paused.
import { clipboard, imageData, storage, tabs, toast, type Ctx, type Effect, type Item } from "@zcag/pal";
import { G } from "./remote.ts";
import { LINK_APPS, describe, findLink, linkKey, linkLabel, parseLink, startLabel, tabLink, target, type LinkInfo, type MediaLink } from "./links.ts";
import { current, paired, push, withConn, NAME } from "./tv.ts";

/** A copied link waiting to be played: shown by the bar item, the remote and the Now section. */
export type Offer = { link: MediaLink; info?: LinkInfo; thumb?: string; at: number };
export let offer: Offer | undefined;
export const OFFER_BAR_MS = 90_000, OFFER_ROOT_MS = 10 * 60_000;
export const offerFresh = (ms: number) => !!offer && Date.now() - offer.at < ms;

const POLL_MS = 2000;
let poll: ReturnType<typeof setInterval> | undefined;
let lastSeen: number | undefined;
/** Links played or waved off: not offered again when copied again. */
const done = new Set<string>();

type Played = { url: string; title?: string; at: number };

/** The video in the browser tab in front, for the remote's banner when nothing was just copied: looked at as the remote draws, at most every few seconds. */
export type InBrowser = { link: MediaLink; where: string; info?: LinkInfo; thumb?: string };
export let inBrowser: InBrowser | undefined;
const LOOK_MS = 3000;
const tabWhere = (tab?: tabs.OpenTab) => `${tab?.media?.playing ? "Playing" : tab?.media?.position ? "Paused" : "Open"} in ${tab?.browser ?? "the browser"}`;
let lookedAt = 0;

export async function lookAtBrowser(): Promise<void> {
  if (Date.now() - lookedAt < LOOK_MS) return;
  lookedAt = Date.now();
  const tab = await tabs.active(800).catch(() => undefined);
  const l = tabLink(tab), was = inBrowser;
  const same = !!l && !!was && linkKey(was.link) === linkKey(l);
  inBrowser = l && tab && !done.has(linkKey(l)) ? { link: l, where: tabWhere(tab), ...(same && { info: was.info, thumb: was.thumb }) } : undefined;
  if (!inBrowser) { if (was) push(); return; }
  if (!same || was.link.start !== l!.start || was.where !== inBrowser.where) push();
  if (same) return;
  const got = await lookup(l!);
  if (inBrowser?.link === l) { Object.assign(inBrowser, got); push(); }
}

/** Play the browser's video: where the tab is now (looked at again), or from the start. */
export async function playBrowser(fromStart: boolean): Promise<Effect> {
  if (!inBrowser) return { push: { extension: NAME, palette: "play" } };
  const fresh = tabLink(await tabs.active(800).catch(() => undefined));
  const l = fresh && linkKey(fresh) === linkKey(inBrowser.link) ? fresh : inBrowser.link;
  return playLink(l, { fromStart, title: inBrowser.info?.title });
}
let history: Played[] | undefined;

async function lookup(link: MediaLink): Promise<{ info?: LinkInfo; thumb?: string }> {
  const info = await describe(link);
  return { info, thumb: info?.thumb ? await imageData(info.thumb) : undefined };
}

/** Read the newest clipboard entry; a new playable link becomes the offer. The entry there at start is not offered. */
async function check(): Promise<void> {
  const e = await clipboard.current().catch(() => null);
  if (!e) return;
  if (lastSeen === undefined) { lastSeen = e.id; return; }
  if (e.id === lastSeen) return;
  lastSeen = e.id;
  const link = e.kind === "text" ? findLink(e.text) : undefined;
  if (!link || done.has(linkKey(link))) return;
  offer = { link, at: Date.now() };
  push();
  const got = await lookup(link);
  if (offer?.link === link) { Object.assign(offer, got); push(); }
}

/** Start or stop the clipboard poll with the pairing: nothing is read while no Apple TV is paired. */
export async function watchClipboard(): Promise<void> {
  const on = (await paired()).length > 0;
  if (on && !poll) poll = setInterval(() => { void check(); }, POLL_MS);
  if (!on && poll) { clearInterval(poll); poll = undefined; }
}

export function dismissOffer(): void {
  const l = offer?.link ?? inBrowser?.link;
  if (l) done.add(linkKey(l));
  if (offer) offer = undefined;
  else inBrowser = undefined;
  push();
}

/** Play a link on the current Apple TV; the HUD says what and where. */
export async function playLink(l: MediaLink, o: { fromStart?: boolean; title?: string } = {}): Promise<Effect> {
  const dev = current(await paired());
  if (!dev) return { push: { extension: NAME, palette: "setup" } };
  const t = target(l, o.fromStart);
  const what = o.title ?? (await describe(l))?.title ?? linkLabel(l);
  const e = await withConn(`play it on ${dev.name}`, async (c) => {
    if (c.power() === "off") await c.turnOn();
    await c.launch(t.url);
  });
  if (e) return e;
  done.add(linkKey(l));
  void pauseInBrowser(l);
  if (inBrowser && linkKey(inBrowser.link) === linkKey(l)) inBrowser = undefined;
  if (offer && linkKey(offer.link) === linkKey(l)) offer = undefined;
  history ??= ((await storage.get("played", NAME)) as Played[] | null) ?? [];
  history = [{ url: l.url, title: what, at: Date.now() }, ...history.filter((h) => h.url !== l.url)].slice(0, 30);
  await storage.set("played", history, NAME).catch(() => {});
  push();
  return { hud: `Playing “${what.length > 48 ? `${what.slice(0, 47)}…` : what}” on ${dev.name}`, keep: true };
}

/** The TV takes over: a browser tab playing the same video pauses. */
async function pauseInBrowser(l: MediaLink): Promise<void> {
  const open = (await tabs.gather().catch(() => undefined))?.tabs ?? [];
  for (const t of open) {
    const there = t.media?.playing ? parseLink(t.url) : undefined;
    if (there && linkKey(there) === linkKey(l)) await tabs.pause(t).catch(() => {});
  }
}

// ---- the palette ----------------------------------------------------------------------------------------

const ROW_ACTIONS = (l: MediaLink) => [
  { id: "play", title: "Play on the TV" },
  ...(l.start ? [{ id: "play:start", title: "Play from the start", shortcut: "cmd+enter" }] : []),
  { id: "open", title: "Open in the browser", shortcut: "cmd+o" },
  { id: "copy", title: "Copy the link", shortcut: "cmd+c" },
];

/** A row for a link: its title once known, where it came from, its picture. */
function linkRow(l: MediaLink, where: string, o: { info?: LinkInfo; thumb?: string; at?: number; device: string; section?: string; hero?: boolean }): Item {
  const app = LINK_APPS[l.kind].name;
  const start = startLabel(l.start);
  return {
    id: `link:${l.url}`,
    name: o.hero ? `Play on ${o.device}` : o.info?.title ?? linkLabel(l),
    subtitle: o.hero ? [o.info?.title ?? linkLabel(l), o.info?.by].filter(Boolean).join(" · ") : [where, o.info?.by, app].filter(Boolean).join(" · "),
    icon: o.thumb ? { image: o.thumb } : G.tv,
    keywords: [app, linkLabel(l)],
    accessories: [...(start ? [{ tag: `from ${start}`, color: "blue" as const }] : []), ...(o.at ? [{ date: o.at }] : [])],
    ...(o.section && { section: o.section }),
    ...(o.hero && { hero: true }),
    actions: ROW_ACTIONS(l),
  };
}

/** The link typed in the palette's box, alone and first. */
async function typedRows(query: string, device: string): Promise<Item[] | undefined> {
  const l = findLink(query) ?? (/^\S+\.\S+/.test(query.trim()) ? parseLink(`https://${query.trim()}`) : undefined);
  if (!l) return undefined;
  return [linkRow(l, "Typed", { ...(await lookup(l)), device, hero: true })];
}

export async function listPlay(query: string, ctx?: Ctx): Promise<Item[]> {
  const dev = current(await paired());
  if (!dev) return [{ id: "setup", name: "Set Up Apple TV", subtitle: "Pair an Apple TV first, then links play on it", icon: G.remote, actions: [{ id: "setup", title: "Set up" }] }];
  if (ctx?.inline) return (await typedRows(query, dev.name)) ?? [];
  const typed = query.trim() ? await typedRows(query, dev.name) : undefined;
  if (typed) return typed;
  if (query.trim()) return [{ id: "hint:paste", name: "Paste a link", subtitle: "A YouTube or Netflix link, or an Apple TV+ page", icon: G.info, actions: [] }];
  // Fast first: what is known without the network; the titles and pictures after.
  const seen = new Set<string>();
  const found: { l: MediaLink; where: string; at?: number; section: string }[] = [];
  const add = (l: MediaLink | undefined, where: string, section: string, at?: number) => { if (l && !seen.has(linkKey(l))) { seen.add(linkKey(l)); found.push({ l, where, at, section }); } };
  const tab = await tabs.active(600).catch(() => undefined);
  const inTab = tabLink(tab), addTab = () => add(inTab, tabWhere(tab), "Browser");
  // The tab partway through a video leads, so the copied same video does not start it over.
  if (inTab?.start) addTab();
  if (offer) add(offer.link, "Just copied", "Copied", offer.at);
  addTab();
  for (const e of await clipboard.list({ kind: "text", limit: 200 }).catch(() => [])) add(findLink(e.text), "Copied", "Copied", e.at);
  history ??= ((await storage.get("played", NAME)) as Played[] | null) ?? [];
  for (const h of history) add(parseLink(h.url), "Played", "Played before", h.at);
  const rows = (infos: (Awaited<ReturnType<typeof lookup>> | undefined)[]) => found.slice(0, 40).map((f, i) => linkRow(f.l, f.where, { ...infos[i], at: f.at, device: dev.name, section: f.section }));
  if (!found.length) return [{ id: "hint:none", name: "No links yet", subtitle: "Copy a YouTube or Netflix link, or type one here", icon: G.info, actions: [] }];
  ctx?.partial?.(rows([]));
  return rows(await Promise.all(found.slice(0, 40).map((f) => lookup(f.l).catch(() => undefined))));
}

export async function pickPlay(id: string, action: string | undefined): Promise<Effect> {
  if (id === "setup") return { push: { extension: NAME, palette: "setup" } };
  if (id.startsWith("hint:")) return { keep: true };
  const l = parseLink(id.replace(/^link:/, ""));
  if (!l) return toast("Not a link the Apple TV plays", undefined, "failure");
  switch (action ?? "play") {
    case "open": return { open: l.url };
    case "copy": return { copy: l.url };
    case "play:start": return playLink(l, { fromStart: true });
    default: {
      const e = await playLink(l);
      // From the root the panel goes; inside the palette the HUD says it.
      return e.toast ? e : { hud: e.hud };
    }
  }
}

/** The Now section's row: the copied link, while fresh. */
export async function suggestPlay(): Promise<Item[]> {
  const dev = current(await paired());
  if (!dev || !offer || !offerFresh(OFFER_ROOT_MS)) return [];
  return [{ ...linkRow(offer.link, "Just copied", { info: offer.info, thumb: offer.thumb, at: offer.at, device: dev.name }), name: offer.info?.title ?? linkLabel(offer.link), subtitle: `Copied · Enter plays it on ${dev.name}` }];
}

/** `pal://appletv/play`: the url given, else the copied link, else the browser tab in front. */
export async function linkPlay(url?: string): Promise<Effect> {
  const l = url ? findLink(url) ?? parseLink(url) : offer?.link ?? findLink((await clipboard.current().catch(() => null))?.text) ?? tabLink(await tabs.active(800).catch(() => undefined));
  if (!l) throw new Error(url ? `not a link the Apple TV plays: ${url}` : "no link copied, and the browser tab in front plays nothing");
  const e = await playLink(l);
  if (e.toast?.style === "failure") throw new Error(e.toast.message ?? e.toast.title);
  return { hud: e.hud };
}

export function disposePlay(): void { if (poll) clearInterval(poll); poll = undefined; }
export const offerTitle = () => (offer ? offer.info?.title ?? linkLabel(offer.link) : undefined);
