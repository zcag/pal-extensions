// Weather's page. It keeps no weather of its own: the extension answers
// `open` (the reading it holds, at once), `refresh`, `search` and `set`,
// and the page draws the answer over the sky (sky.ts).
//
// Keys: ← → walk the hours (shift: three at a time), ↑ ↓ or 1–7 pick a
// day (its hours fill the row), N back to now, L or / a place, O or Enter
// the map, R refresh. An hour or a day is a click, and the pointer walks
// the hours.
import type { SurfaceKit } from "@zcag/pal";
import { sunArt, weatherArt } from "../art.ts";
import { deg, fmt, isWet, lookOf, num, startHour, str, summary, tempColor, uvWord, type Kind, type Reading } from "../model.ts";
import type { Found, Reply } from "../index.ts";
import { Sky, type SkyTarget } from "./sky.ts";

declare const pal: SurfaceKit;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dateOf = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
const minutes = (iso: string | undefined) => iso ? Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)) : undefined;
/** Hours the row holds for today: from now into tomorrow, as Apple's does. */
const TODAY_HOURS = 26;
const COL_W = 52;

const sky = new Sky($<HTMLCanvasElement>("sky"), $<HTMLCanvasElement>("fx"));
sky.bodies = false;
let reply: Reply | undefined;
let day = 0;
let cursor = -1;
let first = 0;
let shownTemp: number | undefined;

const r = () => reply?.reading;
const now = () => r() ? startHour(r()!) : -1;
const hourCount = () => r()?.hourly?.time?.length ?? 0;
const dayCount = () => Math.min(7, r()?.daily?.time?.length ?? 0);
const dayKey = (d: number) => str(r()?.daily?.time?.[d]);
const hourOf = (d: number, h: number) => { const key = dayKey(d); return key ? (r()?.hourly?.time ?? []).findIndex((t) => str(t)?.startsWith(`${key}T${String(h).padStart(2, "0")}`)) : -1; };
const atNow = () => day === 0 && cursor === now();
const dayName = (d: number) => d === 0 ? "Today" : d === 1 ? "Tomorrow" : WEEKDAY[dateOf(dayKey(d)!).getDay()];
/** The hours the row shows for the chosen day. */
function span(): [number, number] {
  if (day === 0) { const a = now(); return [a, Math.min(hourCount(), a + TODAY_HOURS)]; }
  const a = hourOf(day, 0);
  return a < 0 ? [0, 0] : [a, Math.min(hourCount(), a + 24)];
}

// ---- the sky ------------------------------------------------------------------

