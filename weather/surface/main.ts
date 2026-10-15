// Weather's page. It keeps no weather of its own: the extension answers
// `open` (the reading it holds, at once), `refresh`, `search` and `set`,
// and the page draws the answer over the sky (sky.ts).
//
// Keys: ← → walk the hours or the days (shift: three hours), ↑ the hours,
// ↓ the days, 1–7 a day, N back to now, L or / a place, O or Enter the
// map, R refresh. A column is a click, and the pointer walks the band.
import type { SurfaceKit } from "@zcag/pal";
import { weatherArt } from "../art.ts";
import { compass, deg, fmt, isWet, lookOf, num, startHour, str, summary, tempColor, uvWord, type Kind, type Reading } from "../model.ts";
import type { Found, Reply } from "../index.ts";
import { Sky, type SkyTarget } from "./sky.ts";

declare const pal: SurfaceKit;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dateOf = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
const minutes = (iso: string | undefined) => iso ? Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)) : undefined;
const VISIBLE_HOURS = 12;

const sky = new Sky($<HTMLCanvasElement>("sky"), $<HTMLCanvasElement>("fx"));
let reply: Reply | undefined;
let mode: "hours" | "days" = "hours";
let cursor = -1;
let day = 0;
let first = -1;
let shownTemp: number | undefined;

const r = () => reply?.reading;
const now = () => r() ? startHour(r()!) : -1;
const lastHour = () => (r()?.hourly?.time?.length ?? 0) - 1;
const dayCount = () => Math.min(7, r()?.daily?.time?.length ?? 0);
const dayKey = (d: number) => str(r()?.daily?.time?.[d]);
const hourOf = (d: number, h: number) => { const key = dayKey(d); return key ? (r()?.hourly?.time ?? []).findIndex((t) => str(t)?.startsWith(`${key}T${String(h).padStart(2, "0")}`)) : -1; };
const atNow = () => mode === "hours" ? cursor === now() : day === 0;
const dayName = (iso: string) => { const d = Math.round((dateOf(iso).getTime() - dateOf(dayKey(0)!).getTime()) / 864e5); return d === 0 ? "Today" : d === 1 ? "Tomorrow" : WEEKDAY[dateOf(iso).getDay()]; };

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

// ---- the reading ----------------------------------------------------------------

