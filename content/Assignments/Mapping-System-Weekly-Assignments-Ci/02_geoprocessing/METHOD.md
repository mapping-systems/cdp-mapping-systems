# A personal geography of rent change

## Narrative

Six public Manhattan anchors from the author's existing Columbia coursework
form a small mental map of study, transit, fieldwork, and urban observation.
Columbia GSAPP is the recurring study origin in NYC TIME FIELD; the other five
locations were already selected in `street-view-challenge/locations.csv`.
Reusing these authored course artifacts provides a real, auditable narrative
without inventing a home address, private routine, or claim of physical visit.

The point dataset records only public sites or intersection-level locations.
Each feature contains one short, public-facing narrative note and no apartment
number, unit, full home address, or raw geocoding string.

The spatial question is: **What official neighborhood, StreetEasy rent-reporting
area and subway station are closest to each course anchor, and what 2016–26
asking-rent change is associated with that rent area?** The resulting relations
are contextual, not causal. A nearest representative point also does not prove
that the personal place lies inside StreetEasy’s reporting boundary.

## Related datasets

- [StreetEasy Data Dashboard](https://streeteasy.com/blog/data-dashboard/) —
  monthly median asking rent. This project uses the frozen July 2016–June 2026
  extract documented in the project-level `DATA_SOURCES.md`.
- [NYC 2020 Neighborhood Tabulation Areas](https://www.nyc.gov/site/planning/data-maps/open-data/census-download-metadata.page) —
  polygon context for a point-in-polygon spatial join.
- [MTA Developer Resources](https://new.mta.info/developers) — subway station
  point context. The local station file is a documented reference snapshot.

## Proposed and implemented workflow

1. Create exactly six GeoJSON Points in CRS84/EPSG:4326 using intersection,
   neighborhood or public-site precision.
2. Validate the fixed property schema and reject precise-address fields.
3. Reproject points, Manhattan NTAs, StreetEasy representative points and
   subway points to **EPSG:2263 (NAD83 / New York Long Island ftUS)**.
4. Spatially join each personal point to the containing NTA (`within`).
5. Nearest-join each point to a StreetEasy reporting-area representative point;
   attach July 2016 and June 2026 rent and `growth_pct`.
6. Nearest-join each point to a subway station and calculate projected
   straight-line distance.
7. Convert distances to meters and export the enriched GeoJSON in EPSG:4326 for
   web compatibility.

The source file has the required fields `place_id`, `label`, `category`,
`period`, `narrative_note`, and `privacy_level`. The processing script adds NTA,
rent and transit fields without changing the original geometry.

## Run status

The code, public related datasets, workflow diagram, and privacy-safe coursework
mental map are complete. Run:

```bash
python \
  02_geoprocessing/scripts/process_personal_places.py
```

The script writes `outputs/personal_places_enriched.geojson` and a machine-
readable validation report. The separate template remains available if the
author later chooses to replace these public course anchors with another set of
confirmed locations.
