from __future__ import annotations

import hashlib
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = PROJECT_ROOT / "data" / "source"
REFERENCE_DIR = PROJECT_ROOT / "data" / "reference"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def prepare_monthly_rent() -> tuple[pd.DataFrame, pd.DataFrame]:
    source_path = SOURCE_DIR / "nyc_rent_monthly.csv"
    monthly = pd.read_csv(source_path, dtype={"date": "string", "borough": "string"})
    monthly = monthly.rename(
        columns={
            "medianAskingRent": "median_asking_rent_usd",
            "rentalInventory": "rental_inventory",
        }
    )
    monthly["date"] = pd.to_datetime(monthly["date"], format="%Y-%m")
    monthly = monthly.sort_values(["borough", "date"]).reset_index(drop=True)

    expected_boroughs = {"Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"}
    assert set(monthly["borough"]) == expected_boroughs
    assert len(monthly) == 600
    assert monthly["date"].nunique() == 120
    assert not monthly.duplicated(["date", "borough"]).any()
    assert not monthly.isna().any().any()

    first = monthly.groupby("borough", observed=True).first()
    last = monthly.groupby("borough", observed=True).last()
    baseline_rent = first["median_asking_rent_usd"]
    baseline_inventory = first["rental_inventory"]
    monthly["baseline_rent_usd"] = monthly["borough"].map(baseline_rent)
    monthly["baseline_inventory"] = monthly["borough"].map(baseline_inventory)
    monthly["rent_change_usd"] = (
        monthly["median_asking_rent_usd"] - monthly["baseline_rent_usd"]
    )
    monthly["rent_growth_pct"] = monthly["rent_change_usd"].div(
        monthly["baseline_rent_usd"]
    ).mul(100)
    monthly["rent_index"] = monthly["median_asking_rent_usd"].div(
        monthly["baseline_rent_usd"]
    ).mul(100)
    monthly["inventory_index"] = monthly["rental_inventory"].div(
        monthly["baseline_inventory"]
    ).mul(100)
    monthly["date"] = monthly["date"].dt.strftime("%Y-%m")

    summary = pd.DataFrame(
        {
            "borough": first.index,
            "baseline_date": "2016-07",
            "latest_date": "2026-06",
            "baseline_rent_usd": first["median_asking_rent_usd"].astype(int),
            "latest_rent_usd": last["median_asking_rent_usd"].astype(int),
            "rent_change_usd": (
                last["median_asking_rent_usd"] - first["median_asking_rent_usd"]
            ).astype(int),
            "rent_growth_pct": (
                (last["median_asking_rent_usd"] / first["median_asking_rent_usd"] - 1)
                * 100
            ).round(1),
            "baseline_inventory": first["rental_inventory"].astype(int),
            "latest_inventory": last["rental_inventory"].astype(int),
            "inventory_change_pct": (
                (last["rental_inventory"] / first["rental_inventory"] - 1) * 100
            ).round(1),
        }
    ).reset_index(drop=True)

    monthly.to_csv(PROCESSED_DIR / "nyc_rent_monthly_normalized.csv", index=False)
    summary.to_csv(PROCESSED_DIR / "borough_rent_summary.csv", index=False)
    return monthly, summary


def prepare_borough_boundaries(summary: pd.DataFrame) -> gpd.GeoDataFrame:
    neighborhoods = gpd.read_file(REFERENCE_DIR / "nyc_neighborhoods.geojson")
    neighborhoods = neighborhoods.to_crs("EPSG:4326")
    boroughs = neighborhoods[["borough", "geometry"]].dissolve(by="borough").reset_index()
    boroughs = boroughs.merge(summary, on="borough", how="left", validate="one_to_one")
    assert len(boroughs) == 5
    assert boroughs["rent_growth_pct"].notna().all()
    boroughs.to_file(PROCESSED_DIR / "borough_rent_growth.geojson", driver="GeoJSON")
    return boroughs


