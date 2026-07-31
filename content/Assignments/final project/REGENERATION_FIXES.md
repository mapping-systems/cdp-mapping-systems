# Regeneration fixes

- Removed `.rename_geometry("geometry")` after GeoDataFrame construction.
- Added automatic graph reprojection and explicit CRS assertions.
- Replaced Chapter 13 polygon buffers and spatial join with chunked NumPy Euclidean distance calculations.
- Made Chapter 13 safe to rerun by dropping derived fields before merging.
- Retained local case-insensitive Socrata county filtering and point parsing.
- Reset notebook outputs and registered a Python 3.12 kernel target.
