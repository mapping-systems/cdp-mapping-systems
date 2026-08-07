# Assignment 04 — POPS network distance

## Research question

How much does the pedestrian street network change the apparent distance from the 42 St–Bryant Park subway entrance to fifteen outdoor POPS along Sixth Avenue?

## Files

- `04_pops_network_distance.ipynb` — executed analysis, maps, charts, and reflection.
- `midtown_pops_walk_network.graphml` — cached OpenStreetMap walking graph.
- `pops_network_destinations.geojson` — origin and fifteen POPS destinations.
- `pops_network_distance_results.csv` — calculated straight-line and network distances.

The graph was downloaded with OSMnx on August 7, 2026. The notebook compares haversine straight-line distance with shortest-path pedestrian distance weighted by mapped edge length.
