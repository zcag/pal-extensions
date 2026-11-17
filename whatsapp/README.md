# WhatsApp

Your WhatsApp chats in the panel, through Wisp, your self-hosted inbox
that holds the WhatsApp account live with its history: the chats by recency with the newest message and who sent it, the unread
ones at the root and counted on the bar, a search over every message,
the people you write to with their numbers. It needs the Wisp extension
(`requires`) and uses its server and token; it has none of its own.
Reading and marking read are always on; sending, replying and reacting
only where you turn `send` on, and then only as a form you submit.

| palette | id | kind | what `Enter` does |
| --- | --- | --- | --- |
| Chats | `whatsapp-chats` | live, lazy, primary | opens the chat in the app or the web client |
| Unread | `whatsapp-unread` | live, lazy | the same, over the unread chats only |
| Search WhatsApp | `whatsapp-search` | input | opens the hit's chat |
| Contacts | `whatsapp-contacts` | input | opens a chat with the person |

**Chats** lists the conversations of Wisp's WhatsApp account (the first
one turned on; direct chats and groups, broadcasts and channels left
out), the unread ones first, then newest first. A row is the picture (or
the initial on a tile; a group without one takes the group glyph), the
name, the newest message on one line (in a group with who wrote it), a
`group` tag, the unread count in green, and how long ago. For the unread
chats the newest messages are fetched so the line and the sender are
right; for the rest Wisp's own preview stands. The pane (`⌘I`, or rest
on the row) is the last twenty messages as a conversation: the sender in
bold ("You" for yours) with the time, a photo or a sticker drawn inline,
a voice message with its transcript when Wisp made one, other media named
in brackets; then the chat's facts (kind, unread, the phone, when the
newest message came) and a link into the web client.

| action | shortcut | notes |
| --- | --- | --- |
| Open chat | `Enter` | `whatsapp://send?phone=` in the desktop app, `https://web.whatsapp.com/send?phone=` on the web, per `open`. A group has no link of its own on either, so it opens WhatsApp at the top and the HUD says so |
| Mark as read / Mark as unread | `⌘Enter` | works on marked rows too |
| Send a message | `⌘⇧R` | `send` on. The message is the row's typed argument: with the cursor on the chat, Tab into the Message field in the bar (and a Reply choice that quotes the chat's latest incoming message, when the listing knows one), `⌘⇧R` sends; Enter on the row still opens the chat. A pick without the values (`pal run`, a hotkey) is a form: the text, and a box to quote |
| React to the latest message | `⌘⇧E` | `send` on. WhatsApp's six quick reactions, or remove yours |
| Open in the web client | `⌘⇧O` | |
| Copy number / Copy name | `⌘C` | the number as `+905...`; a group's name; marked chats one per line |

**Unread** is the same rows over the chats with something unread, direct
messages first then groups, so the root carries them; "Nothing unread"
when there are none. **Search WhatsApp** sends what you type to Wisp's
search with `in:whatsapp` (words match as prefixes, accents and Turkish
letters folded, its operators work: `from:`, `after:`, `has:`), a
keystroke waiting 300 ms for the next; a row is the matching line, who
said it where, and when; `Enter` opens the chat, `⌘C` copies the message,
the pane is the chat's conversation. **Contacts** is Wisp's people with a
WhatsApp identity: the most recent with nothing typed, the best matches
for a name or a number otherwise; `Enter` opens a chat, `⌘C` copies the
number, `⌘⇧C` copies a vCard 3.0 (`FN` and `TEL`). Marked rows copy
together, one per line (several vCards make one `.vcf`); opening stays
one chat, since WhatsApp shows one at a time.

## The bar item

`whatsapp/unread`: the number of unread chats as the badge, hidden at
zero and red while a direct chat is among them by its rules (`quiet`,
`dm` under Settings > Bar). A message updates it within a second: the
item listens to Wisp's event stream (`/api/v1/events`, the same reader
the Wisp extension uses) and refreshes on a `message.new` on the
WhatsApp account or an `unread.changed` that moved its unread. It also
refreshes every 30 s, when the panel shows, after a wake and when the
network is back (the stream reconnects then too), and after a mark read,
unread or send from a palette. The popover lists them, direct messages
then groups, each with the picture, the newest message and the time, and
a cursor the arrows move and a click sets: `Enter` opens the chat,
`Space` previews it (the latest messages, `r`, `m` and Enter still
working there), `m` marks it read, `i` ignores it until the next message
(out of the count and the popover, still unread on the phone: no blue
ticks, nothing sent), `a` every listed one, `o` opens WhatsApp (its hint
gives way to `i` over an unread row; the key still works), `p` the
Unread palette, `⌘⇧O` the web client; with `send` on, `r` turns the
search row into a message field whose `Enter` sends to the focused chat.
With `show = "always"` under `[bar.items."whatsapp/unread"]`
(docs/config.md) the glyph stays on the bar while nothing is unread,
muted, and the popover lists the recent chats instead.

## What it reads, and what it writes

Everything goes to Wisp's v1 API with the Wisp extension's token as a
bearer; nothing else sees the chats. Read: `GET /api/v1/accounts` (once,
for the WhatsApp account), `/conversations?view=all&account=` (the list,
200 a page, three pages), `/conversations/<id>/messages` (the unread
chats' newest and the pane's twenty), `/conversations/<id>` (a chat the
list lacks), the pictures under `/api/v1` at 64 px (560 for a photo in
the pane), `/search`, `/people` and `/people/<id>` (Contacts, and the
number of a chat whose messages carry none), and the event stream.

Written, always: `POST /conversations/<id>/read` and `/unread` (Mark as
read / unread). Written only with `send` on, each from a form you submit
or the popover's field on `Enter`: `POST /conversations/<id>/messages`
(with `replyTo` for a quoted reply), `POST` and `DELETE
/messages/<id>/react`. With `send` off none of these is offered anywhere,
and a pick that asks anyway is refused with a toast naming the setting.
A token of scope `client` (Wisp's "App of yours") acts as you, on your
keystroke, through the account's send policy and undo delay; the
setting is the control here.

## Setting up

Set up the Wisp extension (its server and a `client` token). Its
settings are the only ones this needs:

| key | type | default | what |
| --- | --- | --- | --- |
| `send` | boolean | `false` | Send a message, React, the popover's reply field. |
| `open` | select | `auto` | `auto` (the desktop app when installed on macOS, else the web client), `app`, `web`. |

Hint rows name the fix: Wisp not set up, unreachable at its url, the
token refused (each with Open Wisp settings), no WhatsApp account in
Wisp, the search failing (the status and Wisp's message).

Not shown: muted and pinned chats, a group's member count. A chat's
picture is fetched among the newest 48 only; the rest keep the initial.
A quoted message is not drawn in the pane, since Wisp's v1 messages do
not carry what they quote.

## Links

- `pal://whatsapp/open?chat=<id | phone | name>`: Wisp's conversation
  id, a phone number or a WhatsApp id with one (`...@s.whatsapp.net`),
  or a name the chats or Wisp's people have (exact, then a prefix).
- `pal://whatsapp/search?q=<words>`: the search palette with the query
  typed.
