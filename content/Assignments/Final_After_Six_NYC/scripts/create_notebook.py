from __future__ import annotations

from pathlib import Path

import nbformat as nbf


PROJECT_DIR = Path(__file__).resolve().parents[1]
NOTEBOOK_DIR = PROJECT_DIR / "notebooks"
NOTEBOOK_PATH = NOTEBOOK_DIR / "culture_after_six_analysis.ipynb"


def code(source: str):
    return nbf.v4.new_code_cell(source.strip())


def markdown(source: str):
    return nbf.v4.new_markdown_cell(source.strip())


def main() -> None:
    NOTEBOOK_DIR.mkdir(parents=True, exist_ok=True)
    notebook = nbf.v4.new_notebook()
    notebook["metadata"] = {
        "kernelspec": {
            "display_name": "cdp (Python 3.13.14)",
            "language": "python",
            "name": "cdp",
        },
        "language_info": {"name": "python", "version": "3.13"},
    }

    notebook["cells"] = [
        markdown(
            """
# Culture After Six NYC

## tl;dr

This project asks: **How does cultural accessibility in Manhattan change when
geographic proximity is filtered by admission price, evening hours, and subway
access?**

The pilot combines 25 verified visit profiles, 2,268 geocoded cultural
organization records, 496 subway stations, and a schedule-weighted network with
1,002 station-line nodes. The median venue is **394 meters from a subway stop**,
but **604 meters from an ADA-accessible stop**. Walking-network trips from
Columbia are typically **15% longer than straight-line distance**. In the
example scenario below -- Friday, July 31 at 6:30 PM, for a New York student
with a $15 budget -- **9 of 25 venues** are both open and affordable.

The key finding is not that Manhattan lacks culture. It is that cultural
abundance and practical cultural access are different things.
"""
        ),
        markdown(
            """
## Context & Methods

This final expands the **Networks** assignment into a public-facing cultural
access tool. The personal starting point is a common after-class question:
where could a Columbia student realistically go tonight?

### Key Assumptions

- The study is a curated Manhattan pilot, not a complete directory.
- Subway travel uses a typical weekday MTA GTFS schedule from 4 PM to 4 AM,
  plus four minutes for initial waiting and a generic four-minute transfer
  penalty. It is a model, not live trip planning.
- Up to eight nearby destination stations are compared so the geometrically
  nearest stop does not automatically determine the route.
- Pay-what-you-wish admission is represented as $1 so that it can be compared
  with a numeric budget.
- Opening hours and admission policies change. The data was checked on
  July 24, 2026, and every record links to the venue's official page.
- Being nearby, open, and affordable still cannot measure whether a space feels
  socially welcoming or whether its programming is culturally relevant.
"""
        ),
        code(
            """
from pathlib import Path
import datetime as dt
import json

import geopandas as gpd
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
import numpy as np
import osmnx as ox
import pandas as pd
from shapely.geometry import LineString

PROJECT_DIR = Path.cwd()
if PROJECT_DIR.name == "notebooks":
    PROJECT_DIR = PROJECT_DIR.parent

DATA_DIR = PROJECT_DIR / "data"
FIGURE_DIR = PROJECT_DIR / "figures"
FIGURE_DIR.mkdir(exist_ok=True)

CORAL = "#F05A47"
GREEN = "#1F6B5C"
BLUE = "#2D5BFF"
INK = "#1B1B1B"
MUTED = "#8A8A84"
PAPER = "#F7F6F1"

plt.rcParams.update({
    "figure.facecolor": PAPER,
    "axes.facecolor": PAPER,
    "axes.edgecolor": INK,
    "axes.labelcolor": INK,
    "text.color": INK,
    "font.size": 11,
    "axes.titleweight": "bold",
})
"""
        ),
        markdown(
            """
## Data

The base venue locations and cultural disciplines come from NYC Department of
Cultural Affairs data. Admission programs come from DCLA's February 2026 free
and suggested admission page, then were checked against official venue pages.
Subway stops, ADA attributes, and weekday schedules come from the MTA. Walking
distances are calculated on OpenStreetMap paths with OSMnx and NetworkX.

Two cultural layers are kept separate on purpose: 25 profiles have manually
checked public-visit information, while the 2,268 DCLA points form a discovery
and coverage layer. A DCLA coordinate may be an office or mailing address, so
it is not automatically treated as a visitable venue.
"""
        ),
        code(
            """
venues = gpd.read_file(DATA_DIR / "venues.geojson")
stations = gpd.read_file(DATA_DIR / "subway_stations.geojson")
directory = gpd.read_file(DATA_DIR / "dcla_organizations.geojson")
transit_routes = gpd.read_file(DATA_DIR / "columbia_transit_routes.geojson")
summary = json.loads((DATA_DIR / "analysis_summary.json").read_text())
subway_network = json.loads((DATA_DIR / "subway_network.json").read_text())

venues["hours"] = venues["hours"].apply(
    lambda value: json.loads(value) if isinstance(value, str) else value
)
venues["access_programs"] = venues["access_programs"].apply(
    lambda value: json.loads(value) if isinstance(value, str) else value
)
venues["data_checked"] = pd.to_datetime(venues["data_checked"]).dt.date

print(f"Venues: {len(venues):,}")
print(f"Verified visit profiles: {len(venues):,}")
print(f"Geocoded DCLA directory records: {len(directory):,}")
print(f"Subway station records: {len(stations):,}")
print(
    "Station-line network: "
    f"{summary['subway_network_node_count']:,} nodes / "
    f"{summary['subway_network_edge_count']:,} directed edges"
)
print(f"Data checked: {summary['data_checked']}")
display(
    venues[
        [
            "name",
            "category",
            "standard_price_label",
            "nearest_station",
            "station_walk_m",
            "ada_station_walk_m",
        ]
    ].head(8)
)
"""
        ),
        code(
            """
required = [
    "name",
    "geometry",
    "hours",
    "adult_price",
    "student_price",
    "station_walk_m",
    "ada_station_walk_m",
    "columbia_euclidean_m",
    "columbia_walk_network_m",
]

quality = pd.DataFrame({
    "check": [
        "Venue identifiers are unique",
        "Required fields are complete",
        "Coordinates fall within NYC bounds",
        "Network distances are positive",
        "Official source links are present",
    ],
    "passes": [
        venues["id"].is_unique,
        venues[required].notna().all().all(),
        venues.geometry.x.between(-74.05, -73.90).all()
        and venues.geometry.y.between(40.68, 40.90).all(),
        (venues["columbia_walk_network_m"] > 0).all(),
        venues["website"].str.startswith("https://").all(),
    ],
})
display(quality)
"""
        ),
        markdown(
            """
### What the attributes mean

- `station_walk_m` is network distance from the venue to the nearest subway
  stop.
- `ada_station_walk_m` repeats the calculation using only fully or partially
  accessible stops.
- `columbia_euclidean_m` is straight-line distance from Avery Hall.
- `columbia_walk_network_m` follows the walkable street and path network.
- Hours and access programs are separate so the analysis can distinguish
  **being open** from **being affordable**.
"""
        ),
        code(
            """
graph = ox.load_graphml(DATA_DIR / "manhattan_walk.graphml")
edges = ox.graph_to_gdfs(graph, nodes=False, edges=True)

fig, ax = plt.subplots(figsize=(9, 11))
edges.plot(ax=ax, color="#D8D6CF", linewidth=0.18, alpha=0.7, zorder=1)
stations.plot(
    ax=ax,
    color=np.where(stations["ada"] > 0, BLUE, "#A9A8A2"),
    markersize=7,
    alpha=0.65,
    zorder=2,
)
venues.plot(
    ax=ax,
    color=CORAL,
    edgecolor="white",
    linewidth=0.8,
    markersize=70,
    zorder=3,
)
ax.scatter(
    -73.96255,
    40.80766,
    marker="*",
    s=180,
    color=INK,
    edgecolor="white",
    linewidth=0.8,
    zorder=4,
)
ax.set_xlim(-74.03, -73.935)
ax.set_ylim(40.695, 40.83)
ax.set_title(
    "Cultural venues and subway access in the Manhattan pilot",
    loc="left",
    fontsize=17,
    pad=32,
)
ax.text(
    0,
    1.005,
    "25 curated venues; blue stations have full or partial ADA access",
    transform=ax.transAxes,
    color=MUTED,
)
ax.axis("off")
ax.legend(
    handles=[
        Line2D([0], [0], marker="o", color="none", markerfacecolor=CORAL, markersize=9, label="Cultural venue"),
        Line2D([0], [0], marker="o", color="none", markerfacecolor=BLUE, markersize=7, label="ADA subway stop"),
        Line2D([0], [0], marker="*", color="none", markerfacecolor=INK, markersize=12, label="Columbia / Avery Hall"),
    ],
    loc="lower left",
    frameon=False,
)
fig.tight_layout()
fig.savefig(FIGURE_DIR / "01_venues_and_subway.png", dpi=180, bbox_inches="tight")
plt.show()
"""
        ),
        markdown(
            """
## Results

The following function evaluates three different questions for a specific
date, time, budget, and visitor profile:

1. Is the venue open?
2. What is the lowest applicable admission price?
3. Is that price within the visitor's budget?

Monthly programs such as First Fridays are only counted when the selected date
actually falls on that occurrence.
"""
        ),
        code(
            """
def frequency_matches(frequency, selected_date):
    if frequency in {"weekly", "daily", "seasonal-weekly"}:
        return True
    if frequency == "first-friday":
        return selected_date.weekday() == 4 and selected_date.day <= 7
    if frequency == "third-thursday":
        return selected_date.weekday() == 3 and 15 <= selected_date.day <= 21
    return False


def evaluate_venue(row, selected_date, selected_time, budget, profile):
    day = selected_date.strftime("%a").lower()
    day_hours = row["hours"].get(day)
    closes_at = float(day_hours[1]) if day_hours else np.nan
    is_open = bool(
        day_hours
        and day_hours[0] <= selected_time < day_hours[1]
        and not row["temporarily_closed"]
    )

    prices = [float(row["adult_price"])]
    if profile["student"] and pd.notna(row["student_price"]):
        prices.append(float(row["student_price"]))
    if profile["ny_resident"] and pd.notna(row["ny_resident_price"]):
        prices.append(float(row["ny_resident_price"]))
    if profile["under_25"] and pd.notna(row["under_25_price"]):
        prices.append(float(row["under_25_price"]))

    effective_price = min(prices)
    price_label = row["standard_price_label"]
    applied_program = None

    for program in row["access_programs"]:
        eligibility = (
            program["eligibility"] == "all"
            or profile.get(program["eligibility"], False)
        )
        active = (
            day in program["days"]
            and program["start"] <= selected_time < program["end"]
            and frequency_matches(program["frequency"], selected_date)
            and eligibility
        )
        if active:
            is_open = True
            closes_at = max(
                float(program["end"]),
                closes_at if pd.notna(closes_at) else 0,
            )
            if float(program["price"]) <= effective_price:
                effective_price = float(program["price"])
                price_label = program["label"]
                applied_program = program["label"]

    if row["temporarily_closed"]:
        status = "Temporarily closed"
    elif not is_open:
        status = "Closed at selected time"
    elif effective_price > budget:
        status = "Open, over budget"
    else:
        status = "Open and affordable"

    return pd.Series(
        {
            "is_open": is_open,
            "effective_price": effective_price,
            "price_at_time": price_label,
            "applied_program": applied_program,
            "closes_at": closes_at,
            "status": status,
            "fits": status == "Open and affordable",
        }
    )
"""
        ),
        code(
            """
selected_date = dt.date(2026, 7, 31)
selected_time = 18.5
budget = 15
profile = {"student": True, "ny_resident": True, "under_25": False}

scenario = venues.join(
    venues.apply(
        evaluate_venue,
        axis=1,
        selected_date=selected_date,
        selected_time=selected_time,
        budget=budget,
        profile=profile,
    )
)

print(
    f"{scenario['fits'].sum()} of {len(scenario)} venues are open and affordable "
    f"on {selected_date:%A, %B %d} at 6:30 PM with a ${budget} budget."
)
display(
    scenario.loc[
        scenario["fits"],
        [
            "name",
            "category",
            "effective_price",
            "price_at_time",
            "nearest_station",
            "station_walk_m",
        ],
    ]
    .sort_values(["effective_price", "station_walk_m"])
    .reset_index(drop=True)
)
"""
        ),
        code(
            """
status_colors = {
    "Open and affordable": GREEN,
    "Open, over budget": CORAL,
    "Closed at selected time": "#B5B3AC",
    "Temporarily closed": INK,
}

fig, ax = plt.subplots(figsize=(9, 11))
edges.plot(ax=ax, color="#DEDDD7", linewidth=0.18, alpha=0.65, zorder=1)
for status, group in scenario.groupby("status"):
    group.plot(
        ax=ax,
        color=status_colors[status],
        markersize=np.where(group["fits"], 100, 55),
        edgecolor="white",
        linewidth=0.8,
        alpha=0.95,
        label=status,
        zorder=3,
    )

for _, row in scenario.loc[scenario["fits"]].iterrows():
    ax.annotate(
        row["name"].replace("The ", ""),
        (row.geometry.x, row.geometry.y),
        xytext=(5, 5),
        textcoords="offset points",
        fontsize=7.5,
        color=INK,
    )

ax.scatter(
    -73.96255,
    40.80766,
    marker="*",
    s=180,
    color=BLUE,
    edgecolor="white",
    linewidth=0.8,
    zorder=4,
)
ax.set_xlim(-74.03, -73.935)
ax.set_ylim(40.695, 40.83)
ax.set_title(
    "What is actually available after class?",
    loc="left",
    fontsize=17,
    pad=32,
)
ax.text(
    0,
    1.005,
    "Friday, July 31 at 6:30 PM; NY student; $15 maximum admission",
    transform=ax.transAxes,
    color=MUTED,
)
ax.axis("off")
ax.legend(loc="lower left", frameon=False)
fig.tight_layout()
fig.savefig(FIGURE_DIR / "02_friday_evening_access.png", dpi=180, bbox_inches="tight")
plt.show()
"""
        ),
        code(
            """
scenario_inputs = [
    ("Thu 6:30 PM", dt.date(2026, 7, 23), 18.5),
    ("Fri 6:30 PM", dt.date(2026, 7, 24), 18.5),
    ("Sat 2 PM", dt.date(2026, 7, 25), 14),
    ("Wed 6:30 PM", dt.date(2026, 7, 29), 18.5),
]
budgets = [0, 10, 20]
availability_rows = []

for label, date_value, time_value in scenario_inputs:
    for budget_value in budgets:
        evaluated = venues.apply(
            evaluate_venue,
            axis=1,
            selected_date=date_value,
            selected_time=time_value,
            budget=budget_value,
            profile=profile,
        )
        availability_rows.append(
            {
                "scenario": label,
                "budget": budget_value,
                "available_venues": int(evaluated["fits"].sum()),
            }
        )

availability = pd.DataFrame(availability_rows)
pivot = availability.pivot(index="scenario", columns="budget", values="available_venues")
pivot = pivot.reindex([item[0] for item in scenario_inputs])

fig, ax = plt.subplots(figsize=(10, 5.5))
pivot.plot(
    kind="bar",
    ax=ax,
    color=["#B9B6AE", CORAL, GREEN],
    width=0.72,
)
ax.set_title("Time and price change the set of reachable cultural options", loc="left", fontsize=16)
ax.set_xlabel("")
ax.set_ylabel("Venues open and within budget")
ax.legend(title="Maximum admission", labels=["$0", "$10", "$20"], frameon=False)
ax.tick_params(axis="x", rotation=0)
ax.spines[["top", "right"]].set_visible(False)
for container in ax.containers:
    ax.bar_label(container, padding=3, fontsize=9)
fig.tight_layout()
fig.savefig(FIGURE_DIR / "03_access_by_time_and_budget.png", dpi=180, bbox_inches="tight")
plt.show()
"""
        ),
        markdown(
            """
The comparison above shows why proximity alone is insufficient. Saturday
afternoon offers many more choices, while a weekday evening can shrink the
available set even before travel is considered. Increasing the budget helps
only where venues are still open.
"""
        ),
        code(
            """
fig, ax = plt.subplots(figsize=(8, 7))
ax.scatter(
    venues["columbia_euclidean_m"] / 1000,
    venues["columbia_walk_network_m"] / 1000,
    s=70,
    color=CORAL,
    edgecolor="white",
    linewidth=0.8,
    alpha=0.9,
)

limit = max(
    venues["columbia_euclidean_m"].max(),
    venues["columbia_walk_network_m"].max(),
) / 1000
ax.plot([0, limit], [0, limit], linestyle="--", color=MUTED, linewidth=1)

largest_detours = venues.nlargest(5, "network_detour_ratio")
for _, row in largest_detours.iterrows():
    ax.annotate(
        row["name"].replace("The ", ""),
        (row["columbia_euclidean_m"] / 1000, row["columbia_walk_network_m"] / 1000),
        xytext=(6, 4),
        textcoords="offset points",
        fontsize=8,
    )

ax.set_title("Street networks make nearby places farther away", loc="left", fontsize=16)
ax.set_xlabel("Straight-line distance from Columbia (km)")
ax.set_ylabel("Walking-network distance from Columbia (km)")
ax.spines[["top", "right"]].set_visible(False)
ax.text(
    0.02,
    0.96,
    f"Median network detour: {(venues['network_detour_ratio'].median() - 1) * 100:.0f}% longer",
    transform=ax.transAxes,
    va="top",
    color=MUTED,
)
fig.tight_layout()
fig.savefig(FIGURE_DIR / "04_euclidean_vs_network.png", dpi=180, bbox_inches="tight")
plt.show()
"""
        ),
        markdown(
            """
Euclidean distance answers a geometric question: how far apart are two
coordinates? Network distance answers an experiential question: how far must a
person travel along available paths? The largest differences occur where park
edges, blocks, entrances, or street geometry prevent a direct route.
"""
        ),
        code(
            """
ada_gap = venues.assign(
    ada_gap_m=venues["ada_station_walk_m"] - venues["station_walk_m"]
).nlargest(10, "ada_gap_m")

fig, ax = plt.subplots(figsize=(10, 6.5))
y = np.arange(len(ada_gap))
ax.hlines(
    y,
    ada_gap["station_walk_m"],
    ada_gap["ada_station_walk_m"],
    color="#C9C7BF",
    linewidth=2,
)
ax.scatter(ada_gap["station_walk_m"], y, color=GREEN, s=65, label="Nearest station")
ax.scatter(ada_gap["ada_station_walk_m"], y, color=BLUE, s=65, label="Nearest ADA station")
ax.set_yticks(y)
ax.set_yticklabels(ada_gap["name"].str.replace("^The ", "", regex=True))
ax.invert_yaxis()
ax.set_xlabel("Walking-network distance from venue (meters)")
ax.set_title("The nearest station is not always the nearest accessible station", loc="left", fontsize=16)
ax.legend(frameon=False, loc="lower right")
ax.spines[["top", "right", "left"]].set_visible(False)
ax.grid(axis="x", color="#DFDDD6", linewidth=0.7)
fig.tight_layout()
fig.savefig(FIGURE_DIR / "05_ada_station_gap.png", dpi=180, bbox_inches="tight")
plt.show()
"""
        ),
        markdown(
            """
## Coverage, scale, and data honesty

The full DCLA dataset contains 2,535 funded cultural organizations. Of these,
2,268 records (89.5%) have usable coordinates. That citywide layer is useful
for showing institutional concentration and potential gaps, but it does **not**
contain reliable public hours, current admission, or proof that the coordinate
is a public entrance. The interactive map therefore labels it as a directory,
not as 2,268 verified destinations.
"""
        ),
        code(
            """
borough_order = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"]
borough_counts = (
    directory["borough"]
    .value_counts()
    .reindex(borough_order)
    .fillna(0)
    .astype(int)
)

fig, axes = plt.subplots(
    1,
    2,
    figsize=(12, 5.5),
    gridspec_kw={"width_ratios": [1.7, 1]},
)
borough_counts.plot(
    kind="barh",
    ax=axes[0],
    color=[BLUE, CORAL, GREEN, "#7753CC", "#E2AD2F"],
)
axes[0].invert_yaxis()
axes[0].set_title("Geocoded DCLA organizations by borough", loc="left", fontsize=15)
axes[0].set_xlabel("Organization records")
axes[0].set_ylabel("")
axes[0].spines[["top", "right", "left"]].set_visible(False)
for container in axes[0].containers:
    axes[0].bar_label(container, padding=4, fontsize=9)

coverage_values = [
    summary["dcla_geocoded_count"],
    summary["dcla_row_count"] - summary["dcla_geocoded_count"],
]
axes[1].pie(
    coverage_values,
    colors=[GREEN, "#D8D6CF"],
    startangle=90,
    counterclock=False,
    wedgeprops={"width": 0.34, "edgecolor": PAPER},
)
axes[1].text(
    0,
    0.05,
    f"{summary['dcla_geocoded_percent']:.1f}%",
    ha="center",
    va="center",
    fontsize=24,
    fontweight="bold",
)
axes[1].text(0, -0.18, "geocoded", ha="center", va="center", color=MUTED)
axes[1].set_title("Coordinate coverage", fontsize=15)

fig.suptitle(
    "A large directory is not the same as a verified visit dataset",
    x=0.02,
    y=1.02,
    ha="left",
    fontsize=17,
    fontweight="bold",
)
fig.tight_layout()
fig.savefig(FIGURE_DIR / "06_directory_coverage.png", dpi=180, bbox_inches="tight")
plt.show()
"""
        ),
        markdown(
            """
## Schedule-weighted subway network

The subway network is not a straight line between a starting point and a
venue. Each node represents a **station-line state** such as `116 St | 1`, so
changing lines requires an explicit transfer edge. Consecutive GTFS stop times
provide segment weights. A route starts at the nearest station, includes a
four-minute initial wait, compares up to eight destination stations, and adds
the final walk.

This model contains 1,002 station-line nodes and 4,337 directed edges. It is
more experiential than Euclidean distance, but it remains a typical-weekday
model rather than a real-time MTA prediction.
"""
        ),
        code(
            """
example_name = "The Museum of Modern Art"
example_route = transit_routes.loc[
    transit_routes["venue_name"] == example_name
].iloc[0]
example_venue = venues.loc[venues["name"] == example_name].iloc[0]
route_station_ids = (
    json.loads(example_route["station_path"])
    if isinstance(example_route["station_path"], str)
    else example_route["station_path"]
)
route_stations = stations.loc[
    stations["gtfs_stop_id"].astype(str).isin(
        [str(value) for value in route_station_ids]
    )
]

fig, ax = plt.subplots(figsize=(8.5, 10))
edges.plot(ax=ax, color="#DEDCD5", linewidth=0.25, alpha=0.8, zorder=1)
gpd.GeoSeries([example_route.geometry], crs=4326).plot(
    ax=ax,
    color=BLUE,
    linewidth=4,
    zorder=3,
)
route_stations.plot(
    ax=ax,
    color=BLUE,
    edgecolor="white",
    linewidth=1,
    markersize=35,
    zorder=4,
)
ax.plot(
    [-73.96255, example_venue.geometry.x],
    [40.80766, example_venue.geometry.y],
    linestyle="--",
    color=CORAL,
    linewidth=1.3,
    label="Euclidean line",
    zorder=2,
)
ax.scatter(
    [-73.96255],
    [40.80766],
    marker="*",
    s=180,
    color=INK,
    edgecolor="white",
    linewidth=0.8,
    zorder=5,
)
ax.scatter(
    [example_venue.geometry.x],
    [example_venue.geometry.y],
    s=110,
    color=CORAL,
    edgecolor="white",
    linewidth=0.8,
    zorder=5,
)
route_bounds = example_route.geometry.bounds
ax.set_xlim(route_bounds[0] - 0.015, route_bounds[2] + 0.015)
ax.set_ylim(route_bounds[1] - 0.01, route_bounds[3] + 0.01)
ax.set_title(
    "The shortest cultural trip is a sequence of network decisions",
    loc="left",
    fontsize=16,
    pad=32,
)
ax.text(
    0,
    1.005,
    (
        f"Columbia to MoMA: {example_route['route_names']} train; "
        f"{example_route['transfer_count']} transfers; "
        f"{example_route['total_minutes']:.0f} modelled minutes"
    ),
    transform=ax.transAxes,
    color=MUTED,
)
ax.axis("off")
ax.legend(
    handles=[
        Line2D([0], [0], color=BLUE, linewidth=4, label="Station path"),
        Line2D([0], [0], color=CORAL, linestyle="--", label="Euclidean line"),
    ],
    loc="lower left",
    frameon=False,
)
fig.tight_layout()
fig.savefig(FIGURE_DIR / "07_subway_route_example.png", dpi=180, bbox_inches="tight")
plt.show()
"""
        ),
        code(
            """
distance_comparison = venues[
    [
        "name",
        "columbia_euclidean_m",
        "columbia_walk_network_m",
        "columbia_transit_total_min",
        "columbia_transit_routes",
        "columbia_transit_transfer_count",
    ]
].copy()
distance_comparison["euclidean_km"] = (
    distance_comparison["columbia_euclidean_m"] / 1000
)
distance_comparison["walking_network_km"] = (
    distance_comparison["columbia_walk_network_m"] / 1000
)
distance_comparison["walking_minutes"] = (
    distance_comparison["columbia_walk_network_m"] / 80
)
distance_comparison["minutes_saved_by_subway"] = (
    distance_comparison["walking_minutes"]
    - distance_comparison["columbia_transit_total_min"]
)

display(
    distance_comparison[
        [
            "name",
            "euclidean_km",
            "walking_network_km",
            "walking_minutes",
            "columbia_transit_total_min",
            "columbia_transit_routes",
            "columbia_transit_transfer_count",
        ]
    ]
    .sort_values("columbia_transit_total_min")
    .head(10)
    .round(1)
)

fig, ax = plt.subplots(figsize=(9, 6.5))
scatter = ax.scatter(
    distance_comparison["walking_network_km"],
    distance_comparison["columbia_transit_total_min"],
    c=distance_comparison["columbia_transit_transfer_count"],
    cmap="viridis",
    s=85,
    edgecolor="white",
    linewidth=0.8,
)
for label_index, (_, row) in enumerate(
    distance_comparison.nlargest(4, "minutes_saved_by_subway").iterrows()
):
    ax.annotate(
        row["name"].replace("The ", ""),
        (row["walking_network_km"], row["columbia_transit_total_min"]),
        xytext=(-8, [9, -14, 9, -14][label_index]),
        textcoords="offset points",
        fontsize=8,
        ha="right",
    )
ax.set_title(
    "Distance and travel time describe different experiences",
    loc="left",
    fontsize=16,
)
ax.set_xlabel("Walking-network distance from Columbia (km)")
ax.set_ylabel("Schedule-weighted subway journey (minutes)")
ax.spines[["top", "right"]].set_visible(False)
colorbar = fig.colorbar(scatter, ax=ax)
colorbar.set_label("Transfers")
fig.tight_layout()
fig.savefig(FIGURE_DIR / "08_walking_vs_transit.png", dpi=180, bbox_inches="tight")
plt.show()
"""
        ),
        markdown(
            """
## A transparent, adjustable access score

The web tool does not claim that one ranking is objectively correct. It exposes
four components -- open now, price, journey time, and proximity to an ADA
station -- and lets a user change their weights. Each component is normalized
to 0-100; the final value is a weighted mean. The chart below tests how the same
Friday-evening destinations move under four plausible preference profiles.
"""
        ),
        code(
            """
PRESETS = {
    "Balanced": {"availability": 35, "cost": 25, "transit": 25, "ada": 15},
    "Low cost": {"availability": 25, "cost": 50, "transit": 15, "ada": 10},
    "Fastest": {"availability": 20, "cost": 10, "transit": 60, "ada": 10},
    "Step-free": {"availability": 20, "cost": 15, "transit": 20, "ada": 45},
}


def access_components(row, selected_time, selected_budget):
    remaining_hours = (
        max(0, row["closes_at"] - selected_time)
        if row["is_open"] and pd.notna(row["closes_at"])
        else 0
    )
    availability_score = (
        np.clip(70 + remaining_hours * 10, 70, 100)
        if row["is_open"]
        else 0
    )
    budget_base = max(selected_budget, 1)
    if row["effective_price"] <= selected_budget:
        cost_score = np.clip(
            100 - row["effective_price"] / budget_base * 40,
            60,
            100,
        )
    else:
        cost_score = np.clip(
            50
            - (row["effective_price"] - selected_budget)
            / budget_base
            * 50,
            0,
            50,
        )
    transit_score = np.clip(
        100 - (row["columbia_transit_total_min"] - 20) / 55 * 100,
        0,
        100,
    )
    ada_score = np.clip(
        100 - (row["ada_station_walk_m"] - 200) / 1000 * 100,
        0,
        100,
    )
    return {
        "availability": availability_score,
        "cost": cost_score,
        "transit": transit_score,
        "ada": ada_score,
    }


score_table = scenario[["name"]].copy()
for preset_name, weights in PRESETS.items():
    scores = []
    for _, row in scenario.iterrows():
        components = access_components(row, selected_time, budget)
        scores.append(
            sum(components[key] * value for key, value in weights.items())
            / sum(weights.values())
        )
    score_table[preset_name] = scores

top_names = (
    score_table.set_index("name")["Balanced"]
    .nlargest(10)
    .index
)
score_plot = score_table.set_index("name").loc[top_names]

fig, ax = plt.subplots(figsize=(9.5, 7))
image = ax.imshow(score_plot.values, cmap="YlGnBu", vmin=0, vmax=100)
ax.set_xticks(np.arange(len(score_plot.columns)))
ax.set_xticklabels(score_plot.columns)
ax.set_yticks(np.arange(len(score_plot.index)))
ax.set_yticklabels(
    score_plot.index.str.replace("^The ", "", regex=True)
)
for row_index in range(score_plot.shape[0]):
    for column_index in range(score_plot.shape[1]):
        value = score_plot.iloc[row_index, column_index]
        ax.text(
            column_index,
            row_index,
            f"{value:.0f}",
            ha="center",
            va="center",
            color="white" if value > 68 else INK,
            fontsize=9,
            fontweight="bold",
        )
ax.set_title(
    "Changing priorities changes the cultural access ranking",
    loc="left",
    fontsize=16,
    pad=32,
)
ax.text(
    0,
    1.015,
    "Friday, July 31 at 6:30 PM; NY student; $15 maximum admission",
    transform=ax.transAxes,
    color=MUTED,
)
fig.colorbar(image, ax=ax, label="Access score")
ax.tick_params(axis="x", labelsize=9, rotation=12)
for tick_label in ax.get_xticklabels():
    tick_label.set_ha("right")
fig.tight_layout()
fig.savefig(FIGURE_DIR / "09_score_sensitivity.png", dpi=180, bbox_inches="tight")
plt.show()
"""
        ),
        markdown(
            """
## Takeaways

1. **Abundance is not access.** Manhattan contains many cultural institutions,
   but only 9 of the 25 verified profiles satisfy the example Friday-evening
   time and budget constraints.
2. **Hours are a structural barrier.** Several free or suggested-admission
   venues close at 5 or 6 PM, making them inaccessible after a normal workday or
   evening class.
3. **Price programs can reverse the map.** Weekly free nights make some normally
   expensive institutions more practical than always-low-cost venues that have
   already closed.
4. **The nearest station is not always the best station.** Comparing several
   possible exit stations avoids routes with unnecessary transfers just to
   minimize the final walk.
5. **ADA access changes proximity.** The median nearest-station walk rises from
   394 to 604 meters when the destination station must be ADA-accessible.
6. **Rankings are choices.** A low-cost visitor, a time-constrained visitor,
   and a step-free visitor should not receive the same unexplained ordering.
7. **Coverage must remain visible.** A 2,268-point cultural directory is useful
   for discovery, but it cannot be presented as 2,268 verified public venues.

### What this analysis cannot tell us

The data cannot measure how welcoming a venue feels, the cultural relevance of
its exhibitions, language access, crowding, personal safety, real-time transit
service, or the physical accessibility of the full trip inside and outside the
venue. The subway model uses a typical weekday schedule, a generic transfer
penalty, and estimated walking egress; it does not include service changes,
elevator outages, platform-level paths, or ticket availability. Future work
should add live event feeds, real-time transit and elevator status, verified
citywide public entrances, and community-reported experience.
"""
        ),
        markdown(
            """
## Sources

- [NYC DCLA Cultural Organizations](https://data.cityofnewyork.us/Recreation/DCLA-Cultural-Organizations/u35m-9t32)
- [NYC DCLA Free and Suggested Admission](https://www.nyc.gov/site/dcla/resources/free-and-suggested-admission.page)
- [MTA Subway Stations](https://data.ny.gov/Transportation/MTA-Subway-Stations/39hk-dx4f)
- [MTA Static GTFS](https://data.ny.gov/Transportation/MTA-General-Transit-Feed-Specification-GTFS-Static/fgm6-ccue)
- [OpenStreetMap](https://www.openstreetmap.org/) walking network via OSMnx
- Individual venue sources are stored in
  `data/curated_venues.json` and linked in the interactive map.
"""
        ),
    ]

    nbf.write(notebook, NOTEBOOK_PATH)
    print(f"Wrote {NOTEBOOK_PATH}")


if __name__ == "__main__":
    main()