const KIND: Record<Kind, Partial<SkyTarget> & { cover: number }> = {
  clear: { cover: 0.12 }, partly: { cover: 0.42 }, cloudy: { cover: 0.9 }, fog: { cover: 0.5, fog: 1 },
  drizzle: { cover: 0.85, rain: 0.28 }, rain: { cover: 0.92, rain: 0.62 }, heavy: { cover: 1, rain: 1 },
  sleet: { cover: 0.9, rain: 0.35, snow: 0.45 }, snow: { cover: 0.88, snow: 0.75 },
  storm: { cover: 1, rain: 0.85, storm: 1 }, hail: { cover: 1, rain: 0.7, storm: 1, snow: 0.2 },
};
/** Where the sun is at a moment of a day: up between that day's sunrise and sunset, the moon's turn between. */
function sunAt(x: Reading, iso: string): { sun: number; arc: number } {
  const d = x.daily, i = (d?.time ?? []).findIndex((t) => str(t) === iso.slice(0, 10));
  const rise = minutes(str(d?.sunrise?.[i])) ?? 6 * 60, set = minutes(str(d?.sunset?.[i])) ?? 18 * 60;
  const m = minutes(iso) ?? 12 * 60;
  if (m >= rise && m <= set) { const p = (m - rise) / (set - rise); return { sun: Math.sin(Math.PI * p) * 1.05 - 0.02, arc: p }; }
  const night = 24 * 60 - (set - rise), q = ((m - set + 24 * 60) % (24 * 60)) / night;
  return { sun: -Math.sin(Math.PI * q) * 0.9 - 0.04, arc: q };
}
/** The sky at hourly index `i`, or the reading now for -1. */
function skyFor(i: number): SkyTarget {
  const x = r()!, h = x.hourly, live = i < 0;
  const code = live ? x.current.weather_code : num(h?.weather_code?.[i]);
  const k = KIND[lookOf(code)[3]];
  const cloud = live ? num(x.current.cloud_cover) : num(h?.cloud_cover?.[i]);
  const cover = cloud === undefined ? k.cover : Math.max((cloud / 100) * 0.95, k.cover * 0.85);
  const wind = (live ? num(x.current.wind_speed_10m) : num(h?.wind_speed_10m?.[i])) ?? 10;
  const iso = (live ? x.current.time : str(h?.time?.[i])) ?? `${dayKey(0)}T12:00`;
  const heavy = [65, 75, 82, 86].includes(code ?? 0) ? 1.15 : 1;
  return { ...sunAt(x, iso), cover, rain: (k.rain ?? 0) * heavy, snow: (k.snow ?? 0) * heavy, fog: k.fog ?? 0, storm: k.storm ?? 0, wind };
}
const nightAt = (i: number) => r()?.hourly?.is_day?.[i] === 0;
/** The photograph for a kind of sky at a time of day (photos/, credits in photos/credits.json). */
function slot(kind: Kind, night: boolean, sun: number, arc: number): string {
  const n = night ? "night" : "day";
  switch (kind) {
    case "clear": return night ? "clear-night" : sun < 0.3 ? (arc < 0.5 ? "clear-morning" : "clear-golden") : "clear-day";
    case "partly": return `partly-${n}`;
    case "cloudy": return `overcast-${n}`;
    case "fog": return `fog-${n}`;
    case "drizzle": return night ? "rain-night" : "drizzle";
    case "rain": case "heavy": case "sleet": return `rain-${n}`;
    case "snow": return `snow-${n}`;
    case "storm": case "hail": return "storm";
  }
}
let shownPhoto = "";
function photo(kind: Kind, night: boolean) {
  const t = skyFor(atNow() ? -1 : cursor), name = slot(kind, night, t.sun, t.arc);
  if (name === shownPhoto) return;
  shownPhoto = name;
  const [a, b] = document.querySelectorAll<HTMLElement>("#photos .photo"), next = a.classList.contains("on") ? b : a, prev = next === a ? b : a;
  const img = new Image();
  img.onload = () => { next.style.backgroundImage = `url("${img.src}")`; next.classList.add("on"); prev.classList.remove("on"); sky.air = false; };
  img.src = `./photos/${name}.jpg`;
}
/** The cards' glass takes the sky's colour: deep at night, slate in rain, blue by day. */
function glass(t: SkyTarget) {
  const night = t.sun < -0.05, wet = t.rain > 0.2 || t.storm > 0.2;
  const tint = t.storm > 0.2 ? "28, 32, 44, 0.34" : night ? "16, 22, 54, 0.32" : wet ? "44, 58, 84, 0.28" : t.sun < 0.15 ? "96, 70, 110, 0.24" : t.cover > 0.7 ? "70, 84, 106, 0.26" : "28, 74, 150, 0.22";
  document.documentElement.style.setProperty("--glass", `rgba(${tint})`);
}

// ---- the reading ----------------------------------------------------------------

