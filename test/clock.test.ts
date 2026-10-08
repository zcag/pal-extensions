// clock: the pure parts (the strip's title, the 12-hour form, ISO weeks,
// the month grid, months that clamp, the world clocks' lookup and
// offsets) by import, the popover through view.ts, then the extension
// through the harness: the strip on the minute's boundary (and the
// second's with `seconds`), the popover ticking every second while open,
// the days walked and opened in Calendar, a city added through the field.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { BarItem, View, ViewNode } from "../.pal/sdk/src/index.ts";
import { checkView } from "../.pal/sdk/src/view.ts";
import { Host } from "../.pal/host/test/harness.ts";
import { addDays, addMonths, barTitle, dayOfYear, hm, isoWeek, monthGrid, offsetWords, parseDay, relDay, resolveZone, startOfDay, zoneLine, zoneNow } from "../clock/time.ts";
import { actions, render, type ClockState } from "../clock/view.ts";

const E = "clock";
// Tests run in UTC (host/test/README.md, "Dates"): Thu 8 Oct 2026 21:30:07.
const T = Date.UTC(2026, 9, 8, 21, 30, 7);
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

describe("time", () => {
  test("the strip's title by its settings; 24 and 12 hours", () => {
    expect(barTitle(T, { date: "day", seconds: false }, false)).toBe("Thu 8 Oct 21:30");
    expect(barTitle(T, { date: "weekday", seconds: true }, false)).toBe("Thu 21:30:07");
    expect(barTitle(T, { date: "none", seconds: false }, true)).toBe("9:30 PM");
    expect([hm(0, 5, 0, true), hm(12, 0, 0, true), hm(9, 7, 3, false, true)]).toEqual(["12:05 AM", "12:00 PM", "09:07:03"]);
  });

  test("ISO weeks across the year's edges, the day of the year, the relative day", () => {
    expect(isoWeek(T)).toBe(41);
    expect(isoWeek(day(2026, 1, 1))).toBe(1);
    expect(isoWeek(day(2027, 1, 1))).toBe(53); // a Friday: 2026's 53rd week
    expect(isoWeek(day(2027, 1, 4))).toBe(1);
    expect(isoWeek(day(2025, 12, 29))).toBe(1); // a Monday in 2026's first week
    expect(dayOfYear(T)).toEqual({ day: 281, of: 365 });
    expect(dayOfYear(day(2028, 12, 31))).toEqual({ day: 366, of: 366 });
    expect([relDay(T, T), relDay(addDays(T, 1), T), relDay(addDays(T, -1), T), relDay(addDays(T, 9), T), relDay(addDays(T, -3), T)]).toEqual(["today", "tomorrow", "yesterday", "in 9 days", "3 days ago"]);
  });

  test("the month grid: six weeks from the week's first day, Monday or Sunday; months clamp", () => {
    const mon = monthGrid(T, 1);
    expect(mon).toHaveLength(6);
    expect(mon[0][0]).toBe(day(2026, 9, 28));
    expect(mon[0][3]).toBe(day(2026, 10, 1));
    expect(mon[5][6]).toBe(day(2026, 11, 8));
    expect(monthGrid(T, 0)[0][0]).toBe(day(2026, 9, 27));
    expect(addMonths(day(2026, 1, 31), 1)).toBe(day(2026, 2, 28));
    expect(addMonths(day(2026, 3, 31), -1)).toBe(day(2026, 2, 28));
    expect(addMonths(day(2026, 12, 15), 1)).toBe(day(2027, 1, 15));
    expect([parseDay("2026-10-10"), parseDay("2026-02-30"), parseDay("soon")]).toEqual([day(2026, 10, 10), undefined, undefined]);
  });

  test("world clocks: a city, a zone, a name people type, a label of one's own, a miss; how each is kept", () => {
    expect(resolveZone("Tokyo")).toEqual({ label: "Tokyo", zone: "Asia/Tokyo" });
    expect(resolveZone("new york")).toEqual({ label: "New York", zone: "America/New_York" });
    expect(resolveZone("America/Argentina/Buenos_Aires")).toEqual({ label: "Buenos Aires", zone: "America/Argentina/Buenos_Aires" });
    expect(resolveZone("SF")).toEqual({ label: "SF", zone: "America/Los_Angeles" });
    expect(resolveZone("bangalore")).toEqual({ label: "Bangalore", zone: "Asia/Kolkata" });
    expect(resolveZone("Office = Europe/London")).toEqual({ label: "Office", zone: "Europe/London" });
    expect(resolveZone("utc")).toEqual({ label: "UTC", zone: "UTC" });
    expect(resolveZone("Atlantis")).toEqual({ label: "Atlantis", error: "No time zone called Atlantis" });
    expect([zoneLine({ label: "Tokyo", zone: "Asia/Tokyo" }), zoneLine({ label: "SF", zone: "America/Los_Angeles" })]).toEqual(["Asia/Tokyo", "SF = America/Los_Angeles"]);
  });

  test("the time there, the offset from here, the date turned, night", () => {
    expect(zoneNow(T, "Asia/Tokyo", false)).toEqual({ time: "06:30", offset: "+9h", day: "tomorrow", night: false, hour: 6 });
    expect(zoneNow(T, "America/Los_Angeles", false)).toEqual({ time: "14:30", offset: "−7h", night: false, hour: 14 });
    expect(zoneNow(T, "Asia/Kolkata", true)).toEqual({ time: "3:00 AM", offset: "+5h 30m", day: "tomorrow", night: true, hour: 3 });
    expect(zoneNow(Date.UTC(2026, 9, 8, 1), "America/Los_Angeles", false)).toMatchObject({ time: "18:00", day: "yesterday", night: true });
    expect([offsetWords(0), offsetWords(-45), offsetWords(120)]).toEqual(["same time", "−45m", "+2h"]);
  });
});

