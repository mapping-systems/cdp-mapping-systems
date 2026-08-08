"""Turn a privacy-reviewed HAR capture into GeoJSON and a reference web map.

The extraction follows the instructor's ``geolocate-har-file`` workflow:
read ``serverIPAddress`` from each HAR entry, geolocate each unique public IP,
and write both GeoJSON and an HTML map.  This version is deterministic, keeps
all safe request paths associated with an IP, and can rebuild the outputs from
the committed sanitized HAR without publishing the original browser archive.
"""

from __future__ import annotations

import hashlib
import html
import ipaddress
import json
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import folium
import requests
from folium.plugins import MarkerCluster


HERE = Path(__file__).resolve().parent
INPUT_DIR = HERE / "inputs"
OUTPUT_DIR = HERE / "outputs"
RAW_HAR = INPUT_DIR / "vanishing-network.raw.har"
SANITIZED_HAR = INPUT_DIR / "vanishing-network.sanitized.har"
CACHE_PATH = INPUT_DIR / "ipinfo_cache.json"
GEOJSON_PATH = OUTPUT_DIR / "ip_locations.geojson"
GEOJSON_JS_PATH = OUTPUT_DIR / "ip_locations.js"
REFERENCE_MAP_PATH = OUTPUT_DIR / "ip_map.html"
MAX_IPS = 50
CAPTURED_URL = "https://jzhang2468.github.io/mapping-system-final-project/"
SANITIZED_COMMENT = (
    "Captured from the selected public website in Chrome DevTools. Headers, cookies, "
    "query strings, credentials, request/response bodies, redirects, precise timestamps, "
    "and request durations removed before commit."
)
SANITIZED_CREATOR = {"name": "Chrome DevTools capture, privacy-reviewed", "version": "1.0"}

HOST_ROLES = {
    "jzhang2468.github.io": {
        "role": "site",
        "role_label": "Site code + data",
        "description": "The HTML, CSS, JavaScript, and project data served by GitHub Pages.",
    },
    "tiles.mapterhorn.com": {
        "role": "terrain",
        "role_label": "Terrain tiles",
        "description": "Terrain and elevation tiles requested by the project map.",
    },
    "server.arcgisonline.com": {
        "role": "imagery",
        "role_label": "Imagery tiles",
        "description": "Satellite imagery tiles requested by the project map.",
    },
}


def clean_ip(value: str | None) -> str | None:
    """Return a canonical public IP address, or ``None`` for unusable values."""
    if not value:
        return None
    candidate = value.strip().strip("[]")
    try:
        parsed = ipaddress.ip_address(candidate)
    except ValueError:
        return None
    return str(parsed) if parsed.is_global else None


def clean_url(value: str) -> str:
    """Keep a public URL's scheme, host, port, and path but remove credentials/query/fragment."""
    parts = urlsplit(value)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        return ""
    host = parts.hostname
    if ":" in host:
        host = f"[{host}]"
    try:
        port = parts.port
    except ValueError:
        return ""
    netloc = f"{host}:{port}" if port else host
    return urlunsplit((parts.scheme, netloc, parts.path or "/", "", ""))


def sanitize_entry(entry: dict) -> dict | None:
    """Reduce one HAR entry to the fields needed for the assignment."""
    ip = clean_ip(entry.get("serverIPAddress"))
    request = entry.get("request", {})
    url = clean_url(request.get("url", ""))
    if not ip or not url:
        return None
    response = entry.get("response", {})
    started = entry.get("startedDateTime") or ""
    capture_day = started[:10] if len(started) >= 10 else None
    return {
        "startedDateTime": f"{capture_day}T00:00:00Z" if capture_day else None,
        "time": 0,
        "serverIPAddress": ip,
        "request": {
            "method": request.get("method", "GET"),
            "url": url,
            "httpVersion": request.get("httpVersion", ""),
            "headers": [],
            "queryString": [],
            "cookies": [],
            "headersSize": -1,
            "bodySize": -1,
        },
        "response": {
            "status": response.get("status", 0),
            "statusText": response.get("statusText", ""),
            "httpVersion": response.get("httpVersion", ""),
            "headers": [],
            "cookies": [],
            "content": {
                "size": 0,
                "mimeType": response.get("content", {}).get("mimeType", ""),
            },
            "redirectURL": "",
            "headersSize": -1,
            "bodySize": -1,
        },
        "cache": {},
        "timings": {"send": -1, "wait": -1, "receive": -1},
    }


