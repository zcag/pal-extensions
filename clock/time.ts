// The pure side of the clock: a moment written the way the settings ask
// (24 or 12 hours, seconds), the strip's title, the month grid, the ISO
// week, and the world clocks (a city or a zone resolved to an IANA zone,
// its wall time, its offset from here and whether it is already
// tomorrow there). Nothing here touches the core; the tests import it.
import { dayName, isoDay } from "@zcag/pal";

const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type Settings = { zones: string[]; hour12: boolean; week_start: "monday" | "sunday" };
export type BarSettings = { date: "day" | "weekday" | "none"; seconds: boolean };
/** A world clock as the setting resolved it: the label it shows and its zone, or why the line could not be read. */
export type Zone = { label: string; zone: string } | { label: string; error: string };

const pad = (n: number) => String(n).padStart(2, "0");

/** `14:05`, or `2:05 PM` on a 12-hour clock; `seconds` adds `:07`. */
export function hm(h: number, m: number, s: number, hour12: boolean, seconds = false): string {
  const sec = seconds ? `:${pad(s)}` : "";
  if (!hour12) return `${pad(h)}:${pad(m)}${sec}`;
  return `${h % 12 || 12}:${pad(m)}${sec} ${h < 12 ? "AM" : "PM"}`;
}

/** The local wall time of `t` as `hm` writes it. */
export const timeOf = (t: number, hour12: boolean, seconds = false): string => { const d = new Date(t); return hm(d.getHours(), d.getMinutes(), d.getSeconds(), hour12, seconds); };

/** The strip's title: `Wed 8 Oct 14:05` with the date the item's setting asks for. */
export function barTitle(t: number, b: BarSettings, hour12: boolean): string {
  const date = b.date === "none" ? "" : b.date === "weekday" ? dayName(t).split(" ")[0] : dayName(t);
  return [date, timeOf(t, hour12, b.seconds)].filter(Boolean).join(" ");
}

/** `Wednesday 8 October 2026`. */
export const longDate = (t: number): string => { const d = new Date(t); return `${DAY_LONG[d.getDay()]} ${d.getDate()} ${MON_LONG[d.getMonth()]} ${d.getFullYear()}`; };

// ---- days ----------------------------------------------------------------------------

export const startOfDay = (t: number): number => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** Midnight `n` days after `t`'s day, by the calendar (a DST day is 23 or 25 hours). */
export const addDays = (t: number, n: number): number => { const d = new Date(startOfDay(t)); d.setDate(d.getDate() + n); return d.getTime(); };
/** Whole calendar days from `a`'s day to `b`'s. */
export const daysBetween = (a: number, b: number): number => Math.round((startOfDay(b) - startOfDay(a)) / 86_400_000);
/** The same day of the month `n` months on, clamped to the month's last day (31 Jan + 1 is 28 or 29 Feb). */
export function addMonths(t: number, n: number): number {
  const d = new Date(startOfDay(t));
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.getTime();
}
/** A day as `YYYY-MM-DD` read back to its local midnight, or undefined. */
export function parseDay(s: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isoDay(d) === s ? d.getTime() : undefined;
}

/** The ISO 8601 week of `t` (weeks start on Monday; week 1 holds the year's first Thursday). */
export function isoWeek(t: number): number {
  const thu = new Date(startOfDay(t));
  thu.setDate(thu.getDate() + 3 - ((thu.getDay() + 6) % 7));
  return 1 + Math.floor(daysBetween(new Date(thu.getFullYear(), 0, 1).getTime(), thu.getTime()) / 7);
}
/** The day of the year, 1 on 1 January, and how many the year has. */
export function dayOfYear(t: number): { day: number; of: number } {
  const y = new Date(t).getFullYear();
  return { day: daysBetween(new Date(y, 0, 1).getTime(), t) + 1, of: daysBetween(new Date(y, 0, 1).getTime(), new Date(y + 1, 0, 1).getTime()) };
}

