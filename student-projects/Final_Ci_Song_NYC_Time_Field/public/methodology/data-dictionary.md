# Data dictionary

## `manifest.json`

Model version, generation timestamp, dataset sizes, GTFS feed dates, scenario
windows, source hashes, and all assumptions required to interpret the output.

## `cells.geojson`

| Field | Meaning |
| --- | --- |
| `cell_index` | Stable zero-based index shared by every model asset |
| `cell_id` | H3 resolution 9 identifier |
| `nta_id` | 2020 Neighborhood Tabulation Area code |
| `nta_name` | NYC Planning NTA name |
| `borough` | NYC borough |
| `housing_units` | MapPLUTO residential units assigned to the cell |
| `rent_estimate` | Housing-unit-weighted 2020–2024 ACS median monthly gross rent allocated to this H3 |
| `rent_estimate_moe` | Approximate combined margin of error from the official source geographies |
| `rent_percentile` | Percentile of the cell value among residential H3 cells |
| `rent_bar_height_m` | Continuous dense-rank display height; every distinct rent value receives a distinct height |
| `rent_source_level` | `block_group`, `tract`, `borough`, or `mixed` |
| `rent_primary_source` | Source level representing the largest share of residential units |
| `rent_source_geoid` | Dominant Census source geography |
| `rent_source_count` | Number of official Census source geographies represented in the H3 |
| `rent_coverage_share` | Share of MapPLUTO residential units connected to a rent source |

## `rent-by-cell.csv`

One auditable row for each residential H3 cell. The table includes the displayed
rent value, margin of error and 90% bounds, continuous bar height, source level,
dominant source geography, source count, and residential-unit coverage.

## `station-access.json`

Four entry and four exit candidates per H3 cell. Candidate arrays are flattened
in `cell_index * candidate_count + candidate_offset` order. Minutes include the
documented station entry or exit overhead. Values come from OSMnx pedestrian
shortest paths between actual MTA entrance/exit points and H3 connector nodes.
`-1` and `999` mark an unavailable candidate slot.

## Subway matrices

Each `subway-*.bin` is a little-endian `Uint16` station-to-station matrix.
Values are tenths of a minute. `65535` means unreachable. The station index is
defined by `stations.geojson`.

## `subway-graph-*.json`

Reconstructable GTFS route-state graphs for each scenario. A state is
`(parent_station, route_id, direction_id)`. Every directed edge records total
minutes plus separate `ride_minutes`, `wait_minutes`, and `transfer_minutes`.
Transfer edges also identify whether the minimum transfer time came directly
from GTFS.

## `walk-network.json`

Undirected H3 connector edges used by the browser worker for direct walking.
Every edge is `[first_cell_index, second_cell_index, minutes]`; weights are
shortest-path travel time on the filtered OSM pedestrian graph.

## `drive-network.json`

Directed H3 connector edges used for the driving map. Every edge is
`[origin_cell_index, destination_cell_index, minutes]`. Weights come from
OSMnx road shortest paths using OpenStreetMap `maxspeed` values and OSMnx
fallback free-flow speeds. The graph does not include live traffic or parking.

## Rent measure

`rent_estimate` starts with Census 2020–2024 ACS median gross rent
(`B25064_001E`) at block-group geography, the smallest geography published for
this measure. MapPLUTO residential lots are joined to those areas and weighted
by `UnitsRes` within each H3 cell. A missing block-group observation uses the
official containing tract value, then the borough value. No neighboring-area
smoothing is used.

Gross rent combines contract rent with tenant-paid utilities. It is modeled
survey data with uncertainty, not current asking rent from listings.
