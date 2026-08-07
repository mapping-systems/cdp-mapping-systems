"""Geolocate the sanitized HAR using the course repository's core workflow.

The upstream script at vendor/geolocate-har-file/scrape_har_locations.py is
preserved verbatim. This runnable wrapper keeps the same three operations—HAR
IP extraction, ipinfo geolocation, Folium/GeoJSON output—while adding a local
cache, provenance fields, deterministic ordering, and CLI arguments.
"""

from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
from pathlib import Path
from urllib.parse import urlparse

import folium
from folium.plugins import MarkerCluster
import requests


ROOT = Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("har", type=Path, help="Sanitized HAR file")
    parser.add_argument("--geojson", type=Path, default=ROOT / "data/server_locations.geojson")
    parser.add_argument("--map", type=Path, default=ROOT / "outputs/ip_map_folium.html")
    parser.add_argument("--cache", type=Path, default=ROOT / "data/ipinfo_cache.json")
    parser.add_argument("--max-ips", type=int, default=50)
    return parser.parse_args()


def extract_ip_hosts(har_path: Path) -> dict[str, set[str]]:
    har = json.loads(har_path.read_text(encoding="utf-8"))
    found: dict[str, set[str]] = {}
    for entry in har.get("log", {}).get("entries", []):
        value = str(entry.get("serverIPAddress") or "").strip("[]")
        if not value:
            continue
        try:
            ip = ipaddress.ip_address(value)
        except ValueError:
            continue
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            continue
        url = entry.get("request", {}).get("url", "")
        host = urlparse(url).hostname or "unknown"
        found.setdefault(str(ip), set()).add(host)
    return found


def locate(ip: str, cache: dict[str, dict]) -> dict | None:
    if ip in cache:
        return cache[ip]
    response = requests.get(f"https://ipinfo.io/{ip}/json", timeout=20)
    response.raise_for_status()
    payload = response.json()
    cache[ip] = {
        key: payload.get(key)
        for key in ("ip", "city", "region", "country", "loc", "org", "timezone")
    }
    return cache[ip]


def to_feature(ip: str, hosts: set[str], record: dict) -> dict | None:
    loc = record.get("loc")
    if not loc:
        return None
    try:
        latitude, longitude = [float(part) for part in loc.split(",")]
    except (TypeError, ValueError):
        return None
    return {
        "type": "Feature",
        "properties": {
            "server_id": hashlib.sha256(ip.encode()).hexdigest()[:12],
            "request_hosts": sorted(hosts),
            "request_host_count": len(hosts),
            "city": record.get("city"),
            "region": record.get("region"),
            "country": record.get("country"),
            "organization": record.get("org"),
            "timezone": record.get("timezone"),
            "location_precision": "Approximate IP geolocation; not a physical server address",
            "geolocation_provider": "ipinfo.io unauthenticated endpoint",
        },
        "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
    }


def build_folium(features: list[dict], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    map_view = folium.Map(location=[25, 0], zoom_start=2, tiles="CartoDB positron")
    cluster = MarkerCluster(name="Approximate server locations").add_to(map_view)
    for feature in features:
        longitude, latitude = feature["geometry"]["coordinates"]
        properties = feature["properties"]
        hosts = ", ".join(properties["request_hosts"][:5])
        folium.CircleMarker(
            [latitude, longitude],
            radius=7,
            color="#0b5670",
            fill=True,
            fill_color="#4fc3a1",
            fill_opacity=0.8,
            popup=(
                f"<strong>{properties.get('city') or 'Unknown city'}</strong><br>"
                f"{properties.get('region') or ''} {properties.get('country') or ''}<br>"
                f"Hosts: {hosts}<br><em>Approximate IP location</em>"
            ),
        ).add_to(cluster)
    folium.LayerControl().add_to(map_view)
    map_view.save(output)
    rendered = output.read_text(encoding="utf-8")
    output.write_text(
        "\n".join(line.rstrip() for line in rendered.splitlines()) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    args = parse_args()
    args.geojson.parent.mkdir(parents=True, exist_ok=True)
    args.cache.parent.mkdir(parents=True, exist_ok=True)
    cache = json.loads(args.cache.read_text()) if args.cache.exists() else {}
    har = json.loads(args.har.read_text(encoding="utf-8"))
    entries = har.get("log", {}).get("entries", [])
    ip_hosts = extract_ip_hosts(args.har)
    features = []
    for ip in sorted(ip_hosts, key=lambda value: ipaddress.ip_address(value))[: args.max_ips]:
        try:
            record = locate(ip, cache)
        except requests.RequestException as error:
            print(f"warning: geolocation failed for one server: {error}")
            continue
        feature = to_feature(ip, ip_hosts[ip], record)
        if feature:
            features.append(feature)
    cache_safe = {ip: cache[ip] for ip in sorted(ip_hosts) if ip in cache}
    args.cache.write_text(json.dumps(cache_safe, indent=2) + "\n", encoding="utf-8")
    collection = {
        "type": "FeatureCollection",
        "name": "Approximate request server locations",
        "metadata": {
            "input_har": args.har.name,
            "har_entry_count": len(entries),
            "entries_with_server_ip": sum(
                bool(entry.get("serverIPAddress")) for entry in entries
            ),
            "request_host_count": len(
                {
                    urlparse(entry.get("request", {}).get("url", "")).hostname
                    for entry in entries
                    if urlparse(entry.get("request", {}).get("url", "")).hostname
                }
            ),
            "unique_public_ip_count": len(ip_hosts),
            "feature_count": len(features),
            "method": "serverIPAddress from sanitized HAR, geolocated with ipinfo.io",
            "limitations": "IP locations are approximate network-registration or edge locations, not proof of physical server location or data storage.",
        },
        "features": features,
    }
    args.geojson.write_text(json.dumps(collection, indent=2) + "\n", encoding="utf-8")
    build_folium(features, args.map)
    print(json.dumps({"unique_public_ips": len(ip_hosts), "geolocated_features": len(features), "geojson": str(args.geojson), "map": str(args.map)}, indent=2))


if __name__ == "__main__":
    main()
