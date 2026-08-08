from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.request import urlretrieve

import geopandas as gpd
import numpy as np
import pandas as pd


HVI_URL = (
    "https://a816-dohbesp.nyc.gov/IndicatorPublic/"
    "data-features/hvi/hvi-nta-2020.csv"
)
NTA_URL = (
    "https://data.cityofnewyork.us/resource/"
    "9nt8-h7nd.geojson?$limit=500"
)
PROJECTED_CRS = "EPSG:2263"
SQFT_PER_SQ_MILE = 27_878_400
WALK_RADIUS_FEET = 2_640

BOROUGH_NAMES = {
    "M": "Manhattan",
    "X": "Bronx",
    "B": "Brooklyn",
    "Q": "Queens",
    "R": "Staten Island",
}

JURISDICTION_LABELS = {
    "nyc_parks": "NYC Parks / DPR",
    "land_trust": "Land trust / nonprofit",
    "other_public": "Other public agency",
    "private": "Private / other",
}


def download_if_missing(url: str, output_path: Path) -> Path:
    if output_path.exists():
        return output_path

    output_path.parent.mkdir(parents=True, exist_ok=True)
    urlretrieve(url, output_path)
    return output_path


def clean_text(series: pd.Series, fallback: str = "") -> pd.Series:
    return series.fillna(fallback).astype(str).str.strip()


def jurisdiction_group(value: object) -> str:
    code = str(value or "").upper().strip()
    parts = {part.strip() for part in code.split("/") if part.strip()}

    if "DPR" in parts:
        return "nyc_parks"
    if parts.intersection({"TPL", "NYRP"}):
        return "land_trust"
    if parts.intersection({"DCA", "DEP", "DOE", "DOT", "HPD", "HRA", "MTA"}):
        return "other_public"
    return "private"


def load_gardens(csv_path: Path) -> tuple[gpd.GeoDataFrame, int]:
    records = pd.read_csv(csv_path)
    total_records = len(records)

    longitude = pd.to_numeric(records["Longitude"], errors="coerce")
    latitude = pd.to_numeric(records["Latitude"], errors="coerce")
    mapped = records[longitude.notna() & latitude.notna()].copy()

    mapped["longitude"] = longitude.loc[mapped.index]
    mapped["latitude"] = latitude.loc[mapped.index]
    mapped["garden_id"] = [f"garden-{index + 1:04d}" for index in mapped.index]
    mapped["garden_name"] = clean_text(mapped["Garden Name"], "Unnamed garden")
    mapped["address"] = clean_text(mapped["Address"])
    mapped["source_neighborhood"] = clean_text(mapped["NeighborhoodName"])
    mapped["jurisdiction"] = clean_text(mapped["Jurisdiction"], "Not recorded")
    mapped["jurisdiction_group"] = mapped["jurisdiction"].map(jurisdiction_group)
    mapped["community_board"] = clean_text(mapped["Community Board"], "Not recorded")
    mapped["borough"] = mapped["Boro"].map(BOROUGH_NAMES).fillna(mapped["Boro"])

    gardens = gpd.GeoDataFrame(
        mapped,
        geometry=gpd.points_from_xy(mapped["longitude"], mapped["latitude"]),
        crs="EPSG:4326",
    )
    return gardens, total_records


def load_neighborhoods(nta_path: Path, hvi_path: Path) -> gpd.GeoDataFrame:
    nta = gpd.read_file(nta_path).to_crs(PROJECTED_CRS)
    nta.columns = [column.lower() for column in nta.columns]
    nta["nta2020"] = clean_text(nta["nta2020"])

    hvi = pd.read_csv(hvi_path)
    hvi.columns = [column.lower() for column in hvi.columns]
    hvi["ntacode"] = clean_text(hvi["ntacode"])
    numeric_columns = [
        "hvi_rank",
        "surface_temp",
        "median_income",
        "greenspace",
        "pct_households_ac",
        "pct_black_pop",
    ]
    for column in numeric_columns:
        hvi[column] = pd.to_numeric(hvi[column], errors="coerce")

    selected_hvi = hvi[
        [
            "ntacode",
            "geoname",
            "cdtacode",
            *numeric_columns,
        ]
    ].rename(columns={"ntacode": "nta2020", "geoname": "hvi_neighborhood"})

    neighborhoods = nta.merge(selected_hvi, on="nta2020", how="inner")
    neighborhoods["area_sq_miles"] = neighborhoods.geometry.area / SQFT_PER_SQ_MILE
    return neighborhoods


