// Weather's page. It keeps no weather of its own: the extension answers
// `open` (the reading it holds, at once), `refresh`, `search` and `set`,
// and the page draws the answer over the live sky (sky.ts).
//
// Keys: ← → walk the hours (shift: three at a time), ↑ ↓ or 1–7 the days,
// N back to now, L or / a place, O the map, R refresh, Enter the map.
// The chart follows the pointer too, and a day is a click.
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
const WINDOW = 24;

const sky = new Sky($<HTMLCanvasElement>("sky"));
let reply: Reply | undefined;
let day = 0;
let cursor = -1;
let shownTemp: number | undefined;

const r = () => reply?.reading;
const hours = () => r()?.hourly?.time?.length ?? 0;
const dayKey = (d: number) => str(r()?.daily?.time?.[d]);
/** The first hour the chart draws for a day: now for today, midnight after. */
function windowStart(d: number): number {
  const x = r(); if (!x) return -1;
  if (d === 0) return startHour(x);
  const key = dayKey(d);
  return key ? (x.hourly?.time ?? []).findIndex((t) => str(t)?.startsWith(`${key}T00`)) : -1;
}
const now = () => windowStart(0);
const atNow = () => day === 0 && cursor === now();

// ---- the sky ------------------------------------------------------------------

const KIND: Record<Kind, Partial<SkyTarget> & { cover: number }> = {
  clear: { cover: 0.04 }, partly: { cover: 0.42 }, cloudy: { cover: 0.96 }, fog: { cover: 0.45, fog: 1 },
  drizzle: { cover: 0.86, rain: 0.28 }, rain: { cover: 0.94, rain: 0.62 }, heavy: { cover: 1, rain: 1 },
  sleet: { cover: 0.92, rain: 0.35, snow: 0.45 }, snow: { cover: 0.9, snow: 0.75 },
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
function skyFor(i: number): SkyTarget {
  const x = r()!;
  const live = i < 0 || (day === 0 && i === now());
  const code = live ? x.current.weather_code : num(x.hourly?.weather_code?.[i]);
  const k = KIND[lookOf(code)[3]];
  const cloud = live ? num(x.current.cloud_cover) : num(x.hourly?.cloud_cover?.[i]);
  const cover = cloud === undefined ? k.cover : Math.max(cloud / 100 * 0.9, k.cover * 0.85);
  const wind = (live ? num(x.current.wind_speed_10m) : num(x.hourly?.wind_speed_10m?.[i])) ?? 10;
  const iso = (live ? x.current.time : str(x.hourly?.time?.[i])) ?? `${dayKey(0)}T12:00`;
  const code3 = code ?? 0, heavy = code3 === 65 || code3 === 82 || code3 === 75 || code3 === 86 ? 1.15 : 1;
  return { ...sunAt(x, iso), cover, rain: (k.rain ?? 0) * heavy, snow: (k.snow ?? 0) * heavy, fog: k.fog ?? 0, storm: k.storm ?? 0, wind };
}
const nightAt = (i: number) => r()?.hourly?.is_day?.[i] === 0;

// ---- the reading ----------------------------------------------------------------

/** The big number rolls from what it showed to what it shows. */
function rollTemp(to: number) {
  const el = $("temp"), from = shownTemp ?? to;
  shownTemp = to;
  const t0 = performance.now(), span = 520;
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / span), e = 1 - Math.pow(1 - k, 3);
    el.textContent = deg(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function hero() {
  const x = r()!, d = x.daily, live = atNow();
  const when = $("when");
  if (live) {
    when.textContent = "Now"; when.classList.remove("away");
    rollTemp(x.current.temperature_2m);
    $("cond").textContent = lookOf(x.current.weather_code)[0];
    const hi = num(d?.temperature_2m_max?.[0]), lo = num(d?.temperature_2m_min?.[0]), feels = num(x.current.apparent_temperature);
    $("range").innerHTML = [hi !== undefined && lo !== undefined ? `H <b>${deg(hi)}</b> &nbsp;L <b>${deg(lo)}</b>` : "", feels !== undefined ? `Feels <b>${deg(feels)}</b>` : ""].filter(Boolean).join(" &nbsp;·&nbsp; ");
  } else {
    const iso = str(x.hourly?.time?.[cursor]) ?? "", code = num(x.hourly?.weather_code?.[cursor]);
    when.textContent = `${day === 0 ? "Today" : day === 1 ? "Tomorrow" : WEEKDAY[dateOf(iso).getDay()]} · ${iso.slice(11, 16)}`;
    when.classList.add("away");
    rollTemp(num(x.hourly?.temperature_2m?.[cursor]) ?? 0);
    $("cond").textContent = lookOf(code)[0];
    const pop = num(x.hourly?.precipitation_probability?.[cursor]), wind = num(x.hourly?.wind_speed_10m?.[cursor]);
    $("range").innerHTML = [pop !== undefined ? `Rain <b>${fmt(pop)}%</b>` : "", wind !== undefined ? `Wind <b>${Math.round(wind)}</b> ${esc(x.windUnit)}` : ""].filter(Boolean).join(" &nbsp;·&nbsp; ");
  }
  const said = live ? summary(x) : day > 0 ? daySentence(day) : undefined;
  const code = live ? x.current.weather_code : num(x.hourly?.weather_code?.[cursor]);
  const night = live ? x.current.is_day === 0 : nightAt(cursor);
  $("summary").innerHTML = said ? `${weatherArt(lookOf(code)[3], night, 22)}<span>${esc(said)}</span>` : "";
}
/** A later day in a sentence: the wettest it gets, or its sky. */
function daySentence(d: number): string | undefined {
  const x = r()!, pop = num(x.daily?.precipitation_probability_max?.[d]);
  const code = num(x.daily?.weather_code?.[d]), name = lookOf(code)[0];
  if (pop !== undefined && pop >= 40) return `${name}, ${fmt(pop)}% chance of rain`;
  return isWet(code) ? name : `${name} all day`;
}

// ---- the chart --------------------------------------------------------------

function chart() {
  const x = r()!, box = $("chart"), W = box.clientWidth, H = box.clientHeight;
  const a = windowStart(day), n = Math.min(WINDOW, hours() - a);
  if (a < 0 || n < 2 || W < 40 || H < 40) { box.innerHTML = ""; return; }
  const h = x.hourly!, idx = Array.from({ length: n }, (_, j) => a + j);
  const temps = idx.map((i, j) => day === 0 && j === 0 ? x.current.temperature_2m : num(h.temperature_2m?.[i]) ?? NaN);
  const ok = temps.filter(Number.isFinite), lo = Math.min(...ok), hi = Math.max(...ok);
  const pad = 14, top = 46, bottom = H - 34;
  const X = (j: number) => pad + (j * (W - 2 * pad)) / (n - 1);
  const Y = (t: number) => bottom - ((t - lo) / (hi - lo || 1)) * (bottom - top);
  const pts = temps.map((t, j) => [X(j), Y(Number.isFinite(t) ? t : lo)] as const);
  let path = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let j = 0; j < pts.length - 1; j++) {
    const p0 = pts[Math.max(0, j - 1)], p1 = pts[j], p2 = pts[j + 1], p3 = pts[Math.min(pts.length - 1, j + 2)];
    path += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const stops = temps.map((t, j) => `<stop offset="${(j / (n - 1)).toFixed(3)}" stop-color="${tempColor(Number.isFinite(t) ? t : lo, x.unit)}"/>`).join("");
  const nights: string[] = [];
  for (let j = 0; j < n; j++) {
    if (!nightAt(idx[j])) continue;
    let k = j; while (k + 1 < n && nightAt(idx[k + 1])) k++;
    const x0 = j === 0 ? 0 : (X(j - 1) + X(j)) / 2, x1 = k === n - 1 ? W : (X(k) + X(k + 1)) / 2;
    nights.push(`<rect x="${x0.toFixed(1)}" y="24" width="${(x1 - x0).toFixed(1)}" height="${(bottom - 24).toFixed(1)}" fill="url(#night)"/>`);
    j = k;
  }
  const sunMarks: string[] = [], sunXs: number[] = [];
  const t0 = minutes(str(h.time?.[a]))!, d0 = dateOf(str(h.time?.[a])!).getTime();
  for (const [list, label] of [[x.daily?.sunrise, "↑"], [x.daily?.sunset, "↓"]] as const) {
    for (const v of list ?? []) {
      const s = str(v); if (!s) continue;
      const off = (dateOf(s).getTime() - d0) / 3.6e6 + ((minutes(s) ?? 0) - t0) / 60;
      if (off <= 0.3 || off >= n - 1.3) continue;
      const sx = pad + (off * (W - 2 * pad)) / (n - 1);
      if (day === 0 && sx - X(0) < 44) continue;
      sunXs.push(sx);
      sunMarks.push(`<line x1="${sx.toFixed(1)}" x2="${sx.toFixed(1)}" y1="26" y2="${bottom}" stroke="#ffd27a" stroke-opacity=".45" stroke-dasharray="2 3"/><text class="sun" x="${sx.toFixed(1)}" y="${bottom + 30}">${label} ${s.slice(11, 16)}</text>`);
    }
  }
  const every = W / n < 22 ? 3 : 2;
  const marks = idx.map((i, j) => {
    const parts: string[] = [];
    const pop = num(h.precipitation_probability?.[i]) ?? 0;
    if (pop >= 20) {
      const bh = Math.max(2, (pop / 100) * 16), bw = Math.max(2, (W - 2 * pad) / n - 4);
      parts.push(`<rect x="${(X(j) - bw / 2).toFixed(1)}" y="${(bottom + 14 - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5" fill="#8cc8ff" fill-opacity="${(0.35 + pop / 160).toFixed(2)}"/>`);
    }
    if (j % every === 0) {
      const code = num(h.weather_code?.[i]);
      parts.push(`<g transform="translate(${(X(j) - 10).toFixed(1)} 0)">${weatherArt(lookOf(code)[3], nightAt(i), 20)}</g>`);
      if (Math.abs(i - cursor) > 1) parts.push(`<text x="${X(j).toFixed(1)}" y="${(pts[j][1] - 9).toFixed(1)}">${deg(temps[j])}</text>`);
      const label = day === 0 && j === 0 ? "Now" : str(h.time?.[i])!.slice(11, 13);
      if (!(day === 0 && j === 0) && sunXs.some((sx) => Math.abs(sx - X(j)) < 30)) return parts.join("");
      parts.push(`<text class="t${day === 0 && j === 0 ? " now" : ""}" x="${X(j).toFixed(1)}" y="${bottom + 30}">${label}</text>`);
    }
    return parts.join("");
  }).join("");
  const c = Math.max(0, Math.min(n - 1, cursor - a)), cx = X(c), cy = pts[c][1];
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
<defs><linearGradient id="line" x1="${pad}" x2="${W - pad}" gradientUnits="userSpaceOnUse">${stops}</linearGradient>
<linearGradient id="night" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0a1040" stop-opacity="0"/><stop offset=".5" stop-color="#0a1040" stop-opacity=".16"/><stop offset="1" stop-color="#0a1040" stop-opacity=".05"/></linearGradient>
<linearGradient id="fill" x1="0" x2="0" y1="${top - 10}" y2="${bottom}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
${nights.join("")}${sunMarks.join("")}
<path d="${path} L${pts[n - 1][0]},${bottom} L${pts[0][0]},${bottom} Z" fill="url(#fill)"/>
<path d="${path}" fill="none" stroke="url(#line)" stroke-width="3" stroke-linecap="round"/>
${marks}
<g class="cursor" style="transform:translateX(${cx.toFixed(1)}px)"><line x1="0" x2="0" y1="22" y2="${bottom + 16}" stroke="#fff" stroke-opacity=".5"/></g>
<circle class="dot" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5" fill="#fff" stroke="${tempColor(temps[c], x.unit)}" stroke-width="2.5"/>
<text class="now" x="${cx.toFixed(1)}" y="${(cy - 11).toFixed(1)}" style="font-size:13px">${deg(temps[c])}</text>
</svg>`;
  $("hours-title").textContent = day === 0 ? "Next 24 hours" : day === 1 ? "Tomorrow" : WEEKDAY[dateOf(dayKey(day)!).getDay()];
}

// ---- now, around it ------------------------------------------------------------

const ICON = {
  wind: '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
  drop: '<path fill="currentColor" d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z"/>',
  uv: '<circle cx="12" cy="12" r="4.5" fill="currentColor"/><path stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
  sun: '<path fill="currentColor" d="M5 17a7 7 0 0 1 14 0z"/><path stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M2 20h20M12 4v3M4.9 8.9l1.8 1.8M19.1 8.9l-1.8 1.8"/>',
};
const svg = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
function chips() {
  const x = r()!, c = x.current, d = x.daily;
  const out: string[] = [];
  if (c.wind_speed_10m !== undefined) {
    const dir = num(c.wind_direction_10m);
    const arrow = dir === undefined ? "" : `<i class="arrow" style="transform:rotate(${dir + 180}deg)">${svg('<path fill="currentColor" d="M12 3l6 15-6-3.5L6 18z"/>')}</i>`;
    out.push(`<small>${svg(ICON.wind)}Wind${dir === undefined ? "" : ` · ${compass(dir)}`}</small><span>${Math.round(c.wind_speed_10m)} <em>${esc(x.windUnit)}</em>${arrow}</span>`);
  }
  if (c.relative_humidity_2m !== undefined) out.push(`<small>${svg(ICON.drop)}Humidity</small><span>${fmt(c.relative_humidity_2m)}%</span>`);
  const uv = num(d?.uv_index_max?.[0]);
  if (uv !== undefined) out.push(`<small>${svg(ICON.uv)}UV today</small><span>${Math.round(uv)} <em>${uvWord(uv)}</em></span>`);
  const sun = [["Sunrise", str(d?.sunrise?.[0])], ["Sunset", str(d?.sunset?.[0])], ["Sunrise", str(d?.sunrise?.[1])]].find(([, t]) => t && t > (c.time ?? ""));
  if (sun?.[1]) out.push(`<small>${svg(ICON.sun)}${sun[0]}</small><span>${sun[1].slice(11, 16)}</span>`);
  else if (c.precipitation) out.push(`<small>${svg(ICON.drop)}Rain</small><span>${fmt(c.precipitation)} mm</span>`);
  $("chips").innerHTML = out.map((o) => `<div class="chip card">${o}</div>`).join("");
}

function days() {
  const x = r()!, d = x.daily, count = Math.min(7, d?.time?.length ?? 0);
  const his = Array.from({ length: count }, (_, i) => num(d?.temperature_2m_max?.[i]));
  const los = Array.from({ length: count }, (_, i) => num(d?.temperature_2m_min?.[i]));
  const all = [...his, ...los, x.current.temperature_2m].filter((v): v is number => v !== undefined);
  const lo = Math.min(...all), span = Math.max(...all) - lo || 1;
  const box = $("days");
  box.innerHTML = Array.from({ length: count }, (_, i) => {
    const key = dayKey(i)!, hi = his[i], low = los[i], pop = num(d?.precipitation_probability_max?.[i]);
    const name = i === 0 ? "Today" : WEEKDAY[dateOf(key).getDay()].slice(0, 3);
    const bar = hi === undefined || low === undefined ? "" : `<div class="bar"><i style="left:${((low - lo) / span) * 100}%;right:${100 - ((hi - lo) / span) * 100}%;background:linear-gradient(90deg,${tempColor(low, x.unit)},${tempColor(hi, x.unit)})"></i>${i === 0 ? `<u style="left:${((x.current.temperature_2m - lo) / span) * 100}%"></u>` : ""}</div>`;
    return `<button class="day card${i === day ? " on" : ""}" type="button" tabindex="-1" data-day="${i}" style="--i:${i}">
<b>${name}</b><div class="art">${weatherArt(lookOf(num(d?.weather_code?.[i]))[3], false, 32)}</div>${pop !== undefined && pop >= 20 ? `<span class="pop">${fmt(pop)}%</span>` : ""}
<div class="temps">${deg(hi)}<i>${deg(low)}</i></div>${bar}</button>`;
  }).join("");
}
$("days").addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>(".day"); if (b) pickDay(Number(b.dataset.day)); });

// ---- moving through time ---------------------------------------------------------

function show(instant = false) {
  if (!r()) return;
  hero(); chart();
  for (const b of document.querySelectorAll<HTMLElement>(".day")) b.classList.toggle("on", Number(b.dataset.day) === day);
  sky.set(skyFor(atNow() ? -1 : cursor), instant);
}
function pickDay(d: number) {
  const count = Math.min(7, r()?.daily?.time?.length ?? 0);
  if (!r() || d < 0 || d >= count || windowStart(d) < 0) return;
  day = d;
  const a = windowStart(d);
  cursor = d === 0 ? a : Math.min(hours() - 1, a + 13);
  show();
}
function moveHour(by: number) {
  const a = windowStart(day); if (a < 0) return;
  cursor = Math.max(a, Math.min(a + Math.min(WINDOW, hours() - a) - 1, cursor + by));
  show();
}
const backToNow = () => pickDay(0);

$("chart").addEventListener("pointermove", (e) => {
  const a = windowStart(day), n = Math.min(WINDOW, hours() - a), box = $("chart").getBoundingClientRect();
  if (a < 0 || n < 2) return;
  const j = Math.round(((e.clientX - box.left - 14) / (box.width - 28)) * (n - 1));
  const next = a + Math.max(0, Math.min(n - 1, j));
  if (next !== cursor) { cursor = next; show(); }
});

// ---- talking to the extension -----------------------------------------------------

function apply(next: Reply, first = false) {
  reply = next;
  pal.title(next.title);
  $("place").querySelector("span")!.textContent = next.reading ? next.title : "Choose a place";
  if (next.setup) { openSearch(); return; }
  if (next.error && !next.reading) { note(next.error); return; }
  const keepDay = !first && day < (next.reading?.daily?.time?.length ?? 0) ? day : 0;
  chips(); days();
  pickDay(keepDay);
  if (first) sky.set(skyFor(-1), true);
  requestAnimationFrame(() => document.body.classList.add("in"));
}
async function call(msg: Record<string, unknown>): Promise<Reply | undefined> {
  try { return (await pal.send(msg)) as Reply; } catch (e) { note(String((e as Error)?.message ?? e)); }
}
let noteTimer: ReturnType<typeof setTimeout> | undefined;
function note(text: string) {
  const n = $("note"); n.textContent = text; n.hidden = false;
  clearTimeout(noteTimer); noteTimer = setTimeout(() => { n.hidden = true; }, 2600);
}
async function refresh() {
  const next = await call({ op: "refresh" });
  if (!next) return;
  if (next.error) note(next.error); else note("Up to date");
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
function closeSearch() {
  if (reply?.setup) return;
  $("search").hidden = true;
}
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
  day = 0;
  apply(next);
  sky.set(skyFor(-1));
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
  const k = e.key.toLowerCase();
  const map: Record<string, () => void> = {
    arrowleft: () => moveHour(e.shiftKey ? -3 : -1), arrowright: () => moveHour(e.shiftKey ? 3 : 1),
    arrowup: () => pickDay(day - 1), arrowdown: () => pickDay(day + 1),
    n: backToNow, home: backToNow, o: () => run("map"), enter: () => run("map"), r: () => run("refresh"), l: () => run("place"), "/": () => run("place"),
  };
  if (/^[1-7]$/.test(k)) { e.preventDefault(); pickDay(Number(k) - 1); return; }
  const f = map[k];
  if (f) { e.preventDefault(); f(); }
});

new ResizeObserver(() => { if (r()) chart(); }).observe($("chart"));
pal.onShown(async () => {
  sky.start();
  const next = await call({ op: "open" });
  if (next?.reading) apply(next);
  if (next?.stale) refresh();
});
pal.onHidden(() => sky.stop());

sky.start();
const first = await call({ op: "open" });
if (first) {
  apply(first, true);
  if (first.stale) refresh();
}
pal.ready();
