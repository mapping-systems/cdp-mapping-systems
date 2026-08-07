# Data Sources and Evidence Boundaries

## Shared frozen snapshot

All five assignments use one fixed temporal window: **July 2016 through June 2026**.
Keeping a frozen snapshot makes the notebooks and maps reproducible even when the
upstream dashboard later adds another month.

### StreetEasy asking-rent and inventory series

- Source: [StreetEasy Data Dashboard](https://streeteasy.com/blog/data-dashboard/)
- Upstream download recorded in the earlier course project:
  `https://cdn-charts.streeteasy.com/Master%20Report.zip`
- Local source copies:
  - `data/source/nyc_rent_monthly.csv`: 600 borough-month observations
  - `data/source/manhattan_rent_series.json`: 31 Manhattan neighborhood series,
    each with 120 monthly asking-rent observations
- Principal measures: median asking rent and rental listing inventory

StreetEasy measures advertised listings on its platform. It does **not** measure
the rent paid by every renter, lease renewals that are never listed, or the full
New York City rental stock. Dollar values are nominal and are not adjusted for
inflation. Associations between rent, inventory, location, and transit access do
not establish causality.

### NYC Housing and Vacancy Survey checkpoints

- Local copy: `data/source/nyc_vacancy_rates.csv`
- Checkpoints: 2017, 2021, and 2023 citywide net rental vacancy rates

These sparse citywide observations provide context only. They are not interpolated
into monthly values and are not treated as a neighborhood-level causal driver.

## Reference geography and networks

- NYC Planning 2020 Neighborhood Tabulation Areas, reused from the verified
  NYC TIME FIELD project: `data/reference/nyc_neighborhoods.geojson`
- Manhattan NTA reference geometry: `data/reference/manhattan_nta.geojson`
- MTA station and line snapshots: `data/reference/subway_stations.geojson` and
  `data/reference/subway_lines.geojson`

All web-facing GeoJSON is stored in WGS84 (`EPSG:4326`). Metric geoprocessing and
distance checks use a projected CRS or PostGIS `geography`.

## Personal-location privacy

Assignment 02 uses six public Manhattan anchors already documented in the
author's Columbia coursework: the Columbia GSAPP origin from NYC TIME FIELD and
five selected points from `street-view-challenge/locations.csv`. The dataset is
framed as a coursework mental map, not a claim of residence, private routine, or
physical visit. Public GeoJSON retains only a chosen label, a
neighborhood/intersection/public-site coordinate, a category, a period, a short
narrative note, and one of the privacy designations `neighborhood`,
`intersection`, or `public_site`.
