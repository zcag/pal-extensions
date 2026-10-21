// The bar's push: OpenWA's socket.io stream (`/events`, the key as
// `auth.apiKey`), subscribed to the session's message events, so a
// message refreshes the bar within a second instead of at the next 120 s
// poll. The poll stays and the stream is never trusted on its word: a
// subscribe or a ping still unanswered at the next tick reconnects, the gateway
// dropping us reconnects after RETRY_MS (socket.io gives up on that one by
// itself), a wake or a network change reconnects, and a poll that finds a
// newer unread message than any event carried marks it deaf and
// reconnects. While it is down, or deaf until an event comes again, the
// bar refreshes every TICK_MS.
import { bar, errorMessage } from "@zcag/pal";
import { io, type Socket } from "socket.io-client";
import { base, conf, log, sessionId, sessionName } from "./api.ts";
import { dropChats, type Chat } from "./data.ts";

const EVENTS = ["message.received", "message.sent", "message.revoked", "message.edited"];
const TICK_MS = 30_000, RETRY_MS = 30_000, DEBOUNCE_MS = 300;
/** How long after a message's own time its event may still be on the way before a poll calls it missed. */
const GRACE_MS = 15_000;

type WsReply = { type: string; code?: string; message?: string };
type WsEvent = { type: "event"; payload: { event: string; data?: { timestamp?: number } } } | (WsReply & { type: "error" });

let socket: Socket | undefined, identity = "";
let tick: ReturnType<typeof setInterval> | undefined, retry: ReturnType<typeof setTimeout> | undefined, debounce: ReturnType<typeof setTimeout> | undefined;
/** Subscribed since (ms), 0 while not. */
let upSince = 0;
/** The newest message time (ms) an event carried. */
let seenAt = 0;
let deaf = false;
/** What the stream was asked and has not answered yet. */
let awaiting: "subscribe" | "ping" | undefined;

export const healthy = () => upSince > 0 && !deaf;

function refreshSoon() {
  clearTimeout(debounce);
  debounce = setTimeout(() => { dropChats(); bar.refresh("unread", "whatsapp").catch(() => {}); }, DEBOUNCE_MS);
}

function reconnect(why: string) {
  if (!socket) return;
  log(`stream: reconnecting (${why})`);
  upSince = 0;
  awaiting = undefined;
  clearTimeout(retry);
  socket.disconnect().connect();
}

async function subscribe(s: Socket) {
  awaiting = "subscribe";
  try {
    const sid = await sessionId();
    s.emit("message", { type: "subscribe", sessionId: sid, events: EVENTS }, (r: WsReply) => {
      if (r?.type !== "subscribed") return refused(s, r?.message ?? JSON.stringify(r));
      awaiting = undefined;
      upSince = Date.now();
      log("stream: subscribed");
      // Whatever came while it was down.
      refreshSoon();
    });
  } catch (e) { refused(s, errorMessage(e)); }
}

function refused(s: Socket, why: string) {
  log(`stream: subscribe failed: ${why}`);
  awaiting = undefined;
  s.disconnect();
  retry = setTimeout(() => s.connect(), RETRY_MS);
}

/** The tick: the fallback refresh while the stream cannot be trusted, and a ping; whatever the last tick asked and got no answer to reconnects. */
function beat() {
  if (!healthy()) bar.refresh("unread", "whatsapp").catch(() => {});
  if (!socket?.connected) return;
  if (awaiting) return reconnect(`no answer to the ${awaiting}`);
  if (!upSince) return;
  awaiting = "ping";
  socket.emit("message", { type: "ping" }, (r: WsReply) => { if (r?.type === "pong" && awaiting === "ping") awaiting = undefined; });
}

/** Connected and subscribed for the settings at hand: a no-op when it already is, a new socket when the gateway, key or session changed. */
export function start() {
  const key = conf().api_key?.trim();
  const id = `${base()}|${key}|${sessionName()}`;
  if (socket && id === identity) return;
  stop();
  if (!key) return;
  identity = id;
  const s = (socket = io(`${base()}/events`, { auth: { apiKey: key }, transports: ["websocket"], reconnectionDelayMax: 10_000 }));
  s.on("connect", () => { subscribe(s); });
  s.on("disconnect", (reason) => {
    upSince = 0;
    log(`stream: disconnected (${reason})`);
    if (reason === "io server disconnect") { clearTimeout(retry); retry = setTimeout(() => s.connect(), RETRY_MS); }
  });
  s.on("connect_error", (e) => { log(`stream: ${errorMessage(e)}`); });
  s.on("message", (m: WsEvent) => {
    if (m.type === "error") { log(`stream: ${m.code}: ${m.message}`); return; }
    if (m.type !== "event") return;
    const at = (m.payload.data?.timestamp ?? 0) * 1000;
    if (at > seenAt) seenAt = at;
    deaf = false;
    refreshSoon();
  });
  tick = setInterval(beat, TICK_MS);
}

export function stop() {
  clearInterval(tick); clearTimeout(retry); clearTimeout(debounce);
  socket?.removeAllListeners();
  socket?.close();
  socket = undefined; identity = ""; upSince = 0; deaf = false; awaiting = undefined;
}

/** After a wake or a network change the old socket may be a dead one that has not noticed yet. */
export const wake = () => reconnect("wake");

/** A poll's chat list held against what the stream said: an unread message newer than every event, old enough that its event should have come, means the stream went deaf. */
export function check(list: Chat[]) {
  if (!healthy()) return;
  const now = Date.now();
  const missed = list.find((c) => c.unread > 0 && c.at > Math.max(seenAt, upSince) && now - c.at > GRACE_MS);
  if (!missed) return;
  deaf = true;
  reconnect(`missed a message in ${missed.id}`);
}
