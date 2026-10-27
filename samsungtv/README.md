# Samsung TV

A remote for a Samsung TV on the same network, spoken directly to the TV:
no SmartThings account, no hub, no app on the phone. Five palettes and a
bar item: the remote under the keys, the picture page, the TV's apps at
the root, the commands at the root, and the guided pairing; the app on
screen on the bar.
Current Tizen TVs only (2016 on, with token auth); built against a 2024
QE75QN85D.

Four of the TV's own local interfaces, the first three the ones its phone
remote uses:

- **The remote websocket** (`wss://<tv>:8002/api/v2/channels/samsung.remote.control`,
  `protocol/remote.ts`): the keys, text into the TV's own keyboard (and
  the events saying it opened), the app list where the TV gives one.
- **REST** (`http://<tv>:8001/api/v2/`, `protocol/rest.ts`): what the TV
  is and whether it is on or in standby, each app's state (installed,
  running, on screen), opening and closing an app.
- **UPnP** (`:9197`, `protocol/upnp.ts`): the volume as a level and mute,
  and what a DLNA sender plays on the TV.
- **IP Control** (`https://<tv>:1516/`, `protocol/ipc.ts`): JSON-RPC 2.0
  over HTTPS POST (self-signed certificate), the TV's control interface for
  installers. Here: what the other three cannot see or set. The sound
  output, the input on screen and a jump straight to a port, the exact
  volume with the sound on a soundbar, the picture mode and values, whether
  the screen is on, and a web page opened in the TV's browser. It has its
  own token and its own Allow prompt, and needs **IP Remote** on in the
  TV's Settings › Connections › Network › Expert Settings. Calls to one TV
  go one at a time (it resets a connection that overlaps another). Without
  it every part below that needs it is simply not drawn, and the remote is
  what the first three give.

Turning on from off is Wake-on-LAN to the TV's MAC (`protocol/net.ts`).

## Pairing

`Set Up Samsung TV` walks three steps, the one in progress lit along the top:

1. **Find**: the TVs on the network over mDNS (`_samsungmsf._tcp`, and
   `_airplay._tcp` from Samsung, which a 2024 TV answered when the first
   went unheard) and SSDP, with the model and the address. A digit pairs
   one, `i` types an address, `r` looks again.
2. **Allow**: pal opens the remote channel without a token and the TV asks
   "Allow pal?"; press Allow with its remote. The wait counts down from 35 s.
   Then IP Control asks once more, for sound and picture
   (`createAccessToken`), with the same wait. Escape skips it; with IP
   Remote off, Deny, or no answer the setup still finishes, and Ready says
   which setting turns it on.
3. **Ready**: pal connects with the token and reads what works from the
   TV itself: the remote, how many apps, the volume, whether it can be
   turned on from off, the input on screen, the sound outputs, the picture
   mode.

The token, IP Control's token (`ipcToken`) and the TV's MAC stay in pal's
storage (`<data dir>/pal/storage/samsungtv.json`, `devices`); which TV is
current is the `device` setting. The TV may hand out a new token on a
connect; it is kept. A TV paired without sound and picture (paired before
they existed, or IP Remote was off) is offered them on the remote: `b`
there asks the TV, the wait counting down in the sound row; the rest of
the pairing stays. When the TV no longer knows IP Control's token (it answers
`-32700 Parse error`), the token is dropped and the offer is back. `x` forgets one;
remove pal on the TV too under Settings › General › External Device
Manager › Device Connection Manager › Device List. Pressed Deny once? The
TV remembers it there, too.

## The remote

The d-pad on the arrows (each part lights for a moment when its key is
pressed, and a click on it works the same), Enter is OK, Backspace goes
back, `h` is Home, `space` plays or pauses, `,` and `.` rewind and fast
forward, `cmd+left`/`cmd+right` previous and next, `-` and `=` the volume,
`m` mutes, `p` turns the TV off (standby) or on, `i` moves to the next
HDMI input, `[` and `]` the channel, `s` the TV's settings, `g` the guide,
`e` exit, `b` the next sound output, `shift+S` reconnects the sound, `v`
the picture page, `w` opens a web page on the TV, `a` all apps, `d` the
next paired TV, `r` reconnects. With the
Apple TV extension installed (it is in `suggests`), `o` opens its remote
over this one and Escape comes back here; the Apple TV's remote has the
same `o` back to this one.

