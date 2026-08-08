"""Extract and geolocate server IPs from the course website HAR capture.

Adapted from the Mapping Systems geolocate-har-file exercise. The output keeps
one feature per server IP and records how many captured requests used it.
"""

from __future__ import annotations

import ipaddress
import json
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

import folium
import requests
from folium.plugins import MarkerCluster


ROOT = Path(__file__).resolve().parent
HAR_FILE = ROOT / "inputs" / "mapping-systems.har"
CACHE_FILE = ROOT / "inputs" / "ipinfo_cache.json"
OUTPUT_GEOJSON = ROOT / "outputs" / "ip_locations.geojson"
OUTPUT_MAP = ROOT / "outputs" / "ip_map.html"


def load_requests(path: Path) -> dict[str, list[str]]:
    """Group captured request URLs by public server IP address."""
    har = json.loads(path.read_text(encoding="utf-8"))
    requests_by_ip: dict[str, list[str]] = defaultdict(list)

    for entry in har.get("log", {}).get("entries", []):
        ip_text = str(entry.get("serverIPAddress") or "").strip("[]")
        url = entry.get("request", {}).get("url", "")
        if not ip_text or not url:
            continue

        try:
            ip = ipaddress.ip_address(ip_text)
        except ValueError:
            continue

        if ip.is_global:
            requests_by_ip[str(ip)].append(url)

    return dict(requests_by_ip)


def geolocate(ip: str, cache: dict[str, dict]) -> dict:
    """Return cached or newly requested approximate IP metadata."""
    if ip not in cache:
        response = requests.get(
            f"https://ipinfo.io/{ip}/json",
            headers={"User-Agent": "Mapping Systems student assignment"},
            timeout=20,
        )
        response.raise_for_status()
        cache[ip] = response.json()
    return cache[ip]


def build_geojson(requests_by_ip: dict[str, list[str]]) -> dict:
    """Create one point feature for each successfully geolocated server."""
    cache = json.loads(CACHE_FILE.read_text()) if CACHE_FILE.exists() else {}
    features = []

    for ip, urls in sorted(requests_by_ip.items()):
        metadata = geolocate(ip, cache)
        location = metadata.get("loc")
        if not location:
            continue

        latitude, longitude = (float(value) for value in location.split(","))
        hosts = sorted({urlparse(url).hostname or "unknown" for url in urls})
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "ip": ip,
                    "hosts": ", ".join(hosts),
                    "request_count": len(urls),
                    "sample_url": urls[0],
                    "city": metadata.get("city", "Unknown"),
                    "region": metadata.get("region", "Unknown"),
                    "country": metadata.get("country", "Unknown"),
                    "organization": metadata.get("org", "Unknown"),
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [longitude, latitude],
                },
            }
        )

    CACHE_FILE.write_text(json.dumps(cache, indent=2), encoding="utf-8")
    return {"type": "FeatureCollection", "features": features}


def build_folium_map(geojson: dict) -> None:
    """Preserve the course exercise's Folium output alongside the web map."""
    map_view = folium.Map(location=[30, 0], zoom_start=2, tiles="CartoDB positron")
    cluster = MarkerCluster().add_to(map_view)

    for feature in geojson["features"]:
        longitude, latitude = feature["geometry"]["coordinates"]
        properties = feature["properties"]
        popup = (
            f"<strong>{properties['hosts']}</strong><br>"
            f"IP: {properties['ip']}<br>"
            f"Requests: {properties['request_count']}<br>"
            f"{properties['city']}, {properties['region']}"
        )
        folium.Marker([latitude, longitude], popup=popup).add_to(cluster)

    map_view.save(OUTPUT_MAP)


if __name__ == "__main__":
    OUTPUT_GEOJSON.parent.mkdir(parents=True, exist_ok=True)
    request_groups = load_requests(HAR_FILE)
    result = build_geojson(request_groups)
    OUTPUT_GEOJSON.write_text(json.dumps(result, indent=2), encoding="utf-8")
    build_folium_map(result)
    print(
        f"Saved {len(result['features'])} server locations to "
        f"{OUTPUT_GEOJSON.relative_to(ROOT)}"
    )
