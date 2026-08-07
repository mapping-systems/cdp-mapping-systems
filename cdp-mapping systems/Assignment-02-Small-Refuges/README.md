# Assignment 02 — A Personal Atlas of Small Refuges

## Research statement

**Where can I pause without going home or buying something?**

This dataset maps places that function—or fail to function—as small refuges within my everyday cultural geography of New York. It focuses on libraries, parks, museums, theater lobbies, atria, and public plazas used for studying, reading, waiting before performances, recovering after exhibitions, or briefly withdrawing from the intensity of the street.

The narrative is not simply about where seating exists. A refuge is shaped by several conditions at once: quietness, welcome, cost, institutional access, opening hours, weather, security, and the feeling of being permitted to remain.

## Dataset

- **File:** `small_refuges.geojson`
- **Geometry type:** Point
- **Coordinate system:** WGS 84 / longitude–latitude
- **Number of features:** 28
- **Spatial extent:** New York City
- **Data source:** A curated personal mental map of daily study, museum-going, theater-going, walking, waiting, and recovery spaces

The point coordinates represent the main entrance or central public area of each location. The dataset is qualitative and selective rather than an exhaustive inventory of public space.

## Narrative categories

### `refuge`

A place that supports a free or low-threshold pause and generally provides a strong combination of quiet, comfort, and permission to remain.

### `conditional_refuge`

A place that can support rest, but only under particular conditions such as institutional affiliation, admission policy, security, event schedules, weather, crowds, or a corporate atmosphere.

### `failed_refuge`

A place that is physically public or accessible but does not provide meaningful recovery because of sensory intensity, crowding, surveillance, or lack of comfort.

## Attribute dictionary

| Field | Description |
|---|---|
| `id` | Unique feature identifier |
| `place_name` | Name of the refuge or contrast location |
| `place_type` | Library, museum, park, theater lobby, atrium, plaza, or related type |
| `neighborhood` | General neighborhood |
| `refuge_status` | `refuge`, `conditional_refuge`, or `failed_refuge` |
| `quiet_score` | Ordinal quietness rating from 1 (very loud) to 5 (very quiet) |
| `welcome_score` | Ordinal feeling-of-permission rating from 1 (unwelcoming) to 5 (clearly welcoming) |
| `purchase_required` | Whether payment or purchase is required, optional, or conditional |
| `access_condition` | Rule or condition that shapes entry and use |
| `indoor_outdoor` | Indoor, outdoor, or combined setting |
| `typical_duration_min` | Approximate duration of a normal pause |
| `daily_life_relation` | How the place fits into everyday cultural and school-related movement |
| `narrative_note` | Short interpretation of why the place succeeds or fails as a refuge |

The scores are ordinal narrative attributes. A score of 5 is not mathematically “five times quieter” than a score of 1.

## Proposed related dataset

### NYC 311 Service Requests from 2020 to Present

Official dataset page:

https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2020-to-Present/erm2-nwe9

Socrata API endpoint:

https://data.cityofnewyork.us/resource/erm2-nwe9.json

The proposed analysis will filter this dataset to noise-related complaints and use fields including:

- `created_date`
- `complaint_type`
- `descriptor`
- `latitude`
- `longitude`

This is the same source explored in Assignment 01, **The City Hears Complaints, Not Sound**.

## Why relate the datasets?

The personal refuge dataset records situated and qualitative experience. The 311 dataset records sounds that residents choose to report through an official municipal system.

Relating the two makes it possible to ask:

> Do places experienced as quiet refuges also sit within areas that generate fewer noise complaints?

The most useful results may be mismatches. A museum interior may feel quiet even when its surrounding block generates many complaints, while a place with few nearby complaints may still feel loud or uncomfortable. These discrepancies would demonstrate that indoor experience, access rules, and personal perception cannot be reduced to citywide complaint density.

## Proposed methodology

1. Filter the 311 data to noise-related complaints during a defined time period.
2. Convert both datasets to GeoDataFrames.
3. Reproject both layers into a local projected coordinate system suitable for distance calculations.
4. Create a 250-meter buffer around each refuge point.
5. Spatially join 311 complaint points that fall within each buffer.
6. Calculate for each refuge:
   - total nearby noise complaints;
   - nighttime complaints;
   - complaint categories and descriptors.
7. Join the counts back to the refuge dataset.
8. Compare nearby complaint activity with `quiet_score`, `welcome_score`, and `refuge_status`.
9. Identify alignments and mismatches between official reporting geography and the personal mental map.
10. Test 100-meter, 250-meter, and 500-meter buffers to determine how sensitive the results are to the definition of “nearby.”

The diagram `workflow-diagram.png` expresses this proposed workflow.

## Methodological limits

- The refuge dataset is a selective mental map, not a representative survey of New Yorkers.
- Quiet and welcome scores are qualitative and ordinal.
- Access conditions, hours, ticket policies, programming, and construction may change.
- A 250-meter buffer describes an exterior neighborhood context; it cannot directly measure the acoustic conditions inside a museum, library, or theater.
- 311 complaint density is not the same as measured sound intensity.
- Multiple 311 records may refer to the same event, while places with few complaints may be underreported rather than quiet.
- Citywide comparisons would eventually need to consider population density, land use, and the selected time period.

## Submission files

```text
Assignments/
└── 02_geoprocessing/
    ├── small_refuges.geojson
    ├── README.md
    └── workflow-diagram.png
```
