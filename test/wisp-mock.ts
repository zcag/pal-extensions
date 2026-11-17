// A Bun mock of Wisp's integration API (`/api/v1`) for wisp.test.ts and
// the screenshot fixture: five accounts on four networks (a Slack that
// does not count toward the total and is degraded), the Inbox view with
// a direct message, a group, a work mail, a Slack mention, an SMS and a
// due To do, a To do for later, messages with a photo and a group's
// senders and a voice message, search, people and starting a
// conversation, the AI summary and suggested reply (made on the second ask
// after one is queued), transcription, reactions, and the event stream. The writes (send, read, unread,
// To do, archive) are recorded and change the data as Wisp would; mark
// unread on a network without the mark answers 501. A token other than
// `inbx_test` is a 401. Everyone in it is invented.
import { now } from "../.pal/sdk/src/clock.ts";
import type { AI, Account, Conversation, Counts, Message, Person, Reach } from "../wisp/api.ts";

export const TOKEN = "inbx_test";
export const T0 = Math.floor(now() / 60_000) * 60_000;
export const iso = (minsAgo: number) => new Date(T0 - minsAgo * 60_000).toISOString();
/** A drawn portrait (a head and shoulders on a colour) for a picture, and a drawn page of notes for the photo. */
export const portrait = (bg: string, skin: string, hair: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/><circle cx="32" cy="27" r="12" fill="${skin}"/><path d="M19 25c0-10 6-15 13-15s13 5 13 15c-3-5-7-7-13-7s-10 2-13 7z" fill="${hair}"/><path d="M10 64c2-14 11-20 22-20s20 6 22 20z" fill="${hair}" opacity=".85"/></svg>`;
export const PHOTO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><rect width="320" height="240" fill="#6b4f3a"/><g transform="rotate(-4 160 120)"><rect x="40" y="24" width="240" height="196" rx="4" fill="#f3ead8"/>${[60, 84, 108, 132, 156, 180].map((y, i) => `<path d="M64 ${y}h${150 - (i % 3) * 30}" stroke="#7a6a58" stroke-width="3" stroke-linecap="round"/>`).join("")}<circle cx="232" cy="150" r="26" fill="none" stroke="#3d5a80" stroke-width="5"/><circle cx="232" cy="150" r="8" fill="#3d5a80"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x="229" y="116" width="6" height="10" fill="#3d5a80" transform="rotate(${a} 232 150)"/>`).join("")}</g></svg>`;
export const PICTURES: Record<string, string> = {
  [`/api/v1/conversations/101/avatar`]: portrait("#e9c46a", "#f1d3b3", "#3b2a20"),
  ["/api/v1/avatars/contact/1/mum"]: portrait("#a8dadc", "#e8c4a0", "#8d8d8d"),
  ["/api/v1/attachments/9001"]: PHOTO,
};

export const ADA = 101, FAMILY = 102, Q4 = 103, RELEASES = 104, KARGO = 105, GRACE = 106, LEASE = 107, TOM = 108, DESIGN = 109;

export const accounts = (): Account[] => [
  { id: 1, channel: "whatsapp", label: "WhatsApp", identity: "+44 7700 900123", enabled: true, state: "connected", sendPolicy: "user", countUnread: true, unread: 2 },
  { id: 2, channel: "gmail", label: "Personal", identity: "ana@example.com", enabled: true, state: "connected", sendPolicy: "user", countUnread: true, unread: 0 },
  { id: 3, channel: "gmail", label: "Work", identity: "ana@acme.example", enabled: true, state: "syncing", sendPolicy: "user", countUnread: true, unread: 1 },
  { id: 4, channel: "slack", label: "Acme", identity: "ana", enabled: true, state: "degraded", detail: "2 conversations could not sync", sendPolicy: "user", countUnread: false, unread: 1 },
  { id: 5, channel: "sms", label: "SMS", identity: "+44 7700 900123", enabled: true, state: "connected", sendPolicy: "none", countUnread: true, unread: 1 },
];

const conv = (o: Partial<Conversation> & Pick<Conversation, "id" | "accountId" | "channel" | "title">): Conversation => ({
  kind: "direct", lastPreview: "", lastFromMe: false, unread: 0, forMe: 0, counted: true, triage: { state: "inbox" }, split: "people", waitsOnYou: false, screener: false, ...o,
});

export function conversations(): Conversation[] {
  return [
    conv({ id: ADA, accountId: 1, channel: "whatsapp", title: "Ada Lindqvist", avatar: `/api/v1/conversations/${ADA}/avatar?v=1`, lastMessageAt: iso(4), lastPreview: "Are we still on for tonight?", unread: 2, waitsOnYou: true }),
    conv({ id: FAMILY, accountId: 1, channel: "whatsapp", kind: "group", title: "Family", lastMessageAt: iso(18), lastPreview: "Mum: Sunday lunch at 1?", unread: 5, split: "groups" }),
    conv({ id: Q4, accountId: 3, channel: "gmail", title: "Q4 plan", lastMessageAt: iso(42), lastPreview: "Here is the draft for Thursday", unread: 1, split: "work", waitsOnYou: true }),
    conv({ id: RELEASES, accountId: 4, channel: "slack", kind: "channel", title: "#releases", lastMessageAt: iso(65), lastPreview: "Grace: @ana can you sign off 2.4?", unread: 3, forMe: 1, counted: false, split: "work" }),
    conv({ id: TOM, accountId: 1, channel: "whatsapp", title: "Tom Becker", lastMessageAt: iso(95), lastPreview: "You: Perfect, see you there", lastFromMe: true }),
    conv({ id: DESIGN, accountId: 4, channel: "slack", kind: "channel", title: "#design", lastMessageAt: iso(110), lastPreview: "Mia: new icons are in Figma", counted: false, split: "work" }),
    conv({ id: KARGO, accountId: 5, channel: "sms", title: "KARGO", lastMessageAt: iso(130), lastPreview: "Your parcel is out for delivery", unread: 1, split: "paper" }),
    conv({ id: GRACE, accountId: 2, channel: "gmail", title: "Grace Okafor", lastMessageAt: iso(60 * 26), lastPreview: "You: I will send the slides tonight", lastFromMe: true, triage: { state: "todo", until: iso(30) } }),
    conv({ id: LEASE, accountId: 2, channel: "gmail", title: "Lease renewal", lastMessageAt: iso(60 * 50), lastPreview: "The new terms are attached", triage: { state: "todo", until: new Date(T0 + 2 * 86_400_000).toISOString() }, split: "paper" }),
  ];
}

const msg = (o: Partial<Message> & Pick<Message, "id" | "conversationId" | "text" | "sentAt">): Message => ({
  sender: { id: "them", name: "Them" }, fromMe: false, kind: "text", edited: false, deleted: false, attachments: [], reactions: [], ...o,
});

export function messages(): Record<number, Message[]> {
  return {
    [ADA]: [
      msg({ id: 1, conversationId: ADA, sender: { id: "ada", name: "Ada Lindqvist" }, text: "Found the old engine notes, look", sentAt: iso(60 * 25), attachments: [{ id: 9001, kind: "image", mime: "image/png", filename: "notes.png", url: "/api/v1/attachments/9001" }] }),
      msg({ id: 2, conversationId: ADA, sender: { id: "", name: "" }, fromMe: true, text: "Wonderful. Bring them tonight?", sentAt: iso(60 * 24), status: "read", reactions: [{ emoji: "👍", sender: { id: "ada", name: "Ada Lindqvist" }, fromMe: false }] }),
      msg({ id: 3, conversationId: ADA, sender: { id: "ada", name: "Ada Lindqvist" }, text: "I will", sentAt: iso(6) }),
      msg({ id: 4, conversationId: ADA, sender: { id: "ada", name: "Ada Lindqvist" }, text: "Are we still on for tonight?", sentAt: iso(4) }),
    ],
    [FAMILY]: [
      msg({ id: 11, conversationId: FAMILY, sender: { id: "mum", name: "Mum", avatar: "/api/v1/avatars/contact/1/mum?v=1" }, text: "Sunday lunch at 1?", sentAt: iso(20) }),
      msg({ id: 12, conversationId: FAMILY, sender: { id: "tom", name: "Tom" }, text: "Yes, I'll bring dessert", sentAt: iso(19) }),
      msg({ id: 13, conversationId: FAMILY, sender: { id: "mum", name: "Mum", avatar: "/api/v1/avatars/contact/1/mum?v=1" }, text: "Lovely", sentAt: iso(18) }),
      msg({ id: 14, conversationId: FAMILY, sender: { id: "tom", name: "Tom" }, kind: "voice", text: "", sentAt: iso(17), attachments: [{ id: 9003, kind: "voice", mime: "audio/ogg" }] }),
    ],
    [Q4]: [msg({ id: 21, conversationId: Q4, kind: "email", sender: { id: "lin@acme.example", name: "Lin Park" }, subject: "Q4 plan", text: "Hi Ana,\n\nHere is the draft for Thursday. The hiring section still needs numbers.\n\nLin", sentAt: iso(42) })],
    [RELEASES]: [msg({ id: 31, conversationId: RELEASES, sender: { id: "U2", name: "Grace" }, text: "@ana can you sign off 2.4?", sentAt: iso(65) })],
    [KARGO]: [msg({ id: 41, conversationId: KARGO, sender: { id: "KARGO", name: "KARGO" }, text: "Your parcel is out for delivery", sentAt: iso(130) })],
    [GRACE]: [msg({ id: 51, conversationId: GRACE, sender: { id: "", name: "" }, fromMe: true, kind: "email", subject: "Slides", text: "I will send the slides tonight", sentAt: iso(60 * 26) })],
    [LEASE]: [msg({ id: 61, conversationId: LEASE, kind: "email", sender: { id: "lettings@example.com", name: "Lettings" }, subject: "Lease renewal", text: "The new terms are attached", sentAt: iso(60 * 50), attachments: [{ id: 9002, kind: "document", mime: "application/pdf", filename: "terms.pdf", url: "/api/v1/attachments/9002" }] })],
  };
}

const UNREAD_MARK = new Set(["gmail", "whatsapp", "telegram"]);

/** The server's networks: invented line marks (no brand's artwork in fixtures), in currentColor as Wisp serves them. */
const mark = (d: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
export const networks = [
  { channel: "whatsapp", name: "WhatsApp", description: "", color: "#25D366", logo: mark("M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5z") },
  { channel: "gmail", name: "Gmail", description: "", color: "#EA4335", logo: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M3 6h18v12H3zM4 7l8 6 8-6z"/></svg>` },
  { channel: "slack", name: "Slack", description: "", color: "#4A154B", logo: mark("M9.5 3.5L7.5 20.5M16.5 3.5l-2 17M4.5 9h16M3.5 15h16") },
  { channel: "sms", name: "SMS", description: "", color: "#1A73E8", logo: mark("M4 4.5h16v11.5H9.5L4 20zM8 9h8M8 12h5") },
];

