# Clock

The date and time on the bar, and a popover with the month and your world
clocks. Bundled: a clock needs no account or setup, and it is what a Mac
user expects on the bar from day one.

**The strip** (`time`) reads `Thu 8 Oct 14:32`. The item's settings pick
the date (`Thu 8 Oct`, `Thu`, or none) and whether the seconds show. The
extension pushes the strip itself on the minute's boundary (the second's
with seconds on). The core's `minute` trigger counts sixty seconds from its
own start, so a clock rendered by it would run up to a minute late. A
`wake` render and a five-minute `every` are the safety net.

**The popover**, from the top:

- the time large with its seconds, ticking every second while the popover
  is open, and the weekday, the date, the ISO week and the day of the year
  across from it;
- the month: today on a violet chip, the weekend muted, the days either
  side faint, the ringed day the cursor. When the ring is on another day,
  the month's header says where it is (`Sat 17 Oct · in 9 days · week 42`);
- the world clocks, one row per city: a sun by day and a moon at night
  (before 6, from 18), the time there, how far ahead or behind, and
  `tomorrow` or `yesterday` when the date there has turned.

The view's title is this machine's zone (`Istanbul · UTC+3`).

**Clock** (`clock`) is the same view in the panel, from root search
(`time`, `date`, `week number`). There it is laid out wide: the time and
the world clocks on the left, the month on the right.

## Calendar

Enter, or a click on a day, opens that day in Calendar: a push into
calendar's Today palette with `args.day`, which lists that day's events
under its name (from the palettes' cache inside their window, a read of
its own outside it). Calendar is `suggests`. Without it the push gets the
core's offer to install it.

## World clocks

`zones` is one line per clock:

| line | shows |
| --- | --- |
| `Asia/Tokyo` | Tokyo |
| `Tokyo` | Tokyo (a city found among the zones by its last part) |
| `SF`, `NYC`, `Bangalore` | a name people type that is not in a zone id (`ALIASES` in time.ts) |
| `Office = Europe/London` | a label of your own |

A line that names no zone shows "No time zone called …" in its row. `z`
opens the search row as a field: a city or a zone, Enter adds it to the
setting (as `Asia/Tokyo` when the city is the label, `SF =
America/Los_Angeles` otherwise). A city already listed is said, not added
twice.

## Keyboard

| keys | action |
| --- | --- |
| `enter` | Open the ringed day in Calendar |
| `←` `→` | The day before, after |
| `↑` `↓` | The week before, after |
| `[` `]` (`⇧↑` `⇧↓`) | The month before, after (the same day, clamped to the month's end) |
| `t` | Back to today |
| `c` | Copy the ringed day's date (`2026-10-08`) |
| `z` | Add a world clock |

## Settings

| id | kind | default | what |
| --- | --- | --- | --- |
| `zones` | list | `[]` | The world clocks, above. |
| `hour12` | boolean | `false` | `2:05 PM` rather than `14:05`, on the strip, the popover and the world clocks. |
| `week_start` | select | `monday` | The month grid's first column. The week number is ISO 8601 either way. |
| `bar.time.date` | select | `day` | The strip's date: `Thu 8 Oct`, `Thu`, or none. |
| `bar.time.seconds` | boolean | `false` | The strip's seconds, ticking every second. |
