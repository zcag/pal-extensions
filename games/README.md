# Games

Every game as a showcase. Enter on the Games row opens it: the game the
cursor is on large, with its own screenshot cut to the game itself, its
title, tagline and description beside it, and a strip of every game's
cover under it. The arrows (or `tab`) walk the strip, a letter jumps to
the next game starting with it, a click on a cover goes to it, and Enter
opens that game (Escape comes back to the showcase, on the same game).

The list is not kept here: every open reads the installed extensions'
manifests and takes each view palette of an extension the store shelves
under Fun, sorted by name, then adds every game the registries list for
this machine (`extensions.available()`: Fun, a view palette, this
platform, a build that runs here) that is not installed, marked **Not
installed**, after them.

Enter on a game not installed installs it from its registry, waits for it
to load, and opens it; it says **Installing…** meanwhile. An install that
fails says why on the game, until the next try.

The covers are the store screenshots: each listing's first one, its
`-dark` twin, downloaded once into `~/Library/Caches/pal/games`
(`~/.cache/pal/games` on Linux, `PAL_GAMES_CACHE` in the tests) and drawn
through the app's `icon://` file scheme; a screenshot is the panel on a
wallpaper, so a cover clips it to the panel's body. A game whose picture
is not there yet shows its glyph until it lands.

## Leaderboards

An installed game that has leaderboards has a second action,
**Leaderboards** (`cmd+l`); the root's Leaderboards row opens the same
view on the game looked at last, and `g` walks the others.

- A tab per board the game has (`left`, `right`, or a digit). A board
  per puzzle (each Wordle, each sudoku daily, each dated crossword) gets
  a tab for each of its newest puzzles that has scores, as pal's server
  lists them; a board that stays the same (a best score, a fastest time)
  has the period instead: all time, this week or today (`p`).
- Rows: the rank, the name, the score. A player without an account shows
  under a made-up name with an **anonymous** tag; **Hide anonymous**
  (`a`, or the switch) leaves them out and is remembered. Your own row is
  ringed and tagged **you**, and drawn under the top when you are not in
  it.
- Signed out, a last row offers to sign in (`s`), so your scores are kept
  with your account.
- Boards come from pal's server: the view draws at once, says Loading,
  and fills in when the board arrives; a board read in the last minute is
  shown at once. `cmd+r` reads them again.

## Keyboard

| keys | action |
| --- | --- |
| `enter` | Play the game (installing it first when it is not installed) |
| `right` `down` `tab` | The next game (`left` `up` `shift+tab` the previous) |
| a letter or digit | The next game starting with it |
| `cmd+l` | The game's leaderboards |
| `escape` | Back to the root |

## Setup

No settings. The pictures are a cache, fetched again after a week. Hide anonymous is kept in the extension's storage, and
follows a pal account to every machine (`sync`).

## Platforms

macOS and Linux, the same on both; a game a registry marks for one
platform is offered only there.