def add_open_space_coverage(
    neighborhoods: gpd.GeoDataFrame,
    open_space_path: Path,
) -> gpd.GeoDataFrame:
    if not open_space_path.exists():
        raise FileNotFoundError(
            "Run prepare_open_space.mjs before preparing neighborhood metrics."
        )

    open_space = gpd.read_file(open_space_path).to_crs(PROJECTED_CRS)
    open_space = open_space[
        open_space.geometry.notna() & ~open_space.geometry.is_empty
    ].copy()
    if hasattr(open_space.geometry, "make_valid"):
        open_space["geometry"] = open_space.geometry.make_valid()

    if hasattr(open_space.geometry, "union_all"):
        open_space_union = open_space.geometry.union_all()
    else:
        open_space_union = open_space.geometry.unary_union

    output = neighborhoods.copy()
    park_area = output.geometry.intersection(open_space_union).area
    output["park_area_sq_miles"] = park_area / SQFT_PER_SQ_MILE
    output["park_coverage_pct"] = np.clip(
        np.where(output.geometry.area > 0, park_area / output.geometry.area * 100, 0),
        0,
        100,
    )
    return output


def assign_gardens_to_neighborhoods(
    gardens: gpd.GeoDataFrame,
    neighborhoods: gpd.GeoDataFrame,
) -> gpd.GeoDataFrame:
    projected = gardens.to_crs(PROJECTED_CRS)
    joined = gpd.sjoin(
        projected,
        neighborhoods[
            ["nta2020", "hvi_neighborhood", "hvi_rank", "geometry"]
        ],
        how="left",
        predicate="within",
    )
    joined = joined.drop(columns=["index_right"], errors="ignore")
    joined["jurisdiction_label"] = joined["jurisdiction_group"].map(
        JURISDICTION_LABELS
    )
    joined["hvi_rank"] = pd.to_numeric(joined["hvi_rank"], errors="coerce")
    return joined


def classify_density(neighborhoods: gpd.GeoDataFrame) -> tuple[pd.Series, list[float]]:
    density = neighborhoods["gardens_per_sq_mile"]
    positive = density[density > 0]
    classes = pd.Series(-1, index=neighborhoods.index, dtype="int64")

    if positive.empty:
        return classes, []

    codes, edges = pd.qcut(
        positive,
        q=min(5, positive.nunique()),
        labels=False,
        retbins=True,
        duplicates="drop",
    )
    classes.loc[positive.index] = codes.astype(int)
    return classes, [round(float(edge), 2) for edge in edges]


def aggregate_neighborhoods(
    neighborhoods: gpd.GeoDataFrame,
    gardens: gpd.GeoDataFrame,
) -> tuple[gpd.GeoDataFrame, list[float]]:
    valid = gardens[gardens["nta2020"].notna()].copy()
    counts = valid.groupby("nta2020").size().rename("garden_count")
    jurisdiction_counts = pd.crosstab(
        valid["nta2020"],
        valid["jurisdiction_group"],
    )
    for group in JURISDICTION_LABELS:
        if group not in jurisdiction_counts.columns:
            jurisdiction_counts[group] = 0
    jurisdiction_counts = jurisdiction_counts.rename(
        columns={group: f"{group}_count" for group in JURISDICTION_LABELS}
    )

    output = neighborhoods.merge(counts, on="nta2020", how="left")
    output = output.merge(jurisdiction_counts, on="nta2020", how="left")

    count_columns = [
        "garden_count",
        *(f"{group}_count" for group in JURISDICTION_LABELS),
    ]
    output[count_columns] = output[count_columns].fillna(0).astype(int)
    output["gardens_per_sq_mile"] = np.where(
        output["area_sq_miles"] > 0,
        output["garden_count"] / output["area_sq_miles"],
        0,
    )
    output["density_class"], density_edges = classify_density(output)
    return output, density_edges


