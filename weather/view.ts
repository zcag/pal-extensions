// The bar popover as a pure `View`: the reading on a card tinted by the sky,
// then the next hours and five days, with the same illustrations the page
// draws (art.ts) as images. The hourly strip starts at `current.time` by
// matching it against `hourly.time`. Forecast fields are all optional:
// missing arrays remove their section and leave the reading.
import { POPOVER_W, column, row, text, type Action, type View, type ViewNode } from "@zcag/pal";
import { weatherArtUrl } from "./art.ts";
import { compass, deg, fmt, lookOf, num, placeLabel, startHour, str, summary, tempColor, uvWord, type Kind, type Reading } from "./model.ts";

export * from "./model.ts";

/**
 * `Space` steps the 4 px grid, so a `gap`/`padding` of n is 4n px. The
 * popover's own padding is 3 and each sunken card's is its own, and both
 * have to come off before the columns are shared out.
 */
const SPACE = 4, OUTER_PAD = 3 * SPACE, CARD_PAD = 2 * SPACE;
const INNER_W = POPOVER_W - 2 * OUTER_PAD - 2 * CARD_PAD;
/** Eight hours: a column needs its temperature ("−12°") and its picture to fit. */
const HOUR_COUNT = 8;
const HOURLY_W = Math.floor((INNER_W - (HOUR_COUNT - 1) * SPACE) / HOUR_COUNT);
/** A day's row: name, picture, chance of rain, low, the range bar, high; five gaps of two steps. */
const DAY_W = 52, ART_W = 24, POP_W = 34, TEMP_W = 30;
const BAR_W = INNER_W - DAY_W - ART_W - POP_W - 2 * TEMP_W - 5 * 2 * SPACE;
const DAY_COUNT = 5;
/** Below this the chance of rain is not worth the ink. */
const PRECIP_MIN = 20;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The hero card's tint: the sky's colour, faint enough that the panel's ink reads on it. */
const TINT: Record<Kind, `#${string}`> = {
  clear: "#F5B83D2E", partly: "#F5B83D24", cloudy: "#8A94A62A", fog: "#5FCFCB26", drizzle: "#4F8AE828", rain: "#4F8AE830",
  heavy: "#3E6FD038", sleet: "#7FB2E830", snow: "#9CC9F533", storm: "#8A6EE638", hail: "#8A6EE638",
};
const NIGHT_TINT: `#${string}` = "#6E64D830";

export const label = (r: Reading) => lookOf(r.current.weather_code);
const weekday = (value: string, i: number) => i === 0 ? "Today" : WEEKDAY[new Date(`${value}T12:00:00`).getDay()];

