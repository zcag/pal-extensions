// Wisp's mock (wisp-mock.ts) with a WhatsApp account's worth of data, for
// whatsapp.test.ts and the screenshot fixture: eight chats (three unread:
// two direct, one group), a status broadcast that is dropped, an SMS
// account whose conversations must not show, messages with WhatsApp
// sender ids (a phone, and a LID whose number only Wisp's people know), a
// photo, a voice message with its transcript, a location, people with
// their WhatsApp reach. Everyone in it is invented.
import type { Conversation, Message, Person, Reach } from "../wisp/api.ts";
import { PHOTO, TOKEN, WispMock, iso, portrait } from "./wisp-mock.ts";

export { TOKEN };
export const MARA = 201, HIKE = 202, TOMAS = 203, FAMILY = 204, OLA = 205, LINA = 206, BETA = 207, ACME = 208, STATUS = 209, KARGO = 210;
const jid = (phone: string) => `${phone}@s.whatsapp.net`;
export const PHONE = { mara: "905551234567", tomas: "905559876543", ola: "905551112233", lina: "905553334455", acme: "905557778899", dana: "905550001122" };
const LINA_LID = "301122334455667@lid";

const conv = (o: Partial<Conversation> & Pick<Conversation, "id" | "title">): Conversation => ({
  accountId: 1, channel: "whatsapp", kind: "direct", lastPreview: "", lastFromMe: false, unread: 0, forMe: 0, counted: true, triage: { state: "inbox" }, split: "people", waitsOnYou: false, screener: false, ...o,
});

export const chats = (): Conversation[] => [
  conv({ id: MARA, title: "Mara Lind", avatar: `/api/v1/conversations/${MARA}/avatar?v=1`, lastMessageAt: iso(2), lastPreview: "standup in 20?", unread: 3 }),
  conv({ id: HIKE, kind: "group", title: "Weekend hike", avatar: `/api/v1/conversations/${HIKE}/avatar?v=1`, lastMessageAt: iso(9), lastPreview: "Location", unread: 5, split: "groups" }),
  conv({ id: TOMAS, title: "Tomas Ruiz", lastMessageAt: iso(31), lastPreview: "the cabin is booked, sending the map", unread: 1 }),
  conv({ id: FAMILY, kind: "group", title: "Family", lastMessageAt: iso(75), lastPreview: "Dinner at eight on Sunday?", lastFromMe: true, split: "groups" }),
  conv({ id: OLA, title: "Ola Berg", avatar: `/api/v1/conversations/${OLA}/avatar?v=1`, lastMessageAt: iso(130), lastPreview: "Thanks, got it" }),
  conv({ id: LINA, title: "Lina Kova", lastMessageAt: iso(26 * 60), lastPreview: "see you friday" }),
  conv({ id: BETA, kind: "group", title: "pal beta", lastMessageAt: iso(50 * 60), split: "groups" }),
  conv({ id: ACME, title: "Acme Support", lastMessageAt: iso(4 * 24 * 60), lastPreview: "Your ticket #4471 is closed" }),
  conv({ id: STATUS, kind: "broadcast", title: "Status", lastMessageAt: iso(1) }),
  conv({ id: KARGO, accountId: 5, channel: "sms", title: "KARGO", lastMessageAt: iso(3), lastPreview: "Your parcel is out for delivery", unread: 1 }),
];

let seq = 2000;
const msg = (conversationId: number, minsAgo: number, o: Partial<Message>): Message => ({
  id: ++seq, conversationId, sender: { id: "", name: "" }, fromMe: false, sentAt: iso(minsAgo), kind: "text", text: "", edited: false, deleted: false, attachments: [], reactions: [], ...o,
});
const me = { id: "", name: "" };
const mara = { id: jid(PHONE.mara), name: "Mara Lind" }, ola = { id: jid(PHONE.ola), name: "Ola Berg" }, tomas = { id: jid(PHONE.tomas), name: "Tomas Ruiz" }, lina = { id: LINA_LID, name: "Lina Kova" };