def validate_sanitized_entries(entries: list[dict]) -> None:
    """Fail closed if the committed HAR still contains common sensitive fields."""
    if not entries:
        raise RuntimeError("The sanitized HAR contains no usable entries.")
    for index, entry in enumerate(entries):
        request = entry.get("request", {})
        response = entry.get("response", {})
        ip = entry.get("serverIPAddress")
        url = request.get("url", "")
        if clean_ip(ip) != ip:
            raise ValueError(f"Entry {index} does not contain a canonical public IP.")
        if not url or clean_url(url) != url:
            raise ValueError(f"Entry {index} contains an unsafe or unsanitized URL.")
        sensitive_values = [
            request.get("headers"),
            request.get("queryString"),
            request.get("cookies"),
            request.get("postData"),
            response.get("headers"),
            response.get("cookies"),
            response.get("redirectURL"),
            response.get("content", {}).get("text"),
        ]
        if any(sensitive_values):
            raise ValueError(f"Entry {index} still contains headers, cookies, query/body data, or a redirect.")


def load_entries() -> tuple[list[dict], str]:
    """Sanitize a local raw HAR when present; otherwise use the reviewed fixture."""
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    if RAW_HAR.exists():
        raw = json.loads(RAW_HAR.read_text(encoding="utf-8"))
        entries = [
            clean
            for entry in raw.get("log", {}).get("entries", [])
            if (clean := sanitize_entry(entry))
        ]
        validate_sanitized_entries(entries)
        sanitized = {
            "log": {
                "version": "1.2",
                "creator": SANITIZED_CREATOR,
                "comment": SANITIZED_COMMENT,
                "entries": entries,
            }
        }
        SANITIZED_HAR.write_text(json.dumps(sanitized, indent=2), encoding="utf-8")
        return entries, SANITIZED_HAR.name

    if not SANITIZED_HAR.exists():
        raise FileNotFoundError(
            f"Add a browser HAR at {RAW_HAR} or keep the reviewed fixture at {SANITIZED_HAR}."
        )
    sanitized = json.loads(SANITIZED_HAR.read_text(encoding="utf-8"))
    entries = [
        clean
        for entry in sanitized.get("log", {}).get("entries", [])
        if (clean := sanitize_entry(entry))
    ]
    validate_sanitized_entries(entries)
    sanitized["log"]["version"] = "1.2"
    sanitized["log"]["creator"] = SANITIZED_CREATOR
    sanitized["log"]["entries"] = entries
    sanitized["log"]["comment"] = SANITIZED_COMMENT
    SANITIZED_HAR.write_text(json.dumps(sanitized, indent=2), encoding="utf-8")
    return entries, SANITIZED_HAR.name


def load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def geolocate(ip: str, cache: dict) -> dict:
    """Return cached IPinfo metadata, looking up and caching only a missing IP."""
    if ip in cache:
        return cache[ip]
    response = requests.get(
        f"https://ipinfo.io/{ip}/json",
        headers={"User-Agent": "Jennifer-Zhang-CDP-Mapping-Systems-Assignment"},
        timeout=20,
    )
    response.raise_for_status()
    data = response.json()
    cache[ip] = {
        key: data.get(key)
        for key in ["ip", "city", "region", "country", "loc", "org", "postal", "timezone"]
    }
    CACHE_PATH.write_text(json.dumps(cache, indent=2, sort_keys=True), encoding="utf-8")
    return cache[ip]


def capture_date(entries: list[dict]) -> str | None:
    timestamps = sorted(
        value
        for entry in entries
        if (value := entry.get("startedDateTime")) and len(value) >= 10
    )
    return timestamps[0][:10] if timestamps else None


