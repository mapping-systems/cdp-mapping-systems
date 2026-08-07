"""Create, execute, and validate the Networks assignment notebook."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import nbformat
from nbformat.v4 import new_code_cell, new_markdown_cell, new_notebook


NOTEBOOK_NAME = "03_networks.ipynb"
PROJECT_DIR = Path(__file__).resolve().parent.parent

if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from shared.notebook_runtime import current_python_kernel


def build_notebook(assignment_dir: Path) -> Path:
    """Generate a concise reader-facing notebook with an auditable execution path."""

    cells = [
        new_markdown_cell(
            """# Rents and the Last Walk to the Subway

**Mapping Systems — Assignment 04: Networks**<br>
**Study window:** July 2016 to June 2026  
**Geography:** 31 StreetEasy rent-neighborhood centers in Manhattan

## Research statement

How different is the straight-line distance from each Manhattan rent-neighborhood center to its **walking-network-nearest subway station** from the actual shortest pedestrian-network distance to that same station? How does that gap change the experience implied by a simple proximity map, and what non-causal relationship—if any—appears between walking distance and nominal median asking-rent growth?

The target station is selected by the pedestrian network, not by Euclidean proximity. Only after the target is fixed do I measure Euclidean distance to that same station. This makes the comparison like-for-like."""
        ),
        new_markdown_cell(
            """## tl;dr

The next cell is computed from the executed routes so that the summary cannot drift away from the data."""
        ),
        new_code_cell(
            '''from pathlib import Path
import sys

import matplotlib.pyplot as plt
import pandas as pd
from IPython.display import Markdown, display

assignment_candidates = [Path.cwd(), Path.cwd() / "03_networks"]
ASSIGNMENT_DIR = next(
    candidate.resolve()
    for candidate in assignment_candidates
    if (candidate / "network_analysis.py").exists()
)
if str(ASSIGNMENT_DIR) not in sys.path:
    sys.path.insert(0, str(ASSIGNMENT_DIR))

from network_analysis import (
    plot_distance_comparison,
    plot_rent_relationship,
    plot_route_map,
    run_analysis,
)

analysis = run_analysis(
    ASSIGNMENT_DIR,
    refresh_osm=False,
    write_figures=False,
)
results = analysis["results"]
routes = analysis["routes"]
validation = analysis["validation"]
reachable = results[results["status"] == "reachable"].copy()

largest_detour = reachable.loc[reachable["detour_ratio"].idxmax()]
display(Markdown(
    f"""- All **{validation['reachable_count']} of {validation['result_neighborhood_count']}** neighborhood centers reach a Manhattan subway station in the graph.
- Median walking-network distance is **{validation['median_network_distance_m']:.0f} m**; the median detour ratio is **{validation['median_detour_ratio']:.2f}×**.
- **{validation['station_choice_changed_count']} of 31** network-nearest station choices differ from the station that looks nearest in Euclidean space.
- The largest detour is **{largest_detour['neighborhood']} → {largest_detour['target_station']}** at **{largest_detour['detour_ratio']:.2f}×** ({largest_detour['euclidean_distance_m']:.0f} m straight-line versus {largest_detour['network_distance_m']:.0f} m walking).
- Network distance and rent growth have a descriptive Spearman correlation of **{validation['spearman_network_distance_vs_growth']:.2f}**. This small, selected set of neighborhood centers cannot support a causal claim."""
))'''
        ),
        new_markdown_cell(
            """## Context & methods

### What counts as a network?

The network is an undirected pedestrian graph. Intersections and path junctions are nodes; walkable OpenStreetMap segments are edges; each edge is weighted by its OSMnx length in meters. A rent-neighborhood center and each GTFS parent station are off-network observations, so both are snapped to the nearest graph node and their connector distances are included.

### Target-selection algorithm

