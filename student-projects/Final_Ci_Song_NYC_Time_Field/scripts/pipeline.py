from __future__ import annotations

import csv
import hashlib
import heapq
import io
import json
import math
import time
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import geopandas as gpd
import h3
import networkx as nx
import numpy as np
import osmnx as ox
import pandas as pd
import requests
from scipy.spatial import cKDTree
from shapely.geometry import Polygon, mapping


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
CACHE = ROOT / "data" / "cache"
PUBLIC = ROOT / "public" / "data"

NTA_URL = (
    "https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/"
    "NTA2020_with_LATFOR/FeatureServer/11/query"
    "?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson"
)
GTFS_URL = "https://web.mta.info/developers/data/nyct/subway/google_transit.zip"
ENTRANCES_URL = "https://data.ny.gov/resource/i9wp-a4ja.csv?$limit=50000"
PLUTO_ENDPOINT = "https://data.cityofnewyork.us/resource/64uk-42ks.csv"
ACS_TABLE_BASE_URL = (
    "https://www2.census.gov/programs-surveys/acs/summary_file/2024/"
    "table-based-SF/data/5YRData"
)
ACS_BLOCK_GROUP_RENT_URL = f"{ACS_TABLE_BASE_URL}/acsdt5y2024-b25064.dat"
ACS_BLOCK_GROUP_TENURE_URL = f"{ACS_TABLE_BASE_URL}/acsdt5y2024-b25003.dat"
TIGER_BLOCK_GROUP_NY_URL = (
    "https://www2.census.gov/geo/tiger/TIGER2024/BG/tl_2024_36_bg.zip"
)
NYC_COUNTY_FIPS = {"005", "047", "061", "081", "085"}
SOURCE_URLS = {
    "nta": NTA_URL,
    "gtfs": GTFS_URL,
    "entrances": ENTRANCES_URL,
    "pluto": PLUTO_ENDPOINT,
    "acs_block_group_rent": ACS_BLOCK_GROUP_RENT_URL,
    "acs_block_group_tenure": ACS_BLOCK_GROUP_TENURE_URL,
    "tiger_block_groups": TIGER_BLOCK_GROUP_NY_URL,
}

H3_RESOLUTION = 9
WALK_SPEED_M_PER_MIN = 80.0
WALK_DETOUR_FACTOR = 1.18
ACCESS_CANDIDATES = 4
ACCESS_CUTOFF_MIN = 20.0
WALK_LINK_CUTOFF_M = 3_200.0
CELL_NEIGHBOR_CANDIDATES = 12
OSM_BOUNDARY_BUFFER_M = 650.0
MIN_WALK_COMPONENT_NODES = 50
MIN_DRIVE_COMPONENT_NODES = 50
DRIVE_CELL_NEIGHBOR_CANDIDATES = 18
DRIVE_LINK_CUTOFF_SECONDS = 15 * 60
DRIVE_CONNECTOR_SPEED_M_PER_MIN = 300.0
ENTRY_OVERHEAD_MIN = 2.0
EXIT_OVERHEAD_MIN = 1.0
TRANSFER_OVERHEAD_MIN = 3.0
UNREACHABLE = 65535

SCENARIOS = {
    "weekday_am": {
        "label": "Weekday AM peak",
        "service_ids": ["Weekday"],
        "start": 7 * 3600,
        "end": 10 * 3600,
    },
    "weekday_midday": {
        "label": "Weekday midday",
        "service_ids": ["Weekday"],
        "start": 11 * 3600,
        "end": 14 * 3600,
    },
    "weekend": {
        "label": "Weekend",
        "service_ids": ["Saturday", "Sunday"],
        "start": 10 * 3600,
        "end": 13 * 3600,
    },
}


def ensure_directories() -> None:
    for directory in (RAW, CACHE, PUBLIC):
        directory.mkdir(parents=True, exist_ok=True)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download(url: str, target: Path, force: bool = False) -> Path:
    if target.exists() and target.stat().st_size > 0 and not force:
        return target
    response = requests.get(url, timeout=180)
    response.raise_for_status()
    target.write_bytes(response.content)
    return target


def fetch_pluto_residential(force: bool = False) -> Path:
    target = RAW / "pluto_residential.csv"
    if target.exists() and target.stat().st_size > 1_000_000 and not force:
        return target

    query = {
        "$select": "unitsres,latitude,longitude",
        "$where": "unitsres > 0 and latitude is not null and longitude is not null",
        "$order": ":id",
        "$limit": 50000,
    }
    offset = 0
    first_page = True
    with target.open("w", newline="", encoding="utf-8") as output:
        while True:
            query["$offset"] = offset
            response = requests.get(PLUTO_ENDPOINT, params=query, timeout=180)
            response.raise_for_status()
            rows = list(csv.DictReader(io.StringIO(response.text)))
            if not rows:
                break
            writer = csv.DictWriter(
                output,
                fieldnames=["unitsres", "latitude", "longitude"],
            )
            if first_page:
                writer.writeheader()
                first_page = False
            writer.writerows(rows)
            offset += len(rows)
            if len(rows) < query["$limit"]:
                break
    return target


def fetch_rent_sources(force: bool = False) -> dict[str, Path]:
    return {
        "acs_block_group_rent": download(
            ACS_BLOCK_GROUP_RENT_URL,
            RAW / "acsdt5y2024-b25064.dat",
            force,
        ),
        "acs_block_group_tenure": download(
            ACS_BLOCK_GROUP_TENURE_URL,
            RAW / "acsdt5y2024-b25003.dat",
            force,
        ),
        "tiger_block_groups": download(
            TIGER_BLOCK_GROUP_NY_URL,
            RAW / "tl_2024_36_bg.zip",
            force,
        ),
    }


def fetch_sources(force: bool = False, include_pluto: bool = True) -> dict:
    ensure_directories()
    paths = {
        "nta": download(NTA_URL, RAW / "nta2020.geojson", force),
        "gtfs": download(GTFS_URL, RAW / "google_transit.zip", force),
        "entrances": download(ENTRANCES_URL, RAW / "subway_entrances.csv", force),
    }
    if include_pluto:
        paths["pluto"] = fetch_pluto_residential(force)
    paths.update(fetch_rent_sources(force))

    existing_manifest_path = RAW / "source_manifest.json"
    existing_sources = {}
    if existing_manifest_path.exists():
        existing_sources = json.loads(
            existing_manifest_path.read_text()
        ).get("sources", {})
        existing_sources.pop("acs_rent", None)
    metadata = {
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "sources": {
            key: {
                "path": str(path.relative_to(ROOT)),
                "sha256": sha256(path),
                "bytes": path.stat().st_size,
                **({"url": SOURCE_URLS[key]} if key in SOURCE_URLS else {}),
            }
            for key, path in paths.items()
        },
    }
    for key, value in existing_sources.items():
        metadata["sources"].setdefault(key, value)
    (RAW / "source_manifest.json").write_text(
        json.dumps(metadata, indent=2),
        encoding="utf-8",
    )
    return metadata


def _polygon_for_cell(cell_id: str) -> Polygon:
    return Polygon([(lng, lat) for lat, lng in h3.cell_to_boundary(cell_id)])


def build_h3_grid() -> gpd.GeoDataFrame:
    ensure_directories()
    nta = gpd.read_file(RAW / "nta2020.geojson").to_crs(4326)
    nta = nta[nta.geometry.notna() & ~nta.geometry.is_empty].copy()
    nta["geometry"] = nta.geometry.make_valid()

    cell_ids: set[str] = set()
    for geom in nta.geometry:
        if geom.geom_type == "Polygon":
            cell_ids.update(h3.geo_to_cells(mapping(geom), H3_RESOLUTION))
        elif geom.geom_type == "MultiPolygon":
            for polygon in geom.geoms:
                cell_ids.update(h3.geo_to_cells(mapping(polygon), H3_RESOLUTION))

    sorted_cells = sorted(cell_ids)
    cells = gpd.GeoDataFrame(
        {"cell_id": sorted_cells},
        geometry=[_polygon_for_cell(cell_id) for cell_id in sorted_cells],
        crs=4326,
    )
    projected_centers = cells.to_crs(32618).geometry.centroid
    center_geometry = gpd.GeoSeries(projected_centers, crs=32618).to_crs(4326)
    cell_points = cells.copy()
    cell_points["geometry"] = center_geometry.values
    nta_fields = ["NTA2020", "NTAName", "BoroName", "NTAType", "geometry"]
    joined = gpd.sjoin(cell_points, nta[nta_fields], how="left", predicate="within")
    joined = joined[~joined.index.duplicated(keep="first")]
    cells["nta_id"] = joined["NTA2020"].reindex(cells.index).fillna("UNASSIGNED").values
    cells["nta_name"] = joined["NTAName"].reindex(cells.index).fillna("Outside NTA").values
    cells["borough"] = joined["BoroName"].reindex(cells.index).fillna("Unknown").values
    cells["nta_type"] = joined["NTAType"].reindex(cells.index).fillna("0").astype(str).values

    pluto_path = RAW / "pluto_residential.csv"
    if pluto_path.exists():
        pluto = pd.read_csv(
            pluto_path,
            dtype={"unitsres": "float64", "latitude": "float64", "longitude": "float64"},
        ).dropna()
        pluto["unitsres"] = pluto["unitsres"].clip(lower=0)
        pluto["cell_id"] = [
            h3.latlng_to_cell(lat, lng, H3_RESOLUTION)
            for lat, lng in zip(pluto["latitude"], pluto["longitude"])
        ]
        units = pluto.groupby("cell_id", observed=True)["unitsres"].sum()
        cells["housing_units"] = cells["cell_id"].map(units).fillna(0).round().astype(int)
    else:
        cells["housing_units"] = 1

    cells["cell_index"] = np.arange(len(cells), dtype=int)
    centroids = center_geometry
    cells["center_lng"] = centroids.x.round(6)
    cells["center_lat"] = centroids.y.round(6)
    cells.to_file(CACHE / "cells.geojson", driver="GeoJSON")

    public_cells = cells[
        [
            "cell_index",
            "cell_id",
            "nta_id",
            "nta_name",
            "borough",
            "housing_units",
            "geometry",
        ]
    ].copy()
    public_cells.to_file(PUBLIC / "cells.geojson", driver="GeoJSON")

    nta_projected = nta.to_crs(32618)
    nta_projected["geometry"] = nta_projected.geometry.simplify(
        tolerance=18,
        preserve_topology=True,
    )
    public_nta = nta_projected.to_crs(4326)[
        ["NTA2020", "NTAName", "BoroName", "NTAType", "geometry"]
    ].rename(
        columns={
            "NTA2020": "nta_id",
            "NTAName": "nta_name",
            "BoroName": "borough",
            "NTAType": "nta_type",
        }
    )
    public_nta.to_file(PUBLIC / "neighborhoods.geojson", driver="GeoJSON")
    return cells


