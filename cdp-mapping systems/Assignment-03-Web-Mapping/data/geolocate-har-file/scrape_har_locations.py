import html
import ipaddress
import json
import os
import time
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlparse

import folium
import requests
from folium.plugins import MarkerCluster


# ============================================================
# CONFIGURATION
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
HAR_FILE = BASE_DIR / "inputs" / "www.metmuseum.org.har"
OUTPUT_DIR = BASE_DIR / "outputs"
CACHE_DIR = BASE_DIR / "cache"

OUTPUT_MAP = OUTPUT_DIR / "ip_map.html"
OUTPUT_GEOJSON = OUTPUT_DIR / "ip_locations.geojson"
OUTPUT_SUMMARY = OUTPUT_DIR / "run_summary.json"
CACHE_FILE = CACHE_DIR / "ip_geolocation_cache.json"

MAX_IPS = 50
REQUEST_DELAY_SECONDS = 0.15
EXPECTED_DOMAIN = "metmuseum.org"

# False prevents requests from reading stale proxy settings such as
# HTTPS_PROXY=http://127.0.0.1:7890.
USE_ENVIRONMENT_PROXY = False


# ============================================================
# NETWORK SESSION
# ============================================================

for variable in [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
]:
    if not USE_ENVIRONMENT_PROXY:
        os.environ.pop(variable, None)

SESSION = requests.Session()
SESSION.trust_env = USE_ENVIRONMENT_PROXY
SESSION.headers.update(
    {
        "User-Agent": (
            "Mozilla/5.0 "
            "Mapping-Systems-HAR-Geolocation-Assignment/1.0"
        )
    }
)


# ============================================================
# HELPERS
# ============================================================

def load_json(path: Path, default):
    if not path.exists():
        return default

    try:
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)
    except (json.JSONDecodeError, OSError):
        return default


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as file:
        json.dump(
            data,
            file,
            ensure_ascii=False,
            indent=2,
        )


def normalize_ip(raw_ip: str) -> str:
    """Remove square brackets used around IPv6 addresses in HAR files."""
    return raw_ip.strip().strip("[]")


def is_public_ip(ip_text: str) -> bool:
    """Return True only for globally routable public IP addresses."""
    try:
        address = ipaddress.ip_address(ip_text)
        return address.is_global
    except ValueError:
        return False


def domain_from_url(url: str) -> str:
    return urlparse(url).netloc.lower()


# ============================================================
# HAR EXTRACTION AND VALIDATION
# ============================================================

def load_har_entries(path: Path) -> List[dict]:
    if not path.exists():
        raise FileNotFoundError(
            f"HAR file not found:\n{path}\n\n"
            "Place the exported HAR at inputs/www.metmuseum.org.har."
        )

    with path.open("r", encoding="utf-8") as file:
        har = json.load(file)

    entries = har.get("log", {}).get("entries", [])

    if not entries:
        raise ValueError(
            "The HAR file contains no entries. "
            "Export the Network log again after refreshing the website."
        )

    return entries


def validate_har(entries: List[dict]) -> Counter:
    domains = Counter()

    for entry in entries:
        url = entry.get("request", {}).get("url", "")
        domain = domain_from_url(url)

        if domain:
            domains[domain] += 1

    expected_requests = sum(
        count
        for domain, count in domains.items()
        if domain == EXPECTED_DOMAIN
        or domain.endswith("." + EXPECTED_DOMAIN)
    )

    print()
    print("HAR VALIDATION")
    print("=" * 62)
    print(f"Source HAR: {HAR_FILE}")
    print(f"Total requests: {len(entries):,}")
    print(f"Requests to The Met domains: {expected_requests:,}")
    print("Most frequent domains:")

    for domain, count in domains.most_common(10):
        print(f"  {count:>4}  {domain}")

    if expected_requests == 0:
        raise ValueError(
            "\nThis HAR does not contain requests to metmuseum.org. "
            "The script stopped to prevent another unrelated GeoJSON "
            "from being mistaken for The Met result."
        )

    return domains


def extract_ip_records(entries: List[dict]) -> List[dict]:
    """
    Aggregate HAR requests by unique public server IP.

    Each record preserves:
    - one representative URL;
    - the set of domains using the IP;
    - the number of requests sent to the IP.
    """
    records: Dict[str, dict] = {}

    for entry in entries:
        raw_ip = entry.get("serverIPAddress")
        url = entry.get("request", {}).get("url", "")

        if not raw_ip:
            continue

        ip = normalize_ip(raw_ip)

        if not is_public_ip(ip):
            continue

        domain = domain_from_url(url)

        if ip not in records:
            records[ip] = {
                "ip": ip,
                "representative_url": url,
                "domains": set(),
                "request_count": 0,
            }

        if domain:
            records[ip]["domains"].add(domain)

        records[ip]["request_count"] += 1

    output = []

    for record in records.values():
        output.append(
            {
                "ip": record["ip"],
                "representative_url": record["representative_url"],
                "domains": sorted(record["domains"]),
                "request_count": record["request_count"],
            }
        )

    output.sort(
        key=lambda record: record["request_count"],
        reverse=True,
    )

    return output


