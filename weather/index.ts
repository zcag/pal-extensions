// Weather is its own small surface: a named place resolves through Open-Meteo,
// then the forecast answers the bar, its popover and the palette's page. No
// Home Assistant account, device permission or token is involved.
import { errorMessage, now, settings, storage, type BarItem, type Effect, type Extension, type View } from "@zcag/pal";
import { fmt, fold, isWet, lookOf, num, parseLocation, placeLabel, rainIn, type Current, type Place, type Reading } from "./model.ts";
import { render as renderPopover } from "./view.ts";

export { parseLocation } from "./model.ts";

/** `[extensions.weather]`, defaults in pal.json. */
type Settings = { location: string };
const GEOCODE = () => process.env.PAL_WEATHER_GEOCODE ?? "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST = () => process.env.PAL_WEATHER_FORECAST ?? "https://api.open-meteo.com/v1/forecast";
const CURRENT = "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code,precipitation,is_day";
const HOURLY = "temperature_2m,weather_code,precipitation_probability,is_day,cloud_cover,wind_speed_10m";
const DAILY = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max";
/** The bar polls (every render reads afresh); the page answers from its latest reading at once, and one older than this is marked stale so the page asks again. */
const FRESH_MS = 5 * 60_000;
const placeCache = new Map<string, Place>();

const quietCodes = new Set([0, 1, 2, 3]);

const score = (p: Place, qualifiers: string[]) => {
  const fields = [p.country, p.country_code, p.admin1, p.admin2, ...(p.postcodes ?? [])].filter((x): x is string => !!x).map(fold);
  return qualifiers.filter((q) => fields.some((f) => f === q || f.includes(q))).length;
};
/**
 * Open-Meteo's geocoder takes one bare place name, so "Istanbul, Turkey" matches
 * nothing at all. The qualifiers therefore rank the candidates instead of
 * filtering them: the index stores endonyms ("Republic of Türkiye") that a
 * written exonym ("Turkey") never equals, and hard-filtering on one would turn a
 * good answer into no answer. An unmatched qualifier falls through to population,
 * which is what a bare "Istanbul" should resolve to anyway. Equal on both, the
 * sort is stable and the service's own relevance order stands.
 */
export function pickPlace(results: Place[], qualifiers: string[]): Place | undefined {
  return results
    .map((place) => ({ place, rank: score(place, qualifiers) }))
    .sort((a, b) => b.rank - a.rank || (b.place.population ?? 0) - (a.place.population ?? 0))[0]?.place;
}

async function json<T>(url: URL): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`${response.status} from ${url.hostname}`);
  return response.json() as Promise<T>;
}
async function geocode(name: string, count = 10): Promise<Place[]> {
  const url = new URL(GEOCODE()); url.searchParams.set("name", name); url.searchParams.set("count", String(count)); url.searchParams.set("language", "en");
  return (await json<{ results?: Place[] }>(url)).results ?? [];
}
async function place(query: string): Promise<Place | undefined> {
  const cached = placeCache.get(query); if (cached) return cached;
  const { name, qualifiers } = parseLocation(query); if (!name) return;
  const found = pickPlace(await geocode(name), qualifiers);
  if (found) placeCache.set(query, found);
  return found;
}
async function fetchReading(query: string): Promise<Reading> {
  const p = await place(query); if (!p) throw new Error(`No place named “${parseLocation(query).name}”`);
  const url = new URL(FORECAST());
  url.searchParams.set("latitude", String(p.latitude)); url.searchParams.set("longitude", String(p.longitude));
  url.searchParams.set("current", CURRENT);
  url.searchParams.set("hourly", HOURLY);
  url.searchParams.set("daily", DAILY);
  url.searchParams.set("timezone", "auto");
  const data = await json<{ current?: Current; current_units?: Record<string, string>; hourly?: Reading["hourly"]; daily?: Reading["daily"] }>(url);
  if (!data.current || num(data.current.temperature_2m) === undefined || num(data.current.weather_code) === undefined) throw new Error("Weather service returned no current conditions");
  return { place: p, current: data.current, unit: data.current_units?.temperature_2m ?? "°C", windUnit: data.current_units?.wind_speed_10m ?? "km/h", hourly: data.hourly, daily: data.daily };
}

/** The last reading, shared by the bar, the popover and the page, kept in storage so a restart still opens on it; and the one request in flight. */
type Held = { query: string; at: number; reading: Reading };
let held: Held | undefined;
let restored: Promise<void> | undefined;
const restore = () => (restored ??= storage.get<Held>("last").then((h) => { if (h?.reading && !held) held = h; }, () => {}));
let inflight: { query: string; promise: Promise<Reading> } | undefined;
const location = () => settings.get<Settings>().location?.trim() ?? "";
async function read(force = false): Promise<Reading | undefined> {
  const query = location(); if (!query) return;
  if (!force && held?.query === query && now() - held.at < FRESH_MS) return held.reading;
  if (inflight?.query !== query) {
    const promise = fetchReading(query).then((reading) => { held = { query, at: now(), reading }; storage.set("last", held).catch(() => {}); return reading; }).finally(() => { if (inflight?.promise === promise) inflight = undefined; });
    inflight = { query, promise };
  }
  return inflight.promise;
}

