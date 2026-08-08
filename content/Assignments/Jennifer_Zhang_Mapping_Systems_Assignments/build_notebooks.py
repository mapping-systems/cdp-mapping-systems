"""Build the current Assignment 01, 02, and 03 notebook sources.

The committed notebooks are already executed. This orchestrator delegates to the
assignment-specific builders so there is only one authoritative notebook source
for each assignment.
"""

from pathlib import Path
import runpy


ROOT = Path(__file__).resolve().parent
BUILDERS = [
    ROOT / "01_loading_and_visualizing_data" / "build_notebook.py",
    ROOT / "02_geoprocessing" / "build_notebook.py",
    ROOT / "03_networks" / "build_notebook.py",
]


def main() -> None:
    for builder in BUILDERS:
        if not builder.exists():
            raise FileNotFoundError(builder)
        runpy.run_path(str(builder), run_name="__main__")
    print("Built Assignment 01, 02, and 03 notebook sources.")
    print("Execute the notebooks with Jupyter before committing refreshed outputs.")


if __name__ == "__main__":
    main()
