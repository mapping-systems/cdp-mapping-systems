import csv
import json
import os
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


BASE_DIR = Path(__file__).parent
CSV_PATH = BASE_DIR / "data.csv"
OUTPUT_PATH = BASE_DIR / "resolved_places.json"
CACHE_PATH = BASE_DIR / "nominatim_cache.json"

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = os.environ.get(
    "NOMINATIM_USER_AGENT",
    "cdp-mapping-systems-assignment-2/1.0 (educational geocoding exercise)",
)
CONTACT_EMAIL = os.environ.get("NOMINATIM_EMAIL")
REQUEST_INTERVAL_SECONDS = 1.1


def write_json(path, data):
    """Write JSON atomically so an interrupted run does not corrupt the file."""
    temporary_path = path.with_suffix(path.suffix + ".tmp")
    temporary_path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    temporary_path.replace(path)


def load_cache():
    if not CACHE_PATH.exists():
        return {}

    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as error:
        raise RuntimeError(f"Could not read {CACHE_PATH.name}: {error}") from error


def load_places():
    with CSV_PATH.open(newline="", encoding="utf-8-sig") as csv_file:
        return [
            {"title": row["Title"].strip(), "url": row["URL"].strip()}
            for row in csv.DictReader(csv_file)
            if row.get("Title", "").strip() and row.get("URL", "").strip()
        ]


def search_nominatim(title):
    parameters = {
        "q": title,
        "format": "jsonv2",
        "limit": 1,
        "addressdetails": 1,
    }
    if CONTACT_EMAIL:
        parameters["email"] = CONTACT_EMAIL

    request = Request(
        f"{NOMINATIM_URL}?{urlencode(parameters)}",
        headers={"User-Agent": USER_AGENT},
    )
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def make_output_record(item, candidates, error=None):
    record = {
        "name": item["title"],
        "url": item["url"],
        "latitude": None,
        "longitude": None,
        "match_status": "not_found",
        "geocoding_source": "OpenStreetMap contributors",
    }

    if error:
        record["match_status"] = "error"
        record["error"] = error
    elif candidates:
        result = candidates[0]
        record.update(
            {
                "latitude": float(result["lat"]),
                "longitude": float(result["lon"]),
                "match_status": "top_result",
                "osm_display_name": result.get("display_name"),
                "osm_type": result.get("type"),
                "osm_id": result.get("osm_id"),
            }
        )

    return record


def main():
    places = load_places()
    cache = load_cache()
    output = []
    last_request_time = None

    for index, item in enumerate(places, start=1):
        title = item["title"]

        if title in cache:
            candidates = cache[title]
            output.append(make_output_record(item, candidates))
            print(f"[{index}/{len(places)}] cached: {title}")
            continue

        if last_request_time is not None:
            elapsed = time.monotonic() - last_request_time
            time.sleep(max(0, REQUEST_INTERVAL_SECONDS - elapsed))

        try:
            candidates = search_nominatim(title)
            last_request_time = time.monotonic()

            # Cache every successful response, including an empty result.
            cache[title] = candidates
            write_json(CACHE_PATH, cache)
            output.append(make_output_record(item, candidates))
            status = "found" if candidates else "not found"
            print(f"[{index}/{len(places)}] {status}: {title}")
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            last_request_time = time.monotonic()
            output.append(make_output_record(item, [], str(error)))
            print(f"[{index}/{len(places)}] error: {title}: {error}")

        # Checkpoint progress so stopping the script does not lose completed work.
        write_json(OUTPUT_PATH, output)

    write_json(OUTPUT_PATH, output)
    print(f"\nSaved {len(output)} places to {OUTPUT_PATH.name}")
    print("Data attribution: © OpenStreetMap contributors (https://www.openstreetmap.org/copyright)")


if __name__ == "__main__":
    main()