const st = (o: Partial<ClockState> = {}): ClockState => ({ now: T, sel: startOfDay(T), zones: [], hour12: false, weekStart: 1, field: false, ...o });
const all = (n: ViewNode): ViewNode[] => [n, ...("children" in n && n.children ? n.children.flatMap(all) : [])];
const texts = (v: View) => all(v.tree).flatMap((n) => (n.type === "text" ? [n.value] : n.type === "tile" ? [n.text ?? ""] : []));
const cell = (v: View, iso: string) => all(v.tree).find((n) => n.key === iso) as Extract<ViewNode, { type: "stack" }>;

describe("the popover", () => {
  test("the time with its seconds, the date, the week and the day of the year; today filled and ringed", () => {
    const v = checkView(render(st()));
    expect(texts(v)).toEqual(expect.arrayContaining(["21:30", ":07", "Thursday", "8 October 2026", "Week 41 · day 281 of 365", "October 2026"]));
    expect(cell(v, "2026-10-08")).toMatchObject({ selected: true, action: "day:2026-10-08", children: [{ type: "tile", text: "8", color: "violet", fill: "solid" }] });
    expect(cell(v, "2026-10-09").children).toEqual([expect.objectContaining({ type: "text", value: "9" })]);
    expect((cell(v, "2026-10-10").children![0] as { color?: string }).color).toBe("muted"); // a Saturday
    expect((cell(v, "2026-09-28").children![0] as { color?: string }).color).toBe("faint"); // September's
    expect(v).toMatchObject({ id: "clock", title: "UTC", keys: "actions" });
    expect(v.input).toBeUndefined();
  });

  test("another day ringed says where it is; Enter opens it; a hidden action per cell for the clicks", () => {
    const v = checkView(render(st({ sel: day(2026, 10, 17) })));
    expect(texts(v)).toContain("Sat 17 Oct · in 9 days · week 42");
    expect(cell(v, "2026-10-17").selected).toBe(true);
    expect(cell(v, "2026-10-08").selected).toBeUndefined();
    expect(texts(checkView(render(st())))).not.toContain("Thu 8 Oct · today · week 41");
    const a = actions(st({ sel: day(2026, 10, 17) }));
    expect(a[0]).toEqual({ id: "open", title: "Open Sat 17 Oct in Calendar" });
    expect(a.filter((x) => x.id.startsWith("day:") && x.hidden)).toHaveLength(42);
    expect(a.find((x) => x.id === "prev")!.shortcut).toEqual(["[", "shift+up"]);
  });

  test("world clocks: a row each with the time, offset and the date turned; a bad line says why; none offers z", () => {
    const v = checkView(render(st({ zones: [resolveZone("Tokyo"), resolveZone("SF"), resolveZone("Atlantis")] })));
    expect(texts(v)).toEqual(expect.arrayContaining(["Tokyo", "06:30", "+9h · tomorrow", "SF", "14:30", "−7h", "No time zone called Atlantis"]));
    expect(texts(checkView(render(st())))).toContain("No world clocks yet");
  });

  test("the panel: the time and the world clocks in a column beside the month", () => {
    const v = checkView(render(st({ zones: [resolveZone("Tokyo")] }), true));
    expect(v.tree).toMatchObject({ type: "stack", direction: "row", key: "panel" });
    expect((v.tree as Extract<ViewNode, { type: "stack" }>).children.map((n) => n.key)).toEqual(["left", "d2", "cal"]);
    expect(texts(v)).toEqual(expect.arrayContaining(["21:30", "Tokyo", "October 2026"]));
  });

  test("z: the search row is a field for a city, Enter adds, Escape closes", () => {
    const v = checkView(render(st({ field: true })));
    expect(v.input).toEqual({ placeholder: "Tokyo, New York, Europe/Berlin", submit: "add", cancel: "cancel" });
    expect(v.actions[0].id).toBe("add");
    expect(v.title).toBe("Add a world clock");
  });
});