The card shows the app on screen with its tile, the input on screen when
no app is (by the name given to it: `Apple TV`), what a DLNA sender plays
with its position, or that the TV is in standby; its second line says
where it plays: `HDMI 1 · Q-Symphony · Filmmaker`. The dock is the
`favorites` setting, else the apps opened most, else the usual ones
(YouTube, Netflix, ...), each on a digit, the one on screen dotted. Below
it, the inputs as chips (HDMI 1 to 4 and TV, the one on screen lit, a click
going straight there), the sound outputs as chips (TV Speaker, then each
output the TV lists: Q-Symphony, and a soundbar shortened to `Soundbar`),
the one playing lit, a click switching to one, with ↻ to reconnect, and
the volume as a slider (on a soundbar too). Without IP Control the inputs
are Next HDMI, the input menu and TV, and the sound row is the offer to
pair it.

**Reconnect sound** (`shift+S`, the ↻ chip, the root's Reconnect Sound,
`pal://samsungtv/sound?to=reconnect`): the sound to the TV's speakers, then
back to the output it was on, each step waited on until the TV reports it.
What wakes a soundbar that came up quiet after the TV started.

**Inputs.** A port chip asks IP Control for the port
(`inputSourceControl`) and waits until the TV reports it; when the TV
refuses that, Next HDMI is pressed until it does, and that connection keeps
stepping. The log says which (`[samsungtv] input hdmi2: direct` or
`stepped`). `cmd+K` › Name this input gives the one on screen a name, kept
in the `inputs` setting as `HDMI 1 = Apple TV`.

**Picture** (`v`): the mode as chips (Standard, Movie, Filmmaker, Dynamic,
Eco, `1-5`), a slider per value in the TV's own range (backlight 0-50,
contrast 0-50, brightness -5 to 5, sharpness 0-20, colour 0-50, tint -15
to 15), and the colour tone. Up and down pick a row, left and right change
it. A value the mode does not take is greyed: all of them in Dynamic, and
any the TV refused once in that mode. Read when the page opens.

**Web page** (`w`): a field in the search row, the newest link in the
clipboard history already in it; Enter opens it in the TV's browser
(`directAccessControl` `webBrowser`).

