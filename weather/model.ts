// What the extension, the popover (view.ts) and the page (surface/) share:
// Open-Meteo's answer as read here, the WMO codes, and the readings drawn
// from it. No runtime imports, so the page loads this file as it is.

export type Place = { name: string; latitude: number; longitude: number; country?: string; country_code?: string; admin1?: string; admin2?: string; population?: number; postcodes?: string[] };
export type Current = { temperature_2m: number; apparent_temperature?: number; relative_humidity_2m?: number; wind_speed_10m?: number; wind_direction_10m?: number; cloud_cover?: number; weather_code: number; precipitation?: number; is_day?: number; time?: string };
export type Hourly = { time?: unknown[]; temperature_2m?: unknown[]; weather_code?: unknown[]; precipitation_probability?: unknown[]; is_day?: unknown[]; cloud_cover?: unknown[]; wind_speed_10m?: unknown[] };
export type Daily = { time?: unknown[]; weather_code?: unknown[]; temperature_2m_max?: unknown[]; temperature_2m_min?: unknown[]; precipitation_probability_max?: unknown[]; sunrise?: unknown[]; sunset?: unknown[]; uv_index_max?: unknown[] };
export type Reading = { place: Place; current: Current; unit: string; windUnit: string; hourly?: Hourly; daily?: Daily };

/** What a sky looks like, for the icons and the page's sky. */
export type Kind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "heavy" | "sleet" | "snow" | "storm" | "hail";
export type Tint = "muted" | "amber" | "blue" | "teal" | "red";

/** WMO weather code to condition, glyph (md-weather_*: sunny, partly_cloudy, cloudy, fog, rainy, pouring, snowy, snowy_rainy, lightning_rainy), tint and kind. */
export const LOOK: Record<number, [string, string, Tint, Kind]> = {
  0: ["Clear", "󰖙", "amber", "clear"], 1: ["Mostly clear", "󰖕", "amber", "partly"], 2: ["Partly cloudy", "󰖕", "amber", "partly"], 3: ["Overcast", "󰖐", "muted", "cloudy"],
  45: ["Fog", "󰖑", "teal", "fog"], 48: ["Rime fog", "󰖑", "teal", "fog"],
  51: ["Light drizzle", "󰖗", "blue", "drizzle"], 53: ["Drizzle", "󰖗", "blue", "drizzle"], 55: ["Heavy drizzle", "󰖖", "blue", "rain"],
  56: ["Freezing drizzle", "󰙿", "blue", "sleet"], 57: ["Freezing drizzle", "󰙿", "blue", "sleet"],
  61: ["Light rain", "󰖗", "blue", "drizzle"], 63: ["Rain", "󰖗", "blue", "rain"], 65: ["Heavy rain", "󰖖", "blue", "heavy"],
  66: ["Freezing rain", "󰙿", "blue", "sleet"], 67: ["Freezing rain", "󰙿", "blue", "sleet"],
  71: ["Light snow", "󰖘", "blue", "snow"], 73: ["Snow", "󰖘", "blue", "snow"], 75: ["Heavy snow", "󰖘", "blue", "snow"], 77: ["Snow grains", "󰖘", "blue", "snow"],
  80: ["Rain showers", "󰖗", "blue", "rain"], 81: ["Rain showers", "󰖗", "blue", "rain"], 82: ["Violent showers", "󰖖", "red", "heavy"],
  85: ["Snow showers", "󰖘", "blue", "snow"], 86: ["Heavy snow showers", "󰖘", "blue", "snow"],
  95: ["Thunderstorm", "󰙾", "red", "storm"], 96: ["Thunderstorm with hail", "󰙾", "red", "hail"], 99: ["Thunderstorm with hail", "󰙾", "red", "hail"],
};
const UNKNOWN: [string, string, Tint, Kind] = ["Weather", "󰖐", "muted", "cloudy"];
export const lookOf = (code: number | undefined) => (code === undefined ? undefined : LOOK[code]) ?? UNKNOWN;
const WET = new Set<Kind>(["drizzle", "rain", "heavy", "sleet", "snow", "storm", "hail"]);
export const isWet = (code: number | undefined) => WET.has(lookOf(code)[3]);

export const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
export const str = (value: unknown) => typeof value === "string" && value ? value : undefined;
export const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
/** Whole degrees, as weather apps write them: "21°", "−3°". */
export const deg = (n: number | undefined) => n === undefined ? "–" : `${Math.round(n) < 0 ? "−" : ""}${Math.abs(Math.round(n))}°`;
/** Case- and diacritic-insensitive, so a typed "Turkiye" still meets "Türkiye". */
export const fold = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
/** The searched name is the first segment; the rest only rank the answers. */
export function parseLocation(raw: string): { name: string; qualifiers: string[] } {
  const parts = raw.split(",").map((x) => x.trim()).filter(Boolean);
  return { name: parts[0] ?? "", qualifiers: parts.slice(1).map(fold) };
}
/** "London, Ontario, Canada": enough to see which of the same-named places answered. */
export const placeLabel = (p: Place) => [p.name, p.admin1 && fold(p.admin1) !== fold(p.name) ? p.admin1 : undefined, p.country].filter(Boolean).join(", ");

