# Web data

`dot_pause_candidates.geojson` contains the prepared NYC DOT Bench + Leaning Bar candidate pool around Bryant Park.

The visual-condition field is generated live in the browser across the full 15-minute preparation area. The web app requests three public NYC Open Data layers:

- NYC Street Centerline
- 2015 Street Tree Census
- NYC Building Footprints

Street centerlines are sampled at approximately 10 m intervals. Each sample is assigned its nearest-tree distance and nearest-building-edge distance, then classified into one of four visual conditions using the median distance thresholds computed from the full field.