function rollTemp(to: number) {
  const el = $("temp"), from = shownTemp ?? to;
  shownTemp = to;
  const t0 = performance.now(), span = 420;
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / span), e = 1 - Math.pow(1 - k, 3);
    el.textContent = deg(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const hilo = (d: number) => {
  const hi = num(r()?.daily?.temperature_2m_max?.[d]), lo = num(r()?.daily?.temperature_2m_min?.[d]);
  return hi !== undefined && lo !== undefined ? `H <b>${deg(hi)}</b>&ensp;L <b>${deg(lo)}</b>` : "";
};
const join = (parts: string[]) => parts.filter(Boolean).join("&ensp;·&ensp;");

function hero() {
  const x = r()!, when = $("when"), h = x.hourly, d = x.daily;
  let code: number | undefined, night: boolean, said: string | undefined;
  if (atNow()) {
    when.textContent = "Now"; when.classList.remove("away");
    rollTemp(x.current.temperature_2m);
    code = x.current.weather_code; night = x.current.is_day === 0; said = summary(x);
    const feels = num(x.current.apparent_temperature);
    $("range").innerHTML = join([hilo(0), feels !== undefined ? `Feels <b>${deg(feels)}</b>` : ""]);
  } else if (mode === "hours") {
    const iso = str(h?.time?.[cursor]) ?? "";
    when.textContent = `${dayName(iso)} · ${iso.slice(11, 16)}`; when.classList.add("away");
    rollTemp(num(h?.temperature_2m?.[cursor]) ?? 0);
    code = num(h?.weather_code?.[cursor]); night = nightAt(cursor);
    const pop = num(h?.precipitation_probability?.[cursor]), wind = num(h?.wind_speed_10m?.[cursor]);
    $("range").innerHTML = join([pop !== undefined ? `Rain <b>${fmt(pop)}%</b>` : "", wind !== undefined ? `Wind <b>${Math.round(wind)}</b> ${esc(x.windUnit)}` : ""]);
    said = undefined;
  } else {
    when.textContent = dayName(dayKey(day)!); when.classList.add("away");
    rollTemp(num(d?.temperature_2m_max?.[day]) ?? 0);
    code = num(d?.weather_code?.[day]); night = false; said = daySentence(day);
    $("range").innerHTML = hilo(day);
  }
  $("cond").textContent = lookOf(code)[0];
  $("summary").innerHTML = said ? `${weatherArt(lookOf(code)[3], night, 24)}<span>${esc(said)}</span>` : "";
}
/** A later day in a sentence: the wettest it gets, or its sky. */
function daySentence(d: number): string | undefined {
  const x = r()!, pop = num(x.daily?.precipitation_probability_max?.[d]), uv = num(x.daily?.uv_index_max?.[d]);
  const code = num(x.daily?.weather_code?.[d]);
  if (pop !== undefined && pop >= 40) return `${fmt(pop)}% chance of rain`;
  if (!isWet(code) && uv !== undefined && uv >= 6) return `UV ${Math.round(uv)}, ${uvWord(uv).toLowerCase()}`;
  return isWet(code) ? undefined : "Dry all day";
}

const svg = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
function facts() {
  const x = r()!, c = x.current, d = x.daily;
  const out: [string, string][] = [];
  const dir = num(c.wind_direction_10m);
  if (c.wind_speed_10m !== undefined) out.push([`Wind${dir === undefined ? "" : ` · ${compass(dir)}`}`, `${Math.round(c.wind_speed_10m)} <em>${esc(x.windUnit)}</em>${dir === undefined ? "" : `<i class="arrow" style="transform:rotate(${dir + 180}deg)">${svg('<path fill="currentColor" d="M12 3l6 15-6-3.5L6 18z"/>')}</i>`}`]);
  if (c.relative_humidity_2m !== undefined) out.push(["Humidity", `${fmt(c.relative_humidity_2m)}%`]);
  const uv = num(d?.uv_index_max?.[0]);
  if (c.precipitation) out.push(["Rain", `${fmt(c.precipitation)} <em>mm</em>`]);
  else if (uv !== undefined) out.push(["UV today", `${Math.round(uv)} <em>${uvWord(uv)}</em>`]);
  const sun = [["Sunrise", str(d?.sunrise?.[0])], ["Sunset", str(d?.sunset?.[0])], ["Sunrise", str(d?.sunrise?.[1])]].find(([, t]) => t && t > (c.time ?? ""));
  if (sun?.[1]) out.push([sun[0]!, sun[1].slice(11, 16)]);
  $("facts").innerHTML = out.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
}

// ---- the band ---------------------------------------------------------------------

const colWidth = () => $("strip").clientWidth / (mode === "hours" ? VISIBLE_HOURS : Math.max(1, dayCount()));

function band() {
  const x = r()!, track = $("track"), w = colWidth();
  for (const b of document.querySelectorAll<HTMLElement>("#band nav button")) b.classList.toggle("on", b.dataset.mode === mode);
  if (mode === "hours") {
    const h = x.hourly!, a = now(), n = lastHour() - a + 1;
    const temps = Array.from({ length: n }, (_, j) => j === 0 ? x.current.temperature_2m : num(h.temperature_2m?.[a + j]) ?? x.current.temperature_2m);
    track.innerHTML = temps.map((t, j) => {
      const i = a + j, pop = num(h.precipitation_probability?.[i]) ?? 0, iso = str(h.time?.[i]) ?? "";
      const label = j === 0 ? "Now" : iso.slice(11, 13) === "00" ? WEEKDAY[dateOf(iso).getDay()].slice(0, 3) : iso.slice(11, 16);
      return `<button class="col${j === 0 ? " now" : ""}" type="button" tabindex="-1" data-i="${i}" style="width:${w}px"><small>${label}</small><div class="art">${weatherArt(lookOf(num(h.weather_code?.[i]))[3], nightAt(i), 30)}</div><b>${deg(t)}</b><span class="pop">${pop >= 30 ? `${fmt(pop)}%` : ""}</span></button>`;
    }).join("");
  } else {
    const d = x.daily!, n = dayCount();
    const his = Array.from({ length: n }, (_, i) => num(d.temperature_2m_max?.[i]));
    const los = Array.from({ length: n }, (_, i) => num(d.temperature_2m_min?.[i]));
    const all = [...his, ...los, x.current.temperature_2m].filter((v): v is number => v !== undefined);
    const lo = Math.min(...all), span = Math.max(...all) - lo || 1, at = (t: number) => ((t - lo) / span) * 100;
    track.innerHTML = Array.from({ length: n }, (_, i) => {
      const hi = his[i], low = los[i], pop = num(d.precipitation_probability_max?.[i]);
      const bar = hi === undefined || low === undefined ? "" : `<div class="bar"><i style="left:${at(low)}%;right:${100 - at(hi)}%;background:linear-gradient(90deg,${tempColor(low, x.unit)},${tempColor(hi, x.unit)})"></i>${i === 0 ? `<u style="left:${at(x.current.temperature_2m)}%"></u>` : ""}</div>`;
      return `<button class="col${i === 0 ? " now" : ""}" type="button" tabindex="-1" data-d="${i}" style="width:${w}px"><small>${i === 0 ? "Today" : WEEKDAY[dateOf(dayKey(i)!).getDay()].slice(0, 3)}${pop !== undefined && pop >= 30 ? ` <span class="pop">${fmt(pop)}%</span>` : ""}</small><div class="art">${weatherArt(lookOf(num(d.weather_code?.[i]))[3], false, 30)}</div><b>${deg(hi)}<i>${deg(low)}</i></b>${bar}</button>`;
    }).join("");
  }
  mark(true);
}
/** The selected column lit, and the track slid so it is in view. */
function mark(jump = false) {
  const track = $("track"), w = colWidth();
  for (const c of track.querySelectorAll<HTMLElement>(".col")) c.classList.toggle("on", mode === "hours" ? Number(c.dataset.i) === cursor : Number(c.dataset.d) === day);
  let shift = 0;
  if (mode === "hours") {
    const a = now();
    if (first < a) first = a;
    if (cursor < first) first = cursor;
    if (cursor > first + VISIBLE_HOURS - 1) first = cursor - VISIBLE_HOURS + 1;
    shift = (first - a) * w;
  }
  if (jump) { track.style.transition = "none"; requestAnimationFrame(() => { track.style.transition = ""; }); }
  track.style.transform = `translateX(${-shift}px)`;
}

// ---- moving through time ---------------------------------------------------------

function show() {
  if (!r()) return;
  hero();
  mark();
  sky.set(skyFor(mode === "hours" ? (atNow() ? -1 : cursor) : day === 0 ? -1 : hourOf(day, 13)));
}
function setMode(m: "hours" | "days") {
  if (m === mode) return;
  if (m === "hours") cursor = day === 0 ? now() : Math.max(now(), hourOf(day, 9));
  else day = Math.max(0, (r()?.daily?.time ?? []).findIndex((t) => str(t) === str(r()?.hourly?.time?.[cursor])?.slice(0, 10)));
  mode = m;
  band();
  show();
}
function pickDay(d: number) {
  if (d < 0 || d >= dayCount()) return;
  if (mode !== "days") { day = d; mode = "days"; band(); }
  day = d;
  show();
}
function moveHour(by: number) {
  const next = Math.max(now(), Math.min(lastHour(), cursor + by));
  if (next !== cursor) { cursor = next; show(); }
}
function backToNow() { mode === "hours" ? (cursor = now(), first = now(), show()) : (day = 0, setMode("hours")); }

$("strip").addEventListener("pointermove", (e) => {
  // The panel opening under a still pointer reports a move of nothing: only a real move walks the band.
  if (!e.movementX && !e.movementY) return;
  const c = (e.target as HTMLElement).closest<HTMLElement>(".col"); if (!c) return;
  if (c.dataset.i && Number(c.dataset.i) !== cursor) { cursor = Number(c.dataset.i); show(); }
  if (c.dataset.d && Number(c.dataset.d) !== day) { day = Number(c.dataset.d); show(); }
});
$("strip").addEventListener("click", (e) => {
  const c = (e.target as HTMLElement).closest<HTMLElement>(".col"); if (!c) return;
  if (c.dataset.d) { day = Number(c.dataset.d); setMode("hours"); }
});
for (const b of document.querySelectorAll<HTMLElement>("#band nav button")) b.addEventListener("click", () => setMode(b.dataset.mode as "hours" | "days"));

// ---- talking to the extension -----------------------------------------------------

function apply(next: Reply) {
  reply = next;
  pal.title(next.title);
  $("place").querySelector("span")!.textContent = next.reading ? next.reading.place.name : "Choose a place";
  if (next.setup) { openSearch(); return; }
  if (!next.reading) { if (next.error) note(next.error); return; }
  if (cursor < 0 || cursor > lastHour()) cursor = now();
  if (day >= dayCount()) day = 0;
  if (mode === "hours" && cursor < now()) cursor = now();
  facts(); band(); show();
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
  mode = "hours"; cursor = -1; first = -1; day = 0;
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
  const step = (by: number) => mode === "hours" ? moveHour(by * (e.shiftKey ? 3 : 1)) : pickDay(day + by);
  const keys: Record<string, () => void> = {
    arrowleft: () => step(-1), arrowright: () => step(1), arrowup: () => setMode("hours"), arrowdown: () => setMode("days"),
    n: backToNow, home: backToNow, o: () => run("map"), enter: () => run("map"), r: () => run("refresh"), l: () => run("place"), "/": () => run("place"),
  };
  if (/^[1-7]$/.test(k)) { e.preventDefault(); pickDay(Number(k) - 1); return; }
  const f = keys[k];
  if (f) { e.preventDefault(); f(); }
});

new ResizeObserver(() => { if (r()) band(); }).observe($("strip"));
pal.onShown(async () => {
  sky.start();
  const next = await call({ op: "open" });
  if (next?.reading) apply(next);
  if (next?.stale) refresh(true);
});
pal.onHidden(() => sky.stop());

const firstReply = await call({ op: "open" });
if (firstReply?.reading) { apply(firstReply); sky.set(skyFor(-1), true); }
else if (firstReply) apply(firstReply);
sky.paint();
sky.start();
pal.ready();
if (firstReply?.stale) refresh(true);
