# Active data

This version intentionally keeps only **NYC DOT Seating Locations** as the real pause-destination dataset. POPS have been removed.

The notebook downloads expanded environmental subsets on first run and caches them here as:
- `streets_15min.geojson`
- `trees_15min.geojson`
- `buildings_15min.geojson`

The expanded source fetch area includes 150 m padding beyond the 1,200 m analysis radius to reduce nearest-feature edge bias.
