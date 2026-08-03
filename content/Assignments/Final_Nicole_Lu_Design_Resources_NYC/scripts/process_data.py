#!/usr/bin/env python3
"""Prepare map-ready NYC design-resource data using only Python's standard library."""

import csv
import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"

DESIGN_TERMS = {
    "architecture",
    "architectural",
    "art",
    "arts",
    "creative",
    "design",
    "drawing",
    "fashion",
    "film",
    "graphic",
    "industrial",
    "maker",
    "media",
    "museum",
    "photography",
    "printing",
    "sculpture",
    "studio",
    "technology",
    "textile",
    "visual",
}

KNOWN_DESIGN_SCHOOLS = {
    "cooper union",
    "fashion institute of technology",
    "new school",
    "parsons",
    "pratt institute",
    "school of visual arts",
}

EXPERIENCE_TERMS = {
    "architecture",
    "architectural",
    "ceramic",
    "craft",
    "decorative",
    "design",
    "drawing",
    "fashion",
    "graphic",
    "illustration",
    "industrial",
    "media art",
    "modern art",
    "photography",
    "poster",
    "printing",
    "sculpture",
    "textile",
    "typography",
    "visual art",
}

KNOWN_EXPERIENCE_RESOURCES = {
    "brooklyn museum",
    "center for architecture",
    "cooper hewitt",
    "guggenheim museum",
    "international center of photography",
    "isamu noguchi",
    "museum of arts and design",
    "museum of modern art",
    "new museum",
    "poster house",
    "queens museum",
    "sculpturecenter",
    "storefront for art and architecture",
    "the drawing center",
    "whitney museum",
}

MAKE_CRAFTS = {
    "atelier",
    "bookbinder",
    "cabinet_maker",
    "carpenter",
    "glassblower",
    "handicraft",
    "pottery",
    "printer",
    "screen_printer",
    "sculptor",
    "textile_printing",
}

MAKE_NAME_TERMS = {
    "atelier",
    "ceramic",
    "clay",
    "collective",
    "craft",
    "fab lab",
    "fabrication",
    "foundry",
    "glass",
    "lab",
    "maker",
    "pottery",
    "print",
    "sculpture",
    "screen printing",
    "textile",
    "woodwork",
    "workshop",
}

LEARN_TERMS = {
    "architecture",
    "design",
    "drawing",
    "fashion",
    "film",
    "fine arts",
    "interior",
    "media",
    "sculpture",
    "technology",
    "visual arts",
}

CONNECT_TERMS = {
    "architecture",
    "art",
    "arts",
    "civic",
    "creative",
    "design",
    "graphic",
    "internet art",
    "media",
    "public space",
}

ORGANIZATION_TERMS = {
    "association",
    "club",
    "collective",
    "council",
    "foundation",
    "institute",
    "league",
    "society",
    "trust",
}

NAME_ALIASES = {
    "center for architecture inc": "center for architecture",
    "cooper hewitt national design museum": "cooper hewitt",
    "cooper hewitt smithsonian design museum": "cooper hewitt",
    "drawing center inc": "drawing center",
    "museum of arts design": "museum of arts and design",
    "sculpture center inc": "sculpturecenter",
    "sculpture center": "sculpturecenter",
    "the cooper union": "cooper union",
    "the drawing center": "drawing center",
    "new museum of contemporary art": "new museum",
    "kentler international drawing space inc": "kentler international drawing space",
}

EXCLUDED_NAMES = {
    "abc cooperation",
    "bowne house historical society inc",
    "crown heights north association inc",
    "hamilton grange national memorial",
    "hetrick martin institute",
    "historic aircraft restoration project hangar b",
    "intrepid museum",
    "riseboro community partnership",
    "town hall civic association of springfield gardens",
}


def normalize_name(value):
    normalized = re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()
    return NAME_ALIASES.get(normalized, normalized)


def contains_design_term(text):
    words = set(normalize_name(text).split())
    return bool(words & DESIGN_TERMS) or any(
        school in normalize_name(text) for school in KNOWN_DESIGN_SCHOOLS
    )


def contains_phrase(text, phrases):
    normalized = normalize_name(text)
    return any(normalize_name(phrase) in normalized for phrase in phrases)


