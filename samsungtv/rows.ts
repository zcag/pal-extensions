// The list palettes' rows, pure (the fixture builds the store shots from
// these): an app with its icon, the commands at the root, the inputs, and
// with IP Control the sound outputs, the picture modes and a web page.
// Every row names the TV it acts on, so with two paired the root never
// leaves you guessing which one a key goes to.
import { hint, type Action, type Item } from "@zcag/pal";
import { MODES } from "./protocol/ipc.ts";
import { G, outputName } from "./remote.ts";
import type { App, Input, SoundOutput } from "./types.ts";

/** The row every palette shows while nothing is paired. */
export const SETUP_ROW: Item = { id: "setup", name: "Set Up Samsung TV", subtitle: "Find the TV on this network and press Allow on it", icon: G.remote, actions: [{ id: "setup", title: "Set up" }] };

export const APP_ACTIONS = (inDock: boolean): Action[] => [
  { id: "launch", title: "Open on the TV" },
  { id: "launch:remote", title: "Open, then show the remote", shortcut: "cmd+enter" },
  { id: "dock", title: inDock ? "Remove from the dock" : "Add to the dock", shortcut: "cmd+d" },
  { id: "quit", title: "Close on the TV", shortcut: "cmd+w" },
  { id: "copy", title: "Copy the app id", shortcut: "cmd+c" },
];

export function appRow(a: App, art: string, o: { device: string; front?: boolean; dock?: number }): Item {
  return {
    id: a.id,
    name: a.name,
    subtitle: o.front ? `On screen on ${o.device}` : `Open on ${o.device}`,
    icon: { image: art },
    keywords: ["samsung", "tv"],
    accessories: [...(o.front ? [{ tag: "on screen", color: "green" as const }] : []), ...(o.dock !== undefined ? [{ keys: String(o.dock + 1) }] : [])],
    actions: APP_ACTIONS(o.dock !== undefined),
  };
}

type Cmd = { id: string; name: string; icon: string; keywords?: string[] };

/** The commands that make sense as root rows: what the remote's buttons do. */
export const COMMANDS: Cmd[] = [
  { id: "wake", name: "Turn On", icon: G.power, keywords: ["power", "wake"] },
  { id: "standby", name: "Turn Off", icon: G.standby, keywords: ["power", "standby", "sleep", "off"] },
  { id: "home", name: "Go Home", icon: G.home, keywords: ["smart hub", "home screen"] },
  { id: "play-pause", name: "Play or Pause", icon: G.playPause, keywords: ["resume", "stop"] },
  { id: "mute", name: "Mute or Unmute", icon: G.mute, keywords: ["sound", "quiet"] },
  { id: "volume-up", name: "Volume Up", icon: G.volUp, keywords: ["louder"] },
  { id: "volume-down", name: "Volume Down", icon: G.volDown, keywords: ["quieter"] },
  { id: "menu", name: "Open the TV's Settings", icon: G.settings, keywords: ["menu", "picture", "sound"] },
  { id: "guide", name: "Guide", icon: G.guide, keywords: ["channels", "epg"] },
];

/** What IP Control adds at the root once it is paired: the outputs (and Reconnect Sound while one other than the TV's speakers plays), the picture modes, a web page. */
export type IpcRows = { outputs: SoundOutput[]; reconnect: boolean };

export function commandRows(device: string, others: string[], inputs: Input[], ipc?: IpcRows): Item[] {
  const cmd = (id: string, name: string, icon: string, keywords: string[]): Item => ({ id, name, subtitle: device, icon, keywords: ["samsung", "tv", ...keywords], actions: [{ id: "run", title: name }] });
  const rows: Item[] = COMMANDS.map((c) => cmd(c.id, c.name, c.icon, c.keywords ?? []));
  const label: Record<string, string> = { hdmi: "Next HDMI Input", source: "Open the Input Menu", tv: "Switch to TV" };
  for (const i of inputs) rows.push(cmd(`input:${i.id}`, label[i.id] ?? `Switch to ${i.name}`, G.hdmi, ["input", "source", "hdmi", ...(i.id.startsWith("hdmi") && i.id.length > 4 ? [`hdmi ${i.id.slice(4)}`] : [])]));
  if (ipc) {
    if (ipc.reconnect) rows.push(cmd("sound:reconnect", "Reconnect Sound", G.reconnect, ["sound", "soundbar", "q-symphony", "audio", "fix"]));
    for (const o of ipc.outputs) rows.push(cmd(`sound:${o.id}`, `Sound to ${outputName(o, ipc.outputs)}`, G.speaker, ["sound", "output", "speaker", "audio", o.name]));
    for (const [id, name] of MODES) rows.push(cmd(`picture:${id}`, `${name} Picture Mode`, G.picture, ["picture", "mode"]));
    rows.push(cmd("open", "Open the Copied Link on the TV", G.web, ["browser", "url", "web", "link"]));
  }
  for (const o of others) rows.push({ id: `device:${o}`, name: `Switch to ${o}`, subtitle: "Make it the TV the remote and these commands control", icon: G.tv, keywords: ["samsung", "tv"], actions: [{ id: "run", title: `Switch to ${o}` }] });
  rows.push({ id: "setup", name: "Set Up Samsung TV", subtitle: "Pair another TV, or pair this one again", icon: G.remote, keywords: ["samsung", "tv", "pair"], actions: [{ id: "setup", title: "Set up" }] });
  return rows;
}

export const noTv = (why: string): Item[] => [hint("away", why, "Enter tries again; the remote shows more", { icon: G.wifiOff, actions: [{ id: "retry", title: "Try again" }] })];
