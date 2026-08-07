# Assignment 04 — Networks

## View the code and executed results on GitHub

**[Open the executed Jupyter Notebook](03_networks.ipynb)**

The Notebook is the primary assignment and already follows the same pattern as
the course's Python Tutorials: research statement, Python code, executed tables,
maps, charts, checks, interpretation, and limitations in one GitHub page.
All three maps/charts are rendered directly by the executed Python cells; the
Notebook does not load exported figure files.

## Research question

How different is straight-line distance from the shortest real walk between
each Manhattan rent-neighborhood center and its **network-nearest** subway
station, and what descriptive relationship appears beside nominal asking-rent
growth from July 2016 to June 2026?

The target station is selected with Dijkstra shortest paths on a real OSMnx
walking graph. Euclidean distance is then measured to that same destination, so
the two measurements remain comparable.

```python
distance_to_super, path_to_super = nx.single_source_dijkstra(
    graph, origin_node, target=super_node, weight="length"
)
station_node = path_to_super[-2]
network_distance_m = origin_snap_m + distance_to_super
detour_ratio = network_distance_m / euclidean_distance_m
```

## Recorded result

- 31 unique Manhattan rent-area centers and **31/31 reachable routes**
- Median pedestrian-network distance: **393 m**
- Median detour ratio: **1.50×**
- Network and Euclidean nearest-station choices differ for **7 of 31** origins
- Zero cases where network distance is below same-destination Euclidean
  distance beyond the declared tolerance
- Descriptive Spearman correlation between network distance and rent growth:
  **0.37**, not a causal estimate

## Full source and data

- [Analysis implementation](network_analysis.py)
- [Notebook builder and executor](build_assignment.py)
- [31 route features](outputs/data/neighborhood_to_subway_routes.geojson)
- [Distance result table](outputs/data/network_distance_results.csv)
- [Validation summary](outputs/data/validation_summary.json)
- [Hash-manifested walking-graph provenance](data/network_snapshot/manhattan_walk_manifest.json)

## Reproduce

```bash
python build_assignment.py
```

The builder executes with the current Python environment, so a registered
kernel named `cdp` is not required. The ordinary build uses the bounded,
hash-verified graph snapshot so results do not drift silently.
`python build_assignment.py --refresh-osm` deliberately requests a current
Overpass graph and records any fallback.

A neighborhood center is not a residence, and a parent-station point is not a
specific entrance. The network omits crossing delay, stairs, accessibility,
slope, crowding, safety, and service frequency. Asking-rent growth is nominal,
the 31 points are not a random sample, and the analysis is descriptive rather
than causal.
