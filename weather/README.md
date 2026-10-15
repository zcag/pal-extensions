# Weather

The weather for one named place, using Open-Meteo's public geocoding and forecast APIs. Set **Location** to a city, region or postal code, or press L in the palette and search; it needs no account, token or Home Assistant installation.

The palette is its own page (`surface/`), in the spirit of Apple's weather: a photograph of the sky that matches the condition and the time of day (16 of them, `surface/photos/`), rain, snow and lightning falling over it, the reading on the left, and two frosted cards on the right: one sentence on what is coming over the next hours (sunrise and sunset in their place), and the days ahead with each one's span. ← → walk the hours and the sky turns to each one; ↑ ↓ or 1 to 7 pick a day, whose hours fill the row; N comes back to now; L searches for a place; O opens the map, R reads again. It opens at once on the last reading, kept in the extension's storage, and refreshes behind it.

The bar stays absent in ordinary weather. Rain, fog, wind, severe conditions, or a temperature outside the comfort band (10 to 30 by default: the item's `ordinary`, `cold` and `hot` rules under Settings > Bar) bring it back with a condition glyph and temperature. Its popover shows the reading on a card tinted by the sky with humidity, wind, UV and the next sunrise or sunset, the next eight hours from the current one and five days ahead, plus map and refresh keys.

Settings, `[extensions.weather]`:

| key | type | default | what |
| --- | --- | --- | --- |
| `location` | text | (none) | The place: a name, optionally narrowed by region or country (`London, Ontario`). |

The bar item is hidden in ordinary weather; `show = "always"` under
`[bar.items."weather/weather"]` keeps the reading on the strip then too,
muted, so the forecast stays a click away (docs/config.md).


## Credits

Icons: [Meteocons](https://github.com/basmilius/meteocons) by Bas Milius, MIT (`LICENSE-meteocons.txt`).

Photographs, from [Unsplash](https://unsplash.com) under the Unsplash License:

- clear-day: [Fabio Fistarol](https://unsplash.com/photos/TvbUc_EV8rM)
- clear-golden: [Lorenzo Berti](https://unsplash.com/photos/nTT9O-gYmVw)
- clear-morning: [Arindam Saha](https://unsplash.com/photos/PwzISwC2kLs)
- clear-night: [Haseeb Jamil](https://unsplash.com/photos/3s85IxVDyXE)
- drizzle: [yaennckew](https://unsplash.com/photos/aA7VG6BWC_8)
- fog-day: [Fabrizio Conti](https://unsplash.com/photos/k6GpdsPJSZw)
- fog-night: [Zetong Li](https://unsplash.com/photos/ENHdyUBZzww)
- overcast-day: [Clay Banks](https://unsplash.com/photos/Ffx6z1usfnU)
- overcast-night: [Alex He](https://unsplash.com/photos/5pcRewceQyU)
- partly-day: [Enes Doğan](https://unsplash.com/photos/aYbaioMoWCg)
- partly-night: [Stefan Lehner](https://unsplash.com/photos/OlvF58-15X0)
- rain-day: [Brian Hannafious](https://unsplash.com/photos/Wkxc5-ECICg)
- rain-night: [Quinn Simonson](https://unsplash.com/photos/CgpFgyqoJ7U)
- snow-day: [Patrick Mueller](https://unsplash.com/photos/9lEGCbgAQSQ)
- snow-night: [Haylee Sandberg](https://unsplash.com/photos/XRW26C68LOQ)
- storm: [Guillaume Boulanger](https://unsplash.com/photos/AyydxxFo73E)