/** A day's span against the week's: the track, the low-to-high gradient, and today's reading as a dot. */
function rangeBar(lo: number, hi: number, min: number, max: number, unit: string, dot?: number): string {
  const w = BAR_W, h = 10, span = max - min || 1, x = (t: number) => 2 + ((t - min) / span) * (w - 4);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="${x(lo)}" x2="${x(hi)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${tempColor(lo, unit)}"/><stop offset="1" stop-color="${tempColor(hi, unit)}"/></linearGradient></defs>`
    + `<rect x="0" y="2.5" width="${w}" height="5" rx="2.5" fill="#8080803a"/><rect x="${(x(lo) - 2).toFixed(1)}" y="2.5" width="${Math.max(5, x(hi) - x(lo) + 4).toFixed(1)}" height="5" rx="2.5" fill="url(#g)"/>`
    + (dot === undefined ? "" : `<circle cx="${x(dot).toFixed(1)}" cy="5" r="3.6" fill="#fff" stroke="#00000059" stroke-width="1.2"/>`)
    + `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function hero(r: Reading): ViewNode {
  const [condition, , , kind] = label(r), night = r.current.is_day === 0;
  const hi = num(r.daily?.temperature_2m_max?.[0]), lo = num(r.daily?.temperature_2m_min?.[0]), feels = num(r.current.apparent_temperature);
  const said = summary(r);
  return column([
    row([
      { type: "image", key: "art", src: weatherArtUrl(kind, night, 52), width: 52, height: 52, alt: condition },
      column([text(deg(r.current.temperature_2m), { key: "temp", style: "headline" }), text(condition, { key: "condition", weight: "semibold", size: "sm" })], { key: "reading", gap: 0, grow: true }),
      column([
        ...(hi !== undefined && lo !== undefined ? [text(`H ${deg(hi)}  L ${deg(lo)}`, { key: "hilo", style: "number", size: "sm", align: "end" })] : []),
        ...(feels !== undefined ? [text(`Feels like ${deg(feels)}`, { key: "feels", style: "muted", size: "xs", align: "end" })] : []),
      ], { key: "side", gap: 0, align: "end" }),
    ], { key: "now", gap: 3, align: "center" }),
    ...(said ? [text(said, { key: "summary", size: "sm", weight: "medium" })] : []),
    ...facts(r),
  ], { key: "hero", surface: night ? NIGHT_TINT : TINT[kind], radius: true, padding: 3, gap: 1 });
}

/** Humidity, wind, rain or UV, and the next sunrise or sunset, on one line under the reading. */
function facts(r: Reading): ViewNode[] {
  const c = r.current, dir = num(c.wind_direction_10m), uv = num(r.daily?.uv_index_max?.[0]);
  const sun = [["Sunrise", str(r.daily?.sunrise?.[0])], ["Sunset", str(r.daily?.sunset?.[0])], ["Sunrise", str(r.daily?.sunrise?.[1])]].find(([, t]) => t && t > (c.time ?? ""));
  const items = [
    c.relative_humidity_2m === undefined ? undefined : `Humidity ${fmt(c.relative_humidity_2m)}%`,
    c.wind_speed_10m === undefined ? undefined : `Wind ${fmt(c.wind_speed_10m)} ${r.windUnit}${dir === undefined ? "" : ` ${compass(dir)}`}`,
    c.precipitation ? `Rain ${fmt(c.precipitation)} mm` : uv === undefined ? undefined : `UV ${Math.round(uv)} ${uvWord(uv).toLowerCase()}`,
    sun?.[1] ? `${sun[0]} ${sun[1].slice(11, 16)}` : undefined,
  ].filter((x): x is string => !!x);
  return items.length ? [text(items.join("  ·  "), { key: "facts", style: "muted", size: "xs" })] : [];
}

function hourly(r: Reading): ViewNode[] {
  const h = r.hourly, start = startHour(r);
  if (!h || start < 0) return [];
  const cols: ViewNode[] = [];
  for (let i = start; i < (h.time?.length ?? 0) && cols.length < HOUR_COUNT; i++) {
    const time = str(h.time?.[i]); if (!time) continue;
    const temp = num(h.temperature_2m?.[i]), rain = num(h.precipitation_probability?.[i]);
    const [, , , kind] = lookOf(num(h.weather_code?.[i]));
    cols.push(column([
      text(i === start ? "Now" : time.slice(11, 16), { size: "xs", color: i === start ? undefined : "muted", weight: i === start ? "semibold" : undefined, align: "center", width: HOURLY_W }),
      { type: "image", src: weatherArtUrl(kind, h.is_day?.[i] === 0, 26), width: 26, height: 26 },
      text(deg(temp), { style: "number", size: "sm", align: "center", width: HOURLY_W }),
      // A dry hour keeps the line (a no-break space, not ""), or its column is a line short and the strip's rows no longer line up.
      text(rain !== undefined && rain >= PRECIP_MIN ? `${fmt(rain)}%` : " ", { size: "xs", color: "blue", align: "center", width: HOURLY_W }),
    ], { key: `h-${time}`, gap: 0, align: "center" }));
  }
  if (!cols.length) return [];
  return [column([text("Next hours", { size: "xs", weight: "semibold", color: "muted" }), row(cols, { key: "hourly-strip", gap: 1, surface: "sunken", radius: true, padding: 2 })], { key: "hourly", gap: 1 })];
}

function daily(r: Reading): ViewNode[] {
  const d = r.daily;
  if (!d?.time?.length) return [];
  const n = Math.min(DAY_COUNT, d.time.length);
  const all = Array.from({ length: n }, (_, i) => [num(d.temperature_2m_max?.[i]), num(d.temperature_2m_min?.[i])]).flat().filter((v): v is number => v !== undefined);
  const min = Math.min(...all), max = Math.max(...all);
  const rows: ViewNode[] = [];
  for (let i = 0; i < n; i++) {
    const day = str(d.time[i]); if (!day) continue;
    const hi = num(d.temperature_2m_max?.[i]), lo = num(d.temperature_2m_min?.[i]), rain = num(d.precipitation_probability_max?.[i]);
    const [condition, , , kind] = lookOf(num(d.weather_code?.[i]));
    rows.push(row([
      text(weekday(day, i), { size: "sm", weight: "semibold", width: DAY_W }),
      { type: "image", src: weatherArtUrl(kind, false, ART_W), width: ART_W, height: ART_W, alt: condition },
      text(rain !== undefined && rain >= PRECIP_MIN ? `${fmt(rain)}%` : "", { size: "xs", color: "blue", width: POP_W }),
      text(deg(lo), { style: "number", size: "sm", color: "muted", align: "end", width: TEMP_W }),
      ...(hi !== undefined && lo !== undefined ? [{ type: "image" as const, src: rangeBar(lo, hi, min, max, r.unit, i === 0 ? r.current.temperature_2m : undefined), width: BAR_W, height: 10 }] : [{ type: "spacer" as const, size: BAR_W }]),
      text(deg(hi), { style: "number", size: "sm", width: TEMP_W }),
    ], { key: `d-${day}`, gap: 2, minHeight: 25, align: "center" }));
  }
  if (!rows.length) return [];
  return [column([text("Forecast", { size: "xs", weight: "semibold", color: "muted" }), column(rows, { key: "daily-rows", gap: 0, surface: "sunken", radius: true, padding: 2 })], { key: "daily", gap: 1 })];
}

const actions = (): Action[] => [
  { id: "map", title: "Open map", shortcut: "o" },
  { id: "refresh", title: "Refresh", shortcut: "r" },
];

export function render(r: Reading): View {
  return {
    title: placeLabel(r.place),
    id: "weather",
    keys: "actions",
    actions: actions(),
    tree: column([hero(r), ...hourly(r), ...daily(r)], { key: "weather", padding: 3, gap: 2 }),
  };
}
