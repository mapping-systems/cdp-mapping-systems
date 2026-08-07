# 03 · Networks — walking distance around Morningside Heights

The folder number follows the four assignment links in submission order. The
course page itself displays Networks as Exercise 04; the content and brief are
the same.

## Research statement

**How much longer is the shortest route on a real pedestrian network than the
straight-line distance among four public study-day destinations around Columbia
University, and which pair is most distorted by the street-and-path network?**

The notebook uses a bounded OpenStreetMap walking graph rather than a drawn
background. Network nodes are OSM intersections, path junctions, and endpoints;
edges are OSM walkable street/path segments weighted by their recorded length in
metres. Four public locations are snapped to the nearest graph node. Every one of
the six unique location pairs is measured two ways:

1. **Euclidean distance:** a straight line between the two original coordinates
   in a local projected CRS.
2. **Network distance:** origin snap connector + length-weighted shortest graph
   path + destination snap connector.

The executed notebook includes five maps, three analytical charts, a results
table, explicit node-snap validation, quantitative checks, and an experiential
reflection.

## Brief checklist

| Assignment requirement | Where it is satisfied |
| --- | --- |
| Define a network | Notebook Section 1: OSM nodes, walkable edges, and length weights |
| Calculate distance between elements | Section 3: all 6 unique pairs among 4 measured places |
| Compare Euclidean and network distance | Sections 3–7: table, maps, dot-range chart, ratio chart, and scatterplot |
| Clearly state the research question | Notebook opening cell and this README |
| Step through network creation | Section 1: OSMnx source, clipping, connected component, checksum, and GeoDataFrames |
| Identify measured nodes | Section 2: node IDs, connector distances, and snap-validation map |
| Reflect on results and experience | Sections 8–9: derived findings, experiential interpretation, and limitations |
| Produce a series of maps and charts | 5 static maps + 3 charts, all embedded in the executed notebook |

## Primary submission

- [`03_morningside_walking_network.ipynb`](03_morningside_walking_network.ipynb)

## Data and reproducibility

- `inputs/study_locations.geojson` — four public points used as the measured
  objects.
- `inputs/morningside_walk.graphml.gz` — committed, bounded pedestrian-network
  snapshot so the notebook runs without a live API request.
- `inputs/morningside_walk_manifest.json` — snapshot provenance, extent, graph
  counts, and SHA-256 checksum.
- `prepare_network_snapshot.py` — deterministic clipping/checksum utility used
  when a newer Manhattan OSMnx GraphML source is supplied.
- `build_notebook.py` and `execute_notebook_inprocess.py` — rebuild and execute
  the submitted notebook.

The source graph was created from OpenStreetMap walking data with OSMnx 2.1.0
and retrieved on 2026-07-27. OpenStreetMap is continuously edited, so this
frozen snapshot supports reproducible grading rather than claiming to represent
all future conditions.

Sources:

- [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
- [OSMnx graph module documentation](https://osmnx.readthedocs.io/en/stable/user-reference.html#module-osmnx.graph)
- [Course Networks assignment](https://mapping-systems.org/lessons/assignments/networks/)

## Supporting outputs

The `outputs/` folder contains the exact tables and geographic layers generated
by the notebook, eight static figures, and an
[interactive Leaflet map on an OpenStreetMap tile basemap](outputs/09_interactive_routes.html).
The HTML map is a preview aid; the notebook remains the required submission.

## Rebuild

From this directory in a compatible environment:

```bash
python build_notebook.py
python execute_notebook_inprocess.py
```

The ordinary rebuild reads only committed local data. It does not download or
silently refresh the network.

## Scope

The graph can describe route topology and distance under a length-only cost. It
cannot reconstruct an individual walking experience. Signals, waits, slope,
stairs, accessibility, indoor passage hours, construction, crowds, weather,
lighting, and perceived safety are not included. The four coordinates are
public-place reference points, not a GPS history or private residence. The
short snap connectors are straight point-to-node approximations, and the
undirected graph does not preserve every possible directional walking rule.
The four point coordinates were manually authored from public map inspection at
entrance/place-reference precision; they were not exported from location history.
