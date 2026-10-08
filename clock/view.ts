// The popover (and the Clock palette, the same tree) as a `View`, pure:
// index.ts builds the state, the tests and the fixture render made-up
// ones through the same function. From the top: the time large with the
// seconds beside it and the date, week and day of the year across from
// it; the month with the selected day ringed and today filled, a line
// saying where the selected day is from today; the world clocks, one
// row per city with a sun or a moon, the time there, the offset and
// `tomorrow` when the date has turned; the key hints. Enter (or a click
// on a day) opens that day in Calendar.
import { POPOVER_W, column, dayName, isoDay, keyHint, keycap, row, text, type Action, type View, type ViewNode } from "@zcag/pal";
import { cityOf, dayOfYear, isoWeek, longDate, monthGrid, relDay, startOfDay, timeOf, zoneNow, type Zone } from "./time.ts";

export type ClockState = {
  now: number;
  /** The ringed day, a local midnight. */
  sel: number;
  zones: Zone[];
  hour12: boolean;
  /** 1 Monday, 0 Sunday. */
  weekStart: number;
  /** The search row is a field for a city to add. */
  field: boolean;
};

/** nf-md-clock_outline: the extension's tile and the empty strip's glyph. */
export const GLYPH = "\u{f0150}";
const SUN = "\u{f0599}", MOON = "\u{f0594}";
const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const INNER_W = POPOVER_W - 24;
/** The panel's left column, beside the month. */
const LEFT_W = 300;
/** Seven cells of 48 with 6 gaps of 4 is 360, inside the 372. */
const CELL_W = 48, CELL_H = 25, GAP = 4;
const GRID_W = 7 * CELL_W + 6 * GAP;

/** The day a click on a cell opens: one hidden action per cell of the grid. */
export const dayAction = (day: number) => `day:${isoDay(day)}`;

function header(st: ClockState, wide: boolean): ViewNode {
  const d = new Date(st.now);
  const { day, of } = dayOfYear(st.now);
  const [weekday, ...rest] = longDate(st.now).split(" ");
  const time = row([
    text(timeOf(st.now, st.hour12), { style: "headline", key: "time" }),
    text(`:${String(d.getSeconds()).padStart(2, "0")}`, { style: "number", color: "faint", size: "lg", key: "sec" }),
  ], { key: "clock", gap: 0, align: "end" });
  const align = wide ? "start" : "end";
  const when = column([
    text(weekday, { weight: "semibold", size: "sm", align, key: "weekday" }),
    text(rest.join(" "), { style: "muted", size: "sm", align, key: "date" }),
    text(`Week ${isoWeek(st.now)} · day ${day} of ${of}`, { color: "faint", size: "xs", align, key: "week" }),
  ], { key: "when", gap: 0, align });
  // The popover puts the date across from the time; the panel's narrower left column under it.
  return wide ? column([time, when], { key: "head", gap: 1, width: LEFT_W }) : row([time, { type: "spacer" }, when], { key: "head", gap: 2, align: "center", width: INNER_W });
}

function month(st: ClockState): ViewNode {
  const s = new Date(st.sel);
  const today = startOfDay(st.now);
  const weekdays = Array.from({ length: 7 }, (_, i) => text(WD[(i + st.weekStart) % 7], { size: "xs", color: "faint", align: "center", width: CELL_W, key: `wd${i}` }));
  // Numbers, not boxes: today on an accent chip, the weekend muted, the days either side faint; the ringed day is the cursor.
  const weeks = monthGrid(st.sel, st.weekStart).map((week, w) => row(week.map((day): ViewNode => {
    const d = new Date(day);
    const inMonth = d.getMonth() === s.getMonth();
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const num: ViewNode = day === today
      ? { type: "tile", key: "n", width: CELL_W - 14, height: CELL_H - 3, text: String(d.getDate()), color: "violet", fill: "solid" }
      : text(String(d.getDate()), { style: "number", size: "sm", align: "center", width: CELL_W, key: "n", ...(!inMonth ? { color: "faint" as const } : weekend ? { color: "muted" as const } : {}) });
    return { type: "stack", direction: "row", align: "center", justify: "center", width: CELL_W, height: CELL_H, radius: true, key: isoDay(day), action: dayAction(day), ...(day === st.sel && { selected: true }), children: [num] };
  }), { key: `w${w}`, gap: 1 }));
  const rel = relDay(st.sel, st.now);
  return column([
    row([
      text(`${MON[s.getMonth()]} ${s.getFullYear()}`, { weight: "semibold", key: "month" }),
      ...(st.sel !== today ? [text(`${dayName(st.sel)} · ${rel} · week ${isoWeek(st.sel)}`, { size: "xs", color: "faint", key: "sel" })] : []),
      { type: "spacer" },
      keycap("[", "prev"), keycap("]", "next"),
    ], { key: "month-head", gap: 2, width: GRID_W, minHeight: 24 }),
    row(weekdays, { key: "weekdays", gap: 1 }),
    column(weeks, { key: "weeks", gap: 0 }),
  ], { key: "cal", gap: 1, align: "center" });
}

const GLYPH_W = 20, TIME_W = 72, OFF_W = 112;