def prepare_neighborhood_output(neighborhoods: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    simplified = neighborhoods.copy()
    simplified["geometry"] = simplified.geometry.simplify(35, preserve_topology=True)
    columns = [
        "nta2020",
        "hvi_neighborhood",
        "cdtacode",
        "hvi_rank",
        "surface_temp",
        "median_income",
        "greenspace",
        "pct_households_ac",
        "pct_black_pop",
        "area_sq_miles",
        "park_area_sq_miles",
        "park_coverage_pct",
        "garden_count",
        "gardens_per_sq_mile",
        "density_class",
        "nyc_parks_count",
        "land_trust_count",
        "other_public_count",
        "private_count",
        "geometry",
    ]
    return simplified[columns].to_crs("EPSG:4326")


def prepare_garden_output(gardens: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    columns = [
        "garden_id",
        "garden_name",
        "address",
        "source_neighborhood",
        "jurisdiction",
        "jurisdiction_group",
        "jurisdiction_label",
        "community_board",
        "borough",
        "nta2020",
        "hvi_neighborhood",
        "hvi_rank",
        "geometry",
    ]
    return gardens[columns].to_crs("EPSG:4326")


def prepare_walk_buffer_output(gardens: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    projected = gardens.to_crs(PROJECTED_CRS)
    rings = []
    for ring, scale in (("outer", 1.0), ("middle", 0.67), ("inner", 0.34)):
        layer = projected[
            ["garden_id", "garden_name", "hvi_rank", "jurisdiction_group"]
        ].copy()
        layer["ring"] = ring
        layer["radius_miles"] = 0.5 * scale
        layer["geometry"] = projected.geometry.buffer(
            WALK_RADIUS_FEET * scale,
            resolution=24,
        )
        rings.append(layer)

    return gpd.GeoDataFrame(
        pd.concat(rings, ignore_index=True),
        geometry="geometry",
        crs=PROJECTED_CRS,
    ).to_crs("EPSG:4326")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepare HVI, NTA, and community-garden web-map data."
    )
    parser.add_argument("--garden-csv", required=True, type=Path)
    parser.add_argument(
        "--project-dir",
        type=Path,
        default=Path(__file__).resolve().parent,
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Redownload official source files before processing.",
    )
    args = parser.parse_args()

    project_dir = args.project_dir.resolve()
    data_dir = project_dir / "data"
    raw_dir = data_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    hvi_path = raw_dir / "hvi_nta_2020.csv"
    nta_path = raw_dir / "nta_2020.geojson"
    if args.refresh:
        hvi_path.unlink(missing_ok=True)
        nta_path.unlink(missing_ok=True)

    download_if_missing(HVI_URL, hvi_path)
    download_if_missing(NTA_URL, nta_path)

    gardens, total_records = load_gardens(args.garden_csv.resolve())
    neighborhoods = load_neighborhoods(nta_path, hvi_path)
    neighborhoods = add_open_space_coverage(
        neighborhoods,
        data_dir / "open_space_simplified.geojson",
    )
    assigned_gardens = assign_gardens_to_neighborhoods(gardens, neighborhoods)
    neighborhood_metrics, density_edges = aggregate_neighborhoods(
        neighborhoods,
        assigned_gardens,
    )

    neighborhood_output = prepare_neighborhood_output(neighborhood_metrics)
    garden_output = prepare_garden_output(assigned_gardens)
    walk_buffer_output = prepare_walk_buffer_output(assigned_gardens)
    neighborhood_output.to_file(data_dir / "nta_hvi.geojson", driver="GeoJSON")
    garden_output.to_file(data_dir / "gardens_hvi.geojson", driver="GeoJSON")
    walk_buffer_output.to_file(
        data_dir / "garden_walk_buffers.geojson",
        driver="GeoJSON",
    )

    high_hvi = assigned_gardens[assigned_gardens["hvi_rank"].ge(4)]
    jurisdiction_counts = (
        assigned_gardens["jurisdiction_group"]
        .value_counts()
        .reindex(JURISDICTION_LABELS.keys(), fill_value=0)
        .astype(int)
        .to_dict()
    )
    summary = {
        "total_garden_records": total_records,
        "mapped_gardens": int(len(assigned_gardens)),
        "assigned_to_hvi_nta": int(assigned_gardens["nta2020"].notna().sum()),
        "gardens_in_high_hvi": int(len(high_hvi)),
        "high_hvi_neighborhoods": int(
            neighborhood_metrics["hvi_rank"].ge(4).sum()
        ),
        "neighborhoods_with_gardens": int(
            neighborhood_metrics["garden_count"].gt(0).sum()
        ),
        "jurisdiction_counts": jurisdiction_counts,
        "jurisdiction_labels": JURISDICTION_LABELS,
        "density_edges": density_edges,
        "garden_dataset_date": "2026-07-22",
        "hvi_geography": "2020 NTA",
        "nta_release": "26B / May 2026",
    }
    with (data_dir / "summary.json").open("w", encoding="utf-8") as output:
        json.dump(summary, output, indent=2)

    print(
        f"Prepared {len(neighborhood_output)} HVI neighborhoods and "
        f"{len(garden_output)} mapped gardens; "
        f"{len(high_hvi)} gardens fall in HVI 4-5 neighborhoods."
    )


if __name__ == "__main__":
    main()
