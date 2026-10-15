# Weather

The weather for one named place, using Open-Meteo's public geocoding and forecast APIs. Set **Location** to a city, region or postal code, or press L in the palette and search; it needs no account, token or Home Assistant installation.

The palette is its own page (`surface/`): a live sky drawn from the forecast (the sun on its arc between that day's sunrise and sunset, the moon and stars at night, clouds by cover drifting with the wind, rain, snow, fog, lightning), the reading now with what is coming, the next 24 hours as a temperature curve, and seven days with each day's span against the week's. ← → walk the hours and the sky turns to each one; ↑ ↓ or 1 to 7 pick a day; N comes back to now; O opens the map, R reads again.

The bar stays absent in ordinary weather. Rain, fog, wind, severe conditions, or a temperature outside the comfort band (10 to 30 by default: the item's `ordinary`, `cold` and `hot` rules under Settings > Bar) bring it back with a condition glyph and temperature. Its popover shows the reading on a card tinted by the sky with humidity, wind, UV and the next sunrise or sunset, the next eight hours from the current one and five days ahead, plus map and refresh keys.

Settings, `[extensions.weather]`:

| key | type | default | what |
| --- | --- | --- | --- |
| `location` | text | (none) | The place: a name, optionally narrowed by region or country (`London, Ontario`). |

The bar item is hidden in ordinary weather; `show = "always"` under
`[bar.items."weather/weather"]` keeps the reading on the strip then too,
muted, so the forecast stays a click away (docs/config.md).
