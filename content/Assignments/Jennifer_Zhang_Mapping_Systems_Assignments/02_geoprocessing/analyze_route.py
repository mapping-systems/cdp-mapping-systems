"""Relate a privacy-safe daily study route to NYC public Wi-Fi records."""

from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.patches import Patch
from shapely.geometry import LineString


HERE = Path(__file__).resolve().parent
RELATED_DATA_DIR = HERE / "related_data"
WIFI_GEOJSON = RELATED_DATA_DIR / "nyc_wifi_hotspots_clean.geojson"
ROUTE_GEOJSON = HERE / "daily_study_loop.geojson"
OUTPUT_DIR = HERE / "outputs"

ANALYSIS_CRS = "EPSG:2263"
OUTPUT_CRS = "EPSG:4326"
BUFFER_M = 250.0
SAMPLE_INTERVAL_M = 25.0
FEET_PER_METER = 3.28084
ACCESS_ORDER = ["Free", "Limited Free", "Partner Site"]
ACCESS_COLORS = {
    "Free": "#167d91",
    "Limited Free": "#e59f23",
    "Partner Site": "#7b61a8",
}


def load_inputs() -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    """Load and validate the personal narrative and related Wi-Fi layers."""
    route_all = gpd.read_file(ROUTE_GEOJSON)
    if route_all.crs is None:
        route_all = route_all.set_crs(OUTPUT_CRS)
    else:
        route_all = route_all.to_crs(OUTPUT_CRS)

    required_properties = {"feature_id", "name", "feature_type", "narrative", "privacy_level"}
    missing_properties = required_properties.difference(route_all.columns)
    if missing_properties:
        raise ValueError(f"Narrative GeoJSON is missing fields: {sorted(missing_properties)}")
    if route_all["feature_id"].duplicated().any():
        raise ValueError("feature_id must be unique")

    geometry_counts = route_all.geometry.geom_type.value_counts().to_dict()
    if geometry_counts.get("LineString", 0) != 1 or geometry_counts.get("Point", 0) < 1:
        raise ValueError("Expected one LineString route and at least one Point stop")
    if not route_all.geometry.is_valid.all():
        raise ValueError("Narrative GeoJSON contains invalid geometry")

    if not WIFI_GEOJSON.exists():
        raise FileNotFoundError(
            "Missing related_data/nyc_wifi_hotspots_clean.geojson; "
            "see README.md for the NYC Open Data source."
        )
    wifi = gpd.read_file(WIFI_GEOJSON)

    required_wifi = {"objectid", "name", "provider", "type", "location_t", "geometry"}
    missing_wifi = required_wifi.difference(wifi.columns)
    if missing_wifi:
        raise ValueError(f"Related Wi-Fi layer is missing fields: {sorted(missing_wifi)}")
    wifi = wifi.dropna(subset=["objectid", "type", "geometry"]).to_crs(OUTPUT_CRS)
    if not wifi.geometry.geom_type.eq("Point").all():
        raise ValueError("Wi-Fi related dataset must contain Point geometry")

    return route_all, wifi


