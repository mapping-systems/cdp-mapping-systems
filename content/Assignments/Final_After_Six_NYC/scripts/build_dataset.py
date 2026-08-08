from __future__ import annotations

import json
import math
import shutil
from pathlib import Path
from zipfile import ZipFile

import geopandas as gpd
import networkx as nx
import osmnx as ox
import pandas as pd
import requests
from shapely.geometry import LineString, Point


PROJECT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
CURATED_PATH = DATA_DIR / "curated_venues.json"
VENUES_PATH = DATA_DIR / "venues.geojson"
DIRECTORY_PATH = DATA_DIR / "dcla_organizations.geojson"
STATIONS_PATH = DATA_DIR / "subway_stations.geojson"
SUBWAY_NETWORK_PATH = DATA_DIR / "subway_network.json"
TRANSIT_ROUTES_PATH = DATA_DIR / "columbia_transit_routes.geojson"
WALK_ROUTES_PATH = DATA_DIR / "columbia_walk_routes.geojson"
GRAPH_PATH = DATA_DIR / "manhattan_walk.graphml"
GTFS_PATH = RAW_DIR / "mta_subway_gtfs.zip"
SUMMARY_PATH = DATA_DIR / "analysis_summary.json"
SITE_DATA_DIR = PROJECT_DIR / "site" / "data"

DCLA_API = "https://data.cityofnewyork.us/resource/u35m-9t32.json?$limit=5000"
MTA_API = "https://data.ny.gov/resource/39hk-dx4f.json?$limit=1000"
MTA_GTFS_URL = (
    "http://web.mta.info/developers/data/nyct/subway/google_transit.zip"
)

COLUMBIA = {
    "name": "Columbia GSAPP / Avery Hall",
    "latitude": 40.80766,
    "longitude": -73.96255,
    "gtfs_stop_id": "116",
}

WALKING_METERS_PER_MINUTE = 80.0
AVERAGE_INITIAL_WAIT_MINUTES = 4.0
COLUMBIA_ACCESS_WALK_MINUTES = 5.0
TRANSFER_PENALTY_MINUTES = 4.0


def fetch_json(url: str, cache_path: Path) -> list[dict]:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        response = requests.get(url, timeout=60)
        response.raise_for_status()
        data = response.json()
        cache_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return data
    except requests.RequestException:
        if cache_path.exists():
            return json.loads(cache_path.read_text(encoding="utf-8"))
        raise


def fetch_binary(url: str, cache_path: Path) -> None:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        response = requests.get(url, timeout=90)
        response.raise_for_status()
        cache_path.write_bytes(response.content)
    except requests.RequestException:
        if not cache_path.exists():
            raise


def load_curated() -> list[dict]:
    return json.loads(CURATED_PATH.read_text(encoding="utf-8"))


def get_coordinates(venue: dict, dcla_by_name: dict[str, dict]) -> tuple[float, float]:
    if venue.get("latitude") is not None and venue.get("longitude") is not None:
        return float(venue["latitude"]), float(venue["longitude"])

    match = dcla_by_name.get(venue["dcla_match"])
    if not match or not match.get("latitude") or not match.get("longitude"):
        raise ValueError(f"Missing coordinates for {venue['name']}")
    return float(match["latitude"]), float(match["longitude"])


def haversine_meters(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    radius = 6_371_008.8
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1)
        * math.cos(phi2)
        * math.sin(delta_lambda / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(a))


def load_or_download_graph() -> nx.MultiDiGraph:
    if GRAPH_PATH.exists():
        return ox.load_graphml(GRAPH_PATH)

    ox.settings.use_cache = True
    ox.settings.log_console = True
    graph = ox.graph_from_place(
        "Manhattan, New York City, New York, USA",
        network_type="walk",
        simplify=True,
        retain_all=False,
    )
    ox.save_graphml(graph, GRAPH_PATH)
    return graph


