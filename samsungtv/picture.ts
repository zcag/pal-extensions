// The picture page, pure (the fixture and the tests draw it with this same
// function): the mode as chips, a slider per value in the TV's own range,
// the colour tone as chips. The arrows move between rows and change the one
// the keys are on; 1-5 pick a mode. A value the mode does not take (the TV
// refuses them all in Dynamic) is drawn greyed and does nothing.
import { CONTROL_LIT, column, keyHint, row, text, type Action, type View, type ViewNode } from "@zcag/pal";
import { FIELDS, MODES, TONES, modeName, modeOf } from "./protocol/ipc.ts";
import { G } from "./remote.ts";
import type { Picture, PictureField } from "./types.ts";

export type PictureState = {
  device?: string;
  /** Undefined until the TV answered. */
  picture?: Picture;
  /** The row the keys are on: 0 the modes, then each value, then the tones. */
  at: number;
  /** The values the TV refused in this mode. */
  refused: PictureField[];
  error?: string;
};

const ORDER = Object.keys(FIELDS) as PictureField[];
const LABEL: Record<PictureField, string> = { backlight: "Backlight", contrast: "Contrast", brightness: "Brightness", sharpness: "Sharpness", color: "Colour", tint: "Tint" };
export const ROWS = ORDER.length + 2;
/** The row the keys are on, by what it changes. */
export const rowOf = (at: number): "mode" | "tone" | PictureField => (at <= 0 ? "mode" : at > ORDER.length ? "tone" : ORDER[at - 1]);
/** The values the mode takes none of. */
export const lockedIn = (mode: string | undefined) => modeOf(mode) === "Dynamic";
export const refuses = (st: PictureState, f: PictureField) => lockedIn(st.picture?.mode) || st.refused.includes(f);

function chips(key: string, items: { id: string; name: string }[], current: string | undefined, prefix: string): ViewNode {
  return row(items.map((x): ViewNode => {
    const on = x.id === current;
    return { type: "stack", key: `${key}-${x.id}`, direction: "row", align: "center", padding: 1, surface: on ? CONTROL_LIT : "elevated", radius: true, action: `${prefix}${x.id}`, children: [text(x.name, { size: "xs", color: on ? "accent" : undefined, weight: on ? "semibold" : undefined })] };
  }), { key: `${key}-chips`, gap: 1 });
}

function line(st: PictureState, i: number, label: string, body: ViewNode): ViewNode {
  return row([text(label, { size: "sm", weight: st.at === i ? "semibold" : undefined, color: st.at === i ? undefined : "muted", width: 96 }), body], { key: `row-${i}`, gap: 2, minHeight: 28, padding: 1, radius: true, ...(st.at === i && { selected: true as const }) });
}

function slider(st: PictureState, f: PictureField, i: number): ViewNode {
  const { min, max } = FIELDS[f], v = st.picture?.values[f];
  const off = refuses(st, f);
  const body: ViewNode = v === undefined
    ? text("not told", { size: "xs", color: "faint" })
    : row([
      { type: "slider", key: `sl-${f}`, value: (v - min) / (max - min), width: 360, label: LABEL[f], ...(off ? { color: "grey" as const } : { action: `pic:set:${f}` }) },
      text(off ? `Not in ${modeName(st.picture?.mode)}` : String(v), { style: off ? undefined : "number", size: "xs", color: off ? "faint" : undefined, width: off ? 120 : 32, align: off ? undefined : "end", key: `v-${f}-${off ? "off" : v}` }),
    ], { key: `sv-${f}`, gap: 2 });
  return line(st, i, LABEL[f], body);
}

export function actions(st: PictureState): Action[] {
  const acts: Action[] = [
    { id: "pic:read", title: "Read the picture again", shortcut: "r" },
    { id: "pic:up", title: "Row up", shortcut: "up", hidden: true },
    { id: "pic:down", title: "Row down", shortcut: "down", hidden: true },
    { id: "pic:less", title: "Less, or the mode to the left", shortcut: "left" },
    { id: "pic:more", title: "More, or the mode to the right", shortcut: "right" },
  ];
  MODES.forEach(([id, name], i) => acts.push({ id: `pic:mode:${id}`, title: `${name} mode`, shortcut: String(i + 1) }));
  if (st.picture) for (const t of TONES) acts.push({ id: `pic:tone:${t}`, title: `Colour tone ${t}`, hidden: true });
  for (const f of ORDER) if (!refuses(st, f) && st.picture?.values[f] !== undefined) acts.push({ id: `pic:set:${f}`, title: `Set ${LABEL[f].toLowerCase()}`, hidden: true });
  return acts;
}

export function render(st: PictureState): View {
  const p = st.picture;
  const body: ViewNode[] = p
    ? [
      line(st, 0, "Mode", chips("mode", MODES.map(([id, name]) => ({ id, name })), modeOf(p.mode), "pic:mode:")),
      ...ORDER.map((f, i) => slider(st, f, i + 1)),
      line(st, ROWS - 1, "Colour tone", chips("tone", TONES.map((t) => ({ id: t, name: t })), p.tone, "pic:tone:")),
    ]
    : [text(st.error ?? "Asking the TV for its picture", { size: "sm", color: st.error ? "amber" : "muted", key: `wait-${st.error ? "error" : "asking"}` })];
  const tree = column([
    row([text(G.picture, { style: "glyph", size: "lg", color: "muted" }), text("Picture", { style: "title" }), text(st.device ?? "", { style: "muted", size: "xs" })], { key: "header", gap: 2, minHeight: 24 }),
    column(body, { key: "rows", gap: 1, padding: 2, surface: "elevated", radius: true }),
    ...(st.error && p ? [text(st.error, { size: "xs", color: "amber", key: "error" })] : []),
    { type: "spacer", key: "fill" },
    row([...keyHint(["up", "down"], "row"), ...keyHint(["left", "right"], "change"), ...keyHint("1-5", "mode"), ...keyHint("escape", "back")], { key: "hints", gap: 1 }),
  ], { key: "picture", padding: 3, gap: 3, grow: true });
  return { tree, actions: actions(st), title: `Picture${st.device ? ` · ${st.device}` : ""}`, id: "picture", keys: "actions" };
}