1. Filter the 496-citywide GTFS parent-station points to those intersecting the Manhattan NTA boundary.
2. Snap the 31 neighborhood centers and Manhattan stations to a real OSMnx walking graph.
3. Temporarily connect all station nodes to a super-node. Each connection is weighted by the station-to-network snap distance.
4. Run NetworkX Dijkstra from each neighborhood node to the super-node using `length`.
5. The penultimate node identifies the station with minimum **network** distance. Add the origin snap connector.
6. Project the original origin and that same selected station to EPSG:2263 and measure their Euclidean distance.

### Key assumptions

- A StreetEasy neighborhood center is a representation point, not every resident's home.
- A GTFS parent-station coordinate is a station reference point, not a specific entrance.
- Walking distance includes mapped paths and two straight snap connectors; it does not include crossing delay, stairs, slope, crowding, safety, or temporary closures.
- Asking rent describes advertised listings, not the rent currently paid by all tenants. Growth is nominal and not inflation-adjusted.
- Any rent/access association is descriptive. There is no causal design or control for income, housing supply, zoning, station service, or neighborhood change."""
        ),
        new_markdown_cell("## Data"),
        new_code_cell(
            """input_checks = pd.Series(analysis["inputs"]["input_checks"], name="observed")
display(input_checks.to_frame())

rent_preview = results[[
    "neighborhood", "baseline_rent_usd", "latest_rent_usd", "growth_pct"
]].head(8)
display(rent_preview.style.format({
    "baseline_rent_usd": "${:,.0f}",
    "latest_rent_usd": "${:,.0f}",
    "growth_pct": "{:.1f}%",
}))"""
        ),
        new_markdown_cell(
            """The rent input has a complete 120-month series for every neighborhood. Only the first and last months define `growth_pct`; the monthly histories are retained in the source file. Station and NTA layers are WGS84 GeoJSON. EPSG:2263 is used only when a planar straight-line distance is needed."""
        ),
        new_markdown_cell("## Creating the pedestrian network"),
        new_code_cell(
            """graph_summary = {
    "nodes": analysis["graph"].number_of_nodes(),
    "edges": analysis["graph"].number_of_edges(),
    "directed": analysis["graph"].is_directed(),
    "crs": analysis["graph"].graph.get("crs"),
    "network_type": "walk",
    "boundary": "Manhattan NTAs + 1,500 m buffer",
    "source_mode": analysis["graph_manifest"].get("source", {}).get(
        "mode", analysis["graph_manifest"].get("loaded_from")
    ),
}
display(pd.Series(graph_summary, name="network snapshot").to_frame())"""
        ),
        new_markdown_cell(
            """The executed version uses the bounded, hash-manifested OSMnx snapshot in `data/network_snapshot/`. It was derived from the verified NYC TIME FIELD OSM walk graph retrieved on 2026-07-27. This fixes the network for reproducibility. `python build_assignment.py --refresh-osm` explicitly attempts a fresh Overpass download; if that service fails, the build records the error and falls back to the verified graph instead of inventing distances."""
        ),
        new_markdown_cell("## Nodes, routes, and measured distances"),
        new_code_cell(
            """route_table = reachable[[
    "neighborhood",
    "target_station",
    "target_routes",
    "euclidean_distance_m",
    "network_distance_m",
    "detour_ratio",
    "estimated_walk_minutes",
    "growth_pct",
    "target_differs_from_euclidean_nearest",
]].sort_values("detour_ratio", ascending=False)

