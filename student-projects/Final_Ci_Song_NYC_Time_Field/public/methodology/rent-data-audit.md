# Rent data audit

## Dataset and grain

The published table has one row per residential H3 resolution 9 cell. It uses
2020–2024 American Community Survey table `B25064` (median monthly gross rent),
its published margin of error, 2024 Census geography, and MapPLUTO `UnitsRes`
to represent where residential units are located inside each cell.

## Allocation hierarchy

1. Use the official block-group value containing each residential tax lot.
2. If that value is unavailable, use the official containing tract value.
3. If the tract value is unavailable, use the official borough value.
4. Weight the source values by MapPLUTO residential units within the H3 cell.

No neighboring-area smoothing is used.

## Quality checks

| Check | Result |
| --- | ---: |
| Residential H3 rows | 5,543 |
| Residential H3 cells with a rent value | 5,543 (100%) |
| Residential units connected to a source | 100.0% after rounding |
| Distinct rent values | 4,308 |
| Distinct bar heights | 4,308 |
| Block groups with a direct valid estimate | 5,213 |
| Block-group share of allocated residential units | 82.26% |
| Tract fallback share | 11.92% |
| Borough fallback share | 5.82% |
| Missing values in published residential rows | 0 |

Primary-key, completeness, numeric-range, monotonic-height, source-coverage,
and GeoJSON-to-CSV row-identity checks pass in the automated data validation.

## Interpretation

`median_gross_rent_usd` is an ACS survey estimate for an area, not an
individual apartment lease. Gross rent includes tenant-paid utilities. The
table is the finest complete, reproducible public citywide allocation used by
this project, but it must not be described as current asking rent or exact rent
for a particular building.

`bar_height_m` is a display-only, monotonic dense-rank scale from 50 to 2,650
map meters. Equal prices have equal heights, and every distinct price has a
distinct height. This exaggerates differences for legibility; the popup and
CSV retain the actual dollar value.
