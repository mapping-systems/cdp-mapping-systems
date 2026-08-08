# Vanishing Network: Hailun

This package contains a static WebGL research website. Open `index.html` with
an internet connection, or serve the folder with any static web server.

## What is real

- The 3D land surface is a streamed digital elevation model from Mapterhorn.
- The base landscape uses Esri World Imagery.
- The Hailun boundary is OpenStreetMap relation 2755368.
- Settlement points, arterial roads, rail lines, station points, and the two
  openly mapped school points are current OpenStreetMap records clipped to the
  real Hailun boundary.
- Population values are census benchmarks for 2000, 2010, and 2020.
- The comparable Hailun census table supplies urban/rural, sex, family-household,
  and household-size values for all three years. The 2000 age split is omitted
  because a comparable local age table was not available in the sourced record.
- Hailun's seventh-census bulletin reports that residents age 60+ reached
  116,975, or 24.36%, in 2020; residents age 15-59 accounted for 64.88%.
  The bulletin also reports 204,513 family households, 461,685 people in
  family households, and an average family-household size of 2.26.
- The 2010 age shares and average household size shown in the interface are
  transparently derived from the bulletin's published changes: the age 60+
  share rose 12.20 percentage points and household size fell by 0.99 people.
- The population grids use WorldPop's unconstrained 1 km population-count
  rasters for 2000, 2010 and 2020. Source cells are fractionally clipped to
  Hailun, grouped into 3 by 3 cells, and normalized to the official county
  census totals. The 979 cells sum to exactly 720,008 in 2000, 769,437 in
  2010 and 480,216 in 2020.
- The official education-duty report counts 54 compulsory-education schools
  and 29,382 students in 2022. Its compliance counts and percentages imply 34
  primary-serving and 33 middle-serving schools; because the official unique
  total is 54, 13 institutions are counted in both stages. These three figures
  are labeled as derived, not direct historical observations.
- A compiled county-yearbook series reports 390 ordinary primary schools in
  2000, 218 in 2010 and 32 in 2014. The School timeline compares those values
  with the 2022 derived primary-serving count of 34, while explicitly marking
  the 2022 definition break.
- The official 2020 statistical table reports 747,294 registered residents.
  The census reports 480,216 permanent residents. Their difference, 267,078,
  is shown as supporting out-residence evidence rather than an exact migrant
  count.
- Boundary-clipped ohsome/OpenStreetMap history measurements report 115.8 km
  of mapped drivable roads in 2014, 333.0 km in 2015, 1,097.8 km in 2020,
  and 1,351.7 km in 2025.

## What is interactive

- Chart dots are read-only evidence markers. Hover to inspect the source;
  drag the bottom scrubber to move through observed years. Clicking the track
  alone does not jump the evidence state.
- The scrubber moves continuously and updates the mapped evidence as it crosses
  each observation, then snaps to the nearest documented year on release.
- In Population, switch between Total, Age, and Household. Each lens replaces
  the chart, metrics, timeline, source status, and map legend. Age and Household
  contain only the comparable 2010 and 2020 census observations.
- Population also includes a 3D Terrain / 2D Census view switch. The 2D Census
  view removes terrain, locks the map north-up at zero pitch, and presents
  countywide census tables for 2000, 2010 and 2020. Year buttons, the timeline,
  and playback all switch the report and the matching census-normalized
  WorldPop grid together. Residence, sex and family-household values are shown
  for all three years. Comparable age evidence is shown only for 2010 and 2020;
  the interface explicitly marks the 2000 age-table gap.
- Age places three labeled 3D countywide chart columns near Hailun for ages
  0-14, 15-59, and 60+. Household places one countywide 3D column at the same
  chart anchor. Moving the timeline changes their heights; in 2020, colored
  sleeves isolate the change from 2010. Click a map column to read its exact
  value for the selected census year.
- Every chapter timeline contains only years with comparable published evidence;
  unsupported years are omitted rather than displayed as empty stops.
- In Population, moving from 2010 to 2020 morphs the same 979 geographic
  columns. Bar height is linear at 0.18 map meters per resident. In 2020, pale
  bars show 480,216 remaining residents and coral upper segments show 289,926
  gross cell-level losses; 705 cell-level gains reconcile this with the net
  decline of 289,221. Clicking a column reveals its values.
- The School chapter plays through 2000, 2010, 2014 and 2022. Its chart and
  readout show countywide counts. Historical years repeat those totals as clearly
  labeled schematic dots distributed across mapped settlements: 390 in 2000, 218
  in 2010 and 32 in 2014. In 2022 the schematic field disappears and exactly two
  verified current school coordinates appear. The road network is hidden.
- The Outflow chapter steps back from Hailun to a national 2D map because no
  public Hailun-to-destination-city matrix was found. It reconstructs 2010 and
  2020 province-to-province rural-to-urban OD flows from official census
  long-form tables, scaling the 10% sample by ten.
- Only routes of at least 500,000 residents are drawn (23 in 2010 and 31 in
  2020). Line width encodes the exact flow and moving-arrow frequency is about
  one arrow per 500,000 residents. Headline totals retain all 930 cross-province
  OD pairs. Lines terminate at province display anchors, not claimed cities.
- The Road Grid chapter varies the current road scaffold using the historical
  mapped-length index. This is explicitly labeled as aggregate OSM mapping
  evidence, not a reconstruction of road construction or historical segments.
- Chapter selection changes the map, camera, evidence chart, and source-quality
  status.
- Orbit mode is active by default. A normal map drag rotates horizontally and
  tilts vertically around the current center. The header rotation control
  switches back to pan mode; scroll continues to zoom.

## What is not claimed

The website does not invent village-level service closures or historical routes.
Historical school dots are schematic comparison markers based on mapped settlement
locations, not claimed former school coordinates. The school chapter maps two sites
with current OpenStreetMap coordinates only at the 2022 stop. The official
2022 inventory counts 54 unique compulsory schools, but the timeline's 2022
primary-serving value is 34; two visible open-map sites does not mean two schools
exist in reality.
Age and household structure are countywide census evidence; those views hide
the spatial population columns and use clearly labeled chart anchors rather than
assigning county averages to villages or the ground beneath the columns.
Hailun's registered–permanent residence gap and its 2010–2020 population change
may include more than migration and are not used as counts of individual migrants.
WorldPop provides a modeled spatial distribution normalized to official census
totals; it is not used to invent migration paths. National Outflow routes are
census province-level OD pairs, while their endpoints are display anchors rather
than specific cities.
Road-history values measure OpenStreetMap coverage; they do not establish when
a physical road was built.

The terrain uses 2.2x vertical exaggeration so Hailun's subtle transition from
the Lesser Khingan foothills to the Songnen Plain remains legible at county
scale.

## Data snapshot

- OpenStreetMap boundary and feature snapshot: 2026-07-30.
- 385 current mapped settlements.
- 352 arterial-road or railway line features.
- 4 current mapped railway station points.
- 2 current mapped school points.

## Main sources

- Mapping Systems syllabus
- MapLibre GL JS 3D terrain example
- OpenStreetMap contributors
- Mapterhorn DEM
- Esri World Imagery
- WorldPop Global 2000-2020 gridded population counts
- China 2010 Population Census long-form Table 7-1
- China 2020 Population Census Yearbook long-form Tables 7-1a and 7-1b
- geoBoundaries China ADM1 outlines
- Hailun seventh census bulletin
- Hailun 2020 economic indicators
- Compiled Hailun ordinary-primary-school series from Owei Data
- Hailun government 2023 education-duty self-evaluation (2022 inventory)
- ohsome API / OpenStreetMap history