export function chatMessages(): Record<number, Message[]> {
  seq = 2000;
  return {
    [MARA]: [
      msg(MARA, 40, { sender: mara, text: "can you look at the parser before standup?" }),
      msg(MARA, 35, { sender: me, fromMe: true, text: "on it, give me ten", status: "read" }),
      msg(MARA, 12, { sender: mara, kind: "image", attachments: [{ id: 9101, kind: "image", mime: "image/svg+xml", url: "/api/v1/attachments/9101" }] }),
      msg(MARA, 3, { sender: mara, text: "the tests are green now, the diff is small" }),
      msg(MARA, 2, { sender: mara, text: "standup in 20?" }),
    ],
    [HIKE]: [
      msg(HIKE, 60, { sender: ola, text: "who is in for saturday?" }),
      msg(HIKE, 55, { sender: me, fromMe: true, text: "me, if we start before nine" }),
      msg(HIKE, 30, { sender: tomas, kind: "voice", transcript: "running late, start without me", attachments: [{ id: 9102, kind: "voice", mime: "audio/ogg", url: "/api/v1/attachments/9102" }] }),
      msg(HIKE, 20, { sender: lina, text: "trailhead at 8:30 then" }),
      msg(HIKE, 9, { sender: ola, kind: "location" }),
    ],
    [TOMAS]: [msg(TOMAS, 31, { sender: tomas, text: "the cabin is booked, sending the map" })],
    [FAMILY]: [msg(FAMILY, 75, { sender: me, fromMe: true, text: "Dinner at eight on Sunday?" })],
    [OLA]: [msg(OLA, 130, { sender: ola, text: "Thanks, got it" })],
    [LINA]: [msg(LINA, 26 * 60, { sender: lina, text: "see you friday" })],
    [ACME]: [
      msg(ACME, 5 * 24 * 60, { sender: me, fromMe: true, text: "the invoice for september is missing the parser line" }),
      msg(ACME, 4 * 24 * 60, { sender: { id: jid(PHONE.acme), name: "Acme Support" }, text: "Your ticket #4471 is closed" }),
    ],
    [KARGO]: [msg(KARGO, 3, { sender: { id: "KARGO", name: "KARGO" }, text: "Your parcel is out for delivery, parser" })],
  };
}

const person = (id: number, name: string, minsAgo: number, preview: string, channels = ["whatsapp"], avatar?: string): Person => ({ id, name, channels, lastMessageAt: iso(minsAgo), lastPreview: preview, lastFromMe: false, unread: 0, ...(avatar && { avatar }) });
export const chatPeople = (): Person[] => [
  person(11, "Mara Lind", 2, "standup in 20?", ["whatsapp", "sms"], `/api/v1/conversations/${MARA}/avatar?v=1`),
  person(12, "Tomas Ruiz", 31, "the cabin is booked, sending the map"),
  person(13, "Ola Berg", 130, "Thanks, got it"),
  person(14, "Lina Kova", 26 * 60, "see you friday"),
  person(15, "Dana Ruiz", 30 * 24 * 60, ""),
  person(16, "Lin Park", 42, "Here is the draft", ["gmail"]),
];
const wa = (address: string, conversationId?: number): Reach => ({ accountId: 1, channel: "whatsapp", account: "WhatsApp", address: `+${address}`, ...(conversationId && { conversationId }), canSend: true });
export const chatReach = (): Record<number, Reach[]> => ({
  11: [wa(PHONE.mara, MARA), { accountId: 5, channel: "sms", account: "SMS", address: `+${PHONE.mara}`, canSend: false }],
  12: [wa(PHONE.tomas, TOMAS)],
  13: [wa(PHONE.ola, OLA)],
  14: [wa(PHONE.lina, LINA)],
  15: [wa(PHONE.dana)],
  16: [{ accountId: 2, channel: "gmail", account: "Personal", address: "lin@example.com", canSend: true }],
});

export class WhatsAppMock extends WispMock {
  override reset() {
    super.reset();
    this.convs = chats();
    this.msgs = chatMessages();
    this.people = chatPeople();
    this.reach = chatReach();
    this.pictures = {
      [`/api/v1/conversations/${MARA}/avatar`]: portrait("#e9c46a", "#f1d3b3", "#3b2a20"),
      [`/api/v1/conversations/${HIKE}/avatar`]: portrait("#2a9d8f", "#e8c4a0", "#264653"),
      [`/api/v1/conversations/${OLA}/avatar`]: portrait("#a8dadc", "#e8c4a0", "#8d8d8d"),
      ["/api/v1/attachments/9101"]: PHOTO,
    };
  }
  chat(id: number) { return this.convs.find((c) => c.id === id)!; }
  /** The writes to a path, newest last: `read`, `unread`, `messages`, `react`. */
  writes(kind: string) { return this.calls.filter((c) => c.method !== "GET" && c.path.endsWith(`/${kind}`)); }
}
