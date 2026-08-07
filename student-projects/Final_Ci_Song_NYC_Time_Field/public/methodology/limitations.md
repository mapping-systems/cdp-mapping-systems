# Model limitations

- This is a scheduled accessibility study, not a live journey planner.
- The model excludes buses, ferries, bikes, fares, crowding, safety
  perception, temporary service changes, and elevator or escalator conditions.
- The driving view uses directed OSM roads and free-flow speeds. It excludes
  live traffic, incidents, toll delay, parking search, curb access, and the
  walking time between a parked car and the destination.
- Staten Island Railway is represented, but no ferry connection is invented.
- The published walking snapshot uses OSMnx pedestrian shortest paths. Small
  disconnected OSM fragments are filtered before points are snapped, but map
  completeness and entrance mapping errors can still affect a route.
- Expected waiting is half of the median scheduled headway in each scenario.
- Explicit GTFS minimum transfer time is used when present; a transparent
  three-minute default is used only where GTFS does not supply a value.
- Saturday and Sunday schedules are combined into one comparative weekend
  scenario; this is not a promise for a specific date.
- NTA boundaries are statistical reporting geographies and do not define every
  lived understanding of neighborhood identity.
- H3 resolution 9 discretizes destinations and homes; coordinates are snapped
  to the nearest included cell for model lookup.
- MapPLUTO `UnitsRes` represents administrative tax-lot records and may lag
  physical or informal housing conditions.
- Rent is allocated from 2020–2024 ACS median gross rent using the actual
  MapPLUTO residential-unit distribution inside each H3. Missing block-group
  values fall back to official tract and borough estimates; no neighboring-area
  interpolation is used. H3 values are still survey-based allocations, not
  individual leases. They include tenant-paid utilities, carry sampling error,
  and should not be interpreted as current asking-rent listing prices.
