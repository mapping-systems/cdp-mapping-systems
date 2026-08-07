"""Reproducible pedestrian-network analysis for Assignment 03."""

from __future__ import annotations

import hashlib
import itertools
import json
from pathlib import Path
from typing import Any, Iterable

import folium
import geopandas as gpd
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
import networkx as nx
import pandas as pd
from shapely import wkt
from shapely.geometry import LineString, MultiLineString, Point


HERE = Path(__file__).resolve().parent
DATA_DIR = HERE / "inputs"
OUTPUT_DIR = HERE / "outputs"
GRAPH_PATH = DATA_DIR / "morningside_walk.graphml.gz"
MANIFEST_PATH = DATA_DIR / "morningside_walk_manifest.json"
PLACES_PATH = DATA_DIR / "study_locations.geojson"

SOURCE_CRS = "EPSG:4326"
ANALYSIS_CRS = "EPSG:2263"
METRES_PER_US_SURVEY_FOOT = 1200 / 3937
PAIR_COLORS = ["#2563eb", "#e11d48", "#16a34a", "#d97706", "#7c3aed", "#0891b2"]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _edge_geometry(graph: nx.MultiGraph, u: str, v: str, attrs: dict[str, Any]):
    geometry = attrs.get("geometry")
    if geometry:
        try:
            parsed = wkt.loads(geometry) if isinstance(geometry, str) else geometry
            if not parsed.is_empty:
                return parsed
        except Exception:
            pass
    start = Point(float(graph.nodes[u]["x"]), float(graph.nodes[u]["y"]))
    end = Point(float(graph.nodes[v]["x"]), float(graph.nodes[v]["y"]))
    return LineString([start, end])


def _line_parts(geometry) -> list[LineString]:
    if isinstance(geometry, LineString):
        return [geometry]
    if isinstance(geometry, MultiLineString):
        return list(geometry.geoms)
    return []


def _oriented_edge_parts(
    graph: nx.MultiGraph,
    u: str,
    v: str,
    attrs: dict[str, Any],
) -> list[LineString]:
    """Order and orient an edge's line parts from traversal node u toward v."""
    remaining = _line_parts(_edge_geometry(graph, u, v, attrs))
    current = Point(graph.nodes[u]["x"], graph.nodes[u]["y"])
    oriented: list[LineString] = []

    while remaining:
        candidates = []
        for index, line in enumerate(remaining):
            start = Point(line.coords[0])
            end = Point(line.coords[-1])
            candidates.append((current.distance(start), index, False))
            candidates.append((current.distance(end), index, True))
        _, chosen_index, reverse = min(candidates, key=lambda item: item[0])
        chosen = remaining.pop(chosen_index)
        if reverse:
            chosen = LineString(list(chosen.coords)[::-1])
        oriented.append(chosen)
        current = Point(chosen.coords[-1])
    return oriented


def load_inputs() -> tuple[nx.MultiGraph, gpd.GeoDataFrame, dict[str, Any]]:
    """Load and validate the frozen walk graph and four public locations."""
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    actual_hash = sha256(GRAPH_PATH)
    if actual_hash != manifest["artifact_sha256"]:
        raise ValueError("Walking-network checksum does not match the manifest")

    graph = nx.MultiGraph(nx.read_graphml(GRAPH_PATH, force_multigraph=True))
    for _, attrs in graph.nodes(data=True):
        attrs["x"] = float(attrs["x"])
        attrs["y"] = float(attrs["y"])
        if "street_count" in attrs:
            attrs["street_count"] = int(float(attrs["street_count"]))
    for _, _, _, attrs in graph.edges(keys=True, data=True):
        attrs["length"] = float(attrs["length"])

    places = gpd.read_file(PLACES_PATH).sort_values("sequence").reset_index(drop=True)
    if places.crs is None:
        places = places.set_crs(SOURCE_CRS)

    assert nx.is_connected(graph), "The bounded walking graph must be connected"
    assert graph.number_of_nodes() == manifest["node_count"]
    assert graph.number_of_edges() == manifest["edge_count"]
    assert len(places) == 4 and set(places.geometry.geom_type) == {"Point"}
    assert places["place_id"].is_unique and places["sequence"].is_unique
    return graph, places, manifest


