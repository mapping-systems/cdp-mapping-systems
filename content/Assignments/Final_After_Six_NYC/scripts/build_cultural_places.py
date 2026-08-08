from __future__ import annotations

import json
import math
import time
from pathlib import Path

import requests


PROJECT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_DIR / "data"
SEED_PATH = DATA_DIR / "curated_places.json"
VISIT_INFO_PATH = DATA_DIR / "visit_info.json"
PLANNER_PATH = DATA_DIR / "venues.geojson"
STATIONS_PATH = DATA_DIR / "subway_stations.geojson"
OUTPUT_PATH = DATA_DIR / "cultural_places.geojson"
SITE_OUTPUT_PATH = PROJECT_DIR / "site" / "data" / "cultural_places.geojson"
CURRENT_PROGRAMS_PATH = DATA_DIR / "current_programs.json"
SITE_CURRENT_PROGRAMS_PATH = PROJECT_DIR / "site" / "data" / "current_programs.json"
GEOCODE_CACHE_PATH = DATA_DIR / "raw" / "cultural_place_geocodes.json"

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NYC_GEOCODER_URL = "https://geosearch.planninglabs.nyc/v2/search"
USER_AGENT = "culture-after-six-nyc-course-project/2.0"
CHECKED_DATE = "2026-08-01"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


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