def build_directory(dcla_rows: list[dict]) -> gpd.GeoDataFrame:
    records = []
    for index, row in enumerate(dcla_rows):
        try:
            latitude = float(row["latitude"])
            longitude = float(row["longitude"])
        except (KeyError, TypeError, ValueError):
            continue

        if not (-74.3 <= longitude <= -73.65 and 40.45 <= latitude <= 40.95):
            continue

        records.append(
            {
                "id": f"dcla-{index}",
                "name": row.get("organization_name", "Unnamed organization"),
                "discipline": row.get("discipline", "Not classified"),
                "borough": row.get("borough", "Not classified"),
                "address": row.get("address", ""),
                "city": row.get("city", ""),
                "postcode": row.get("postcode", ""),
                "council_district": row.get("council_district", ""),
                "community_board": row.get("community_board", ""),
                "data_status": "directory",
                "data_note": (
                    "DCLA organization address. It may be an office or mailing "
                    "address rather than a public venue."
                ),
                "geometry": Point(longitude, latitude),
            }
        )

    return gpd.GeoDataFrame(records, geometry="geometry", crs="EPSG:4326")


def nearest_station_metrics(
    graph: nx.MultiDiGraph,
    venues: gpd.GeoDataFrame,
    stations: gpd.GeoDataFrame,
) -> tuple[pd.DataFrame, dict[str, list[int]]]:
    undirected = ox.convert.to_undirected(graph)

    station_nodes = ox.distance.nearest_nodes(
        undirected,
        X=stations.geometry.x.to_numpy(),
        Y=stations.geometry.y.to_numpy(),
    )
    stations = stations.copy()
    stations["network_node"] = station_nodes

    any_station_by_node = (
        stations.groupby("network_node")
        .agg(
            station_name=("stop_name", "first"),
            station_routes=("daytime_routes", "first"),
            station_ada=("ada", "max"),
            station_gtfs_stop_id=("gtfs_stop_id", "first"),
        )
        .to_dict(orient="index")
    )
    ada_stations = stations[stations["ada"].isin([1, 2])].copy()
    ada_station_by_node = (
        ada_stations.groupby("network_node")
        .agg(
            ada_station_name=("stop_name", "first"),
            ada_station_routes=("daytime_routes", "first"),
            ada_station_gtfs_stop_id=("gtfs_stop_id", "first"),
        )
        .to_dict(orient="index")
    )

    any_distances, any_paths = nx.multi_source_dijkstra(
        undirected, list(any_station_by_node), weight="length"
    )
    ada_distances, ada_paths = nx.multi_source_dijkstra(
        undirected, list(ada_station_by_node), weight="length"
    )

    columbia_node = ox.distance.nearest_nodes(
        undirected, X=COLUMBIA["longitude"], Y=COLUMBIA["latitude"]
    )
    columbia_lengths = nx.single_source_dijkstra_path_length(
        undirected, columbia_node, weight="length"
    )

    venue_nodes = ox.distance.nearest_nodes(
        undirected,
        X=venues.geometry.x.to_numpy(),
        Y=venues.geometry.y.to_numpy(),
    )

    records = []
    walk_paths: dict[str, list[int]] = {}
    for venue_node, (_, venue) in zip(venue_nodes, venues.iterrows()):
        any_source = any_paths[venue_node][0]
        ada_source = ada_paths[venue_node][0]
        euclidean = haversine_meters(
            COLUMBIA["longitude"],
            COLUMBIA["latitude"],
            venue.geometry.x,
            venue.geometry.y,
        )
        network_distance = columbia_lengths.get(venue_node)
        try:
            walk_paths[venue["id"]] = nx.shortest_path(
                undirected, columbia_node, venue_node, weight="length"
            )
        except nx.NetworkXNoPath:
            walk_paths[venue["id"]] = []

        records.append(
            {
                "id": venue["id"],
                "network_node": int(venue_node),
                "nearest_station": any_station_by_node[any_source]["station_name"],
                "nearest_station_routes": any_station_by_node[any_source][
                    "station_routes"
                ],
                "nearest_station_ada": int(
                    any_station_by_node[any_source]["station_ada"]
                ),
                "nearest_station_gtfs_id": any_station_by_node[any_source][
                    "station_gtfs_stop_id"
                ],
                "station_walk_m": round(float(any_distances[venue_node]), 1),
                "nearest_ada_station": ada_station_by_node[ada_source][
                    "ada_station_name"
                ],
                "nearest_ada_station_routes": ada_station_by_node[ada_source][
                    "ada_station_routes"
                ],
                "nearest_ada_station_gtfs_id": ada_station_by_node[ada_source][
                    "ada_station_gtfs_stop_id"
                ],
                "ada_station_walk_m": round(float(ada_distances[venue_node]), 1),
                "columbia_euclidean_m": round(euclidean, 1),
                "columbia_walk_network_m": (
                    round(float(network_distance), 1)
                    if network_distance is not None
                    else None
                ),
                "network_detour_ratio": (
                    round(float(network_distance / euclidean), 3)
                    if network_distance is not None and euclidean > 0
                    else None
                ),
            }
        )

    return pd.DataFrame(records), walk_paths