def build_rent_data() -> dict:
    """Allocate official ACS rent estimates to residential H3 cells.

    ACS block groups are the smallest published geography for this measure.
    Residential MapPLUTO lots are joined to their containing block group and
    weighted by UnitsRes inside each H3 cell. Missing block-group estimates use
    the official containing tract estimate, then the borough estimate. This
    keeps complete citywide coverage without inventing a smoothed rent surface.
    """
    rent = pd.read_csv(
        RAW / "acsdt5y2024-b25064.dat",
        sep="|",
        dtype={"GEO_ID": "string"},
    ).rename(
        columns={
            "B25064_E001": "median_gross_rent",
            "B25064_M001": "median_gross_rent_moe",
        }
    )
    tenure = pd.read_csv(
        RAW / "acsdt5y2024-b25003.dat",
        sep="|",
        dtype={"GEO_ID": "string"},
        usecols=["GEO_ID", "B25003_E003", "B25003_M003"],
    ).rename(
        columns={
            "B25003_E003": "renter_occupied_units",
            "B25003_M003": "renter_occupied_units_moe",
        }
    )
    all_rent = rent.merge(tenure, on="GEO_ID", validate="one_to_one")
    for field in (
        "median_gross_rent",
        "median_gross_rent_moe",
        "renter_occupied_units",
        "renter_occupied_units_moe",
    ):
        all_rent[field] = pd.to_numeric(
            all_rent[field],
            errors="coerce",
        )

    def valid_estimate(
        frame: pd.DataFrame,
        rent_field: str,
        moe_field: str,
        renter_field: str,
    ) -> pd.Series:
        return (
            frame[rent_field].between(250, 10_000)
            & frame[moe_field].between(0, 10_000)
            & (frame[renter_field] > 0)
        )

    county_pattern = r"(?:005|047|061|081|085)"
    block_group_pattern = rf"^1500000US36{county_pattern}\d{{7}}$"
    tract_pattern = rf"^1400000US36{county_pattern}\d{{6}}$"
    borough_pattern = rf"^0500000US36{county_pattern}$"

    block_group_data = all_rent[
        all_rent["GEO_ID"].str.match(block_group_pattern, na=False)
    ].copy()
    block_group_data["GEOID"] = block_group_data[
        "GEO_ID"
    ].str.removeprefix("1500000US")
    block_group_data["tract_geoid"] = block_group_data["GEOID"].str[:11]
    block_group_data["county_geoid"] = block_group_data["GEOID"].str[:5]

    tract_data = all_rent[
        all_rent["GEO_ID"].str.match(tract_pattern, na=False)
    ].copy()
    tract_data["tract_geoid"] = tract_data[
        "GEO_ID"
    ].str.removeprefix("1400000US")
    tract_data = tract_data[
        [
            "tract_geoid",
            "median_gross_rent",
            "median_gross_rent_moe",
            "renter_occupied_units",
        ]
    ].rename(
        columns={
            "median_gross_rent": "tract_rent",
            "median_gross_rent_moe": "tract_rent_moe",
            "renter_occupied_units": "tract_renter_units",
        }
    )

    borough_data = all_rent[
        all_rent["GEO_ID"].str.match(borough_pattern, na=False)
    ].copy()
    borough_data["county_geoid"] = borough_data[
        "GEO_ID"
    ].str.removeprefix("0500000US")
    borough_data = borough_data[
        [
            "county_geoid",
            "median_gross_rent",
            "median_gross_rent_moe",
            "renter_occupied_units",
        ]
    ].rename(
        columns={
            "median_gross_rent": "borough_rent",
            "median_gross_rent_moe": "borough_rent_moe",
            "renter_occupied_units": "borough_renter_units",
        }
    )

    city_row = all_rent[
        all_rent["GEO_ID"] == "1600000US3651000"
    ].iloc[0]
    if not (
        250 <= city_row["median_gross_rent"] <= 10_000
        and 0 <= city_row["median_gross_rent_moe"] <= 10_000
    ):
        raise AssertionError("NYC ACS gross-rent fallback is invalid.")

    block_group_data = (
        block_group_data.merge(
            tract_data,
            on="tract_geoid",
            how="left",
            validate="many_to_one",
        )
        .merge(
            borough_data,
            on="county_geoid",
            how="left",
            validate="many_to_one",
        )
    )
    block_group_valid = valid_estimate(
        block_group_data,
        "median_gross_rent",
        "median_gross_rent_moe",
        "renter_occupied_units",
    )
    tract_valid = valid_estimate(
        block_group_data,
        "tract_rent",
        "tract_rent_moe",
        "tract_renter_units",
    )
    borough_valid = valid_estimate(
        block_group_data,
        "borough_rent",
        "borough_rent_moe",
        "borough_renter_units",
    )
    block_group_data["rent_source_level"] = np.select(
        [block_group_valid, tract_valid, borough_valid],
        ["block_group", "tract", "borough"],
        default="city",
    )
    block_group_data["rent_source_geoid"] = np.select(
        [block_group_valid, tract_valid, borough_valid],
        [
            block_group_data["GEOID"],
            block_group_data["tract_geoid"],
            block_group_data["county_geoid"],
        ],
        default="3651000",
    )
    block_group_data["rent_source_value"] = np.select(
        [block_group_valid, tract_valid, borough_valid],
        [
            block_group_data["median_gross_rent"],
            block_group_data["tract_rent"],
            block_group_data["borough_rent"],
        ],
        default=float(city_row["median_gross_rent"]),
    )
    block_group_data["rent_source_moe"] = np.select(
        [block_group_valid, tract_valid, borough_valid],
        [
            block_group_data["median_gross_rent_moe"],
            block_group_data["tract_rent_moe"],
            block_group_data["borough_rent_moe"],
        ],
        default=float(city_row["median_gross_rent_moe"]),
    )

    tiger = gpd.read_file(RAW / "tl_2024_36_bg.zip").to_crs(4326)
    tiger = tiger[
        tiger["COUNTYFP"].astype(str).str.zfill(3).isin(NYC_COUNTY_FIPS)
        & tiger.geometry.notna()
        & ~tiger.geometry.is_empty
    ][["GEOID", "geometry"]].copy()
    tiger["GEOID"] = tiger["GEOID"].astype(str)
    tiger["geometry"] = tiger.geometry.make_valid()
    block_groups = tiger.merge(
        block_group_data[
            [
                "GEOID",
                "rent_source_level",
                "rent_source_geoid",
                "rent_source_value",
                "rent_source_moe",
            ]
        ],
        on="GEOID",
        how="left",
        validate="one_to_one",
    )
    if len(block_groups) < 6_500:
        raise AssertionError(
            f"Unexpectedly sparse NYC block-group geography: {len(block_groups):,}"
        )

    cells = gpd.read_file(CACHE / "cells.geojson").sort_values("cell_index")
    cells = cells.drop(
        columns=[
            "avg_gross_rent",
            "rent_cash_units",
            "rent_estimate",
            "rent_estimate_moe",
            "rent_bg_geoid",
            "rent_support_count",
            "rent_bar_height_m",
            "rent_percentile",
            "rent_source_level",
            "rent_primary_source",
            "rent_source_geoid",
            "rent_source_count",
            "rent_coverage_share",
        ],
        errors="ignore",
    )
    pluto = pd.read_csv(
        RAW / "pluto_residential.csv",
        dtype={
            "unitsres": "float64",
            "latitude": "float64",
            "longitude": "float64",
        },
    ).dropna()
    pluto = pluto[pluto["unitsres"] > 0].copy()
    pluto["cell_id"] = [
        h3.latlng_to_cell(lat, lng, H3_RESOLUTION)
        for lat, lng in zip(pluto["latitude"], pluto["longitude"])
    ]
    pluto = pluto[pluto["cell_id"].isin(set(cells["cell_id"]))].copy()
    lot_points = gpd.GeoDataFrame(
        pluto,
        geometry=gpd.points_from_xy(pluto["longitude"], pluto["latitude"]),
        crs=4326,
    )
    lot_sources = gpd.sjoin(
        lot_points,
        block_groups[
            [
                "GEOID",
                "rent_source_level",
                "rent_source_geoid",
                "rent_source_value",
                "rent_source_moe",
                "geometry",
            ]
        ],
        how="left",
        predicate="within",
    )
    lot_sources = lot_sources[
        ~lot_sources.index.duplicated(keep="first")
    ].copy()

    borough_fips = {
        "Bronx": "36005",
        "Brooklyn": "36047",
        "Manhattan": "36061",
        "Queens": "36081",
        "Staten Island": "36085",
    }
    cell_borough = cells.set_index("cell_id")["borough"]
    lot_sources["borough"] = lot_sources["cell_id"].map(cell_borough)
    borough_lookup = borough_data.set_index("county_geoid")
    unmatched = lot_sources["rent_source_value"].isna()
    unmatched_count = int(unmatched.sum())
    if unmatched_count:
        fallback_geoid = lot_sources.loc[unmatched, "borough"].map(
            borough_fips
        )
        lot_sources.loc[unmatched, "rent_source_level"] = "borough"
        lot_sources.loc[unmatched, "rent_source_geoid"] = fallback_geoid
        lot_sources.loc[unmatched, "rent_source_value"] = fallback_geoid.map(
            borough_lookup["borough_rent"]
        )
        lot_sources.loc[unmatched, "rent_source_moe"] = fallback_geoid.map(
            borough_lookup["borough_rent_moe"]
        )
    if lot_sources["rent_source_value"].isna().any():
        raise AssertionError("Some residential lots have no ACS rent source.")

    cell_sources = (
        lot_sources.groupby(
            [
                "cell_id",
                "rent_source_level",
                "rent_source_geoid",
                "rent_source_value",
                "rent_source_moe",
            ],
            observed=True,
            dropna=False,
        )
        .agg(
            source_units=("unitsres", "sum"),
            source_lots=("unitsres", "size"),
        )
        .reset_index()
    )
    cell_sources["weighted_rent"] = (
        cell_sources["rent_source_value"] * cell_sources["source_units"]
    )
    cell_sources["weighted_moe_sq"] = np.square(
        cell_sources["rent_source_moe"] * cell_sources["source_units"]
    )
    cell_rent = cell_sources.groupby("cell_id", observed=True).agg(
        rent_source_units=("source_units", "sum"),
        rent_source_lots=("source_lots", "sum"),
        weighted_rent=("weighted_rent", "sum"),
        weighted_moe_sq=("weighted_moe_sq", "sum"),
        rent_source_count=("rent_source_geoid", "nunique"),
    )
    cell_rent["rent_estimate"] = (
        cell_rent["weighted_rent"] / cell_rent["rent_source_units"]
    )
    cell_rent["rent_estimate_moe"] = (
        np.sqrt(cell_rent["weighted_moe_sq"])
        / cell_rent["rent_source_units"]
    )

    level_units = cell_sources.pivot_table(
        index="cell_id",
        columns="rent_source_level",
        values="source_units",
        aggfunc="sum",
        fill_value=0,
    ).reindex(columns=["block_group", "tract", "borough", "city"], fill_value=0)
    cell_rent = cell_rent.join(level_units)
    cell_rent["rent_primary_source"] = level_units.idxmax(axis=1)
    source_level_count = (level_units > 0).sum(axis=1)
    cell_rent["rent_source_level"] = np.where(
        source_level_count == 1,
        cell_rent["rent_primary_source"],
        "mixed",
    )
    dominant_source = (
        cell_sources.sort_values(
            ["cell_id", "source_units"],
            ascending=[True, False],
        )
        .drop_duplicates("cell_id")
        .set_index("cell_id")["rent_source_geoid"]
    )
    cell_rent["rent_source_geoid"] = dominant_source

    for field in (
        "rent_estimate",
        "rent_estimate_moe",
        "rent_source_units",
        "rent_source_count",
        "rent_source_level",
        "rent_primary_source",
        "rent_source_geoid",
    ):
        cells[field] = cells["cell_id"].map(cell_rent[field])
    cells["rent_coverage_share"] = (
        cells["rent_source_units"] / cells["housing_units"].replace(0, np.nan)
    ).clip(upper=1)
    cells["rent_estimate"] = cells["rent_estimate"].round(1)
    cells["rent_estimate_moe"] = cells["rent_estimate_moe"].round(1)
    cells["rent_source_count"] = (
        cells["rent_source_count"].fillna(0).astype(int)
    )
    cells["rent_coverage_share"] = cells["rent_coverage_share"].round(4)

    residential_mask = cells["housing_units"] > 0
    residential_values = cells.loc[residential_mask, "rent_estimate"]
    if residential_values.isna().any():
        raise AssertionError("Every residential H3 cell must have a rent value.")
    cells["rent_percentile"] = (
        cells.loc[residential_mask, "rent_estimate"]
        .rank(method="average", pct=True)
        .round(4)
    )
    dense_rent_rank = cells.loc[
        residential_mask,
        "rent_estimate",
    ].rank(method="dense")
    unique_rent_count = int(residential_values.nunique())
    normalized_rent_rank = (
        (dense_rent_rank - 1) / max(1, unique_rent_count - 1)
    )
    cells.loc[residential_mask, "rent_bar_height_m"] = (
        50 + 2_600 * np.power(normalized_rent_rank, 1.15)
    ).round(1)
    cells.to_file(CACHE / "cells.geojson", driver="GeoJSON")
    public_cells = cells[
        [
            "cell_index",
            "cell_id",
            "nta_id",
            "nta_name",
            "borough",
            "housing_units",
            "rent_estimate",
            "rent_estimate_moe",
            "rent_percentile",
            "rent_bar_height_m",
            "rent_source_level",
            "rent_primary_source",
            "rent_source_geoid",
            "rent_source_count",
            "rent_coverage_share",
            "geometry",
        ]
    ].copy()
    public_cells.to_file(PUBLIC / "cells.geojson", driver="GeoJSON")

    residential = cells[
        (cells["housing_units"] > 0) & cells["rent_estimate"].notna()
    ].copy()
    rent_values = residential["rent_estimate"].astype(float)
    nta_rent = (
        residential.groupby("nta_id", observed=True)
        .apply(
            lambda group: pd.Series(
                {
                    "rent_estimate": np.average(
                        group["rent_estimate"],
                        weights=group["housing_units"],
                    ),
                    "rent_estimate_moe": np.average(
                        group["rent_estimate_moe"],
                        weights=group["housing_units"],
                    ),
                }
            ),
            include_groups=False,
        )
    )
    neighborhoods = gpd.read_file(PUBLIC / "neighborhoods.geojson")
    neighborhoods = neighborhoods.drop(
        columns=["avg_gross_rent", "rent_cash_units"],
        errors="ignore",
    )
    neighborhoods["rent_estimate"] = neighborhoods["nta_id"].map(
        nta_rent["rent_estimate"]
    )
    neighborhoods["rent_estimate_moe"] = neighborhoods["nta_id"].map(
        nta_rent["rent_estimate_moe"]
    )
    neighborhoods.to_file(PUBLIC / "neighborhoods.geojson", driver="GeoJSON")

    rent_table = residential[
        [
            "cell_index",
            "cell_id",
            "borough",
            "nta_id",
            "nta_name",
            "housing_units",
            "rent_estimate",
            "rent_estimate_moe",
            "rent_percentile",
            "rent_bar_height_m",
            "rent_source_level",
            "rent_primary_source",
            "rent_source_geoid",
            "rent_source_count",
            "rent_coverage_share",
        ]
    ].copy()
    rent_table = rent_table.rename(
        columns={
            "rent_estimate": "median_gross_rent_usd",
            "rent_estimate_moe": "margin_of_error_usd",
            "rent_bar_height_m": "bar_height_m",
            "rent_source_level": "source_level",
            "rent_primary_source": "primary_source_level",
            "rent_source_geoid": "dominant_source_geoid",
            "rent_source_count": "source_geography_count",
            "rent_coverage_share": "source_unit_coverage_share",
        }
    )
    rent_table["lower_bound_90_usd"] = (
        rent_table["median_gross_rent_usd"]
        - rent_table["margin_of_error_usd"]
    ).clip(lower=0).round(1)
    rent_table["upper_bound_90_usd"] = (
        rent_table["median_gross_rent_usd"]
        + rent_table["margin_of_error_usd"]
    ).round(1)
    rent_table.to_csv(PUBLIC / "rent-by-cell.csv", index=False)

    source_units = (
        cell_sources.groupby("rent_source_level")["source_units"].sum()
    )
    source_unit_shares = {
        level: round(float(units / source_units.sum()), 4)
        for level, units in source_units.items()
    }
    rent_values = residential["rent_estimate"].astype(float)
    report = {
        "source": "U.S. Census Bureau 2020–2024 ACS five-year detailed tables",
        "measure": (
            "H3-level housing-unit-weighted allocation of official median "
            "monthly gross rent (B25064_001E). MapPLUTO residential lots use "
            "their containing ACS block-group estimate; missing block-group "
            "values fall back to the official tract, borough, then city value. "
            "Gross rent includes tenant-paid utilities. Values remain ACS "
            "survey estimates, not asking rents or individual leases."
        ),
        "geography": (
            "2024 Census block groups allocated by MapPLUTO residential "
            "units to H3 resolution 9"
        ),
        "acs_period": "2020–2024",
        "source_hierarchy": ["block_group", "tract", "borough", "city"],
        "block_groups_with_direct_estimate": int(block_group_valid.sum()),
        "block_groups_with_estimate": int(len(block_groups)),
        "source_unit_shares": source_unit_shares,
        "unmatched_pluto_lots_using_borough": unmatched_count,
        "residential_cells_with_estimate": int(len(residential)),
        "residential_cells_missing_estimate": int(
            ((cells["housing_units"] > 0) & cells["rent_estimate"].isna()).sum()
        ),
        "unique_cell_estimates": int(residential["rent_estimate"].nunique()),
        "unique_bar_heights": int(residential["rent_bar_height_m"].nunique()),
        "rent_table_rows": int(len(rent_table)),
            "rent_table_asset": "rent-by-cell.csv",
        "residential_unit_coverage": round(
            float(
                residential["rent_source_units"].sum()
                / residential["housing_units"].sum()
            ),
            6,
        ),
        "city_reference_gross_rent": round(
            np.average(
                residential["rent_estimate"],
                weights=residential["housing_units"],
            )
        ),
        "median_margin_of_error": round(
            float(residential["rent_estimate_moe"].median())
        ),
        "min_gross_rent": round(float(rent_values.min())),
        "max_gross_rent": round(float(rent_values.max())),
        "height_scale_low": round(float(rent_values.quantile(0.03))),
        "height_scale_high": round(float(rent_values.quantile(0.97))),
        "bar_height_method": (
            "Monotonic dense-rank scale: every distinct rent value receives "
            "a distinct height from 50 to 2,650 display meters."
        ),
        "bar_height_min_m": round(float(residential["rent_bar_height_m"].min())),
        "bar_height_max_m": round(float(residential["rent_bar_height_m"].max())),
    }
    (CACHE / "rent_summary.json").write_text(
        json.dumps(report, indent=2),
        encoding="utf-8",
    )
    return report


