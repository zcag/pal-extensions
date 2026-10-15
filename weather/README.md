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

- clear-day: [Nima Mohammadi](https://unsplash.com/photos/5I-qBPf5Aak)
- clear-morning: [admiratio](https://unsplash.com/photos/r5cBfoMAA5k)
- clear-golden: [Nereid Ndreu](https://unsplash.com/photos/_spj_DM9sls)
- clear-night: [Colin Watts](https://unsplash.com/photos/eYXrvDWeJWs)
- partly-day: [Val Bond](https://unsplash.com/photos/svxVlrAPDaw)
- partly-night: [Pascal Debrunner](https://unsplash.com/photos/z0-50_TegR0)
- overcast-day: [Billy Berg](https://unsplash.com/photos/zYRe9UKL3s4)
- overcast-night: [Chris Barbalis](https://unsplash.com/photos/aq7rqbV3CxQ)
- fog-day: [Thomas Griesbeck](https://unsplash.com/photos/BS-Uxe8wU5Y)
- fog-night: [Timur Repin](https://unsplash.com/photos/AarqJKlwhyI)
- rain-day: [Jean-Luc Crucifix](https://unsplash.com/photos/19tQv51x4-A)
- rain-night: [BezeVision](https://unsplash.com/photos/GNml08TffNA)
- storm: [Raychel Sanner](https://unsplash.com/photos/_dRXrv4UMZs)
- snow-day: [Sandra Grünewald](https://unsplash.com/photos/Vemdrwbi8pc)
- snow-night: [Robert Katzki](https://unsplash.com/photos/w-0Gb3AfxKw)
- drizzle: [yaennckew](https://unsplash.com/photos/aA7VG6BWC_8)
