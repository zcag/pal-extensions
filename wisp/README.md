# Wisp

Every inbox you keep in **[Wisp](https://github.com/zcag/wisp)** from pal:
WhatsApp, Gmail, Slack, Telegram, SMS, Instagram, LinkedIn and X in one list,
a conversation to read and answer, Wisp's To do and Done on a key, search
across every account, and one bar item that counts unread per network.

Wisp is a self-hosted inbox server: it keeps the connections to each network
and their read state, sorts conversations into its own views (Inbox, Now, To
do, the Screener) and sections (People, Work, Groups, Feed, Paper), and has an
integration API this extension speaks (`/api/v1`, Wisp's `docs/API.md`).
Nothing is kept here: read, unread, To do and Done are Wisp's, so they match
its web page and its phone app.

## Setup

1. In Wisp, Accounts › Agent tokens: make a token with the scope **App of
   yours**. Such a token acts as you, like Wisp's own page: it sends and
   marks read on every account whose policy lets you send. A **Read + send**
   token works too, but acts as an agent: it only sends and marks read on
   accounts that let agents act.
2. Under Settings › Extensions › Wisp, set **Wisp server** (the address you
   open in a browser) and **Token**.

A server behind a private CA (Caddy's `tls internal`) works when this machine
trusts that CA, as a browser would.

## Palettes

**Inbox** (`wisp-inbox`): one of Wisp's views with every account in it. The
Inbox (unread, and To dos whose day came) is under Wisp's sections, a due To
do first; Now, To do, Screener and All are filters. A row is the picture, the
title, the last line ("You:" before yours), the unread count in the network's
colour (`@3` in red when something is meant for you), a To do's state and
date, and the time. The pane is the latest messages. Enter opens the
conversation; Tab types a message that `cmd+shift+r` sends. `cmd+enter` marks
read (unread on a read one, where the network keeps an unread mark: Gmail,
WhatsApp, Telegram), `cmd+t` To do (clears one), `cmd+shift+t` To do tomorrow
at 9, `cmd+shift+w` waiting on them (a To do again in three days unless they
answer), `cmd+e` Done (archives, on the network too where it has an archive),
`cmd+o` opens it in Wisp. Each of those runs over marked rows too.

**Conversations** (`wisp-conversations`): every recent conversation on every
account, newest first, among the rows pal's root search ranks first, so a
name typed anywhere reaches the chat. The same keys as the Inbox.

**New Message** (`wisp-new`): Wisp's people, everyone you have talked with on
any network, found as you type. Enter on a person with one conversation opens
it; otherwise a form asks which account to write from (the conversations you
already have first, then the addresses a new one can start on) and the
message, sends it (a new conversation through Wisp's compose) and opens it.

**Conversation** (`wisp-conversation`): one conversation to read and answer,
opened at its newest message: the messages by day, theirs on the left and
yours on the right, each sender named in a group, photos inline, other
attachments as a line (a click opens the message in Wisp), reactions, a
mail's subject. The search row is the message field: type and Enter sends,
through Wisp's outbox (its undo delay applies). Opening it marks it read, as
in Wisp (the **Opening reads** setting turns that off). New messages arrive
as they come. `cmd+[` loads older ones.

Where Wisp has a model, its summary of the conversation is a card on top
(saying when newer messages came after it), `cmd+shift+s` asks for a fresh
one, and `cmd+shift+d` asks for a suggested reply, which fills the message
field when it is ready to edit or send. A voice message shows its words once
transcribed; a click on one without them asks for them. `cmd+up` and
`cmd+down` move a cursor over the messages; `cmd+r` replies to the one under
it (a line over the field says to whom, `cmd+backspace` or Escape stops),
`cmd+shift+e` reacts to it.

**Search Wisp** (`wisp-search`): Wisp's own search over every account, with
its language: words as prefixes, `"phrases"`, `-word`, `from:`, `in:slack`,
`is:unread`, `has:attachment`, `before:`, `after:7d`. Enter opens the
conversation, `cmd+o` opens Wisp at that message.

**Wisp Accounts** (`wisp-accounts`): each account with its state and unread,
the ones that need attention (degraded, disconnected, waiting on setup)
first. Enter opens the account in Wisp.

## The bar item

**Inbox** (`wisp/inbox`): a run per network with something unread, its mark and
the count in the bar's own ink, an `@` count in red for
conversations with something meant for you (a mention, a reply in a thread you
follow, even where the conversation is set to Don't count), and the To dos
that are due. A person you gave a badge in Wisp (on their page) has their own
count after the `@`, under their badge's icon: one per person, or one for them
all, as Wisp's Settings › Notifications › Badges says. It counts even where
the account or the conversation does not count unread. The names, brand colours and logos come from Wisp
(`/api/v1/networks`: each connector's brand mark, or Wisp's line drawing), so
a network Wisp gains shows up with its logo and nothing here changes; a server
before that endpoint gets the font's glyphs. On the macOS menu bar the logos
make each network a status item of its own (no capsule there). A click on a
network opens the popover on its tab; the `@`, badge and To do counts open it on All.
Hidden while nothing is unread, from a badged person or due (its `quiet` rule). Its settings:
**Look**, Mono (the default), Capsule (the same on a faint capsule), Colour
(each logo and count in its network's colours) or Glyphs (the font's marks); count **per network** (two Gmail
accounts are one), **per account**, or **one count** (after the Wisp glyph);
**Every account** counts the accounts Wisp leaves out of its total.

The popover is the whole Inbox: one row of chips over the rows (All, then
each network with something unread; past six the rest fold into a `+N`
chip that steps through them and are listed in the actions; `1` all, `2` to
`9` each network, Tab cycles), then Unread (what is meant for you first),
the To dos that are due (a badged person's rows wear the badge after the
name), and the read conversations a line each (the first
four; `a` shows the rest, up to 40 rows in all, past which `p` opens the
Inbox palette), and a line per account that needs attention. Enter opens the conversation in the
popover, Space previews it, `r` replies in a field, `m` marks read (or
unread), `t` To do, `l` tomorrow, `e` Done, `w` Wisp, `p` the Inbox palette;
`m`, `t`, `l`, `e` and `w` run over marked rows.

The states `wisp/unread`, `wisp/for_me`, `wisp/todo`, `wisp/now`,
`wisp/badged` and `wisp/trouble` are published with every render, for a rule or a state of
your own.

## Links

- `pal://wisp/open?conversation=<id or words of its title>` opens it; bare,
  the Inbox.
- `pal://wisp/search?q=<query>` opens Search with the query.
- `pal://wisp/send?conversation=<…>&text=<…>` sends a message.
- `pal://wisp/new?to=<words of a name>` opens New Message with them typed.

## Live

The extension follows Wisp's event stream (`/api/v1/events`): a new message,
a change in the unread total or a To do coming back redraws the bar and any
open conversation at once. The bar's own two-minute render is the safety
net; a wake or a network change reconnects the stream.