def process_inputs(
    route_all: gpd.GeoDataFrame,
    wifi: gpd.GeoDataFrame,
    buffer_m: float = BUFFER_M,
) -> dict[str, object]:
    """Project, buffer, intersect, nearest-join, count, and enrich the inputs."""
    route_line = route_all[route_all.geometry.geom_type.eq("LineString")].copy()
    stops = route_all[route_all.geometry.geom_type.eq("Point")].sort_values("sequence").copy()

    route_projected = route_line.to_crs(ANALYSIS_CRS)
    stops_projected = stops.to_crs(ANALYSIS_CRS)
    wifi_projected = wifi.to_crs(ANALYSIS_CRS)

    buffer_feet = buffer_m * FEET_PER_METER
    route_geometry = route_projected.geometry.iloc[0]
    buffer_projected = gpd.GeoDataFrame(
        {
            "feature_id": ["route-buffer-250m"],
            "buffer_m": [buffer_m],
            "method": ["Euclidean buffer around generalized route in EPSG:2263"],
        },
        geometry=[route_geometry.buffer(buffer_feet)],
        crs=ANALYSIS_CRS,
    )

    nearby = gpd.sjoin(
        wifi_projected,
        buffer_projected[["geometry"]],
        how="inner",
        predicate="intersects",
    ).drop(columns="index_right")
    nearby["distance_to_route_m"] = nearby.geometry.distance(route_geometry) / FEET_PER_METER
    nearby = nearby.sort_values(["distance_to_route_m", "objectid"]).copy()

    nearest_fields = wifi_projected[
        ["objectid", "name", "provider", "type", "location_t", "geometry"]
    ].rename(
        columns={
            "objectid": "nearest_wifi_objectid",
            "name": "nearest_wifi_name",
            "provider": "nearest_provider",
            "type": "nearest_access_type",
            "location_t": "nearest_location_type",
        }
    )
    nearest = gpd.sjoin_nearest(
        stops_projected,
        nearest_fields,
        how="left",
        distance_col="nearest_distance_ft",
    )
    nearest = nearest.sort_values(["feature_id", "nearest_distance_ft", "nearest_wifi_objectid"])
    nearest = nearest.drop_duplicates("feature_id", keep="first").copy()
    nearest["nearest_distance_m"] = nearest["nearest_distance_ft"] / FEET_PER_METER
    nearest["distance_along_route_m"] = nearest.geometry.apply(route_geometry.project) / FEET_PER_METER

    stop_buffers = stops_projected[["feature_id", "geometry"]].copy()
    stop_buffers.geometry = stop_buffers.geometry.buffer(buffer_feet)
    stop_join = gpd.sjoin(
        wifi_projected[["objectid", "geometry"]],
        stop_buffers,
        how="inner",
        predicate="intersects",
    )
    counts = stop_join.groupby("feature_id")["objectid"].nunique()
    nearest["wifi_records_within_250m"] = nearest["feature_id"].map(counts).fillna(0).astype(int)

    connection_rows = []
    for _, row in nearest.iterrows():
        wifi_geometry = wifi_projected.loc[row["index_right"], "geometry"]
        connection_rows.append(
            {
                "feature_id": row["feature_id"],
                "stop_name": row["name"],
                "distance_m": row["nearest_distance_m"],
                "geometry": LineString([row.geometry, wifi_geometry]),
            }
        )
    connections = gpd.GeoDataFrame(connection_rows, crs=ANALYSIS_CRS)

    route_length_ft = route_geometry.length
    sample_interval_ft = SAMPLE_INTERVAL_M * FEET_PER_METER
    sample_positions_ft = np.arange(0.0, route_length_ft, sample_interval_ft)
    if not len(sample_positions_ft) or not np.isclose(sample_positions_ft[-1], route_length_ft):
        sample_positions_ft = np.append(sample_positions_ft, route_length_ft)
    route_samples = gpd.GeoDataFrame(
        {
            "sample_id": [f"sample-{i:03d}" for i in range(len(sample_positions_ft))],
            "distance_along_route_m": sample_positions_ft / FEET_PER_METER,
        },
        geometry=[route_geometry.interpolate(position) for position in sample_positions_ft],
        crs=ANALYSIS_CRS,
    )
    sample_nearest = gpd.sjoin_nearest(
        route_samples,
        nearest_fields,
        how="left",
        distance_col="nearest_distance_ft",
    )
    sample_nearest = sample_nearest.sort_values(
        ["sample_id", "nearest_distance_ft", "nearest_wifi_objectid"]
    ).drop_duplicates("sample_id", keep="first")
    sample_nearest["nearest_distance_m"] = sample_nearest["nearest_distance_ft"] / FEET_PER_METER
    sample_nearest["within_250m"] = sample_nearest["nearest_distance_m"] <= buffer_m

    citywide_composition = (
        wifi["type"].value_counts().reindex(ACCESS_ORDER, fill_value=0) / len(wifi) * 100
    )
    corridor_composition = (
        nearby["type"].value_counts().reindex(ACCESS_ORDER, fill_value=0) / len(nearby) * 100
        if len(nearby)
        else pd.Series(0.0, index=ACCESS_ORDER)
    )

    return {
        "route_all": route_all,
        "wifi": wifi,
        "route_projected": route_projected,
        "stops_projected": stops_projected,
        "wifi_projected": wifi_projected,
        "buffer_projected": buffer_projected,
        "nearby_projected": nearby,
        "enriched_stops_projected": nearest,
        "connections_projected": connections,
        "route_samples_projected": sample_nearest,
        "citywide_composition": citywide_composition,
        "corridor_composition": corridor_composition,
        "buffer_m": buffer_m,
    }