**Typing.** When the TV shows its own keyboard (a search, a sign-in field
of the TV's), a banner says so and a field opens in the search row by
itself: type, Enter sends the text and submits it, Escape puts the field
away. An app that draws its own keyboard (YouTube does) takes nothing from
here, so typing is only offered while the TV's keyboard is up.

## Controls: driving it from another remote

The TV provides five controls (`docs/design/controls.md`): `volume` (the
level 0..1 and mute), `power` (offered even when the TV is off, as long as
its MAC is known: Wake-on-LAN), `inputs` (with IP Control the ports by
their names, the one on screen as `current`; else Next HDMI, the input
menu, TV), `outputs` (with IP Control: where the sound plays, by the
chips' names, `reconnect` while it plays elsewhere than the TV's speakers;
protocol 9) and `player` (the app on screen, or what a DLNA sender plays).
With IP Control the volume carries its level with the sound on a soundbar
too, so a group's other remote gets the slider there as well. Put it in a
group with an Apple TV in Settings › Groups, the volume and the inputs
served by the TV, and the Apple TV's remote sets this TV's volume,
switches its inputs, moves its sound (`b`, `shift+S`) and turns both on.
The remote here draws the volume, power, inputs and sound outputs from
what it is served too: in a group with a soundbar
of its own, the slider is the soundbar's.

## The other palettes

- **Samsung TV Apps**: the apps on the TV with their tiles. Enter opens it
  on the TV, cmd+Enter opens it and shows the remote, cmd+D adds it to the
  dock or takes it out, cmd+W closes it. The list is kept per TV, so the
  root finds `youtube` before the TV has answered.
- **Samsung TV Picture**: the picture page above, its own palette, so it
  is at the root as well as on `v`.
- **Samsung TV** (commands, primary at the root): turn on, turn off, home,
  play or pause, mute, the volume, the inputs (each port by name with IP
  Control), the input menu, the TV's settings, the guide, switch to another
  paired TV, set up; with IP Control also Reconnect Sound, Sound to each
  output, each picture mode, and Open the Copied Link on the TV.

## The bar item

`tv`: the TV mark and the app on screen (the TV's name when none is),
hidden in standby. Its `when` setting shows it only while an app is on
screen instead. The popover is the remote, laid out for 420 px.

States: `samsungtv/power` (`on`, `standby`, `off`, `unknown`),
`samsungtv/app`, and with IP Control `samsungtv/input` (its name),
`samsungtv/sound` (the output), `samsungtv/picture` (the mode).

## Links

| Route | Params |
| --- | --- |
| `pal://samsungtv/key` | `name` (up, down, left, right, select, back, home, menu, exit, play_pause, rewind, forward, volume_up, volume_down, mute, power, channel_up, channel_down, guide, info, or a raw `KEY_` code), `press` (tap, hold) |
| `pal://samsungtv/launch` | `app`: a name or an id |
| `pal://samsungtv/power` | `to`: on, off, toggle |
| `pal://samsungtv/volume` | `level`: up, down, mute, unmute, or 0 to 100 |
| `pal://samsungtv/input` | `to`: hdmi (the next HDMI input), source (the input menu), tv, and with IP Control hdmi1 to hdmi4 |
| `pal://samsungtv/sound` | `to`: reconnect, tv (its speakers), or an output by name (q-symphony, soundbar) |
| `pal://samsungtv/picture` | `mode`: standard, movie, filmmaker, dynamic, eco |
| `pal://samsungtv/open` | `url`: a page for the TV's browser |
| `pal://samsungtv/type` | `text`, into the TV's own keyboard while it is open |

## Settings

| Setting | Default | |
| --- | --- | --- |
| `device` | `""` | The current TV by name; empty: the one paired last |
| `favorites` | `[]` | The dock's apps, by name or id |
| `inputs` | `[]` | Names for the inputs, `HDMI 1 = Apple TV` a line |
| `wake` | `false` | Turn the TV on when the remote opens |
| `stay` | `true` | Keep the connection open for the bar item; off, it closes 90 s after the remote |

## Limits, measured on a 2024 QE75QN85D

- **Apps.** `ed.installedApp.get` answers nothing; the app list is the
  known ids checked one by one over REST (`rest.ts` `CATALOG`), so an app
  that is not in it is not listed. `ed.apps.icon` gives no icon for them:
  each app is its initial on a colour.
- **Opening an app** works over REST only; the websocket's launch, with or
  without a deep link, opened nothing, so links into an app (a YouTube
  video) are not offered.
- **Inputs.** `KEY_HDMI` moves to the next HDMI input and `KEY_SOURCE`
  opens the TV's input menu; the numbered `KEY_HDMI1..4` do nothing. Only
  IP Control tells the current input (`getTVStates.inputSource`, `HDMI1`);
  whether its `inputSourceControl` setter takes a port on this TV is not
  measured yet (on a 2024 Frame it does not), hence the stepping fallback.
- **Volume on a soundbar.** UPnP reads 0 and refuses `SetVolume` there;
  IP Control's `getTVStates.volume` reads the real level (15 while UPnP
  said 0) and `directVolumeControl` is what sets it. The setter is not
  measured on this TV yet.
- **Picture.** The mode, `getVideoStates`, the backlight and the colour
  tone all read; the setters follow the reference (a 2024 Frame and a 2026
  QD-OLED), not yet measured here.
- **Seeking** is not possible from here; the TV's own remote does it.
- **Turning on from off** needs Power On with Mobile (Settings › General
  › Network › Expert Settings); from standby `p` works always.
- **Sound output.** IP Control lists the external outputs
  (`externalSpeakerControl`; `{}` while a receiver is off) and switches to
  one with its name and id, or to the TV's speakers with
  `speakerSelectControl` `Internal`. The current one is
  `getTVStates.speakerSelect` (`QSYM-RECEIVER`, `internal`); the
  `speakerSelectControl` getter answers null while on Q-Symphony. In
  standby `externalSpeakerControl` answers `-32601 Method not found` (and
  `getTVStates` says `internal`), so the outputs are read again as the TV
  comes on. Without `Accept: application/json` the TV answers an empty body.
- Everything stays on the LAN.

## Tests

`test/samsungtv.test.ts` runs the extension over the host
against a stand-in TV (`fake.ts`, `PAL_SAMSUNGTV_FAKE`: the TV's state a
JSON file, every command a log line), groups and the controls through the
harness. `samsungtv-protocol.test.ts` covers the wire against a local
server playing the TV: REST, UPnP, the websocket with Allow and Deny, the
token, keys, text and the keyboard events, and IP Control (its token, the
outputs, a switch read back, reconnecting, an input straight and stepped,
the volume on a soundbar, the picture, a web page, a token the TV forgot).