def _read_gtfs_table(archive: zipfile.ZipFile, name: str) -> pd.DataFrame:
    return pd.read_csv(archive.open(name), low_memory=False)


def gtfs_seconds(value: str | float | int) -> float:
    if pd.isna(value):
        return math.nan
    hours, minutes, seconds = (int(part) for part in str(value).split(":"))
    return hours * 3600 + minutes * 60 + seconds


def haversine_m(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    radius = 6_371_008.8
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = (
        math.sin(dp / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@dataclass(frozen=True)
class TransitSource:
    stops: pd.DataFrame
    routes: pd.DataFrame
    trips: pd.DataFrame
    stop_times: pd.DataFrame
    transfers: pd.DataFrame
    feed_info: pd.DataFrame


def load_transit_source() -> TransitSource:
    with zipfile.ZipFile(RAW / "google_transit.zip") as archive:
        source = TransitSource(
            stops=_read_gtfs_table(archive, "stops.txt"),
            routes=_read_gtfs_table(archive, "routes.txt"),
            trips=_read_gtfs_table(archive, "trips.txt"),
            stop_times=_read_gtfs_table(archive, "stop_times.txt"),
            transfers=_read_gtfs_table(archive, "transfers.txt"),
            feed_info=_read_gtfs_table(archive, "feed_info.txt"),
        )
    return source


def _dijkstra(
    adjacency: list[list[tuple[int, float]]],
    initial: Iterable[tuple[int, float]],
) -> list[float]:
    distance = [math.inf] * len(adjacency)
    queue: list[tuple[float, int]] = []
    for node, value in initial:
        if value < distance[node]:
            distance[node] = value
            heapq.heappush(queue, (value, node))
    while queue:
        current, node = heapq.heappop(queue)
        if current != distance[node]:
            continue
        for neighbor, weight in adjacency[node]:
            candidate = current + weight
            if candidate < distance[neighbor]:
                distance[neighbor] = candidate
                heapq.heappush(queue, (candidate, neighbor))
    return distance


def _prepare_stop_times(
    source: TransitSource,
) -> tuple[pd.DataFrame, dict, pd.DataFrame]:
    stops = source.stops.copy()
    parent_stations = stops[stops["location_type"].fillna(0) == 1].copy()
    parent_stations = parent_stations.sort_values("stop_id").reset_index(drop=True)
    parent_stations["station_index"] = np.arange(len(parent_stations), dtype=int)
    parent_lookup = parent_stations.set_index("stop_id")["station_index"].to_dict()
    stop_to_parent = {}
    for row in stops.itertuples():
        parent = row.parent_station if isinstance(row.parent_station, str) else row.stop_id
        stop_to_parent[str(row.stop_id)] = str(parent)
    stop_to_station = {
        stop_id: int(parent_lookup[parent])
        for stop_id, parent in stop_to_parent.items()
        if parent in parent_lookup
    }

    times = source.stop_times.copy()
    times["stop_id"] = times["stop_id"].astype(str)
    times["parent_station"] = times["stop_id"].map(stop_to_parent)
    times["arrival_seconds"] = times["arrival_time"].map(gtfs_seconds)
    times["departure_seconds"] = times["departure_time"].map(gtfs_seconds)
    times = times.merge(
        source.trips[["trip_id", "route_id", "direction_id", "service_id"]],
        on="trip_id",
        how="left",
    )
    times["station_index"] = times["parent_station"].map(parent_lookup)
    times = times.dropna(subset=["station_index"]).copy()
    times["station_index"] = times["station_index"].astype(int)
    return times, stop_to_station, parent_stations


def _build_scenario_graph(
    source: TransitSource,
    all_times: pd.DataFrame,
    stop_to_station: dict[str, int],
    parent_stations: pd.DataFrame,
    scenario_id: str,
) -> dict:
    scenario = SCENARIOS[scenario_id]
    service_ids = scenario["service_ids"]
    service_times = all_times[all_times["service_id"].isin(service_ids)].copy()
    departures = service_times[
        (service_times["departure_seconds"] >= scenario["start"])
        & (service_times["departure_seconds"] < scenario["end"])
    ]
    active_trip_ids = set(departures["trip_id"].unique())
    active = service_times[service_times["trip_id"].isin(active_trip_ids)].copy()
    active = active.sort_values(["trip_id", "stop_sequence"])

    active["next_station"] = active.groupby("trip_id")["station_index"].shift(-1)
    active["next_arrival"] = active.groupby("trip_id")["arrival_seconds"].shift(-1)
    segments = active.dropna(subset=["next_station", "next_arrival"]).copy()
    segments["next_station"] = segments["next_station"].astype(int)
    segments["ride_minutes"] = (
        (segments["next_arrival"] - segments["departure_seconds"]) / 60
    ).clip(lower=0.25, upper=45)

    segment_summary = (
        segments.groupby(
            ["route_id", "direction_id", "station_index", "next_station"],
            observed=True,
        )["ride_minutes"]
        .median()
        .reset_index()
    )

    origin_departures = (
        departures.sort_values(["trip_id", "stop_sequence"])
        .groupby(
            ["service_id", "trip_id", "route_id", "direction_id"],
            observed=True,
        )
        .first()
        .reset_index()
    )
    headways: dict[tuple[str, int], float] = {}
    for key, frame in origin_departures.groupby(
        ["route_id", "direction_id"],
        observed=True,
    ):
        valid_diffs = []
        for _service_id, service_frame in frame.groupby("service_id", observed=True):
            values = np.sort(service_frame["departure_seconds"].to_numpy())
            diffs = np.diff(values) / 60
            valid_diffs.extend(diffs[(diffs >= 1) & (diffs <= 40)])
        headways[(str(key[0]), int(key[1]))] = float(
            np.median(valid_diffs) if valid_diffs else 10
        )

    state_keys = sorted(
        {
            (int(row.station_index), str(row.route_id), int(row.direction_id))
            for row in segment_summary.itertuples()
        }
        | {
            (int(row.next_station), str(row.route_id), int(row.direction_id))
            for row in segment_summary.itertuples()
        }
    )
    state_index = {key: index for index, key in enumerate(state_keys)}
    adjacency: list[list[tuple[int, float]]] = [[] for _ in state_keys]
    graph_edges: list[dict] = []

    for row in segment_summary.itertuples():
        source_key = (int(row.station_index), str(row.route_id), int(row.direction_id))
        target_key = (int(row.next_station), str(row.route_id), int(row.direction_id))
        source_index = state_index[source_key]
        target_index = state_index[target_key]
        weight = float(row.ride_minutes)
        adjacency[source_index].append((target_index, weight))
        graph_edges.append(
            {
                "from": source_index,
                "to": target_index,
                "minutes": round(weight, 2),
                "kind": "ride",
                "route": str(row.route_id),
                "from_station": int(row.station_index),
                "to_station": int(row.next_station),
                "ride_minutes": round(weight, 2),
                "wait_minutes": 0,
                "transfer_minutes": 0,
            }
        )

    station_states: dict[int, list[int]] = defaultdict(list)
    for index, key in enumerate(state_keys):
        station_states[key[0]].append(index)

    transfers = source.transfers.copy()
    transfers["from_station"] = (
        transfers["from_stop_id"].astype(str).map(stop_to_station)
    )
    transfers["to_station"] = transfers["to_stop_id"].astype(str).map(stop_to_station)
    transfers["transfer_minutes"] = (
        pd.to_numeric(transfers["min_transfer_time"], errors="coerce") / 60
    )
    transfers = transfers.dropna(
        subset=["from_station", "to_station", "transfer_minutes"]
    ).copy()
    transfer_rules = (
        transfers.groupby(["from_station", "to_station"], observed=True)[
            "transfer_minutes"
        ]
        .min()
        .to_dict()
    )

    transfer_candidates: dict[tuple[int, int], dict] = {}

    def add_transfer(
        source_state: int,
        target_state: int,
        transfer_minutes: float,
        explicit: bool,
    ) -> None:
        if source_state == target_state:
            return
        source_key = state_keys[source_state]
        target_key = state_keys[target_state]
        if source_key[0] == target_key[0] and source_key[1:] == target_key[1:]:
            return
        wait_minutes = headways.get((target_key[1], target_key[2]), 10) / 2
        weight = float(transfer_minutes) + wait_minutes
        edge = {
            "from": source_state,
            "to": target_state,
            "minutes": round(weight, 2),
            "kind": "transfer",
            "route": target_key[1],
            "from_station": int(source_key[0]),
            "to_station": int(target_key[0]),
            "ride_minutes": 0,
            "wait_minutes": round(wait_minutes, 2),
            "transfer_minutes": round(float(transfer_minutes), 2),
            "explicit_gtfs": explicit,
        }
        key = (source_state, target_state)
        previous = transfer_candidates.get(key)
        if previous is None or edge["minutes"] < previous["minutes"]:
            transfer_candidates[key] = edge

    for station, indexes in station_states.items():
        transfer_minutes = float(
            transfer_rules.get((station, station), TRANSFER_OVERHEAD_MIN)
        )
        explicit = (station, station) in transfer_rules
        for source_state in indexes:
            for target_state in indexes:
                add_transfer(
                    source_state,
                    target_state,
                    transfer_minutes,
                    explicit,
                )

    for (from_station, to_station), transfer_minutes in transfer_rules.items():
        from_station = int(from_station)
        to_station = int(to_station)
        if from_station == to_station:
            continue
        for source_state in station_states.get(from_station, []):
            for target_state in station_states.get(to_station, []):
                add_transfer(
                    source_state,
                    target_state,
                    float(transfer_minutes),
                    True,
                )

    for edge in transfer_candidates.values():
        adjacency[edge["from"]].append((edge["to"], edge["minutes"]))
        graph_edges.append(edge)

    station_count = len(parent_stations)
    matrix = np.full((station_count, station_count), UNREACHABLE, dtype=np.uint16)
    np.fill_diagonal(matrix, 0)
    for origin in range(station_count):
        initial = []
        for state in station_states.get(origin, []):
            key = state_keys[state]
            initial.append((state, headways.get((key[1], key[2]), 10) / 2))
        if not initial:
            continue
        state_distance = _dijkstra(adjacency, initial)
        for destination, indexes in station_states.items():
            if destination == origin:
                continue
            best = min((state_distance[index] for index in indexes), default=math.inf)
            if math.isfinite(best):
                matrix[origin, destination] = min(
                    UNREACHABLE - 1,
                    int(round(best * 10)),
                )
    (PUBLIC / f"subway-{scenario_id.replace('_', '-')}.bin").write_bytes(
        matrix.astype("<u2").tobytes()
    )

    states_json = [
        {"station": key[0], "route": key[1], "direction": key[2]}
        for key in state_keys
    ]
    (PUBLIC / f"subway-graph-{scenario_id.replace('_', '-')}.json").write_text(
        json.dumps(
            {
                "scenario": scenario_id,
                "states": states_json,
                "edges": graph_edges,
                "station_states": {
                    str(station): indexes
                    for station, indexes in station_states.items()
                },
                "headways": {
                    f"{route}:{direction}": round(value, 2)
                    for (route, direction), value in headways.items()
                },
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    station_coordinates = parent_stations.set_index("station_index")[
        ["stop_lon", "stop_lat"]
    ].to_dict("index")
    speeds = []
    for row in segment_summary.itertuples():
        if row.ride_minutes <= 0:
            continue
        a = station_coordinates[int(row.station_index)]
        b = station_coordinates[int(row.next_station)]
        distance_km = (
            haversine_m(a["stop_lon"], a["stop_lat"], b["stop_lon"], b["stop_lat"])
            / 1000
        )
        speeds.append(distance_km / (row.ride_minutes / 60))

    return {
        "scenario": scenario_id,
        "label": scenario["label"],
        "service_id": " + ".join(service_ids),
        "service_ids": service_ids,
        "window_seconds": [scenario["start"], scenario["end"]],
        "active_trip_count": len(active_trip_ids),
        "state_count": len(state_keys),
        "ride_edge_count": len(segment_summary),
        "transfer_edge_count": len(transfer_candidates),
        "explicit_transfer_rule_count": len(transfer_rules),
        "reference_speed_kmh": round(float(np.median(speeds)), 2) if speeds else 20,
        "segment_summary": segment_summary,
    }


def build_subway_network() -> list[dict]:
    ensure_directories()
    source = load_transit_source()
    all_times, stop_to_station, parent_stations = _prepare_stop_times(source)
    parent_stations["stop_id"] = parent_stations["stop_id"].astype(str)
    parent_stations["stop_name"] = parent_stations["stop_name"].astype(str)

    routes = source.routes.copy()
    routes["route_id"] = routes["route_id"].astype(str)
    route_meta = routes.set_index("route_id").to_dict("index")
    station_routes = defaultdict(set)
    service_rows = all_times[
        all_times["service_id"].isin(
            sorted(
                {
                    service_id
                    for scenario in SCENARIOS.values()
                    for service_id in scenario["service_ids"]
                }
            )
        )
    ]
    for row in service_rows[["station_index", "route_id"]].drop_duplicates().itertuples():
        station_routes[int(row.station_index)].add(str(row.route_id))

    station_features = []
    for row in parent_stations.itertuples():
        route_ids = sorted(station_routes.get(int(row.station_index), set()))
        station_features.append(
            {
                "type": "Feature",
                "properties": {
                    "station_index": int(row.station_index),
                    "stop_id": str(row.stop_id),
                    "name": str(row.stop_name),
                    "routes": " ".join(route_ids),
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(row.stop_lon), float(row.stop_lat)],
                },
            }
        )
    (PUBLIC / "stations.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": station_features}),
        encoding="utf-8",
    )

    scenario_results = []
    line_segment_keys = set()
    line_features = []
    station_xy = parent_stations.set_index("station_index")[
        ["stop_lon", "stop_lat"]
    ].to_dict("index")
    for scenario_id in SCENARIOS:
        result = _build_scenario_graph(
            source,
            all_times,
            stop_to_station,
            parent_stations,
            scenario_id,
        )
        for row in result.pop("segment_summary").itertuples():
            route_id = str(row.route_id)
            key = (
                route_id,
                int(row.direction_id),
                int(row.station_index),
                int(row.next_station),
            )
            if key in line_segment_keys:
                continue
            line_segment_keys.add(key)
            a = station_xy[int(row.station_index)]
            b = station_xy[int(row.next_station)]
            meta = route_meta.get(route_id, {})
            line_features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "route": route_id,
                        "direction": int(row.direction_id),
                        "color": f"#{meta.get('route_color', '8B8B8B')}",
                    },
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [
                            [float(a["stop_lon"]), float(a["stop_lat"])],
                            [float(b["stop_lon"]), float(b["stop_lat"])],
                        ],
                    },
                }
            )
        scenario_results.append(result)

    (PUBLIC / "subway-lines.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": line_features}),
        encoding="utf-8",
    )

    station_index = parent_stations[
        ["station_index", "stop_id", "stop_name", "stop_lat", "stop_lon"]
    ].copy()
    station_index.to_json(CACHE / "station_index.json", orient="records")
    (CACHE / "scenario_summary.json").write_text(
        json.dumps(scenario_results, indent=2),
        encoding="utf-8",
    )
    return scenario_results