def create_context_map(result: dict[str, object]) -> plt.Figure:
    """Create the route-buffer-intersection map from processed geometries."""
    route = result["route_projected"]
    stops = result["stops_projected"]
    buffer_layer = result["buffer_projected"]
    nearby = result["nearby_projected"]
    connections = result["connections_projected"]

    fig, ax = plt.subplots(figsize=(10, 9))
    buffer_layer.plot(ax=ax, color="#dbeafe", alpha=0.50, edgecolor="#2563eb", linewidth=1.2)
    connections.plot(ax=ax, color="#7c3aed", linewidth=1.0, linestyle="--", alpha=0.75, label="Nearest Wi-Fi connection")
    route.plot(ax=ax, color="#e11d48", linewidth=4.0, label="Generalized daily route", zorder=4)

    providers = list(nearby["provider"].fillna("Not specified").value_counts().index)
    provider_colors = plt.cm.Set2(np.linspace(0, 1, max(len(providers), 1)))
    for provider, color in zip(providers, provider_colors):
        group = nearby[nearby["provider"].fillna("Not specified") == provider]
        group.plot(
            ax=ax,
            color=color,
            markersize=58,
            alpha=0.95,
            edgecolor="white",
            linewidth=0.7,
            label=f"{provider} (n={len(group)})",
            zorder=5,
        )

    stops.plot(ax=ax, color="#111827", markersize=65, edgecolor="white", linewidth=0.8, zorder=6, label="Named daily-life stop")
    label_offsets = {
        "stop-01": (8, 8),
        "stop-02": (8, 8),
        "stop-03": (8, -18),
        "stop-04": (8, 8),
    }
    for _, row in stops.iterrows():
        ax.annotate(
            row["name"].replace("–Columbia University", ""),
            (row.geometry.x, row.geometry.y),
            xytext=label_offsets.get(row["feature_id"], (8, 8)),
            textcoords="offset points",
            fontsize=8.5,
            bbox={"boxstyle": "round,pad=0.22", "facecolor": "white", "alpha": 0.88, "edgecolor": "none"},
            zorder=7,
        )

    minx, miny, maxx, maxy = buffer_layer.total_bounds
    scale_x = minx + (maxx - minx) * 0.05
    scale_y = miny + (maxy - miny) * 0.055
    scale_length_ft = 250 * FEET_PER_METER
    ax.plot([scale_x, scale_x + scale_length_ft], [scale_y, scale_y], color="#111827", linewidth=2.5)
    ax.text(scale_x + scale_length_ft / 2, scale_y + (maxy - miny) * 0.018, "250 m", ha="center", fontsize=8.5)
    ax.annotate(
        "N",
        xy=(0.955, 0.93),
        xytext=(0.955, 0.84),
        xycoords="axes fraction",
        textcoords="axes fraction",
        ha="center",
        va="center",
        fontsize=10,
        fontweight="bold",
        arrowprops={"arrowstyle": "-|>", "color": "#111827", "linewidth": 1.5},
    )

    ax.set_title("A daily study route and recorded public Wi-Fi locations")
    ax.set_axis_off()
    handles, labels = ax.get_legend_handles_labels()
    handles.insert(0, Patch(facecolor="#dbeafe", edgecolor="#2563eb", alpha=0.50))
    labels.insert(0, "250 m route corridor")
    ax.legend(handles, labels, loc="upper left", frameon=True, fontsize=8.5, title="Geoprocessing result")
    fig.text(
        0.5,
        0.035,
        "Buffer and nearest distances are Euclidean measures in EPSG:2263; they are not walking routes or signal coverage.",
        ha="center",
        fontsize=9.5,
    )
    fig.tight_layout(rect=[0, 0.055, 1, 1])
    return fig


