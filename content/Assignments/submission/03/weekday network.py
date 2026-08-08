from pathlib import Path
import os

import nbformat as nbf
from nbclient import NotebookClient


ASSIGNMENTS_DIR = Path(__file__).resolve().parent
NOTEBOOK_PATH = ASSIGNMENTS_DIR / "weekday-network-distance-analysis.ipynb"
RUNTIME_DIR = ASSIGNMENTS_DIR / ".jupyter-runtime"
IPYTHON_DIR = ASSIGNMENTS_DIR / ".ipython"

RUNTIME_DIR.mkdir(exist_ok=True)
IPYTHON_DIR.mkdir(exist_ok=True)
os.environ["JUPYTER_RUNTIME_DIR"] = str(RUNTIME_DIR)
os.environ["IPYTHONDIR"] = str(IPYTHON_DIR)


def markdown(source: str):
    return nbf.v4.new_markdown_cell(source.strip())


def code(source: str):
    return nbf.v4.new_code_cell(source.strip())


cells = [
    markdown(
        """
# Experiential Distance in a Daily Mobility Network

**Study area:** East Village to Columbia University, Manhattan  
**Source data:** `weekday-east-village-columbia.geojson`

## Research statement

This notebook asks:

> **How does the distance accumulated along my daily mobility network differ from the Euclidean distance between the same activity nodes, and what do those differences reveal about how commuting, routine, and restorative detours shape my experience of New York City?**

The analysis treats each recorded event as a **node** and each chronological movement between events as a directed **edge**. The resulting graph is a temporal, multimodal network: it represents the sequence of one typical weekday rather than every possible street or subway connection in Manhattan.

The central comparison is:

- **Euclidean distance:** the straight-line separation between two nodes after projecting the data into a local coordinate system.
- **Network distance:** the sum of edge lengths along the directed sequence of recorded events.

The network distance is therefore an experiential route estimate. Because the source contains activity stops rather than a turn-by-turn GPS trace, each edge is represented by a straight segment between consecutive recorded nodes. The resulting network distances are conservative lower-bound estimates of actual walking and subway travel.
"""
    ),
    markdown(
        """
## 1. Load the point dataset

The GeoJSON contains fifteen moments from 7:30 AM to 9:35 PM. Repeated visits to Avery Hall remain separate nodes because they occur at different times and play different roles in the daily sequence.
"""
    ),
    code(
        """
from pathlib import Path
import json

import geopandas as gpd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import networkx as nx
import numpy as np
import pandas as pd
from IPython.display import display
from shapely.geometry import shape

plt.style.use("seaborn-v0_8-whitegrid")
plt.rcParams.update({
    "figure.dpi": 120,
    "savefig.dpi": 180,
    "font.size": 10,
    "axes.titlesize": 13,
    "axes.labelsize": 10,
})

ROOT = Path.cwd()
DATA_PATH = ROOT / "weekday-east-village-columbia.geojson"
if not DATA_PATH.exists():
    DATA_PATH = ROOT / "Assignments" / "weekday-east-village-columbia.geojson"

FIGURE_DIR = DATA_PATH.parent / "weekday-network-figures"
FIGURE_DIR.mkdir(exist_ok=True)

with DATA_PATH.open("r", encoding="utf-8") as source:
    geojson_data = json.load(source)

records = []
for feature in geojson_data["features"]:
    record = dict(feature["properties"])
    record["geometry"] = shape(feature["geometry"])
    records.append(record)

gdf = (
    gpd.GeoDataFrame(records, geometry="geometry", crs="EPSG:4326")
    .sort_values("sequence")
    .reset_index(drop=True)
)
gdf["event_time"] = pd.to_datetime(
    "2026-01-01 " + gdf["time_local"], format="%Y-%m-%d %H:%M"
)

columns = [
    "sequence", "time_local", "place", "place_type", "arrival_mode",
    "dwell_min", "stress_before", "stress_after"
]
display(gdf[columns])
"""
    ),
    markdown(
        """
## 2. Create the directed network

The network uses the following rules:

1. Every GeoJSON point becomes a node identified by `sequence`.
2. An edge connects each event to the next event in time.
3. The destination node's `arrival_mode` becomes the edge's travel mode.
4. Edge length is calculated after projecting the points from WGS 84 (`EPSG:4326`) to NAD83 / New York Long Island (`EPSG:2263`).
5. The graph is directed because the day has a temporal order.

`EPSG:2263` expresses location in US survey feet and is suitable for local New York City distance measurement. The notebook converts the results to kilometers for readability.
"""
    ),
    code(
        """
FT_TO_KM = 0.0003048006096012192

gdf_projected = gdf.to_crs(epsg=2263).set_index("sequence")
gdf_by_sequence = gdf.set_index("sequence")
gdf_web = gdf.to_crs(epsg=3857)
gdf_web_by_sequence = gdf_web.set_index("sequence")

ROADS_PATH = DATA_PATH.parent / "nyc-basemap-data" / "tl_2024_36061_roads.zip"
roads = gpd.read_file(ROADS_PATH)
roads_web = roads.to_crs(epsg=3857)

G = nx.DiGraph()

for sequence, row in gdf_by_sequence.iterrows():
    G.add_node(
        int(sequence),
        place=row["place"],
        time=row["time_local"],
        place_type=row["place_type"],
        stress_before=float(row["stress_before"]),
        stress_after=float(row["stress_after"]),
    )

for current_sequence, next_sequence in zip(
    gdf["sequence"].iloc[:-1], gdf["sequence"].iloc[1:]
):
    start_geometry = gdf_projected.loc[current_sequence].geometry
    end_geometry = gdf_projected.loc[next_sequence].geometry
    distance_ft = start_geometry.distance(end_geometry)
    arrival_mode = gdf_by_sequence.loc[next_sequence, "arrival_mode"]

    G.add_edge(
        int(current_sequence),
        int(next_sequence),
        distance_ft=float(distance_ft),
        distance_km=float(distance_ft * FT_TO_KM),
        mode=arrival_mode,
    )

total_network_km = sum(
    edge_data["distance_km"] for _, _, edge_data in G.edges(data=True)
)

network_summary = pd.DataFrame({
    "measure": [
        "Recorded event nodes",
        "Directed movement edges",
        "Total schematic network length",
        "Start time",
        "End time",
    ],
    "value": [
        G.number_of_nodes(),
        G.number_of_edges(),
        f"{total_network_km:.2f} km",
        gdf.iloc[0]["time_local"],
        gdf.iloc[-1]["time_local"],
    ],
})

display(network_summary)
"""
    ),
    markdown(
        """
## 3. Map the network

The first map shows the full East Village-to-Columbia extent. The second map enlarges the campus and Morningside Park portion, where many nodes overlap geographically but remain distinct temporally. Both use the complete 2024 U.S. Census TIGER/Line road layer for New York County as a local NYC basemap.

Lines are schematic connections between recorded events. They are not exact street centerlines or subway track geometry.
"""
    ),
    code(
        """
MODE_COLORS = {
    "walk": "#D95F02",
    "subway_L": "#6A3D9A",
    "subway_1": "#1F78B4",
    "none": "#888888",
}

NODE_COLOR = "#202A44"


def add_nyc_basemap(ax):
    xmin, xmax = ax.get_xlim()
    ymin, ymax = ax.get_ylim()
    visible_roads = roads_web.cx[xmin:xmax, ymin:ymax]
    major_codes = {"S1100", "S1200", "S1630"}
    major_roads = visible_roads[visible_roads["MTFCC"].isin(major_codes)]
    local_roads = visible_roads[~visible_roads["MTFCC"].isin(major_codes)]

    ax.set_facecolor("#F1F2F0")
    local_roads.plot(
        ax=ax,
        color="#C7CBC8",
        linewidth=0.45,
        alpha=0.9,
        zorder=0,
    )
    major_roads.plot(
        ax=ax,
        color="#9EA5A1",
        linewidth=0.9,
        alpha=0.95,
        zorder=0,
    )
    ax.set_xlim(xmin, xmax)
    ax.set_ylim(ymin, ymax)
    ax.text(
        0.01,
        0.01,
        "Roads: U.S. Census TIGER/Line 2024",
        transform=ax.transAxes,
        fontsize=6,
        color="#555555",
        ha="left",
        va="bottom",
        zorder=5,
    )
    ax.set_axis_off()


def coordinate_groups(frame):
    groups = {}
    for _, row in frame.iterrows():
        key = (round(row.geometry.x, 5), round(row.geometry.y, 5))
        groups.setdefault(key, []).append(str(int(row["sequence"])))
    return groups


def draw_network_map(ax, frame, title, label_places=False):
    visible_sequences = set(frame["sequence"].astype(int))
    for start, end, edge_data in G.edges(data=True):
        if start not in visible_sequences or end not in visible_sequences:
            continue
        start_point = gdf_web_by_sequence.loc[start].geometry
        end_point = gdf_web_by_sequence.loc[end].geometry
        ax.plot(
            [start_point.x, end_point.x],
            [start_point.y, end_point.y],
            color=MODE_COLORS.get(edge_data["mode"], "#888888"),
            linewidth=2.2,
            alpha=0.8,
            zorder=1,
        )

    ax.scatter(
        frame.geometry.x,
        frame.geometry.y,
        s=50,
        color=NODE_COLOR,
        edgecolor="white",
        linewidth=0.8,
        zorder=3,
    )

    grouped = coordinate_groups(frame)
    for (x, y), sequences in grouped.items():
        label = "/".join(sequences)
        ax.annotate(
            label,
            (x, y),
            xytext=(5, 5),
            textcoords="offset points",
            fontsize=8,
            fontweight="bold",
            zorder=4,
        )

    if label_places:
        unique_places = frame.drop_duplicates(subset=["place"])
        for _, row in unique_places.iterrows():
            ax.annotate(
                row["place"],
                (row.geometry.x, row.geometry.y),
                xytext=(7, -13),
                textcoords="offset points",
                fontsize=7,
                alpha=0.85,
            )

    ax.set_title(title)
    ax.margins(0.1)
    ax.set_aspect("equal")
    add_nyc_basemap(ax)


legend_handles = [
    plt.Line2D([0], [0], color=color, linewidth=3, label=mode.replace("_", " "))
    for mode, color in MODE_COLORS.items()
]

fig, ax = plt.subplots(figsize=(8, 8))
draw_network_map(ax, gdf_web, "Map 1. Full directed daily-mobility network")
ax.legend(handles=legend_handles, title="Arrival mode", loc="best")
fig.tight_layout()
fig.savefig(FIGURE_DIR / "01-full-network-map.png", bbox_inches="tight")
plt.show()

campus_sequences = set(gdf.loc[gdf.geometry.y > 40.798, "sequence"])
campus = gdf_web[gdf_web["sequence"].isin(campus_sequences)].copy()
fig, (ax, key_ax) = plt.subplots(
    1,
    2,
    figsize=(13, 7),
    gridspec_kw={"width_ratios": [2.1, 1]},
)
draw_network_map(
    ax,
    campus,
    "Map 2. Campus and Morningside Park detail",
    label_places=False,
)
ax.legend(handles=legend_handles, title="Arrival mode", loc="best")

key_ax.axis("off")
key_ax.set_title("Event key", loc="left")
key_lines = [
    f"{int(row['sequence']):>2}. {row['time_local']}  {row['place']}"
    for _, row in campus.iterrows()
]
key_ax.text(
    0,
    0.98,
    "\\n".join(key_lines),
    va="top",
    ha="left",
    fontsize=9,
    linespacing=1.45,
    transform=key_ax.transAxes,
)
fig.tight_layout()
fig.savefig(FIGURE_DIR / "02-campus-detail-map.png", bbox_inches="tight")
plt.show()
"""
    ),
    markdown(
        """
## 4. Select node pairs and calculate distance

Five comparisons represent different spatial experiences:

- **Home to morning class:** a multimodal commute with a transfer and coffee stop.
- **Avery lunch loop:** departure from and return to the same building.
- **Studio to park pond:** the evening decompression route through coffee and the park entrance.
- **Park pond to Butler:** return from open space to academic work.
- **Whole recorded day:** every recorded movement from waking to the start of the trip home.

For each pair, Euclidean distance is the direct projected separation between its endpoints. Network distance is the shortest directed path through the recorded network. Because this graph is a chronological chain, the shortest path follows the intervening daily events.
"""
    ),
    code(
        """
PAIR_DEFINITIONS = [
    ("Home to morning class", 1, 6),
    ("Avery lunch loop", 6, 8),
    ("Studio to park pond", 8, 12),
    ("Park pond to Butler", 12, 14),
    ("Whole recorded day", 1, 15),
]

comparison_rows = []

for label, start, end in PAIR_DEFINITIONS:
    start_geometry = gdf_projected.loc[start].geometry
    end_geometry = gdf_projected.loc[end].geometry
    euclidean_km = start_geometry.distance(end_geometry) * FT_TO_KM
    network_km = nx.shortest_path_length(
        G, start, end, weight="distance_km"
    )
    path = nx.shortest_path(G, start, end, weight="distance_km")

    if euclidean_km > 1e-9:
        detour_ratio = network_km / euclidean_km
    else:
        detour_ratio = np.inf

    comparison_rows.append({
        "comparison": label,
        "start_node": start,
        "end_node": end,
        "euclidean_km": euclidean_km,
        "network_km": network_km,
        "extra_km": network_km - euclidean_km,
        "detour_ratio": detour_ratio,
        "path": path,
    })

comparison = pd.DataFrame(comparison_rows)

display(
    comparison.drop(columns="path").style.format({
        "euclidean_km": "{:.2f}",
        "network_km": "{:.2f}",
        "extra_km": "{:.2f}",
        "detour_ratio": lambda value: "undefined (0 km baseline)"
        if np.isinf(value) else f"{value:.2f}x",
    })
)
"""
    ),
    markdown(
        """
## 5. Map Euclidean and network distance together

Each small map compares a dashed Euclidean chord with the solid path through the daily network. The contrast is especially important for the Avery lunch loop: its start and end occupy the same coordinates, so Euclidean distance is zero even though leaving for lunch involves real movement.
"""
    ),
    code(
        """
def draw_pair_map(ax, row):
    path = row["path"]
    path_rows = gdf_web_by_sequence.loc[path]

    ax.scatter(
        gdf_web.geometry.x,
        gdf_web.geometry.y,
        s=16,
        color="#BBBBBB",
        alpha=0.55,
        zorder=1,
    )

    for start, end in zip(path[:-1], path[1:]):
        edge = G.edges[start, end]
        start_point = gdf_web_by_sequence.loc[start].geometry
        end_point = gdf_web_by_sequence.loc[end].geometry
        ax.plot(
            [start_point.x, end_point.x],
            [start_point.y, end_point.y],
            color=MODE_COLORS.get(edge["mode"], "#888888"),
            linewidth=3,
            zorder=2,
        )

    start_point = gdf_web_by_sequence.loc[row["start_node"]].geometry
    end_point = gdf_web_by_sequence.loc[row["end_node"]].geometry
    ax.plot(
        [start_point.x, end_point.x],
        [start_point.y, end_point.y],
        color="#111111",
        linewidth=1.5,
        linestyle="--",
        label="Euclidean",
        zorder=3,
    )

    ax.scatter(
        path_rows.geometry.x,
        path_rows.geometry.y,
        s=42,
        color=NODE_COLOR,
        edgecolor="white",
        linewidth=0.7,
        zorder=4,
    )

    path_label_groups = {}
    for sequence, item in path_rows.iterrows():
        key = (round(item.geometry.x, 5), round(item.geometry.y, 5))
        path_label_groups.setdefault(key, []).append(str(sequence))

    for (x, y), sequences in path_label_groups.items():
        ax.annotate(
            "/".join(sequences),
            (x, y),
            xytext=(4, 4),
            textcoords="offset points",
            fontsize=8,
            fontweight="bold",
        )

    padding_x = max((path_rows.geometry.x.max() - path_rows.geometry.x.min()) * 0.12, 120)
    padding_y = max((path_rows.geometry.y.max() - path_rows.geometry.y.min()) * 0.12, 120)
    ax.set_xlim(path_rows.geometry.x.min() - padding_x, path_rows.geometry.x.max() + padding_x)
    ax.set_ylim(path_rows.geometry.y.min() - padding_y, path_rows.geometry.y.max() + padding_y)
    ax.set_aspect("equal")
    ax.set_title(
        f"{row['comparison']}\\n"
        f"Euclidean {row['euclidean_km']:.2f} km | Network {row['network_km']:.2f} km"
    )
    add_nyc_basemap(ax)


fig, axes = plt.subplots(2, 2, figsize=(12, 10))
for ax, (_, row) in zip(axes.flat, comparison.iloc[:4].iterrows()):
    draw_pair_map(ax, row)

fig.suptitle("Map 3. Euclidean chords versus directed network paths", y=1.01)
fig.tight_layout()
fig.savefig(FIGURE_DIR / "03-euclidean-network-pair-maps.png", bbox_inches="tight")
plt.show()
"""
    ),
    markdown(
        """
## 6. Compare distances as a chart

The grouped bars make the magnitude of the difference visible. A zero Euclidean bar does not mean that no travel occurred; it means the two selected events share the same geographic coordinates.
"""
    ),
    code(
        """
plot_data = comparison.copy()
labels = [
    "Home to\\nclass",
    "Avery\\nlunch loop",
    "Studio to\\npark pond",
    "Pond to\\nButler",
    "Whole\\nday",
]
x = np.arange(len(plot_data))
width = 0.36

fig, ax = plt.subplots(figsize=(10, 5.5))
euclidean_bars = ax.bar(
    x - width / 2,
    plot_data["euclidean_km"],
    width,
    label="Euclidean distance",
    color="#8DA0CB",
)
network_bars = ax.bar(
    x + width / 2,
    plot_data["network_km"],
    width,
    label="Network distance",
    color="#FC8D62",
)

ax.bar_label(euclidean_bars, fmt="%.2f", padding=3, fontsize=8)
ax.bar_label(network_bars, fmt="%.2f", padding=3, fontsize=8)
ax.set_xticks(x, labels)
ax.set_ylabel("Distance (km)")
ax.set_title("Chart 1. Euclidean and network distance by selected node pair")
ax.legend()
ax.margins(y=0.14)
fig.tight_layout()
fig.savefig(FIGURE_DIR / "04-distance-comparison-chart.png", bbox_inches="tight")
plt.show()
"""
    ),
    markdown(
        """
## 7. Relate network movement to stress over time

Distance alone does not describe experience. The stress timeline places the before-and-after scores beside the event sequence, showing where workload accumulates and where breaks or open space coincide with a reduction.
"""
    ),
    code(
        """
fig, ax = plt.subplots(figsize=(12, 5.5))

ax.plot(
    gdf["event_time"],
    gdf["stress_before"],
    marker="o",
    linewidth=2,
    color="#7570B3",
    label="Stress before",
)
ax.plot(
    gdf["event_time"],
    gdf["stress_after"],
    marker="s",
    linewidth=2,
    color="#1B9E77",
    label="Stress after",
)

for _, row in gdf.iterrows():
    ax.annotate(
        str(int(row["sequence"])),
        (row["event_time"], row["stress_after"]),
        xytext=(0, 7),
        textcoords="offset points",
        ha="center",
        fontsize=8,
    )

ax.set_ylim(0.5, 5.5)
ax.set_yticks([1, 2, 3, 4, 5])
ax.set_ylabel("Self-reported stress (1 low - 5 high)")
ax.set_xlabel("Time")
ax.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M"))
ax.set_title("Chart 2. Stress before and after each event")
ax.legend(ncol=2)
fig.autofmt_xdate(rotation=0)
fig.tight_layout()
fig.savefig(FIGURE_DIR / "05-stress-timeline-chart.png", bbox_inches="tight")
plt.show()
"""
    ),
    markdown(
        """
## 8. Summarize network distance by travel mode

This final chart separates the schematic edge length by mode. It helps distinguish the long subway structure of the day from the shorter walking connections around campus.
"""
    ),
    code(
        """
edge_records = [
    {
        "start": start,
        "end": end,
        "mode": data["mode"],
        "distance_km": data["distance_km"],
    }
    for start, end, data in G.edges(data=True)
]
edge_table = pd.DataFrame(edge_records)
mode_totals = (
    edge_table.groupby("mode", as_index=False)["distance_km"]
    .sum()
    .sort_values("distance_km", ascending=False)
)

fig, ax = plt.subplots(figsize=(8, 4.8))
bars = ax.bar(
    mode_totals["mode"].str.replace("_", " "),
    mode_totals["distance_km"],
    color=[MODE_COLORS.get(mode, "#888888") for mode in mode_totals["mode"]],
)
ax.bar_label(bars, fmt="%.2f km", padding=3)
ax.set_ylabel("Accumulated schematic edge length (km)")
ax.set_xlabel("Travel mode")
ax.set_title("Chart 3. Network distance accumulated by travel mode")
ax.margins(y=0.15)
fig.tight_layout()
fig.savefig(FIGURE_DIR / "06-distance-by-mode-chart.png", bbox_inches="tight")
plt.show()
"""
    ),
    markdown(
        """
## 9. Reflection on Euclidean and network distance

The two measures describe different versions of closeness.

**Euclidean distance describes spatial separation.** It is useful when the question is simply how far apart two coordinates are. It ignores streets, transit lines, entrances, transfers, schedules, intermediate activities, and the direction of the day.

**Network distance describes movement through a defined system.** In this notebook, the system is my recorded daily sequence. It recognizes that reaching class involves walking to the L train, transferring to the 1 train, stopping for coffee, and then entering Avery Hall. These actions make the experienced route longer and more structured than a straight line from home to class.

The Avery lunch loop is the clearest conceptual difference. Its start and end nodes occupy the same location, so their Euclidean distance is zero. The network distance is greater than zero because lunch requires leaving Avery Hall, walking to Sweetgreen, and returning. Euclidean distance sees identical endpoints; network distance sees an event.

The studio-to-park comparison shows another experiential difference. Morningside Park pond is geographically close to Avery Hall, but the meaningful route passes through the Hungarian Pastry Shop and a park entrance. Those intermediate nodes are not merely inefficiencies. They are part of the decompression ritual, and the stress values suggest that the detour has experiential value.

The whole-day comparison should not be interpreted as an efficient route between home and the final subway station. It measures accumulated movement through a day containing class, lunch, studio, coffee, a park visit, and library work. Its network distance is therefore a measure of routine and repetition as much as transportation.

## Limitations

- The network is based on one reconstructed weekday, not repeated GPS observations.
- Edges are straight segments between recorded activity points, so the calculated network distance underestimates real street and subway geometry.
- Subway entrances, station corridors, and the walk between the L and 1 trains are simplified.
- Stress scores are subjective and retrospective.
- The directed graph only supports travel forward through the recorded day; it is not a complete pedestrian or transit network.

## Next step

A more precise version could replace each schematic edge with an actual route:

1. Use OpenStreetMap or NYC street-centerline data for walking edges.
2. Use MTA GTFS stops and route shapes for subway edges.
3. Snap the fifteen activity nodes to the nearest entrance or street-network node.
4. Calculate shortest distance and travel time on a true multimodal graph.
5. Compare the shortest route with the route actually traveled to distinguish necessary network constraint from chosen experiential detour.
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
        "language_info": {
            "name": "python",
            "version": "3.13",
            "mimetype": "text/x-python",
            "codemirror_mode": {"name": "ipython", "version": 3},
            "pygments_lexer": "ipython3",
            "nbconvert_exporter": "python",
            "file_extension": ".py",
        },
    },
)

with NOTEBOOK_PATH.open("w", encoding="utf-8") as handle:
    nbf.write(notebook, handle)

client = NotebookClient(
    notebook,
    timeout=600,
    kernel_name="python3",
    resources={"metadata": {"path": str(ASSIGNMENTS_DIR)}},
)
client.execute()

with NOTEBOOK_PATH.open("w", encoding="utf-8") as handle:
    nbf.write(notebook, handle)

print(f"Created and executed: {NOTEBOOK_PATH}")