def build_osmnx_graph(force: bool = False) -> Path:
    """Download and cache the five-borough pedestrian street graph."""
    ensure_directories()
    output = CACHE / "nyc-walk.graphml"
    if output.exists() and output.stat().st_size > 1_000_000 and not force:
        return output

    nta = gpd.read_file(RAW / "nta2020.geojson").to_crs(32618)
    boundary = nta.geometry.make_valid().union_all().buffer(OSM_BOUNDARY_BUFFER_M)
    boundary = (
        gpd.GeoSeries([boundary], crs=32618)
        .to_crs(4326)
        .iloc[0]
    )
    ox.settings.use_cache = True
    ox.settings.cache_folder = str(CACHE / "osmnx-cache")
    ox.settings.requests_timeout = 900
    graph = ox.graph_from_polygon(
        boundary,
        network_type="walk",
        simplify=True,
        retain_all=True,
        truncate_by_edge=True,
    )
    graph = ox.convert.to_undirected(graph)
    ox.save_graphml(graph, output)

    osm_metadata = {
        "path": str(output.relative_to(ROOT)),
        "sha256": sha256(output),
        "bytes": output.stat().st_size,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "node_count": graph.number_of_nodes(),
        "edge_count": graph.number_of_edges(),
        "network_type": "walk",
        "boundary_buffer_m": OSM_BOUNDARY_BUFFER_M,
    }
    (CACHE / "osm_walk_manifest.json").write_text(
        json.dumps(osm_metadata, indent=2),
        encoding="utf-8",
    )
    source_manifest_path = RAW / "source_manifest.json"
    source_manifest = (
        json.loads(source_manifest_path.read_text())
        if source_manifest_path.exists()
        else {"retrieved_at": osm_metadata["retrieved_at"], "sources": {}}
    )
    source_manifest.setdefault("sources", {})["osm_walk"] = osm_metadata
    source_manifest_path.write_text(
        json.dumps(source_manifest, indent=2),
        encoding="utf-8",
    )
    return output


