// The terminal page: a session's own terminal (Claude Code's screen, as
// `atc attach` shows it) inside the panel. xterm.js draws it in the panel's
// colours; the bytes come and go through the extension (terminal.ts), which
// holds the websocket to atc, since the page itself reaches nothing but its
// own folder. Escape leaves the level as everywhere in pal, so the Escape
// key Claude Code wants is `ctrl+[` (what a terminal sends for it anyway) or
// the `cmd+.` action.
import type { SurfaceKit } from "@zcag/pal";

declare const pal: SurfaceKit;
type Term = {
  cols: number; rows: number;
  open(el: HTMLElement): void; write(d: Uint8Array | string): void; reset(): void; focus(): void;
  onData(fn: (d: string) => void): void; onBinary(fn: (d: string) => void): void;
  loadAddon(a: unknown): void; options: Record<string, unknown>; unicode: { activeVersion: string };
};
declare const Terminal: new (o: Record<string, unknown>) => Term;
declare const FitAddon: { FitAddon: new () => { fit(): void } };
declare const Unicode11Addon: { Unicode11Addon: new () => unknown };

type Post = { op: "data"; b64: string } | { op: "exit"; why?: string };

const $ = (id: string) => document.getElementById(id)!;
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function theme() {
  const fg = css("--pal-fg") || "#222";
  return {
    background: "#00000000", foreground: fg, cursor: css("--pal-accent") || fg, cursorAccent: css("--pal-bg") || "#fff", selectionBackground: css("--pal-selection") || "#8884",
    red: css("--pal-tag-red"), green: css("--pal-tag-green"), yellow: css("--pal-tag-amber"), blue: css("--pal-tag-blue"), magenta: css("--pal-tag-violet"), cyan: css("--pal-tag-teal"),
    brightRed: css("--pal-tag-red"), brightGreen: css("--pal-tag-green"), brightYellow: css("--pal-tag-amber"), brightBlue: css("--pal-tag-blue"), brightMagenta: css("--pal-tag-pink"), brightCyan: css("--pal-tag-teal"),
    black: css("--pal-fg-muted"), brightBlack: css("--pal-fg-faint"), white: css("--pal-fg-muted"), brightWhite: fg,
  };
}

const term = new Terminal({ allowTransparency: true, allowProposedApi: true, fontFamily: css("--pal-font-mono") || "ui-monospace, monospace", fontSize: 13, lineHeight: 1.15, cursorBlink: true, scrollback: 5000, macOptionIsMeta: true, theme: theme() });
const fit = new FitAddon.FitAddon();
term.loadAddon(fit);
term.loadAddon(new Unicode11Addon.Unicode11Addon());
term.unicode.activeVersion = "11";
term.open($("term"));
fit.fit();

const note = (text?: string) => { const n = $("note"); n.hidden = !text; n.textContent = text ?? ""; };
const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const send = (msg: Record<string, unknown>) => pal.send(msg).catch((e) => note(e instanceof Error ? e.message : String(e)));

async function open() {
  fit.fit();
  try {
    const r = (await pal.send({ op: "open", cols: term.cols, rows: term.rows })) as { title?: string; fresh?: boolean };
    if (r?.fresh) term.reset();
    if (r?.title) pal.title(r.title);
    note();
    term.focus();
  } catch (e) {
    note(e instanceof Error ? e.message : String(e));
  }
}

pal.on((m: Post) => {
  if (m.op === "data") term.write(bytes(m.b64));
  else if (m.op === "exit") note(m.why ?? "The session's terminal closed. Escape goes back.");
});
term.onData((data) => send({ op: "input", data }));
term.onBinary((data) => send({ op: "input", data }));

let resizing: ReturnType<typeof setTimeout> | undefined;
new ResizeObserver(() => {
  clearTimeout(resizing);
  resizing = setTimeout(() => { fit.fit(); send({ op: "resize", cols: term.cols, rows: term.rows }); }, 60);
}).observe($("term"));

pal.onAction((id) => {
  if (id === "escape") send({ op: "input", data: "\x1b" });
  else if (id === "fit") { fit.fit(); send({ op: "resize", cols: term.cols, rows: term.rows, claim: true }); }
});
pal.onTheme(() => { term.options.theme = theme(); });
pal.onShown(() => { open(); });
pal.onHidden(() => { send({ op: "hidden" }); });
window.addEventListener("pagehide", () => { pal.send({ op: "close" }).catch(() => {}); });

await open();
pal.ready();