def gtfs_minutes(value: str) -> float:
    hours, minutes, seconds = (int(part) for part in str(value).split(":"))
    return hours * 60 + minutes + seconds / 60


def read_gtfs_table(archive: ZipFile, name: str) -> pd.DataFrame:
    return pd.read_csv(archive.open(name), dtype=str).fillna("")


def build_subway_network(
    mta_rows: list[dict],
) -> tuple[dict, nx.DiGraph, dict[tuple[str, str], dict]]:
    fetch_binary(MTA_GTFS_URL, GTFS_PATH)
    with ZipFile(GTFS_PATH) as archive:
        stops = read_gtfs_table(archive, "stops.txt")
        routes = read_gtfs_table(archive, "routes.txt")
        trips = read_gtfs_table(archive, "trips.txt")
        stop_times = read_gtfs_table(archive, "stop_times.txt")
        transfers = read_gtfs_table(archive, "transfers.txt")

    route_names = dict(zip(routes["route_id"], routes["route_short_name"]))
    parent_lookup = {
        row.stop_id: (row.parent_station or row.stop_id)
        for row in stops.itertuples()
    }
    station_rows = stops[
        (stops["location_type"] == "1") | (stops["parent_station"] == "")
    ].copy()
    station_rows = station_rows.drop_duplicates("stop_id")

    station_metadata = pd.DataFrame(mta_rows).copy()
    station_metadata["ada"] = (
        pd.to_numeric(station_metadata["ada"], errors="coerce")
        .fillna(0)
        .astype(int)
    )
    mta_by_stop = station_metadata.set_index("gtfs_stop_id").to_dict(
        orient="index"
    )

    weekday_trips = trips[trips["service_id"] == "Weekday"][
        ["trip_id", "route_id"]
    ]
    times = stop_times.merge(weekday_trips, on="trip_id", how="inner")
    times["stop_sequence"] = pd.to_numeric(
        times["stop_sequence"], errors="coerce"
    )
    times["parent_stop_id"] = times["stop_id"].map(parent_lookup)
    times["departure_min"] = times["departure_time"].map(gtfs_minutes)
    times["arrival_min"] = times["arrival_time"].map(gtfs_minutes)
    times = times.sort_values(["trip_id", "stop_sequence"])
    times["next_trip_id"] = times.groupby("trip_id")["trip_id"].shift(-1)
    times["next_parent_stop_id"] = times.groupby("trip_id")[
        "parent_stop_id"
    ].shift(-1)
    times["next_arrival_min"] = times.groupby("trip_id")["arrival_min"].shift(-1)
    times["segment_min"] = times["next_arrival_min"] - times["departure_min"]
    times["route_name"] = times["route_id"].map(route_names).fillna(
        times["route_id"]
    )

    segments = times[
        (times["trip_id"] == times["next_trip_id"])
        & (times["parent_stop_id"] != times["next_parent_stop_id"])
        & (times["departure_min"] >= 16 * 60)
        & (times["departure_min"] <= 28 * 60)
        & (times["segment_min"] > 0)
        & (times["segment_min"] <= 25)
    ].copy()

    route_level = (
        segments.groupby(
            ["parent_stop_id", "next_parent_stop_id", "route_name"],
            as_index=False,
        )["segment_min"]
        .median()
        .rename(columns={"segment_min": "minutes"})
    )

    nodes = {}
    for stop in station_rows.itertuples():
        metadata = mta_by_stop.get(stop.stop_id, {})
        nodes[str(stop.stop_id)] = {
            "id": str(stop.stop_id),
            "name": stop.stop_name,
            "latitude": float(stop.stop_lat),
            "longitude": float(stop.stop_lon),
            "ada": int(metadata.get("ada", 0)),
            "routes": str(metadata.get("daytime_routes", "")).split(),
            "borough": metadata.get("borough", ""),
            "complex_id": metadata.get("complex_id", ""),
        }

    graph = nx.DiGraph()
    routes_by_station: dict[str, set[str]] = {}
    edge_records: dict[tuple[str, str], dict] = {}

    for segment in route_level.itertuples():
        source_station = str(segment.parent_stop_id)
        target_station = str(segment.next_parent_stop_id)
        route_name = str(segment.route_name)
        source_state = f"{source_station}|{route_name}"
        target_state = f"{target_station}|{route_name}"
        minutes = round(float(segment.minutes), 2)

        routes_by_station.setdefault(source_station, set()).add(route_name)
        routes_by_station.setdefault(target_station, set()).add(route_name)
        graph.add_node(
            source_state, station_id=source_station, route=route_name
        )
        graph.add_node(
            target_state, station_id=target_station, route=route_name
        )
        graph.add_edge(
            source_state,
            target_state,
            weight=minutes,
            transfer=False,
        )

    for station_id, station_routes in routes_by_station.items():
        for source_route in station_routes:
            for target_route in station_routes:
                if source_route == target_route:
                    continue
                source_state = f"{station_id}|{source_route}"
                target_state = f"{station_id}|{target_route}"
                graph.add_edge(
                    source_state,
                    target_state,
                    weight=TRANSFER_PENALTY_MINUTES,
                    transfer=True,
                )

    for transfer in transfers.itertuples():
        source_station = str(
            parent_lookup.get(transfer.from_stop_id, transfer.from_stop_id)
        )
        target_station = str(
            parent_lookup.get(transfer.to_stop_id, transfer.to_stop_id)
        )
        if source_station == target_station:
            continue
        minutes = (
            float(transfer.min_transfer_time) / 60
            if transfer.min_transfer_time
            else TRANSFER_PENALTY_MINUTES
        )
        for source_route in routes_by_station.get(source_station, set()):
            for target_route in routes_by_station.get(target_station, set()):
                source_state = f"{source_station}|{source_route}"
                target_state = f"{target_station}|{target_route}"
                existing = graph.get_edge_data(source_state, target_state)
                if existing is None or minutes < existing["weight"]:
                    graph.add_edge(
                        source_state,
                        target_state,
                        weight=round(minutes, 2),
                        transfer=True,
                    )

    state_adjacency: dict[str, list[dict]] = {
        state_id: [] for state_id in graph.nodes
    }
    for source, target, edge in graph.edges(data=True):
        edge_record = {
            "to": target,
            "minutes": round(float(edge["weight"]), 2),
            "transfer": bool(edge["transfer"]),
        }
        state_adjacency[source].append(edge_record)
        edge_records[(source, target)] = edge_record

    payload = {
        "metadata": {
            "model": "Typical weekday evening subway network",
            "service_window": "4:00 PM-4:00 AM",
            "feed_url": MTA_GTFS_URL,
            "feed_downloaded": "2026-07-28",
            "initial_wait_assumption_min": AVERAGE_INITIAL_WAIT_MINUTES,
            "transfer_penalty_min": TRANSFER_PENALTY_MINUTES,
            "limitations": (
                "Schedule-weighted model with a generic four-minute transfer "
                "penalty; not real-time and does not include service changes, "
                "elevator outages, or station-specific transfer paths."
            ),
        },
        "nodes": nodes,
        "routes_by_station": {
            station_id: sorted(station_routes)
            for station_id, station_routes in routes_by_station.items()
        },
        "state_adjacency": state_adjacency,
    }
    return payload, graph, edge_records


