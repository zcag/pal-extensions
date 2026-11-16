// What a code is for, read off its sender and message (English and Turkish
// words), and the sender as a person would write it. Rows wear the kind as
// their tile and the palette filters on it.
import { tile, type TileColor, type TileIcon } from "@zcag/pal";

export type Kind = "card" | "bank" | "gov" | "delivery" | "shop" | "signin";

export const KINDS: Record<Kind, { title: string; color: TileColor; glyph: string }> = {
  card: { title: "Card", color: "blue", glyph: "\u{f0fef}" },
  bank: { title: "Bank", color: "violet", glyph: "\u{f0070}" },
  gov: { title: "Government", color: "red", glyph: "\u{f1875}" },
  delivery: { title: "Delivery", color: "orange", glyph: "\u{f053e}" },
  shop: { title: "Shopping", color: "amber", glyph: "\u{f0110}" },
  signin: { title: "Sign-in", color: "green", glyph: "\u{f0306}" },
};

const RULES: [Kind, RegExp][] = [
  ["card", /3-?d ?secure|\bcard\b|\bkart\b|kredi kart|cepsifre/],
  ["gov", /e-?devlet|\bgib\b|e-?arsiv|turkiye\.gov|\bvergi|\bsgk\b|\bmhrs\b|\buyap\b|government|\.gov\b/],
  ["bank", /bank|enpara|garanti|ziraat|yapi ?kredi|\bqnb\b|vakif|\bsube|findeks|risk ?merkezi|internet sifre|hesab/],
  ["delivery", /teslimat|kargo|kurye|delivery|pickup|courier|parcel/],
  ["shop", /siparis|\border\b|alisveris|magaza|bilet|ticket/],
];

const fold = (s: string) => s.toLowerCase().replace(/[şŞ]/g, "s").replace(/[ıİ]/g, "i").replace(/[ğĞ]/g, "g").replace(/[üÜ]/g, "u").replace(/[öÖ]/g, "o").replace(/[çÇ]/g, "c");

export function kindOf(sender: string, text: string): Kind {
  const s = fold(`${sender} ${text}`);
  return RULES.find(([, re]) => re.test(s))?.[0] ?? "signin";
}

export const kindIcon = (k: Kind) => tile(KINDS[k].color, KINDS[k].glyph) as TileIcon;

/** `*Enpara` reads `Enpara`, a shouty `E-DEVLET` reads `E-Devlet`; a name with lower case, a number or a short code like `GIB` stays. */
export function pretty(raw: string): string {
  const s = raw.replace(/^[^\p{L}\p{N}]+/u, "").trim() || raw;
  if (s.length <= 3 || /\p{Ll}/u.test(s) || !/\p{Lu}/u.test(s)) return s;
  return s.replace(/İ/g, "I").toLowerCase().replace(/(^|[\s\-./])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
}
