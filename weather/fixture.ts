// Writes test/shots/weather.json and bar-weather.json, the store
// screenshots' fixtures: the page's replies and the bar item drawn through
// the host harness against a stand-in Open-Meteo (geocoder and forecast)
// answering a made-up mid-September afternoon in Istanbul: showers
// clearing to a mild evening, then a thunderstorm for the red state.
// `bun run weather/fixture.ts`, then `make shots EXT=weather`.
import { pinClock, settle, writeFixture } from "../.pal/app/scripts/fixture-kit.ts";
import { Host } from "../.pal/host/test/harness.ts";

pinClock();
const ISTANBUL = { name: "Istanbul", country: "Republic of Türkiye", country_code: "TR", admin1: "Istanbul", population: 15701602, latitude: 41.01, longitude: 28.98 };
const LONDONS = [
  { name: "London", country: "United Kingdom", country_code: "GB", admin1: "England", population: 8961989, latitude: 51.51, longitude: -0.13 },
  { name: "London", country: "Canada", country_code: "CA", admin1: "Ontario", population: 422324, latitude: 42.98, longitude: -81.23 },
  { name: "Londonderry County Borough", country: "United Kingdom", country_code: "GB", admin1: "Northern Ireland", population: 83652, latitude: 54.99, longitude: -7.31 },
];
const DAYS = ["2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"];
const hours = DAYS.flatMap((d) => Array.from({ length: 24 }, (_, i) => `${d}T${String(i).padStart(2, "0")}:00`));
/** A value per hour of the first day from a table of `hour: value`, each holding until the next; later days from `later(day, hour)`. */
const by = (at: Record<number, number>, later: (d: number, h: number) => number) => hours.map((_, i) => {
  const d = Math.floor(i / 24), h = i % 24;
  return d ? later(d, h) : at[Math.max(...Object.keys(at).map(Number).filter((k) => k <= h))];
});
/** A mild day's swing: coolest before dawn, warmest mid-afternoon. */
const swing = (lo: number, hi: number) => (h: number) => Math.round((lo + (hi - lo) * (0.5 - 0.5 * Math.cos(((h - 5) / 24) * 2 * Math.PI))) * 10) / 10;
const HIGHS = [22, 25, 26, 24, 21, 19, 23], LOWS = [17, 18, 19, 18, 17, 14, 15], CODES = [80, 2, 0, 3, 61, 63, 1], RAIN = [70, 10, 0, 20, 60, 70, 5];
const daily = (first: number, rain: number) => ({
  time: DAYS,
  weather_code: [first, ...CODES.slice(1)],
  temperature_2m_max: HIGHS,
  temperature_2m_min: LOWS,
  precipitation_probability_max: [rain, ...RAIN.slice(1)],
  sunrise: DAYS.map((d, i) => `${d}T06:${String(44 + i).padStart(2, "0")}`),
  sunset: DAYS.map((d, i) => `${d}T19:${String(8 - 2 * i).padStart(2, "0")}`),
  uv_index_max: [3.4, 5.6, 6.2, 4.8, 2.4, 1.9, 4.6],
});
const UNITS = { temperature_2m: "°C", wind_speed_10m: "km/h" };
const laterTemp = (d: number, h: number) => swing(LOWS[d], HIGHS[d])(h);
const laterCode = (d: number, h: number) => (h < 6 || h > 20) && CODES[d] < 3 ? 1 : CODES[d];
const isDay = hours.map((t) => { const h = Number(t.slice(11, 13)); return h >= 7 && h <= 19 ? 1 : 0; });
/** 14:30, a shower passing over: 21 degrees, clearing by five. */
const SHOWERS = {
  current: { time: `${DAYS[0]}T14:30`, temperature_2m: 21, apparent_temperature: 21, relative_humidity_2m: 78, wind_speed_10m: 17, wind_direction_10m: 40, cloud_cover: 88, weather_code: 80, precipitation: 0.6, is_day: 1 },
  current_units: UNITS,
  hourly: {
    time: hours,
    temperature_2m: by({ 0: 18, 3: 17.5, 6: 17, 9: 19, 11: 21, 13: 22, 14: 21, 16: 22, 18: 21.5, 20: 21, 22: 20.8 }, laterTemp),
    weather_code: by({ 0: 3, 13: 80, 16: 3, 17: 2, 19: 1, 22: 0 }, laterCode),
    precipitation_probability: by({ 0: 10, 13: 70, 15: 55, 16: 25, 17: 5 }, (d) => RAIN[d] >= 50 ? RAIN[d] : 5),
    is_day: isDay,
    cloud_cover: by({ 0: 70, 13: 92, 16: 60, 17: 35, 19: 20, 22: 8 }, (d) => [0, 25, 5, 60, 90, 95, 15][d]),
    wind_speed_10m: by({ 0: 9, 13: 17, 16: 12, 19: 8 }, (d) => 10 + d),
  },
  daily: daily(80, 70),
};
/** The same afternoon with a thunderstorm on top of the city. */
const STORM = {
  current: { time: `${DAYS[0]}T14:30`, temperature_2m: 19, apparent_temperature: 18, relative_humidity_2m: 88, wind_speed_10m: 34, wind_direction_10m: 220, cloud_cover: 100, weather_code: 95, precipitation: 4.2, is_day: 1 },
  current_units: UNITS,
  hourly: {
    ...SHOWERS.hourly,
    temperature_2m: by({ 0: 18, 6: 17, 9: 19, 11: 21, 13: 20, 14: 19, 16: 19.5, 18: 20, 21: 20.6 }, laterTemp),
    weather_code: by({ 0: 3, 13: 95, 16: 80, 17: 61, 18: 3, 21: 2 }, laterCode),
    precipitation_probability: by({ 0: 10, 13: 90, 15: 80, 16: 60, 17: 40, 18: 15 }, (d) => RAIN[d] >= 50 ? RAIN[d] : 5),
    cloud_cover: by({ 0: 80, 13: 100, 18: 70, 21: 40 }, (d) => [0, 25, 5, 60, 90, 95, 15][d]),
    wind_speed_10m: by({ 0: 12, 13: 34, 16: 22, 19: 12 }, (d) => 10 + d),
  },
  daily: daily(95, 90),
};