function zoneRow(z: Zone, st: ClockState, i: number, w: number): ViewNode {
  if ("error" in z) return row([text("\u{f0026}", { style: "glyph", size: "sm", color: "amber", width: GLYPH_W, key: "g" }), text(z.error, { style: "muted", size: "sm", key: "err", width: w - GLYPH_W - 4 })], { key: `z${i}`, gap: 1, minHeight: 22 });
  const n = zoneNow(st.now, z.zone, st.hour12);
  return row([
    text(n.night ? MOON : SUN, { style: "glyph", size: "sm", color: n.night ? "violet" : "amber", width: GLYPH_W, key: "g" }),
    text(z.label, { size: "sm", weight: "medium", width: w - GLYPH_W - TIME_W - OFF_W - 12, key: "name" }),
    text(n.time, { style: "number", size: "sm", weight: "semibold", width: TIME_W, align: "end", key: "time" }),
    text(n.day ? `${n.offset} · ${n.day}` : n.offset, { size: "xs", color: n.day ? "muted" : "faint", width: OFF_W, align: "end", key: "off" }),
  ], { key: `z${i}`, gap: 1, minHeight: 22 });
}

function zones(st: ClockState, w: number): ViewNode {
  if (!st.zones.length) {
    return row([text(SUN, { style: "glyph", size: "sm", color: "faint", width: GLYPH_W, key: "g" }), text("No world clocks yet", { style: "muted", size: "sm", key: "none" }), { type: "spacer" }, ...keyHint("z", "add a city", { action: "zone" })], { key: "zones-none", gap: 1, width: w, minHeight: 24 });
  }
  return column(st.zones.map((z, i) => zoneRow(z, st, i, w)), { key: "zones", gap: 0, width: w });
}

function hints(st: ClockState, wide: boolean): ViewNode {
  if (st.field) return row([...keyHint("enter", "add", { action: "add" }), ...keyHint("escape", "close", { action: "cancel" })], { key: "hints", gap: 1, minHeight: 22 });
  return row([
    ...keyHint("enter", "open day", { action: "open" }),
    ...keyHint("t", "today", { action: "today" }),
    ...(wide ? [] : keyHint("c", "copy date", { action: "copy" })),
    ...(st.zones.length ? keyHint("z", "add city", { action: "zone" }) : []),
  ], { key: "hints", gap: 1, minHeight: 22 });
}

/** Every action the view answers to; the first is Enter. */
export function actions(st: ClockState): Action[] {
  const sel = st.sel === startOfDay(st.now) ? "today" : dayName(st.sel);
  const acts: Action[] = st.field
    ? [{ id: "add", title: "Add the city" }, { id: "cancel", title: "Close the field" }]
    : [{ id: "open", title: `Open ${sel} in Calendar` }];
  acts.push(
    { id: "left", title: "Day before", shortcut: "left", hidden: true },
    { id: "right", title: "Day after", shortcut: "right", hidden: true },
    { id: "up", title: "Week before", shortcut: "up", hidden: true },
    { id: "down", title: "Week after", shortcut: "down", hidden: true },
    { id: "prev", title: "Month before", shortcut: ["[", "shift+up"] },
    { id: "next", title: "Month after", shortcut: ["]", "shift+down"] },
    { id: "today", title: "Back to today", shortcut: "t" },
    { id: "copy", title: `Copy ${sel === "today" ? "today's date" : sel}`, shortcut: "c" },
  );
  acts.push({ id: "zone", title: "Add a world clock…", shortcut: "z" });
  for (const week of monthGrid(st.sel, st.weekStart)) for (const day of week) acts.push({ id: dayAction(day), title: `Open ${dayName(day)} in Calendar`, hidden: true });
  return acts;
}

/** This machine's zone as the title says it: `Istanbul · UTC+3`. */
export function here(t: number): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const off = -new Date(t).getTimezoneOffset();
  const utc = off === 0 ? "UTC" : `UTC${off > 0 ? "+" : "−"}${Math.floor(Math.abs(off) / 60)}${Math.abs(off) % 60 ? `:${String(Math.abs(off) % 60).padStart(2, "0")}` : ""}`;
  return zone === "UTC" || zone === "Etc/UTC" ? utc : `${cityOf(zone)} · ${utc}`;
}

/** The view; `wide` in the panel (720 px: the time and the world clocks beside the month), else the popover's 420 px column. */
export function render(st: ClockState, wide = false): View {
  const help = st.field ? [text("A city or a zone; Office = Europe/London names one yourself", { style: "muted", size: "xs", key: "help", width: wide ? LEFT_W : INNER_W })] : [];
  const tree = wide
    ? row([
      column([header(st, true), { type: "divider", key: "d1" }, zones(st, LEFT_W), ...help, { type: "spacer" }, hints(st, true)], { key: "left", gap: 2, width: LEFT_W, align: "start" }),
      { type: "divider", key: "d2" },
      month(st),
    ], { key: "panel", padding: 3, gap: 4, align: "stretch" })
    : column([header(st, false), { type: "divider", key: "d1" }, month(st), { type: "divider", key: "d2" }, zones(st, INNER_W), ...help, hints(st, false)], { key: "popover", padding: 3, gap: 2 });
  return {
    id: "clock",
    title: st.field ? "Add a world clock" : here(st.now),
    tree,
    actions: actions(st),
    keys: "actions",
    ...(st.field && { input: { placeholder: "Tokyo, New York, Europe/Berlin", submit: "add", cancel: "cancel" } }),
  };
}