def build_osmnx_drive_graph(force: bool = False) -> Path:
    """Download and cache the five-borough drivable street graph."""
    ensure_directories()
    output = CACHE / "nyc-drive.graphml"
    if output.exists() and output.stat().st_size > 1_000_000 and not force:
        return output

    nta = gpd.read_file(RAW / "nta2020.geojson").to_crs(32618)
    boundary = nta.geometry.make_valid().union_all().buffer(OSM_BOUNDARY_BUFFER_M)
    boundary = gpd.GeoSeries([boundary], crs=32618).to_crs(4326).iloc[0]
    ox.settings.use_cache = True
    ox.settings.cache_folder = str(CACHE / "osmnx-cache")
    ox.settings.requests_timeout = 900
    graph = ox.graph_from_polygon(
        boundary,
        network_type="drive",
        simplify=True,
        retain_all=True,
        truncate_by_edge=True,
    )
    graph = ox.routing.add_edge_speeds(graph)
    graph = ox.routing.add_edge_travel_times(graph)
    ox.save_graphml(graph, output)

    osm_metadata = {
        "path": str(output.relative_to(ROOT)),
        "sha256": sha256(output),
        "bytes": output.stat().st_size,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "node_count": graph.number_of_nodes(),
        "edge_count": graph.number_of_edges(),
        "network_type": "drive",
        "boundary_buffer_m": OSM_BOUNDARY_BUFFER_M,
    }
    (CACHE / "osm_drive_manifest.json").write_text(
        json.dumps(osm_metadata, indent=2),
        encoding="utf-8",
    )
    source_manifest_path = RAW / "source_manifest.json"
    source_manifest = (
        json.loads(source_manifest_path.read_text())
        if source_manifest_path.exists()
        else {"retrieved_at": osm_metadata["retrieved_at"], "sources": {}}
    )
    source_manifest.setdefault("sources", {})["osm_drive"] = osm_metadata
    source_manifest_path.write_text(
        json.dumps(source_manifest, indent=2),
        encoding="utf-8",
    )
    return output


def _project_points(lng: np.ndarray, lat: np.ndarray) -> np.ndarray:
    mean_lat = math.radians(40.72)
    x = (lng + 74.0) * 111_320 * math.cos(mean_lat)
    y = (lat - 40.5) * 111_320
    return np.column_stack([x, y])


def _dedupe_nearest_candidates(
    tree: cKDTree,
    source_points: np.ndarray,
    source_station_indexes: np.ndarray,
    query_point: np.ndarray,
    overhead: float,
) -> tuple[list[int], list[float]]:
    k = min(24, len(source_points))
    distances, indexes = tree.query(query_point, k=k)
    distances = np.atleast_1d(distances)
    indexes = np.atleast_1d(indexes)
    stations: list[int] = []
    minutes: list[float] = []
    seen = set()
    for distance, source_index in zip(distances, indexes):
        station = int(source_station_indexes[int(source_index)])
        if station in seen:
            continue
        walk_minutes = float(distance) * WALK_DETOUR_FACTOR / WALK_SPEED_M_PER_MIN
        if walk_minutes > ACCESS_CUTOFF_MIN:
            continue
        seen.add(station)
        stations.append(station)
        minutes.append(round(walk_minutes + overhead, 2))
        if len(stations) == ACCESS_CANDIDATES:
            break
    while len(stations) < ACCESS_CANDIDATES:
        stations.append(-1)
        minutes.append(999.0)
    return stations, minutes