def shortest_transit_path(
    graph: nx.DiGraph,
    routes_by_station: dict[str, list[str]],
    origin_station: str,
    destination_station: str,
) -> tuple[float, list[str]]:
    if origin_station == destination_station:
        return 0.0, [origin_station]

    sources = [
        f"{origin_station}|{route}"
        for route in routes_by_station.get(origin_station, [])
        if f"{origin_station}|{route}" in graph
    ]
    destinations = {
        f"{destination_station}|{route}"
        for route in routes_by_station.get(destination_station, [])
        if f"{destination_station}|{route}" in graph
    }
    if not sources or not destinations:
        raise nx.NodeNotFound

    distances, paths = nx.multi_source_dijkstra(
        graph, sources=sources, weight="weight"
    )
    reachable = destinations.intersection(distances)
    if not reachable:
        raise nx.NetworkXNoPath
    destination_state = min(reachable, key=distances.__getitem__)
    return float(distances[destination_state]), paths[destination_state]


def summarize_route(
    state_path: list[str],
    edge_records: dict[tuple[str, str], dict],
) -> tuple[list[str], int, list[str]]:
    if len(state_path) == 1 and "|" not in state_path[0]:
        return [], 0, state_path

    used_routes: list[str] = []
    station_path: list[str] = []
    for state in state_path:
        station_id, route = state.rsplit("|", 1)
        if not station_path or station_path[-1] != station_id:
            station_path.append(station_id)
        if not used_routes or used_routes[-1] != route:
            used_routes.append(route)

    transfers = sum(
        1
        for source, target in zip(state_path[:-1], state_path[1:])
        if edge_records[(source, target)]["transfer"]
    )
    return used_routes, transfers, station_path


