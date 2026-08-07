"""Render the site background from the project's real NYC geospatial assets."""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
OUTPUT = ROOT / "public" / "nyc-linework-background.png"


def padded_extent(bounds: tuple[float, float, float, float], aspect: float) -> tuple[float, float, float, float]:
    min_x, min_y, max_x, max_y = bounds
    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2
    width = (max_x - min_x) * 1.08
    height = (max_y - min_y) * 1.08

    if width / height < aspect:
        width = height * aspect
    else:
        height = width / aspect

    return (
        center_x - width / 2,
        center_y - height / 2,
        center_x + width / 2,
        center_y + height / 2,
    )


def main() -> None:
    neighborhoods = gpd.read_file(DATA / "neighborhoods.geojson").to_crs("EPSG:2263")
    subway = gpd.read_file(DATA / "subway-lines.geojson").to_crs("EPSG:2263")
    stations = gpd.read_file(DATA / "stations.geojson").to_crs("EPSG:2263")

    fig, ax = plt.subplots(figsize=(10, 10), dpi=160)
    fig.patch.set_alpha(0)
    ax.set_facecolor("none")
    ax.set_position([0, 0, 1, 1])

    neighborhoods.boundary.plot(
        ax=ax,
        color="#d9d3c5",
        linewidth=0.52,
        alpha=0.22,
        zorder=1,
    )

    subway.plot(
        ax=ax,
        color="#f3eee3",
        linewidth=3.8,
        alpha=0.055,
        zorder=2,
    )

    for color, routes in subway.groupby(subway["color"].fillna("#8f969d")):
        routes.plot(
            ax=ax,
            color=color,
            linewidth=1.45,
            alpha=0.52,
            zorder=3,
        )

    stations.plot(
        ax=ax,
        color="#f8f4e9",
        edgecolor="#070707",
        linewidth=0.25,
        markersize=5.2,
        alpha=0.44,
        zorder=4,
    )

    # The background is intentionally cropped to the transit network rather
    # than the full municipal outline. This gives the fixed wallpaper enough
    # colored route geometry to reach every viewport edge after cover-scaling.
    extent = padded_extent(tuple(subway.total_bounds), aspect=1.0)
    ax.set_xlim(extent[0], extent[2])
    ax.set_ylim(extent[1], extent[3])
    ax.set_aspect("equal")
    ax.axis("off")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(
        OUTPUT,
        dpi=160,
        transparent=True,
        bbox_inches=None,
        pad_inches=0,
    )
    plt.close(fig)

    print(f"Rendered {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
