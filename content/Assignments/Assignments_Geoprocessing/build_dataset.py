"""
build_dataset.py

Mapping Systems -- Geoprocessing Assignment
--------------------------------------------
This script does two things, following the patterns introduced in the
"Geoprocessing" tutorial notebook (reprojecting, spatial joins, buffering,
and writing functions to calculate new attributes):

  1. Builds the personal narrative dataset (`personal-geography.geojson`)
     as a GeoDataFrame with points (daily stops) and a line (daily
     commute route) instead of hand-editing coordinates.

  2. Sketches the proposed geoprocessing workflow for relating this
     dataset to a public transit dataset (MTA Subway Stations, NYC Open
     Data), computing walking distance from every personal stop to the
     nearest subway station and flagging a walkable "transit access"
     category for each stop.

Part 2 is written against a subway stations file that is NOT included in
this submission (see README.md for the proposed data source and
methodology). It is included here to show the intended code path once
that dataset is downloaded locally, e.g. to `../Data/mta_subway_stations.geojson`.

Requires: geopandas, shapely (same environment used in the course notebooks)
"""

import pandas as pd
import geopandas as gpd
from shapely.geometry import Point, LineString

# ---------------------------------------------------------------------
# 1. Build the personal narrative dataset
# ---------------------------------------------------------------------

# Each stop in the daily narrative, as (name, category, lon, lat, description,
# frequency per week, typical time, mood)
stops = [
    ("Apartment (Home Base)", "home", -73.9599, 40.8120,
     "Fifth-floor walk-up near Amsterdam & 122nd St. Where the day starts and ends.",
     7, "8:00 AM / 11:00 PM", "grounding"),
    ("Amsterdam Ave Coffee Cart", "coffee", -73.9630, 40.8074,
     "First stop every morning. The cart owner knows my order before I ask.",
     5, "8:15 AM", "energizing"),
    ("Hungarian Pastry Shop", "food", -73.9646, 40.8036,
     "Where studio crits get debriefed over cheap coffee refills.",
     3, "6:30 PM", "cozy"),
    ("Avery Hall Studio (GSAPP)", "study", -73.9625, 40.8088,
     "Desk in the fourth-floor studio, where most waking hours actually happen.",
     6, "9:00 AM - 9:00 PM", "focused"),
    ("Low Library Steps", "recreation", -73.9626, 40.8075,
     "Ten-minute decompression spot between studio and the library.",
     4, "1:00 PM", "calm"),
    ("116 St - Columbia University Subway Entrance", "subway", -73.9660, 40.8075,
     "1 train entrance at Broadway & 116th, used for trips outside the neighborhood.",
     4, "varies", "transitional"),
    ("Riverside Park Overlook", "recreation", -73.9722, 40.8092,
     "Bench at the 116th St entrance to Riverside Park.",
     2, "6:00 PM", "restorative"),
]

points_gdf = gpd.GeoDataFrame(
    [
        {
            "id": i + 1,
            "name": name,
            "category": category,
            "description": description,
            "frequency_per_week": freq,
            "typical_time": time,
            "mood": mood,
        }
        for i, (name, category, lon, lat, description, freq, time, mood) in enumerate(stops)
    ],
    geometry=[Point(lon, lat) for (_, _, lon, lat, *_rest) in stops],
    crs="EPSG:4326",
)

# The daily walking route, expressed as a single LineString feature
route_coords = [
    (-73.9599, 40.8120),
    (-73.9612, 40.8101),
    (-73.9630, 40.8074),
    (-73.9628, 40.8060),
    (-73.9646, 40.8036),
    (-73.9636, 40.8045),
    (-73.9625, 40.8088),
]

route_gdf = gpd.GeoDataFrame(
    [
        {
            "id": 8,
            "name": "Morning Walk to Studio",
            "category": "route",
            "mode": "walking",
            "description": "Daily path from the apartment, through a coffee stop, into the GSAPP studio.",
            "distance_miles": 0.9,
            "avg_duration_min": 18,
            "frequency_per_week": 5,
        }
    ],
    geometry=[LineString(route_coords)],
    crs="EPSG:4326",
)

def build_personal_geography():
    """Combine stops and route into one GeoDataFrame and write to GeoJSON."""
    combined = gpd.GeoDataFrame(
        pd.concat([points_gdf, route_gdf], ignore_index=True), crs="EPSG:4326"
    )
    combined.to_file("personal-geography.geojson", driver="GeoJSON")
    return combined


# ---------------------------------------------------------------------
# 2. Proposed workflow: relate personal stops to MTA subway stations
# ---------------------------------------------------------------------

def classify_transit_access(distance_ft, threshold_ft=1320):
    """
    Classify a stop's walkability to transit.

    Mirrors the `is_soft_site()` pattern from the tutorial: a small function
    that turns a continuous measurement (distance in feet) into a
    categorical label we can map and summarize.

    threshold_ft defaults to 1320 ft (~ 1/4 mile, a common "walkable to
    transit" planning benchmark, roughly a 5-minute walk).
    """
    if distance_ft <= threshold_ft:
        return "high_access"
    elif distance_ft <= threshold_ft * 2:
        return "medium_access"
    else:
        return "low_access"


def relate_to_subway_stations(stops_gdf, subway_path):
    """
    Proposed geoprocessing workflow (see README.md for the full narrative):

      1. Reproject both datasets to EPSG:2263 (NY State Plane, feet) so that
         distance calculations are in a meaningful, planar unit -- the same
         step used in the tutorial before comparing tax lots and buildings.
      2. Use `sjoin_nearest()` to find, for every personal stop, the nearest
         subway station and the distance to it (`distance_col=...`).
      3. Apply `classify_transit_access()` via `.apply(..., axis=1)` to add
         a categorical "transit_access" attribute, exactly as the tutorial
         adds `soft_site` to the tax lot dataset.
      4. Optionally buffer each stop by the walkability threshold and run
         an `sjoin` (predicate="intersects") against subway stations to
         list *all* stations within an easy walk, not just the nearest one.

    Parameters
    ----------
    stops_gdf : GeoDataFrame
        The personal point dataset (EPSG:4326).
    subway_path : str
        Path to the MTA Subway Stations GeoJSON (see README.md for source).

    Returns
    -------
    GeoDataFrame
        stops_gdf enriched with `dist_to_subway_ft` and `transit_access`.
    """
    stops_ft = stops_gdf.to_crs("EPSG:2263")

    subway = gpd.read_file(subway_path).to_crs("EPSG:2263")

    joined = stops_ft.sjoin_nearest(
        subway[["geometry", "station_name", "line"]],
        how="left",
        distance_col="dist_to_subway_ft",
    )

    joined["transit_access"] = joined["dist_to_subway_ft"].apply(classify_transit_access)

    return joined.to_crs("EPSG:4326")


if __name__ == "__main__":
    gdf = build_personal_geography()
    print(gdf[["id", "name", "category"]])

    # Uncomment once the MTA Subway Stations file has been downloaded locally:
    # enriched = relate_to_subway_stations(
    #     gdf[gdf.category != "route"], "../Data/mta_subway_stations.geojson"
    # )
    # enriched.to_file("personal-geography-with-transit-access.geojson", driver="GeoJSON")