def graph_to_gdfs(graph: nx.MultiGraph) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    node_records = []
    for node, attrs in graph.nodes(data=True):
        node_records.append(
            {
                "node_id": str(node),
                "street_count": attrs.get("street_count"),
                "geometry": Point(attrs["x"], attrs["y"]),
            }
        )

    edge_records = []
    for u, v, key, attrs in graph.edges(keys=True, data=True):
        edge_records.append(
            {
                "u": str(u),
                "v": str(v),
                "key": int(key) if str(key).isdigit() else str(key),
                "length_m": float(attrs["length"]),
                "name": str(attrs.get("name", "")),
                "highway": str(attrs.get("highway", "")),
                "geometry": _edge_geometry(graph, u, v, attrs),
            }
        )

    nodes = gpd.GeoDataFrame(node_records, crs=SOURCE_CRS)
    edges = gpd.GeoDataFrame(edge_records, crs=SOURCE_CRS)
    return nodes, edges


def snap_locations(
    graph: nx.MultiGraph,
    places: gpd.GeoDataFrame,
    nodes: gpd.GeoDataFrame,
) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    """Snap each place to its nearest graph node in a metric projected CRS."""
    places_metric = places.to_crs(ANALYSIS_CRS)
    nodes_metric = nodes.to_crs(ANALYSIS_CRS).set_index("node_id")
    records = []
    connector_records = []

    for source_row, metric_row in zip(places.itertuples(), places_metric.itertuples(), strict=True):
        distances_ft = nodes_metric.geometry.distance(metric_row.geometry)
        node_id = str(distances_ft.idxmin())
        connector_m = float(distances_ft.loc[node_id]) * METRES_PER_US_SURVEY_FOOT
        node_point = nodes.loc[nodes["node_id"] == node_id, "geometry"].iloc[0]

        record = source_row._asdict()
        record.pop("Index", None)
        record["snapped_node"] = node_id
        record["connector_m"] = connector_m
        record["snapped_lon"] = node_point.x
        record["snapped_lat"] = node_point.y
        records.append(record)
        connector_records.append(
            {
                "place_id": source_row.place_id,
                "name": source_row.name,
                "connector_m": connector_m,
                "geometry": LineString([source_row.geometry, node_point]),
            }
        )

    snapped = gpd.GeoDataFrame(records, geometry="geometry", crs=places.crs)
    connectors = gpd.GeoDataFrame(connector_records, crs=places.crs)
    assert snapped["connector_m"].max() < 50, "A place snapped implausibly far from the walk graph"
    return snapped, connectors


def _minimum_edge(graph: nx.MultiGraph, u: str, v: str) -> dict[str, Any]:
    bundle = graph.get_edge_data(u, v)
    if bundle is None:
        raise nx.NetworkXNoPath(f"Missing edge between {u} and {v}")
    return min(bundle.values(), key=lambda attrs: float(attrs["length"]))


def _route_geometry(
    graph: nx.MultiGraph,
    path: list[str],
    origin_point: Point,
    destination_point: Point,
) -> MultiLineString:
    origin_node_point = Point(graph.nodes[path[0]]["x"], graph.nodes[path[0]]["y"])
    destination_node_point = Point(graph.nodes[path[-1]]["x"], graph.nodes[path[-1]]["y"])
    lines: list[LineString] = [LineString([origin_point, origin_node_point])]
    for u, v in zip(path[:-1], path[1:], strict=True):
        lines.extend(_oriented_edge_parts(graph, u, v, _minimum_edge(graph, u, v)))
    lines.append(LineString([destination_node_point, destination_point]))
    return MultiLineString(lines)


