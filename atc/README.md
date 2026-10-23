# atc

Every Claude Code session you run, on every machine, from pal: which ones
need you, a live chat and the real terminal for each, and new ones started in
any folder on any machine.

This is pal's side of **[atc](https://github.com/zcag/atc)**, a small server
that keeps Claude Code's background sessions running on your machines and
lists them in one place, with a web page, a terminal client and an Android
app of its own. atc knows each session's state from Claude Code's own
background service, so nothing here is guessed: a session **needs you**, it is
**your turn**, it is **working**, or it **stopped**.

For the sessions of one machine without a server, read from the agents' own
files, the Sessions extension is the one to use.

## Setup

1. Run atc on the machines where your sessions live:
   [install and run it as a service](https://github.com/zcag/atc#install).
2. On the machine with pal, `atc login <server> <token>` (or set **atc
   server** and **Token** under Settings › Extensions › atc).

That is all: the extension uses what `atc login` saved (`client.json` in
atc's config folder, `ATC_CONFIG_DIR` or `~/.config/atc`). A server that
trusts your tailnet takes no token. A server behind a private CA (Caddy's
`tls internal`) works when this machine trusts that CA, as a browser would.

## Palettes

**Sessions** (`atc-sessions`): every session, the ones that need you first,
then your turn, working, stopped, parked last. The row is the title, then
what it is doing or asking, or for a finished turn what it ended on in one
line (below), with the machine (when atc lists several), folder and branch;
the state, the context it holds and the age on the right. The pane is what it
asks, or atc's summary of its reply (the status, a line per topic, the
overview by kind), then your last message and the reply itself; the machine,
folder, branch, model, context, permission mode, times, its published pages
and what it spent (tokens, the cost at API prices, how long Claude worked).
Filters: All, Needs you, Running, Pinned. Tab on a row types a message; Enter
sends it and opens the chat.

**Chat** (`atc-chat`): one session as a chat that follows it live. The
conversation (prompts, replies drawn as markdown, tool calls one line each),
what it is doing now, and when it needs you a card saying what it asks. The
search row is the message field the whole time: type and Enter sends. A
stopped or past session is resumed in the background first. Opened bare (its
root row, a hotkey), it shows the session that needs you most.

| key | what |
| --- | --- |
| `enter` | Send the message |
| `cmd+y` | Allow what it asks to run, or approve its plan |
| `cmd+.` | Say no, keep planning, dismiss a question, or interrupt a working turn |
| `cmd+shift+v` | Attach the clipboard: text goes into the message, a picture or files are uploaded and named in it |
| `cmd+o` | Open its terminal in pal (Terminal, below) |
| `cmd+shift+o` | Open in atc's web page |
| `cmd+u` | Outputs |
| `cmd+l` | Open its published page |
| `cmd+shift+c` | Copy the last reply |
| `cmd+[` | Older messages |

**Terminal** (`atc-terminal`): the session's own terminal inside pal,
Claude Code's screen as `atc attach` shows it, drawn by xterm.js in the
panel's colours: type into it, scroll it, answer any prompt there,
questions included. A stopped session is resumed first. Escape leaves the
level as everywhere in pal, so the Escape Claude Code wants is `ctrl+[`
(what a terminal sends for it anyway) or `cmd+.`; `cmd+shift+f` makes this
window the one whose size the terminal takes. The page reaches nothing but
its own folder: the extension holds the websocket to atc and relays the
bytes both ways. A hidden terminal keeps its connection for a minute.
`./xterm.sh` vendors xterm.js into `surface/vendor/`, pinned and checked.

**New Session** (`atc-new`): atc's presets first (a folder with standing
instructions, `presets.json` in atc's config folder; started on their own
machine), then the folders you used lately on every machine, then those under
atc's roots. Tab types the first message and a name; Enter
starts the session there and opens its chat, `cmd+enter` starts it in a new git
worktree. **Another folder…** is a form for any folder on any machine.

**Earlier Conversations** (`atc-history`): past conversations on every
machine, newest first, found by title, folder or branch. Enter reads one (a
message typed after Tab resumes it), `cmd+enter` resumes it.

**Outputs** (`atc-outputs`): what the running sessions made: the pages they
published first (links matching atc's `ATC_FEATURED`, by their title, with
the page's preview), then the servers they the files they wrote or read (opened through atc's signed links), the
links they gave. From a session's row or chat it lists that session's alone.

## What a turn ended on

When a session finishes a turn, atc has a model read its final reply and sum
it up at three lengths: a status line ("Done: the changelog, two entries need
your call"), a line per topic, and for a long reply an overview by kind
("Found:", "Open:"). The extension shows it wherever the session does: the
row's subtitle, the popover row (the ring's row adds the lines), the bar's
tooltip, the top of the pane, and a card under the reply in the chat, since
the panel opens at the reply's end. A summary is only ever for the reply the
session holds now, so a working session shows none; until it arrives the
start of the reply stands in, and "Summarize the reply again" asks for a new
one. A short reply is its own summary. A server with summaries turned off
(`ATC_SUMMARY=off`) sends none, and the rows show the reply's start.

## How a prompt is answered

A message goes through atc's `POST /send`, which pastes it into the session's
prompt and submits it. A key is different: atc has no route for one, so Allow
and Say no join the session's terminal over atc's websocket (as atc's own
voice mode does), take the size the terminal already has so a session open on
another screen is not resized, and write Enter or Escape.

What a session asks decides what is offered. A permission prompt and a plan
take both keys. A question (`AskUserQuestion`) takes only Escape: Enter would
pick its first answer unread, so it is answered where its options show
(`cmd+o`, its terminal in pal). A session open in a terminal (not one of atc's background sessions)
is read here and answered in its terminal.

## The bar item

`sessions`: a count per state in its colour, red needs you, amber your turn,
blue working, and the plan's fullest limit (a gauge and its percent) once
atc warns about it; an alarm while one needs you (the `needs` rule); hidden
with nothing running. The tooltip names the session that needs you and what
it asks, and what the finished turns ended on. The popover lists every
session by state, the plan's limits (the session's five hours and the week)
under them:

| key | what |
| --- | --- |
| `enter`, `r` | Open its chat in the popover |
| `y` | Allow (or approve the plan) |
| `i` | Say no, or interrupt |
| `o` | Open its terminal (in the popover) |
| `a` / `w` | Open in a terminal app (`atc attach`) / atc's web page |
| `u` | Outputs |
| `x` | Stop the session (asks first) |
| `n` | New session |
| `h` | Earlier conversations |
| `p` | Open Sessions in pal |

It follows atc's event stream (`/api/events`), so a session that starts to
need you shows within a couple of seconds; a render every 30 s is the safety
net. It publishes `atc/needs_you`, `atc/your_turn`, `atc/working` and
`atc/week_used` (the week's share of the plan, in percent; asked every two
minutes).

## Links

| route | params |
| --- | --- |
| `pal://atc/open` | `session` (an id, a background id or words of its title; absent: the one that needs you most) |
| `pal://atc/send` | `session`, `text`, `file` (repeat for several; uploaded and named in the message) |
| `pal://atc/new` | `dir` or `preset`, `prompt`, `name`, `host`, `worktree` |

## Settings

| id | default | what |
| --- | --- | --- |
| `url` | empty | the atc server; empty uses `atc login`'s |
| `token` | empty | its token (keychain); empty uses `atc login`'s, or none |
| `open` | Auto | where Open in a terminal app goes: Auto runs `atc attach` in a terminal when the atc command is here, else atc's web page |
| `terminal` | Auto | which terminal `atc attach` opens in |