def point_in_ring(point, ring):
    x, y = point
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        intersects = (yi > y) != (yj > y) and x < (
            (xj - xi) * (y - yi) / ((yj - yi) or 1e-15) + xi
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def point_in_geometry(point, geometry):
    coordinates = geometry["coordinates"]
    polygons = [coordinates] if geometry["type"] == "Polygon" else coordinates
    for polygon in polygons:
        if point_in_ring(point, polygon[0]) and not any(
            point_in_ring(point, hole) for hole in polygon[1:]
        ):
            return True
    return False


def neighborhood_for(point, neighborhoods):
    for feature in neighborhoods:
        if point_in_geometry(point, feature["geometry"]):
            props = feature["properties"]
            return {
                "nta_code": props.get("nta2020", ""),
                "neighborhood": props.get("ntaname", ""),
                "borough": props.get("boroname", ""),
            }
    return {"nta_code": "", "neighborhood": "", "borough": ""}


def osm_category(tags):
    name = tags.get("name", "")
    searchable = " ".join(
        str(tags.get(key, ""))
        for key in ("name", "description", "operator", "subject", "craft")
    )
    design_related = contains_design_term(searchable)
    normalized_name = normalize_name(name)

    if tags.get("makerspace") == "yes":
        return "make", "OpenStreetMap makerspace tag"
    if tags.get("craft") in MAKE_CRAFTS and (
        contains_phrase(name, MAKE_NAME_TERMS)
        or tags.get("shop") in {"craft", "art", "fabric", "sewing", "pottery"}
    ):
        return "make", "Named making space with a relevant craft tag"
    if (
        tags.get("community_centre")
        or tags.get("club") == "art"
        or tags.get("office") == "association"
    ) and contains_phrase(searchable, CONNECT_TERMS):
        return "connect", "Design-related community or association"
    if (
        tags.get("tourism") in {"museum", "gallery"}
        or tags.get("amenity") == "arts_centre"
    ) and (
        contains_phrase(searchable, EXPERIENCE_TERMS)
        or contains_phrase(name, KNOWN_EXPERIENCE_RESOURCES)
    ):
        return "experience", "Design-focused museum, gallery, or arts center"
    if tags.get("amenity") in {"college", "university"} and (
        contains_phrase(name, LEARN_TERMS)
        or any(school in normalized_name for school in KNOWN_DESIGN_SCHOOLS)
    ):
        if any(
            phrase in normalized_name
            for phrase in ("president s house", "academic building", "arnold hall")
        ):
            return "", "Campus building rather than a separate learning resource"
        return "learn", "Design-related college or university"
    if tags.get("amenity") == "library" and contains_phrase(name, LEARN_TERMS):
        return "learn", "Design-related library"
    return "", "Requires manual review"


def load_neighborhoods():
    with (RAW / "nyc-2020-neighborhood-tabulation-areas.geojson").open() as file:
        return json.load(file)["features"]


def osm_records(neighborhoods):
    with (RAW / "osm-design-resource-candidates.json").open() as file:
        elements = json.load(file)["elements"]

    accepted = []
    review = []
    for element in elements:
        tags = element.get("tags", {})
        name = tags.get("name", "").strip()
        location = element if "lat" in element else element.get("center", {})
        if not name or "lat" not in location or "lon" not in location:
            continue

        category, reason = osm_category(tags)
        record = {
            "name": name,
            "category": category,
            "longitude": float(location["lon"]),
            "latitude": float(location["lat"]),
            "website": tags.get("website", tags.get("contact:website", "")),
            "address": " ".join(
                part
                for part in (
                    tags.get("addr:housenumber", ""),
                    tags.get("addr:street", ""),
                )
                if part
            ),
            "source": "OpenStreetMap",
            "source_id": f'{element["type"]}/{element["id"]}',
            "reason": reason,
        }
        review.append(record)
        if category:
            record.update(
                neighborhood_for(
                    (record["longitude"], record["latitude"]), neighborhoods
                )
            )
            accepted.append(record)
    return accepted, review


def dcla_records(neighborhoods):
    accepted = []
    review = []
    with (RAW / "dcla-cultural-organizations.csv").open(
        newline="", encoding="utf-8-sig"
    ) as file:
        for index, row in enumerate(csv.DictReader(file), start=2):
            name = (row.get("Organization Name") or "").strip()
            discipline = (row.get("Discipline") or "").strip()
            try:
                latitude = float(row.get("Latitude") or "")
                longitude = float(row.get("Longitude") or "")
            except ValueError:
                continue

            category = ""
            reason = "Requires manual review"
            if discipline == "Architecture/Design":
                if contains_phrase(name, ORGANIZATION_TERMS):
                    category = "connect"
                    reason = "DCLA Architecture/Design professional organization"
                else:
                    category = "experience"
                    reason = "DCLA Architecture/Design discipline"
            elif discipline in {"Visual Arts", "Museum", "Photography", "New Media"} and (
                contains_phrase(name, EXPERIENCE_TERMS)
                or contains_phrase(name, KNOWN_EXPERIENCE_RESOURCES)
            ):
                category = "experience"
                reason = f"Design-related name in DCLA {discipline} discipline"

            record = {
                "name": name,
                "category": category,
                "longitude": longitude,
                "latitude": latitude,
                "website": "",
                "address": ", ".join(
                    part
                    for part in (
                        row.get("Address", "").strip(),
                        row.get("City", "").strip(),
                        row.get("Postcode", "").strip(),
                    )
                    if part
                ),
                "source": "NYC DCLA",
                "source_id": f"dcla-row-{index}",
                "reason": reason,
            }
            review.append(record)
            if category:
                record.update(neighborhood_for((longitude, latitude), neighborhoods))
                accepted.append(record)
    return accepted, review


def deduplicate(records):
    result = {}
    for record in records:
        key = normalize_name(record["name"])
        if not key or key in EXCLUDED_NAMES:
            continue
        existing = result.get(key)
        if existing is None or (
            existing["source"] == "NYC DCLA" and record["source"] == "OpenStreetMap"
        ):
            result[key] = record
    return sorted(result.values(), key=lambda item: item["name"].lower())


def write_neighborhood_analysis(neighborhoods, records):
    counts_by_nta = {}
    for record in records:
        nta_code = record.get("nta_code", "")
        if not nta_code:
            continue
        neighborhood_counts = counts_by_nta.setdefault(
            nta_code,
            {"total": 0, "learn": 0, "experience": 0, "make": 0, "connect": 0},
        )
        neighborhood_counts["total"] += 1
        neighborhood_counts[record["category"]] += 1

    neighborhood_total = len(neighborhoods)
    city_average = len(records) / neighborhood_total if neighborhood_total else 0
    analyzed_features = []
    for feature in neighborhoods:
        properties = feature["properties"]
        nta_code = properties.get("nta2020", "")
        counts = counts_by_nta.get(
            nta_code,
            {"total": 0, "learn": 0, "experience": 0, "make": 0, "connect": 0},
        )
        total = counts["total"]
        difference = total - city_average
        if total == 0:
            comparison = "No documented resources"
        elif difference > 0:
            comparison = f"{difference:.1f} above the neighborhood average"
        else:
            comparison = f"{abs(difference):.1f} below the neighborhood average"

        analyzed_features.append(
            {
                "type": "Feature",
                "geometry": feature["geometry"],
                "properties": {
                    "nta_code": nta_code,
                    "neighborhood": properties.get("ntaname", ""),
                    "borough": properties.get("boroname", ""),
                    "resource_total": total,
                    "learn_count": counts["learn"],
                    "experience_count": counts["experience"],
                    "make_count": counts["make"],
                    "connect_count": counts["connect"],
                    "city_share_pct": round(
                        (total / len(records) * 100) if records else 0, 2
                    ),
                    "city_average": round(city_average, 2),
                    "difference_from_average": round(difference, 2),
                    "comparison": comparison,
                },
            }
        )

    populated = sum(
        1
        for feature in analyzed_features
        if feature["properties"]["resource_total"] > 0
    )
    output = {
        "type": "FeatureCollection",
        "analysis": {
            "resource_total": len(records),
            "neighborhood_total": neighborhood_total,
            "neighborhoods_with_resources": populated,
            "neighborhoods_without_resources": neighborhood_total - populated,
            "city_average": round(city_average, 2),
            "maximum_count": max(
                (
                    feature["properties"]["resource_total"]
                    for feature in analyzed_features
                ),
                default=0,
            ),
        },
        "features": analyzed_features,
    }
    with (PROCESSED / "neighborhood-resource-analysis.geojson").open("w") as file:
        json.dump(output, file)


def write_outputs(neighborhoods, records, review):
    PROCESSED.mkdir(parents=True, exist_ok=True)
    features = [
        {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [record["longitude"], record["latitude"]],
            },
            "properties": {
                key: value
                for key, value in record.items()
                if key not in {"longitude", "latitude"}
            },
        }
        for record in records
    ]
    with (PROCESSED / "design-resources.geojson").open("w") as file:
        json.dump({"type": "FeatureCollection", "features": features}, file)

    fields = [
        "include",
        "name",
        "suggested_category",
        "longitude",
        "latitude",
        "address",
        "website",
        "source",
        "source_id",
        "reason",
    ]
    with (PROCESSED / "resource-review.csv").open(
        "w", newline="", encoding="utf-8"
    ) as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        for record in sorted(review, key=lambda item: item["name"].lower()):
            row = {key: record.get(key, "") for key in fields}
            row["include"] = "yes" if record["category"] else ""
            row["suggested_category"] = record["category"]
            writer.writerow(row)

    counts = Counter(record["category"] for record in records)
    with (PROCESSED / "summary.json").open("w") as file:
        json.dump({"total": len(records), "categories": counts}, file, indent=2)
    write_neighborhood_analysis(neighborhoods, records)


def main():
    neighborhoods = load_neighborhoods()
    osm, osm_review = osm_records(neighborhoods)
    dcla, dcla_review = dcla_records(neighborhoods)
    records = deduplicate(osm + dcla)
    write_outputs(neighborhoods, records, osm_review + dcla_review)
    counts = Counter(record["category"] for record in records)
    print(f"Exported {len(records)} resources: {dict(counts)}")


if __name__ == "__main__":
    main()