display(route_table.head(12).style.format({
    "euclidean_distance_m": "{:.0f}",
    "network_distance_m": "{:.0f}",
    "detour_ratio": "{:.2f}×",
    "estimated_walk_minutes": "{:.1f}",
    "growth_pct": "{:.1f}%",
}))"""
        ),
        new_markdown_cell("## Map: shortest walking routes"),
        new_code_cell(
            """route_figure = plot_route_map(
    analysis["paths"],
    analysis["inputs"]["nta"],
    results,
    routes,
    analysis["stations"],
    close=False,
)
plt.show()
plt.close(route_figure["figure"])"""
        ),
        new_markdown_cell(
            """The map makes two abstractions visible at once: each origin is a single neighborhood reference point, and each route ends at a parent-station point. The highlighted route has the largest ratio between network and straight-line distance. Streets, crossings, parks, blocks, and access points make a visually short gap longer in practice."""
        ),
        new_markdown_cell("## Chart: Euclidean distance versus network distance"),
        new_code_cell(
            """distance_figure = plot_distance_comparison(
    analysis["paths"],
    results,
    close=False,
)
plt.show()
plt.close(distance_figure["figure"])"""
        ),
        new_markdown_cell(
            """The orange circle and blue square always refer to the **same station**. The connector between them is therefore not a station-choice artifact: it is the distance added by moving through the mapped walkable graph and by connecting each observation to that graph. A straight line can cross buildings, blocks, park edges, rail infrastructure, or inaccessible station sides; a pedestrian route cannot."""
        ),
        new_markdown_cell("## Chart: distance and asking-rent growth"),
        new_code_cell(
            """rent_figure = plot_rent_relationship(
    analysis["paths"],
    results,
    validation,
    close=False,
)
plt.show()
plt.close(rent_figure["figure"])"""
        ),
        new_markdown_cell(
            """The fitted line is a visual description, not an explanatory model. With only 31 hand-positioned neighborhood centers, a single high-growth and comparatively distant observation can influence the pattern. Rent growth may covary with many omitted factors, while this analysis measures only one point per named market area and one station-access route."""
        ),
        new_markdown_cell("## Checks"),
        new_code_cell(
            """check_table = pd.Series({
    "31 unique results": validation["result_neighborhood_count"] == 31
        and validation["duplicate_neighborhood_ids"] == 0,
    "all origins reachable": validation["unreachable_count"] == 0,
    "one route per reachable origin": validation["route_feature_count"]
        == validation["reachable_count"],
    "network ≥ Euclidean (5 m tolerance)":
        validation["network_shorter_than_euclidean_violations"] == 0,
    "route weight reconstructed":
        validation["max_route_reconstruction_error_m"] < 1e-6,
    "all automated checks": validation["all_checks_pass"],
}, name="passed")
display(check_table.to_frame())

display(Markdown(
    f"Unreachable handling is explicit: an origin without a station in its connected "
    f"component receives `status='unreachable'` and null distance fields, and is excluded "
    f"from correlations and maps. In this run the unreachable count is "
    f"**{validation['unreachable_count']}**."
))"""
        ),
        new_markdown_cell("## Takeaways and reflection"),
        new_code_cell(
            '''changed_share = validation["station_choice_changed_count"] / 31
display(Markdown(
    f"""1. **Euclidean proximity is an incomplete experience of access.** The median route is {validation['median_detour_ratio']:.2f} times the direct distance, even after choosing the station that is best on the network.
2. **The network can change the destination, not only the distance.** In {validation['station_choice_changed_count']} neighborhoods ({changed_share:.0%}), the network-selected station is not the Euclidean-nearest station.
3. **Access and rent growth should not be collapsed into one story.** The observed Spearman association is {validation['spearman_network_distance_vs_growth']:.2f}, but the neighborhood centers, time-varying housing market, station service, and omitted social and land-use conditions prevent causal interpretation.
4. **A next iteration should start from residences and station entrances.** Sampling many residential points per neighborhood, routing to actual accessible entrances, and adding travel time, slope, crossings, and service frequency would describe lived access better than one centroid-to-parent-station route."""
))'''
        ),
        new_markdown_cell(
            """## Sources and reproducibility

