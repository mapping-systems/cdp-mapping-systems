from __future__ import annotations

import argparse
from pathlib import Path

import geopandas as gpd
import matplotlib.patheffects as path_effects
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.colors import to_rgb, to_rgba
from matplotlib.lines import Line2D
from matplotlib.patches import Patch


DISTRICT_URL = (
    "https://data.cityofnewyork.us/resource/"
    "5crt-au7u.geojson?%24limit=5000"
)
PARKS_URL = (
    "https://data.cityofnewyork.us/resource/"
    "enfh-gkve.geojson?%24limit=50000"
)
PROJECTED_CRS = "EPSG:2263"
SQFT_PER_ACRE = 43_560

BOROUGH_CODES = {
    "M": 1,
    "X": 2,
    "B": 3,
    "Q": 4,
    "R": 5,
}
BOROUGH_NAMES = {
    1: "Manhattan",
    2: "Bronx",
    3: "Brooklyn",
    4: "Queens",
    5: "Staten Island",
}

BACKGROUND = "#F8F7F2"
NEUTRAL = "#E3E6E1"
FOREST = "#176B45"
INK = "#1C2520"
MUTED = "#66706A"
BOUNDARY = "#FFFFFF"


def load_or_download_geojson(
    url: str,
    cache_path: Path,
    *,
    refresh: bool = False,
) -> gpd.GeoDataFrame:
    """Load a cached GeoJSON file or download and cache its official source."""
    if cache_path.exists() and not refresh:
        return gpd.read_file(cache_path)

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    geodata = gpd.read_file(url)
    geodata.to_file(cache_path, driver="GeoJSON")
    return geodata


def district_name(boro_cd: int) -> str:
    borough_code = boro_cd // 100
    district_number = boro_cd % 100
    return f"{BOROUGH_NAMES[borough_code]} CD {district_number:02d}"


def load_gardens(csv_path: Path) -> tuple[pd.DataFrame, dict[str, int]]:
    """Load the archived GreenThumb records and preserve missing size as missing."""
    gardens = pd.read_csv(csv_path)
    required = {"PropID", "Boro", "Community Board", "Size"}
    missing_columns = required.difference(gardens.columns)
    if missing_columns:
        raise ValueError(
            "The garden CSV is missing required columns: "
            + ", ".join(sorted(missing_columns))
        )

    gardens["size_acres"] = pd.to_numeric(gardens["Size"], errors="coerce")
    board = gardens["Community Board"].astype("string").str.strip().str.upper()
    board_number = pd.to_numeric(board.str.extract(r"(\d+)$")[0], errors="coerce")
    borough_number = board.str[0].map(BOROUGH_CODES)
    gardens["boro_cd"] = borough_number * 100 + board_number

    gardens["boro_cd"] = gardens["boro_cd"].astype("Int64")

    coordinate_complete = (
        pd.to_numeric(gardens.get("Latitude"), errors="coerce").notna()
        & pd.to_numeric(gardens.get("Longitude"), errors="coerce").notna()
    )
    audit = {
        "total_records": int(len(gardens)),
        "known_size_records": int(gardens["size_acres"].notna().sum()),
        "mapped_records": int(coordinate_complete.sum()),
        "known_size_and_mapped_records": int(
            (gardens["size_acres"].notna() & coordinate_complete).sum()
        ),
        "community_board_records": int(gardens["boro_cd"].notna().sum()),
    }
    return gardens, audit


def assign_missing_districts(
    gardens: pd.DataFrame,
    districts: gpd.GeoDataFrame,
) -> tuple[pd.DataFrame, int]:
    """Recover missing board codes through a point-in-polygon join."""
    assigned = gardens.copy()
    latitude = pd.to_numeric(assigned.get("Latitude"), errors="coerce")
    longitude = pd.to_numeric(assigned.get("Longitude"), errors="coerce")
    candidates = assigned["boro_cd"].isna() & latitude.notna() & longitude.notna()
    if not candidates.any():
        return assigned, 0

    points = gpd.GeoDataFrame(
        index=assigned.index[candidates],
        geometry=gpd.points_from_xy(
            longitude.loc[candidates],
            latitude.loc[candidates],
        ),
        crs="EPSG:4326",
    ).to_crs(districts.crs)
    joined = gpd.sjoin(
        points,
        districts[["boro_cd", "geometry"]],
        how="left",
        predicate="within",
    )
    recovered = joined["boro_cd"].notna()
    recovered_indices = joined.index[recovered]
    assigned.loc[recovered_indices, "boro_cd"] = (
        joined.loc[recovered_indices, "boro_cd"].astype("Int64")
    )
    return assigned, int(recovered.sum())


