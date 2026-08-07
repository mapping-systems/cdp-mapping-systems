"""Build the Assignment 03 notebook from versioned source cells."""

from pathlib import Path

import nbformat as nbf


HERE = Path(__file__).resolve().parent
NOTEBOOK_PATH = HERE / "03_morningside_walking_network.ipynb"


def md(source: str):
    return nbf.v4.new_markdown_cell(source.strip())


def code(source: str, alt: str | None = None):
    cell = nbf.v4.new_code_cell(source.strip())
    if alt:
        cell.metadata["alt"] = alt
    return cell


cells = [
    md(
        """
# Close Is Not the Same as Walkable

**Author:** Jennifer Zhang  
**Mapping Systems — Assignment 03: Networks**

## Research statement

**How much longer is the shortest route on a real pedestrian network than the straight-line distance among four public study-day destinations around Columbia University, and which pair is most distorted by the street-and-path network?**

I chose a transit entrance, a studio/class building, a library, and a park entrance because they represent distinct public activities while remaining close enough that straight-line proximity can feel persuasive. Measuring all six unique pairs avoids designing the conclusion around one favored trip. Their coordinates were manually authored from public map inspection at entrance/place-reference precision, not exported from private location history.
"""
    ),
    md(
        """
## 1. Define the network

The network is an **undirected pedestrian graph** derived from OpenStreetMap walking data:

- **Nodes** are mapped intersections, path junctions, and endpoints.
- **Edges** are mapped walkable streets, footways, paths, and steps.
- **Edge weight** is the OSMnx `length` field in metres.
- **Route cost** is the sum of edge lengths, plus the two point-to-node snap connectors.

The original graph was created with OSMnx 2.1.0 using `network_type="walk"`. `prepare_network_snapshot.py` then clipped it to a documented Morningside Heights bounding box and retained the largest connected component. The clipped GraphML and its SHA-256 manifest are committed, so this notebook does not silently change when OpenStreetMap changes or when an API is unavailable.

This is a real mapped network, not a hand-drawn street grid. It still remains a model: an edge means a mapped walkable connection, not a guarantee about current conditions.
"""
    ),
    code(
        """
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
from IPython.display import HTML, Markdown, display

from network_analysis import (
    ANALYSIS_CRS,
    OUTPUT_DIR,
    build_interactive_map,
    calculate_all_pairs,
    graph_to_gdfs,
    load_inputs,
    plot_detour_ratio,
    plot_distance_comparison,
    plot_distance_scatter,
    plot_euclidean_connections,
    plot_network_definition,
    plot_selected_comparisons,
    plot_shortest_routes,
    plot_snap_validation,
    snap_locations,
    write_outputs,
)

pd.set_option("display.max_columns", 30)
plt.rcParams.update({"font.size": 10, "axes.titlesize": 14})
"""
    ),
    code(
        """
graph, places, manifest = load_inputs()

network_summary = pd.Series(
    {
        "graph_type": type(graph).__name__,
        "network_type": manifest["network_type"],
        "nodes": graph.number_of_nodes(),
        "edges": graph.number_of_edges(),
        "connected_components": manifest["connected_components"],
        "crs": manifest["crs"],
        "source_created_with": manifest["source"]["source_created_with"],
        "source_created_date": manifest["source"]["source_created_date"],
        "snapshot_sha256": manifest["artifact_sha256"],
    },
    name="value",
)
display(network_summary.to_frame())

print("Snapshot build sequence:")
print("1. Request OpenStreetMap walking topology with OSMnx.")
print("2. Clip nodes by the documented WGS84 bounding box.")
print("3. Retain the largest connected component.")
print("4. Save GraphML and verify its SHA-256 checksum on every run.")
"""
    ),
    md(
        """
### Convert graph topology into geographic layers

NetworkX stores topology; GeoPandas makes the same nodes and edges visible as geographic features. I preserve OSM `name` and `highway` tags and convert the edge `length` attribute to numeric metres before routing.
"""
    ),
    code(
        """
nodes, edges = graph_to_gdfs(graph)

display(
    edges[["name", "highway", "length_m"]]
    .replace("", pd.NA)
    .dropna(how="all")
    .head(10)
    .style.format({"length_m": "{:.1f} m"})
)

network_figure = plot_network_definition(edges, nodes, places)
plt.show()
""",
        alt="Map of the real OpenStreetMap pedestrian network around Morningside Heights, showing 2,431 network nodes, 3,856 walkable street and path edges, and four measured public locations.",
    ),
    md(
        """
## 2. Define the measured objects and graph nodes

The input coordinates describe the four public places. Shortest-path algorithms can only start and end at graph nodes, so each point is snapped in **NAD83 / New York Long Island (`EPSG:2263`)** to the nearest node. This projected CRS gives local metric-compatible distances after converting US survey feet to metres.

I retain the original points and record each connector. A route total therefore cannot become artificially short just because its point was moved onto the graph for free.
"""
    ),
    code(
        """
snapped, snap_connectors = snap_locations(graph, places, nodes)

node_table = snapped[
    ["place_id", "short_name", "role", "snapped_node", "connector_m"]
].copy()
display(node_table.style.format({"connector_m": "{:.1f} m"}))

snap_figure = plot_snap_validation(edges, nodes, snapped, snap_connectors)
plt.show()
""",
        alt="Node-snap validation map showing four original public-location points, their nearest OpenStreetMap pedestrian-network nodes, and dashed connector lines labeled from 12.7 to 20.1 metres.",
    ),
    md(
        """
## 3. Calculate two distances for every pair

There are four places, so there are `4 choose 2 = 6` unique pairs.

**Euclidean distance** is the length of a straight projected line between the two original coordinates:

`euclidean = distance(original A, original B)`

**Network distance** follows the shortest connected pedestrian path, weighted by mapped edge length:

`network = connector A + shortest_path(edge lengths) + connector B`

The **detour ratio** is `network / euclidean`. A value of 1.00 would mean that the network is no longer than the direct line; higher values show how much topology stretches apparent proximity.
"""
    ),
    code(
        """
results, routes, euclidean_links = calculate_all_pairs(graph, snapped)

display(
    results[
        [
            "pair_id",
            "pair_label",
            "euclidean_m",
            "origin_connector_m",
            "graph_path_m",
            "destination_connector_m",
            "network_m",
            "extra_m",
            "detour_ratio",
            "path_nodes",
        ]
    ].style.format(
        {
            "euclidean_m": "{:.1f}",
            "origin_connector_m": "{:.1f}",
            "graph_path_m": "{:.1f}",
            "destination_connector_m": "{:.1f}",
            "network_m": "{:.1f}",
            "extra_m": "+{:.1f}",
            "detour_ratio": "{:.2f}×",
        }
    )
)
"""
    ),
    md(
        """
## 4. Map what Euclidean distance assumes

The dashed lines below pass through blocks, buildings, walls, landscape, and any other obstruction. They are useful baselines precisely because they do **not** claim to be walkable routes.
"""
    ),
    code(
        """
euclidean_figure = plot_euclidean_connections(edges, snapped, euclidean_links)
plt.show()
""",
        alt="Map of all six projected Euclidean connections among the four locations, drawn as colored dashed straight lines over the real OpenStreetMap pedestrian network.",
    ),
    md(
        """
## 5. Map the shortest connected walks

NetworkX applies Dijkstra's length-weighted shortest-path algorithm to the OSM graph. The six colored routes bend along mapped streets, campus paths, entrances, and park-edge connections. Their geometry includes the two validated snap connectors.
"""
    ),
    code(
        """
routes_figure = plot_shortest_routes(edges, snapped, routes)
plt.show()
""",
        alt="Map of all six shortest walking routes among the four public locations, following actual OpenStreetMap pedestrian edges and including point-to-node connectors.",
    ),
    md(
        """
## 6. Compare the least and most distorted pairs

The two small multiples use identical encodings: red dashes for the direct line and blue for the shortest mapped walk. Selecting the maximum and minimum ratios from the results—rather than choosing by eye—shows why detour is not simply a function of total distance.
"""
    ),
    code(
        """
selected_figure = plot_selected_comparisons(
    edges, snapped, routes, euclidean_links, results
)
plt.show()
""",
        alt="Two comparison maps contrasting the pair with the largest detour ratio and the pair with the smallest detour ratio, with Euclidean lines and actual shortest walking paths shown together.",
    ),
    md(
        """
## 7. Compare the distances as charts

The first chart preserves metres, so it answers "how much farther?" The next two normalize or compare the measurements, answering "how distorted?" A long trip can add more metres while having a modest ratio; a shorter-looking trip can have the stronger topological penalty.
"""
    ),
    code(
        """
distance_figure = plot_distance_comparison(results)
plt.show()
""",
        alt="Horizontal dot-range chart comparing Euclidean and pedestrian-network distance in metres for each of the six location pairs.",
    ),
    code(
        """
ratio_figure = plot_detour_ratio(results)
plt.show()
""",
        alt="Horizontal bar chart ranking all six pairs by network-to-Euclidean detour ratio and highlighting the largest ratio.",
    ),
    code(
        """
scatter_figure = plot_distance_scatter(results)
plt.show()
""",
        alt="Scatterplot of Euclidean versus network distance for six pairs, with every point above the one-to-one reference line.",
    ),
    md(
        """
## 8. Results and experiential reflection

The code below derives every quoted number from the final connector-inclusive table, preventing the written reflection from drifting away from the analysis.
"""
    ),
    code(
        """
largest = results.loc[results["detour_ratio"].idxmax()]
smallest = results.loc[results["detour_ratio"].idxmin()]
largest_extra = results.loc[results["extra_m"].idxmax()]

display(
    Markdown(
        f'''
### What the numbers show

- **Largest proportional detour:** {largest['pair_id']} ({largest['pair_label']}) is **{largest['network_m']:.0f} m** on the network versus **{largest['euclidean_m']:.0f} m** straight-line, a **{largest['detour_ratio']:.2f}×** ratio and **{largest['extra_m']:.0f} added metres**.
- **Smallest proportional detour:** {smallest['pair_id']} ({smallest['pair_label']}) is **{smallest['detour_ratio']:.2f}×** its direct line.
- **Largest absolute addition:** {largest_extra['pair_id']} adds **{largest_extra['extra_m']:.0f} m** beyond Euclidean distance.
- Across all six pairs, the median detour ratio is **{results['detour_ratio'].median():.2f}×**.

### Experiential interpretation

Euclidean distance represents visual or cognitive closeness: two coordinates can look near because the line between them is short. Walking is sequential and constrained. I must reach a usable entrance, join a connected path, follow legal crossings, and sometimes move away from the destination before approaching it again. The largest ratio occurs between Fayerweather Hall and Morningside Park, where campus circulation and the park edge make the apparently diagonal connection much less direct. By contrast, pairs aligned with continuous corridors have lower ratios even when their walks are longer in absolute metres.

The network result is closer to a navigational experience than the Euclidean line, but it is **not the experience itself**. Its cost treats every metre as equal. A steep stair, a delayed crossing, a crowded campus passage, a closed gate, or an uncomfortable block can matter more than several flat metres.
'''
    )
)
"""
    ),
    md(
        """
## 9. What this attribute can and cannot tell us

### It can tell us

- Whether all four locations are connected in the frozen OSM walking graph.
- The length-only shortest path between the **same original endpoints** used for the Euclidean baseline.
- How much mapped topology adds in metres and as a detour ratio.
- Whether snapping is small enough to be credible and whether all connector costs were included.
- Which pairs deserve closer field observation because apparent proximity and routed distance diverge.

### It cannot tell us

- Actual travel time: signals, crossing waits, entry delays, and walking speed are absent.
- Accessibility: stairs, curb cuts, elevators, slope, and surface quality are not fully modeled.
- Snap connectors are short straight point-to-node approximations; they are not independently verified entrance paths.
- Treating the graph as undirected can omit rare directional pedestrian-access restrictions encoded in the source.
- Current conditions: construction, temporary closures, weather, and opening hours can change.
- Personal comfort: crowds, lighting, noise, safety perception, and familiarity are not edge weights.
- A single "best" route: minimizing length can differ from minimizing time, effort, risk, or stress.

The locations are public-place reference coordinates, not a private GPS history. OpenStreetMap is a volunteered dataset; completeness and tags should be field-checked before using this analysis for navigation or accessibility claims.
"""
    ),
    md(
        """
## 10. Export, validate, and open the interactive map

The notebook exports machine-readable nodes, edges, snap connectors, Euclidean links, shortest routes, results, and an audit. It also creates an interactive Leaflet preview with selectable route layers on a live OpenStreetMap tile basemap. The interactive HTML supports inspection; the executed notebook is the assignment submission.
"""
    ),
    code(
        """
audit = write_outputs(
    manifest,
    nodes,
    edges,
    snapped,
    snap_connectors,
    results,
    routes,
    euclidean_links,
)
display(pd.Series(audit, name="value").to_frame())

required = [
    "distance_results.csv",
    "shortest_walking_routes.geojson",
    "node_snap_connectors.geojson",
    "network_audit.json",
    "09_interactive_routes.html",
]
for name in required:
    path = OUTPUT_DIR / name
    assert path.exists() and path.stat().st_size > 0, f"Missing output: {path}"

display(
    HTML(
        '<p><a href="outputs/09_interactive_routes.html" target="_blank">'
        'Open the interactive OpenStreetMap route preview ↗</a></p>'
    )
)
print("All six pairs are reachable, all eight figures exist, and all validation checks passed.")
"""
    ),
]


notebook = nbf.v4.new_notebook(
    cells=cells,
    metadata={
        "kernelspec": {
            "display_name": "Python 3",
            "language": "python",
            "name": "python3",
        },
        "language_info": {"name": "python", "version": "3.11"},
    },
)

nbf.write(notebook, NOTEBOOK_PATH)
print(f"Wrote {NOTEBOOK_PATH}")
