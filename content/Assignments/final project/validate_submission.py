from __future__ import annotations

import json
from pathlib import Path

import nbformat

ROOT = Path(__file__).resolve().parent
NOTEBOOK = ROOT / "Final_Project_Beyond_the_Buffer_100.ipynb"

checks = []

def add(name: str, passed: bool, detail: str = "") -> None:
    checks.append((name, passed, detail))

add("Notebook exists", NOTEBOOK.exists(), str(NOTEBOOK.name))
if NOTEBOOK.exists():
    nb = nbformat.read(NOTEBOOK, as_version=4)
    code_cells = [cell for cell in nb.cells if cell.cell_type == "code"]
    executed = [cell for cell in code_cells if cell.execution_count is not None]
    errors = [
        output
        for cell in code_cells
        for output in cell.get("outputs", [])
        if output.get("output_type") == "error"
    ]
    add("All code cells executed", len(executed) == len(code_cells), f"{len(executed)}/{len(code_cells)}")
    add("No saved error outputs", not errors, f"{len(errors)} error outputs")

required_files = [
    "data/generated_findings.md",
    "data/run_metadata.json",
    "figures/07_euclidean_vs_network_distance.png",
    "figures/09_buffer_vs_network_access.png",
    "figures/15_robust_priority_index.png",
    "figures/17_priority_rank_sensitivity.png",
    "figures/19_representative_routes.png",
    "tables/priority_cells.csv",
    "tables/district_summary.csv",
    "tables/closure_scenarios.csv",
    "tables/priority_rank_correlation.csv",
    "tables/priority_top15_overlap.csv",
    "web/data/access_cells.geojson",
    "web/data/stores.geojson",
    "web/data/study_core.geojson",
    "web/data/study_boundary.geojson",
    "web/data/closure_stores.geojson",
    "web/data/representative_routes.geojson",
    "web/data/summary.json",
]
for relative_path in required_files:
    path = ROOT / relative_path
    add(relative_path, path.exists() and path.stat().st_size > 0, "present" if path.exists() else "missing")

metadata_path = ROOT / "data/run_metadata.json"
if metadata_path.exists():
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    residual = abs(float(metadata.get("allocation_residual_pct", 999)))
    add("Allocation residual below 0.5%", residual <= 0.5, f"{residual:.6f}%")

findings_path = ROOT / "data/generated_findings.md"
if findings_path.exists():
    findings = findings_path.read_text(encoding="utf-8")
    import re
    has_nan_token = re.search(r"\bnan\b", findings.lower()) is not None
    add("Generated findings contain actual values", not has_nan_token and "{summary" not in findings, "checked")

width = max(len(name) for name, _, _ in checks)
print("\nBEYOND THE BUFFER — SUBMISSION VALIDATION\n")
for name, passed, detail in checks:
    marker = "PASS" if passed else "FAIL"
    print(f"[{marker}] {name:<{width}}  {detail}")

failed = [name for name, passed, _ in checks if not passed]
print()
if failed:
    print(f"NOT READY: {len(failed)} check(s) failed.")
    raise SystemExit(1)
print("READY: all required submission checks passed.")