let forecast: object = SHOWERS;
const server = Bun.serve({ port: 0, fetch: (req) => {
  const url = new URL(req.url);
  if (!url.pathname.includes("search")) return Response.json(forecast);
  return Response.json({ results: url.searchParams.get("name")?.toLowerCase().startsWith("lond") ? LONDONS : [ISTANBUL] });
} });
process.env.PAL_WEATHER_GEOCODE = `${server.url}v1/search`;
process.env.PAL_WEATHER_FORECAST = `${server.url}v1/forecast`;
const host = await Host.bundled({ settings: { weather: { settings: { location: "Istanbul, Turkey" } } } });
try {
  /** The item as the strip gets it: no rule matches either reading (not quiet, inside 10 to 30), so the condition's own tint stands. */
  const face = async () => { const { states: _s, empty: _e, ...item } = await host.render("weather", "weather"); return item; };
  const showers = await face();
  const pageOf = async () => ({ open: await host.surfaceSend("weather", "weather", { op: "open" }), view: await host.request("view", { extension: "weather", palette: "weather" }) });
  const now = await pageOf();
  const search = await host.surfaceSend("weather", "weather", { op: "search", q: "lond" });
  forecast = STORM;
  const storm = await face();
  const stormPage = await pageOf();
  forecast = SHOWERS;
  await face();
  const hosts = { [server.url.href]: "https://api.open-meteo.com" };
  writeFixture("bar-weather", await settle({
    key: "weather/weather",
    title: "Weather",
    item: showers,
    states: [{ id: "storm", item: storm }],
    shots: {
      "menubar": { target: "menubar", caption: "On the menu bar only when the weather is worth a look: a shower passing, its glyph and the temperature in blue" },
      "menubar-storm": { target: "menubar", state: "storm", caption: "A thunderstorm turns it red" },
      "popover": { target: "menubar", popover: true, caption: "A click opens the popover: the reading on a card tinted by the sky, the next eight hours, five days with each day's span" },
      "sketchybar": { target: "sketchybar", caption: "On sketchybar: the weather glyph and the temperature" },
    },
  }, { hosts }));

  const p = host.loaded().find((l) => l.extension === "weather")!.palettes[0];
  const palette = (x: { open: unknown; view: unknown }, more: { msg: unknown; reply: unknown }[] = []) =>
    ({ title: p.title, icon: p.icon, view: "view", tree: x.view, surface: { storage: {}, settings: { location: "Istanbul, Turkey" }, send: [{ msg: { op: "open" }, reply: x.open }, ...more] } });
  const right = (n: number) => Array.from({ length: n }, () => "right");
  writeFixture("weather", await settle({
    palettes: { now: palette(now, [{ msg: { op: "search", q: "lond" }, reply: search }]), storm: palette(stormPage) },
    shots: {
      "1-now": { palette: "now", keys: ["wait:2200"], caption: "Showers over Istanbul: the reading, what is coming, the next 24 hours and the week, over a sky that is raining" },
      "2-later": { palette: "now", keys: ["wait:1500", ...right(7), "wait:2200"], caption: "The arrows walk the hours: at nine the rain has gone, the sun is down and the sky turns to night" },
      "3-storm": { palette: "storm", keys: ["wait:2200"], caption: "A thunderstorm: heavy rain blown by the wind, lightning now and then" },
      "4-place": { palette: "now", keys: ["wait:1500", "type:l", "wait:300", "type:lond", "wait:1200"], caption: "L searches for a place and keeps it" },
    },
  }, { hosts }));
  console.log("weather.json, bar-weather.json: showers over Istanbul at 21°C, a thunderstorm, a search for London");
} finally {
  host.kill();
  server.stop(true);
}