export const SUMMARY = "Ada asks whether tonight is still on and found the old engine notes to bring.";
export const DRAFT = "Yes, still on. 8 at the usual place?";
export const people = (): Person[] => [
  { id: 1, name: "Ada Lindqvist", avatar: "/api/v1/conversations/101/avatar?v=1", channels: ["whatsapp"], lastMessageAt: iso(4), lastPreview: "Are we still on for tonight?", lastFromMe: false, unread: 2 },
  { id: 2, name: "Lin Park", channels: ["gmail"], lastMessageAt: iso(42), lastPreview: "Here is the draft for Thursday", lastFromMe: false, unread: 1 },
];
export const reach: Record<number, Reach[]> = {
  1: [{ accountId: 1, channel: "whatsapp", account: "WhatsApp", address: "+44 7700 900456", conversationId: ADA, canSend: true }, { accountId: 5, channel: "sms", account: "SMS", address: "+44 7700 900456", canSend: false }],
  2: [{ accountId: 2, channel: "gmail", account: "Personal", address: "lin@example.com", canSend: true }, { accountId: 3, channel: "gmail", account: "Work", address: "lin@acme.example", canSend: true }],
};

export class WispMock {
  server: ReturnType<typeof Bun.serve>;
  calls: { method: string; path: string; query?: string; body?: unknown }[] = [];
  accounts = accounts();
  convs = conversations();
  msgs = messages();
  people = people();
  reach = reach;
  pictures = PICTURES;
  failWith = 0;
  ai: Record<number, AI> = {};
  /** GETs of a conversation's AI left before what was asked is made. */
  private making: Record<number, number> = {};
  private streams = new Set<ReadableStreamDefaultController<string>>();
  private seq = 100;