/**
 * The reading in the condition's own tint, and the facts (`weather/temp`,
 * `weather/code`, `weather/quiet`, `weather/condition`;
 * docs/design/states.md): the manifest's rules hide ordinary weather
 * (a quiet sky inside 10 to 30 degrees, the band the user moves by the
 * rule's `when`) and tint cold blue and heat red. The reading is the
 * `empty` shape a `show = "always"` config keeps, muted, so the forecast
 * stays a click away.
 */
async function bar(): Promise<BarItem> {
  try {
    const r = await read(true); if (!r) return { hidden: true, states: { temp: null, code: null, quiet: null, condition: null, rain_in: null } };
    const [condition, glyph, color] = lookOf(r.current.weather_code);
    const soon = rainIn(r), at = new Date(Date.parse(r.current.time ?? "") + (soon ?? 0) * 3.6e6);
    const coming = soon !== undefined && !isWet(r.current.weather_code) && Number.isFinite(at.getTime()) ? ` · rain likely around ${String(at.getHours()).padStart(2, "0")}:00` : "";
    const item = { icon: glyph, title: `${fmt(r.current.temperature_2m)}${r.unit}`, tooltip: `${condition} in ${r.place.name}${coming}`, menu: { view: renderPopover(r) } };
    return { ...item, color, empty: item, states: { temp: r.current.temperature_2m, code: r.current.weather_code, quiet: quietCodes.has(r.current.weather_code), condition, rain_in: soon ?? null } };
  }
  catch (e) { const message = errorMessage(e); return { icon: "󰖪", title: "Weather", color: "red", stale: true, tooltip: message }; }
}

const mapUrl = (p: Place) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.latitude},${p.longitude}`)}`;
async function openMap(): Promise<Effect | void> { const r = await read(); if (r) return { open: mapUrl(r.place) }; }
async function refreshPopover(): Promise<Effect> {
  try {
    const r = await read(true);
    return r ? { view: renderPopover(r), hud: "Refreshed" } : { keep: true, hud: "No location" };
  } catch (e) {
    return { keep: true, hud: errorMessage(e) };
  }
}

// ---- the palette's page (surface/) --------------------------------------------------

/** What the page draws: the reading, or why there is none. */
export type Reply = { title: string; reading?: Reading; error?: string; setup?: true; stale?: true };
/** A place the search found, as the page lists it. */
export type Found = Place & { region: string };

/** `open` answers at once with whatever is held for the place, marked stale when old (the page then asks for `refresh`); only with nothing held does it wait for the service. */
async function reply(force = false): Promise<Reply> {
  const query = location();
  if (!query) return { title: "Weather", setup: true };
  await restore();
  if (!force && held?.query === query) return { title: placeLabel(held.reading.place), reading: held.reading, ...(now() - held.at >= FRESH_MS && { stale: true as const }) };
  try {
    const r = await read(force);
    if (!r) return { title: "Weather", setup: true };
    return { title: placeLabel(r.place), reading: r, ...(held && now() - held.at >= FRESH_MS && { stale: true as const }) };
  } catch (e) {
    return { title: held ? placeLabel(held.reading.place) : "Weather", reading: held?.reading, error: errorMessage(e) };
  }
}
/** The page's own map key: an Effect cannot travel back over `pal.send`, so the opener is run here. */
function openOutside(url: string) {
  const argv = process.env.PAL_OPEN_URL ? [process.env.PAL_OPEN_URL, url] : process.platform === "darwin" ? ["open", url] : ["xdg-open", url];
  Bun.spawn(argv, { stdin: "ignore", stdout: "ignore", stderr: "ignore" }).unref();
}
async function onMessage(raw: unknown): Promise<unknown> {
  const msg = raw as { op?: string; q?: string; place?: Found };
  switch (msg.op) {
    case "open": return reply();
    case "refresh": return reply(true);
    case "search": {
      const q = String(msg.q ?? "").trim(); if (!q) return [];
      const { name, qualifiers } = parseLocation(q);
      const all = await geocode(name, 8);
      const ranked = qualifiers.length ? [...all].sort((a, b) => score(b, qualifiers) - score(a, qualifiers)) : all;
      return ranked.map((p): Found => ({ ...p, region: [p.admin1 && fold(p.admin1) !== fold(p.name) ? p.admin1 : undefined, p.country].filter(Boolean).join(", ") }));
    }
    case "set": {
      const p = msg.place; if (!p || typeof p.latitude !== "number" || typeof p.longitude !== "number") return { title: "Weather", error: "No place chosen" };
      const { region: _region, ...chosen } = p;
      const label = placeLabel(chosen);
      placeCache.set(label, chosen);
      await settings.set("location", label);
      return reply(true);
    }
    case "map": { const r = await read(); if (r) openOutside(mapUrl(r.place)); return; }
  }
}
const actions = () => [
  { id: "map", title: "Open map", shortcut: "o" },
  { id: "place", title: "Change place", shortcut: "l" },
  { id: "refresh", title: "Refresh", shortcut: "r" },
  { id: "now", title: "Back to now", shortcut: "n" },
];
function page(): View {
  return { title: held && held.query === location() ? placeLabel(held.reading.place) : "Weather", tree: { type: "surface", src: "surface/index.html" }, actions: actions() };
}

export default {
  palettes: { weather: { title: "Weather", view: page, pick: () => undefined, onMessage } },
  bar: { weather: { render: bar, onAction: (action) => action === "map" ? openMap() : action === "refresh" ? refreshPopover() : undefined } },
} satisfies Extension;