def calculate_all_pairs(
    graph: nx.MultiGraph,
    snapped: gpd.GeoDataFrame,
) -> tuple[pd.DataFrame, gpd.GeoDataFrame, gpd.GeoDataFrame]:
    """Measure all six unique pairs with like-for-like endpoints."""
    metric = snapped.to_crs(ANALYSIS_CRS).set_index("place_id")
    indexed = snapped.set_index("place_id")
    result_records = []
    route_records = []
    straight_records = []

    for pair_number, (origin_id, destination_id) in enumerate(
        itertools.combinations(snapped["place_id"].tolist(), 2), start=1
    ):
        origin = indexed.loc[origin_id]
        destination = indexed.loc[destination_id]
        origin_node = str(origin["snapped_node"])
        destination_node = str(destination["snapped_node"])
        graph_path = nx.shortest_path(graph, origin_node, destination_node, weight="length")
        graph_path_m = float(
            nx.shortest_path_length(graph, origin_node, destination_node, weight="length")
        )
        euclidean_m = (
            metric.loc[origin_id].geometry.distance(metric.loc[destination_id].geometry)
            * METRES_PER_US_SURVEY_FOOT
        )
        network_m = float(origin["connector_m"]) + graph_path_m + float(destination["connector_m"])
        pair_id = f"P{pair_number}"
        pair_label = f'{origin["short_name"]} ↔ {destination["short_name"]}'
        record = {
            "pair_id": pair_id,
            "pair_label": pair_label,
            "origin_id": origin_id,
            "origin": origin["short_name"],
            "destination_id": destination_id,
            "destination": destination["short_name"],
            "euclidean_m": euclidean_m,
            "origin_connector_m": float(origin["connector_m"]),
            "graph_path_m": graph_path_m,
            "destination_connector_m": float(destination["connector_m"]),
            "network_m": network_m,
            "extra_m": network_m - euclidean_m,
            "detour_ratio": network_m / euclidean_m,
            "path_nodes": len(graph_path),
        }
        result_records.append(record)
        route_records.append(
            {
                **record,
                "geometry": _route_geometry(
                    graph, graph_path, origin.geometry, destination.geometry
                ),
            }
        )
        straight_records.append(
            {
                "pair_id": pair_id,
                "pair_label": pair_label,
                "euclidean_m": euclidean_m,
                "geometry": LineString([origin.geometry, destination.geometry]),
            }
        )

    results = pd.DataFrame(result_records)
    routes = gpd.GeoDataFrame(route_records, crs=snapped.crs)
    straight = gpd.GeoDataFrame(straight_records, crs=snapped.crs)
    assert len(results) == 6 and len(routes) == 6 and len(straight) == 6
    assert (results["network_m"] + 1 >= results["euclidean_m"]).all()
    return results, routes, straight


def _map_context(ax, edges_metric: gpd.GeoDataFrame, nodes_metric: gpd.GeoDataFrame | None = None):
    highway = edges_metric["highway"].fillna("")
    path_mask = highway.str.contains("footway|path|steps|pedestrian", case=False, regex=True)
    edges_metric.loc[~path_mask].plot(ax=ax, color="#cbd5e1", linewidth=0.8, zorder=1)
    edges_metric.loc[path_mask].plot(ax=ax, color="#d8b365", linewidth=0.9, zorder=2)
    if nodes_metric is not None:
        nodes_metric.plot(ax=ax, color="#475569", markersize=2.2, alpha=0.7, zorder=3)
    ax.set_facecolor("#f8fafc")


def _set_extent(ax, geometries: Iterable, margin_m: float = 260):
    series = gpd.GeoSeries(list(geometries), crs=ANALYSIS_CRS)
    xmin, ymin, xmax, ymax = series.total_bounds
    margin_ft = margin_m / METRES_PER_US_SURVEY_FOOT
    ax.set_xlim(xmin - margin_ft, xmax + margin_ft)
    ax.set_ylim(ymin - margin_ft, ymax + margin_ft)
    ax.set_aspect("equal")
    ax.set_axis_off()


def _add_scale_north_source(ax, scale_m: int = 250):
    xmin, xmax = ax.get_xlim()
    ymin, ymax = ax.get_ylim()
    width, height = xmax - xmin, ymax - ymin
    x0 = xmin + width * 0.05
    y0 = ymin + height * 0.055
    length_ft = scale_m / METRES_PER_US_SURVEY_FOOT
    ax.plot([x0, x0 + length_ft], [y0, y0], color="#0f172a", linewidth=2.5, zorder=20)
    ax.plot([x0, x0], [y0 - height * 0.009, y0 + height * 0.009], color="#0f172a", linewidth=1.4, zorder=20)
    ax.plot([x0 + length_ft, x0 + length_ft], [y0 - height * 0.009, y0 + height * 0.009], color="#0f172a", linewidth=1.4, zorder=20)
    ax.text(x0 + length_ft / 2, y0 + height * 0.015, f"{scale_m} m", ha="center", fontsize=8)
    ax.annotate(
        "N",
        xy=(0.955, 0.91),
        xytext=(0.955, 0.80),
        xycoords="axes fraction",
        textcoords="axes fraction",
        ha="center",
        va="center",
        fontsize=10,
        fontweight="bold",
        arrowprops={"arrowstyle": "-|>", "color": "#0f172a", "lw": 1.2},
    )
    ax.text(
        0.01,
        0.01,
        "Network: © OpenStreetMap contributors · EPSG:2263",
        transform=ax.transAxes,
        fontsize=7,
        color="#475569",
        bbox={"facecolor": "white", "edgecolor": "none", "alpha": 0.8, "pad": 2},
        zorder=30,
    )


