"""Relate six privacy-safe personal places to NTA, rent, and subway data."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parent
REQUIRED_FIELDS = [
    "place_id",
    "label",
    "category",
    "period",
    "narrative_note",
    "privacy_level",
]
FORBIDDEN_FIELDS = {"address", "street_address", "apartment", "unit", "raw_address"}
ALLOWED_PRIVACY = {"neighborhood", "intersection", "public_site"}
PROJECTED_CRS = "EPSG:2263"


def display_path(value: Path) -> str:
    try:
        return str(value.resolve().relative_to(PROJECT))
    except ValueError:
        return str(value.resolve())


def choose_one_match(frame: gpd.GeoDataFrame, tie_breaker: str) -> gpd.GeoDataFrame:
    """Resolve exact-distance or overlapping-boundary ties deterministically."""
    return (
        frame.sort_values(["place_id", tie_breaker], kind="stable")
        .drop_duplicates("place_id", keep="first")
        .reset_index(drop=True)
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=ROOT / "inputs/personal_places.geojson")
    parser.add_argument("--output", type=Path, default=ROOT / "outputs/personal_places_enriched.geojson")
    parser.add_argument("--audit", type=Path, default=ROOT / "outputs/geoprocessing_audit.json")
    return parser.parse_args()


def validate_places(places: gpd.GeoDataFrame) -> None:
    if len(places) != 6:
        raise ValueError(f"Expected exactly 6 personal places; found {len(places)}")
    missing = [field for field in REQUIRED_FIELDS if field not in places.columns]
    if missing:
        raise ValueError(f"Missing required fields: {missing}")
    forbidden = sorted(FORBIDDEN_FIELDS.intersection(places.columns))
    if forbidden:
        raise ValueError(f"Remove precise-address fields before processing: {forbidden}")
    if places.geometry.isna().any() or not places.geom_type.eq("Point").all():
        raise ValueError("Every place must have a Point geometry")
    if places[REQUIRED_FIELDS].isna().any().any():
        raise ValueError("Required properties may not be blank")
    if places.place_id.duplicated().any():
        raise ValueError("place_id values must be unique")
    if not set(places.privacy_level).issubset(ALLOWED_PRIVACY):
        raise ValueError(f"privacy_level must be one of {sorted(ALLOWED_PRIVACY)}")
    text_blob = places[REQUIRED_FIELDS].astype(str).agg(" ".join, axis=1)
    if text_blob.str.contains(r"\[.*\]", regex=True).any():
        raise ValueError("Replace all bracketed template text")


def main() -> None:
    args = parse_args()
    if not args.input.exists():
        raise FileNotFoundError(
            f"Personal input is required: {args.input}. Copy inputs/personal_places.template.geojson, "
            "add six privacy-safe Manhattan points and narratives, then save it as personal_places.geojson."
        )

    places = gpd.read_file(args.input)
    if places.crs is None:
        raise ValueError("Input must declare EPSG:4326 / CRS84")
    places = places.to_crs("EPSG:4326")
    validate_places(places)

    nta = gpd.read_file(PROJECT / "data/reference/manhattan_nta.geojson").to_crs(PROJECTED_CRS)
    rent = gpd.read_file(PROJECT / "data/processed/manhattan_rent_growth_points.geojson").to_crs(PROJECTED_CRS)
    subway = gpd.read_file(PROJECT / "data/reference/subway_stations.geojson").to_crs(PROJECTED_CRS)
    manhattan = nta.dissolve()
    places_projected = places.to_crs(PROJECTED_CRS)
    outside = ~places_projected.geometry.within(manhattan.geometry.iloc[0])
    if outside.any():
        ids = places_projected.loc[outside, "place_id"].tolist()
        raise ValueError(f"All places must fall within Manhattan NTA coverage; outside: {ids}")

    # Point-in-polygon relation: which official NTA contains each place?
    with_nta = gpd.sjoin(
        places_projected,
        nta[["name", "nta2020", "geometry"]].rename(columns={"name": "nta_name"}),
        how="left",
        predicate="within",
    ).drop(columns=["index_right"])
    with_nta = choose_one_match(with_nta, "nta2020")

    # Nearest StreetEasy reporting-area representative point.
    rent_fields = rent[
        [
            "area_id",
            "area_name",
            "baseline_rent_usd",
            "latest_rent_usd",
            "rent_change_usd",
            "growth_pct",
            "geometry",
        ]
    ].rename(columns={"area_id": "rent_area_id", "area_name": "rent_area_name"})
    with_rent = gpd.sjoin_nearest(
        with_nta,
        rent_fields,
        how="left",
        distance_col="rent_area_point_distance_ft",
    ).drop(columns=["index_right"])
    with_rent = choose_one_match(with_rent, "rent_area_id")

    # Nearest station entrance / stop point in the same projected CRS.
    station_fields = subway[["stop_id", "name", "routes", "geometry"]].rename(
        columns={"name": "nearest_subway_station", "routes": "subway_routes"}
    )
    enriched = gpd.sjoin_nearest(
        with_rent,
        station_fields,
        how="left",
        distance_col="subway_distance_ft",
    ).drop(columns=["index_right"])
    enriched = choose_one_match(enriched, "stop_id")
    enriched["rent_area_point_distance_m"] = enriched.rent_area_point_distance_ft * 0.3048
    enriched["subway_distance_m"] = enriched.subway_distance_ft * 0.3048
    enriched["analysis_crs"] = PROJECTED_CRS
    enriched["rent_relation"] = "nearest StreetEasy reporting-area representative point"
    enriched["subway_relation"] = "nearest station point by projected straight-line distance"

    output_fields = REQUIRED_FIELDS + [
        "nta_name",
        "nta2020",
        "rent_area_id",
        "rent_area_name",
        "baseline_rent_usd",
        "latest_rent_usd",
        "rent_change_usd",
        "growth_pct",
        "rent_area_point_distance_m",
        "nearest_subway_station",
        "stop_id",
        "subway_routes",
        "subway_distance_m",
        "analysis_crs",
        "rent_relation",
        "subway_relation",
        "geometry",
    ]
    enriched = enriched[output_fields].sort_values("place_id").to_crs("EPSG:4326")
    if len(enriched) != len(places) or not enriched.place_id.is_unique:
        raise RuntimeError("Geoprocessing must return exactly one row per personal place")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    enriched.to_file(args.output, driver="GeoJSON")

    audit = {
        "status": "complete",
        "input": display_path(args.input),
        "output": display_path(args.output),
        "input_features": len(places),
        "output_features": len(enriched),
        "input_crs": "EPSG:4326",
        "analysis_crs": PROJECTED_CRS,
        "output_crs": "EPSG:4326",
        "unique_place_ids": bool(enriched.place_id.is_unique),
        "missing_nta": int(enriched.nta_name.isna().sum()),
        "missing_rent_area": int(enriched.rent_area_name.isna().sum()),
        "missing_subway": int(enriched.nearest_subway_station.isna().sum()),
        "min_subway_distance_m": round(float(enriched.subway_distance_m.min()), 1),
        "max_subway_distance_m": round(float(enriched.subway_distance_m.max()), 1),
        "privacy_check": "No forbidden address fields; accepted precision labels only",
    }
    args.audit.write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(audit, indent=2))


if __name__ == "__main__":
    main()