- **StreetEasy:** [Data Dashboard](https://streeteasy.com/blog/data-dashboard/) / Master Report, median asking rent for all rentals. Local frozen analysis window: 2016-07 through 2026-06.
- **Pedestrian network:** [OpenStreetMap](https://www.openstreetmap.org/copyright), downloaded and simplified with OSMnx 2.1.0; bounded graph hash and provenance are recorded in `data/network_snapshot/manhattan_walk_manifest.json`.
- **Subway stations:** [MTA New York City Transit GTFS](https://web.mta.info/developers/data/nyct/subway/google_transit.zip), parent-station points prepared by the NYC TIME FIELD pipeline.
- **Boundary:** NYC Department of City Planning 2020 Neighborhood Tabulation Areas, Manhattan subset.

Run the whole assignment with:

```bash
python build_assignment.py
```

Generated tables, GeoJSON routes, validation JSON, and the executed Notebook are written inside this assignment directory. Maps and charts are rendered directly by the Notebook cells rather than loaded from saved image files."""
        ),
    ]

    notebook = new_notebook(
        cells=cells,
        metadata={
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3",
            },
            "language_info": {"name": "python", "version": "3.13"},
            "title": "Rents and the Last Walk to the Subway",
        },
    )
    notebook_path = assignment_dir / NOTEBOOK_NAME
    nbformat.write(notebook, notebook_path)
    return notebook_path


def execute_notebook(assignment_dir: Path, notebook_path: Path) -> None:
    """Execute with the same Python environment that invoked this builder."""

    with current_python_kernel() as (kernel_name, environment):
        subprocess.run(
            [
                sys.executable,
                "-m",
                "jupyter",
                "nbconvert",
                "--to",
                "notebook",
                "--execute",
                "--inplace",
                f"--ExecutePreprocessor.kernel_name={kernel_name}",
                "--ExecutePreprocessor.timeout=1200",
                str(notebook_path.name),
            ],
            cwd=assignment_dir,
            env=environment,
            check=True,
        )


def validate_build(assignment_dir: Path, notebook_path: Path) -> dict:
    """Fail loudly if execution, outputs, or analytical checks are incomplete."""

    notebook = nbformat.read(notebook_path, as_version=4)
    errors = [
        output
        for cell in notebook.cells
        if cell.cell_type == "code"
        for output in cell.get("outputs", [])
        if output.get("output_type") == "error"
    ]
    execution_counts = [
        cell.get("execution_count")
        for cell in notebook.cells
        if cell.cell_type == "code"
    ]
    validation_path = assignment_dir / "outputs/data/validation_summary.json"
    validation = json.loads(validation_path.read_text(encoding="utf-8"))
    required_paths = [
        assignment_dir / "outputs/data/network_distance_results.csv",
        assignment_dir / "outputs/data/neighborhood_centers_results.geojson",
        assignment_dir / "outputs/data/neighborhood_to_subway_routes.geojson",
        assignment_dir / "outputs/data/selected_subway_stations.geojson",
        assignment_dir / "data/network_snapshot/manhattan_walk.graphml.gz",
        assignment_dir / "data/network_snapshot/manhattan_walk_manifest.json",
    ]
    missing = [str(path) for path in required_paths if not path.exists()]
    if errors:
        raise RuntimeError(f"Notebook contains {len(errors)} execution error(s).")
    if not execution_counts or any(count is None for count in execution_counts):
        raise RuntimeError("Not every notebook code cell has an execution count.")
    if missing:
        raise FileNotFoundError(f"Missing required build outputs: {missing}")
    if not validation.get("all_checks_pass"):
        raise RuntimeError("Analytical validation did not pass; inspect validation_summary.json.")
    return {
        "code_cells": len(execution_counts),
        "errors": len(errors),
        "required_outputs": len(required_paths),
        "analytical_checks_pass": validation["all_checks_pass"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--refresh-osm",
        action="store_true",
        help="Try Overpass before rebuilding from the verified graph cache.",
    )
    parser.add_argument(
        "--no-execute",
        action="store_true",
        help="Only regenerate notebook source; do not execute it.",
    )
    args = parser.parse_args()
    assignment_dir = Path(__file__).resolve().parent
    notebook_path = build_notebook(assignment_dir)
    if args.no_execute:
        print(f"Notebook source written: {notebook_path}")
        return

    if args.refresh_osm:
        subprocess.run(
            [
                sys.executable,
                str(assignment_dir / "network_analysis.py"),
                "--assignment-dir",
                str(assignment_dir),
                "--refresh-osm",
            ],
            cwd=assignment_dir,
            check=True,
        )
    execute_notebook(assignment_dir, notebook_path)
    report = validate_build(assignment_dir, notebook_path)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