def create_summary_figure(result: dict[str, object]) -> plt.Figure:
    """Plot the route proximity profile and citywide/corridor composition."""
    nearest = result["enriched_stops_projected"].sort_values("distance_along_route_m")
    samples = result["route_samples_projected"].sort_values("distance_along_route_m")
    citywide = result["citywide_composition"]
    corridor = result["corridor_composition"]

    fig, (ax_distance, ax_composition) = plt.subplots(
        1,
        2,
        figsize=(14, 6.5),
        gridspec_kw={"wspace": 0.34},
        layout="constrained",
    )

    x = samples["distance_along_route_m"].to_numpy()
    y = samples["nearest_distance_m"].to_numpy()
    ax_distance.plot(x, y, color="#167d91", linewidth=2.2, marker="o", markersize=3.4)
    ax_distance.fill_between(x, y, BUFFER_M, where=y <= BUFFER_M, color="#167d91", alpha=0.12)
    ax_distance.fill_between(x, BUFFER_M, y, where=y > BUFFER_M, color="#e11d48", alpha=0.15)
    ax_distance.axhline(BUFFER_M, color="#e11d48", linestyle="--", linewidth=1.4, label="250 m comparison threshold")
    for _, row in nearest.iterrows():
        short_name = {
            "116 St–Columbia University subway entrance": "116 St",
            "Morningside Park west entrance": "Park",
            "Fayerweather Hall": "Fayerweather",
            "Butler Library": "Butler",
        }.get(row["name"], row["name"])
        ax_distance.axvline(row["distance_along_route_m"], color="#6b7280", linewidth=0.8, alpha=0.6)
        ax_distance.text(
            row["distance_along_route_m"],
            ax_distance.get_ylim()[1] * 0.97,
            short_name,
            rotation=90,
            va="top",
            ha="right",
            fontsize=8,
        )
    within_share = samples["within_250m"].mean() * 100
    ax_distance.text(
        0.02,
        0.05,
        f"{within_share:.0f}% of 25 m samples are within 250 m",
        transform=ax_distance.transAxes,
        fontsize=9,
        bbox={"boxstyle": "round,pad=0.25", "facecolor": "white", "alpha": 0.9, "edgecolor": "#d1d5db"},
    )
    ax_distance.set_xlabel("Distance along generalized route (m)")
    ax_distance.set_ylabel("Nearest recorded Wi-Fi distance (m)")
    ax_distance.set_title("A 25 m route-sampling proximity profile")
    ax_distance.grid(alpha=0.18)
    ax_distance.legend(loc="upper right")

    composition = pd.DataFrame({"NYC inventory": citywide, "250 m route corridor": corridor}).T
    left = np.zeros(len(composition))
    for category in ACCESS_ORDER:
        values = composition[category].to_numpy()
        ax_composition.barh(composition.index, values, left=left, color=ACCESS_COLORS[category], label=category)
        for yi, (start, value) in enumerate(zip(left, values)):
            if value >= 7:
                ax_composition.text(start + value / 2, yi, f"{value:.0f}%", ha="center", va="center", color="white", fontweight="bold")
        left += values
    ax_composition.set_xlim(0, 100)
    ax_composition.set_xlabel("Share of hotspot records")
    ax_composition.set_title("The spatial join creates a local comparison subset")
    ax_composition.grid(axis="x", alpha=0.18)
    ax_composition.legend(title="Published access type", bbox_to_anchor=(0.5, -0.18), loc="upper center", ncol=3)

    fig.suptitle("Relating a daily route to a citywide Wi-Fi inventory", fontsize=16, fontweight="bold")
    return fig