def _label_places(ax, places_metric: gpd.GeoDataFrame, selected: set[str] | None = None):
    offsets = {
        "place-01": (-8, 8),
        "place-02": (7, 7),
        "place-03": (-78, -15),
        "place-04": (7, -4),
    }
    for row in places_metric.itertuples():
        if selected is not None and row.place_id not in selected:
            continue
        dx, dy = offsets.get(row.place_id, (6, 6))
        ax.annotate(
            row.short_name,
            (row.geometry.x, row.geometry.y),
            xytext=(dx, dy),
            textcoords="offset points",
            fontsize=8,
            fontweight="bold",
            color="#0f172a",
            bbox={"facecolor": "white", "edgecolor": "none", "alpha": 0.72, "pad": 1.5},
            zorder=30,
        )


def plot_network_definition(
    edges: gpd.GeoDataFrame,
    nodes: gpd.GeoDataFrame,
    places: gpd.GeoDataFrame,
):
    OUTPUT_DIR.mkdir(exist_ok=True)
    edges_m, nodes_m, places_m = edges.to_crs(ANALYSIS_CRS), nodes.to_crs(ANALYSIS_CRS), places.to_crs(ANALYSIS_CRS)
    fig, ax = plt.subplots(figsize=(10, 10))
    _map_context(ax, edges_m, nodes_m)
    places_m.plot(ax=ax, color="#e11d48", edgecolor="white", linewidth=1.2, markersize=85, zorder=10)
    _label_places(ax, places_m)
    _set_extent(ax, places_m.geometry, margin_m=520)
    _add_scale_north_source(ax)
    ax.set_title("1 · Real pedestrian network and measured locations", loc="left", fontweight="bold", pad=12)
    ax.text(
        0,
        1.005,
        f"{len(nodes):,} OSM nodes · {len(edges):,} walkable edges · edge weight = length (m)",
        transform=ax.transAxes,
        fontsize=9,
        color="#475569",
    )
    ax.legend(
        handles=[
            Line2D([0], [0], color="#cbd5e1", lw=2, label="walkable street edge"),
            Line2D([0], [0], color="#d8b365", lw=2, label="footway / path / steps"),
            Line2D([0], [0], marker="o", color="none", markerfacecolor="#e11d48", markeredgecolor="white", markersize=8, label="measured place"),
        ],
        loc="upper left",
        frameon=True,
        framealpha=0.94,
        fontsize=8,
    )
    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / "01_network_definition.png", dpi=190, bbox_inches="tight")
    return fig


def plot_snap_validation(
    edges: gpd.GeoDataFrame,
    nodes: gpd.GeoDataFrame,
    snapped: gpd.GeoDataFrame,
    connectors: gpd.GeoDataFrame,
):
    edges_m, nodes_m = edges.to_crs(ANALYSIS_CRS), nodes.to_crs(ANALYSIS_CRS)
    places_m, connectors_m = snapped.to_crs(ANALYSIS_CRS), connectors.to_crs(ANALYSIS_CRS)
    snapped_points = gpd.GeoDataFrame(
        snapped[["place_id", "snapped_node", "connector_m"]].copy(),
        geometry=gpd.points_from_xy(snapped["snapped_lon"], snapped["snapped_lat"]),
        crs=SOURCE_CRS,
    ).to_crs(ANALYSIS_CRS)

    fig, ax = plt.subplots(figsize=(10, 9))
    _map_context(ax, edges_m, nodes_m)
    connectors_m.plot(ax=ax, color="#e11d48", linewidth=1.8, linestyle="--", zorder=10)
    snapped_points.plot(ax=ax, color="#2563eb", marker="s", edgecolor="white", markersize=62, zorder=12)
    places_m.plot(ax=ax, color="#e11d48", edgecolor="white", markersize=80, zorder=13)
    _label_places(ax, places_m)
    connector_label_offsets = {
        "place-01": (8, -10),
        "place-02": (5, -13),
        "place-03": (5, 5),
        "place-04": (-28, 8),
    }
    for row in connectors_m.itertuples():
        midpoint = row.geometry.interpolate(0.5, normalized=True)
        dx, dy = connector_label_offsets.get(row.place_id, (4, 4))
        ax.annotate(
            f"{row.connector_m:.1f} m",
            (midpoint.x, midpoint.y),
            xytext=(dx, dy),
            textcoords="offset points",
            fontsize=7,
            color="#9f1239",
            zorder=20,
        )
    _set_extent(ax, places_m.geometry, margin_m=240)
    _add_scale_north_source(ax, scale_m=100)
    ax.set_title("2 · Node-snap validation", loc="left", fontweight="bold", pad=12)
    ax.text(0, 1.005, "Dashed connectors are included in every network-distance total", transform=ax.transAxes, fontsize=9, color="#475569")
    ax.legend(
        handles=[
            Line2D([0], [0], marker="o", color="none", markerfacecolor="#e11d48", markeredgecolor="white", markersize=8, label="original location"),
            Line2D([0], [0], marker="s", color="none", markerfacecolor="#2563eb", markeredgecolor="white", markersize=8, label="nearest network node"),
            Line2D([0], [0], color="#e11d48", lw=1.8, linestyle="--", label="snap connector"),
        ],
        loc="upper left",
        framealpha=0.94,
        fontsize=8,
    )
    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / "02_node_snap_validation.png", dpi=190, bbox_inches="tight")
    return fig