describe("the extension", () => {
  let h: Host;
  beforeAll(async () => { h = await Host.bundled({ only: [E] }); });
  afterAll(() => h.kill());
  const title = (t: number, seconds = false) => barTitle(t, { date: "day", seconds }, false);

  test("meta: the palette, the bar item with its settings and mocks, calendar suggested", () => {
    const l = h.loaded().find((l) => l.extension === E)!;
    expect(l.palettes.map((p) => [p.name, p.title])).toEqual([["clock", "Clock"]]);
    expect(l.bar).toEqual([expect.objectContaining({ id: "time", title: "Date and Time", refresh: { every: 300, on: ["wake"] }, source: true })]);
    expect(h.manifests.get(E)!.bar!.time!.settings!.map((s) => s.id)).toEqual(["date", "seconds"]);
    expect(h.manifests.get(E)!.suggests).toEqual(["calendar"]);
  });

  /** The pushes made while `step` runs: advance resolves once the timers ran, so the push may already be in. */
  const pushed = async <T = BarItem>(step: () => Promise<unknown>, of: () => T[] = () => h.updates(E, "time") as T[]) => {
    const n = of().length;
    await step();
    await h.until(() => of().length > n, 2000, "a push");
    return of().slice(n);
  };

  test("the strip: the date and time, then a push on the minute's boundary and none before it", async () => {
    const item = await h.render(E, "time", { reason: "load" });
    expect(item).toMatchObject({ title: title(h.now()), tooltip: expect.stringMatching(/, week \d+$/), menu: { view: { id: "clock" } } });
    const to = 60_000 - (h.now() % 60_000);
    const n = h.updates(E, "time").length;
    if (to > 200) { await h.advance(to - 200); expect(h.updates(E, "time")).toHaveLength(n); }
    const [p] = await pushed(() => h.advance(300));
    expect(p.title).toBe(title(h.now()));
  });

  test("seconds: the strip ticks every second", async () => {
    await h.render(E, "time", { reason: "settings", settings: { date: "day", seconds: true } });
    const [a] = await pushed(() => h.advance(1000));
    const [b] = await pushed(() => h.advance(1000));
    expect(a.title).toMatch(/\d\d:\d\d:\d\d$/);
    expect(b.title).not.toBe(a.title);
    await h.render(E, "time", { reason: "settings", settings: { date: "day", seconds: false } });
  });

  test("the popover ticks every second while open and stops when it closes", async () => {
    const ticks = () => h.viewUpdates(E, { bar: "time" });
    h.viewShown(E, { bar: "time" }, "clock", true);
    await h.until(async () => (await h.timers()).some((t) => t <= 1000), 2000, "a second's tick armed");
    const [u] = await pushed(() => h.advance(1000), ticks);
    expect(JSON.stringify(u.spec)).toContain("Week ");
    await pushed(() => h.advance(1000), ticks);
    h.viewHidden(E, { bar: "time" }, "clock", true);
    await h.until(async () => !(await h.timers()).some((t) => t <= 1000), 2000, "back to the minute");
    const n = ticks().length;
    await h.advance(5000);
    expect(ticks()).toHaveLength(n);
  });

  test("walking the days and months, back to today, opening a day in Calendar, copying the date", async () => {
    const today = startOfDay(h.now());
    const ring = async () => (await h.render(E, "time", { reason: "open" })).menu as { view: View };
    expect(await h.barAction(E, "time", "right")).toEqual({ keep: true });
    await h.barAction(E, "time", "down");
    const sel = addDays(today, 8);
    expect(cell((await ring()).view, iso(sel)).selected).toBe(true);
    expect(await h.barAction(E, "time", "open")).toEqual({ push: { extension: "calendar", palette: "today", args: { day: iso(sel) }, title: expect.any(String) } });
    expect(await h.barAction(E, "time", "copy")).toEqual({ copy: iso(sel), hud: `Copied ${iso(sel)}` });
    await h.barAction(E, "time", "next");
    expect((await ring()).view.actions[0].title).toContain(String(new Date(addMonths(sel, 1)).getDate()));
    await h.barAction(E, "time", "today");
    expect(cell((await ring()).view, iso(today)).selected).toBe(true);
    expect(await h.barAction(E, "time", "day:2026-12-25")).toMatchObject({ push: { extension: "calendar", palette: "today", args: { day: "2026-12-25" }, title: "Fri 25 Dec" } });
  });

  test("z then a city: written to the setting as its zone; a miss is a toast; the same city twice is said", async () => {
    await h.barAction(E, "time", "zone");
    expect(((await h.render(E, "time", { reason: "open" })).menu as { view: View }).view.input).toBeDefined();
    expect(await h.barAction(E, "time", "add", { reason: "open", values: { input: "Atlantis" } })).toMatchObject({ keep: true, toast: { title: "No time zone called Atlantis", style: "failure" } });
    expect(await h.barAction(E, "time", "add", { reason: "open", values: { input: "Tokyo" } })).toEqual({ keep: true, hud: "Added Tokyo" });
    expect(h.written.get(E)).toEqual({ zones: ["Asia/Tokyo"] });
    await h.barAction(E, "time", "zone");
    expect(await h.barAction(E, "time", "add", { reason: "open", values: { input: "tokyo" } })).toEqual({ keep: true, hud: "Tokyo is already there" });
    const v = ((await h.render(E, "time", { reason: "open" })).menu as { view: View }).view;
    expect(v.input).toBeUndefined();
    expect(texts(v)).toContain("Tokyo");
  });

  test("the palette: the same view in the panel; a move answers the new tree, Enter pushes the day", async () => {
    const v = await h.request<View>("view", { extension: E, palette: "clock" });
    expect(v).toMatchObject({ id: "clock", keys: "actions" });
    const r = await h.pick(E, "clock", "clock", "left");
    expect((r.view as View).tree).toBeDefined();
    expect(await h.pick(E, "clock", "clock", "today")).toMatchObject({ view: { id: "clock" } });
    expect(await h.pick(E, "clock", "clock", "open")).toMatchObject({ push: { extension: "calendar", palette: "today", title: "Today" } });
  });
});

const iso = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