def build_walk_access_approximation() -> dict:
    ensure_directories()
    cells = gpd.read_file(CACHE / "cells.geojson").sort_values("cell_index")
    stations = pd.read_json(CACHE / "station_index.json")
    station_id_to_index = stations.set_index("stop_id")["station_index"].to_dict()

    entrances = pd.read_csv(RAW / "subway_entrances.csv")
    entrances["gtfs_stop_id"] = entrances["gtfs_stop_id"].astype(str)
    entrances["station_index"] = entrances["gtfs_stop_id"].map(station_id_to_index)
    entrances = entrances.dropna(
        subset=["station_index", "entrance_latitude", "entrance_longitude"]
    ).copy()
    entrances["station_index"] = entrances["station_index"].astype(int)

    entry = entrances[
        entrances["entry_allowed"].astype(str).str.upper().eq("YES")
    ].copy()
    exit_points = entrances[
        entrances["exit_allowed"].astype(str).str.upper().eq("YES")
    ].copy()
    if entry.empty:
        entry = entrances.copy()
    if exit_points.empty:
        exit_points = entrances.copy()

    entry_xy = _project_points(
        entry["entrance_longitude"].to_numpy(),
        entry["entrance_latitude"].to_numpy(),
    )
    exit_xy = _project_points(
        exit_points["entrance_longitude"].to_numpy(),
        exit_points["entrance_latitude"].to_numpy(),
    )
    entry_tree = cKDTree(entry_xy)
    exit_tree = cKDTree(exit_xy)
    cell_xy = _project_points(
        cells["center_lng"].to_numpy(),
        cells["center_lat"].to_numpy(),
    )

    entry_stations: list[int] = []
    entry_minutes: list[float] = []
    exit_stations: list[int] = []
    exit_minutes: list[float] = []
    for point in cell_xy:
        station_ids, minutes = _dedupe_nearest_candidates(
            entry_tree,
            entry_xy,
            entry["station_index"].to_numpy(),
            point,
            ENTRY_OVERHEAD_MIN,
        )
        entry_stations.extend(station_ids)
        entry_minutes.extend(minutes)
        station_ids, minutes = _dedupe_nearest_candidates(
            exit_tree,
            exit_xy,
            exit_points["station_index"].to_numpy(),
            point,
            EXIT_OVERHEAD_MIN,
        )
        exit_stations.extend(station_ids)
        exit_minutes.extend(minutes)

    access = {
        "candidate_count": ACCESS_CANDIDATES,
        "walking_model": "geodesic_detour_v1",
        "entry_stations": entry_stations,
        "entry_minutes": entry_minutes,
        "exit_stations": exit_stations,
        "exit_minutes": exit_minutes,
    }
    (PUBLIC / "station-access.json").write_text(
        json.dumps(access, separators=(",", ":")),
        encoding="utf-8",
    )

    cell_index = dict(zip(cells["cell_id"], cells["cell_index"]))
    centers = cells.set_index("cell_id")[["center_lng", "center_lat"]].to_dict("index")
    edges = []
    for cell_id, index in cell_index.items():
        for neighbor in h3.grid_disk(cell_id, 1):
            if neighbor == cell_id or neighbor not in cell_index:
                continue
            neighbor_index = int(cell_index[neighbor])
            if neighbor_index <= int(index):
                continue
            a = centers[cell_id]
            b = centers[neighbor]
            distance = haversine_m(
                a["center_lng"],
                a["center_lat"],
                b["center_lng"],
                b["center_lat"],
            )
            minutes = distance * WALK_DETOUR_FACTOR / WALK_SPEED_M_PER_MIN
            edges.append([int(index), neighbor_index, round(minutes, 3)])
    walk_network = {
        "node_count": len(cells),
        "model": "H3 adjacency with a calibrated pedestrian detour factor",
        "edges": edges,
    }
    (PUBLIC / "walk-network.json").write_text(
        json.dumps(walk_network, separators=(",", ":")),
        encoding="utf-8",
    )
    return {
        "entrances": len(entrances),
        "entry_points": len(entry),
        "exit_points": len(exit_points),
        "walk_edges": len(edges),
    }


