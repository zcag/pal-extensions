# Games

Every game as a showcase. Enter on the Games row opens it: the game the
cursor is on at the top, with its own screenshot cut to the game itself,
its title and tagline beside it, and every game's cover under
it in a grid of five, two rows at a time, scrolling with the cursor. The
arrows (or `tab`) walk the grid, `up` and `down` a row, a letter jumps to
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

The pictures are the store screenshots: each game's cover shot (the one
its `store.screenshots` gives a `cover`, else its first), its `-dark`
twin, downloaded once into `~/Library/Caches/pal/games`
(`~/.cache/pal/games` on Linux, `PAL_GAMES_CACHE` in the tests) and drawn
through the app's `icon://` file scheme. A screenshot is the panel on a
wallpaper, so every picture is a crop of it: the one at the top the
panel's body, the whole game; a grid tile the `cover`, the part of the
shot the game picked to show itself up close. A game whose picture is not
there yet shows its glyph until it lands.

The grid draws every cover at all times, two rows and the top of the next
in view: moving down a row slides the whole grid up, and the covers
peeking in at the bottom say there are more.

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
| `right` `tab` | The next game (`left` `shift+tab` the previous) |
| `down` `up` | The game a row below or above |
| a letter or digit | The next game starting with it |
| `cmd+l` | The game's leaderboards |
| `escape` | Back to the root |

## Setup

No settings. The pictures are a cache, fetched again after a week. Hide anonymous is kept in the extension's storage, and
follows a pal account to every machine (`sync`).

## Platforms

macOS and Linux, the same on both; a game a registry marks for one
platform is offered only there.
