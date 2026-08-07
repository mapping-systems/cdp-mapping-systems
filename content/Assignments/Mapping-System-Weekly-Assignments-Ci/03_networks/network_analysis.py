"""Network analysis for Mapping Systems Assignment 04.

The module keeps the expensive network work reproducible and separate from the
reader-facing notebook. It uses a real OpenStreetMap pedestrian graph through
OSMnx and NetworkX; no detour factor or simulated distance is substituted for a
shortest-path result.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from itertools import pairwise
from pathlib import Path
from typing import Any

import geopandas as gpd
import matplotlib as mpl
import matplotlib.pyplot as plt
import networkx as nx
import numpy as np
import osmnx as ox
import pandas as pd
import shapely
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.lines import Line2D
from shapely.geometry import LineString, MultiLineString, Point


LOCAL_CRS = "EPSG:2263"
FEET_TO_METERS = 0.3048006096012192
GRAPH_BUFFER_METERS = 1_500.0
WALKING_SPEED_METERS_PER_MINUTE = 80.0
DISTANCE_TOLERANCE_METERS = 5.0

INK = "#172033"
MUTED = "#657184"
GRID = "#D9DEE7"
PAPER = "#FCFBF8"
BLUE = "#2D63B7"
BLUE_LIGHT = "#AFC6E9"
ORANGE = "#D88C00"
ORANGE_DARK = "#8D5700"


@dataclass(frozen=True)
class AssignmentPaths:
    """Resolved paths for one local assignment checkout."""

    assignment_dir: Path
    project_root: Path
    rent_source: Path
    subway_source: Path
    nta_source: Path
    graph_cache: Path
    graph_manifest: Path
    output_data: Path
    output_figures: Path

    @classmethod
    def from_assignment_dir(cls, assignment_dir: str | Path) -> "AssignmentPaths":
        assignment_dir = Path(assignment_dir).expanduser().resolve()
        project_root = assignment_dir.parent
        return cls(
            assignment_dir=assignment_dir,
            project_root=project_root,
            rent_source=project_root / "data/source/manhattan_rent_series.json",
            subway_source=project_root / "data/reference/subway_stations.geojson",
            nta_source=project_root / "data/reference/manhattan_nta.geojson",
            graph_cache=(
                assignment_dir / "data/network_snapshot/manhattan_walk.graphml.gz"
            ),
            graph_manifest=(
                assignment_dir / "data/network_snapshot/manhattan_walk_manifest.json"
            ),
            output_data=assignment_dir / "outputs/data",
            output_figures=assignment_dir / "outputs/figures",
        )

    def ensure_output_directories(self) -> None:
        self.graph_cache.parent.mkdir(parents=True, exist_ok=True)
        self.output_data.mkdir(parents=True, exist_ok=True)
        self.output_figures.mkdir(parents=True, exist_ok=True)


def sha256_file(path: Path) -> str:
    """Return a streaming SHA-256 digest without loading a large graph at once."""

    digest = hashlib.sha256()
    with path.open("rb") as file_handle:
        for chunk in iter(lambda: file_handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def _write_geojson(path: Path, frame: gpd.GeoDataFrame) -> None:
    """Write strict, human-readable WGS84 GeoJSON with JSON nulls for missing values."""

    frame = frame.to_crs(4326)
    payload = json.loads(frame.to_json(na="null", drop_id=True, to_wgs84=True))
    _write_json(path, payload)


def load_and_validate_inputs(paths: AssignmentPaths) -> dict[str, Any]:
    """Load the three assignment inputs and assert their expected analytical grain."""

    missing = [
        path
        for path in (paths.rent_source, paths.subway_source, paths.nta_source)
        if not path.exists()
    ]
    if missing:
        raise FileNotFoundError(f"Missing assignment inputs: {missing}")

    rent_payload = json.loads(paths.rent_source.read_text(encoding="utf-8"))
    months = rent_payload.get("months", [])
    neighborhoods = rent_payload.get("neighborhoods", [])

    if len(months) != 120 or months[0] != "2016-07" or months[-1] != "2026-06":
        raise ValueError("Rent series must contain 120 months from 2016-07 to 2026-06.")
    if len(neighborhoods) != 31:
        raise ValueError(f"Expected 31 Manhattan rent neighborhoods, found {len(neighborhoods)}.")

    origin_rows: list[dict[str, Any]] = []
    for neighborhood in neighborhoods:
        rents = neighborhood.get("rents", {})
        if list(rents) != months or any(value is None for value in rents.values()):
            raise ValueError(f"Incomplete or misordered rent series: {neighborhood.get('name')}")
        calculated_growth = (
            (neighborhood["latestRent"] - neighborhood["baselineRent"])
            / neighborhood["baselineRent"]
            * 100
        )
        if not np.isclose(calculated_growth, neighborhood["growthPct"], atol=0.11):
            raise ValueError(f"Growth field does not reconcile: {neighborhood.get('name')}")
        longitude, latitude = neighborhood["center"]
        origin_rows.append(
            {
                "neighborhood_id": neighborhood["id"],
                "neighborhood": neighborhood["name"],
                "longitude": float(longitude),
                "latitude": float(latitude),
                "baseline_rent_usd": float(neighborhood["baselineRent"]),
                "latest_rent_usd": float(neighborhood["latestRent"]),
                "growth_pct": float(neighborhood["growthPct"]),
                "geometry": Point(float(longitude), float(latitude)),
            }
        )

    origins = gpd.GeoDataFrame(origin_rows, crs=4326).sort_values(
        "neighborhood", ignore_index=True
    )
    if origins["neighborhood_id"].duplicated().any():
        raise ValueError("Neighborhood IDs must be unique.")

    nta = gpd.read_file(paths.nta_source)
    if nta.crs is None:
        nta = nta.set_crs(4326)
    nta = nta.to_crs(4326)
    manhattan_boundary = nta.geometry.make_valid().union_all()

    stations_all = gpd.read_file(paths.subway_source)
    if stations_all.crs is None:
        stations_all = stations_all.set_crs(4326)
    stations_all = stations_all.to_crs(4326)
    stations_all["stop_id"] = stations_all["stop_id"].astype(str)
    stations = stations_all[
        stations_all.geometry.intersects(manhattan_boundary)
    ].copy()
    stations = stations.sort_values(["name", "stop_id"], ignore_index=True)
    if stations.empty:
        raise ValueError("No subway stations intersect the Manhattan NTA boundary.")

    checks = {
        "rent_neighborhoods": len(origins),
        "rent_months_per_neighborhood": len(months),
        "rent_start": months[0],
        "rent_end": months[-1],
        "rent_missing_values": 0,
        "subway_stations_all_nyc": len(stations_all),
        "subway_stations_in_manhattan": len(stations),
        "manhattan_nta_features": len(nta),
        "analysis_crs": "EPSG:4326 for interchange; EPSG:2263 for planar distance",
    }
    return {
        "rent_payload": rent_payload,
        "origins": origins,
        "stations": stations,
        "nta": nta,
        "manhattan_boundary": manhattan_boundary,
        "input_checks": checks,
    }


def make_buffered_boundary(nta: gpd.GeoDataFrame) -> shapely.Geometry:
    """Return Manhattan NTAs plus a metric buffer for boundary-safe routing."""

    projected_boundary = nta.to_crs(LOCAL_CRS).geometry.make_valid().union_all()
    projected_boundary = projected_boundary.buffer(
        GRAPH_BUFFER_METERS / FEET_TO_METERS
    )
    return gpd.GeoSeries([projected_boundary], crs=LOCAL_CRS).to_crs(4326).iloc[0]


def _download_live_graph(
    boundary: shapely.Geometry,
    paths: AssignmentPaths,
) -> tuple[nx.MultiGraph, dict[str, Any]]:
    """Download a current pedestrian graph from Overpass when explicitly requested."""

    ox.settings.use_cache = True
    ox.settings.cache_folder = str(paths.assignment_dir / "data/cache/osmnx")
    ox.settings.requests_timeout = 900
    graph = ox.graph.graph_from_polygon(
        boundary,
        network_type="walk",
        simplify=True,
        retain_all=True,
        truncate_by_edge=True,
    )
    if graph.is_directed():
        graph = ox.convert.to_undirected(graph)
    metadata = {
        "mode": "live_overpass",
        "source_path": None,
        "source_sha256": None,
        "source_retrieved_at": datetime.now(timezone.utc).isoformat(),
        "source_node_count": graph.number_of_nodes(),
        "source_edge_count": graph.number_of_edges(),
        "network_type": "walk",
        "source_created_with": f"OSMnx {ox.__version__}",
    }
    return graph, metadata


def load_or_build_walk_graph(
    paths: AssignmentPaths,
    nta: gpd.GeoDataFrame,
    *,
    refresh_osm: bool = False,
) -> tuple[nx.MultiGraph, dict[str, Any]]:
    """Load the bounded cache or explicitly refresh it from Overpass.

    Normal reruns prefer the assignment's frozen bounded snapshot. An explicit
    ``refresh_osm`` attempts Overpass first and falls back to that same committed
    snapshot if the service is unavailable. No outside workspace is required.
    """

    paths.ensure_output_directories()
    if paths.graph_cache.exists() and not refresh_osm:
        graph = ox.load_graphml(paths.graph_cache)
        if graph.is_directed():
            graph = ox.convert.to_undirected(graph)
        manifest = (
            json.loads(paths.graph_manifest.read_text(encoding="utf-8"))
            if paths.graph_manifest.exists()
            else {}
        )
        manifest["loaded_from"] = "assignment_bounded_cache"
        return graph, manifest

    boundary = make_buffered_boundary(nta)
    fallback_reason: str | None = None

    if refresh_osm:
        try:
            graph, source_metadata = _download_live_graph(boundary, paths)
        except Exception as error:  # network services can legitimately be unavailable
            fallback_reason = f"{type(error).__name__}: {str(error)[:400]}"
            if not paths.graph_cache.exists():
                raise
            graph = ox.load_graphml(paths.graph_cache)
            if graph.is_directed():
                graph = ox.convert.to_undirected(graph)
            manifest = (
                json.loads(paths.graph_manifest.read_text(encoding="utf-8"))
                if paths.graph_manifest.exists()
                else {}
            )
            manifest["loaded_from"] = "assignment_bounded_cache_after_overpass_failure"
            manifest["refresh_fallback_reason"] = fallback_reason
            return graph, manifest
    else:
        graph, source_metadata = _download_live_graph(boundary, paths)

    graph.graph["crs"] = graph.graph.get("crs", "epsg:4326")
    ox.save_graphml(graph, paths.graph_cache)
    manifest = {
        "artifact": str(paths.graph_cache.relative_to(paths.assignment_dir)),
        "artifact_sha256": sha256_file(paths.graph_cache),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "node_count": graph.number_of_nodes(),
        "edge_count": graph.number_of_edges(),
        "crs": str(graph.graph.get("crs")),
        "network_type": "walk",
        "boundary": "Manhattan 2020 NTA union plus 1,500-meter buffer",
        "fallback_reason": fallback_reason,
        "source": source_metadata,
        "software": {
            "osmnx": ox.__version__,
            "networkx": nx.__version__,
        },
    }
    _write_json(paths.graph_manifest, manifest)
    return graph, manifest


def _minimum_edge_data(graph: nx.MultiGraph, start: int, end: int) -> dict[str, Any]:
    edge_bundle = graph.get_edge_data(start, end)
    if edge_bundle is None:
        raise nx.NetworkXNoPath(f"No graph edge between {start} and {end}.")
    if graph.is_multigraph():
        return min(
            edge_bundle.values(),
            key=lambda attributes: float(attributes.get("length", np.inf)),
        )
    return edge_bundle


def _flatten_line_geometry(geometry: shapely.Geometry) -> list[LineString]:
    if isinstance(geometry, LineString):
        return [geometry]
    if isinstance(geometry, MultiLineString):
        return list(geometry.geoms)
    return []


def _route_geometry(
    graph: nx.MultiGraph,
    graph_path: list[int],
    origin: Point,
    station: Point,
) -> MultiLineString:
    """Build a WGS84 route, including the two explicit snap connectors."""

    if not graph_path:
        return MultiLineString([])
    origin_node = Point(
        float(graph.nodes[graph_path[0]]["x"]),
        float(graph.nodes[graph_path[0]]["y"]),
    )
    station_node = Point(
        float(graph.nodes[graph_path[-1]]["x"]),
        float(graph.nodes[graph_path[-1]]["y"]),
    )
    segments: list[LineString] = []
    if not origin.equals_exact(origin_node, tolerance=1e-12):
        segments.append(LineString([origin, origin_node]))
    for start, end in pairwise(graph_path):
        edge_data = _minimum_edge_data(graph, start, end)
        geometry = edge_data.get("geometry")
        if geometry is None:
            geometry = LineString(
                [
                    (float(graph.nodes[start]["x"]), float(graph.nodes[start]["y"])),
                    (float(graph.nodes[end]["x"]), float(graph.nodes[end]["y"])),
                ]
            )
        segments.extend(_flatten_line_geometry(geometry))
    if not station_node.equals_exact(station, tolerance=1e-12):
        segments.append(LineString([station_node, station]))
    return MultiLineString(segments)


def compute_nearest_station_routes(
    graph: nx.MultiGraph,
    origins: gpd.GeoDataFrame,
    stations: gpd.GeoDataFrame,
) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame, gpd.GeoDataFrame]:
    """Find each origin's network-nearest station and reconstruct its route.

    A temporary super-node connects to every unique snapped station node with
    the station's connector length. Dijkstra from an origin to that super-node
    therefore chooses the station with minimum walk-network distance, not the
    station with minimum straight-line distance. The origin connector is added
    afterward because it is constant across all station candidates.
    """

    origins = origins.copy()
    stations = stations.copy()
    origin_nodes, origin_connectors = ox.distance.nearest_nodes(
        graph,
        X=origins.geometry.x.to_numpy(),
        Y=origins.geometry.y.to_numpy(),
        return_dist=True,
    )
    station_nodes, station_connectors = ox.distance.nearest_nodes(
        graph,
        X=stations.geometry.x.to_numpy(),
        Y=stations.geometry.y.to_numpy(),
        return_dist=True,
    )
    origins["graph_node"] = [int(node) for node in origin_nodes]
    origins["origin_snap_m"] = np.asarray(origin_connectors, dtype=float)
    stations["graph_node"] = [int(node) for node in station_nodes]
    stations["station_snap_m"] = np.asarray(station_connectors, dtype=float)

    station_by_node: dict[int, dict[str, Any]] = {}
    for station in stations.sort_values(["station_snap_m", "stop_id"]).to_dict(
        orient="records"
    ):
        station_by_node.setdefault(int(station["graph_node"]), station)

    super_node = -1
    while super_node in graph:
        super_node -= 1
    graph.add_node(super_node, node_kind="temporary_station_supernode")
    for station_node, station in station_by_node.items():
        graph.add_edge(
            super_node,
            station_node,
            length=float(station["station_snap_m"]),
            edge_kind="station_connector",
            stop_id=station["stop_id"],
        )

    origins_projected = origins.to_crs(LOCAL_CRS)
    stations_projected = stations.to_crs(LOCAL_CRS)
    station_index_by_stop = {
        str(stop_id): index for index, stop_id in stations["stop_id"].items()
    }

    result_rows: list[dict[str, Any]] = []
    route_rows: list[dict[str, Any]] = []
    try:
        for origin_index, origin in origins.iterrows():
            origin_node = int(origin["graph_node"])
            projected_origin = origins_projected.loc[origin_index].geometry
            all_euclidean_distances = (
                stations_projected.geometry.distance(projected_origin)
                * FEET_TO_METERS
            )
            euclidean_nearest_index = int(all_euclidean_distances.idxmin())
            euclidean_nearest_station = stations.loc[euclidean_nearest_index]

            result: dict[str, Any] = {
                "neighborhood_id": origin["neighborhood_id"],
                "neighborhood": origin["neighborhood"],
                "longitude": float(origin.geometry.x),
                "latitude": float(origin.geometry.y),
                "baseline_rent_usd": float(origin["baseline_rent_usd"]),
                "latest_rent_usd": float(origin["latest_rent_usd"]),
                "growth_pct": float(origin["growth_pct"]),
                "origin_graph_node": origin_node,
                "origin_snap_m": float(origin["origin_snap_m"]),
                "euclidean_nearest_stop_id": str(euclidean_nearest_station["stop_id"]),
                "euclidean_nearest_station": euclidean_nearest_station["name"],
                "euclidean_nearest_distance_m": float(all_euclidean_distances.min()),
                "status": "unreachable",
                "geometry": origin.geometry,
            }
            try:
                distance_to_super, path_to_super = nx.single_source_dijkstra(
                    graph,
                    origin_node,
                    target=super_node,
                    weight="length",
                )
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                result_rows.append(result)
                continue

            station_node = int(path_to_super[-2])
            station = station_by_node[station_node]
            station_index = station_index_by_stop[str(station["stop_id"])]
            projected_station = stations_projected.loc[station_index].geometry
            euclidean_same_station_m = (
                projected_origin.distance(projected_station) * FEET_TO_METERS
            )
            graph_path = [int(node) for node in path_to_super[:-1]]
            path_edge_distance_m = sum(
                float(_minimum_edge_data(graph, start, end).get("length", 0.0))
                for start, end in pairwise(graph_path)
            )
            network_distance_m = float(origin["origin_snap_m"]) + float(
                distance_to_super
            )
            reconstructed_distance_m = (
                float(origin["origin_snap_m"])
                + path_edge_distance_m
                + float(station["station_snap_m"])
            )
            route_geometry = _route_geometry(
                graph,
                graph_path,
                origin.geometry,
                station["geometry"],
            )
            result.update(
                {
                    "status": "reachable",
                    "target_stop_id": str(station["stop_id"]),
                    "target_station": station["name"],
                    "target_routes": station.get("routes", ""),
                    "station_graph_node": station_node,
                    "station_snap_m": float(station["station_snap_m"]),
                    "path_edge_distance_m": path_edge_distance_m,
                    "reconstructed_distance_m": reconstructed_distance_m,
                    "network_distance_m": network_distance_m,
                    "euclidean_distance_m": float(euclidean_same_station_m),
                    "extra_distance_m": network_distance_m
                    - float(euclidean_same_station_m),
                    "detour_ratio": network_distance_m
                    / float(euclidean_same_station_m),
                    "estimated_walk_minutes": network_distance_m
                    / WALKING_SPEED_METERS_PER_MINUTE,
                    "path_node_count": len(graph_path),
                    "target_differs_from_euclidean_nearest": str(station["stop_id"])
                    != str(euclidean_nearest_station["stop_id"]),
                }
            )
            result_rows.append(result)
            route_rows.append(
                {
                    key: result[key]
                    for key in (
                        "neighborhood_id",
                        "neighborhood",
                        "target_stop_id",
                        "target_station",
                        "target_routes",
                        "network_distance_m",
                        "euclidean_distance_m",
                        "extra_distance_m",
                        "detour_ratio",
                        "estimated_walk_minutes",
                        "growth_pct",
                    )
                }
                | {"geometry": route_geometry}
            )
    finally:
        graph.remove_node(super_node)

    results = gpd.GeoDataFrame(result_rows, crs=4326).sort_values(
        "neighborhood", ignore_index=True
    )
    routes = gpd.GeoDataFrame(route_rows, crs=4326).sort_values(
        "neighborhood", ignore_index=True
    )
    return results, routes, stations


def validate_results(
    results: gpd.GeoDataFrame,
    routes: gpd.GeoDataFrame,
    graph: nx.MultiGraph,
    input_checks: dict[str, Any],
) -> dict[str, Any]:
    """Run data, routing, and geometric checks before any interpretation."""

    reachable = results[results["status"] == "reachable"].copy()
    unreachable = results[results["status"] != "reachable"].copy()
    distance_violations = reachable[
        reachable["network_distance_m"] + DISTANCE_TOLERANCE_METERS
        < reachable["euclidean_distance_m"]
    ]
    reconstruction_error = (
        reachable["network_distance_m"] - reachable["reconstructed_distance_m"]
    ).abs()
    route_ids = set(routes["neighborhood_id"])
    reachable_ids = set(reachable["neighborhood_id"])

    pearson = reachable["network_distance_m"].corr(reachable["growth_pct"])
    spearman = reachable["network_distance_m"].corr(
        reachable["growth_pct"], method="spearman"
    )
    validation = {
        "expected_neighborhood_count": 31,
        "result_neighborhood_count": len(results),
        "reachable_count": len(reachable),
        "unreachable_count": len(unreachable),
        "unreachable_neighborhoods": unreachable["neighborhood"].tolist(),
        "route_feature_count": len(routes),
        "duplicate_neighborhood_ids": int(results["neighborhood_id"].duplicated().sum()),
        "network_shorter_than_euclidean_violations": len(distance_violations),
        "distance_tolerance_m": DISTANCE_TOLERANCE_METERS,
        "max_route_reconstruction_error_m": float(reconstruction_error.max()),
        "minimum_detour_ratio": float(reachable["detour_ratio"].min()),
        "maximum_detour_ratio": float(reachable["detour_ratio"].max()),
        "median_detour_ratio": float(reachable["detour_ratio"].median()),
        "median_network_distance_m": float(reachable["network_distance_m"].median()),
        "mean_network_distance_m": float(reachable["network_distance_m"].mean()),
        "station_choice_changed_count": int(
            reachable["target_differs_from_euclidean_nearest"].sum()
        ),
        "pearson_network_distance_vs_growth": float(pearson),
        "spearman_network_distance_vs_growth": float(spearman),
        "graph_nodes": graph.number_of_nodes(),
        "graph_edges": graph.number_of_edges(),
        "graph_crs": str(graph.graph.get("crs")),
        "input_checks": input_checks,
    }
    validation["all_checks_pass"] = bool(
        len(results) == 31
        and len(reachable) == 31
        and len(unreachable) == 0
        and not results["neighborhood_id"].duplicated().any()
        and len(distance_violations) == 0
        and reconstruction_error.max() < 1e-6
        and route_ids == reachable_ids
        and input_checks["rent_months_per_neighborhood"] == 120
    )
    return validation


def write_analysis_outputs(
    paths: AssignmentPaths,
    results: gpd.GeoDataFrame,
    routes: gpd.GeoDataFrame,
    stations: gpd.GeoDataFrame,
    validation: dict[str, Any],
) -> dict[str, Path]:
    """Write tabular, point, station, route, and validation artifacts."""

    paths.ensure_output_directories()
    csv_path = paths.output_data / "network_distance_results.csv"
    centers_path = paths.output_data / "neighborhood_centers_results.geojson"
    routes_path = paths.output_data / "neighborhood_to_subway_routes.geojson"
    stations_path = paths.output_data / "selected_subway_stations.geojson"
    validation_path = paths.output_data / "validation_summary.json"

    csv_columns = [column for column in results.columns if column != "geometry"]
    results[csv_columns].to_csv(csv_path, index=False, float_format="%.6f")
    _write_geojson(centers_path, results)
    _write_geojson(routes_path, routes)

    reachable = results[results["status"] == "reachable"].copy()
    station_use = (
        reachable.groupby("target_stop_id", as_index=False)
        .agg(
            neighborhoods_served=("neighborhood_id", "count"),
            mean_network_distance_m=("network_distance_m", "mean"),
        )
        .rename(columns={"target_stop_id": "stop_id"})
    )
    selected_stations = stations[
        stations["stop_id"].isin(station_use["stop_id"])
    ].merge(station_use, on="stop_id", how="inner")
    _write_geojson(stations_path, selected_stations)
    _write_json(validation_path, validation)

    return {
        "results_csv": csv_path,
        "centers_geojson": centers_path,
        "routes_geojson": routes_path,
        "stations_geojson": stations_path,
        "validation_json": validation_path,
    }


def _apply_chart_style() -> None:
    mpl.rcParams.update(
        {
            "figure.facecolor": PAPER,
            "axes.facecolor": PAPER,
            "axes.edgecolor": INK,
            "axes.labelcolor": INK,
            "axes.titlecolor": INK,
            "text.color": INK,
            "xtick.color": MUTED,
            "ytick.color": MUTED,
            "font.family": "DejaVu Sans",
            "font.size": 10,
            "axes.titlesize": 15,
            "axes.labelsize": 10,
            "axes.grid": True,
            "grid.color": GRID,
            "grid.linewidth": 0.7,
            "grid.alpha": 0.75,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "savefig.facecolor": PAPER,
        }
    )


def _save_figure(
    figure: mpl.figure.Figure,
    base_path: Path | None = None,
    *,
    close: bool = True,
) -> dict[str, Any]:
    """Optionally export a figure while always returning the live object."""

    png_path = base_path.with_suffix(".png") if base_path else None
    svg_path = base_path.with_suffix(".svg") if base_path else None
    if png_path and svg_path:
        figure.savefig(png_path, dpi=190, bbox_inches="tight", facecolor=PAPER)
        figure.savefig(svg_path, bbox_inches="tight", facecolor=PAPER)
    if close:
        plt.close(figure)
    return {"png": png_path, "svg": svg_path, "figure": figure}


def plot_route_map(
    paths: AssignmentPaths,
    nta: gpd.GeoDataFrame,
    results: gpd.GeoDataFrame,
    routes: gpd.GeoDataFrame,
    stations: gpd.GeoDataFrame,
    *,
    close: bool = True,
    save: bool = False,
) -> dict[str, Any]:
    """Map all routes and emphasize the route with the largest detour ratio."""

    _apply_chart_style()
    nta_plot = nta.to_crs(LOCAL_CRS)
    results_plot = results.to_crs(LOCAL_CRS)
    routes_plot = routes.to_crs(LOCAL_CRS)
    selected_stop_ids = set(results_plot["target_stop_id"].dropna().astype(str))
    stations_plot = stations[stations["stop_id"].isin(selected_stop_ids)].to_crs(
        LOCAL_CRS
    )
    highlighted = results_plot.loc[results_plot["detour_ratio"].idxmax()]
    highlighted_route = routes_plot[
        routes_plot["neighborhood_id"] == highlighted["neighborhood_id"]
    ]

    figure, axis = plt.subplots(figsize=(9.5, 11.5))
    nta_plot.plot(ax=axis, color="#F2F0EA", edgecolor="#C8CDD6", linewidth=0.55)
    routes_plot.plot(ax=axis, color=BLUE, linewidth=0.9, alpha=0.32, zorder=2)
    highlighted_route.plot(ax=axis, color=ORANGE, linewidth=3.2, alpha=0.95, zorder=4)
    stations_plot.plot(
        ax=axis,
        marker="s",
        color=INK,
        edgecolor=PAPER,
        linewidth=0.55,
        markersize=24,
        zorder=5,
    )
    growth_cmap = LinearSegmentedColormap.from_list(
        "rent_growth_gold", ["#F8E9C3", ORANGE, ORANGE_DARK]
    )
    point_artist = axis.scatter(
        results_plot.geometry.x,
        results_plot.geometry.y,
        c=results_plot["growth_pct"],
        cmap=growth_cmap,
        s=44,
        edgecolor=INK,
        linewidth=0.55,
        zorder=6,
    )
    axis.annotate(
        f"Largest detour ratio: {highlighted['neighborhood']}\n"
        f"{highlighted['detour_ratio']:.2f}× to {highlighted['target_station']}",
        xy=(highlighted.geometry.x, highlighted.geometry.y),
        xytext=(-115, 34),
        textcoords="offset points",
        ha="right",
        fontsize=9,
        color=INK,
        bbox={"boxstyle": "round,pad=0.45", "fc": PAPER, "ec": ORANGE},
        arrowprops={"arrowstyle": "-", "color": ORANGE, "lw": 1.2},
        zorder=8,
    )
    colorbar = figure.colorbar(point_artist, ax=axis, fraction=0.035, pad=0.02)
    colorbar.set_label("Asking-rent growth, July 2016 to June 2026 (%)")
    axis.legend(
        handles=[
            Line2D([0], [0], color=BLUE, lw=1.6, label="Network-nearest route"),
            Line2D([0], [0], color=ORANGE, lw=3.0, label="Largest detour ratio"),
            Line2D(
                [0],
                [0],
                marker="s",
                linestyle="",
                markerfacecolor=INK,
                markeredgecolor=PAPER,
                label="Selected subway station",
            ),
        ],
        loc="lower left",
        frameon=True,
        facecolor=PAPER,
        edgecolor=GRID,
    )
    axis.set_title(
        "Shortest walking routes from Manhattan rent-neighborhood centers",
        loc="left",
        pad=30,
        fontweight="bold",
    )
    axis.text(
        0,
        1.005,
        "OSM pedestrian network; origin color shows nominal asking-rent growth.",
        transform=axis.transAxes,
        color=MUTED,
        fontsize=10,
        va="bottom",
    )
    axis.set_axis_off()
    axis.set_aspect("equal")
    figure.text(
        0.11,
        0.02,
        "Sources: OpenStreetMap/OSMnx walk graph; MTA GTFS parent stations; "
        "StreetEasy median asking rent. Distances include snap connectors.",
        fontsize=8.5,
        color=MUTED,
    )
    return _save_figure(
        figure,
        paths.output_figures / "route_map" if save else None,
        close=close,
    )


def plot_distance_comparison(
    paths: AssignmentPaths,
    results: gpd.GeoDataFrame,
    *,
    close: bool = True,
    save: bool = False,
) -> dict[str, Any]:
    """Create a sorted dot-range comparison for the same selected station."""

    _apply_chart_style()
    data = results[results["status"] == "reachable"].sort_values(
        "network_distance_m", ascending=True
    )
    positions = np.arange(len(data))
    figure, axis = plt.subplots(figsize=(10.5, 12.5))
    axis.hlines(
        positions,
        data["euclidean_distance_m"],
        data["network_distance_m"],
        color=GRID,
        linewidth=2.0,
        zorder=1,
    )
    axis.scatter(
        data["euclidean_distance_m"],
        positions,
        s=35,
        facecolor=PAPER,
        edgecolor=ORANGE_DARK,
        linewidth=1.35,
        label="Euclidean distance",
        zorder=3,
    )
    axis.scatter(
        data["network_distance_m"],
        positions,
        s=34,
        marker="s",
        color=BLUE,
        edgecolor=INK,
        linewidth=0.35,
        label="Walking-network distance",
        zorder=4,
    )
    axis.set_yticks(positions, data["neighborhood"])
    axis.set_xlim(left=0)
    axis.set_xlabel("Distance to the network-nearest subway station (meters)")
    axis.set_ylabel("")
    axis.legend(loc="lower right", frameon=False, ncol=2)
    axis.set_title(
        "Euclidean and walking-network distance to the same subway station",
        loc="left",
        pad=28,
        fontweight="bold",
    )
    axis.text(
        0,
        1.012,
        "31 StreetEasy neighborhood centers; target selected by shortest network distance.",
        transform=axis.transAxes,
        color=MUTED,
        fontsize=10,
        va="bottom",
    )
    axis.grid(axis="y", visible=False)
    axis.grid(axis="x", visible=True)
    figure.text(
        0.11,
        0.02,
        "The connecting segment is the extra distance introduced by the walkable street graph "
        "and point-to-network connectors.",
        fontsize=8.5,
        color=MUTED,
    )
    return _save_figure(
        figure,
        paths.output_figures / "distance_comparison" if save else None,
        close=close,
    )


def plot_rent_relationship(
    paths: AssignmentPaths,
    results: gpd.GeoDataFrame,
    validation: dict[str, Any],
    *,
    close: bool = True,
    save: bool = False,
) -> dict[str, Any]:
    """Plot the descriptive, explicitly non-causal rent/access relationship."""

    _apply_chart_style()
    data = results[results["status"] == "reachable"].copy()
    x_values = data["network_distance_m"].to_numpy()
    y_values = data["growth_pct"].to_numpy()
    slope, intercept = np.polyfit(x_values, y_values, 1)
    fit_x = np.linspace(0, x_values.max() * 1.04, 100)

    figure, axis = plt.subplots(figsize=(9.2, 6.8))
    axis.scatter(
        x_values,
        y_values,
        s=58,
        facecolor=ORANGE,
        edgecolor=INK,
        linewidth=0.55,
        alpha=0.9,
        zorder=3,
    )
    axis.plot(
        fit_x,
        slope * fit_x + intercept,
        color=BLUE,
        linewidth=1.8,
        linestyle="--",
        label="Descriptive linear fit",
    )
    label_indexes = set(data.nlargest(2, "growth_pct").index)
    label_indexes.add(data.nsmallest(1, "growth_pct").index[0])
    label_indexes.add(data.nlargest(1, "network_distance_m").index[0])
    label_indexes.add(data.nlargest(1, "detour_ratio").index[0])
    for index in sorted(label_indexes):
        row = data.loc[index]
        axis.annotate(
            row["neighborhood"],
            (row["network_distance_m"], row["growth_pct"]),
            xytext=(6, 6),
            textcoords="offset points",
            fontsize=8.5,
            color=INK,
        )
    axis.set_xlim(left=0)
    axis.set_xlabel("Walking-network distance to selected station (meters)")
    axis.set_ylabel("Nominal median asking-rent growth (%)")
    axis.legend(loc="upper left", frameon=False)
    axis.set_title(
        "Walking distance and Manhattan asking-rent growth",
        loc="left",
        pad=28,
        fontweight="bold",
    )
    axis.text(
        0,
        1.012,
        "July 2016 to June 2026; 31 neighborhood centers; association is not causal.",
        transform=axis.transAxes,
        color=MUTED,
        fontsize=10,
        va="bottom",
    )
    axis.text(
        0.98,
        0.06,
        f"Pearson r = {validation['pearson_network_distance_vs_growth']:.2f}\n"
        f"Spearman ρ = {validation['spearman_network_distance_vs_growth']:.2f}",
        transform=axis.transAxes,
        ha="right",
        va="bottom",
        fontsize=9,
        color=INK,
        bbox={"boxstyle": "round,pad=0.45", "fc": PAPER, "ec": GRID},
    )
    return _save_figure(
        figure,
        paths.output_figures / "rent_growth_relationship" if save else None,
        close=close,
    )


def create_figures(
    paths: AssignmentPaths,
    nta: gpd.GeoDataFrame,
    results: gpd.GeoDataFrame,
    routes: gpd.GeoDataFrame,
    stations: gpd.GeoDataFrame,
    validation: dict[str, Any],
) -> dict[str, Path]:
    """Create and export all reader-facing figures in PNG and SVG."""

    paths.ensure_output_directories()
    route_map = plot_route_map(
        paths, nta, results, routes, stations, close=True, save=True
    )
    distance_comparison = plot_distance_comparison(
        paths, results, close=True, save=True
    )
    rent_relationship = plot_rent_relationship(
        paths,
        results,
        validation,
        close=True,
        save=True,
    )
    return {
        "route_map": route_map["png"],
        "route_map_svg": route_map["svg"],
        "distance_comparison": distance_comparison["png"],
        "distance_comparison_svg": distance_comparison["svg"],
        "rent_growth_relationship": rent_relationship["png"],
        "rent_growth_relationship_svg": rent_relationship["svg"],
    }


def run_analysis(
    assignment_dir: str | Path,
    *,
    refresh_osm: bool = False,
    write_figures: bool = False,
) -> dict[str, Any]:
    """Execute the full analysis and return notebook-ready objects."""

    paths = AssignmentPaths.from_assignment_dir(assignment_dir)
    paths.ensure_output_directories()
    inputs = load_and_validate_inputs(paths)
    graph, graph_manifest = load_or_build_walk_graph(
        paths,
        inputs["nta"],
        refresh_osm=refresh_osm,
    )
    results, routes, snapped_stations = compute_nearest_station_routes(
        graph,
        inputs["origins"],
        inputs["stations"],
    )
    validation = validate_results(
        results,
        routes,
        graph,
        inputs["input_checks"],
    )
    output_paths = write_analysis_outputs(
        paths,
        results,
        routes,
        snapped_stations,
        validation,
    )
    figure_paths = (
        create_figures(
            paths,
            inputs["nta"],
            results,
            routes,
            snapped_stations,
            validation,
        )
        if write_figures
        else {}
    )
    return {
        "paths": paths,
        "inputs": inputs,
        "graph": graph,
        "graph_manifest": graph_manifest,
        "results": results,
        "routes": routes,
        "stations": snapped_stations,
        "validation": validation,
        "output_paths": output_paths,
        "figure_paths": figure_paths,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--assignment-dir",
        type=Path,
        default=Path(__file__).resolve().parent,
        help="Assignment 04 directory (defaults to this script's directory).",
    )
    parser.add_argument(
        "--refresh-osm",
        action="store_true",
        help="Try a live Overpass refresh before falling back to the verified cache.",
    )
    args = parser.parse_args()
    analysis = run_analysis(args.assignment_dir, refresh_osm=args.refresh_osm)
    validation = analysis["validation"]
    print(
        "Assignment 04 built: "
        f"{validation['reachable_count']}/{validation['result_neighborhood_count']} reachable; "
        f"median detour {validation['median_detour_ratio']:.2f}x; "
        f"checks={'PASS' if validation['all_checks_pass'] else 'FAIL'}."
    )


if __name__ == "__main__":
    main()