def plot_euclidean_connections(
    edges: gpd.GeoDataFrame,
    places: gpd.GeoDataFrame,
    straight: gpd.GeoDataFrame,
):
    edges_m, places_m, straight_m = edges.to_crs(ANALYSIS_CRS), places.to_crs(ANALYSIS_CRS), straight.to_crs(ANALYSIS_CRS)
    fig, ax = plt.subplots(figsize=(10, 9))
    _map_context(ax, edges_m)
    for color, row in zip(PAIR_COLORS, straight_m.itertuples(), strict=True):
        gpd.GeoSeries([row.geometry], crs=ANALYSIS_CRS).plot(ax=ax, color=color, linewidth=2.1, linestyle="--", alpha=0.9, zorder=8, label=f"{row.pair_id} · {row.pair_label}")
    places_m.plot(ax=ax, color="#0f172a", edgecolor="white", markersize=78, zorder=12)
    _label_places(ax, places_m)
    _set_extent(ax, places_m.geometry, margin_m=260)
    _add_scale_north_source(ax, scale_m=100)
    ax.set_title("3 · Euclidean connections ignore topology", loc="left", fontweight="bold", pad=12)
    ax.text(0, 1.005, "All six unique pairs as projected straight lines", transform=ax.transAxes, fontsize=9, color="#475569")
    ax.legend(loc="upper left", fontsize=7, framealpha=0.94)
    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / "03_euclidean_connections.png", dpi=190, bbox_inches="tight")
    return fig


def plot_shortest_routes(
    edges: gpd.GeoDataFrame,
    places: gpd.GeoDataFrame,
    routes: gpd.GeoDataFrame,
):
    edges_m, places_m, routes_m = edges.to_crs(ANALYSIS_CRS), places.to_crs(ANALYSIS_CRS), routes.to_crs(ANALYSIS_CRS)
    fig, ax = plt.subplots(figsize=(10, 9))
    _map_context(ax, edges_m)
    for color, row in zip(PAIR_COLORS, routes_m.itertuples(), strict=True):
        gpd.GeoSeries([row.geometry], crs=ANALYSIS_CRS).plot(ax=ax, color=color, linewidth=3.0, alpha=0.78, zorder=8, label=f"{row.pair_id} · {row.pair_label}")
    places_m.plot(ax=ax, color="#0f172a", edgecolor="white", markersize=78, zorder=12)
    _label_places(ax, places_m)
    _set_extent(ax, routes_m.geometry, margin_m=190)
    _add_scale_north_source(ax, scale_m=100)
    ax.set_title("4 · Length-weighted shortest paths on the OSM walk graph", loc="left", fontweight="bold", pad=12)
    ax.text(0, 1.005, "Each route includes its two point-to-node connectors", transform=ax.transAxes, fontsize=9, color="#475569")
    ax.legend(loc="upper left", fontsize=7, framealpha=0.94)
    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / "04_all_shortest_routes.png", dpi=190, bbox_inches="tight")
    return fig