def add_transit_metrics(
    venues: gpd.GeoDataFrame,
    subway_payload: dict,
    subway_graph: nx.DiGraph,
    edge_records: dict[tuple[str, str], dict],
) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    nodes = subway_payload["nodes"]
    routes_by_station = subway_payload["routes_by_station"]
    route_features = []
    transit_records = []

    for venue in venues.itertuples():
        try:
            nearby_stations = sorted(
                (
                    (
                        station_id,
                        haversine_meters(
                            venue.longitude,
                            venue.latitude,
                            station["longitude"],
                            station["latitude"],
                        ),
                    )
                    for station_id, station in nodes.items()
                    if station["borough"] == "M"
                ),
                key=lambda item: item[1],
            )[:8]
            candidates = []
            for destination, straight_line_m in nearby_stations:
                try:
                    candidate_minutes, candidate_path = shortest_transit_path(
                        subway_graph,
                        routes_by_station,
                        COLUMBIA["gtfs_stop_id"],
                        destination,
                    )
                except (nx.NetworkXNoPath, nx.NodeNotFound):
                    continue
                egress_m = straight_line_m * max(
                    float(venue.network_detour_ratio), 1.0
                )
                candidates.append(
                    (
                        candidate_minutes + egress_m / WALKING_METERS_PER_MINUTE,
                        candidate_minutes,
                        candidate_path,
                        destination,
                        egress_m,
                    )
                )
            if not candidates:
                raise nx.NetworkXNoPath

            (
                _journey_minutes,
                network_minutes,
                state_path,
                destination,
                egress_m,
            ) = min(candidates, key=lambda candidate: candidate[0])
            route_names, transfer_count, station_path = summarize_route(
                state_path, edge_records
            )
            egress_minutes = egress_m / WALKING_METERS_PER_MINUTE
            total_minutes = (
                COLUMBIA_ACCESS_WALK_MINUTES
                + AVERAGE_INITIAL_WAIT_MINUTES
                + float(network_minutes)
                + egress_minutes
            )
            coordinates = [
                (nodes[node_id]["longitude"], nodes[node_id]["latitude"])
                for node_id in station_path
                if node_id in nodes
            ]
            geometry = (
                LineString(coordinates)
                if len(coordinates) >= 2
                else LineString(
                    [
                        (COLUMBIA["longitude"], COLUMBIA["latitude"]),
                        (venue.longitude, venue.latitude),
                    ]
                )
            )
            route_features.append(
                {
                    "id": venue.id,
                    "venue_name": venue.name,
                    "station_path": json.dumps(station_path),
                    "state_path": json.dumps(state_path),
                    "route_names": " ".join(route_names),
                    "transfer_count": transfer_count,
                    "ride_minutes": round(float(network_minutes), 1),
                    "total_minutes": round(total_minutes, 1),
                    "destination_station_id": destination,
                    "destination_station_name": nodes[destination]["name"],
                    "egress_walk_m": round(float(egress_m), 1),
                    "geometry": geometry,
                }
            )
            transit_records.append(
                {
                    "id": venue.id,
                    "columbia_transit_station_path": json.dumps(station_path),
                    "columbia_transit_state_path": json.dumps(state_path),
                    "columbia_transit_routes": " ".join(route_names),
                    "columbia_transit_transfer_count": transfer_count,
                    "columbia_transit_ride_min": round(float(network_minutes), 1),
                    "columbia_transit_total_min": round(total_minutes, 1),
                    "columbia_transit_destination_station_id": destination,
                    "columbia_transit_destination_station_name": nodes[
                        destination
                    ]["name"],
                    "columbia_transit_egress_walk_m": round(
                        float(egress_m), 1
                    ),
                }
            )
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            transit_records.append(
                {
                    "id": venue.id,
                    "columbia_transit_station_path": "[]",
                    "columbia_transit_state_path": "[]",
                    "columbia_transit_routes": "",
                    "columbia_transit_transfer_count": None,
                    "columbia_transit_ride_min": None,
                    "columbia_transit_total_min": None,
                    "columbia_transit_destination_station_id": "",
                    "columbia_transit_destination_station_name": "",
                    "columbia_transit_egress_walk_m": None,
                }
            )

    transit_df = pd.DataFrame(transit_records)
    venues = venues.merge(transit_df, on="id", how="left")
    routes = gpd.GeoDataFrame(route_features, geometry="geometry", crs="EPSG:4326")
    return venues, routes


