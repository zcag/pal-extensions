// The extension's half of the terminal page (surface/main.ts): one
// websocket per open terminal to atc's `/api/sessions/{id}/attach`, the same
// one atc's web page opens, relayed both ways. Output is gathered for a frame
// and posted to the page as base64; what the page types is written as bytes,
// so typing makes this viewer the one whose size the terminal takes, as in
// atc's page. A page that hides says so (`hidden`, so a phone or the desktop
// keeps the size); a page that goes away closes its socket.
import { surface } from "@zcag/pal";
import { headers, log, tls, url } from "./api.ts";

/** Output within this is one post: a screenful arrives in a few dozen chunks. */
const FLUSH_MS = 16;
const OPEN_MS = 8000;

type Conn = { ws: WebSocket; out: Uint8Array[]; timer?: ReturnType<typeof setTimeout>; closed: boolean };
const conns = new Map<string, Conn>();
const enc = new TextEncoder();

const post = (key: string, msg: unknown) => surface.post(msg, { palette: "terminal", id: key }).catch(() => {});

function flush(key: string, c: Conn) {
  c.timer = undefined;
  if (!c.out.length) return;
  const all = Buffer.concat(c.out);
  c.out = [];
  post(key, { op: "data", b64: all.toString("base64") });
}

/** The page's terminal joined to session `id` (its background id) under the level's `key`; false when it already was. */
export function connect(key: string, id: string, cols: number, rows: number): Promise<boolean> {
  const had = conns.get(key);
  if (had && !had.closed) { had.ws.send(JSON.stringify({ type: "visible" })); return Promise.resolve(false); }
  const target = url(`/api/sessions/${encodeURIComponent(id)}/attach`, { cols, rows }).replace(/^http/, "ws");
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target, { headers: headers(), tls: tls() } as unknown as string[]);
    ws.binaryType = "arraybuffer";
    const c: Conn = { ws, out: [], closed: false };
    conns.set(key, c);
    const timer = setTimeout(() => { ws.close(); reject(new Error("The session's terminal did not answer")); }, OPEN_MS);
    ws.onopen = () => { clearTimeout(timer); ws.send(JSON.stringify({ type: "visible" })); resolve(true); };
    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        try { const m = JSON.parse(ev.data) as { type: string; code?: number }; if (m.type === "exit") post(key, { op: "exit", why: m.code ? `The terminal ended (exit ${m.code}). Escape goes back.` : undefined }); } catch { /* not a control message */ }
        return;
      }
      c.out.push(new Uint8Array(ev.data as ArrayBuffer));
      c.timer ??= setTimeout(() => flush(key, c), FLUSH_MS);
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error("Could not reach the session's terminal")); };
    ws.onclose = () => { c.closed = true; clearTimeout(c.timer); flush(key, c); if (conns.get(key) === c) conns.delete(key); log(`terminal ${id}: closed`); };
  });
}

export function input(key: string, data: string) {
  const c = conns.get(key);
  if (!c || c.closed) throw new Error("Not connected: Escape and open it again");
  c.ws.send(enc.encode(data));
}

/** The page's size; `claim` makes this viewer the one the terminal takes its size from without typing. */
export function resize(key: string, cols: number, rows: number, claim = false) {
  const c = conns.get(key);
  if (!c || c.closed) return;
  c.ws.send(JSON.stringify({ type: "resize", cols, rows }));
  if (claim) c.ws.send(JSON.stringify({ type: "claim" }));
}

export const hidden = (key: string) => { const c = conns.get(key); if (c && !c.closed) c.ws.send(JSON.stringify({ type: "hidden" })); };
export const close = (key: string) => { conns.get(key)?.ws.close(); conns.delete(key); };
export const closeAll = () => { for (const k of [...conns.keys()]) close(k); };
