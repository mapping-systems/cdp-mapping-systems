"""Clip a supplied Manhattan OSMnx GraphML file to the assignment study area.

The submitted notebook does not need to run this utility: it reads the bounded,
committed snapshot. This script records exactly how that smaller snapshot was
created when a verified source graph is supplied.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import networkx as nx


HERE = Path(__file__).resolve().parent
TARGET = HERE / "inputs/morningside_walk.graphml.gz"
MANIFEST = HERE / "inputs/morningside_walk_manifest.json"

# Wide enough that every study location is more than 500 m from the clip edge.
CLIP_BBOX = {
    "west": -73.9755,
    "south": 40.7965,
    "east": -73.9500,
    "north": 40.8185,
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clip_graph(source: Path) -> nx.MultiGraph:
    graph = nx.read_graphml(source, force_multigraph=True)
    keep = [
        node
        for node, attrs in graph.nodes(data=True)
        if CLIP_BBOX["west"] <= float(attrs["x"]) <= CLIP_BBOX["east"]
        and CLIP_BBOX["south"] <= float(attrs["y"]) <= CLIP_BBOX["north"]
    ]
    bounded = nx.MultiGraph(graph.subgraph(keep).copy())
    largest = max(nx.connected_components(bounded), key=len)
    bounded = bounded.subgraph(largest).copy()
    bounded.graph.update(
        {
            "assignment_boundary": "Morningside Heights bbox; largest connected component",
            "assignment_network_type": "walk",
            "assignment_clip_bbox": json.dumps(CLIP_BBOX, sort_keys=True),
        }
    )
    if not nx.is_connected(bounded):
        raise ValueError("Clipped graph is not connected")
    return bounded


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="Verified OSMnx GraphML or GraphML.gz source")
    parser.add_argument(
        "--source-retrieved-at",
        help="ISO-8601 retrieval timestamp for the supplied source graph",
    )
    args = parser.parse_args()

    source = args.source.expanduser().resolve()
    if not source.exists():
        raise FileNotFoundError(source)

    graph = clip_graph(source)
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    nx.write_graphml(graph, TARGET)

    manifest = {
        "artifact": "inputs/morningside_walk.graphml.gz",
        "artifact_sha256": sha256(TARGET),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "node_count": graph.number_of_nodes(),
        "edge_count": graph.number_of_edges(),
        "connected_components": nx.number_connected_components(graph),
        "crs": str(graph.graph.get("crs", "epsg:4326")),
        "network_type": "walk",
        "clip_bbox_wgs84": CLIP_BBOX,
        "source": {
            "provider": "OpenStreetMap contributors",
            "url": "https://www.openstreetmap.org/copyright",
            "source_sha256": sha256(source),
            "source_created_with": str(graph.graph.get("created_with", "OSMnx")),
            "source_created_date": str(graph.graph.get("created_date", "unknown")),
            "source_retrieved_at": args.source_retrieved_at or "not recorded",
        },
        "notes": [
            "The notebook reads this frozen bounded snapshot and makes no live API call.",
            "The largest connected component was retained after coordinate clipping.",
        ],
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {TARGET} ({graph.number_of_nodes():,} nodes, {graph.number_of_edges():,} edges)")
    print(f"Wrote {MANIFEST}")


if __name__ == "__main__":
    main()
