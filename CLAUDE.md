# pal-extensions: working rules

pal's extensions, every one but the games (zcag/pal-games), the bundled
ones and the Games shelf included. The launcher, the SDK, the extension
host, its test harness, the gallery and the screenshot tools are pal's
(zcag/pal); everything here is tested and built against a pal checkout in
`.pal/` (`make setup` links `../pal` there; CI clones zcag/pal at main).

Read pal's docs before changing an area: `.pal/docs/extensions.md` (the
SDK and the manifest), `.pal/docs/registry.md` (packages, the index, how a
build is published), `.pal/docs/design/distribution.md` (how extensions
reach machines), `.pal/docs/design/screenshots.md`,
`.pal/host/test/README.md` (the test rules: the fake clock, `writeTool`,
the time budget), and the matching section of `.pal/notes/decisions.md`.

## Layout

- `<name>/`: one extension each (`pal.json`, `index.ts`, `fixture.ts` for
  its store screenshots).
- `test/`: the tests (`<name>.test.ts`, `<name>-*.test.ts`), their mocks and
  fixtures, `links.test.ts` for the routes several extensions declare;
  `test/shots/` the screenshot fixtures (`<name>.json`, `bar-<name>.json`)
  the fixtures write and pal's gallery reads; `test/games-shelf/` copies of
  some games' manifests for the Games shelf's tests.
- `registry-only.txt`: the extensions that ship only through the registry.
  The rest are in pal's `app/bundled.txt`, built into the app.

## Principles

- **UI first.** Every setting is declared in the manifest, so Settings
  shows it and `config.toml` only mirrors it; a new option is a setting in
  the same change, never a file to edit by hand.
- Quiet, plain words over jargon; animations are fine, never add
  `prefers-reduced-motion` handling.
- `make test` before every push: it is what CI runs (on macOS and Linux),
  against pal's main. `NAMES="calc timer"` narrows it to those extensions'
  tests while working; the push still needs the whole run.
- Commit subjects are `<name>: what changed`, one extension a commit where
  you can: the store's per-build notes and pal-site's extension pages read
  them.

## Bundled or registry-only

**A decision for every extension**, made in pal: its `app/bundled.txt`
lists the extensions built into the app (they need no account or setup and
a Mac user expects them on day one, or a core feature relies on them);
this repo's `registry-only.txt` lists the rest. Every extension here is in
exactly one of the two, and pal's contract tests fail otherwise, so a new
extension is added to one in the same change: say which and why. Moving one
into the app is a one-line pal change; a name that leaves the bundle is
installed by itself on machines that use it.

## How a change reaches users

- A green push to main builds every extension whose package changed,
  uploads it and hands it to pal's registry signer (the `publish` job in
  `.github/workflows/ci.yml`, pal's `.github/actions/publish-extensions`):
  it lands on the **edge** index once pal's `extensions.yml` run is green.
  Push extension changes straight to edge; they are tried there.
- Users follow **stable**: `make ext-release NAMES="a b"` in pal promotes
  edge's newest builds, and every app release promotes everything on edge
  and bundles stable's builds of the bundled names. Promoting is a release
  decision, made after the change was tried. Auto-update is on by default,
  so a promoted build reaches everyone within hours; a bad one is pulled
  with pal's `yank` dispatch input (`.pal/docs/releasing.md`).
- **Compatibility.** A package is stamped with the `PROTOCOL` of the pal it
  was built with (`.pal/sdk/src/protocol.ts`). An extension that uses a new
  SDK export or `Effect` field needs it on pal's main first (and a
  `PROTOCOL` bump there); the build is not offered to an app older than
  that.
- **Identity.** A build is its tree hash, ordered by its commit's time; the
  manifest's `version` is for humans only.
- **Cross-extension dependencies** go in the manifest (`requires`,
  `suggests`); a push, link or hotkey into a missing extension must offer
  to install it, never fail silently.

## Shipping an extension change

Beyond the code, unasked:
- its `pal.json` store block (tagline, description, features: plain,
  specific) and palette `title`s (registry listings and root search match
  on them; a test requires them);
- its icon: a product's real logo only when the extension is that product
  (`make icons`, from Simple Icons; `make icons CHECK=1` exits 1 when a
  manifest drifted), pal's own tools keep glyph tiles;
- store screenshots (`<name>/fixture.ts`, `make shots EXT=<name>`, look at
  every PNG in both themes), committing the regenerated `test/shots/*.json`
  with them;
- when a bar item's look changed: pal keeps a strip parity snapshot of
  every bar fixture and mock (`app/src/ui/__tests__/bar-parity.json`);
  refresh it in pal with this checkout beside it
  (`PAL_UPDATE_PARITY=1 cargo test -p pal parity`, then
  `npx vitest run bar-parity` in pal's `app/`) and commit it there;
- pal-site: its `scripts/subset-font.py` when a manifest gains a Nerd
  glyph, then its `./deploy.sh`; the landing's hand-picked lists
  (`showcase`, `featured`, `apiShots`, `popovers`, `barStrip` in
  `web/server.go`) when the extension deserves a slot.

## Usage data

pal's `docs/usage.md` is a promise: anonymous, first-party only, off with
one switch. Anything new that is counted is listed there in the same
change; never send query text, item names or anything about third-party
registries.