def plot_selected_comparisons(
    edges: gpd.GeoDataFrame,
    places: gpd.GeoDataFrame,
    routes: gpd.GeoDataFrame,
    straight: gpd.GeoDataFrame,
    results: pd.DataFrame,
):
    edges_m, places_m = edges.to_crs(ANALYSIS_CRS), places.to_crs(ANALYSIS_CRS)
    routes_m, straight_m = routes.to_crs(ANALYSIS_CRS), straight.to_crs(ANALYSIS_CRS)
    selected = [results.loc[results["detour_ratio"].idxmax()], results.loc[results["detour_ratio"].idxmin()]]
    fig, axes = plt.subplots(1, 2, figsize=(14, 7))
    subtitles = ["Largest detour", "Smallest detour"]

    for ax, summary, subtitle in zip(axes, selected, subtitles, strict=True):
        pair_id = summary["pair_id"]
        route = routes_m.loc[routes_m["pair_id"] == pair_id].iloc[0]
        direct = straight_m.loc[straight_m["pair_id"] == pair_id].iloc[0]
        _map_context(ax, edges_m)
        gpd.GeoSeries([direct.geometry], crs=ANALYSIS_CRS).plot(ax=ax, color="#e11d48", linewidth=2.2, linestyle="--", zorder=8)
        gpd.GeoSeries([route.geometry], crs=ANALYSIS_CRS).plot(ax=ax, color="#2563eb", linewidth=3.2, zorder=9)
        place_ids = {summary["origin_id"], summary["destination_id"]}
        pair_places = places_m[places_m["place_id"].isin(place_ids)]
        pair_places.plot(ax=ax, color="#0f172a", edgecolor="white", markersize=80, zorder=12)
        _label_places(ax, pair_places, selected=place_ids)
        _set_extent(ax, [route.geometry, direct.geometry], margin_m=130)
        _add_scale_north_source(ax, scale_m=100)
        ax.text(
            0,
            1.11,
            f"{subtitle}: {pair_id}",
            transform=ax.transAxes,
            fontsize=13,
            fontweight="bold",
            color="#0f172a",
        )
        ax.text(
            0,
            1.035,
            f'{summary["pair_label"]}\n{summary["euclidean_m"]:.0f} m straight · {summary["network_m"]:.0f} m network · {summary["detour_ratio"]:.2f}×',
            transform=ax.transAxes,
            fontsize=8.2,
            color="#475569",
        )

    fig.suptitle("5 · Why equal-looking proximity can produce different walks", x=0.02, y=0.99, ha="left", fontsize=15, fontweight="bold")
    fig.legend(
        handles=[
            Line2D([0], [0], color="#e11d48", linestyle="--", lw=2.2, label="Euclidean"),
            Line2D([0], [0], color="#2563eb", lw=3.2, label="network shortest path"),
        ],
        loc="lower center",
        ncol=2,
        frameon=False,
    )
    fig.tight_layout(rect=(0, 0.05, 1, 0.89))
    fig.savefig(OUTPUT_DIR / "05_selected_route_comparisons.png", dpi=190, bbox_inches="tight")
    return fig


def plot_distance_comparison(results: pd.DataFrame):
    ordered = results.sort_values("network_m").reset_index(drop=True)
    fig, ax = plt.subplots(figsize=(10, 6.5))
    y = list(range(len(ordered)))
    ax.hlines(y, ordered["euclidean_m"], ordered["network_m"], color="#cbd5e1", linewidth=4, zorder=1)
    ax.scatter(ordered["euclidean_m"], y, color="#64748b", s=70, label="Euclidean", zorder=3)
    ax.scatter(ordered["network_m"], y, color="#2563eb", s=70, label="Network", zorder=3)
    for index, row in ordered.iterrows():
        ax.text(row["network_m"] + 12, index, f'{row["network_m"]:.0f} m', va="center", fontsize=8, color="#1e3a8a")
    ax.set_yticks(y, ordered["pair_label"])
    ax.set_xlabel("Distance (m)")
    ax.set_title("6 · Straight-line and network distance for the same endpoints", loc="left", fontweight="bold")
    ax.grid(axis="x", color="#e2e8f0")
    ax.legend(frameon=False, ncol=2, loc="lower right")
    for spine in ["top", "right", "left"]:
        ax.spines[spine].set_visible(False)
    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / "06_distance_comparison.png", dpi=190, bbox_inches="tight")
    return fig