def _snap_points_to_graph(
    graph: nx.MultiGraph,
    longitudes: np.ndarray,
    latitudes: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    nodes = np.asarray(
        ox.distance.nearest_nodes(
            graph,
            X=longitudes,
            Y=latitudes,
        )
    )
    connector_distances = np.asarray(
        [
            haversine_m(
                float(lng),
                float(lat),
                float(graph.nodes[int(node)]["x"]),
                float(graph.nodes[int(node)]["y"]),
            )
            for node, lng, lat in zip(nodes, longitudes, latitudes)
        ]
    )
    return nodes, connector_distances


def _access_points_by_node(
    nodes: np.ndarray,
    connectors: np.ndarray,
    station_indexes: np.ndarray,
) -> dict[int, dict[int, float]]:
    grouped: dict[int, dict[int, float]] = defaultdict(dict)
    for node, connector, station in zip(nodes, connectors, station_indexes):
        node_id = int(node)
        station_id = int(station)
        previous = grouped[node_id].get(station_id, math.inf)
        grouped[node_id][station_id] = min(previous, float(connector))
    return grouped


def _best_station_candidates(
    path_lengths: dict[int, float],
    points_by_node: dict[int, dict[int, float]],
    origin_connector_m: float,
    overhead_minutes: float,
) -> tuple[list[int], list[float]]:
    best: dict[int, float] = {}
    cutoff_m = ACCESS_CUTOFF_MIN * WALK_SPEED_M_PER_MIN
    for node, stations in points_by_node.items():
        network_distance = path_lengths.get(node)
        if network_distance is None:
            continue
        for station, point_connector_m in stations.items():
            total_distance = (
                origin_connector_m + network_distance + point_connector_m
            )
            if total_distance > cutoff_m:
                continue
            best[station] = min(best.get(station, math.inf), total_distance)
    ordered = sorted(best.items(), key=lambda item: item[1])[:ACCESS_CANDIDATES]
    stations = [int(station) for station, _distance in ordered]
    minutes = [
        round(distance / WALK_SPEED_M_PER_MIN + overhead_minutes, 2)
        for _station, distance in ordered
    ]
    while len(stations) < ACCESS_CANDIDATES:
        stations.append(-1)
        minutes.append(999.0)
    return stations, minutes


def build_walk_access(force_osm: bool = False) -> dict:
    """Build station access and direct-walk assets from OSMnx shortest paths."""
    ensure_directories()
    graph_path = build_osmnx_graph(force=force_osm)
    graph = ox.load_graphml(graph_path)
    if graph.is_directed():
        graph = ox.convert.to_undirected(graph)
    raw_graph_nodes = graph.number_of_nodes()
    raw_graph_edges = graph.number_of_edges()
    usable_nodes = {
        node
        for component in nx.connected_components(graph)
        if len(component) >= MIN_WALK_COMPONENT_NODES
        for node in component
    }
    graph = graph.subgraph(usable_nodes).copy()

    cells = gpd.read_file(CACHE / "cells.geojson").sort_values("cell_index")
    stations = pd.read_json(CACHE / "station_index.json")
    station_id_to_index = stations.set_index("stop_id")["station_index"].to_dict()

    entrances = pd.read_csv(RAW / "subway_entrances.csv")
    entrances["gtfs_stop_id"] = entrances["gtfs_stop_id"].astype(str)
    entrances["station_index"] = entrances["gtfs_stop_id"].map(station_id_to_index)
    entrances = entrances.dropna(
        subset=["station_index", "entrance_latitude", "entrance_longitude"]
    ).copy()
    entrances["station_index"] = entrances["station_index"].astype(int)
    entry = entrances[
        entrances["entry_allowed"].astype(str).str.upper().eq("YES")
    ].copy()
    exit_points = entrances[
        entrances["exit_allowed"].astype(str).str.upper().eq("YES")
    ].copy()

    entry_nodes, entry_connectors = _snap_points_to_graph(
        graph,
        entry["entrance_longitude"].to_numpy(),
        entry["entrance_latitude"].to_numpy(),
    )
    exit_nodes, exit_connectors = _snap_points_to_graph(
        graph,
        exit_points["entrance_longitude"].to_numpy(),
        exit_points["entrance_latitude"].to_numpy(),
    )
    cell_nodes, cell_connectors = _snap_points_to_graph(
        graph,
        cells["center_lng"].to_numpy(),
        cells["center_lat"].to_numpy(),
    )
    entry_by_node = _access_points_by_node(
        entry_nodes,
        entry_connectors,
        entry["station_index"].to_numpy(),
    )
    exit_by_node = _access_points_by_node(
        exit_nodes,
        exit_connectors,
        exit_points["station_index"].to_numpy(),
    )

    cell_xy = _project_points(
        cells["center_lng"].to_numpy(),
        cells["center_lat"].to_numpy(),
    )
    cell_tree = cKDTree(cell_xy)
    _distances, nearest_indexes = cell_tree.query(
        cell_xy,
        k=min(CELL_NEIGHBOR_CANDIDATES + 1, len(cells)),
    )
    nearest_indexes = np.atleast_2d(nearest_indexes)
    cell_id_to_index = dict(zip(cells["cell_id"], cells["cell_index"]))
    neighbor_candidates: list[set[int]] = [set() for _ in range(len(cells))]
    for cell_index, indexes in enumerate(nearest_indexes):
        neighbor_candidates[cell_index].update(
            int(index) for index in np.atleast_1d(indexes) if int(index) != cell_index
        )
        for neighbor_id in h3.grid_disk(cells.iloc[cell_index]["cell_id"], 1):
            neighbor_index = cell_id_to_index.get(neighbor_id)
            if neighbor_index is not None and int(neighbor_index) != cell_index:
                neighbor_candidates[cell_index].add(int(neighbor_index))

    entry_stations: list[int] = []
    entry_minutes: list[float] = []
    exit_stations: list[int] = []
    exit_minutes: list[float] = []
    edge_lookup: dict[tuple[int, int], float] = {}

    for cell_index, (node, connector_m) in enumerate(
        zip(cell_nodes, cell_connectors)
    ):
        path_lengths = nx.single_source_dijkstra_path_length(
            graph,
            int(node),
            cutoff=WALK_LINK_CUTOFF_M,
            weight="length",
        )
        station_ids, minutes = _best_station_candidates(
            path_lengths,
            entry_by_node,
            float(connector_m),
            ENTRY_OVERHEAD_MIN,
        )
        entry_stations.extend(station_ids)
        entry_minutes.extend(minutes)
        station_ids, minutes = _best_station_candidates(
            path_lengths,
            exit_by_node,
            float(connector_m),
            EXIT_OVERHEAD_MIN,
        )
        exit_stations.extend(station_ids)
        exit_minutes.extend(minutes)

        for neighbor_index in neighbor_candidates[cell_index]:
            first, second = sorted((cell_index, neighbor_index))
            if (first, second) in edge_lookup:
                continue
            neighbor_node = int(cell_nodes[neighbor_index])
            network_distance = path_lengths.get(neighbor_node)
            if network_distance is None:
                continue
            total_distance = (
                float(connector_m)
                + network_distance
                + float(cell_connectors[neighbor_index])
            )
            if total_distance > WALK_LINK_CUTOFF_M:
                continue
            edge_lookup[(first, second)] = round(
                total_distance / WALK_SPEED_M_PER_MIN,
                3,
            )

        if (cell_index + 1) % 250 == 0:
            print(
                f"OSM walking access: {cell_index + 1:,}/{len(cells):,} cells",
                flush=True,
            )

    access = {
        "candidate_count": ACCESS_CANDIDATES,
        "walking_model": "osmnx_shortest_path_v1",
        "entry_stations": entry_stations,
        "entry_minutes": entry_minutes,
        "exit_stations": exit_stations,
        "exit_minutes": exit_minutes,
    }
    (PUBLIC / "station-access.json").write_text(
        json.dumps(access, separators=(",", ":")),
        encoding="utf-8",
    )
    edges = [
        [first, second, minutes]
        for (first, second), minutes in sorted(edge_lookup.items())
    ]
    walk_network = {
        "node_count": len(cells),
        "model": "OSMnx pedestrian shortest paths between H3 connector nodes",
        "source_graph_nodes": raw_graph_nodes,
        "source_graph_edges": raw_graph_edges,
        "usable_graph_nodes": graph.number_of_nodes(),
        "usable_graph_edges": graph.number_of_edges(),
        "minimum_component_nodes": MIN_WALK_COMPONENT_NODES,
        "edges": edges,
    }
    (PUBLIC / "walk-network.json").write_text(
        json.dumps(walk_network, separators=(",", ":")),
        encoding="utf-8",
    )
    report = {
        "walking_model": access["walking_model"],
        "entrances": len(entrances),
        "entry_points": len(entry),
        "exit_points": len(exit_points),
        "walk_edges": len(edges),
        "source_graph_nodes": raw_graph_nodes,
        "source_graph_edges": raw_graph_edges,
        "usable_graph_nodes": graph.number_of_nodes(),
        "usable_graph_edges": graph.number_of_edges(),
        "minimum_component_nodes": MIN_WALK_COMPONENT_NODES,
        "missing_entry_slots": int(
            np.sum(np.asarray(entry_stations, dtype=int) < 0)
        ),
        "missing_exit_slots": int(
            np.sum(np.asarray(exit_stations, dtype=int) < 0)
        ),
    }
    (CACHE / "walk_summary.json").write_text(
        json.dumps(report, indent=2),
        encoding="utf-8",
    )
    return report


def build_drive_network(force_osm: bool = False) -> dict:
    """Build a directed H3 driving graph from OSM road travel times."""
    ensure_directories()
    graph_path = build_osmnx_drive_graph(force=force_osm)
    graph = ox.load_graphml(graph_path)
    raw_graph_nodes = graph.number_of_nodes()
    raw_graph_edges = graph.number_of_edges()
    usable_nodes = {
        node
        for component in nx.weakly_connected_components(graph)
        if len(component) >= MIN_DRIVE_COMPONENT_NODES
        for node in component
    }
    graph = graph.subgraph(usable_nodes).copy()
    cells = gpd.read_file(CACHE / "cells.geojson").sort_values("cell_index")
    cell_nodes, cell_connectors = _snap_points_to_graph(
        graph,
        cells["center_lng"].to_numpy(),
        cells["center_lat"].to_numpy(),
    )

    cell_xy = _project_points(
        cells["center_lng"].to_numpy(),
        cells["center_lat"].to_numpy(),
    )
    cell_tree = cKDTree(cell_xy)
    _distances, nearest_indexes = cell_tree.query(
        cell_xy,
        k=min(DRIVE_CELL_NEIGHBOR_CANDIDATES + 1, len(cells)),
    )
    nearest_indexes = np.atleast_2d(nearest_indexes)
    cell_id_to_index = dict(zip(cells["cell_id"], cells["cell_index"]))
    neighbor_candidates: list[set[int]] = [set() for _ in range(len(cells))]
    for cell_index, indexes in enumerate(nearest_indexes):
        neighbor_candidates[cell_index].update(
            int(index)
            for index in np.atleast_1d(indexes)
            if int(index) != cell_index
        )
        for neighbor_id in h3.grid_disk(cells.iloc[cell_index]["cell_id"], 2):
            neighbor_index = cell_id_to_index.get(neighbor_id)
            if neighbor_index is not None and int(neighbor_index) != cell_index:
                neighbor_candidates[cell_index].add(int(neighbor_index))

    edge_lookup: dict[tuple[int, int], float] = {}
    for cell_index, (node, connector_m) in enumerate(
        zip(cell_nodes, cell_connectors)
    ):
        path_lengths = nx.single_source_dijkstra_path_length(
            graph,
            int(node),
            cutoff=DRIVE_LINK_CUTOFF_SECONDS,
            weight="travel_time",
        )
        for neighbor_index in neighbor_candidates[cell_index]:
            neighbor_node = int(cell_nodes[neighbor_index])
            network_seconds = path_lengths.get(neighbor_node)
            if network_seconds is None:
                continue
            connector_minutes = (
                float(connector_m) + float(cell_connectors[neighbor_index])
            ) / DRIVE_CONNECTOR_SPEED_M_PER_MIN
            minutes = float(network_seconds) / 60 + connector_minutes
            if minutes <= 0 or minutes > DRIVE_LINK_CUTOFF_SECONDS / 60:
                continue
            key = (cell_index, neighbor_index)
            edge_lookup[key] = min(
                edge_lookup.get(key, math.inf),
                round(minutes, 3),
            )
        if (cell_index + 1) % 250 == 0:
            print(
                f"OSM driving network: {cell_index + 1:,}/{len(cells):,} cells",
                flush=True,
            )

    edges = [
        [first, second, minutes]
        for (first, second), minutes in sorted(edge_lookup.items())
    ]
    drive_network = {
        "node_count": len(cells),
        "model": (
            "OSMnx directed road shortest paths using OSM maxspeed values "
            "and OSMnx fallback free-flow speeds"
        ),
        "directed": True,
        "source_graph_nodes": raw_graph_nodes,
        "source_graph_edges": raw_graph_edges,
        "usable_graph_nodes": graph.number_of_nodes(),
        "usable_graph_edges": graph.number_of_edges(),
        "minimum_component_nodes": MIN_DRIVE_COMPONENT_NODES,
        "edges": edges,
    }
    (PUBLIC / "drive-network.json").write_text(
        json.dumps(drive_network, separators=(",", ":")),
        encoding="utf-8",
    )
    report = {
        "driving_model": "osmnx_free_flow_drive_v1",
        "drive_edges": len(edges),
        "source_graph_nodes": raw_graph_nodes,
        "source_graph_edges": raw_graph_edges,
        "usable_graph_nodes": graph.number_of_nodes(),
        "usable_graph_edges": graph.number_of_edges(),
        "minimum_component_nodes": MIN_DRIVE_COMPONENT_NODES,
    }
    (CACHE / "drive_summary.json").write_text(
        json.dumps(report, indent=2),
        encoding="utf-8",
    )
    return report


def build_manifest() -> dict:
    cells = gpd.read_file(CACHE / "cells.geojson").sort_values("cell_index")
    stations = pd.read_json(CACHE / "station_index.json")
    neighborhoods = gpd.read_file(PUBLIC / "neighborhoods.geojson")
    source_manifest = json.loads((RAW / "source_manifest.json").read_text())
    scenario_summary = json.loads((CACHE / "scenario_summary.json").read_text())
    walk_summary = json.loads((CACHE / "walk_summary.json").read_text())
    drive_summary = json.loads((CACHE / "drive_summary.json").read_text())
    rent_summary = json.loads((CACHE / "rent_summary.json").read_text())
    source = load_transit_source()
    feed = source.feed_info.iloc[0].to_dict()
    total_units = int(cells["housing_units"].sum())
    residential_cells = int((cells["housing_units"] > 0).sum())

    manifest = {
        "model_version": "2026.07.29-v5",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "title": "NYC TIME FIELD",
        "cell_count": len(cells),
        "residential_cell_count": residential_cells,
        "station_count": len(stations),
        "neighborhood_count": len(neighborhoods),
        "housing_units": total_units,
        "h3_resolution": H3_RESOLUTION,
        "matrix_unit_minutes": 0.1,
        "unreachable_value": UNREACHABLE,
        "rent": rent_summary,
        "scenarios": scenario_summary,
        "assumptions": {
            "walk_speed_kmh": round(WALK_SPEED_M_PER_MIN * 60 / 1000, 1),
            "walking_model": walk_summary["walking_model"],
            "max_station_walk_minutes": ACCESS_CUTOFF_MIN,
            "station_candidates_per_cell": ACCESS_CANDIDATES,
            "entry_overhead_minutes": ENTRY_OVERHEAD_MIN,
            "exit_overhead_minutes": EXIT_OVERHEAD_MIN,
            "default_transfer_minutes_when_gtfs_missing": TRANSFER_OVERHEAD_MIN,
            "explicit_gtfs_transfer_records": int(len(source.transfers)),
            "walking_snapshot": (
                "Published station access and direct-walk links use OSMnx "
                "pedestrian shortest paths with small point-to-node connectors."
            ),
            "osm_source_graph_nodes": walk_summary["source_graph_nodes"],
            "osm_source_graph_edges": walk_summary["source_graph_edges"],
            "driving_model": drive_summary["driving_model"],
            "driving_snapshot": (
                "OSM road travel times use posted maxspeed values and OSMnx "
                "fallback free-flow speeds; no traffic, parking, or toll delay."
            ),
            "osm_drive_source_graph_nodes": drive_summary["source_graph_nodes"],
            "osm_drive_source_graph_edges": drive_summary["source_graph_edges"],
            "rent_measure": rent_summary["measure"],
            "excluded_modes": ["bus", "ferry", "bike"],
            "not_modeled": [
                "real-time delay",
                "crowding",
                "stairs and elevator conditions",
                "temporary service changes",
                "live road traffic",
                "parking search and parking time",
            ],
        },
        "gtfs": {
            "feed_start_date": int(feed.get("feed_start_date", 0)),
            "feed_end_date": int(feed.get("feed_end_date", 0)),
            "feed_version": str(feed.get("feed_version", "")),
        },
        "sources": source_manifest["sources"],
    }
    (PUBLIC / "manifest.json").write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )

    summary = {
        "cells": len(cells),
        "residential_cells": residential_cells,
        "stations": len(stations),
        "neighborhoods": len(neighborhoods),
        "housing_units": total_units,
        "borough_cells": cells.groupby("borough").size().to_dict(),
        "borough_units": (
            cells.groupby("borough")["housing_units"].sum().astype(int).to_dict()
        ),
        "scenarios": scenario_summary,
    }
    (CACHE / "analysis_summary.json").write_text(
        json.dumps(summary, indent=2),
        encoding="utf-8",
    )
    return manifest


