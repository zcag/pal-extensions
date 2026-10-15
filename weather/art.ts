// The weather icons: Meteocons (icons.ts), picked by the kind of sky and
// day or night, as SVG markup for the page and as `data:` images for the
// popover. Each copy's ids get a prefix of its own, since one page holds
// many of them and an icon's gradients are found by id.
import { ICONS } from "./icons.ts";
import type { Kind } from "./model.ts";

let seq = 0;
const NAME: Record<Kind, [day: string, night: string]> = {
  clear: ["clear-day", "clear-night"], partly: ["partly-cloudy-day", "partly-cloudy-night"], cloudy: ["overcast", "overcast"],
  fog: ["fog-day", "fog-night"], drizzle: ["drizzle", "drizzle"], rain: ["rain", "rain"], heavy: ["extreme-rain", "extreme-rain"],
  sleet: ["sleet", "sleet"], snow: ["snow", "snow"], storm: ["thunderstorms-rain", "thunderstorms-rain"], hail: ["thunderstorms-hail", "thunderstorms-hail"],
};

function sized(svg: string, size: number): string {
  const p = `wi${++seq}-`;
  return svg
    .replace(/\bid="([^"]+)"/g, (_, id) => `id="${p}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${p}${id})`)
    .replace(/href="#([^"]+)"/g, (_, id) => `href="#${p}${id}"`)
    // Meteocons draw inside a 128 frame with a wide margin: trimmed, the picture fills the size it is given.
    .replace(/viewBox="0 0 128 128"/, 'viewBox="12 12 104 104"')
    .replace(/^<svg\b/, `<svg width="${size}" height="${size}" aria-hidden="true"`);
}

/** The icon for a kind of sky, by day or night, as SVG markup `size` px square. */
export const weatherArt = (kind: Kind, night = false, size = 64) => sized(ICONS[NAME[kind][night ? 1 : 0]], size);
/** Sunrise or sunset. */
export const sunArt = (rise: boolean, size = 26) => sized(ICONS[rise ? "sunrise" : "sunset"], size);
/**
 * The same as an image source, for a view tree's `image` node. The popover
 * follows the theme and white clouds vanish on a light one, so the icon
 * sits on a soft shadow that reads on both.
 */
export function weatherArtUrl(kind: Kind, night = false, size = 64): string {
  const shadowed = weatherArt(kind, night, size)
    .replace(/(<svg\b[^>]*>)/, `$1<defs><filter id="wi-ds" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.6" flood-color="#1b2433" flood-opacity=".38"/></filter></defs><g filter="url(#wi-ds)">`)
    .replace(/<\/svg>\s*$/, "</g></svg>");
  return `data:image/svg+xml,${encodeURIComponent(shadowed)}`;
}