/** `today`, `tomorrow`, `yesterday`, `in 12 days`, `3 days ago`: where `day` is from `now`. */
export function relDay(day: number, now: number): string {
  const n = daysBetween(now, day);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/** The six weeks the month grid of `t`'s month shows, each seven local midnights, from the week's first day. */
export function monthGrid(t: number, weekStart: number): number[][] {
  const d = new Date(t);
  const first = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const start = addDays(first, -((new Date(first).getDay() - weekStart + 7) % 7));
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
}

// ---- world clocks --------------------------------------------------------------------

/** Names people type that are not the city in a zone's id. */
const ALIASES: Record<string, string> = {
  "san francisco": "America/Los_Angeles", sf: "America/Los_Angeles", "silicon valley": "America/Los_Angeles", seattle: "America/Los_Angeles",
  nyc: "America/New_York", boston: "America/New_York", washington: "America/New_York", miami: "America/New_York",
  austin: "America/Chicago", dallas: "America/Chicago", houston: "America/Chicago",
  beijing: "Asia/Shanghai", "hong kong": "Asia/Hong_Kong", delhi: "Asia/Kolkata", "new delhi": "Asia/Kolkata", mumbai: "Asia/Kolkata", bangalore: "Asia/Kolkata", bengaluru: "Asia/Kolkata",
  ankara: "Europe/Istanbul", izmir: "Europe/Istanbul", munich: "Europe/Berlin", barcelona: "Europe/Madrid", milan: "Europe/Rome", "st petersburg": "Europe/Moscow",
  utc: "UTC", gmt: "UTC",
};

const valid = (zone: string): boolean => { try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return true; } catch { return false; } };
/** `America/New_York` as a label: `New York`. */
export const cityOf = (zone: string): string => zone.split("/").pop()!.replace(/_/g, " ");

/**
 * One line of the `zones` setting as a world clock: `Asia/Tokyo` (the
 * label is the city), `Tokyo` (a city looked up among the zones, or a
 * name from `ALIASES`), or `Office = Europe/London` (a label of one's
 * own). Case and spaces as typed.
 */
export function resolveZone(line: string): Zone {
  const eq = line.indexOf("=");
  const label = eq >= 0 ? line.slice(0, eq).trim() : "";
  const raw = (eq >= 0 ? line.slice(eq + 1) : line).trim();
  const zone = findZone(raw);
  if (!zone) return { label: label || raw, error: `No time zone called ${raw}` };
  return { label: label || (ALIASES[raw.toLowerCase()] || zone === "UTC" ? titleCase(raw) : cityOf(zone)), zone };
}

const titleCase = (s: string): string => (s.length <= 3 ? s.toUpperCase() : s.replace(/\b\w/g, (c) => c.toUpperCase()));

function findZone(raw: string): string | undefined {
  if (!raw) return;
  const alias = ALIASES[raw.toLowerCase()];
  if (alias) return alias;
  if (raw.includes("/") && valid(raw)) return raw;
  const key = raw.toLowerCase().replace(/\s+/g, "_");
  const all = Intl.supportedValuesOf("timeZone");
  return all.find((z) => z.toLowerCase().split("/").pop() === key) ?? (valid(raw) ? raw : undefined);
}

/** How a line is kept in the setting once resolved: the bare zone when its city is the label, else `label = zone`. */
export const zoneLine = (z: { label: string; zone: string }): string => (cityOf(z.zone) === z.label ? z.zone : `${z.label} = ${z.zone}`);

const formats = new Map<string, Intl.DateTimeFormat>();
/** The wall clock of `t` in `zone`. */
export function wall(t: number, zone: string): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  let f = formats.get(zone);
  if (!f) formats.set(zone, (f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })));
  const p = Object.fromEntries(f.formatToParts(t).map((x) => [x.type, Number(x.value)]));
  return { y: p.year, mo: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
}

/** Minutes `zone` is ahead of this machine's clock at `t` (negative behind). */
export function offsetFromHere(t: number, zone: string): number {
  const w = wall(t, zone);
  const there = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi) / 60_000;
  const d = new Date(t);
  const here = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()) / 60_000;
  return Math.round(there - here);
}

/** `+3h`, `−7h`, `+5h 30m`, `same time`. */
export function offsetWords(min: number): string {
  if (min === 0) return "same time";
  const a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
  return `${min > 0 ? "+" : "−"}${h ? `${h}h` : ""}${h && m ? " " : ""}${m ? `${m}m` : ""}`;
}

/** What a world clock row shows at `t`: the time there, the offset, `tomorrow`/`yesterday` when the date differs, and whether it is night there (before 6, from 18). */
export function zoneNow(t: number, zone: string, hour12: boolean): { time: string; offset: string; day?: "tomorrow" | "yesterday"; night: boolean; hour: number } {
  const w = wall(t, zone);
  const d = new Date(t);
  const diff = Math.round((Date.UTC(w.y, w.mo - 1, w.d) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86_400_000);
  return { time: hm(w.h, w.mi, w.s, hour12), offset: offsetWords(offsetFromHere(t, zone)), ...(diff > 0 ? { day: "tomorrow" as const } : diff < 0 ? { day: "yesterday" as const } : {}), night: w.h < 6 || w.h >= 18, hour: w.h };
}