def make_walk_routes(
    graph: nx.MultiDiGraph,
    venues: gpd.GeoDataFrame,
    paths: dict[str, list[int]],
) -> gpd.GeoDataFrame:
    undirected = ox.convert.to_undirected(graph)
    records = []
    for venue in venues.itertuples():
        path = paths.get(venue.id, [])
        if len(path) < 2:
            continue
        coordinates = [
            (
                float(undirected.nodes[node]["x"]),
                float(undirected.nodes[node]["y"]),
            )
            for node in path
        ]
        records.append(
            {
                "id": venue.id,
                "venue_name": venue.name,
                "network_distance_m": venue.columbia_walk_network_m,
                "geometry": LineString(coordinates),
            }
        )
    return gpd.GeoDataFrame(records, geometry="geometry", crs="EPSG:4326")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    dcla_rows = fetch_json(DCLA_API, RAW_DIR / "dcla_cultural_organizations.json")
    mta_rows = fetch_json(MTA_API, RAW_DIR / "mta_subway_stations.json")
    curated = load_curated()

    directory = build_directory(dcla_rows)
    directory.to_file(DIRECTORY_PATH, driver="GeoJSON")

    dcla_by_name = {row["organization_name"]: row for row in dcla_rows}
    venue_records = []
    for venue in curated:
        latitude, longitude = get_coordinates(venue, dcla_by_name)
        record = venue.copy()
        record["latitude"] = latitude
        record["longitude"] = longitude
        record["data_checked"] = "2026-07-24"
        record["data_status"] = "verified-profile"
        record["data_confidence"] = "Hours and prices manually checked"
        record["admission_source"] = (
            "https://www.nyc.gov/site/dcla/resources/free-and-suggested-admission.page"
        )
        record["geometry"] = Point(longitude, latitude)
        venue_records.append(record)

    venues = gpd.GeoDataFrame(venue_records, geometry="geometry", crs="EPSG:4326")

    stations_df = pd.DataFrame(mta_rows)
    stations_df["ada"] = (
        pd.to_numeric(stations_df["ada"], errors="coerce").fillna(0).astype(int)
    )
    all_stations = gpd.GeoDataFrame(
        stations_df,
        geometry=gpd.points_from_xy(
            pd.to_numeric(stations_df["gtfs_longitude"]),
            pd.to_numeric(stations_df["gtfs_latitude"]),
        ),
        crs="EPSG:4326",
    )
    manhattan_stations = all_stations[all_stations["borough"] == "M"].copy()

    graph = load_or_download_graph()
    metrics, walk_paths = nearest_station_metrics(
        graph, venues, manhattan_stations
    )
    venues = venues.merge(metrics, on="id", how="left")

    subway_payload, subway_graph, edge_records = build_subway_network(mta_rows)
    venues, transit_routes = add_transit_metrics(
        venues, subway_payload, subway_graph, edge_records
    )
    walk_routes = make_walk_routes(graph, venues, walk_paths)

    venues_for_export = venues.copy()
    venues_for_export["hours"] = venues_for_export["hours"].apply(json.dumps)
    venues_for_export["access_programs"] = venues_for_export[
        "access_programs"
    ].apply(json.dumps)
    venues_for_export.to_file(VENUES_PATH, driver="GeoJSON")

    all_stations[
        [
            "gtfs_stop_id",
            "stop_name",
            "daytime_routes",
            "ada",
            "borough",
            "complex_id",
            "structure",
            "geometry",
        ]
    ].to_file(STATIONS_PATH, driver="GeoJSON")
    transit_routes.to_file(TRANSIT_ROUTES_PATH, driver="GeoJSON")
    walk_routes.to_file(WALK_ROUTES_PATH, driver="GeoJSON")
    SUBWAY_NETWORK_PATH.write_text(
        json.dumps(subway_payload, separators=(",", ":")), encoding="utf-8"
    )

    borough_counts = (
        directory["borough"].value_counts(dropna=False).sort_index().to_dict()
    )
    summary = {
        "project": "Culture After Six NYC",
        "data_checked": "2026-07-28",
        "venue_policy_checked": "2026-07-24",
        "verified_venue_count": int(len(venues)),
        "dcla_row_count": int(len(dcla_rows)),
        "dcla_geocoded_count": int(len(directory)),
        "dcla_geocoded_percent": round(len(directory) / len(dcla_rows) * 100, 1),
        "dcla_borough_counts": {
            str(key): int(value) for key, value in borough_counts.items()
        },
        "station_count": int(len(all_stations)),
        "manhattan_station_count": int(len(manhattan_stations)),
        "subway_network_station_count": int(len(subway_payload["nodes"])),
        "subway_network_node_count": int(
            len(subway_payload["state_adjacency"])
        ),
        "subway_network_edge_count": int(
            sum(
                len(edges)
                for edges in subway_payload["state_adjacency"].values()
            )
        ),
        "temporarily_closed_count": int(venues["temporarily_closed"].sum()),
        "median_station_walk_m": round(float(venues["station_walk_m"].median()), 1),
        "median_ada_station_walk_m": round(
            float(venues["ada_station_walk_m"].median()), 1
        ),
        "median_network_detour_ratio": round(
            float(venues["network_detour_ratio"].median()), 3
        ),
        "median_columbia_transit_min": round(
            float(venues["columbia_transit_total_min"].median()), 1
        ),
        "origin": COLUMBIA,
        "sources": {
            "dcla_organizations": DCLA_API,
            "dcla_admission": (
                "https://www.nyc.gov/site/dcla/resources/"
                "free-and-suggested-admission.page"
            ),
            "mta_stations": MTA_API,
            "mta_gtfs": MTA_GTFS_URL,
            "venue_hours": "Individual venue websites listed in curated_venues.json",
            "walking_network": "OpenStreetMap via OSMnx",
        },
        "model_notes": {
            "transit": subway_payload["metadata"]["limitations"],
            "directory": (
                "DCLA records describe funded organizations. Their coordinates "
                "may represent offices or mailing addresses rather than public venues."
            ),
        },
    }
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    SITE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    for output_path in [
        VENUES_PATH,
        DIRECTORY_PATH,
        STATIONS_PATH,
        SUBWAY_NETWORK_PATH,
        TRANSIT_ROUTES_PATH,
        WALK_ROUTES_PATH,
        SUMMARY_PATH,
    ]:
        shutil.copy2(output_path, SITE_DATA_DIR / output_path.name)

    print(f"Wrote {len(venues)} verified venues to {VENUES_PATH}")
    print(f"Wrote {len(directory)} DCLA directory records to {DIRECTORY_PATH}")
    print(f"Wrote {len(all_stations)} subway station records to {STATIONS_PATH}")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
