# Fixes and checks

## Critical fixes

1. Replaced the brittle Socrata GeoJSON query `county = 'New York'`.
2. The notebook now downloads the Socrata JSON table, normalizes county values locally, and selects `NEW YORK` case-insensitively.
3. The `georeference` field is converted to Shapely points from either GeoJSON dictionaries or WKT text.
4. Empty or corrupted Socrata cache files are deleted automatically and downloaded again.
5. Store addresses now use the dataset's actual `address_line_1` and `address_line_2` fields.
6. Removed the undocumented establishment-type prefix filter. The source is already a licensed retail-food-store dataset.
7. Made `plot_metric()` compatible with different GeoPandas/mapclassify versions by adding a continuous-map fallback.
8. Project-root detection now works when VS Code launches the notebook from the project folder or its parent workspace.
9. Closure scenarios degrade safely when floor-area coverage is incomplete.
10. The OSMnx graph remains on its largest connected walk component to avoid unreachable fragments.

## Offline validation performed

- All notebook code cells parse successfully with Python AST.
- Extracted notebook Python compiles successfully.
- `web/main.js` passes `node --check`.
- Corrected network-distance, threshold, and closure logic tests pass.
- Socrata county normalization and point parsing tests pass.

## First run

Delete any files left in `data/` from the broken version, then restart the kernel and use **Run All**.