/** Open-Meteo answers in the place's own time with no offset: `2026-09-17T09:00`. */
const hourKey = (value: string) => value.slice(0, 13);
/** The hourly index of the current hour (the first later one when it is missing), -1 with no hours. */
export function startHour(r: Reading): number {
  const times = r.hourly?.time ?? [];
  if (!times.length) return -1;
  const now = r.current.time;
  if (!now) return 0;
  const key = hourKey(now);
  const exact = times.findIndex((t) => str(t)?.slice(0, 13) === key);
  if (exact >= 0) return exact;
  return times.findIndex((t) => { const s = str(t); return !!s && hourKey(s) > key; });
}

/** Light drizzle, rain and showers (and their snowy kin). */
const LIGHT_WET = new Set([51, 53, 56, 61, 66, 71, 80, 85]);
/** A light shower the forecast itself doubts (a chance under 30%): still rain, drawn and said lightly. */
export const isLight = (code: number | undefined, pop: number | undefined) => code !== undefined && LIGHT_WET.has(code) && pop !== undefined && pop < 30;

/** Hours until rain is likely (a wet hour, or a chance of half or more) within the next day: 0 while it falls, undefined when none comes. */
export function rainIn(r: Reading): number | undefined {
  if (isWet(r.current.weather_code)) return 0;
  const h = r.hourly, start = startHour(r), nowAt = r.current.time ? Date.parse(r.current.time) : NaN;
  if (!h?.time || start < 0) return;
  for (let i = start; i < Math.min(h.time.length, start + 24); i++) {
    const time = str(h.time[i]);
    if (!time || !(isWet(num(h.weather_code?.[i])) || (num(h.precipitation_probability?.[i]) ?? 0) >= RAIN_LIKELY)) continue;
    return Number.isFinite(nowAt) ? Math.max(0, Math.round(((Date.parse(time) - nowAt) / 3.6e6) * 10) / 10) : i - start;
  }
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
/** The direction the wind blows from, as a compass point. */
export const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
export const uvWord = (uv: number) => uv < 3 ? "Low" : uv < 6 ? "Moderate" : uv < 8 ? "High" : uv < 11 ? "Very high" : "Extreme";
const at = (s: string) => s.slice(11, 16);
const RAIN_LIKELY = 50, LOOKAHEAD = 12;

/**
 * One sentence on what is coming: when wet weather stops or starts within
 * the next twelve hours, else how tomorrow compares, else that it stays dry.
 */
export function summary(r: Reading): string | undefined {
  const h = r.hourly, start = startHour(r);
  const wetNow = isWet(r.current.weather_code);
  const word = (code: number | undefined) => { const k = lookOf(code)[3]; return k === "snow" ? "Snow" : k === "storm" || k === "hail" ? "Storms" : k === "sleet" ? "Sleet" : "Rain"; };
  if (h?.time && start >= 0) {
    const end = Math.min(h.time.length, start + LOOKAHEAD);
    for (let i = start + 1; i < end; i++) {
      const code = num(h.weather_code?.[i]), time = str(h.time[i]); if (!time) continue;
      const wet = isWet(code) || (num(h.precipitation_probability?.[i]) ?? 0) >= RAIN_LIKELY;
      if (wetNow && !isWet(code)) return `${word(r.current.weather_code)} easing around ${at(time)}`;
      if (!wetNow && wet) return isLight(code, num(h.precipitation_probability?.[i])) ? `${lookOf(code)[0]} possible around ${at(time)}` : `${word(isWet(code) ? code : 61)} likely around ${at(time)}`;
    }
    if (wetNow) return `${word(r.current.weather_code)} for the next ${end - start} hours`;
  }
  const hi = r.daily?.temperature_2m_max ?? [];
  const today = num(hi[0]), tomorrow = num(hi[1]);
  if (today !== undefined && tomorrow !== undefined && Math.abs(tomorrow - today) >= 3) return `${tomorrow > today ? "Warmer" : "Cooler"} tomorrow, up to ${deg(tomorrow)}`;
  if (wetNow) return r.current.precipitation ? `${fmt(r.current.precipitation)} mm in the last hour` : undefined;
  return h?.time && start >= 0 ? `Dry for the next ${LOOKAHEAD} hours` : undefined;
}

/** A temperature's colour, cold violet through mild green to hot red; Fahrenheit is read as Celsius first. */
const SCALE: [number, number, number, number][] = [[-15, 140, 120, 255], [-3, 92, 160, 255], [6, 72, 205, 220], [14, 120, 220, 140], [21, 250, 210, 90], [28, 255, 150, 72], [36, 255, 84, 84]];
export function tempColor(t: number, unit = "°C"): string {
  const c = unit.includes("F") ? (t - 32) * 5 / 9 : t;
  const i = SCALE.findIndex(([at]) => at >= c);
  if (i <= 0) { const s = SCALE[i === 0 ? 0 : SCALE.length - 1]; return `rgb(${s[1]},${s[2]},${s[3]})`; }
  const [a, b] = [SCALE[i - 1], SCALE[i]], k = (c - a[0]) / (b[0] - a[0]);
  const mix = (j: number) => Math.round(a[j] + (b[j] - a[j]) * k);
  return `rgb(${mix(1)},${mix(2)},${mix(3)})`;
}