def write_outputs(result: dict[str, object]) -> dict[str, object]:
    """Write required and supporting outputs in web-compatible EPSG:4326."""
    OUTPUT_DIR.mkdir(exist_ok=True)
    nearby = result["nearby_projected"].copy()
    enriched = result["enriched_stops_projected"].copy()
    buffer_layer = result["buffer_projected"].copy()
    samples = result["route_samples_projected"].copy()
    connections = result["connections_projected"].copy()

    nearby_keep = [
        "objectid",
        "name",
        "provider",
        "type",
        "location_t",
        "boroname",
        "distance_to_route_m",
        "geometry",
    ]
    if "ntaname" in nearby.columns:
        nearby_keep.insert(-2, "ntaname")
    nearby[nearby_keep].to_crs(OUTPUT_CRS).to_file(
        OUTPUT_DIR / "route_wifi_context.geojson", driver="GeoJSON"
    )

    enriched_keep = [
        "feature_id",
        "name",
        "feature_type",
        "sequence",
        "activity",
        "narrative",
        "privacy_level",
        "nearest_wifi_objectid",
        "nearest_wifi_name",
        "nearest_provider",
        "nearest_access_type",
        "nearest_location_type",
        "nearest_distance_m",
        "distance_along_route_m",
        "wifi_records_within_250m",
        "geometry",
    ]
    enriched_output = enriched[enriched_keep].to_crs(OUTPUT_CRS)
    enriched_output.to_file(OUTPUT_DIR / "daily_stops_wifi_enriched.geojson", driver="GeoJSON")
    enriched_output.drop(columns="geometry").to_csv(OUTPUT_DIR / "nearest_wifi_by_stop.csv", index=False)
    buffer_layer.to_crs(OUTPUT_CRS).to_file(OUTPUT_DIR / "route_250m_buffer.geojson", driver="GeoJSON")
    samples[
        [
            "sample_id",
            "distance_along_route_m",
            "nearest_wifi_objectid",
            "nearest_wifi_name",
            "nearest_provider",
            "nearest_access_type",
            "nearest_distance_m",
            "within_250m",
            "geometry",
        ]
    ].to_crs(OUTPUT_CRS).to_file(OUTPUT_DIR / "route_proximity_samples.geojson", driver="GeoJSON")
    connections.to_crs(OUTPUT_CRS).to_file(OUTPUT_DIR / "nearest_wifi_connections.geojson", driver="GeoJSON")

    context_map = create_context_map(result)
    context_map.savefig(OUTPUT_DIR / "01_route_wifi_geoprocessing_map.png", dpi=180, bbox_inches="tight")
    plt.close(context_map)
    summary_figure = create_summary_figure(result)
    summary_figure.savefig(OUTPUT_DIR / "02_route_proximity_profile.png", dpi=180, bbox_inches="tight")
    plt.close(summary_figure)

    audit = {
        "personal_input_features": int(len(result["route_all"])),
        "route_features": int(result["route_all"].geometry.geom_type.eq("LineString").sum()),
        "stop_features": int(result["route_all"].geometry.geom_type.eq("Point").sum()),
        "related_wifi_input_records": int(len(result["wifi"])),
        "analysis_crs": ANALYSIS_CRS,
        "output_crs": OUTPUT_CRS,
        "route_buffer_m": float(result["buffer_m"]),
        "route_length_m": round(float(result["route_projected"].geometry.iloc[0].length / FEET_PER_METER), 1),
        "wifi_records_intersecting_route_buffer": int(len(nearby)),
        "corridor_access_type_counts": {k: int(v) for k, v in nearby["type"].value_counts().items()},
        "nearest_join_missing": int(enriched["nearest_wifi_objectid"].isna().sum()),
        "nearest_distance_min_m": round(float(enriched["nearest_distance_m"].min()), 1),
        "nearest_distance_max_m": round(float(enriched["nearest_distance_m"].max()), 1),
        "route_sample_interval_m": SAMPLE_INTERVAL_M,
        "route_sample_count": int(len(samples)),
        "route_sample_nearest_distance_median": round(float(samples["nearest_distance_m"].median()), 1),
        "route_sample_nearest_distance_max": round(float(samples["nearest_distance_m"].max()), 1),
        "route_samples_within_250m_pct": round(float(samples["within_250m"].mean() * 100), 1),
        "output_stop_rows": int(len(enriched_output)),
    }
    (OUTPUT_DIR / "geoprocessing_audit.json").write_text(json.dumps(audit, indent=2) + "\n")
    return audit


def run_analysis(write: bool = True) -> tuple[dict[str, object], dict[str, object] | None]:
    """Run the complete workflow and optionally write all deliverables."""
    route_all, wifi = load_inputs()
    result = process_inputs(route_all, wifi)
    audit = write_outputs(result) if write else None
    return result, audit


def main() -> None:
    result, audit = run_analysis(write=True)
    nearest = result["enriched_stops_projected"]
    print(json.dumps(audit, indent=2))
    print("\nNearest recorded hotspot by stop:")
    print(
        nearest[
            ["name", "nearest_wifi_name", "nearest_provider", "nearest_access_type", "nearest_distance_m", "wifi_records_within_250m"]
        ].to_string(index=False, formatters={"nearest_distance_m": "{:.1f}".format})
    )


if __name__ == "__main__":
    main()
