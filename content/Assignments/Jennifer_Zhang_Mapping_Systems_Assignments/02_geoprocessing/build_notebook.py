"""Build the Assignment 02 notebook before executing it with Jupyter."""

from pathlib import Path

import nbformat as nbf


HERE = Path(__file__).resolve().parent
NOTEBOOK_PATH = HERE / "02_route_wifi_geoprocessing.ipynb"


def md(source: str):
    return nbf.v4.new_markdown_cell(source.strip())


def code(source: str, alt: str | None = None):
    cell = nbf.v4.new_code_cell(source.strip())
    if alt:
        cell.metadata["alt"] = alt
    return cell


cells = [
    md(
        """
# From Citywide Inventory to a Daily Route

**Author:** Jennifer Zhang  
**Mapping Systems — Assignment 02: Geoprocessing**

**Daily-life narrative:** A privacy-preserving mental map connects my generalized Columbia weekday routine: arriving at 116 St, moving to Fayerweather Hall, studying at Butler Library, and taking an outdoor break at Morningside Park.

**Spatial question:** Where does this generalized routine pass near a recorded public Wi-Fi location, and where along the route is the nearest listed hotspot farther away?

The personal route and the citywide Wi-Fi inventory have compatible spatial roles: a LineString supports corridor analysis, while route stops and hotspot records support point-to-point nearest joins.
"""
    ),
    md(
        """
## Required submission components

This folder sits inside the repository's `content/Assignments/` directory and contains every item requested in the brief:

| Brief requirement | Submitted item |
|---|---|
| Daily-life dataset in GeoJSON format | `daily_study_loop.geojson` |
| Proposed related dataset | [NYC Wi-Fi Hotspot Locations](https://data.cityofnewyork.us/d/yjub-udmw) |
| Markdown with the related-dataset link | `README.md` |
| Proposed methodology | `README.md` and Sections 3–10 below |
| Workflow expressed as a diagram | `workflow.svg` |

The executed analysis below is supporting evidence that the proposed relationship is feasible; it does not replace those required files.
"""
    ),
    code(
        """
from pathlib import Path

import geopandas as gpd
import matplotlib.pyplot as plt
import pandas as pd

from analyze_route import (
    ANALYSIS_CRS,
    BUFFER_M,
    OUTPUT_CRS,
    SAMPLE_INTERVAL_M,
    create_context_map,
    create_summary_figure,
    load_inputs,
    process_inputs,
    write_outputs,
)

pd.set_option("display.max_columns", 30)
"""
    ),
    md(
        """
## 1. Personal dataset: a mixed-geometry mental map

The personal GeoJSON deliberately contains two geometry roles:

- One **LineString** represents generalized movement.
- Four **Points** represent named public stops that can be nearest-joined to another point dataset.

Every feature has a stable ID, a narrative role, and a privacy label. The data are authored at public-place precision rather than extracted from private location history.
"""
    ),
    code(
        """
route_all, wifi = load_inputs()

print(f"Personal features: {len(route_all)}")
print(f"Personal CRS: {route_all.crs}")
print("Geometry types:")
display(route_all.geometry.geom_type.value_counts().rename_axis("geometry_type").to_frame("features"))

display(
    route_all[
        ["feature_id", "name", "feature_type", "sequence", "activity", "narrative", "privacy_level"]
    ].sort_values("sequence")
)
"""
    ),
    md(
        """
The route contains no home address, exact timestamps, or private destinations. Its purpose is to express a mental image of a routine—transit, studio, library, and park edge—while leaving the geometry suitable for spatial operations.
"""
    ),
    md(
        """
## 2. Proposed related dataset: NYC public Wi-Fi

The proposed related dataset is [NYC Wi-Fi Hotspot Locations](https://data.cityofnewyork.us/d/yjub-udmw), a citywide Point inventory published through NYC Open Data. A cleaned 3,319-point local copy is included at `related_data/nyc_wifi_hotspots_clean.geojson` so the analysis can be reproduced from this folder.

The relationship is useful because the personal dataset contains a route and stops, while the related dataset contains Points with `type`, `provider`, and `location_t`. This supports corridor intersection, point-to-point nearest joins, and a distance profile.
"""
    ),
    code(
        """
print(f"Related NYC Wi-Fi records: {len(wifi):,}")
print(f"Related CRS: {wifi.crs}")

wifi_metadata = pd.DataFrame(
    {
        "meaning": {
            "objectid": "Unique published inventory record identifier",
            "type": "Published access category",
            "provider": "Published operator/provider",
            "location_t": "Published site context",
            "geometry": "Recorded point location",
        },
        "role_in_02": {
            "objectid": "Preserve traceability after joins",
            "type": "Compare local corridor with citywide composition",
            "provider": "Distinguish nearby records on the map",
            "location_t": "Describe what kind of place the nearest record represents",
            "geometry": "Intersect the route buffer and measure nearest distance",
        },
    }
)
display(wifi_metadata)
display(wifi["type"].value_counts().rename_axis("access_type").to_frame("records"))
"""
    ),
    md(
        """
## 3. Proposed workflow diagram

![Workflow diagram showing the personal route and NYC public Wi-Fi data being validated, projected, buffered, spatially intersected, nearest-joined, sampled, and exported](workflow.svg)

The workflow creates three different spatial relationships:

1. **Point-to-buffer intersection:** Which Wi-Fi records fall inside 250 m of the route?
2. **Point-to-point nearest neighbor:** Which record is nearest to each named stop?
3. **Point samples along a line:** How does nearest-record distance change continuously along the generalized route?
"""
    ),
    md(
        """
## 4. Project before measuring

The source layers use longitude/latitude (`EPSG:4326`). Degrees are not a suitable unit for a 250 m buffer or local distance measurement, so every metric operation is performed in **NAD83 / New York Long Island (`EPSG:2263`)**.

`EPSG:2263` uses US survey feet. The pipeline explicitly converts the 250 m threshold and reports final distances in metres. Outputs are converted back to `EPSG:4326` for GitHub and web-map compatibility.
"""
    ),
    code(
        """
result = process_inputs(route_all, wifi, buffer_m=BUFFER_M)

route_length_m = result["route_projected"].geometry.iloc[0].length / 3.28084
nearby = result["nearby_projected"]
enriched_stops = result["enriched_stops_projected"]
samples = result["route_samples_projected"]

print(f"Analysis CRS: {ANALYSIS_CRS}")
print(f"Output CRS: {OUTPUT_CRS}")
print(f"Generalized route length: {route_length_m:,.1f} m")
print(f"Route buffer: {BUFFER_M:.0f} m")
print(f"Route sampling interval: {SAMPLE_INTERVAL_M:.0f} m")
"""
    ),
    md(
        """
## 5. Buffer and spatial intersection

The route is buffered by 250 m and the related Wi-Fi Points are spatially filtered with `intersects`. This creates a local corridor subset without pretending the buffer is a radio-signal model.

The threshold is intentionally transparent and adjustable. It supports comparison; it is not evidence that every listed hotspot provides service across a 250 m radius.
"""
    ),
    code(
        """
print(f"Wi-Fi records intersecting the 250 m route corridor: {len(nearby)}")

print("Access types in corridor:")
display(nearby["type"].value_counts().rename_axis("access_type").to_frame("records"))

print("Providers in corridor:")
display(nearby["provider"].value_counts().rename_axis("provider").to_frame("records"))

display(
    nearby[
        ["objectid", "name", "provider", "type", "location_t", "distance_to_route_m"]
    ].head(10).style.format({"distance_to_route_m": "{:.1f} m"})
)
"""
    ),
    md(
        """
The 250 m corridor contains **15 records**, all published as `Free`: 11 LinkNYC records, 2 Transit Wireless records, 1 NYPL record, and 1 Harlem record. The lack of local `type` variation is itself a result; provider and location context still differ.

This subset cannot establish that all parts of the route receive Wi-Fi. It only says that a recorded Point lies within a geometric distance of the generalized LineString.
"""
    ),
    md(
        """
## 6. Nearest join and stop-level enrichment

`sjoin_nearest` attaches the nearest Wi-Fi record to each named stop and records projected straight-line distance. A separate 250 m stop buffer counts how many records lie near each stop.

The original Point geometry and personal narrative fields are preserved in the enriched output. Related attributes are added rather than replacing the authored dataset.
"""
    ),
    code(
        """
stop_table = enriched_stops[
    [
        "name",
        "activity",
        "nearest_wifi_name",
        "nearest_provider",
        "nearest_access_type",
        "nearest_location_type",
        "nearest_distance_m",
        "wifi_records_within_250m",
    ]
].copy()

display(
    stop_table.style.format(
        {
            "nearest_distance_m": "{:.1f} m",
            "wifi_records_within_250m": "{:,.0f}",
        }
    )
)
"""
    ),
    md(
        """
The nearest-record distances range from **8.9 m** at the 116 St subway entrance to **183.4 m** at the Morningside Park entrance. Fayerweather Hall and Butler Library are 160.7 m and 144.0 m from their nearest records.

These are Euclidean distances between generalized/recorded coordinates. Building entrances, walls, stairs, street crossings, and pedestrian routes are not modeled.
"""
    ),
    md(
        """
## 7. Sample the LineString every 25 m

Four stops alone cannot describe the entire route. Sampling the LineString every 25 m creates 49 analysis Points, then nearest-joins each Point to the Wi-Fi inventory. The resulting profile reveals where the route passes through larger gaps between records.
"""
    ),
    code(
        """
sample_summary = pd.Series(
    {
        "sample_count": len(samples),
        "median_nearest_distance_m": samples["nearest_distance_m"].median(),
        "maximum_nearest_distance_m": samples["nearest_distance_m"].max(),
        "samples_within_250m_pct": samples["within_250m"].mean() * 100,
    },
    name="route_proximity_summary",
)
display(sample_summary.to_frame().style.format("{:.1f}"))
"""
    ),
    md(
        """
The sampled-route result is more cautious than the four-stop table: the median sample is **204.2 m** from a listed hotspot, the maximum reaches **404.8 m**, and only **71.4%** of samples fall within the 250 m comparison threshold.

This does not prove a connectivity gap. It identifies parts of the authored route where the published point inventory is less proximate and suggests where field verification would be most useful.
"""
    ),
    md(
        """
## 8. Map the geoprocessing relationships

The map makes each operation visible: the translucent route buffer, intersecting Wi-Fi Points, the generalized LineString, named stops, and dashed stop-to-nearest-record connections. Provider colors distinguish the local records because all 15 share the same published access type.
"""
    ),
    code(
        """
context_map = create_context_map(result)
plt.show()
""",
        alt="Map of the generalized Columbia study route, its 250 metre buffer, 15 nearby Wi-Fi records by provider, four named stops, and dashed nearest-record connections.",
    ),
    md(
        """
## 9. Route profile and citywide comparison

The left panel converts the nearest joins for 49 samples into a continuous profile along the route. The right panel compares the complete related dataset's access-type composition with the local corridor subset created by the spatial intersection.
"""
    ),
    code(
        """
summary_figure = create_summary_figure(result)
plt.show()
""",
        alt="Two-panel chart showing nearest recorded Wi-Fi distance along 49 route samples and comparing citywide access-type shares with the all-Free 250 metre route corridor subset.",
    ),
    md(
        """
## 10. Export and validate

All measurement occurs in the projected CRS, while final GeoJSON is written in `EPSG:4326`. The audit records input counts, join completeness, route length, thresholds, and output row counts so the workflow can be checked without relying only on a screenshot.
"""
    ),
    code(
        """
audit = write_outputs(result)
display(pd.Series(audit, name="value").to_frame())

required_outputs = [
    "outputs/route_250m_buffer.geojson",
    "outputs/route_wifi_context.geojson",
    "outputs/daily_stops_wifi_enriched.geojson",
    "outputs/nearest_wifi_connections.geojson",
    "outputs/route_proximity_samples.geojson",
    "outputs/geoprocessing_audit.json",
    "outputs/01_route_wifi_geoprocessing_map.png",
    "outputs/02_route_proximity_profile.png",
]
for output in required_outputs:
    path = Path(output)
    assert path.exists() and path.stat().st_size > 0, f"Missing output: {output}"

print("All required and supporting outputs exist.")
"""
    ),
    md(
        """
## 11. What the relationship can and cannot tell us

### What it can support

- A reproducible 250 m corridor subset from the related point inventory.
- Nearest-record distances and nearby-record counts for four named daily-life stops.
- A 25 m sampled proximity profile along the authored LineString.
- A comparison between citywide and route-corridor published access categories.
- Specific places along the route that merit field verification.

### What it cannot support

- A hotspot Point is not a measured signal radius.
- Straight-line distance is not walking distance, travel time, or indoor accessibility.
- The inventory does not measure speed, uptime, congestion, login requirements, or current operation.
- The generalized route is a personal mental map, not exact GPS history or a representative student sample.
- Proximity does not mean the route caused infrastructure placement or that a user can connect.

The defensible conclusion is that geoprocessing turns the citywide inventory into a route-specific **proximity context**. It does not turn the inventory into proof of service coverage.
"""
    ),
]


notebook = nbf.v4.new_notebook(
    cells=cells,
    metadata={
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python", "version": "3.12"},
    },
)

nbf.write(notebook, NOTEBOOK_PATH)
print(f"Wrote {NOTEBOOK_PATH}")
