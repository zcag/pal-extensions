// atc's event stream (`GET /api/events`, server-sent events): the whole
// session list again whenever anything in it changes, which atc checks
// every two seconds. The latest list is kept here and every listener told,
// so the bar, an open chat and a palette all follow a session as it works
// without polling. The bar's own 30 s render stays as the safety net. A
// dropped stream reconnects after RETRY_MS; a wake or a settings change
// reconnects at once.
import { errorMessage } from "@zcag/pal";
import { headers, log, server, tls, type Session } from "./api.ts";

const RETRY_MS = 10_000;

let latest: Session[] | undefined, latestAt = 0;
let abort: AbortController | undefined, identity = "", retry: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<(list: Session[]) => void>();

/** The last list the stream (or a fetch) brought, and when. */
export const cached = () => (latest ? { list: latest, at: latestAt } : undefined);
/** A list fetched by hand counts too: the listeners hear it only when it differs. */
export function feed(list: Session[]) {
  const same = latest && JSON.stringify(latest) === JSON.stringify(list);
  latest = list;
  latestAt = Date.now();
  if (!same) for (const f of listeners) f(list);
}
export const listen = (f: (list: Session[]) => void) => { listeners.add(f); return () => listeners.delete(f); };

/** Connected for the server at hand: a no-op when it already is, a new stream when the server or token changed. */
export function start() {
  const { url, token } = server();
  const id = `${url}|${token}`;
  if (abort && id === identity) return;
  stop();
  if (!url) return;
  identity = id;
  const ctl = (abort = new AbortController());
  connect(ctl, url);
}

async function connect(ctl: AbortController, url: string) {
  try {
    const r = await fetch(`${url}/api/events`, { headers: { ...headers(), accept: "text/event-stream" }, signal: ctl.signal, tls: tls() });
    if (!r.ok || !r.body) throw new Error(`${r.status} ${r.statusText}`);
    log("stream: connected");
    const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
        if (!data) continue;
        try { feed(JSON.parse(data) as Session[]); } catch { /* a partial or foreign event */ }
      }
    }
    if (!ctl.signal.aborted) log("stream: closed by the server");
  } catch (e) {
    if (ctl.signal.aborted) return;
    log(`stream: ${errorMessage(e)}`);
  }
  if (ctl.signal.aborted || abort !== ctl) return;
  retry = setTimeout(() => { if (abort === ctl) connect(ctl, url); }, RETRY_MS);
}

export function stop() {
  clearTimeout(retry);
  abort?.abort();
  abort = undefined;
  identity = "";
}

/** After a wake or a network change the old stream may be dead without knowing it. */
export const restart = () => { stop(); start(); };
/** Forget the list (tests, a server change). */
export const reset = () => { latest = undefined; latestAt = 0; };
