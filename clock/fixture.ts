// Writes test/shots/clock.json and bar-clock.json, the store screenshots'
// fixtures: the popover and the palette drawn through view.ts at
// fixture-kit's clock (Wed 16 Sep 2026 14:32:00 in Istanbul) with three
// world clocks, a day ringed further on, and the field open; the strip in
// its date forms. `bun run clock/fixture.ts`, then `make shots EXT=clock`.
import { NOW, pinClock, writeFixture } from "../.pal/app/scripts/fixture-kit.ts";
import manifest from "./pal.json" with { type: "json" };
import { addDays, barTitle, isoWeek, longDate, resolveZone, startOfDay } from "./time.ts";
import { render, type ClockState } from "./view.ts";

pinClock();
const T = NOW + 7_000;
const zones = ["Tokyo", "New York", "SF = America/Los_Angeles"].map(resolveZone);
const st = (o: Partial<ClockState> = {}): ClockState => ({ now: T, sel: startOfDay(T), zones, hour12: false, weekStart: 1, field: false, ...o });
const item = (date: "day" | "weekday" | "none", seconds: boolean, o: Partial<ClockState> = {}) => ({
  title: barTitle(T, { date, seconds }, false),
  tooltip: `${longDate(T)}, week ${isoWeek(T)}`,
  menu: { view: render(st(o)) },
});

writeFixture("bar-clock", {
  key: "clock/time",
  title: "Date and Time",
  item: item("day", false),
  states: [
    { id: "seconds", item: item("weekday", true) },
    { id: "day", item: item("day", false, { sel: addDays(T, 9) }) },
    { id: "field", item: item("day", false, { field: true, zones: zones.slice(0, 2) }) },
  ],
  shots: {
    "menubar": { target: "menubar", caption: "On the menu bar: the day and the time, turning on the minute" },
    "menubar-seconds": { target: "menubar", state: "seconds", caption: "The weekday alone and the seconds, two settings of the item" },
    "popover": { target: "menubar", popover: true, caption: "A click opens the time to the second with the date and the week, the month with today filled, and the world clocks with a moon where it is night" },
    "popover-day": { target: "menubar", popover: true, state: "day", caption: "The arrows walk the days and the month's header says how far; Enter opens the day in Calendar" },
    "popover-field": { target: "menubar", popover: true, state: "field", caption: "z adds a world clock: a city, a zone, or a name of your own" },
    "sketchybar": { target: "sketchybar", caption: "On sketchybar: the same label, in place of the stock clock" },
  },
});

writeFixture("clock", {
  palettes: {
    clock: { title: manifest.palettes.clock.title, icon: manifest.icon, view: "view", tree: render(st(), true) },
    // October, a 12-hour clock and a Sunday week, the ring on a day further on.
    later: { title: manifest.palettes.clock.title, icon: manifest.icon, view: "view", tree: render(st({ sel: addDays(T, 23), hour12: true, weekStart: 0 }), true) },
  },
  effects: {},
  shots: {
    "1-clock": { palette: "clock", keys: ["wait:300"], caption: "Clock in the panel, from root search: the time and the world clocks beside the month" },
    "2-later": { palette: "later", keys: ["wait:300"], caption: "A 12-hour clock and weeks from Sunday, two settings; the ring walked into October, the header saying how far" },
  },
});
console.log("wrote test/shots/clock.json and bar-clock.json");
