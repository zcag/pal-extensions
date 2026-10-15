// The weather illustrations: colour SVG on a 64 grid, shared by the page
// (inline) and the popover (as `data:` images). They read on light and dark:
// the clouds carry a faint outline and the flakes are blue, not white.
import type { Kind } from "./model.ts";

let seq = 0;
const CLOUD = "M19 46H46A9 9 0 0 0 47.5 28.1A13 13 0 0 0 22.4 25.6A10.2 10.2 0 0 0 19 46Z";
const TONES = { light: ["#FFFFFF", "#D3DBE6"], grey: ["#E2E7EE", "#A9B4C3"], dark: ["#AEB7C6", "#6E798C"], night: ["#D9DEEB", "#9BA4BF"] } as const;
type Tone = keyof typeof TONES;

function defs(p: string): string {
  const tone = (t: Tone) => `<linearGradient id="${p}c-${t}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${TONES[t][0]}"/><stop offset="1" stop-color="${TONES[t][1]}"/></linearGradient>`;
  return `<defs>
<radialGradient id="${p}sun" cx=".38" cy=".36" r=".7"><stop offset="0" stop-color="#FFF1A8"/><stop offset=".55" stop-color="#FFC531"/><stop offset="1" stop-color="#FF9A1F"/></radialGradient>
<radialGradient id="${p}moon" cx=".35" cy=".35" r=".75"><stop offset="0" stop-color="#FFF9E3"/><stop offset="1" stop-color="#E9D7A0"/></radialGradient>
<linearGradient id="${p}drop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FD0FF"/><stop offset="1" stop-color="#2F7FE8"/></linearGradient>
<linearGradient id="${p}bolt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFEB7A"/><stop offset="1" stop-color="#FFA600"/></linearGradient>
${(Object.keys(TONES) as Tone[]).map(tone).join("")}
<mask id="${p}crescent"><rect width="64" height="64" fill="#fff"/><circle cx="40" cy="22" r="13" fill="#000"/></mask>
</defs>`;
}

const sun = (p: string, cx: number, cy: number, r: number) => {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a);
    return `<line x1="${(cx + c * (r + 4)).toFixed(1)}" y1="${(cy + s * (r + 4)).toFixed(1)}" x2="${(cx + c * (r + 8.5)).toFixed(1)}" y2="${(cy + s * (r + 8.5)).toFixed(1)}"/>`;
  }).join("");
  return `<g stroke="#FFB21F" stroke-width="3.2" stroke-linecap="round">${rays}</g><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${p}sun)"/>`;
};
const moon = (p: string, cx: number, cy: number, r: number) =>
  `<g transform="translate(${cx - 32 * r / 15} ${cy - 32 * r / 15}) scale(${r / 15})"><circle cx="32" cy="32" r="15" fill="url(#${p}moon)" mask="url(#${p}crescent)"/></g>`;
const star = (x: number, y: number, s: number) => `<path d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z" fill="#FFE9A8"/>`;
const cloud = (p: string, tone: Tone, x = 0, y = 0, s = 1) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="${CLOUD}" fill="url(#${p}c-${tone})" stroke="#4A5568" stroke-opacity=".28" stroke-width="${(1.1 / s).toFixed(2)}"/>`;
const streaks = (p: string, pts: [number, number, number][]) =>
  `<g stroke="url(#${p}drop)" stroke-width="3.2" stroke-linecap="round">${pts.map(([x, y, l]) => `<line x1="${x}" y1="${y}" x2="${x - l * 0.35}" y2="${y + l}"/>`).join("")}</g>`;
const flakes = (pts: [number, number][]) =>
  `<g stroke="#6FB2F2" stroke-width="2.2" stroke-linecap="round">${pts.map(([x, y]) => `<path d="M${x} ${y - 4}V${y + 4}M${x - 3.5} ${y - 2}L${x + 3.5} ${y + 2}M${x - 3.5} ${y + 2}L${x + 3.5} ${y - 2}"/>`).join("")}</g>`;
const bolt = (p: string) => `<path d="M34 40L25 53H32L28 62L42 47H35L39 40Z" fill="url(#${p}bolt)" stroke="#E08A00" stroke-width=".8" stroke-linejoin="round"/>`;
const fogLines = `<g stroke="#9EA9B8" stroke-width="3.4" stroke-linecap="round"><line x1="12" y1="46" x2="50" y2="46"/><line x1="17" y1="53" x2="47" y2="53"/><line x1="13" y1="60" x2="40" y2="60"/></g>`;

/** The illustration for a kind of sky, by day or night, as SVG markup `size` px square. */
export function weatherArt(kind: Kind, night = false, size = 64): string {
  const p = `wa${++seq}-`;
  const lit = night ? moon(p, 42, 21, 11) + star(14, 12, 3) + star(24, 6, 2) : sun(p, 41, 21, 9.5);
  const top = night ? "night" : "light";
  const body: Record<Kind, () => string> = {
    clear: () => night ? moon(p, 30, 32, 17) + star(50, 14, 3.4) + star(14, 18, 2.6) + star(50, 46, 2.2) : sun(p, 32, 32, 13),
    partly: () => lit + cloud(p, top, -6, 8, 0.92),
    cloudy: () => cloud(p, "grey", 12, -6, 0.72) + cloud(p, top, -3, 5, 0.95),
    fog: () => cloud(p, "grey", 0, -10, 0.9) + fogLines,
    drizzle: () => cloud(p, "grey", 0, -9) + streaks(p, [[24, 44, 6], [34, 47, 6], [44, 44, 6]]),
    rain: () => cloud(p, "grey", 0, -10) + streaks(p, [[22, 43, 11], [33, 45, 13], [44, 43, 11]]),
    heavy: () => cloud(p, "dark", 0, -11) + streaks(p, [[18, 41, 13], [27, 44, 15], [36, 41, 13], [45, 44, 15]]),
    sleet: () => cloud(p, "grey", 0, -10) + streaks(p, [[24, 43, 10]]) + flakes([[38, 49], [30, 58]]),
    snow: () => cloud(p, "grey", 0, -10) + flakes([[22, 47], [36, 51], [48, 45], [29, 59]]),
    storm: () => cloud(p, "dark", 0, -12) + bolt(p),
    hail: () => cloud(p, "dark", 0, -12) + bolt(p) + `<g fill="#E4F0FB" stroke="#7FA9D3" stroke-width="1"><circle cx="18" cy="50" r="2.6"/><circle cx="48" cy="54" r="2.6"/></g>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${defs(p)}${body[kind]()}</svg>`;
}

/** The same as an image source, for a view tree's `image` node. */
export const weatherArtUrl = (kind: Kind, night = false, size = 64) => `data:image/svg+xml,${encodeURIComponent(weatherArt(kind, night, size))}`;
