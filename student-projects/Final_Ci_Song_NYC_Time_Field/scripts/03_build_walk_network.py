"""Build the published OSMnx pedestrian access assets."""

import argparse

from pipeline import build_walk_access, build_walk_access_approximation


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--approximate",
        action="store_true",
        help="Build the documented detour-factor fallback instead of OSMnx.",
    )
    parser.add_argument(
        "--force-osm",
        action="store_true",
        help="Discard the cached OSM graph and download it again.",
    )
    args = parser.parse_args()
    report = (
        build_walk_access_approximation()
        if args.approximate
        else build_walk_access(force_osm=args.force_osm)
    )
    print(
        "Built pedestrian access snapshot: "
        f"{report['entry_points']:,} entries, {report['walk_edges']:,} H3 edges."
    )