def validate_assets() -> dict:
    CACHE.mkdir(parents=True, exist_ok=True)
    required = [
        "manifest.json",
        "cells.geojson",
        "rent-by-cell.csv",
        "neighborhoods.geojson",
        "stations.geojson",
        "subway-lines.geojson",
        "station-access.json",
        "walk-network.json",
        "drive-network.json",
        "subway-weekday-am.bin",
        "subway-weekday-midday.bin",
        "subway-weekend.bin",
        "subway-graph-weekday-am.json",
        "subway-graph-weekday-midday.json",
        "subway-graph-weekend.json",
    ]
    missing = [name for name in required if not (PUBLIC / name).exists()]
    if missing:
        raise AssertionError(f"Missing public assets: {missing}")

    manifest = json.loads((PUBLIC / "manifest.json").read_text())
    cells = gpd.read_file(PUBLIC / "cells.geojson")
    rent_table = pd.read_csv(PUBLIC / "rent-by-cell.csv")
    neighborhoods = gpd.read_file(PUBLIC / "neighborhoods.geojson")
    stations = gpd.read_file(PUBLIC / "stations.geojson")
    access = json.loads((PUBLIC / "station-access.json").read_text())
    walk = json.loads((PUBLIC / "walk-network.json").read_text())
    drive = json.loads((PUBLIC / "drive-network.json").read_text())

    assert len(cells) == manifest["cell_count"]
    assert cells["cell_index"].is_unique
    assert cells["cell_id"].is_unique
    assert set(cells["cell_index"]) == set(range(len(cells)))
    assert str(cells.crs).upper() == "EPSG:4326"
    assert str(neighborhoods.crs).upper() == "EPSG:4326"
    assert str(stations.crs).upper() == "EPSG:4326"
    assert cells.geometry.is_valid.all()
    assert neighborhoods.geometry.is_valid.all()
    assert stations.geometry.is_valid.all()
    assert cells.loc[cells["housing_units"] > 0, "nta_id"].notna().all()
    assert (cells["housing_units"] >= 0).all()
    residential_rent = cells.loc[cells["housing_units"] > 0, "rent_estimate"]
    assert residential_rent.notna().mean() > 0.98
    assert residential_rent.dropna().between(250, 10_000).all()
    assert residential_rent.nunique() > 1_000
    assert cells.loc[
        cells["housing_units"] > 0,
        "rent_estimate_moe",
    ].notna().all()
    residential_cells = cells[cells["housing_units"] > 0].sort_values(
        "cell_index"
    )
    assert len(rent_table) == len(residential_cells)
    assert rent_table["cell_id"].is_unique
    assert set(rent_table["cell_id"]) == set(residential_cells["cell_id"])
    assert rent_table["median_gross_rent_usd"].nunique() == residential_rent.nunique()
    assert rent_table["bar_height_m"].nunique() == residential_rent.nunique()
    assert rent_table.sort_values("median_gross_rent_usd")[
        "bar_height_m"
    ].is_monotonic_increasing
    assert len(stations) == manifest["station_count"]
    assert stations["station_index"].is_unique
    assert stations["stop_id"].is_unique
    assert set(stations["station_index"]) == set(range(len(stations)))
    expected_access = manifest["cell_count"] * ACCESS_CANDIDATES
    assert access["walking_model"] == "osmnx_shortest_path_v1"
    assert access["candidate_count"] == ACCESS_CANDIDATES
    assert len(access["entry_stations"]) == expected_access
    assert len(access["exit_stations"]) == expected_access
    assert len(access["entry_minutes"]) == expected_access
    assert len(access["exit_minutes"]) == expected_access
    for side in ("entry", "exit"):
        station_values = np.asarray(access[f"{side}_stations"], dtype=int)
        minute_values = np.asarray(access[f"{side}_minutes"], dtype=float)
        assert np.isfinite(minute_values).all()
        assert np.all((station_values == -1) | (
            (station_values >= 0) & (station_values < manifest["station_count"])
        ))
        assert np.all(minute_values[station_values == -1] == 999)
        assert np.all(minute_values[station_values >= 0] >= 0)
    assert walk["node_count"] == manifest["cell_count"]
    assert "OSMnx" in walk["model"]
    walk_graph = nx.Graph()
    walk_graph.add_nodes_from(range(walk["node_count"]))
    for first, second, minutes in walk["edges"]:
        assert 0 <= int(first) < walk["node_count"]
        assert 0 <= int(second) < walk["node_count"]
        assert int(first) != int(second)
        assert math.isfinite(float(minutes)) and float(minutes) > 0
        walk_graph.add_edge(int(first), int(second), weight=float(minutes))
    isolated_cells = set(nx.isolates(walk_graph))
    residential_indexes = set(
        cells.loc[cells["housing_units"] > 0, "cell_index"].astype(int)
    )
    isolated_residential_cells = len(isolated_cells & residential_indexes)
    assert isolated_residential_cells / max(len(residential_indexes), 1) < 0.02

    assert drive["node_count"] == manifest["cell_count"]
    assert drive["directed"] is True
    assert "OSMnx" in drive["model"]
    drive_graph = nx.DiGraph()
    drive_graph.add_nodes_from(range(drive["node_count"]))
    for first, second, minutes in drive["edges"]:
        assert 0 <= int(first) < drive["node_count"]
        assert 0 <= int(second) < drive["node_count"]
        assert int(first) != int(second)
        assert math.isfinite(float(minutes)) and float(minutes) > 0
        drive_graph.add_edge(int(first), int(second), weight=float(minutes))
    isolated_drive_cells = set(nx.isolates(drive_graph))
    isolated_drive_residential_cells = len(
        isolated_drive_cells & residential_indexes
    )
    assert (
        isolated_drive_residential_cells / max(len(residential_indexes), 1)
        < 0.02
    )

    matrix_bytes = manifest["station_count"] ** 2 * 2
    graph_matrix_max_error = {}
    explicit_transfer_edges = {}
    scenario_routes = {}
    for scenario_id in SCENARIOS:
        path = PUBLIC / f"subway-{scenario_id.replace('_', '-')}.bin"
        assert path.stat().st_size == matrix_bytes
        matrix = np.fromfile(path, dtype="<u2").reshape(
            manifest["station_count"],
            manifest["station_count"],
        )
        assert np.all(np.diag(matrix) == 0)
        assert np.all((matrix == UNREACHABLE) | (matrix < UNREACHABLE))

        graph_data = json.loads(
            (
                PUBLIC
                / f"subway-graph-{scenario_id.replace('_', '-')}.json"
            ).read_text()
        )
        assert graph_data["scenario"] == scenario_id
        states = graph_data["states"]
        graph_adjacency: list[list[tuple[int, float]]] = [
            [] for _ in states
        ]
        explicit_count = 0
        for edge in graph_data["edges"]:
            assert 0 <= edge["from"] < len(states)
            assert 0 <= edge["to"] < len(states)
            assert edge["minutes"] > 0
            component_sum = (
                edge["ride_minutes"]
                + edge["wait_minutes"]
                + edge["transfer_minutes"]
            )
            assert abs(edge["minutes"] - component_sum) <= 0.02
            if edge.get("explicit_gtfs"):
                explicit_count += 1
            graph_adjacency[edge["from"]].append(
                (edge["to"], float(edge["minutes"]))
            )
        explicit_transfer_edges[scenario_id] = explicit_count
        assert explicit_count > 0
        scenario_routes[scenario_id] = sorted(
            {str(state["route"]) for state in states}
        )

        station_states = {
            int(station): indexes
            for station, indexes in graph_data["station_states"].items()
        }
        headways = {
            key: float(value) for key, value in graph_data["headways"].items()
        }
        sample_origins = np.linspace(
            0,
            manifest["station_count"] - 1,
            12,
            dtype=int,
        )
        errors = []
        for origin in sample_origins:
            initial = []
            for state_index in station_states.get(int(origin), []):
                state = states[state_index]
                initial.append(
                    (
                        state_index,
                        headways.get(
                            f"{state['route']}:{state['direction']}",
                            10,
                        )
                        / 2,
                    )
                )
            if not initial:
                continue
            distances = _dijkstra(graph_adjacency, initial)
            for destination, destination_states in station_states.items():
                if destination == origin:
                    continue
                expected = matrix[origin, destination]
                modeled = min(
                    (distances[index] for index in destination_states),
                    default=math.inf,
                )
                if expected == UNREACHABLE:
                    assert not math.isfinite(modeled)
                    continue
                assert math.isfinite(modeled)
                errors.append(abs(modeled - expected * 0.1))
        max_error = max(errors, default=0)
        graph_matrix_max_error[scenario_id] = round(max_error, 3)
        assert max_error <= 0.5

    assert not (
        {"B", "W", "Z", "6X", "7X", "FX"} & set(scenario_routes["weekend"])
    )
    si_indexes = set(
        stations.loc[
            stations["routes"].fillna("").str.split().map(
                lambda routes: routes == ["SI"]
            ),
            "station_index",
        ].astype(int)
    )
    main_indexes = set(stations["station_index"].astype(int)) - si_indexes
    weekend_matrix = np.fromfile(
        PUBLIC / "subway-weekend.bin",
        dtype="<u2",
    ).reshape(manifest["station_count"], manifest["station_count"])
    if si_indexes and main_indexes:
        si = np.asarray(sorted(si_indexes), dtype=int)
        main = np.asarray(sorted(main_indexes), dtype=int)
        assert np.all(weekend_matrix[np.ix_(si, main)] == UNREACHABLE)
        assert np.all(weekend_matrix[np.ix_(main, si)] == UNREACHABLE)

    report = {
        "status": "PASS",
        "cell_count": manifest["cell_count"],
        "station_count": manifest["station_count"],
        "neighborhood_count": manifest["neighborhood_count"],
        "walk_edges": len(walk["edges"]),
        "walk_components": nx.number_connected_components(walk_graph),
        "drive_edges": len(drive["edges"]),
        "drive_weak_components": nx.number_weakly_connected_components(
            drive_graph
        ),
        "isolated_cells": len(isolated_cells),
        "isolated_residential_cells": isolated_residential_cells,
        "isolated_drive_cells": len(isolated_drive_cells),
        "isolated_drive_residential_cells": isolated_drive_residential_cells,
        "rent": manifest["rent"],
        "explicit_transfer_edges": explicit_transfer_edges,
        "graph_matrix_max_error_minutes": graph_matrix_max_error,
        "weekend_routes": scenario_routes["weekend"],
        "staten_island_railway_disconnected": True,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
    (CACHE / "validation_report.json").write_text(
        json.dumps(report, indent=2),
        encoding="utf-8",
    )
    return report


def build_all(force: bool = False, include_pluto: bool = True) -> dict:
    start = time.perf_counter()
    fetch_sources(force=force, include_pluto=include_pluto)
    build_h3_grid()
    build_rent_data()
    build_subway_network()
    build_walk_access()
    build_drive_network()
    build_manifest()
    report = validate_assets()
    report["elapsed_seconds"] = round(time.perf_counter() - start, 2)
    return report
