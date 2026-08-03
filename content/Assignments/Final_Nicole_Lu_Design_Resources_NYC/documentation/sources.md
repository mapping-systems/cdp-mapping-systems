# Data Sources

Downloaded July 29, 2026.

## NYC borough boundaries

- NYC Open Data
- https://data.cityofnewyork.us/City-Government/Borough-Boundaries/7t3b-ywvw
- Local file: `data/raw/nyc-borough-boundaries.geojson`

## 2020 Neighborhood Tabulation Areas

- NYC Department of City Planning
- https://www.nyc.gov/content/planning/pages/resources/datasets/neighborhood-tabulation
- Local file: `data/raw/nyc-2020-neighborhood-tabulation-areas.geojson`

## DCLA Cultural Organizations

- NYC Department of Cultural Affairs via NYC Open Data
- https://data.cityofnewyork.us/Recreation/DCLA-Cultural-Organizations/u35m-9t32
- Local file: `data/raw/dcla-cultural-organizations.csv`
- This source is broader than design and must be filtered.

## OpenStreetMap candidates

- OpenStreetMap contributors via Overpass API
- Query: `documentation/overpass-query.txt`
- Local file: `data/raw/osm-design-resource-candidates.json`
- Community-contributed records must be cleaned, deduplicated, and verified.