  constructor() {
    const self = this;
    this.reset();
    this.server = Bun.serve({
      port: 0,
      async fetch(req) {
        if (req.headers.get("authorization") !== `Bearer ${TOKEN}`) return Response.json({ error: "unauthorized" }, { status: 401 });
        if (self.failWith) return Response.json({ error: "broken" }, { status: self.failWith });
        return self.route(req, new URL(req.url));
      },
    });
  }

  get url() { return `http://127.0.0.1:${this.server.port}`; }
  stop() { for (const c of this.streams) try { c.close(); } catch { /* gone */ } this.server.stop(true); }
  get streaming() { return this.streams.size; }
  emit(type: string, data: unknown) { const b = `event: ${type}\ndata: ${JSON.stringify({ id: "evt_1", type, at: new Date(T0).toISOString(), data })}\n\n`; for (const c of this.streams) try { c.enqueue(b); } catch { this.streams.delete(c); } }
  posted(path: string) { return this.calls.filter((c) => c.method !== "GET" && c.path === path); }
  reset() { this.accounts = accounts(); this.convs = conversations(); this.msgs = messages(); this.people = people(); this.reach = reach; this.pictures = PICTURES; this.calls = []; this.failWith = 0; this.ai = { [ADA]: { available: true, summary: { text: SUMMARY, stale: false, state: "ready" } } }; this.making = {}; }

