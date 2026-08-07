import json
import requests
import folium
from folium.plugins import MarkerCluster
from pathlib import Path
from typing import List, Tuple

# === CONFIGURATION ===
HAR_FILE = "inputs/yourfilename.har"  # Replace with your HAR filename
OUTPUT_MAP = "outputs/ip_map.html"
MAX_IPS = 50  # Limit to avoid API rate limiting

# === FUNCTIONS ===


def load_ips_from_har(path: str) -> List[str]:
    """Extract unique IP addresses from a HAR file."""
    with open(path, "r", encoding="utf-8") as f:
        har = json.load(f)

    entries = har.get("log", {}).get("entries", [])
    ips = set()
    for entry in entries:
        ip = entry.get("serverIPAddress")
        url = entry.get("request", {}).get("url", "")
        print(f"Processing entry: {url} with IP: {ip}")
        if ip:
            # print(f"Found IP: {ip}")
            ip = ip.strip("[]")
            ips.add((ip, url))
    return list(ips)


def geolocate_ip(ip_item: Tuple[str, str]) -> Tuple[str, float, float, str]:
    """Geolocate IP using ipinfo.io API. Returns (ip, lat, lon, url)."""
    ip, url = ip_item

    try:
        resp = requests.get(f"https://ipinfo.io/{ip}/json")
        data = resp.json()
        loc = data.get("loc")
        if loc:
            lat, lon = map(float, loc.split(","))
            return ip, lat, lon, url
    except Exception as e:
        print(f"Error locating {ip}: {e}")
    return ip, 0, 0, url


def build_map(
    ip_locations: List[Tuple[str, float, float, str]], output_path: str
) -> None:
    """Generate Folium map from list of IP + lat/lon tuples."""
    m = folium.Map(location=[20, 0], zoom_start=2)
    cluster = MarkerCluster().add_to(m)
    for ip, lat, lon, url in ip_locations:
        if lat and lon:
            folium.Marker(
                location=[lat, lon],
                popup=f"IP: {ip}<br>URL: {url}",
                icon=folium.Icon(color="blue", icon="info-sign"),
            ).add_to(cluster)

    # additionally save data as a GeoJSON file
    geojson_data = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"ip": ip, "url": url},
                "geometry": {
                    "type": "Point",
                    "coordinates": [lon, lat],
                },
            }
            for ip, lat, lon, url in ip_locations
            if lat and lon
        ],
    }

    m.save(output_path)
    print(f"Map saved to: {output_path}")

    # additionally save data as a GeoJSON file
    with open("outputs/ip_locations.geojson", "w", encoding="utf-8") as f:
        json.dump(geojson_data, f)
    print("GeoJSON saved to: outputs/ip_locations.geojson")


# === RUN ===

if __name__ == "__main__":
    ip_list = load_ips_from_har(HAR_FILE)
    print(f"Found {len(ip_list)} IPs")

    # ip_list is a list of (ip, url) tuples; deduplicate by IP only
    ips_dict = {}
    for ip, url in ip_list:
        if ip not in ips_dict:
            ips_dict[ip] = url
    ips = list(ips_dict.items())
    print(f"Unique IPs: {len(ips)}")
    ip_locations = [geolocate_ip(ip) for ip in ips[:MAX_IPS]]
    build_map(ip_locations, OUTPUT_MAP)
