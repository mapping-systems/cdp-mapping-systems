"""End-to-end static and data QA for Mapping System Weekly Assignments."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import parse_qsl, urlparse

import geopandas as gpd
import nbformat
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / "qa/project_validation.json"
CHECKS: list[dict] = []


def check(name: str, condition: bool, detail: object) -> None:
    CHECKS.append({"name": name, "pass": bool(condition), "detail": detail})


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_shared_data() -> None:
    monthly = pd.read_csv(ROOT / "data/processed/nyc_rent_monthly_normalized.csv")
    monthly["date"] = pd.to_datetime(monthly["date"])
    expected_months = pd.date_range("2016-07-01", "2026-06-01", freq="MS")
    continuity = all(
        group.sort_values("date").date.reset_index(drop=True).equals(pd.Series(expected_months))
        for _, group in monthly.groupby("borough")
    )
    check("Shared table has 600 rows", len(monthly) == 600, len(monthly))
    check("Shared table has 5 boroughs", monthly.borough.nunique() == 5, int(monthly.borough.nunique()))
    check("Shared table has 120 months", monthly.date.nunique() == 120, int(monthly.date.nunique()))
    check("Shared borough-month key is unique", not monthly.duplicated(["borough", "date"]).any(), int(monthly.duplicated(["borough", "date"]).sum()))
    check("Shared table required values are complete", not monthly.isna().any().any(), int(monthly.isna().sum().sum()))
    check("Shared monthly series are continuous", continuity, "2016-07 through 2026-06 for each borough")

    manhattan = json.loads((ROOT / "data/source/manhattan_rent_series.json").read_text())
    complete = (
        len(manhattan["months"]) == 120
        and len(manhattan["neighborhoods"]) == 31
        and all(len(item["rents"]) == 120 and all(value is not None for value in item["rents"].values()) for item in manhattan["neighborhoods"])
    )
    check("Manhattan series are 31 × 120 and complete", complete, {"areas": len(manhattan["neighborhoods"]), "months": len(manhattan["months"])})


def validate_notebook(
    relative_path: str,
    expected_code_cells: int | None = None,
    expected_png_outputs: int | None = None,
    maximum_bytes: int | None = None,
) -> None:
    notebook_path = ROOT / relative_path
    notebook = nbformat.read(notebook_path, as_version=4)
    code_cells = [cell for cell in notebook.cells if cell.cell_type == "code"]
    unexecuted = [index for index, cell in enumerate(notebook.cells) if cell.cell_type == "code" and cell.execution_count is None]
    errors = [output for cell in code_cells for output in cell.get("outputs", []) if output.output_type == "error"]
    count_ok = expected_code_cells is None or len(code_cells) == expected_code_cells
    check(f"{relative_path} code-cell count", count_ok, len(code_cells))
    check(f"{relative_path} executed top-to-bottom", not unexecuted, {"unexecuted_cells": unexecuted})
    check(f"{relative_path} has no saved error outputs", not errors, len(errors))
    if expected_png_outputs is not None:
        png_outputs = sum(
            "image/png" in output.get("data", {})
            for cell in code_cells
            for output in cell.get("outputs", [])
        )
        notebook_source = "\n".join(str(cell.source) for cell in notebook.cells)
        inserted_image_patterns = {
            "IPython Image import": r"from\s+IPython\.display\s+import[^\n]*\bImage\b",
            "file-backed Image display": r"\bImage\s*\(\s*filename\s*=",
            "file-backed SVG display": r"\bSVG\s*\(\s*filename\s*=",
            "raster file reload": r"\b(?:imread|Image\.open)\s*\(",
            "Markdown image insertion": r"!\[[^\]]*\]\(",
            "HTML image insertion": r"<img\b",
        }
        inserted_images = [
            label
            for label, pattern in inserted_image_patterns.items()
            if re.search(pattern, notebook_source, flags=re.IGNORECASE)
        ]
        check(
            f"{relative_path} stores direct plotted image/png results",
            png_outputs >= expected_png_outputs and not inserted_images,
            {
                "observed": png_outputs,
                "minimum": expected_png_outputs,
                "inserted_image_patterns": inserted_images,
            },
        )
    if maximum_bytes is not None:
        check(
            f"{relative_path} is bounded for GitHub preview",
            notebook_path.stat().st_size <= maximum_bytes,
            {"bytes": notebook_path.stat().st_size, "maximum": maximum_bytes},
        )


def validate_geojson(relative_path: str, expected_count: int | None = None) -> None:
    frame = gpd.read_file(ROOT / relative_path)
    epsg = frame.crs.to_epsg() if frame.crs else None
    count_ok = expected_count is None or len(frame) == expected_count
    check(f"{relative_path} feature count", count_ok, len(frame))
    check(f"{relative_path} uses EPSG:4326", epsg == 4326, epsg)
    check(f"{relative_path} geometries are valid/nonempty", bool(frame.geometry.notna().all() and frame.geometry.is_valid.all() and (~frame.geometry.is_empty).all()), "valid")


def validate_assignment02_pipeline() -> None:
    source = gpd.read_file(ROOT / "data/processed/manhattan_rent_growth_points.geojson").head(6).copy()
    source["place_id"] = source.area_id
    source["label"] = "Synthetic QA " + source.area_name
    source["category"] = "other"
    source["period"] = "2026"
    source["narrative_note"] = "Synthetic public point used only for pipeline QA."
    source["privacy_level"] = "public_site"
    source = source[["place_id", "label", "category", "period", "narrative_note", "privacy_level", "geometry"]]
    with tempfile.TemporaryDirectory(prefix="mapping-a02-qa-") as temp:
        temp_path = Path(temp)
        input_path = temp_path / "personal_places.synthetic.geojson"
        output_path = temp_path / "personal_places.enriched.geojson"
        audit_path = temp_path / "audit.json"
        source.to_file(input_path, driver="GeoJSON")
        run = subprocess.run(
            [
                sys.executable,
                str(ROOT / "02_geoprocessing/scripts/process_personal_places.py"),
                "--input", str(input_path),
                "--output", str(output_path),
                "--audit", str(audit_path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        audit = json.loads(audit_path.read_text()) if audit_path.exists() else {}
        portable_audit = {
            key: value
            for key, value in audit.items()
            if key not in {"input", "output"}
        }
        check(
            "A02 synthetic end-to-end pipeline",
            run.returncode == 0 and audit.get("output_features") == 6,
            {
                "returncode": run.returncode,
                "audit": portable_audit,
                "stderr": run.stderr[-500:],
            },
        )
    personal_input = ROOT / "02_geoprocessing/inputs/personal_places.geojson"
    personal_output = ROOT / "02_geoprocessing/outputs/personal_places_enriched.geojson"
    formal_complete = False
    detail: object = "missing formal input or output"
    if personal_input.exists() and personal_output.exists():
        formal_source = gpd.read_file(personal_input)
        formal_result = gpd.read_file(personal_output)
        formal_complete = (
            len(formal_source) == 6
            and len(formal_result) == 6
            and formal_source.place_id.is_unique
            and formal_result.place_id.is_unique
            and formal_result[["nta_name", "rent_area_name", "nearest_subway_station"]].notna().all().all()
        )
        detail = {"input_features": len(formal_source), "output_features": len(formal_result), "unique_outputs": bool(formal_result.place_id.is_unique)}
    check("A02 formal coursework mental-map output", formal_complete, detail)


def validate_har(relative_path: str) -> None:
    payload = json.loads((ROOT / relative_path).read_text())
    entries = payload.get("log", {}).get("entries", [])
    stripped = all(
        not entry.get("request", {}).get("headers")
        and not entry.get("request", {}).get("cookies")
        and "postData" not in entry.get("request", {})
        and not entry.get("response", {}).get("headers")
        and not entry.get("response", {}).get("cookies")
        and "text" not in entry.get("response", {}).get("content", {})
        for entry in entries
    )
    query_values = []
    for entry in entries:
        request = entry.get("request", {})
        query_values.extend(item.get("value") for item in request.get("queryString", []))
        query_values.extend(value for _, value in parse_qsl(urlparse(request.get("url", "")).query))
    query_safe = all(value == "[REDACTED]" for value in query_values)
    check(f"{relative_path} strips headers/cookies/bodies", stripped, len(entries))
    check(f"{relative_path} redacts all query values", query_safe, {"query_values_checked": len(query_values)})


def validate_web() -> None:
    for relative_path, count in [
        ("04_web_mapping/data/server_locations.geojson", 4),
        ("04_web_mapping/data/borough_rent_growth.geojson", 5),
        ("05_web_map_visualization/data/manhattan_rent_growth_points.geojson", 31),
        ("05_web_map_visualization/data/manhattan_nta.geojson", 38),
    ]:
        validate_geojson(relative_path, count)

    validate_har("04_web_mapping/data/streeteasy-dashboard.sanitized.har")
    validate_har("04_web_mapping/data/mapping-systems-course.sanitized.har")
    raw_hars = sorted(str(path.relative_to(ROOT)) for path in (ROOT / "04_web_mapping/data").glob("raw-*.har"))
    check("A04 raw HARs are absent", not raw_hars, raw_hars)
    upstream = ROOT / "04_web_mapping/vendor/geolocate-har-file/scrape_har_locations.py"
    check("A04 upstream course script hash", sha256(upstream) == "d7cc52fc3d2b82772f08e8fa568f26904988dd0fa6cecff3d47f775ea6917df3", sha256(upstream))

    browser_files = [
        ROOT / "05_web_map_visualization/index.html",
        ROOT / "05_web_map_visualization/map.js",
        ROOT / "05_web_map_visualization/config.js",
    ]
    browser_text = "\n".join(path.read_text() for path in browser_files)
    check("A05 browser bundle excludes service_role", "service_role" not in browser_text.lower(), "browser files only")
    config = (ROOT / "05_web_map_visualization/config.js").read_text()
    config_is_public = bool(
        re.search(r'SUPABASE_URL:\s*"https://[a-z0-9]+\.supabase\.co"', config)
        and re.search(r'SUPABASE_ANON_KEY:\s*"sb_publishable_[A-Za-z0-9_-]+"', config)
        and "sb_secret_" not in config
    )
    check("A05 committed config uses only browser-safe Supabase values", config_is_public, "publishable key + project URL")
    setup_sql = (ROOT / "05_web_map_visualization/sql/setup.sql").read_text()
    check(
        "A05 RPC removes default PUBLIC execute privilege",
        bool(re.search(r"revoke execute on function public\.find_rent_areas_within_radius\([\s\S]+?\) from public;", setup_sql, re.IGNORECASE)),
        "least-privilege RPC grant",
    )
    seed_rows = len(pd.read_csv(ROOT / "05_web_map_visualization/data/manhattan_rent_growth_points.csv"))
    seed_sql_count = (ROOT / "05_web_map_visualization/sql/seed.sql").read_text().count("gis.st_setsrid")
    check("A05 seed SQL covers all 31 areas", seed_rows == 31 and seed_sql_count == 31, {"csv_rows": seed_rows, "sql_rows": seed_sql_count})
    web_report = json.loads((ROOT / "qa/web-interaction-report.json").read_text())
    check("A04/A05 interaction test suite", web_report.get("failed") == 0 and web_report.get("fatal") is None, web_report)


def validate_network() -> None:
    validate_geojson("03_networks/outputs/data/neighborhood_centers_results.geojson", 31)
    validate_geojson("03_networks/outputs/data/neighborhood_to_subway_routes.geojson", 31)
    summary = json.loads((ROOT / "03_networks/outputs/data/validation_summary.json").read_text())
    check("Networks analysis checks pass", summary.get("all_checks_pass") is True, summary)
    check("Network distance is never below same-target Euclidean distance", summary.get("network_shorter_than_euclidean_violations") == 0, summary.get("network_shorter_than_euclidean_violations"))


def validate_code_first_submission() -> None:
    readmes = [
        "README.md",
        "01_loading_and_visualizing_data/README.md",
        "02_geoprocessing/README.md",
        "03_networks/README.md",
        "04_web_mapping/README.md",
        "05_web_map_visualization/README.md",
    ]
    markdown_image_pattern = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")
    markdown_link_pattern = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")
    for relative_path in readmes:
        readme_path = ROOT / relative_path
        text = readme_path.read_text(encoding="utf-8")
        image_targets = markdown_image_pattern.findall(text)
        all_targets = markdown_link_pattern.findall(text)
        local_targets = [
            target.split("#", 1)[0]
            for target in all_targets
            if target
            and not target.startswith(("#", "http://", "https://", "data:", "mailto:"))
        ]
        missing = [
            target
            for target in local_targets
            if not (readme_path.parent / target).resolve().exists()
        ]
        check(
            f"{relative_path} links code/results without embedded images",
            not image_targets and not missing,
            {
                "embedded_images": image_targets,
                "local_targets": len(local_targets),
                "missing": missing,
            },
        )

    web_sources = [
        ROOT / "04_web_mapping/index.html",
        ROOT / "05_web_map_visualization/index.html",
    ]
    html_images = [
        str(path.relative_to(ROOT))
        for path in web_sources
        if re.search(r"<img\b", path.read_text(encoding="utf-8"), re.IGNORECASE)
    ]
    check(
        "Web-map source contains no screenshot image elements",
        not html_images,
        html_images,
    )

    image_suffixes = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
    committed_images = sorted(
        str(path.relative_to(ROOT))
        for path in ROOT.rglob("*")
        if path.is_file()
        and path.suffix.lower() in image_suffixes
        and "node_modules" not in path.parts
        and "vendor" not in path.parts
    )
    expected_images = sorted(
        [
            "04_web_mapping/outputs/web-map-desktop.png",
            "05_web_map_visualization/outputs/web-map-supabase-desktop.png",
        ]
    )
    check(
        "Only the two teacher-required web-map screenshots are retained",
        committed_images == expected_images,
        {"observed": committed_images, "expected": expected_images},
    )

    a01 = nbformat.read(
        ROOT / "01_loading_and_visualizing_data/assignment01_nyc_rent_analysis.ipynb",
        as_version=4,
    )
    a01_source = "\n".join(str(cell.source) for cell in a01.cells)
    check(
        "A01 notebook omits oversized widget state from GitHub handoff",
        "widgets" not in a01.metadata,
        sorted(a01.metadata.keys()),
    )
    check(
        "A01 local rerun displays the Lonboard map",
        "display(interactive_map)" in a01_source,
        "display(interactive_map)",
    )


def validate_outputs() -> None:
    required = [
        "README.md",
        "01_loading_and_visualizing_data/assignment01_nyc_rent_analysis.ipynb",
        "02_geoprocessing/02_geoprocessing.ipynb",
        "02_geoprocessing/inputs/personal_places.geojson",
        "02_geoprocessing/outputs/personal_places_enriched.geojson",
        "03_networks/03_networks.ipynb",
        "03_networks/outputs/data/neighborhood_to_subway_routes.geojson",
        "04_web_mapping/index.html",
        "04_web_mapping/map.js",
        "04_web_mapping/data/server_locations.geojson",
        "04_web_mapping/outputs/web-map-desktop.png",
        "04_web_mapping/outputs/ip_map_folium.html",
        "05_web_map_visualization/index.html",
        "05_web_map_visualization/map.js",
        "05_web_map_visualization/outputs/web-map-supabase-desktop.png",
        "05_web_map_visualization/sql/setup.sql",
        "05_web_map_visualization/sql/seed.sql",
    ]
    missing = [path for path in required if not (ROOT / path).exists()]
    check("Required local artifacts exist", not missing, {"missing": missing, "checked": len(required)})


def main() -> None:
    validate_shared_data()
    validate_notebook(
        "01_loading_and_visualizing_data/assignment01_nyc_rent_analysis.ipynb",
        16,
        expected_png_outputs=6,
        maximum_bytes=5_000_000,
    )
    validate_notebook(
        "02_geoprocessing/02_geoprocessing.ipynb",
        7,
        expected_png_outputs=2,
        maximum_bytes=2_000_000,
    )
    validate_notebook(
        "03_networks/03_networks.ipynb",
        expected_png_outputs=3,
        maximum_bytes=2_000_000,
    )
    validate_assignment02_pipeline()
    validate_network()
    validate_web()
    validate_code_first_submission()
    validate_outputs()
    failed = [item for item in CHECKS if not item["pass"]]
    report = {
        "status": "PASS" if not failed else "FAIL",
        "checks": len(CHECKS),
        "passed": len(CHECKS) - len(failed),
        "failed": len(failed),
        "pending_user_gates": [],
        "results": CHECKS,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("status", "checks", "passed", "failed", "pending_user_gates")}, indent=2))
    if failed:
        for item in failed:
            print(f"FAIL: {item['name']} — {item['detail']}")
        raise SystemExit(2)


if __name__ == "__main__":
    main()