  counts(): Counts {
    const inInbox = (c: Conversation) => c.triage.state !== "done" && (c.triage.state === "inbox" || !c.triage.until || Date.parse(c.triage.until) <= T0);
    const counted = (c: Conversation) => c.counted && this.accounts.find((a) => a.id === c.accountId)!.countUnread;
    return {
      unread: this.convs.filter((c) => c.unread && counted(c) && c.triage.state !== "todo").length,
      forMe: this.convs.filter((c) => (c.forMe ?? 0) > 0).length,
      inbox: this.convs.filter(inInbox).length,
      todo: this.convs.filter((c) => c.triage.state === "todo" || c.triage.state === "waiting").length,
      now: this.convs.filter((c) => c.waitsOnYou).length,
      screener: 0,
      accounts: this.accounts.map((a) => ({ id: a.id, label: a.label, channel: a.channel, counted: a.countUnread, unread: this.convs.filter((c) => c.accountId === a.id && c.unread).length, inbox: 0, todo: 0, now: 0 })),
    };
  }

  private view(v: string): Conversation[] {
    const due = (c: Conversation) => (c.triage.state === "todo" || c.triage.state === "waiting") && (!c.triage.until || Date.parse(c.triage.until) <= T0);
    const all = [...this.convs].sort((a, b) => Date.parse(b.lastMessageAt ?? "") - Date.parse(a.lastMessageAt ?? ""));
    if (v === "inbox") return all.filter((c) => c.triage.state !== "done" && (c.triage.state === "inbox" || due(c)));
    if (v === "now") return all.filter((c) => c.waitsOnYou);
    if (v === "todo") return all.filter((c) => c.triage.state === "todo" || c.triage.state === "waiting");
    if (v === "screener") return [];
    return all;
  }

