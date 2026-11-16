// Wisp's event stream (`GET /api/v1/events`, server-sent events): an
// `unread.changed` on connect and whenever the total moves, a
// `message.new` for every message that arrives, a `todo.due` when a To do
// comes back. Listeners hear each event; the bar and an open conversation
// fetch what they show again. Content is not asked for: the listeners
// fetch it with the token anyway. A dropped stream reconnects after
// RETRY_MS; a wake, a network change or new settings reconnect at once.
import { errorMessage } from "@zcag/pal";
import { base, conf, events, log } from "./api.ts";

const RETRY_MS = 10_000;

export type Event =
  | { type: "unread.changed"; data: { unread: number } }
  | { type: "message.new"; data: { conversationId: number; accountId: number; channel: string; sender: string; conversationTitle: string } }
  | { type: "todo.due"; data: { conversationId: number } };

let abort: AbortController | undefined, identity = "", retry: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<(e: Event) => void>();

export const listen = (f: (e: Event) => void) => { listeners.add(f); return () => listeners.delete(f); };

/** Connected for the server and token at hand: a no-op when it already is. */
export function start() {
  const id = `${base()}|${conf().token ?? ""}`;
  if (abort && id === identity) return;
  stop();
  if (!base() || !conf().token) return;
  identity = id;
  connect((abort = new AbortController()));
}

async function connect(ctl: AbortController) {
  try {
    const r = await events(ctl.signal);
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
        let ev: Event;
        try { ev = JSON.parse(data) as Event; } catch { continue; }
        for (const f of listeners) { try { f(ev); } catch (e) { log(`listener: ${errorMessage(e)}`); } }
      }
    }
    if (!ctl.signal.aborted) log("stream: closed by the server");
  } catch (e) {
    if (ctl.signal.aborted) return;
    log(`stream: ${errorMessage(e)}`);
  }
  if (ctl.signal.aborted || abort !== ctl) return;
  retry = setTimeout(() => { if (abort === ctl) connect(ctl); }, RETRY_MS);
}

export function stop() {
  clearTimeout(retry);
  abort?.abort();
  abort = undefined;
  identity = "";
}

export const restart = () => { stop(); start(); };
