# Flash

Ruffle, the Flash Player emulator ([ruffle.rs](https://ruffle.rs), MIT or
Apache-2.0), for the Flash games. Each game is a package of its own that
requires this one; pal serves this extension's files on the game's origin at
`/__ext/flash/` (protocol 8), so the game's page loads the runtime and Ruffle
under its own CSP.

## A game package

```
<game>/
  pal.json              "requires": ["flash"], "sync": { "saves": { "each": "latest" } },
                        "leaderboards" when it has a score, a view palette
  index.ts              the palette: a surface at surface/index.html
  surface/index.html    /__pal/surface.js, then ../__ext/flash/surface/runtime.ts
  surface/game.json     { "swf": "game.swf", "score": { "from": "so:<SharedObject>/<field>", "board": "best", "order": "desc" } }
  surface/game.swf
```

`test/flash-game/` is one, on Ruffle's own SharedObject test SWF.

`score.from` is `so:<name>/<path>`, a number in one of the game's
SharedObjects (`TopScore`, `stats.best`), or `ei:<function>`, a function the
game calls through `ExternalInterface` (a patched SWF). A better value than
the last goes to `board`. A boolean `sound` setting, when the game declares
one, mutes it.

## What the runtime does

- Plays the SWF filling the view with its shape kept, sponsor links refused.
- Stands an in-memory `localStorage` in for the frame's (an opaque origin has
  none): Ruffle's SharedObjects land there and in the game's storage as
  `saves`, keyed relative to the extension's root so macOS, Windows and the
  web agree. Saves synced in from another machine restart the game on them.
- On hide, flushes the SharedObjects (a `pagehide`, which is when Ruffle
  writes them) and suspends; resumes on show.
- Answers `ExternalInterface.call` without `eval`, which the CSP refuses.

## Ruffle

`make ruffle` vendors it into `surface/ruffle/` from npm at the version
pinned in `ruffle.sh`, checked against its integrity. Both of its builds are
kept: the WebAssembly-extensions one (what WebKit on macOS loads) and the
plain one Ruffle falls back to where those are missing, which WebKitGTK on an
older Linux may be.