  private async route(req: Request, u: URL): Promise<Response> {
    const p = u.pathname, m = req.method;
    const body = m !== "GET" && req.headers.get("content-type")?.startsWith("application/json") ? await req.json() : undefined;
    this.calls.push({ method: m, path: p, query: u.search, body });
    const json = (v: unknown, status = 200) => Response.json(v, { status });
    const id = Number(p.match(/^\/api\/v1\/conversations\/(\d+)/)?.[1]);
    const c = this.convs.find((x) => x.id === id);
    if (m === "GET" && p === "/api/v1/counts") return json(this.counts());
    if (m === "GET" && p === "/api/v1/accounts") return json({ accounts: this.accounts });
    if (m === "GET" && p === "/api/v1/networks") return json({ networks });
    if (m === "GET" && p === "/api/v1/conversations") { const acc = Number(u.searchParams.get("account")); return json({ conversations: this.view(u.searchParams.get("view") ?? "inbox").filter((c) => !acc || c.accountId === acc) }); }
    if (m === "GET" && this.pictures[p]) return new Response(this.pictures[p], { headers: { "content-type": "image/svg+xml" } });
    if (m === "GET" && p === "/api/v1/events") {
      let ctl!: ReadableStreamDefaultController<string>;
      const stream = new ReadableStream<string>({ start: (x) => { ctl = x; this.streams.add(x); x.enqueue(`event: unread.changed\ndata: ${JSON.stringify({ id: "evt_0", type: "unread.changed", data: { unread: this.counts().unread } })}\n\n`); }, cancel: () => { this.streams.delete(ctl); } });
      return new Response(stream, { headers: { "content-type": "text/event-stream" } });
    }
    if (m === "GET" && p === "/api/v1/search") {
      const q = (u.searchParams.get("q") ?? "").toLowerCase();
      const hits = Object.values(this.msgs).flat().filter((x) => x.text.toLowerCase().includes(q.replace(/ in:\w+/, "")));
      return json({ hits: hits.map((x) => { const cc = this.convs.find((y) => y.id === x.conversationId)!; return { conversationId: cc.id, conversationTitle: cc.title, channel: cc.channel, message: x }; }), conversations: [], capped: false, invalid: q.includes("bogus:") ? ["bogus:"] : [] });
    }
    if (m === "GET" && p === "/api/v1/people") { const q = (u.searchParams.get("q") ?? "").toLowerCase(); return json({ people: this.people.filter((x) => x.name.toLowerCase().includes(q)) }); }
    const pid = Number(p.match(/^\/api\/v1\/people\/(\d+)$/)?.[1]);
    if (m === "GET" && pid) { const x = this.people.find((y) => y.id === pid); return x ? json({ ...x, reach: this.reach[pid] ?? [] }) : json({ error: "not found" }, 404); }
    if (m === "POST" && p === "/api/v1/compose") {
      const b = body as { accountId: number; to: string[]; text: string };
      const acc = this.accounts.find((a) => a.id === b.accountId)!;
      const nc = { ...conversations()[2], id: 300 + this.convs.length, accountId: acc.id, channel: acc.channel, title: b.to[0], lastPreview: `You: ${b.text}`, unread: 0, lastMessageAt: new Date(T0).toISOString() };
      this.convs.push(nc);
      return json({ conversationId: nc.id });
    }
    const mid = Number(p.match(/^\/api\/v1\/messages\/(\d+)\//)?.[1]);
    const message = Object.values(this.msgs).flat().find((x) => x.id === mid);
    if (mid && !message) return json({ error: "not found" }, 404);
    if (m === "POST" && p.endsWith("/transcribe")) { message!.transcript = "Running ten minutes late, start without me"; return new Response(null, { status: 204 }); }
    if (m === "POST" && p.endsWith("/react")) { message!.reactions = [...message!.reactions.filter((r) => !r.fromMe), { emoji: (body as { emoji: string }).emoji, sender: { id: "", name: "" }, fromMe: true }]; return new Response(null, { status: 204 }); }
    if (m === "DELETE" && p.endsWith("/react")) { message!.reactions = message!.reactions.filter((r) => !r.fromMe); return new Response(null, { status: 204 }); }
    if (!c) return json({ error: "not found" }, 404);
    const ai = (this.ai[id] ??= { available: true });
    if (m === "GET" && p.endsWith("/ai")) {
      if (this.making[id] !== undefined && this.making[id]-- <= 0) {
        delete this.making[id];
        if (ai.summary?.state === "queued") ai.summary = { text: SUMMARY, stale: false, state: "ready" };
        if (ai.draft?.state === "queued") ai.draft = { text: DRAFT, stale: false, state: "ready" };
      }
      return json(ai);
    }
    if (m === "POST" && (p.endsWith("/summary") || p.endsWith("/draft"))) { ai[p.endsWith("/summary") ? "summary" : "draft"] = { stale: false, state: "queued" }; this.making[id] = 1; return json(ai); }
    if (m === "DELETE" && p.endsWith("/draft")) { delete ai.draft; return new Response(null, { status: 204 }); }
    if (m === "GET" && p.endsWith("/messages")) return json({ conversation: c, messages: this.msgs[id] ?? [], ...(id === ADA && !u.searchParams.get("cursor") && { next: "1.1" }) });
    if (m === "GET" && p === `/api/v1/conversations/${id}`) return json(c);
    const policy = this.accounts.find((a) => a.id === c.accountId)!.sendPolicy;
    if (m === "POST" && p.endsWith("/messages")) {
      if (policy === "none") return json({ error: "this account's send policy does not allow it" }, 403);
      const sent = { id: ++this.seq, conversationId: id, sender: { id: "", name: "" }, fromMe: true, sentAt: new Date(T0).toISOString(), kind: "text", text: (body as { text: string }).text, status: "sent", edited: false, deleted: false, attachments: [], reactions: [] };
      (this.msgs[id] ??= []).push(sent);
      Object.assign(c, { lastPreview: `You: ${sent.text}`, lastFromMe: true, unread: 0 });
      return json({ message: sent });
    }
    if (m === "POST" && p.endsWith("/read")) { c.unread = 0; c.forMe = 0; return new Response(null, { status: 204 }); }
    if (m === "POST" && p.endsWith("/unread")) { if (!UNREAD_MARK.has(c.channel)) return json({ error: `${c.channel} has no unread mark` }, 501); c.unread = 1; return new Response(null, { status: 204 }); }
    if (m === "POST" && p.endsWith("/todo")) { const b = (body ?? {}) as { until?: string; waiting?: boolean }; c.triage = { state: b.waiting ? "waiting" : "todo", ...(b.until && { until: b.until }) }; return new Response(null, { status: 204 }); }
    if (m === "DELETE" && p.endsWith("/todo")) { c.triage = { state: "inbox" }; return new Response(null, { status: 204 }); }
    if (m === "POST" && p.endsWith("/archive")) { c.triage = { state: "done" }; c.unread = 0; return new Response(null, { status: 204 }); }
    return json({ error: "no such endpoint" }, 404);
  }
}
