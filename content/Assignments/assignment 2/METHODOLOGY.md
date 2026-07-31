# Proposed Methodology

## 1. Analytical objective

The analysis will compare my subjective `noise_1_5` and `stress_1_5` observations with nearby NYC 311 noise complaints.

The important methodological improvement is that the relationship will be evaluated in both **space and time**. A complaint occurring close to my route but at a completely different hour should not be treated as equally relevant to my experience.

## 2. Input A — Personal mental-map dataset

**File:** `data/daily_mental_map_amsterdam_to_gsapp.geojson`

### Geometries

| Feature class | Geometry | Analytical purpose |
|---|---|---|
| Daily stops | Point | Compare observations at home, crossings, campus, studio, coffee, and park locations |
| Route segments | LineString | Measure exposure along movement corridors |
| Full daily route | LineString | Define the overall study extent |
| Mental zones | Polygon | Compare domestic, commuting, academic, and restorative areas |

### Core variables

| Variable | Interpretation |
|---|---|
| `noise_1_5` | Personal perception of sound intensity |
| `stress_1_5` | Personal psychological pressure |
| `comfort_1_5` | Personal physical and emotional comfort |
| `emotion_valence_neg4_pos4` | Negative-to-positive emotional response |
| `greenery_1_5` | Perceived vegetation |
| `arrival_time` | Approximate time of observation |
| `duration_min` | Time spent at the location |
| `experience` | Narrative interpretation of a route segment |

## 3. Input B — Related public dataset

**Dataset:** NYC 311 Service Requests from 2020 to Present  
**Source:** https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2020-to-Present/erm2-nwe9

### Required fields

- `unique_key`
- `created_date`
- `closed_date`
- `agency`
- `complaint_type`
- `descriptor`
- `incident_address`
- `street_name`
- `borough`
- `latitude`
- `longitude`
- `location_type`
- `status`

### Proposed query

The analysis will request only:

1. records classified as noise complaints,
2. records in Manhattan,
3. records within the most recent complete twelve-month period,
4. records inside a bounding box around 1440 Amsterdam Avenue, Columbia, and Riverside Park,
5. records with valid coordinates.

A focused API request is preferable to downloading the complete citywide file because the full 311 dataset is very large.

## 4. Data preparation

### Personal GeoJSON

1. Load the GeoJSON into QGIS.
2. Filter by `feature_class` and export four temporary layers.
3. Validate geometries.
4. Reproject from `EPSG:4326` to `EPSG:2263`.
5. Convert time fields to proper time values.
6. Create a numeric observation hour from `arrival_time`.

### 311 noise complaints

1. Download the filtered records as GeoJSON or CSV.
2. Parse `created_date` as a datetime.
3. Remove records with missing coordinates.
4. Remove obvious duplicate records only after inspecting `unique_key`, address, time, and descriptor.
5. Convert coordinates to a point layer.
6. Reproject to `EPSG:2263`.
7. Create fields for:
   - complaint hour,
   - weekday,
   - month,
   - broad noise source,
   - nighttime/daytime classification.

## 5. Spatial relationship

### A. Stop-level buffers

Generate three buffers around each stop:

- 200 feet,
- 400 feet,
- 800 feet.

Using multiple distances tests whether the result is sensitive to an arbitrary buffer choice.

For each buffer, calculate:

- total complaints,
- complaints per acre,
- dominant descriptor,
- nighttime complaint percentage,
- number of distinct complaint days.

### B. Route-segment corridors

Create a 100-foot corridor around each route segment.

Calculate:

- complaint count,
- complaints per 1,000 feet,
- dominant complaint type,
- complaint count during the approximate travel hour.

### C. Mental-zone summaries

Spatially join complaints to the four mental zones:

- Domestic Anchor Zone
- Amsterdam Commuting Corridor
- Academic Intensity Zone
- Restorative Westward Zone

Calculate complaint density by zone area rather than comparing raw counts.

## 6. Temporal relationship

For each stop, compare complaints in three temporal windows:

- **tight window:** ±1 hour from arrival,
- **daily window:** same hour across all selected days,
- **general window:** all complaints regardless of time.

This creates three different interpretations:

1. immediate contextual relevance,
2. recurring time-of-day pattern,
3. general neighborhood reporting intensity.

## 7. Standardization and comparison

Because personal scores and complaint counts use different scales, both measures will be standardized from 0 to 1.

### Proposed fields

```text
personal_noise_norm
complaint_density_norm
agreement_score
mismatch_score
relationship_class
```

### Proposed classifications

| Relationship class | Meaning |
|---|---|
| High personal / high public | Personal experience agrees with high complaint density |
| Low personal / low public | Both datasets indicate relative quiet |
| High personal / low public | Personally intense but weakly represented in 311 |
| Low personal / high public | Complaints are common but not strongly experienced in my routine |

The mismatch categories are potentially more interesting than simple agreement.

## 8. Proposed outputs

### Map 1 — Personal narrative map

Show:

- home and major daily stops,
- route sequence,
- mental zones,
- symbols scaled by duration,
- color classified by emotional valence.

### Map 2 — Public noise landscape

Show:

- 311 complaint density,
- complaint categories,
- daytime versus nighttime patterns.

### Map 3 — Agreement and mismatch

Map each stop using the four relationship classes.

### Chart 1 — Route experience profile

Horizontal axis:

- stop sequence.

Vertical variables:

- noise,
- stress,
- comfort,
- greenery,
- emotional valence.

### Chart 2 — Personal noise versus complaint density

Create a scatter plot with:

- personal noise score on the x-axis,
- nearby complaint density on the y-axis,
- point size based on duration,
- labels for important outliers.

### Diagrammatic output

Use a final annotated route showing where the city is:

- institutionally reported,
- personally felt,
- both,
- or neither.

## 9. Expected interpretation

I expect the Amsterdam Avenue and major-crossing segments to show relatively high personal noise and moderate-to-high 311 activity.

I expect Riverside Park to show low personal noise and lower complaint density, although nearby residential or event complaints could complicate this expectation.

Avery Hall may produce an important mismatch. My stress there may be high even when nearby 311 noise reporting is limited. This would demonstrate that emotional intensity cannot be reduced to environmental noise.

## 10. Limitations

### Personal data

- Represents one person.
- Represents a constructed typical day rather than continuous tracking.
- Uses approximate times and locations.
- Uses subjective ordinal scales.
- Can be influenced by deadlines, sleep, weather, and social context.

### 311 data

- Records complaints, not measured decibel levels.
- Reflects unequal willingness and ability to report.
- May contain repeated reports of the same event.
- May omit routine noise that people accept or do not report.
- Categories are administrative and may simplify complex sound experiences.
- A low complaint count does not prove that an area is quiet.

### Spatial method

- Buffer sizes affect results.
- Sound does not travel in perfect circles.
- Building walls, elevation, traffic direction, and interior conditions matter.
- Spatial proximity does not establish causation.
- A complaint near a stop may not describe what I heard.

## 11. Possible second phase

A stronger future version would create a new related dataset using repeated sound measurements.

At each stop, I would record:

- average decibel level,
- maximum decibel level,
- one-minute audio classification,
- weather,
- traffic count,
- indoor/outdoor status,
- and observation notes.

Measurements would be repeated in the morning, afternoon, and evening for at least seven days. This would allow comparison among:

1. personal perception,
2. physical sound measurements,
3. public 311 reporting.
