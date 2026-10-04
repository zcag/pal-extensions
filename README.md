# pal-extensions

The extensions of [pal](https://github.com/zcag/pal), the keyboard launcher
for macOS and Linux: everything pal searches and does beyond its core, from
the apps, files and clipboard rows at the root to Spotify, Home Assistant
and GitHub. 72 extensions live here; pal's games have a repo of their
own, [pal-games](https://github.com/zcag/pal-games).

33 of them come **in the app**: a Mac user expects them on day one
and they need no account or setup (or a core feature relies on them).
pal's [`app/bundled.txt`](https://github.com/zcag/pal/blob/main/app/bundled.txt)
lists them, and an app release ships each one's build from pal's registry.
The other 39 are installed from the registry when you want them:
from a search, the Store, the Games shelf or Settings
([`registry-only.txt`](registry-only.txt)). Either way an installed
extension updates itself from the registry, without a new app.

## What is here

Grouped as the Store shows them. *in the app* marks the bundled ones;
*macOS* the ones only for a Mac.

### Productivity

| Extension | What it does | |
| --- | --- | --- |
| [Applications](apps/) | Every installed app, with its icon, a keystroke from launch | in the app |
| [Bookmarks](bookmarks/) | Bookmarks from every browser and your own links, in one search | in the app |
| [Browser Tabs](browser-tabs/) | Switch to any open tab of Chrome, Safari or Firefox | in the app |
| [Calculator](calc/) | Sums, units, currencies, dates and time zones as you type | in the app |
| [Calendar](calendar/) | Today at a glance, one key to join the call |  |
| [Clipboard](clipboard/) | Everything you copied, with images; Enter pastes it back | in the app |
| [Downloads](downloads/) | Your downloads newest first: open, reveal, trash, tidy | in the app |
| [Files](files/) | Find, browse and act on files, recent ones before you type | in the app |
| [Flashcards](flashcards/) | Spaced-repetition flashcards: Spanish to start, any deck of your own |  |
| [Google Search](google/) | Google suggestions, answers and results as you type |  |
| [Maps](maps/) | Places and directions from the panel, no key needed |  |
| [Menu Bar Items](menu-bar/) | The front app's menus, searched and pressed from one list | in the app, macOS |
| [Obsidian](obsidian/) | Find, search and add to your Obsidian notes |  |
| [odak](odak/) | Your odak todos: add in one line, see today's on the bar |  |
| [Quicklinks](quicklinks/) | Your own links, with a slot for search terms | in the app |
| [Snippets](snippets/) | Paste short texts by keyword, placeholders filled in | in the app |
| [tela](tela/) | Search, ask and write in your tela wiki from the panel |  |
| [Theater](theater/) | Jellyfin, the arr apps, downloads, music and books in one place |  |
| [Timer](timer/) | Named countdowns and pomodoros, with an alarm on the bar | in the app |
| [Translate](translate/) | Translate typed, selected or copied text as you type |  |
| [Turkish](turkish/) | Restore Turkish letters (Turkce → Türkçe) and change case correctly |  |
| [Window Management](window-management/) | Snap, resize and move any window from the keyboard | in the app |
| [Windows](windows/) | Switch to any open window or space, most recently used first | in the app |

### System

| Extension | What it does | |
| --- | --- | --- |
| [Audio](audio/) | Switch the output or input, set the volume, mute | in the app |
| [Bluetooth](bluetooth/) | Connect and disconnect paired devices, battery in view | in the app |
| [Displays](displays/) | Resolution, brightness, rotation and input source for every display | in the app |
| [DPI Bypass](dpi/) | The DPI bypass on and off, with a shield on the bar |  |
| [Network](network/) | Every IP this machine has right now, Enter copies it | in the app |
| [Battery & Power](power/) | Battery level, and exactly what is draining it | in the app |
| [Privacy](privacy/) | See which app has your camera, microphone or screen |  |
| [Processes](processes/) | What is running, busiest first, and who holds a port | in the app |
| [Screenshots](screenshots/) | Take a screenshot, then find, copy or read the ones you took | in the app |
| [Services](services/) | Start, stop and restart systemd units and launchd jobs |  |
| [Shortcuts](shortcuts/) | Run any Apple Shortcut by name, folders as sections | in the app, macOS |
| [Disk Space](space/) | See what fills your disk, and clean it up |  |
| [Speedtest](speedtest/) | An internet speed test you can watch, with a history |  |
| [States](states/) | See, set and declare the named states your setup reacts to | in the app |
| [Stats](stats/) | CPU, memory, disk, network and load: quiet until they matter |  |
| [Store](store/) | Browse, install and update extensions without leaving the panel | in the app |
| [System](system/) | Sleep, lock, restart, dark mode, volume, keep awake | in the app |
| [Weather](weather/) | Local weather on the bar, only when it is worth noticing |  |
| [Wi-Fi](wifi/) | Join, forget or inspect Wi-Fi networks; switch the radio | in the app |

### Developer

| Extension | What it does | |
| --- | --- | --- |
| [Colors](colors/) | Pick, type or walk a colour, then copy it in any notation | in the app |
| [Diff](diff/) | Diff the two things you just copied |  |
| [Docker](docker/) | Start, stop, log and shell into containers from the panel |  |
| [Generate](generate/) | UUIDs, passwords, hashes, base64, lorem ipsum, QR codes and JWTs | in the app |
| [GitHub](github/) | Pull requests, issues, repos and notifications in the panel |  |
| [Grafana](grafana/) | Dashboards, alerts and PromQL from the panel |  |
| [Makefile Targets](make/) | Every Makefile target under your projects, Enter runs it |  |
| [Scripts and data files](scripts/) | Lists from shell scripts, data files and script commands | in the app |
| [Sessions](sessions/) | Every Claude Code, Codex and Copilot session, and which one needs you |  |
| [Shell](shell/) | Run a command, read its output in the panel, run it again | in the app |
| [SSH Hosts](ssh/) | Your ssh config's hosts, one Enter from a terminal |  |

### Integrations

| Extension | What it does | |
| --- | --- | --- |
| [Gmail](gmail/) | Your inbox in the panel, its count on the bar, per account |  |
| [Home Assistant](home-assistant/) | Toggle, dim and run Home Assistant entities from the panel |  |
| [Hue](hue/) | Every Hue light, room and scene, live, under the keys |  |
| [1Password](onepassword/) | Copy a 1Password password, username or one-time code |  |
| [Verification Codes](otp/) | Paste one-time codes from your text messages | macOS |
| [Slack](slack/) | Your Slack messages and mentions, in the panel and on the bar |  |
| [WhatsApp](whatsapp/) | Your WhatsApp chats, search and contacts in the panel |  |

### Media

| Extension | What it does | |
| --- | --- | --- |
| [Apple TV](appletv/) | Your Apple TV's remote, Now Playing and links, from the keyboard |  |
| [Images](images/) | Compress, resize and convert images, locally |  |
| [Immich](immich/) | Search your Immich photos by what is in them |  |
| [Now Playing](media/) | Play, pause and skip Spotify, Music, a browser or any MPRIS player | in the app |
| [Samsung TV](samsungtv/) | Your Samsung TV's remote, apps, volume and inputs, from the keyboard |  |
| [Spotify](spotify/) | Search, play and queue Spotify from the keyboard |  |
| [YouTube](youtube/) | Search YouTube, then open, play or save for later |  |

### Reference

| Extension | What it does | |
| --- | --- | --- |
| [Emoji](emoji/) | Every emoji in a grid; copy or paste it, or its :shortcode: | in the app |
| [Icons](icons/) | All 11k Nerd Font glyphs, and Iconify's 200k as SVG |  |
| [Unicode Characters](unicode/) | Arrows, math, currency, dashes and keyboard glyphs to paste | in the app |

### Fun

| Extension | What it does | |
| --- | --- | --- |
| [Games](games/) | All the games in one list, one Enter away | in the app |
| [GIFs](gifs/) | Search Giphy and paste the GIF as a picture |  |

Each extension's folder has its `pal.json` (the manifest: palettes,
settings, bar items, links, the store listing) and its code; many have a
README with how it works and what it needs.

## Running one

An installed pal runs its registry build. To run your working copy:

- **With a checkout of pal**, a debug build (`npm run tauri dev` in pal's
  `app/`) loads the extensions from `../pal-extensions` and
  `../pal-games` beside it, ahead of anything installed, so an edit is
  what runs. `PAL_EXTENSION_REPOS` (a `:` separated list) points it
  elsewhere.
- **With an installed pal**, add this checkout to `extension_dirs` in
  config.toml ([docs/config.md](https://github.com/zcag/pal/blob/main/docs/config.md)):
  an extension there wins over the registry's copy of the same name.

Either way pal reloads an extension when its files change.

## Testing

Everything is tested against a checkout of pal in `.pal/`: its SDK, its
extension host and test harness, its gallery and screenshot tools.

```sh
git clone https://github.com/zcag/pal ../pal   # once, beside this repo (or clone it into .pal)
make test                                      # typechecks, pal's contract tests over every extension, every extension's tests
make test NAMES="calc timer"                   # pal's contract tests and those extensions' tests
make shots EXT=timer                           # the store screenshots, both themes
make icons CHECK=1                             # the product logos still match Simple Icons
```

`make setup` (run by the others) links `../pal` as `.pal`, installs pal's
dependencies there and each extension's own. The tests run through pal's
host on a fake clock and in parallel, under a time budget; pal's
[host/test/README.md](https://github.com/zcag/pal/blob/main/host/test/README.md)
has the rules a test keeps. CI runs `make test` on macOS and Linux against
pal's main on every push (a green main is what pal's registry
publishes), and pal's own CI runs the bundled extensions' tests from this
repo's main, so a change in pal that breaks one is caught there.

## How a change ships

1. Push to main. CI runs `make test` against pal's main; that is all this
   repo's CI does, and nothing here holds a secret.
2. Within about 15 minutes pal's registry (its `extensions.yml`) sees the
   new main, checks that its CI run here is green, builds every extension at
   that commit itself and signs and publishes the ones whose package
   changed to the **edge** index (at once when it is run with `publish` in
   pal's Actions). A main whose CI is pending or red waits; nothing but a
   green main is ever published.
3. `make ext-release NAMES="timer"` in pal promotes it to **stable**, the
   index every pal follows, and every app release promotes everything on
   edge and bundles stable's builds. Installed extensions, bundled ones
   included, update themselves within hours.

A build is identified by its tree hash; the manifest's `version` is for
people. It is built with pal's main and stamped with its SDK protocol, so
an extension that needs something new in the SDK waits for that pal on
main, and is never offered to an app too old to run it.

Send changes here as pull requests; a commit subject is
`<extension>: what changed`, which is what the store's notes on each
build read. A change to the SDK, the host or the app goes to
[zcag/pal](https://github.com/zcag/pal); whether an extension comes in
the app is decided there too (`app/bundled.txt`).

## Writing one

An extension is a folder with a `pal.json` and an `index.ts` that lists
rows and answers picks, through the `@zcag/pal` SDK. pal's docs walk
through it:

- [docs/extensions.md](https://github.com/zcag/pal/blob/main/docs/extensions.md):
  the manifest, the SDK, view palettes, bar items, links, settings,
  storage, store screenshots, packaging
- [docs/registry.md](https://github.com/zcag/pal/blob/main/docs/registry.md):
  packages and indexes, and running a registry of your own
- [CLAUDE.md](CLAUDE.md): what a change here ships with (the store
  listing, the icon, the screenshots)

A new extension goes in its own folder with its tests in `test/`, and in
`registry-only.txt` (or, for one the app should come with, pal's
`app/bundled.txt`): a test fails until it is in one of the two.

## License

MIT, as pal.
