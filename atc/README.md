# atc

Every Claude Code session on every machine an [atc](https://github.com/zcag/atc)
server lists, in the panel and on the bar. atc knows each session's state from
Claude Code's own background service, so nothing here is guessed: a session
**needs you**, it is **your turn**, it is **working**, or it **stopped**.

For the sessions of this machine alone, read from the agents' files and with
no server, the Sessions extension is the one to use; this one needs atc.

## Setup

None on a machine where `atc login` was run: the server and token it saved
(`client.json` in atc's config folder, `ATC_CONFIG_DIR` or
`~/.config/atc`) are used. Otherwise set **atc server** and **Token** under
Settings › Extensions › atc. A server that trusts your tailnet takes no
token. A server behind a private CA (Caddy's `tls internal`) works when this
machine trusts that CA, as a browser would.

## Palettes

**Sessions** (`atc-sessions`): every session, the ones that need you first,
then your turn, working, stopped, parked last. The row is the title, then the
machine (when atc lists several), folder, branch and what it is doing or
asking; the state, the context it holds and the age on the right. The pane is
what it asks, your last message and its last reply, then the machine, folder,
branch, model, context, permission mode and times. Filters: All, Needs you,
Running, Pinned. Tab on a row types a message; Enter sends it and opens the
chat.

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
| `cmd+o` | Open in a terminal (`atc attach`) |
| `cmd+shift+o` | Open in atc's web page |
| `cmd+u` | Outputs |
| `cmd+shift+c` | Copy the last reply |
| `cmd+[` | Older messages |

**New Session** (`atc-new`): the folders you used lately on every machine,
then those under atc's roots. Tab types the first message and a name; Enter
starts the session there and opens its chat, `cmd+enter` starts it in a new git
worktree. **Another folder…** is a form for any folder on any machine.

**Earlier Conversations** (`atc-history`): past conversations on every
machine, newest first, found by title, folder or branch. Enter reads one (a
message typed after Tab resumes it), `cmd+enter` resumes it.

**Outputs** (`atc-outputs`): what the running sessions made: the servers they
started, the files they wrote or read (opened through atc's signed links), the
links they gave. From a session's row or chat it lists that session's alone.

## How a prompt is answered

A message goes through atc's `POST /send`, which pastes it into the session's
prompt and submits it. A key is different: atc has no route for one, so Allow
and Say no join the session's terminal over atc's websocket (as atc's own
voice mode does), take the size the terminal already has so a session open on
another screen is not resized, and write Enter or Escape.

What a session asks decides what is offered. A permission prompt and a plan
take both keys. A question (`AskUserQuestion`) takes only Escape: Enter would
pick its first answer unread, so it is answered where its options show
(`cmd+o`). A session open in a terminal (not one of atc's background sessions)
is read here and answered in its terminal.

## The bar item

`sessions`: a count per state in its colour, red needs you, amber your turn,
blue working; an alarm while one needs you (the `needs` rule); hidden with
nothing running. The tooltip names the session that needs you and what it
asks. The popover lists every session by state:

| key | what |
| --- | --- |
| `enter`, `r` | Open its chat in the popover |
| `y` | Allow (or approve the plan) |
| `i` | Say no, or interrupt |
| `o` / `w` | Open in a terminal / atc's web page |
| `u` | Outputs |
| `x` | Stop the session (asks first) |
| `n` | New session |
| `h` | Earlier conversations |
| `p` | Open Sessions in pal |

It follows atc's event stream (`/api/events`), so a session that starts to
need you shows within a couple of seconds; a render every 30 s is the safety
net. It publishes `atc/needs_you`, `atc/your_turn` and `atc/working`.

## Links

| route | params |
| --- | --- |
| `pal://atc/open` | `session` (an id, a background id or words of its title; absent: the one that needs you most) |
| `pal://atc/send` | `session`, `text`, `file` (repeat for several; uploaded and named in the message) |
| `pal://atc/new` | `dir`, `prompt`, `name`, `host`, `worktree` |

## Settings

| id | default | what |
| --- | --- | --- |
| `url` | empty | the atc server; empty uses `atc login`'s |
| `token` | empty | its token (keychain); empty uses `atc login`'s, or none |
| `open` | Auto | where Open goes: Auto runs `atc attach` in a terminal when the atc command is here, else atc's web page |
| `terminal` | Auto | which terminal `atc attach` opens in |
