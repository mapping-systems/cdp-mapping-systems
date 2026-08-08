# 1. Imports
from pathlib import Path

import geopandas as gpd
import matplotlib.pyplot as plt
import pandas as pd

# 2. File paths and data URLs
data_path = Path(
    r"C:\Users\yinuo\OneDrive\Documents\Mapping system 2"
    r"\cdp-mapping-systems\submission"
    r"\ARCHIVED_-_NYC_Greenthumb_Community_Gardens_20260722.csv"
)

borough_url = (
    "https://data.cityofnewyork.us/api/v3/views/"
    "gthc-hcne/query.geojson?accessType=DOWNLOAD"
)

community_district_url = (
    "https://data.cityofnewyork.us/resource/" "5crt-au7u.geojson?$limit=5000"
)

map_path = data_path.parent / "community_gardens.png"


# 3. Confirm that the CSV exists
print("CSV exists:", data_path.exists())
print("CSV path:", data_path)

if not data_path.exists():
    raise FileNotFoundError(f"CSV not found: {data_path}")


# 4. Load the community garden CSV
df = pd.read_csv(data_path)

print("\nDataset shape:")
print(df.shape)

print("\nColumns:")
print(df.columns.tolist())

print("\nFirst five rows:")
print(df.head())

print("\nDataset information:")
df.info()


# 5. Explore missing values and attributes
missing = df.isna().sum().sort_values(ascending=False)

print("\nMissing values:")
print(missing)

print("\nGarden count by jurisdiction:")
print(df["Jurisdiction"].value_counts())

print("\nSize statistics:")
print(df["Size"].describe())


# 6. Check how many records can be mapped
valid_location_data = df.dropna(subset=["Latitude", "Longitude"])

valid_size_map_data = df.dropna(subset=["Latitude", "Longitude", "Size"])

print(
    "\nRecords usable for location map:",
    len(valid_location_data),
)

print(
    "Records usable for size map:",
    len(valid_size_map_data),
)


# 7. Load borough and Community District boundaries
boroughs = gpd.read_file(borough_url)

community_districts = gpd.read_file(community_district_url)

print("\nBorough boundary data:")
print(boroughs.shape)
print(boroughs.crs)

print("\nCommunity District boundary data:")
print(community_districts.shape)
print(community_districts.crs)


# 8. Convert garden coordinates into geographic points
gardens_gdf = gpd.GeoDataFrame(
    valid_location_data.copy(),
    geometry=gpd.points_from_xy(
        valid_location_data["Longitude"],
        valid_location_data["Latitude"],
    ),
    crs="EPSG:4326",
)

print("\nGarden point data:")
print(gardens_gdf.shape)
print(gardens_gdf.crs)


# 9. Create readable borough names and colors
borough_names = {
    "M": "Manhattan",
    "B": "Brooklyn",
    "X": "Bronx",
    "Q": "Queens",
    "R": "Staten Island",
}

borough_colors = {
    "Manhattan": "#E76F51",
    "Brooklyn": "#2A9D8F",
    "Bronx": "#E9C46A",
    "Queens": "#457B9D",
    "Staten Island": "#8E6C8A",
}

gardens_gdf["Borough"] = gardens_gdf["Boro"].map(borough_names)


# 10. Create the map
fig, ax = plt.subplots(figsize=(10, 10))

# Borough background fill
boroughs.plot(
    ax=ax,
    color="#E8EEF2",
    edgecolor="none",
    zorder=1,
)

# Internal Community District boundaries
community_districts.boundary.plot(
    ax=ax,
    color="#555555",
    linewidth=0.55,
    zorder=2,
)

# Stronger outer borough boundaries
boroughs.boundary.plot(
    ax=ax,
    color="#222222",
    linewidth=1.1,
    zorder=3,
)

# Community garden points
for borough, color in borough_colors.items():
    borough_gardens = gardens_gdf[gardens_gdf["Borough"] == borough]

    borough_gardens.plot(
        ax=ax,
        color=color,
        markersize=7,
        alpha=0.8,
        label=(f"{borough} " f"({len(borough_gardens)})"),
        zorder=4,
    )


# 11. Map styling
ax.set_title(
    "Distribution of NYC Community Gardens by Borough",
    fontsize=16,
    pad=15,
)

ax.legend(
    title="Borough",
    loc="upper left",
    frameon=True,
)

ax.set_axis_off()

plt.tight_layout()


# 12. Save and close
fig.savefig(
    map_path,
    dpi=300,
    bbox_inches="tight",
    facecolor="white",
)


plt.close(fig)

print("\nMap saved to:")
print(map_path)
