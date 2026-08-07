"""Build the Sixth Avenue outdoor POPS analysis and web-map datasets."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pandas as pd


PROJECT_DIR = Path(__file__).resolve().parents[1]
RAW_PATH = PROJECT_DIR / "data" / "raw" / "pops_raw.csv"
PROCESSED_DIR = PROJECT_DIR / "data" / "processed"
WEB_DATA_DIR = PROJECT_DIR / "web" / "data"


def parse_plaza_area(value: str) -> float:
    """Sum only size components whose label contains 'plaza'."""
    total = 0.0
    for segment in str(value or "").split(";"):
        match = re.search(r"(.+?)\s+([\d,.]+)\s*sf\s*$", segment.strip(), re.I)
        if match and "plaza" in match.group(1).lower():
            total += float(match.group(2).replace(",", ""))
    return round(total, 2)


def amenity_list(value: str) -> list[str]:
    excluded = {"", "none", "other required"}
    amenities = {
        item.strip()
        for item in str(value or "").split(";")
        if item.strip().lower() not in excluded
    }
    return sorted(amenities)


def amenity_level(count: int) -> str:
    if count <= 3:
        return "Limited"
    if count <= 7:
        return "Moderate"
    return "Extensive"


def build() -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)

    raw = pd.read_csv(RAW_PATH, dtype=str, keep_default_na=False)
    raw["latitude"] = pd.to_numeric(raw["latitude"], errors="coerce")
    raw["longitude"] = pd.to_numeric(raw["longitude"], errors="coerce")
    raw["year"] = pd.to_numeric(raw["year_completed"], errors="coerce").astype("Int64")

    type_text = raw["public_space_type"].str.lower()
    corridor = raw[
        raw["borough_name"].eq("Manhattan")
        & raw["street_name"].str.contains(
            r"SIXTH AVENUE|AVENUE OF THE AMERICAS", case=False, regex=True
        )
        & raw["latitude"].between(40.752, 40.767)
        & type_text.str.contains("plaza", na=False)
        & ~type_text.str.contains(r"covered|enclosed|interior", regex=True, na=False)
    ].copy()

    corridor["address"] = corridor["building_address_with_zip"].str.split(",").str[0]
    corridor["plaza_area_sf"] = corridor["size_required"].map(parse_plaza_area)
    corridor["amenities"] = corridor["amenities_required"].map(amenity_list)
    corridor["amenity_count"] = corridor["amenities"].map(len)
    corridor["amenity_level"] = corridor["amenity_count"].map(amenity_level)
    corridor["has_seating"] = corridor["amenities"].map(lambda x: "Seating" in x)
    corridor["has_tables"] = corridor["amenities"].map(lambda x: "Tables" in x)
    corridor["has_landscape"] = corridor["amenities"].map(
        lambda x: any(a in x for a in ["Planting", "Trees on Street", "Trees within Space"])
    )
    corridor["has_lighting"] = corridor["amenities"].map(lambda x: "Lighting" in x)
    corridor["has_signage"] = corridor["amenities"].map(lambda x: "Plaque/Sign" in x)
    corridor["has_litter"] = corridor["amenities"].map(
        lambda x: "Litter Receptacles" in x
    )
    corridor["has_water"] = corridor["amenities"].map(
        lambda x: any(a in x for a in ["Drinking Fountain", "Water Feature"])
    )
    corridor["has_24h_access"] = corridor["hour_of_access_required"].str.contains(
        "24 Hours", case=False, na=False
    )
    score_columns = [
        "has_seating",
        "has_tables",
        "has_landscape",
        "has_lighting",
        "has_signage",
        "has_litter",
        "has_water",
    ]
    corridor["provision_score"] = (
        corridor[score_columns].sum(axis=1) / len(score_columns) * 100
    ).round().astype(int)
    corridor["score_band"] = pd.cut(
        corridor["provision_score"],
        bins=[-1, 42, 70, 100],
        labels=["Limited", "Moderate", "Extensive"],
    ).astype(str)
    corridor["image_path"] = corridor["pops_number"].map(
        lambda value: (
            f"images/{value}.jpg"
            if (PROJECT_DIR / "web" / "images" / f"{value}.jpg").exists()
            else "images/plaza-placeholder.svg"
        )
    )
    corridor["accessibility"] = corridor["physically_disabled"].replace(
        {"Full/Partial": "Full or partial", "None": "None documented", "": "Unknown"}
    )
    corridor["era"] = corridor["year"].map(
        lambda y: f"{int(y) // 10 * 10}s" if pd.notna(y) else "Unknown"
    )

    corridor = corridor.sort_values(["latitude", "address"]).reset_index(drop=True)
    corridor["corridor_order"] = range(1, len(corridor) + 1)

    # Keep every other Manhattan POPS as geographic context. The 15 corridor
    # developments are excluded here because they are drawn by the scored layer.
    corridor_ids = set(corridor["pops_number"])
    manhattan_context = raw[
        raw["borough_name"].eq("Manhattan")
        & raw["latitude"].notna()
        & raw["longitude"].notna()
        & ~raw["pops_number"].isin(corridor_ids)
    ].copy()

    output_columns = [
        "pops_number",
        "corridor_order",
        "address",
        "building_name",
        "year",
        "era",
        "public_space_type",
        "plaza_area_sf",
        "hour_of_access_required",
        "has_24h_access",
        "accessibility",
        "amenity_count",
        "amenity_level",
        "has_seating",
        "has_tables",
        "has_landscape",
        "has_lighting",
        "has_signage",
        "has_litter",
        "has_water",
        "provision_score",
        "score_band",
        "image_path",
        "amenities_required",
        "other_required",
        "permitted_amenities",
        "latitude",
        "longitude",
    ]
    corridor[output_columns].to_csv(
        PROCESSED_DIR / "sixth_avenue_outdoor_pops.csv", index=False
    )

    image_checklist = corridor[
        ["pops_number", "address", "building_name", "latitude", "longitude"]
    ].copy()
    image_checklist["required_filename"] = image_checklist["pops_number"].map(
        lambda value: f"{value}.jpg"
    )
    image_checklist["imagery_date"] = ""
    image_checklist["source_url"] = ""
    image_checklist["caption"] = ""
    image_checklist.to_csv(
        PROJECT_DIR / "data" / "manual" / "streetview_image_checklist.csv",
        index=False,
    )

    features = []
    for _, row in corridor.iterrows():
        properties = {}
        for column in output_columns:
            if column in {"latitude", "longitude"}:
                continue
            value = row[column]
            if pd.isna(value):
                value = None
            elif hasattr(value, "item"):
                value = value.item()
            properties[column] = value

        features.append(
            {
                "type": "Feature",
                "id": row["pops_number"],
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(row["longitude"]), float(row["latitude"])],
                },
                "properties": properties,
            }
        )

    context_features = []
    for _, row in manhattan_context.iterrows():
        context_features.append(
            {
                "type": "Feature",
                "id": row["pops_number"],
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(row["longitude"]), float(row["latitude"])],
                },
                "properties": {
                    "pops_number": row["pops_number"],
                    "address": row["building_address_with_zip"].split(",")[0],
                    "building_name": row["building_name"],
                    "public_space_type": row["public_space_type"],
                },
            }
        )

    # Fit an oriented analytical envelope around the selected corridor points.
    latitudes = corridor["latitude"]
    longitudes = corridor["longitude"]
    slope = latitudes.cov(longitudes) / latitudes.var()
    intercept = longitudes.mean() - slope * latitudes.mean()
    residuals = longitudes - (slope * latitudes + intercept)
    south = float(latitudes.min() - 0.0006)
    north = float(latitudes.max() + 0.0006)
    west_offset = float(residuals.min() - 0.00045)
    east_offset = float(residuals.max() + 0.00045)

    def corridor_edge(latitude: float, offset: float) -> list[float]:
        return [float(slope * latitude + intercept + offset), latitude]

    boundary_coordinates = [
        corridor_edge(south, west_offset),
        corridor_edge(south, east_offset),
        corridor_edge(north, east_offset),
        corridor_edge(north, west_offset),
        corridor_edge(south, west_offset),
    ]

    context_geojson = {
        "type": "FeatureCollection",
        "metadata": {
            "title": "Other Manhattan Privately Owned Public Spaces",
            "source": "NYC Department of City Planning, Privately Owned Public Spaces (POPS), dataset rvih-nhyn, downloaded 2026-08-06.",
            "context_count": len(context_features),
            "total_manhattan_count": len(context_features) + len(features),
        },
        "features": context_features,
    }

    boundary_geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "name": "Sixth Avenue study area",
                    "note": "Analytical envelope around the 15 selected developments; not an official administrative boundary.",
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [boundary_coordinates],
                },
            }
        ],
    }

    total_area = int(round(corridor["plaza_area_sf"].sum()))
    summary = {
        "development_count": int(len(corridor)),
        "total_documented_plaza_area_sf": total_area,
        "zero_required_amenities": int((corridor["amenity_count"] == 0).sum()),
        "seating_required": int(corridor["has_seating"].sum()),
        "tables_required": int(corridor["has_tables"].sum()),
        "landscape_required": int(corridor["has_landscape"].sum()),
        "lighting_required": int(corridor["has_lighting"].sum()),
        "signage_required": int(corridor["has_signage"].sum()),
        "water_required": int(corridor["has_water"].sum()),
        "twenty_four_hour_access": int(corridor["has_24h_access"].sum()),
        "median_required_amenities": float(corridor["amenity_count"].median()),
        "median_provision_score": int(corridor["provision_score"].median()),
        "largest_plaza": corridor.loc[corridor["plaza_area_sf"].idxmax(), "address"],
        "largest_plaza_area_sf": int(corridor["plaza_area_sf"].max()),
        "limited_count": int(corridor["score_band"].eq("Limited").sum()),
        "moderate_count": int(corridor["score_band"].eq("Moderate").sum()),
        "extensive_count": int(corridor["score_band"].eq("Extensive").sum()),
        "year_min": int(corridor["year"].min()),
        "year_max": int(corridor["year"].max()),
    }

    geojson = {
        "type": "FeatureCollection",
        "metadata": {
            "title": "Outdoor POPS along Sixth Avenue",
            "study_area": "Sixth Avenue corridor, approximately West 42nd to West 57th Streets",
            "selection_rule": "Manhattan developments on Sixth Avenue containing an outdoor plaza type; covered, enclosed, and interior-only types excluded.",
            "source": "NYC Department of City Planning, Privately Owned Public Spaces (POPS), dataset rvih-nhyn, downloaded 2026-08-06.",
            "source_url": "https://data.cityofnewyork.us/resource/rvih-nhyn",
            "method_note": "Counts describe legally documented required amenities at each development, not present-day condition or user experience.",
            "summary": summary,
        },
        "features": features,
    }

    with (PROCESSED_DIR / "sixth_avenue_outdoor_pops.geojson").open(
        "w", encoding="utf-8"
    ) as file:
        json.dump(geojson, file, indent=2, ensure_ascii=False)

    with (WEB_DATA_DIR / "sixth_avenue_outdoor_pops.geojson").open(
        "w", encoding="utf-8"
    ) as file:
        json.dump(geojson, file, indent=2, ensure_ascii=False)

    with (PROCESSED_DIR / "manhattan_pops_context.geojson").open(
        "w", encoding="utf-8"
    ) as file:
        json.dump(context_geojson, file, indent=2, ensure_ascii=False)

    with (WEB_DATA_DIR / "manhattan_pops_context.geojson").open(
        "w", encoding="utf-8"
    ) as file:
        json.dump(context_geojson, file, indent=2, ensure_ascii=False)

    with (PROCESSED_DIR / "study_area_boundary.geojson").open(
        "w", encoding="utf-8"
    ) as file:
        json.dump(boundary_geojson, file, indent=2, ensure_ascii=False)

    with (WEB_DATA_DIR / "study_area_boundary.geojson").open(
        "w", encoding="utf-8"
    ) as file:
        json.dump(boundary_geojson, file, indent=2, ensure_ascii=False)

    # A JavaScript copy lets the presentation work when index.html is opened
    # directly from the filesystem, where browsers block fetch() of local files.
    with (WEB_DATA_DIR / "pops-data.js").open("w", encoding="utf-8") as file:
        file.write("window.POPS_DATA = ")
        json.dump(geojson, file, ensure_ascii=False)
        file.write(";\nwindow.MANHATTAN_POPS_DATA = ")
        json.dump(context_geojson, file, ensure_ascii=False)
        file.write(";\nwindow.STUDY_AREA_BOUNDARY = ")
        json.dump(boundary_geojson, file, ensure_ascii=False)
        file.write(";\n")

    with (PROCESSED_DIR / "summary.json").open("w", encoding="utf-8") as file:
        json.dump(summary, file, indent=2)

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    build()