def aggregate_gardens(gardens: pd.DataFrame) -> pd.DataFrame:
    """Aggregate garden count and recorded acreage by Community District."""
    grouped = (
        gardens.groupby("boro_cd", as_index=False)
        .agg(
            total_gardens=("PropID", "size"),
            known_size_gardens=("size_acres", "count"),
            recorded_garden_acres=(
                "size_acres",
                lambda values: values.sum(min_count=1),
            ),
        )
    )
    grouped["recorded_garden_acres"] = grouped[
        "recorded_garden_acres"
    ].fillna(0)
    grouped["size_completeness_pct"] = (
        grouped["known_size_gardens"] / grouped["total_gardens"] * 100
    )
    return grouped


def prepare_districts(districts: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Keep the 59 standard Community Districts and project them for area work."""
    districts = districts.copy()
    districts["boro_cd"] = pd.to_numeric(
        districts["boro_cd"],
        errors="coerce",
    )
    district_number = districts["boro_cd"] % 100
    districts = districts[
        districts["boro_cd"].notna() & district_number.between(1, 18)
    ].copy()
    districts["boro_cd"] = districts["boro_cd"].astype(int)
    districts = districts.to_crs(PROJECTED_CRS)
    districts["geometry"] = districts.geometry.make_valid()

    if len(districts) != 59:
        raise ValueError(
            f"Expected 59 standard Community Districts, found {len(districts)}."
        )
    return districts


def calculate_parkland_acres(
    districts: gpd.GeoDataFrame,
    parks: gpd.GeoDataFrame,
) -> pd.Series:
    """Calculate unique Parks Properties area clipped to every district."""
    parks = parks.to_crs(PROJECTED_CRS).copy()
    parks["geometry"] = parks.geometry.make_valid()
    parks = parks[~parks.geometry.is_empty & parks.geometry.notna()].copy()

    # Unioning first prevents overlapping Parks Properties records from being
    # counted more than once when they are clipped to district boundaries.
    parkland_union = parks.geometry.union_all()
    acres = districts.geometry.apply(
        lambda district: district.intersection(parkland_union).area
        / SQFT_PER_ACRE
    )
    return acres


def build_metrics(
    districts: gpd.GeoDataFrame,
    parks: gpd.GeoDataFrame,
    gardens: pd.DataFrame,
) -> gpd.GeoDataFrame:
    """Create the district-level garden-to-parkland ratio table."""
    metrics = districts.copy()
    metrics["parkland_acres"] = calculate_parkland_acres(metrics, parks)
    metrics = metrics.merge(
        aggregate_gardens(gardens),
        on="boro_cd",
        how="left",
    )

    count_columns = ["total_gardens", "known_size_gardens"]
    metrics[count_columns] = metrics[count_columns].fillna(0).astype(int)
    metrics["recorded_garden_acres"] = metrics[
        "recorded_garden_acres"
    ].fillna(0)
    metrics["size_completeness_pct"] = np.where(
        metrics["total_gardens"] > 0,
        metrics["known_size_gardens"] / metrics["total_gardens"] * 100,
        np.nan,
    )
    metrics["garden_to_parkland_pct"] = np.where(
        metrics["parkland_acres"] > 0,
        metrics["recorded_garden_acres"] / metrics["parkland_acres"] * 100,
        np.nan,
    )
    metrics["district"] = metrics["boro_cd"].map(district_name)
    metrics["borough_code"] = metrics["boro_cd"] // 100
    return metrics


def classify_nonzero_ratios(
    metrics: gpd.GeoDataFrame,
    *,
    maximum_classes: int = 5,
) -> tuple[gpd.GeoDataFrame, list[float], list[str]]:
    """Place non-zero ratios into quantiles while keeping zero separate."""
    classified = metrics.copy()
    classified["ratio_class"] = pd.Series(pd.NA, index=classified.index, dtype="Int64")
    usable = classified["garden_to_parkland_pct"].gt(0) & classified[
        "garden_to_parkland_pct"
    ].notna()
    nonzero = classified.loc[usable, "garden_to_parkland_pct"]

    class_count = min(maximum_classes, int(nonzero.nunique()))
    if class_count == 0:
        return classified, [], []

    codes, edges = pd.qcut(
        nonzero,
        q=class_count,
        labels=False,
        retbins=True,
        duplicates="drop",
    )
    classified.loc[usable, "ratio_class"] = codes.astype("Int64")
    edges = list(map(float, edges))

    labels = []
    for lower, upper in zip(edges[:-1], edges[1:]):
        precision = 2 if upper < 1 else 1
        labels.append(
            f"{lower:.{precision}f}–{upper:.{precision}f}%"
        )
    return classified, edges, labels


def _map_facecolors(
    metrics: gpd.GeoDataFrame,
    class_count: int,
) -> list[tuple[float, float, float, float]]:
    forest_rgb = to_rgb(FOREST)
    alphas = np.linspace(0.22, 0.90, max(class_count, 1))
    colors: list[tuple[float, float, float, float]] = []

    for _, row in metrics.iterrows():
        ratio = row["garden_to_parkland_pct"]
        ratio_class = row["ratio_class"]
        if pd.isna(ratio):
            colors.append(to_rgba("#EBEBE6"))
        elif ratio == 0 or pd.isna(ratio_class):
            colors.append(to_rgba(NEUTRAL))
        else:
            colors.append((*forest_rgb, float(alphas[int(ratio_class)])))
    return colors


def create_figure(
    metrics: gpd.GeoDataFrame,
    audit: dict[str, int],
    output_path: Path,
) -> None:
    """Create the main map and two supporting district comparisons."""
    metrics, _, class_labels = classify_nonzero_ratios(metrics)
    class_count = len(class_labels)
    facecolors = _map_facecolors(metrics, class_count)

    fig = plt.figure(figsize=(16, 10.5), facecolor=BACKGROUND)
    grid = fig.add_gridspec(
        2,
        2,
        width_ratios=(2.15, 1),
        height_ratios=(1.12, 0.88),
        left=0.035,
        right=0.975,
        top=0.87,
        bottom=0.09,
        wspace=0.12,
        hspace=0.31,
    )
    ax_map = fig.add_subplot(grid[:, 0])
    ax_rank = fig.add_subplot(grid[0, 1])
    ax_scatter = fig.add_subplot(grid[1, 1])

    for axis in (ax_map, ax_rank, ax_scatter):
        axis.set_facecolor(BACKGROUND)

    metrics.plot(
        ax=ax_map,
        color=facecolors,
        edgecolor=BOUNDARY,
        linewidth=0.7,
        zorder=1,
    )
    boroughs = metrics[["borough_code", "geometry"]].dissolve(
        by="borough_code"
    )
    boroughs.boundary.plot(
        ax=ax_map,
        color=INK,
        linewidth=1.25,
        zorder=2,
    )

    top_labelled = metrics.nlargest(6, "garden_to_parkland_pct")
    label_offsets = {
        303: (-18, -7),
        304: (20, 8),
        316: (0, -12),
    }
    for _, row in top_labelled.iterrows():
        point = row.geometry.representative_point()
        offset = label_offsets.get(int(row["boro_cd"]), (0, 0))
        label = ax_map.annotate(
            f"{row['boro_cd']}\n{row['garden_to_parkland_pct']:.1f}%",
            xy=(point.x, point.y),
            xytext=offset,
            textcoords="offset points",
            ha="center",
            va="center",
            fontsize=8.5,
            fontweight="semibold",
            color=INK,
            zorder=3,
            arrowprops=(
                {
                    "arrowstyle": "-",
                    "color": MUTED,
                    "linewidth": 0.6,
                }
                if offset != (0, 0)
                else None
            ),
        )
        label.set_path_effects(
            [path_effects.withStroke(linewidth=2.5, foreground=BACKGROUND)]
        )

    legend_handles = [
        Patch(
            facecolor=NEUTRAL,
            edgecolor="none",
            label="No recorded garden acreage",
        )
    ]
    forest_rgb = to_rgb(FOREST)
    alphas = np.linspace(0.22, 0.90, max(class_count, 1))
    legend_handles.extend(
        Patch(
            facecolor=(*forest_rgb, float(alpha)),
            edgecolor="none",
            label=label,
        )
        for alpha, label in zip(alphas, class_labels)
    )
    if metrics["garden_to_parkland_pct"].isna().any():
        legend_handles.append(
            Patch(
                facecolor="#EBEBE6",
                edgecolor=MUTED,
                hatch="////",
                label="Not calculable",
            )
        )
    ax_map.legend(
        handles=legend_handles,
        title="Recorded garden acres per 100 parkland acres",
        loc="lower left",
        frameon=False,
        fontsize=8.5,
        title_fontsize=9.5,
        labelspacing=0.7,
    )
    ax_map.set_axis_off()

    top_ten = (
        metrics[metrics["garden_to_parkland_pct"].notna()]
        .nlargest(10, "garden_to_parkland_pct")
        .sort_values("garden_to_parkland_pct")
    )
    ax_rank.barh(
        top_ten["district"],
        top_ten["garden_to_parkland_pct"],
        color=FOREST,
        alpha=0.82,
        height=0.68,
    )
    rank_max = max(float(top_ten["garden_to_parkland_pct"].max()), 1)
    for y, (_, row) in enumerate(top_ten.iterrows()):
        ax_rank.text(
            row["garden_to_parkland_pct"] + rank_max * 0.025,
            y,
            (
                f"{row['garden_to_parkland_pct']:.1f}%"
                f"  ·  {row['known_size_gardens']}/"
                f"{row['total_gardens']} sizes"
            ),
            va="center",
            fontsize=8,
            color=INK,
        )
    ax_rank.set_xlim(0, rank_max * 1.22)
    ax_rank.set_title(
        "Highest garden-to-parkland ratios",
        loc="left",
        fontsize=12,
        fontweight="semibold",
        color=INK,
        pad=9,
    )
    ax_rank.set_xlabel("Recorded garden acres per 100 parkland acres")
    ax_rank.grid(axis="x", color="#D7DBD6", linewidth=0.6)
    ax_rank.set_axisbelow(True)
    ax_rank.tick_params(axis="both", labelsize=8.5, colors=MUTED)
    for spine in ax_rank.spines.values():
        spine.set_visible(False)

    scatter_data = metrics[
        metrics["parkland_acres"].gt(0)
        & metrics["recorded_garden_acres"].gt(0)
    ].copy()
    sizes = 28 + scatter_data["total_gardens"] * 3.4
    ax_scatter.scatter(
        scatter_data["parkland_acres"],
        scatter_data["recorded_garden_acres"],
        s=sizes,
        color=FOREST,
        alpha=0.58,
        edgecolors=BACKGROUND,
        linewidths=0.7,
    )
    for _, row in scatter_data.nlargest(
        5,
        "garden_to_parkland_pct",
    ).iterrows():
        ax_scatter.annotate(
            str(row["boro_cd"]),
            (
                row["parkland_acres"],
                row["recorded_garden_acres"],
            ),
            xytext=(4, 4),
            textcoords="offset points",
            fontsize=8,
            color=INK,
        )
    ax_scatter.set_xscale("log")
    ax_scatter.set_title(
        "A high ratio can reflect more gardens or less parkland",
        loc="left",
        fontsize=12,
        fontweight="semibold",
        color=INK,
        pad=9,
    )
    ax_scatter.set_xlabel("NYC Parks Properties acres (log scale)")
    ax_scatter.set_ylabel("Recorded community garden acres")
    ax_scatter.grid(color="#D7DBD6", linewidth=0.6)
    ax_scatter.set_axisbelow(True)
    ax_scatter.tick_params(axis="both", labelsize=8.5, colors=MUTED)
    for spine in ax_scatter.spines.values():
        spine.set_visible(False)
    size_key = Line2D(
        [],
        [],
        linestyle="",
        marker="o",
        markersize=8,
        markerfacecolor=FOREST,
        markeredgecolor=BACKGROUND,
        alpha=0.58,
        label="Bubble size = garden count",
    )
    ax_scatter.legend(handles=[size_key], frameon=False, fontsize=8.5)

    fig.suptitle(
        "Where Community Gardens Carry More of the Green-Space Network",
        x=0.035,
        y=0.965,
        ha="left",
        fontsize=22,
        fontweight="semibold",
        color=INK,
    )
    fig.text(
        0.035,
        0.915,
        "Recorded community garden acreage relative to clipped NYC Parks "
        "Properties acreage, by Community District",
        ha="left",
        fontsize=11.5,
        color=MUTED,
    )
    fig.text(
        0.035,
        0.035,
        (
            f"Garden records: {audit['total_records']} total; "
            f"{audit['known_size_records']} with recorded size "
            f"({audit['known_size_records'] / audit['total_records']:.0%}). "
            "Missing size is not treated as zero. Parks Properties is a "
            "proxy for NYC Parks-managed open space, not all vegetation."
        ),
        ha="left",
        fontsize=8.5,
        color=MUTED,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(
        output_path,
        dpi=300,
        bbox_inches="tight",
        facecolor=BACKGROUND,
    )
    plt.close(fig)


def export_metrics(metrics: gpd.GeoDataFrame, output_path: Path) -> None:
    columns = [
        "boro_cd",
        "district",
        "total_gardens",
        "known_size_gardens",
        "size_completeness_pct",
        "recorded_garden_acres",
        "parkland_acres",
        "garden_to_parkland_pct",
    ]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    metrics[columns].sort_values("boro_cd").to_csv(
        output_path,
        index=False,
        float_format="%.4f",
    )


def run_analysis(
    project_dir: Path | None = None,
    garden_csv: Path | None = None,
    *,
    refresh: bool = False,
) -> tuple[gpd.GeoDataFrame, dict[str, int], dict[str, Path]]:
    project_dir = (
        Path(project_dir).resolve()
        if project_dir is not None
        else Path(__file__).resolve().parent
    )
    garden_csv = (
        Path(garden_csv).resolve()
        if garden_csv is not None
        else project_dir.parent
        / "01"
        / "ARCHIVED_-_NYC_Greenthumb_Community_Gardens_20260722.csv"
    )
    if not garden_csv.exists():
        raise FileNotFoundError(
            "Garden CSV not found. Expected it at "
            f"{garden_csv}. Pass --garden-csv to use another location."
        )

    data_dir = project_dir / "data"
    outputs_dir = project_dir / "outputs"
    districts = load_or_download_geojson(
        DISTRICT_URL,
        data_dir / "community_districts.geojson",
        refresh=refresh,
    )
    parks = load_or_download_geojson(
        PARKS_URL,
        data_dir / "parks_properties.geojson",
        refresh=refresh,
    )
    gardens, audit = load_gardens(garden_csv)
    prepared_districts = prepare_districts(districts)
    gardens, recovered_districts = assign_missing_districts(
        gardens,
        prepared_districts,
    )
    audit["spatially_recovered_district_records"] = recovered_districts
    audit["district_assigned_records"] = int(gardens["boro_cd"].notna().sum())
    metrics = build_metrics(
        prepared_districts,
        parks,
        gardens,
    )

    figure_path = outputs_dir / "community_garden_parkland_ratio.png"
    metrics_path = outputs_dir / "community_district_metrics.csv"
    create_figure(metrics, audit, figure_path)
    export_metrics(metrics, metrics_path)

    paths = {
        "figure": figure_path,
        "metrics": metrics_path,
        "district_cache": data_dir / "community_districts.geojson",
        "parks_cache": data_dir / "parks_properties.geojson",
    }
    return metrics, audit, paths


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Calculate and map recorded community garden acreage relative "
            "to NYC Parks Properties acreage by Community District."
        )
    )
    parser.add_argument(
        "--garden-csv",
        type=Path,
        help="Optional path to the archived GreenThumb CSV.",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Refresh the cached official district and parks GeoJSON files.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    metrics, audit, paths = run_analysis(
        garden_csv=args.garden_csv,
        refresh=args.refresh,
    )
    finite_ratios = metrics["garden_to_parkland_pct"].dropna()
    top = metrics.loc[finite_ratios.idxmax()]
    print(
        f"Analyzed {len(metrics)} Community Districts and "
        f"{audit['total_records']} garden records."
    )
    print(
        "Highest ratio: "
        f"{top['district']} ({top['garden_to_parkland_pct']:.2f}%)."
    )
    print(f"Figure saved to: {paths['figure']}")
    print(f"Metrics saved to: {paths['metrics']}")


if __name__ == "__main__":
    main()
