import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { View, ViewNode } from "../.pal/sdk/src/protocol.ts";
import { Host } from "../.pal/host/test/harness.ts";

// Open-Meteo's geocoder searches one bare place name and answers nothing at all
// for "Istanbul, Turkey", so the fake matches the same way: anything looser here
// would pass while the real service returns an empty body.
const INDEX: Record<string, any[]> = {
  istanbul: [{ name: "Istanbul", country: "Republic of Türkiye", country_code: "TR", admin1: "Istanbul", population: 15701602, latitude: 41.01, longitude: 28.98 }],
  london: [
    { name: "London", country: "United Kingdom", country_code: "GB", admin1: "England", population: 8961989, latitude: 51.51, longitude: -0.13 },
    { name: "London", country: "Canada", country_code: "CA", admin1: "Ontario", population: 422324, latitude: 42.98, longitude: -81.23 },
  ],
};
const hours = Array.from({ length: 24 }, (_, i) => `2026-09-17T${String(i).padStart(2, "0")}:00`);
const forecastWithOutlook = {
  current: { time: "2026-09-17T09:30", temperature_2m: 14, apparent_temperature: 12, relative_humidity_2m: 82, wind_speed_10m: 18, weather_code: 63, precipitation: 1.2 },
  current_units: { temperature_2m: "°C", wind_speed_10m: "km/h" },
  hourly: {
    time: hours,
    temperature_2m: hours.map((_, i) => i + 5),
    weather_code: hours.map((_, i) => i < 12 ? 63 : 2),
    precipitation_probability: hours.map((_, i) => i === 9 ? 80 : i === 10 ? 35 : 5),
  },
  daily: {
    time: ["2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21"],
    weather_code: [63, 2, 0, 95, 3],
    temperature_2m_max: [17, 20, 24, 18, 16],
    temperature_2m_min: [11, 12, 14, 10, 9],
    precipitation_probability_max: [80, 15, 0, 65, 30],
    sunrise: ["2026-09-17T06:47", "2026-09-18T06:48"],
    sunset: ["2026-09-17T19:08", "2026-09-18T19:06"],
  },
};
const currentOnly = { current: forecastWithOutlook.current, current_units: forecastWithOutlook.current_units };
let forecast: Record<string, unknown> = forecastWithOutlook;
const nodes = (n: ViewNode): ViewNode[] => [n, ...("children" in n ? n.children.flatMap(nodes) : [])];
const texts = (v: View) => nodes(v.tree).flatMap((n) => (n.type === "text" ? [n.value] : []));
const viewOf = (x: unknown): View => {
  const o = x as { view?: View; menu?: { view?: View } };
  const v = o.view ?? o.menu?.view;
  if (!v) throw new Error("no view");
  return v;
};
const server = Bun.serve({ port: 0, fetch(req) {
  const url = new URL(req.url);
  if (url.pathname.includes("search")) { const hit = INDEX[(url.searchParams.get("name") ?? "").toLowerCase()]; return Response.json(hit ? { results: hit } : {}); }
  expect(url.searchParams.get("current")).toBe("temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code,precipitation,is_day");
  expect(url.searchParams.get("hourly")).toBe("temperature_2m,weather_code,precipitation_probability,is_day,cloud_cover,wind_speed_10m");
  expect(url.searchParams.get("daily")).toBe("weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max");
  return Response.json(forecast);
} });
const configured = (location: string) => ({ settings: { location } });
let host: Host;
beforeAll(async () => { process.env.PAL_WEATHER_GEOCODE = `http://127.0.0.1:${server.port}/v1/search`; process.env.PAL_WEATHER_FORECAST = `http://127.0.0.1:${server.port}/v1/forecast`; host = await Host.bundled({ settings: { weather: configured("Istanbul, Turkey") } }); });
afterAll(() => { host.kill(); server.stop(true); delete process.env.PAL_WEATHER_GEOCODE; delete process.env.PAL_WEATHER_FORECAST; });
describe("weather", () => {
  test("meta: the bar item advertises its popover keys", () => {
    const loaded = host.loaded().find((x) => x.extension === "weather")!;
    expect(loaded.bar).toEqual([{ id: "weather", title: "Weather", description: expect.any(String), refresh: { every: 600, on: ["wake", "network"] }, mocks: expect.any(Object), keys: expect.any(Array), rules: [{ id: "ordinary", when: "weather.quiet and weather.temp >= 10 and weather.temp <= 30", description: expect.any(String), hidden: true, color: "muted" }, { id: "cold", when: "weather.temp < 10", description: expect.any(String), color: "blue" }, { id: "hot", when: "weather.temp > 30", description: expect.any(String), color: "red" }], source: true }]);
    expect(loaded.bar[0].keys!.map((k) => k.keys)).toEqual(["o", "r"]);
  });

  test("a notable condition has a condition-led bar, and the page reads the same reading without asking again", async () => {
    forecast = forecastWithOutlook;
    host.changeSettings("weather", configured("Istanbul, Turkey"));
    expect(await host.render("weather", "weather")).toMatchObject({ icon: "󰖗", title: "14°C", tooltip: "Rain in Istanbul", states: { temp: 14, quiet: false, condition: "Rain" } });
    forecast = currentOnly;
    try {
      const open = await host.surfaceSend("weather", "weather", { op: "open" }) as { title: string; reading: { current: { temperature_2m: number }; daily?: unknown }; stale?: true };
      expect(open).toMatchObject({ title: "Istanbul, Republic of Türkiye", reading: { current: { temperature_2m: 14 }, daily: { time: expect.any(Array) } } });
      expect(open.stale).toBeUndefined();
      const fresh = await host.surfaceSend("weather", "weather", { op: "refresh" }) as { reading: { daily?: unknown } };
      expect(fresh.reading.daily).toBeUndefined();
    } finally { forecast = forecastWithOutlook; }
  });

  test("with no location the page opens on the place search", async () => {
    host.changeSettings("weather", configured(""));
    try {
      expect(await host.surfaceSend("weather", "weather", { op: "open" })).toEqual({ title: "Weather", setup: true });
    } finally { host.changeSettings("weather", configured("Istanbul, Turkey")); }
  });

  test("the popover starts the hourly strip at the current hour and shows the compact forecast", async () => {
    forecast = forecastWithOutlook;
    host.changeSettings("weather", configured("Istanbul, Turkey"));
    const v = viewOf(await host.render("weather", "weather"));
    expect(v).toMatchObject({ id: "weather", title: "Istanbul, Republic of Türkiye", keys: "actions" });
    const t = texts(v);
    expect(t).toContain("Next hours");
    expect(t).not.toContain("08:00");
    expect(t).not.toContain("09:00");
    expect(t).toEqual(expect.arrayContaining(["Now", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"]));
    expect(t).toEqual(expect.arrayContaining(["14°", "15°", "80%", "35%"]));
    expect(t).toEqual(expect.arrayContaining(["Forecast", "Today", "Fri", "Sat", "Sun", "Mon", "17°", "11°", "24°"]));
    expect(t).toEqual(expect.arrayContaining(["Rain", "H 17°  L 11°", "Feels like 12°", "Rain easing around 12:00", "Humidity 82%  ·  Wind 18 km/h  ·  Rain 1.2 mm  ·  Sunset 19:08"]));
    expect(v.actions!.map((a) => [a.id, a.shortcut])).toEqual([["map", "o"], ["refresh", "r"]]);
  });

  test("the popover keeps the current card when the service omits forecast arrays", async () => {
    forecast = currentOnly;
    host.changeSettings("weather", configured("Istanbul, Turkey"));
    const v = viewOf(await host.render("weather", "weather"));
    const t = texts(v);
    expect(t).toEqual(expect.arrayContaining(["14°", "Rain", "Feels like 12°", "Humidity 82%  ·  Wind 18 km/h  ·  Rain 1.2 mm", "1.2 mm in the last hour"]));
    expect(t).not.toContain("Next hours");
    expect(t).not.toContain("Forecast");
    expect(await host.barAction("weather", "weather", "refresh")).toMatchObject({ view: { id: "weather" }, hud: "Refreshed" });
  });

  test("a country the geocoder cannot match still resolves the city it qualifies", async () => {
    // "Turkey" equals neither "Republic of Türkiye" nor "TR": the qualifier has to
    // rank the answers, never filter them, or this is the red unavailable state.
    forecast = forecastWithOutlook;
    host.changeSettings("weather", configured("Istanbul, Turkey"));
    const item = await host.render("weather", "weather");
    expect(item.stale).toBeUndefined();
    expect(viewOf(item).title).toBe("Istanbul, Republic of Türkiye");
  });

  test("a qualifier chooses between same-named places, and population decides without one", async () => {
    forecast = forecastWithOutlook;
    host.changeSettings("weather", configured("London, Ontario"));
    expect(viewOf(await host.render("weather", "weather")).title).toBe("London, Ontario, Canada");
    host.changeSettings("weather", configured("London"));
    expect(viewOf(await host.render("weather", "weather")).title).toBe("London, England, United Kingdom");
  });

  test("a name that matches nothing is a visible failure naming what was searched", async () => {
    host.changeSettings("weather", configured("Nowhereville, Utah"));
    expect(await host.render("weather", "weather")).toMatchObject({ color: "red", stale: true, tooltip: "No place named “Nowhereville”" });
  });

  test("ordinary weather renders the reading in the condition's tint with quiet true (the manifest's rule hides it), the reading its empty shape; notable weather the same with quiet false", async () => {
    const quiet = { ...forecastWithOutlook, current: { ...forecastWithOutlook.current, temperature_2m: 21, weather_code: 1 } };
    try {
      forecast = quiet;
      host.changeSettings("weather", configured("Istanbul, Turkey"));
      const item = await host.render("weather", "weather");
      expect(item).toMatchObject({ icon: "󰖕", title: "21°C", tooltip: "Mostly clear in Istanbul", color: "amber", states: { temp: 21, code: 1, quiet: true, condition: "Mostly clear" }, empty: { icon: "󰖕", title: "21°C", tooltip: "Mostly clear in Istanbul" } });
      expect(item).not.toHaveProperty("hidden");
      expect(viewOf(item.empty!).title).toBe("Istanbul, Republic of Türkiye");
      forecast = forecastWithOutlook;
      expect(await host.render("weather", "weather")).toMatchObject({ icon: "󰖗", title: "14°C", states: { quiet: false }, tooltip: "Rain in Istanbul" });
    } finally {
      forecast = forecastWithOutlook;
      host.changeSettings("weather", configured("Istanbul, Turkey"));
    }
  });

  test("an empty location stays quiet and the manifest provides settings previews", async () => {
    host.changeSettings("weather", configured(""));
    expect(await host.render("weather", "weather")).toMatchObject({ hidden: true });
    expect(host.loaded().find((x) => x.extension === "weather")!.bar[0].mocks?.quiet.item).toEqual({ hidden: true, empty: { icon: "󰖕", title: "19°C", tooltip: "Partly cloudy in Istanbul" } });
  });

  test("the page searches places with their region and keeps the one chosen as the location", async () => {
    const found = await host.surfaceSend("weather", "weather", { op: "search", q: "London, Canada" }) as { name: string; region: string; country_code: string }[];
    expect(found.map((f) => [f.name, f.region, f.country_code])).toEqual([["London", "Ontario, Canada", "CA"], ["London", "England, United Kingdom", "GB"]]);
    expect(await host.surfaceSend("weather", "weather", { op: "search", q: "Nowhereville" })).toEqual([]);
    const set = await host.surfaceSend("weather", "weather", { op: "set", place: found[0] }) as { title: string; reading: unknown };
    expect(set.title).toBe("London, Ontario, Canada");
    expect(host.written.get("weather")).toMatchObject({ location: "London, Ontario, Canada" });
  });
});
