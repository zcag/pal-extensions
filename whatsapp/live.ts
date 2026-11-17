// The bar's push: Wisp's event stream (wisp/live.ts, the Wisp extension's
// own reader), so a WhatsApp message refreshes the bar within a second
// instead of at the next 30 s poll. A `message.new` on the WhatsApp
// account, or an `unread.changed` that moved its unread, drops the chat
// list and renders the bar again; the poll stays as the floor.
import { bar } from "@zcag/pal";
import * as stream from "../wisp/live.ts";
import { accountId, dropChats } from "./data.ts";

const DEBOUNCE_MS = 300;

let debounce: ReturnType<typeof setTimeout> | undefined, unlisten: (() => void) | undefined, lastUnread: number | undefined;

function refreshSoon() {
  clearTimeout(debounce);
  debounce = setTimeout(() => { dropChats(); bar.refresh("unread", "whatsapp").catch(() => {}); }, DEBOUNCE_MS);
}

async function heard(e: stream.Event) {
  const acc = await accountId().catch(() => undefined);
  if (acc === undefined) return;
  if (e.type === "message.new" && e.data.accountId === acc) return refreshSoon();
  if (e.type === "unread.changed") {
    const n = (e.data as { accounts?: { accountId: number; unread: number }[] }).accounts?.find((a) => a.accountId === acc)?.unread;
    if (n !== undefined && n !== lastUnread) { const first = lastUnread === undefined; lastUnread = n; if (!first) refreshSoon(); }
  }
}

/** Listening, the stream connected for Wisp's server and token at hand. */
export function start() {
  unlisten ??= stream.listen((e) => { heard(e); });
  stream.start();
}

export function stop() {
  unlisten?.(); unlisten = undefined; lastUnread = undefined;
  clearTimeout(debounce);
  stream.stop();
}

/** After a wake or a network change the old connection may be a dead one that has not noticed yet. */
export const wake = () => stream.restart();