def build_features(entries: list[dict]) -> list[dict]:
    ip_requests: dict[str, list[str]] = defaultdict(list)
    for entry in entries:
        ip_requests[entry["serverIPAddress"]].append(entry["request"]["url"])

    cache = load_cache()
    features = []
    for ip in sorted(ip_requests)[:MAX_IPS]:
        urls = ip_requests[ip]
        info = geolocate(ip, cache)
        if not info.get("loc"):
            continue
        lat, lon = map(float, info["loc"].split(","))
        unique_urls = sorted(set(urls))
        hosts = sorted({urlsplit(url).netloc for url in unique_urls})
        host_details = [HOST_ROLES.get(host, {}) for host in hosts]
        roles = sorted({detail.get("role", "other") for detail in host_details})
        role_labels = sorted({detail.get("role_label", "Other request") for detail in host_details})
        descriptions = sorted(
            {detail.get("description", "A request made while the selected page was loading.") for detail in host_details}
        )
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "ip": ip,
                    "city": info.get("city"),
                    "region": info.get("region"),
                    "country": info.get("country"),
                    "organization": info.get("org"),
                    "request_count": len(urls),
                    "hosts": hosts,
                    "roles": roles,
                    "role_labels": role_labels,
                    "role_descriptions": descriptions,
                    "urls": unique_urls,
                    "interpretation": "Approximate server/CDN location; not a visitor location.",
                },
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
            }
        )
    return features


def build_reference_map(features: list[dict]) -> None:
    """Write the Folium/MarkerCluster HTML generated by the HAR-processing step."""
    reference_map = folium.Map(location=[20, 0], zoom_start=2, tiles="OpenStreetMap")
    cluster = MarkerCluster(name="Server IPs").add_to(reference_map)
    for feature in features:
        properties = feature["properties"]
        lon, lat = feature["geometry"]["coordinates"]
        location = ", ".join(
            part for part in [properties.get("city"), properties.get("region"), properties.get("country")] if part
        )
        popup = (
            f"<strong>{html.escape(location or 'Approximate location')}</strong><br>"
            f"IP: {html.escape(properties['ip'])}<br>"
            f"Requests: {properties['request_count']}"
        )
        folium.Marker([lat, lon], popup=folium.Popup(popup, max_width=320)).add_to(cluster)
    folium.LayerControl().add_to(reference_map)
    reference_map.save(REFERENCE_MAP_PATH)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    entries, source_har = load_entries()
    features = build_features(entries)
    if not features:
        raise RuntimeError("No public server IP addresses could be geolocated.")

    sanitized_sha256 = hashlib.sha256(SANITIZED_HAR.read_bytes()).hexdigest()
    geojson = {
        "type": "FeatureCollection",
        "name": "vanishing_network_web_request_locations",
        "metadata": {
            "captured_url": CAPTURED_URL,
            "captured_date": capture_date(entries),
            "source_har": source_har,
            "committed_har": SANITIZED_HAR.name,
            "capture_origin": f"Chrome DevTools raw HAR ({RAW_HAR.name}, excluded from Git)",
            "request_count": len(entries),
            "unique_public_ip_count": len({entry["serverIPAddress"] for entry in entries}),
            "sanitized_har_sha256": sanitized_sha256,
            "geolocation_provider": "IPinfo (cached lookup results committed in inputs/ipinfo_cache.json)",
            "workflow": "Chrome HAR → serverIPAddress extraction → cached IP geolocation → GeoJSON → static web-map layer",
            "service_annotations": "Resource-role labels are derived from request hosts, not from IP geolocation.",
            "privacy": "Cookies, headers, credentials, queries, bodies, precise timestamps, and request durations removed before commit.",
            "caveat": "IP geolocation approximates a server or CDN edge, not a person or necessarily a physical machine.",
        },
        "features": features,
    }
    GEOJSON_PATH.write_text(json.dumps(geojson, indent=2), encoding="utf-8")
    GEOJSON_JS_PATH.write_text(
        "window.IP_LOCATION_DATA = " + json.dumps(geojson, indent=2) + ";\n",
        encoding="utf-8",
    )
    build_reference_map(features)

    unique_ips = {entry["serverIPAddress"] for entry in entries}
    print(f"Sanitized requests: {len(entries)}")
    print(f"Unique public server IPs: {len(unique_ips)}")
    print(f"Geolocated features: {len(features)}")
    print(
        f"Wrote {GEOJSON_PATH.relative_to(HERE)}, {GEOJSON_JS_PATH.relative_to(HERE)}, "
        f"and {REFERENCE_MAP_PATH.relative_to(HERE)}"
    )


if __name__ == "__main__":
    main()
