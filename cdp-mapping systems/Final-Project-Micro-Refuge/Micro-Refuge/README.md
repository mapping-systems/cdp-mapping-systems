# Micro-Refuge — Bryant Park Web Prototype v8

This version converts the project into an English interactive web map and removes the old core-area-only raw sampling-point display.

## v8 visual system

The interface and basemap now use a palette sampled from the supplied reference map:

- Exposed Edge — coral `#CB7456`
- Screened Edge — blue-teal `#397082`
- Vegetated Buffer — mint `#61C899`
- Open Field — cream `#E5ECC5`
- DOT seating — deep navy `#152135`
- Selected location — warm highlight `#EEAF8A`

The basemap uses muted paper, green, blue, and navy tones so the analytical field reads like an urban atlas rather than a default web map. DOT seating is deliberately kept as one navy entity layer; visual-condition color remains on the street field.

## What changed

- Entire website copy is in English.
- The full 15-minute Bryant Park study area is analyzed, rather than showing only the earlier core-area sample field.
- Street conditions are generated at approximately 10 m intervals across the study area.
- The user sees a continuous colored street-condition field, not raw sampling dots.
- Selecting 5 / 10 / 15 minutes clips both the visual field and DOT pause locations to the selected range and automatically reframes the map.
- The 47 prepared NYC DOT Bench + Leaning Bar locations remain the pause-location candidate pool.
- Each DOT location is linked to its nearest live visual sample after the field is built.
- The interface compares the nearest pause location with the nearest more-screened option.

## Live public data

The environmental field is generated in the browser from NYC Open Data:

- NYC Street Centerline
- 2015 Street Tree Census
- NYC Building Footprints

This means the page needs an internet connection when it first loads.

## Run locally

Do not open `index.html` directly from Finder. Serve the folder over HTTP:

```bash
cd Final-Project-Micro-Refuge-v6-Web-English-FullField
python3 -m http.server 8000
```

Then open:

`http://localhost:8000`

## Publish

The folder is static and can be published with GitHub Pages. The map and NYC Open Data calls are made directly in the browser.

## Current methodological boundary

5 / 10 / 15 minutes are approximate radial walking budgets using 80 m/min, not pedestrian-network isochrones yet. The visual model measures proximity-based potential visual buffering; it does not directly measure privacy, quietness, safety, comfort, or actual human visibility.


## Visual palette (v8)

The basemap is now white/black/gray. Visual conditions use deep green, light green, yellow, and bright yellow-green; DOT seating is black; interactive selection and origin states use blue.

## Palette

- Screened Edge — deep green `#1F5A43`
- Vegetated Buffer — light green `#86B978`
- Open Field — yellow `#E2C84A`
- Exposed Edge — blue `#2F6FB0`
- DOT seating — black `#111111`
- Selected location / origin — bright yellow-green `#C8E63C`
- Walking-time range — pale blue `#DCEBFA` with blue outline `#2F6FB0`
- Basemap — white with black and neutral gray linework

The analytical field is deliberately green-led. Yellow and bright yellow-green describe the more open/exposed conditions, while blue is reserved for interaction rather than environmental classification.