def prepare_manhattan_points() -> tuple[pd.DataFrame, gpd.GeoDataFrame]:
    series_path = SOURCE_DIR / "manhattan_rent_series.json"
    payload = json.loads(series_path.read_text())
    months = payload["months"]
    assert len(months) == 120
    assert months[0] == "2016-07" and months[-1] == "2026-06"

    rows: list[dict] = []
    for neighborhood in payload["neighborhoods"]:
        rents = neighborhood["rents"]
        assert list(rents) == months
        assert all(value is not None for value in rents.values())
        longitude, latitude = neighborhood["center"]
        rows.append(
            {
                "area_id": neighborhood["id"],
                "area_name": neighborhood["name"],
                "borough": "Manhattan",
                "longitude": float(longitude),
                "latitude": float(latitude),
                "baseline_month": months[0],
                "latest_month": months[-1],
                "baseline_rent_usd": int(neighborhood["baselineRent"]),
                "latest_rent_usd": int(neighborhood["latestRent"]),
                "rent_change_usd": int(
                    neighborhood["latestRent"] - neighborhood["baselineRent"]
                ),
                "growth_pct": round(float(neighborhood["growthPct"]), 1),
                "min_rent_usd": int(neighborhood["minRent"]),
                "max_rent_usd": int(neighborhood["maxRent"]),
                "observation_months": len(rents),
                "source": payload["source"],
                "source_url": payload["sourceUrl"],
            }
        )

    points = pd.DataFrame(rows).sort_values("area_name").reset_index(drop=True)
    assert len(points) == 31
    assert not points["area_id"].duplicated().any()
    assert points["observation_months"].eq(120).all()
    point_gdf = gpd.GeoDataFrame(
        points.copy(),
        geometry=gpd.points_from_xy(points["longitude"], points["latitude"]),
        crs="EPSG:4326",
    )
    points.to_csv(PROCESSED_DIR / "manhattan_rent_growth_points.csv", index=False)
    point_gdf.to_file(
        PROCESSED_DIR / "manhattan_rent_growth_points.geojson", driver="GeoJSON"
    )
    return points, point_gdf


def write_audit(
    monthly: pd.DataFrame,
    summary: pd.DataFrame,
    boroughs: gpd.GeoDataFrame,
    points: pd.DataFrame,
) -> None:
    source_files = [
        SOURCE_DIR / "nyc_rent_monthly.csv",
        SOURCE_DIR / "nyc_vacancy_rates.csv",
        SOURCE_DIR / "manhattan_rent_series.json",
    ]
    audit = {
        "snapshot_period": {"start": "2016-07", "end": "2026-06"},
        "monthly_rent": {
            "rows": len(monthly),
            "boroughs": int(monthly["borough"].nunique()),
            "months": int(monthly["date"].nunique()),
            "duplicate_borough_months": int(monthly.duplicated(["date", "borough"]).sum()),
            "null_cells": int(monthly.isna().sum().sum()),
        },
        "borough_summary_rows": len(summary),
        "borough_geometry_rows": len(boroughs),
        "manhattan_rent_points": {
            "rows": len(points),
            "unique_ids": int(points["area_id"].nunique()),
            "months_per_area": sorted(points["observation_months"].unique().tolist()),
            "null_cells": int(points.isna().sum().sum()),
        },
        "source_sha256": {path.name: sha256(path) for path in source_files},
    }
    (PROCESSED_DIR / "data_audit.json").write_text(json.dumps(audit, indent=2) + "\n")


def main() -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    monthly, summary = prepare_monthly_rent()
    boroughs = prepare_borough_boundaries(summary)
    points, _ = prepare_manhattan_points()
    write_audit(monthly, summary, boroughs, points)
    print(
        f"Prepared {len(monthly)} borough-month rows, {len(boroughs)} boroughs, "
        f"and {len(points)} Manhattan rent points."
    )


if __name__ == "__main__":
    main()