function rollTemp(to: number) {
  const el = $("temp"), from = shownTemp ?? to;
  shownTemp = to;
  const t0 = performance.now(), dur = 420;
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = deg(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const hilo = (d: number) => {
  const hi = num(r()?.daily?.temperature_2m_max?.[d]), lo = num(r()?.daily?.temperature_2m_min?.[d]);
  return hi !== undefined && lo !== undefined ? `H:${deg(hi)}&ensp;L:${deg(lo)}` : "";
};

function hero() {
  const x = r()!, h = x.hourly, when = $("when");
  let code: number | undefined, night: boolean;
  if (atNow()) {
    when.textContent = ""; when.classList.remove("away");
    rollTemp(x.current.temperature_2m);
    code = x.current.weather_code; night = x.current.is_day === 0;
    const feels = num(x.current.apparent_temperature);
    $("range").innerHTML = `${hilo(0)}${feels !== undefined && Math.round(feels) !== Math.round(x.current.temperature_2m) ? `&ensp;·&ensp;Feels ${deg(feels)}` : ""}`;
  } else {
    const iso = str(h?.time?.[cursor]) ?? "";
    when.textContent = `${dayName(day)} · ${iso.slice(11, 16)}`; when.classList.add("away");
    rollTemp(num(h?.temperature_2m?.[cursor]) ?? 0);
    code = num(h?.weather_code?.[cursor]); night = nightAt(cursor);
    $("range").innerHTML = hilo(day);
  }
  $("cond").textContent = lookOf(code)[0];
  photo(lookOf(code)[3], night);
}
/** A later day in a sentence: the wettest it gets, or its sky. */
function daySentence(d: number): string {
  const x = r()!, pop = num(x.daily?.precipitation_probability_max?.[d]), uv = num(x.daily?.uv_index_max?.[d]);
  const code = num(x.daily?.weather_code?.[d]), name = lookOf(code)[0];
  const lead = `${dayName(d)}: ${name.toLowerCase()}`;
  if (pop !== undefined && pop >= 40) return `${lead}, ${fmt(pop)}% chance of rain.`;
  if (!isWet(code) && uv !== undefined && uv >= 6) return `${lead}, UV ${uvWord(uv).toLowerCase()} at ${Math.round(uv)}.`;
  return `${lead}, ${deg(num(x.daily?.temperature_2m_max?.[d]))} at best.`;
}

// ---- the hours ---------------------------------------------------------------------

type Col = { i: number; label: string; html: string };
function hours(): Col[] {
  const x = r()!, h = x.hourly!, [a, b] = span(), cols: Col[] = [];
  const suns = [...(x.daily?.sunrise ?? []).map((t) => [str(t), "Sunrise"] as const), ...(x.daily?.sunset ?? []).map((t) => [str(t), "Sunset"] as const)]
    .filter((s): s is [string, "Sunrise" | "Sunset"] => !!s[0]);
  for (let i = a; i < b; i++) {
    const iso = str(h.time?.[i]) ?? "", live = day === 0 && i === a;
    const code = live ? x.current.weather_code : num(h.weather_code?.[i]);
    const pop = num(h.precipitation_probability?.[i]) ?? 0, t = live ? x.current.temperature_2m : num(h.temperature_2m?.[i]);
    const night = live ? x.current.is_day === 0 : nightAt(i);
    cols.push({ i, label: live ? "Now" : iso.slice(11, 13), html: `<div class="ic">${weatherArt(lookOf(code)[3], night, 26)}</div><span class="pop">${pop >= 30 ? `${fmt(pop)}%` : ""}</span><b>${deg(t)}</b>` });
    const next = str(h.time?.[i + 1]);
    for (const [s, what] of suns) if (s > (live ? x.current.time ?? iso : iso) && (!next || s < next) && i + 1 < b) {
      cols.push({ i: -1, label: s.slice(11, 16), html: `<div class="ic">${sunArt(what === "Sunrise", 26)}</div><span class="pop"></span><b>${what}</b>` });
    }
  }
  return cols;
}
function strip() {
  const cols = hours();
  $("track").innerHTML = cols.map((c) => `<div class="hr${c.i < 0 ? " sun" : ""}${c.label === "Now" ? " now" : ""}" data-i="${c.i}" style="width:${c.i < 0 ? COL_W + 8 : COL_W}px"><small>${c.label}</small>${c.html}</div>`).join("");
  first = 0;
  mark(true);
}
/** The chosen hour lit, and the row slid so it is in view. */
function mark(jump = false) {
  const track = $("track"), view = $("strip").clientWidth;
  let x = 0, at = 0, w = 0;
  for (const c of track.querySelectorAll<HTMLElement>(".hr")) {
    const on = Number(c.dataset.i) === cursor;
    c.classList.toggle("on", on);
    if (on) { at = x; w = c.offsetWidth; }
    x += c.offsetWidth;
  }
  if (at < first) first = at;
  if (at + w > first + view - 12) first = at + w - view + 12;
  first = Math.max(0, Math.min(first, Math.max(0, x - view)));
  if (jump) { track.style.transition = "none"; requestAnimationFrame(() => { track.style.transition = ""; }); }
  track.style.transform = `translateX(${-first}px)`;
}

// ---- the week ----------------------------------------------------------------------

function week() {
  const x = r()!, d = x.daily!, n = dayCount();
  const his = Array.from({ length: n }, (_, i) => num(d.temperature_2m_max?.[i]));
  const los = Array.from({ length: n }, (_, i) => num(d.temperature_2m_min?.[i]));
  const all = [...his, ...los, x.current.temperature_2m].filter((v): v is number => v !== undefined);
  const lo = Math.min(...all), span = Math.max(...all) - lo || 1, at = (t: number) => ((t - lo) / span) * 100;
  $("week").innerHTML = Array.from({ length: n }, (_, i) => {
    const hi = his[i], low = los[i], pop = num(d.precipitation_probability_max?.[i]), code = num(d.weather_code?.[i]);
    const bar = hi === undefined || low === undefined ? "" : `<i style="left:${at(low)}%;right:${100 - at(hi)}%;background:linear-gradient(90deg,${tempColor(low, x.unit)},${tempColor(hi, x.unit)})"></i>${i === 0 ? `<u style="left:${Math.min(100, Math.max(0, at(x.current.temperature_2m)))}%"></u>` : ""}`;
    return `<li data-d="${i}"><span class="d">${i === 0 ? "Today" : WEEKDAY[dateOf(dayKey(i)!).getDay()].slice(0, 3)}</span><span class="ic">${weatherArt(lookOf(code)[3], false, 22)}${pop !== undefined && pop >= 30 ? `<i>${fmt(pop)}%</i>` : ""}</span><span class="lo">${deg(low)}</span><span class="bar">${bar}</span><span class="hi">${deg(hi)}</span></li>`;
  }).join("");
  fitWeek();
}
/** As many days as the card holds at a readable height; the compact panel shows fewer. */
function fitWeek() {
  const list = $("week"), rows = [...list.querySelectorAll<HTMLElement>("li")];
  for (const li of rows) li.hidden = false;
  const fits = Math.max(3, Math.floor(list.clientHeight / 22));
  rows.forEach((li, i) => { li.hidden = i >= fits; });
}

// ---- moving through time ---------------------------------------------------------

function show() {
  if (!r()) return;
  hero();
  mark();
  for (const li of document.querySelectorAll<HTMLElement>("#week li")) li.classList.toggle("on", day > 0 && Number(li.dataset.d) === day);
  $("summary").querySelector("span")!.textContent = day === 0 ? summary(r()!) ?? `${lookOf(r()!.current.weather_code)[0]} now.` : daySentence(day);
  const t = skyFor(atNow() ? -1 : cursor);
  sky.set(t);
  glass(t);
}
function pickDay(d: number) {
  if (d < 0 || d >= dayCount() || (d > 0 && hourOf(d, 0) < 0)) return;
  day = d;
  cursor = d === 0 ? now() : Math.max(hourOf(d, 0), hourOf(d, 13));
  strip();
  show();
}
function moveHour(by: number) {
  const [a, b] = span(), next = Math.max(a, Math.min(b - 1, cursor + by));
  if (next !== cursor) { cursor = next; show(); }
}
const backToNow = () => pickDay(0);

$("strip").addEventListener("pointermove", (e) => {
  // The panel opening under a still pointer reports a move of nothing: only a real move walks the hours.
  if (!e.movementX && !e.movementY) return;
  const c = (e.target as HTMLElement).closest<HTMLElement>(".hr"); if (!c) return;
  const i = Number(c.dataset.i);
  if (i >= 0 && i !== cursor) { cursor = i; show(); }
});
$("week").addEventListener("click", (e) => {
  const li = (e.target as HTMLElement).closest<HTMLElement>("li"); if (!li) return;
  const d = Number(li.dataset.d);
  pickDay(d === day ? 0 : d);
});

// ---- talking to the extension -----------------------------------------------------

function apply(next: Reply) {
  reply = next;
  pal.title(next.title);
  $("place").querySelector("span")!.textContent = next.reading ? next.reading.place.name : "Choose a place";
  if (next.setup) { openSearch(); return; }
  if (!next.reading) { if (next.error) note(next.error); return; }
  if (day >= dayCount()) day = 0;
  const [a, b] = span();
  if (cursor < a || cursor >= b) cursor = day === 0 ? now() : a;
  week(); strip(); show();
  document.body.classList.add("in");
}
async function call(msg: Record<string, unknown>): Promise<Reply | undefined> {
  try { return (await pal.send(msg)) as Reply; } catch (e) { note(String((e as Error)?.message ?? e)); }
}
let noteTimer: ReturnType<typeof setTimeout> | undefined;
function note(text: string) {
  const n = $("note"); n.textContent = text; n.hidden = false;
  clearTimeout(noteTimer); noteTimer = setTimeout(() => { n.hidden = true; }, 2600);
}
async function refresh(quiet = false) {
  const next = await call({ op: "refresh" });
  if (!next) return;
  if (next.error) note(next.error); else if (!quiet) note("Up to date");
  if (next.reading) apply(next);
}

// ---- a place --------------------------------------------------------------------

let found: Found[] = [];
let sel = 0;
let asked = 0;
let typing: ReturnType<typeof setTimeout> | undefined;
const flag = (cc?: string) => cc && /^[A-Za-z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 0x1f1a5 + ch.charCodeAt(0))) : "";
function openSearch() {
  $("search").hidden = false;
  const q = $<HTMLInputElement>("q");
  q.value = ""; found = []; sel = 0; drawFound();
  setTimeout(() => q.focus(), 30);
}
function closeSearch() { if (!reply?.setup) $("search").hidden = true; }
function drawFound(empty = false) {
  $("found").innerHTML = empty
    ? `<li class="none">No place by that name</li>`
    : found.map((f, i) => `<li class="${i === sel ? "on" : ""}" data-i="${i}"><span class="flag">${flag(f.country_code)}</span><b>${esc(f.name)}</b><span>${esc(f.region)}</span></li>`).join("");
}
$<HTMLInputElement>("q").addEventListener("input", (e) => {
  const q = (e.target as HTMLInputElement).value.trim();
  clearTimeout(typing);
  if (!q) { found = []; drawFound(); return; }
  typing = setTimeout(async () => {
    const mine = ++asked;
    const res = (await pal.send({ op: "search", q }).catch(() => [])) as Found[];
    if (mine !== asked) return;
    found = res ?? []; sel = 0; drawFound(!found.length);
  }, 160);
});
$("found").addEventListener("click", (e) => { const li = (e.target as HTMLElement).closest<HTMLElement>("li[data-i]"); if (li) choose(Number(li.dataset.i)); });
$("search").addEventListener("pointerdown", (e) => { if (e.target === $("search")) closeSearch(); });
async function choose(i: number) {
  const f = found[i]; if (!f) return;
  const next = await call({ op: "set", place: f });
  if (!next) return;
  if (next.error) { note(next.error); return; }
  $("search").hidden = true;
  day = 0; cursor = -1;
  apply(next);
}
$("place").addEventListener("click", openSearch);

// ---- keys and actions -----------------------------------------------------------

function run(id: string) {
  if (id === "map") pal.send({ op: "map" }).catch(() => {});
  else if (id === "refresh") refresh();
  else if (id === "place") openSearch();
  else if (id === "now") backToNow();
}
pal.onAction(run);
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!$("search").hidden) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (found.length) { sel = (sel + (e.key === "ArrowDown" ? 1 : found.length - 1)) % found.length; drawFound(); } }
    else if (e.key === "Enter") { e.preventDefault(); choose(sel); }
    else if (e.key === "Tab") { e.preventDefault(); closeSearch(); }
    return;
  }
  if (!r()) return;
  const k = e.key.toLowerCase();
  const keys: Record<string, () => void> = {
    arrowleft: () => moveHour(e.shiftKey ? -3 : -1), arrowright: () => moveHour(e.shiftKey ? 3 : 1),
    arrowup: () => pickDay(day - 1), arrowdown: () => pickDay(day + 1),
    n: backToNow, home: backToNow, o: () => run("map"), enter: () => run("map"), r: () => run("refresh"), l: () => run("place"), "/": () => run("place"),
  };
  if (/^[1-7]$/.test(k)) { e.preventDefault(); pickDay(Number(k) - 1); return; }
  const f = keys[k];
  if (f) { e.preventDefault(); f(); }
});

new ResizeObserver(() => { if (r()) { mark(true); fitWeek(); } }).observe($("cards"));
pal.onShown(async () => {
  sky.start();
  const next = await call({ op: "open" });
  if (next?.reading) apply(next);
  if (next?.stale) refresh(true);
});
pal.onHidden(() => sky.stop());

const firstReply = await call({ op: "open" });
if (firstReply) apply(firstReply);
if (firstReply?.reading) { const t = skyFor(-1); sky.set(t, true); glass(t); }
sky.paint();
sky.start();
pal.ready();
if (firstReply?.stale) refresh(true);
