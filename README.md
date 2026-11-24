# phoenixtrackdays.com

Public schedule of motorcycle track days, schools and kart track days within about a 6 hour drive of Phoenix, AZ.

- `data.js`: all events, tracks, organizers, skill levels and bike limits
- `index.html`: the page (map, filters, schedule)
- `build.js`: run `node build.js` after editing `data.js` to rebuild `calendar.ics` and `ics/*.ics`

Refreshed daily.

## Analytics page

https://phoenixtrackdays.com/analytics/ shows visits, booking clicks and audience from GoatCounter. It reads analytics/stats.json, which `GC_TOKEN=<token> node stats.js` rebuilds (the daily refresh runs it). The token is never written to the repo.
