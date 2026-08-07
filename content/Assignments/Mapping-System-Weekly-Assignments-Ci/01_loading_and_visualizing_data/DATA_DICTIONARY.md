# Data Dictionary

## Source table

`../data/source/nyc_rent_monthly.csv` is a frozen borough-level extract from the [StreetEasy Data Dashboard](https://streeteasy.com/blog/data-dashboard/). Its grain is one borough-month from July 2016 through June 2026.

| Source field | Notebook field | Type | Meaning |
|---|---|---:|---|
| `date` | `date` | month | Calendar month, stored as `YYYY-MM` in the CSV and parsed to the first day of the month. |
| `borough` | `borough` | category | Manhattan, Brooklyn, Queens, Bronx, or Staten Island. |
| `medianAskingRent` | `median_asking_rent_usd` | integer USD | Exact middle asking rent among StreetEasy rental listings available during the month. This is advertised rent, not rent paid by all tenants. |
| `rentalInventory` | `rental_inventory` | integer listings | Count of rental listings observed on StreetEasy during the month. This is not the complete vacant-unit or housing-stock count. |

## Derived monthly fields

`outputs/nyc_rent_monthly_derived.csv` retains the four normalized source fields and adds:

| Field | Formula / meaning |
|---|---|
| `rent_index` | `median_asking_rent_usd / July 2016 rent × 100` within each borough. |
| `inventory_index` | `rental_inventory / July 2016 inventory × 100` within each borough. |
| `rent_change_from_baseline_usd` | Monthly asking rent minus the borough's July 2016 asking rent. |
| `rent_growth_from_baseline_pct` | `rent_index - 100`. |
| `inventory_change_from_baseline` | Monthly listing inventory minus the borough's July 2016 inventory. |
| `inventory_growth_from_baseline_pct` | `inventory_index - 100`. |
| `rent_yoy_pct` | Percent change in asking rent from the same month 12 months earlier. The first 12 values per borough are null by construction. |
| `inventory_yoy_pct` | Percent change in inventory from the same month 12 months earlier. The first 12 values per borough are null by construction. |

## Borough endpoint summary

`outputs/borough_change_summary.csv` has one row per borough and includes `baseline_rent_usd`, `end_rent_usd`, `rent_change_usd`, `rent_growth_pct`, `baseline_inventory`, `end_inventory`, `inventory_change`, and `inventory_growth_pct`. Baseline is July 2016; endpoint is June 2026.

## Geometry

`../data/reference/nyc_neighborhoods.geojson` contains 197 valid EPSG:4326 neighborhood polygons. Assignment 01 projects them to EPSG:2263, dissolves them by `borough`, applies a 25-foot outward/inward cartographic closing to remove narrow sliver gaps (validated to change total dissolved area by less than 0.2%), joins the five endpoint records one-to-one, and exports `outputs/borough_rent_growth.geojson`. The rental attributes remain boroughwide; the geometry does not create neighborhood-level rent estimates.

## Interpretation boundaries

- Dollar values are nominal and not inflation-adjusted.
- StreetEasy listings may differ from the full rental market in coverage, composition, and listing practices.
- Staten Island inventory counts are especially small, so percentage changes can be volatile.
- Maps show spatial context, not within-borough variation.
- Associations between rent and inventory do not identify causal effects.