def plot_detour_ratio(results: pd.DataFrame):
    ordered = results.sort_values("detour_ratio").reset_index(drop=True)
    colors = ["#e11d48" if value == ordered["detour_ratio"].max() else "#2563eb" for value in ordered["detour_ratio"]]
    fig, ax = plt.subplots(figsize=(10, 6.5))
    bars = ax.barh(ordered["pair_label"], ordered["detour_ratio"], color=colors)
    ax.axvline(1, color="#0f172a", linewidth=1.2, linestyle="--")
    ax.bar_label(bars, labels=[f"{value:.2f}×" for value in ordered["detour_ratio"]], padding=4, fontsize=8)
    ax.set_xlim(0, max(2.0, ordered["detour_ratio"].max() + 0.18))
    ax.set_xlabel("Network distance ÷ Euclidean distance")
    ax.set_title("7 · Detour ratio isolates the effect of network form", loc="left", fontweight="bold")
    ax.grid(axis="x", color="#e2e8f0")
    for spine in ["top", "right", "left"]:
        ax.spines[spine].set_visible(False)
    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / "07_detour_ratio.png", dpi=190, bbox_inches="tight")
    return fig


def plot_distance_scatter(results: pd.DataFrame):
    fig, ax = plt.subplots(figsize=(7.5, 7))
    maximum = max(results["network_m"].max(), results["euclidean_m"].max()) * 1.10
    ax.plot([0, maximum], [0, maximum], color="#94a3b8", linestyle="--", label="1:1 line")
    ax.scatter(results["euclidean_m"], results["network_m"], color=PAIR_COLORS, s=85, edgecolor="white", linewidth=0.8, zorder=3)
    for row in results.itertuples():
        ax.annotate(row.pair_id, (row.euclidean_m, row.network_m), xytext=(5, 5), textcoords="offset points", fontsize=8, fontweight="bold")
    ax.set_xlim(0, maximum)
    ax.set_ylim(0, maximum)
    ax.set_aspect("equal")
    ax.set_xlabel("Euclidean distance (m)")
    ax.set_ylabel("Network distance (m)")
    ax.set_title("8 · Every walking route is longer than its direct line", loc="left", fontweight="bold")
    ax.grid(color="#e2e8f0")
    ax.legend(frameon=False)
    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / "08_distance_scatterplot.png", dpi=190, bbox_inches="tight")
    return fig


def build_interactive_map(
    edges: gpd.GeoDataFrame,
    snapped: gpd.GeoDataFrame,
    routes: gpd.GeoDataFrame,
    straight: gpd.GeoDataFrame,
) -> Path:
    """Save a layered Leaflet preview on a real OpenStreetMap tile basemap."""
    center = [float(snapped.geometry.y.mean()), float(snapped.geometry.x.mean())]
    map_object = folium.Map(location=center, zoom_start=15, tiles=None, control_scale=True)
    folium.TileLayer("OpenStreetMap", name="OpenStreetMap basemap", show=True).add_to(map_object)

    network_layer = folium.FeatureGroup(name="OSM pedestrian network", show=True)
    network_fields = edges[["name", "highway", "length_m", "geometry"]].copy()
    folium.GeoJson(
        json.loads(network_fields.to_json()),
        style_function=lambda _: {"color": "#64748b", "weight": 1.4, "opacity": 0.68},
        tooltip=folium.GeoJsonTooltip(fields=["name", "highway", "length_m"], aliases=["Street/path", "OSM highway tag", "Edge length (m)"], localize=True),
    ).add_to(network_layer)
    network_layer.add_to(map_object)

    euclidean_layer = folium.FeatureGroup(name="Euclidean connections", show=False)
    for color, row in zip(PAIR_COLORS, straight.itertuples(), strict=True):
        folium.GeoJson(
            row.geometry.__geo_interface__,
            style_function=lambda _, color=color: {"color": color, "weight": 2, "dashArray": "6 5", "opacity": 0.9},
            tooltip=f"{row.pair_id} · {row.pair_label} · {row.euclidean_m:.0f} m straight",
        ).add_to(euclidean_layer)
    euclidean_layer.add_to(map_object)

    routes_layer = folium.FeatureGroup(name="Shortest walking routes", show=True)
    for color, row in zip(PAIR_COLORS, routes.itertuples(), strict=True):
        folium.GeoJson(
            row.geometry.__geo_interface__,
            style_function=lambda _, color=color: {"color": color, "weight": 5, "opacity": 0.82},
            tooltip=f"{row.pair_id} · {row.pair_label} · {row.network_m:.0f} m · {row.detour_ratio:.2f}×",
        ).add_to(routes_layer)
    routes_layer.add_to(map_object)

    place_layer = folium.FeatureGroup(name="Measured places", show=True)
    for row in snapped.itertuples():
        popup = (
            f"<b>{row.name}</b><br>Role: {row.role}<br>"
            f"Nearest graph node: {row.snapped_node}<br>Snap connector: {row.connector_m:.1f} m"
        )
        folium.CircleMarker(
            location=[row.geometry.y, row.geometry.x],
            radius=7,
            color="white",
            weight=2,
            fill=True,
            fill_color="#e11d48",
            fill_opacity=1,
            tooltip=row.short_name,
            popup=folium.Popup(popup, max_width=320),
        ).add_to(place_layer)
    place_layer.add_to(map_object)

    bounds = [[float(snapped.geometry.y.min() - 0.004), float(snapped.geometry.x.min() - 0.004)], [float(snapped.geometry.y.max() + 0.004), float(snapped.geometry.x.max() + 0.004)]]
    map_object.fit_bounds(bounds)
    folium.LayerControl(collapsed=False).add_to(map_object)
    title = """
    <div style="position:fixed;top:12px;left:52px;z-index:9999;background:white;
                padding:9px 12px;border:1px solid #cbd5e1;border-radius:5px;
                font:14px/1.25 sans-serif;box-shadow:0 1px 5px rgba(0,0,0,.18)">
      <b>Morningside Heights walking network</b><br>
      <span style="font-size:12px;color:#475569">Real OSM basemap + six measured routes</span>
    </div>
    """
    map_object.get_root().html.add_child(folium.Element(title))
    output_path = OUTPUT_DIR / "09_interactive_routes.html"
    map_object.save(output_path)
    return output_path


