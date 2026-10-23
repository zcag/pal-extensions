// Keys into a session's terminal, for what `POST /send` cannot say: Enter
// on a permission prompt (allow), Escape (say no, or stop the turn). atc
// has no route for a bare key, so this joins the session's terminal the
// way its web page does (`/api/sessions/{id}/attach`, a websocket) and
// writes the bytes, as atc's own voice mode does. It joins hidden and
// takes the size the terminal already has before writing, since the
// viewer that writes becomes the one whose size the terminal takes: a
// session open on the desktop is not resized under it.
import { headers, tls, url } from "./api.ts";

export const KEY = { enter: "\r", escape: "\x1b" } as const;
const WAIT_MS = 4000;
/** After the write, how long the socket stays so the bytes reach the terminal before it leaves. */
const LINGER_MS = 300;

export function sendKeys(id: string, bytes: string): Promise<void> {
  const target = url(`/api/sessions/${encodeURIComponent(id)}/attach`, { hidden: 1, reconnect: 1 }).replace(/^http/, "ws");
  return new Promise((resolve, reject) => {
    // Bun's WebSocket takes headers (the token) and the certificates to trust.
    const ws = new WebSocket(target, { headers: headers(), tls: tls() } as unknown as string[]);
    ws.binaryType = "arraybuffer";
    let wrote = false;
    const done = (err?: Error) => { clearTimeout(timer); try { ws.close(); } catch { /* closed */ } err ? reject(err) : resolve(); };
    const timer = setTimeout(() => done(new Error("The session's terminal did not answer")), WAIT_MS);
    const write = (size?: { cols: number; rows: number }) => {
      if (wrote) return;
      wrote = true;
      if (size) ws.send(JSON.stringify({ type: "resize", cols: size.cols, rows: size.rows }));
      ws.send(new TextEncoder().encode(bytes));
      setTimeout(() => done(), LINGER_MS);
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      try {
        const c = JSON.parse(ev.data) as { type: string; cols?: number; rows?: number; code?: number };
        if (c.type === "size" && c.cols && c.rows) write({ cols: c.cols, rows: c.rows });
        else if (c.type === "exit") done(new Error("The session's terminal closed"));
      } catch { /* not a control message */ }
    };
    ws.onerror = () => done(new Error("Could not reach the session's terminal"));
    ws.onclose = () => { if (!wrote) done(new Error("The session's terminal closed")); };
  });
}