def geocode(
    name: str,
    address: str,
    cache: dict[str, dict],
) -> tuple[float, float]:
    if address in cache:
        cached = cache[address]
        return float(cached["latitude"]), float(cached["longitude"])

    city_response = requests.get(
        NYC_GEOCODER_URL,
        params={"text": address, "size": 1},
        headers={"User-Agent": USER_AGENT},
        timeout=45,
    )
    city_response.raise_for_status()
    city_matches = city_response.json().get("features", [])
    if city_matches:
        longitude, latitude = map(float, city_matches[0]["geometry"]["coordinates"])
        if -74.30 <= longitude <= -73.65 and 40.45 <= latitude <= 40.95:
            cache[address] = {
                "latitude": latitude,
                "longitude": longitude,
                "display_name": city_matches[0].get("properties", {}).get("label", ""),
                "source": "NYC Planning Labs Geosearch",
            }
            GEOCODE_CACHE_PATH.write_text(
                json.dumps(cache, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            return latitude, longitude

    matches = []
    for query in (f"{name}, {address}", address):
        response = requests.get(
            NOMINATIM_URL,
            params={
                "q": query,
                "format": "jsonv2",
                "limit": 1,
                "countrycodes": "us",
            },
            headers={"User-Agent": USER_AGENT},
            timeout=45,
        )
        response.raise_for_status()
        matches = response.json()
        if matches:
            break
        time.sleep(1.05)
    if not matches:
        raise ValueError(f"Could not geocode public venue address: {address}")

    latitude = float(matches[0]["lat"])
    longitude = float(matches[0]["lon"])
    if not (-74.30 <= longitude <= -73.65 and 40.45 <= latitude <= 40.95):
        raise ValueError(f"Geocoder returned a point outside NYC for {address}")

    cache[address] = {
        "latitude": latitude,
        "longitude": longitude,
        "display_name": matches[0].get("display_name", ""),
    }
    GEOCODE_CACHE_PATH.write_text(
        json.dumps(cache, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    time.sleep(1.05)
    return latitude, longitude


def nearest_station(
    longitude: float,
    latitude: float,
    stations: list[dict],
) -> dict:
    nearest = min(
        stations,
        key=lambda station: haversine_meters(
            longitude,
            latitude,
            station["longitude"],
            station["latitude"],
        ),
    )
    distance = haversine_meters(
        longitude,
        latitude,
        nearest["longitude"],
        nearest["latitude"],
    )
    return {
        "nearest_station": nearest["name"],
        "nearest_station_routes": nearest["routes"],
        "nearest_station_ada": nearest["ada"],
        "nearest_station_gtfs_id": nearest["id"],
        "station_walk_estimate_m": round(distance * 1.18, 1),
    }


def build() -> dict:
    seeds = read_json(SEED_PATH)
    visit_info = read_json(VISIT_INFO_PATH)
    planner_geojson = read_json(PLANNER_PATH)
    station_geojson = read_json(STATIONS_PATH)
    planner_by_id = {
        feature["properties"]["id"]: feature
        for feature in planner_geojson["features"]
    }
    stations = [
        {
            "id": str(feature["properties"]["gtfs_stop_id"]),
            "name": feature["properties"]["stop_name"],
            "routes": feature["properties"].get("daytime_routes", ""),
            "ada": int(feature["properties"].get("ada", 0)),
            "longitude": float(feature["geometry"]["coordinates"][0]),
            "latitude": float(feature["geometry"]["coordinates"][1]),
        }
        for feature in station_geojson["features"]
    ]
    cache = (
        read_json(GEOCODE_CACHE_PATH)
        if GEOCODE_CACHE_PATH.exists()
        else {}
    )

    seen_ids: set[str] = set()
    features = []
    for seed in seeds:
        place_id = seed["id"]
        if place_id in seen_ids:
            raise ValueError(f"Duplicate curated place id: {place_id}")
        seen_ids.add(place_id)

        planner_id = seed.get("planner_id")
        planner_feature = planner_by_id.get(planner_id) if planner_id else None
        if planner_id and planner_feature is None:
            raise ValueError(f"Unknown planner profile: {planner_id}")

        if planner_feature:
            planner_properties = planner_feature["properties"]
            longitude, latitude = map(
                float, planner_feature["geometry"]["coordinates"]
            )
            address = planner_properties["address"]
            website = seed.get("website") or planner_properties["website"]
        else:
            address = seed["address"]
            website = seed["website"]
            if seed.get("latitude") is not None:
                latitude = float(seed["latitude"])
                longitude = float(seed["longitude"])
            else:
                latitude, longitude = geocode(seed["name"], address, cache)

        required = [
            "name",
            "category",
            "venue_type",
            "borough",
            "neighborhood",
            "description",
            "events_url",
            "program_label",
        ]
        missing = [key for key in required if not seed.get(key)]
        if missing:
            raise ValueError(f"{place_id} is missing: {', '.join(missing)}")
        for label, url in {
            "website": website,
            "events_url": seed["events_url"],
        }.items():
            if not str(url).startswith("https://"):
                raise ValueError(f"{place_id} has a non-HTTPS {label}: {url}")

        properties = {
            **seed,
            **visit_info[place_id],
            "address": address,
            "website": website,
            "public_visit_verified": True,
            "data_checked": CHECKED_DATE,
            "source_note": (
                "Public venue profile checked against the venue's official "
                "website and NYC DCLA's public admission guide where listed."
            ),
            **nearest_station(longitude, latitude, stations),
        }
        properties.pop("latitude", None)
        properties.pop("longitude", None)
        features.append(
            {
                "type": "Feature",
                "properties": properties,
                "geometry": {
                    "type": "Point",
                    "coordinates": [longitude, latitude],
                },
            }
        )

    return {
        "type": "FeatureCollection",
        "name": "Culture After Six curated public cultural places",
        "metadata": {
            "checked": CHECKED_DATE,
            "selection": (
                "Fixed public cultural venues with an official website, an "
                "official current-program page, a visitor address, and a "
                "plain-language description."
            ),
            "count": len(features),
        },
        "features": features,
    }


if __name__ == "__main__":
    output = build()
    text = json.dumps(output, indent=2, ensure_ascii=False)
    OUTPUT_PATH.write_text(text, encoding="utf-8")
    SITE_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SITE_OUTPUT_PATH.write_text(text, encoding="utf-8")
    SITE_CURRENT_PROGRAMS_PATH.write_text(
        CURRENT_PROGRAMS_PATH.read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    print(f"Wrote {len(output['features'])} curated public cultural places")