# ============================================================
# IP GEOLOCATION
# ============================================================

def geolocate_with_ipinfo(ip: str) -> Tuple[Optional[dict], str]:
    """
    Primary geolocation service used by the teacher's original script.
    """
    try:
        response = SESSION.get(
            f"https://ipinfo.io/{ip}/json",
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()

        location = data.get("loc")

        if not location:
            return None, (
                "ipinfo returned no loc field: "
                + str(data.get("error", "unknown response"))
            )

        latitude, longitude = map(float, location.split(","))

        return {
            "latitude": latitude,
            "longitude": longitude,
            "city": data.get("city", ""),
            "region": data.get("region", ""),
            "country": data.get("country", ""),
            "postal": data.get("postal", ""),
            "organization": data.get("org", ""),
            "timezone": data.get("timezone", ""),
            "geolocation_service": "ipinfo.io",
        }, ""

    except requests.RequestException as error:
        return None, f"ipinfo request failed: {error}"

    except (ValueError, TypeError, json.JSONDecodeError) as error:
        return None, f"ipinfo response could not be parsed: {error}"


def geolocate_with_ipwhois(ip: str) -> Tuple[Optional[dict], str]:
    """
    Fallback service. This is used only when ipinfo does not return a
    usable result.
    """
    try:
        response = SESSION.get(
            f"https://ipwho.is/{ip}",
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()

        if not data.get("success", False):
            return None, (
                "ipwho.is failed: "
                + str(data.get("message", "unknown response"))
            )

        latitude = data.get("latitude")
        longitude = data.get("longitude")

        if latitude is None or longitude is None:
            return None, "ipwho.is returned no coordinates"

        connection = data.get("connection") or {}
        timezone = data.get("timezone") or {}

        return {
            "latitude": float(latitude),
            "longitude": float(longitude),
            "city": data.get("city", ""),
            "region": data.get("region", ""),
            "country": data.get("country_code", ""),
            "postal": data.get("postal", ""),
            "organization": (
                connection.get("org")
                or connection.get("isp")
                or ""
            ),
            "timezone": timezone.get("id", ""),
            "geolocation_service": "ipwho.is",
        }, ""

    except requests.RequestException as error:
        return None, f"ipwho.is request failed: {error}"

    except (ValueError, TypeError, json.JSONDecodeError) as error:
        return None, f"ipwho.is response could not be parsed: {error}"


def geolocate_ip(ip: str, cache: dict) -> Tuple[Optional[dict], str]:
    if ip in cache:
        cached = cache[ip]

        if cached.get("latitude") is not None:
            result = dict(cached)
            result["geolocation_service"] = (
                cached.get("geolocation_service", "cache")
                + " (cached)"
            )
            return result, ""

    result, first_error = geolocate_with_ipinfo(ip)

    if result is not None:
        cache[ip] = result
        save_json(CACHE_FILE, cache)
        return result, ""

    result, second_error = geolocate_with_ipwhois(ip)

    if result is not None:
        cache[ip] = result
        save_json(CACHE_FILE, cache)
        return result, ""

    return None, f"{first_error}; {second_error}"


# ============================================================
# OUTPUT
# ============================================================

def build_outputs(located_records: List[dict], summary: dict) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    map_object = folium.Map(
        location=[20, 0],
        zoom_start=2,
        tiles="OpenStreetMap",
        control_scale=True,
    )

    cluster = MarkerCluster(
        name="Unique server IPs"
    ).add_to(map_object)

    features = []
    bounds = []

    for record in located_records:
        latitude = record["latitude"]
        longitude = record["longitude"]

        bounds.append([latitude, longitude])

        domains_text = ", ".join(record["domains"])
        escaped_url = html.escape(record["representative_url"])
        escaped_domains = html.escape(domains_text)
        escaped_org = html.escape(record.get("organization", ""))
        escaped_city = html.escape(record.get("city", ""))
        escaped_region = html.escape(record.get("region", ""))
        escaped_country = html.escape(record.get("country", ""))

        popup_html = f"""
        <div style="width: 330px; overflow-wrap: anywhere;">
          <strong>IP</strong><br>{html.escape(record["ip"])}<br><br>
          <strong>Approximate location</strong><br>
          {escaped_city}, {escaped_region}, {escaped_country}<br><br>
          <strong>Organization</strong><br>{escaped_org}<br><br>
          <strong>Requests in HAR</strong><br>
          {record["request_count"]}<br><br>
          <strong>Domains</strong><br>{escaped_domains}<br><br>
          <strong>Representative URL</strong><br>
          <span style="font-size: 11px;">{escaped_url}</span>
        </div>
        """

        folium.Marker(
            location=[latitude, longitude],
            popup=folium.Popup(
                popup_html,
                max_width=390,
            ),
            tooltip=(
                f'{record["ip"]} · '
                f'{record["request_count"]} requests'
            ),
            icon=folium.Icon(
                color="blue",
                icon="info-sign",
            ),
        ).add_to(cluster)

        features.append(
            {
                "type": "Feature",
                "properties": {
                    "ip": record["ip"],
                    "representative_url": (
                        record["representative_url"]
                    ),
                    "domains": record["domains"],
                    "domain_count": len(record["domains"]),
                    "request_count": record["request_count"],
                    "city": record.get("city", ""),
                    "region": record.get("region", ""),
                    "country": record.get("country", ""),
                    "postal": record.get("postal", ""),
                    "organization": record.get(
                        "organization",
                        "",
                    ),
                    "timezone": record.get("timezone", ""),
                    "geolocation_service": record.get(
                        "geolocation_service",
                        "",
                    ),
                    "source_har": HAR_FILE.name,
                    "source_site": "The Metropolitan Museum of Art",
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [longitude, latitude],
                },
            }
        )

    if bounds:
        map_object.fit_bounds(bounds)

    title_html = f"""
    <div style="
        position: fixed;
        top: 16px;
        left: 50px;
        z-index: 9999;
        width: 360px;
        padding: 14px 16px;
        background: rgba(255,255,255,0.94);
        border: 1px solid #111;
        font-family: Arial, sans-serif;
        font-size: 13px;
        line-height: 1.35;
    ">
      <strong style="font-size:16px;">
        The Museum Is Not One Place
      </strong><br>
      Unique server IPs encountered while loading
      The Met website.<br><br>
      <strong>{summary["located_ip_count"]}</strong>
      geolocated IPs from
      <strong>{summary["total_request_count"]}</strong>
      HAR requests.
    </div>
    """

    map_object.get_root().html.add_child(
        folium.Element(title_html)
    )

    geojson_data = {
        "type": "FeatureCollection",
        "name": "the_met_har_server_locations",
        "metadata": summary,
        "features": features,
    }

    map_object.save(OUTPUT_MAP)
    save_json(OUTPUT_GEOJSON, geojson_data)
    save_json(OUTPUT_SUMMARY, summary)

    print()
    print("OUTPUTS")
    print("=" * 62)
    print(f"Map:     {OUTPUT_MAP}")
    print(f"GeoJSON: {OUTPUT_GEOJSON}")
    print(f"Summary: {OUTPUT_SUMMARY}")
    print(f"Features written: {len(features)}")


# ============================================================
# MAIN
# ============================================================

def main() -> None:
    entries = load_har_entries(HAR_FILE)
    domains = validate_har(entries)
    ip_records = extract_ip_records(entries)

    print()
    print("IP EXTRACTION")
    print("=" * 62)
    print(f"Unique public server IPs: {len(ip_records)}")
    print(f"Maximum to process: {MAX_IPS}")

    selected_records = ip_records[:MAX_IPS]
    cache = load_json(CACHE_FILE, {})

    located_records = []
    failures = []

    print()
    print("GEOLOCATION")
    print("=" * 62)

    for index, record in enumerate(
        selected_records,
        start=1,
    ):
        ip = record["ip"]
        location, error = geolocate_ip(ip, cache)

        if location is not None:
            located_record = dict(record)
            located_record.update(location)
            located_records.append(located_record)

            print(
                f"[{index:>2}/{len(selected_records)}] "
                f"OK   {ip:<39} "
                f'{location.get("city", "")}, '
                f'{location.get("country", "")}'
            )
        else:
            failures.append(
                {
                    "ip": ip,
                    "error": error,
                }
            )

            print(
                f"[{index:>2}/{len(selected_records)}] "
                f"FAIL {ip}\n"
                f"     {error}"
            )

        time.sleep(REQUEST_DELAY_SECONDS)

    print()
    print("RUN RESULT")
    print("=" * 62)
    print(f"Successfully located: {len(located_records)}")
    print(f"Failed to locate:      {len(failures)}")

    if not located_records:
        raise RuntimeError(
            "\nNo IP locations were returned.\n"
            "The HAR was validated correctly, so this is a network "
            "or IP-geolocation-service problem.\n"
            "Review the FAIL messages above. If they mention "
            "127.0.0.1:7890, fully quit the proxy application and "
            "run this script again."
        )

    summary = {
        "source_har": HAR_FILE.name,
        "source_site": "The Metropolitan Museum of Art",
        "total_request_count": len(entries),
        "unique_domain_count": len(domains),
        "unique_public_ip_count": len(ip_records),
        "attempted_ip_count": len(selected_records),
        "located_ip_count": len(located_records),
        "failed_ip_count": len(failures),
        "top_domains": [
            {
                "domain": domain,
                "request_count": count,
            }
            for domain, count in domains.most_common(15)
        ],
        "failures": failures,
    }

    build_outputs(located_records, summary)


if __name__ == "__main__":
    main()
