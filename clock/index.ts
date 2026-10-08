// Clock: the time on the bar, and a popover with the month, the week and
// the world clocks. The strip is `Thu 8 Oct 14:32` (the item's `date` and
// `seconds` settings), pushed by a ticker of its own on the minute's (or
// the second's) boundary: the core's `minute` trigger counts sixty
// seconds from its own start, so a clock rendered by it would run up to
// a minute late. The popover is view.ts, a `{ view }` level ticking every
// second while it is open; the Clock palette is the same tree in the
// panel. Enter or a click on a day opens it in Calendar (`calendar`'s
// Today palette with `args.day`, suggested; a missing calendar gets the
// core's install offer). `z` opens the search row as a field for a city,
// written to the `zones` setting.
import { bar, dayName, isoDay, now, settings, view as liveView, type BarCtx, type BarItem, type Ctx, type Effect, type Extension, type View } from "@zcag/pal";
import { addDays, addMonths, barTitle, isoWeek, longDate, parseDay, resolveZone, startOfDay, zoneLine, type BarSettings, type Settings } from "./time.ts";
import { render, type ClockState } from "./view.ts";

const EXTENSION = "clock", PALETTE = "clock", ITEM = "time";
const BAR_DEFAULTS: BarSettings = { date: "day", seconds: false };

const conf = (): Settings => settings.get<Settings>(EXTENSION);
/** The item's settings as its last render or action had them: the ticker has no ctx. */
let barConf: BarSettings = BAR_DEFAULTS;

/** What the popover and the palette share: the ringed day (undefined: today) and the field. */
const pop = { sel: undefined as number | undefined, field: false };

function state(t = now()): ClockState {
  const s = conf();
  return {
    now: t,
    sel: pop.sel ?? startOfDay(t),
    zones: (s.zones ?? []).filter((z) => z.trim()).map(resolveZone),
    hour12: !!s.hour12,
    weekStart: s.week_start === "sunday" ? 0 : 1,
    field: pop.field,
  };
}

function item(t = now()): BarItem {
  const s = conf();
  return {
    title: barTitle(t, barConf, !!s.hour12),
    tooltip: `${longDate(t)}, week ${isoWeek(t)}`,
    menu: { view: render(state(t)) },
  };
}

// ---- the ticker ----------------------------------------------------------------------

let tick: ReturnType<typeof setTimeout> | undefined;
let lastTitle = "";
/** Where a view of ours is open (the popover; the palette, wide unless the popover shows it): each gets the view every second. */
const open = new Map<"bar" | "palette", boolean>();

/** The next boundary the strip or an open view needs: every second while either shows seconds, else the minute. */
function schedule() {
  clearTimeout(tick);
  const step = barConf.seconds || open.size ? 1000 : 60_000;
  const t = now();
  // A few ms past the boundary, so the time read then is already the new one.
  tick = setTimeout(beat, step - (t % step) + 5);
}

function beat() {
  const t = now();
  const title = barTitle(t, barConf, !!conf().hour12);
  if (title !== lastTitle) { lastTitle = title; bar.update(ITEM, item(t), EXTENSION).catch(() => {}); }
  if (open.size) {
    // The whole view: a tree alone is checked against no actions, and its nodes run some.
    const s = state(t);
    for (const [k, wide] of open) liveView.update(render(s, wide), k === "bar" ? { bar: ITEM, extension: EXTENSION } : { palette: PALETTE, extension: EXTENSION }).catch(() => {});
  }
  schedule();
}

liveView.onShown((ev) => {
  if (ev.bar === ITEM || ev.palette === PALETTE) { open.set(ev.bar ? "bar" : "palette", !ev.bar && !ev.compact); schedule(); }
}, EXTENSION);
liveView.onHidden((ev) => {
  if (ev.bar !== ITEM && ev.palette !== PALETTE) return;
  open.delete(ev.bar ? "bar" : "palette");
  // A popover opens on today again; the field does not outlive it.
  if (!open.size) { pop.sel = undefined; pop.field = false; }
  schedule();
}, EXTENSION);

// ---- actions -------------------------------------------------------------------------

/** The day pushed into Calendar's Today palette: in the popover from the bar, in the panel from the palette. */
const openDay = (day: number): Effect => ({ push: { extension: "calendar", palette: "today", args: { day: isoDay(day) }, title: day === startOfDay(now()) ? "Today" : dayName(day) } });

/** One action of the view, from the popover or the palette: an Effect when it leaves the view, else undefined (draw again). */
async function act(action: string, values?: Record<string, unknown>): Promise<Effect | undefined> {
  const t = now();
  const sel = pop.sel ?? startOfDay(t);
  const day = action.startsWith("day:") ? parseDay(action.slice(4)) : undefined;
  if (day !== undefined) return openDay(day);
  switch (action) {
    case "open": return openDay(sel);
    case "left": pop.sel = addDays(sel, -1); return;
    case "right": pop.sel = addDays(sel, 1); return;
    case "up": pop.sel = addDays(sel, -7); return;
    case "down": pop.sel = addDays(sel, 7); return;
    case "prev": pop.sel = addMonths(sel, -1); return;
    case "next": pop.sel = addMonths(sel, 1); return;
    case "today": pop.sel = undefined; return;
    case "copy": return { copy: isoDay(sel), hud: `Copied ${isoDay(sel)}` };
    case "zone": pop.field = true; return;
    case "cancel": pop.field = false; return;
    case "add": {
      const input = String(values?.input ?? "").trim();
      if (!input) { pop.field = false; return; }
      const z = resolveZone(input);
      if ("error" in z) return { keep: true, toast: { title: z.error, message: "Try a city like Tokyo or a zone like Europe/Berlin", style: "failure" } };
      const zones = conf().zones ?? [];
      pop.field = false;
      if (zones.some((l) => { const r = resolveZone(l); return "zone" in r && r.zone === z.zone && r.label === z.label; })) return { keep: true, hud: `${z.label} is already there` };
      await settings.set("zones", [...zones, zoneLine(z)]);
      return { keep: true, hud: `Added ${z.label}` };
    }
  }
}

export default {
  palettes: {
    [PALETTE]: {
      title: "Clock",
      view: (ctx?: Ctx): View => render(state(), !ctx?.compact),
      pick: async (_id: string, action?: string, ctx?: Ctx): Promise<Effect> => {
        const e = await act(action ?? "open", ctx?.values);
        if (e && !e.keep) return e;
        // What stays on the view (a move, the field, an added city) draws it again, with the HUD or toast it carried.
        const { keep: _, ...rest } = e ?? {};
        return { ...rest, view: render(state(), !ctx?.compact) };
      },
    },
  },
  bar: {
    [ITEM]: {
      render: (ctx: BarCtx): BarItem => {
        barConf = { ...BAR_DEFAULTS, ...(ctx.settings as Partial<BarSettings>) };
        const t = now();
        lastTitle = barTitle(t, barConf, !!conf().hour12);
        schedule();
        return item(t);
      },
      onAction: async (action: string, ctx: BarCtx): Promise<Effect> => {
        if (ctx.settings) barConf = { ...BAR_DEFAULTS, ...(ctx.settings as Partial<BarSettings>) };
        return (await act(action, ctx.values)) ?? { keep: true };
      },
    },
  },
  dispose: () => clearTimeout(tick),
} satisfies Extension;