def write_outputs(
    manifest: dict[str, Any],
    nodes: gpd.GeoDataFrame,
    edges: gpd.GeoDataFrame,
    snapped: gpd.GeoDataFrame,
    connectors: gpd.GeoDataFrame,
    results: pd.DataFrame,
    routes: gpd.GeoDataFrame,
    straight: gpd.GeoDataFrame,
) -> dict[str, Any]:
    OUTPUT_DIR.mkdir(exist_ok=True)
    nodes.to_file(OUTPUT_DIR / "network_nodes.geojson", driver="GeoJSON")
    edges.to_file(OUTPUT_DIR / "network_edges.geojson", driver="GeoJSON")
    snapped.to_file(OUTPUT_DIR / "snapped_study_locations.geojson", driver="GeoJSON")
    connectors.to_file(OUTPUT_DIR / "node_snap_connectors.geojson", driver="GeoJSON")
    routes.to_file(OUTPUT_DIR / "shortest_walking_routes.geojson", driver="GeoJSON")
    straight.to_file(OUTPUT_DIR / "euclidean_connections.geojson", driver="GeoJSON")
    results.to_csv(OUTPUT_DIR / "distance_results.csv", index=False)
    interactive_path = build_interactive_map(edges, snapped, routes, straight)

    figure_names = [
        "01_network_definition.png",
        "02_node_snap_validation.png",
        "03_euclidean_connections.png",
        "04_all_shortest_routes.png",
        "05_selected_route_comparisons.png",
        "06_distance_comparison.png",
        "07_detour_ratio.png",
        "08_distance_scatterplot.png",
    ]
    audit = {
        "graph_snapshot_sha256": manifest["artifact_sha256"],
        "graph_nodes": len(nodes),
        "graph_edges": len(edges),
        "network_type": manifest["network_type"],
        "measured_places": len(snapped),
        "unique_pairs_expected": 6,
        "unique_pairs_calculated": len(results),
        "reachable_pairs": int(results["network_m"].notna().sum()),
        "maximum_snap_connector_m": float(snapped["connector_m"].max()),
        "network_not_shorter_than_euclidean": bool((results["network_m"] + 1 >= results["euclidean_m"]).all()),
        "minimum_detour_ratio": float(results["detour_ratio"].min()),
        "maximum_detour_ratio": float(results["detour_ratio"].max()),
        "figures_created": sum((OUTPUT_DIR / name).exists() for name in figure_names),
        "interactive_map": interactive_path.name,
    }
    (OUTPUT_DIR / "network_audit.json").write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")

    assert audit["unique_pairs_calculated"] == audit["unique_pairs_expected"]
    assert audit["reachable_pairs"] == audit["unique_pairs_expected"]
    assert audit["network_not_shorter_than_euclidean"]
    assert audit["figures_created"] == len(figure_names)
    assert interactive_path.exists() and interactive_path.stat().st_size > 0
    return audit
