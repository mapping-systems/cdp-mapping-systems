# NYC TIME FIELD

NYC TIME FIELD is an interactive Mapping Systems final project that compares
subway, driving, and walking accessibility across New York City, then lets the
reader switch 3D bar height from time remaining to H3-level rent.

## 1. View Online

Open the published project directly in a web browser:

**[Launch NYC TIME FIELD on this repository's GitHub Pages](https://cisanotheraccount.github.io/cdp-mapping-systems_Ci/)**

No download, installation, account, API key, or local server is required for
this option.

## 2. Download and Run Locally

The local viewer requires [Node.js](https://nodejs.org/) **22.13.0 or newer**.
Python and API keys are not required: the repository already includes the
browser-ready datasets in [`public/data/`](public/data/).

### Option A: clone the project branch with Git

```bash
git clone --branch ci/nyc-time-field --single-branch https://github.com/Cisanotheraccount/cdp-mapping-systems_Ci.git
cd cdp-mapping-systems_Ci/student-projects/Final_Ci_Song_NYC_Time_Field
npm ci
npm run dev
```

When the development server starts, open `http://127.0.0.1:3000` (or use the
exact local URL printed in the terminal if that port is already occupied).

### Option B: download a ZIP from GitHub

1. Open the [`ci/nyc-time-field` branch on GitHub](https://github.com/Cisanotheraccount/cdp-mapping-systems_Ci/tree/ci/nyc-time-field).
2. Select **Code → Download ZIP**, then unzip the downloaded file.
3. In Terminal, change into the extracted
   `student-projects/Final_Ci_Song_NYC_Time_Field` folder.
4. Install the locked dependencies and start the viewer:

```bash
npm ci
npm run dev
```

For an optional production-mode preview instead of the development server:

```bash
npm run build
npm run start
```

## What it does

- Place or drag a destination anywhere in NYC.
- Set a 15–90 minute commute budget.
- Compare weekday peak, weekday midday, and combined weekend schedules.
- Switch between subway, free-flow driving, and walking time maps.
- Independently set bar height to time remaining or a housing-unit-weighted
  allocation of 2020–2024 ACS median gross rent.
- Download the 5,543-row H3 rent table used by the map; every distinct rent
  value receives a distinct ranked display height.
- Rank Neighborhood Tabulation Areas by the share of residential units that
  fall inside the time budget.
- Inspect a residential H3 cell to see the reconstructed route and separate
  walk, expected wait, ride, transfer, and exit-walk time.
- Search NYC neighborhoods or addresses and share the exact map state by URL.

## Data and method

The offline Python pipeline uses MTA Static GTFS, MTA subway entrances and
exits, NYC Planning 2020 NTAs and 2024 ACS housing profiles, H3 resolution 9,
and MapPLUTO residential units.
The published walking snapshot uses OSMnx pedestrian shortest paths between H3
connectors and actual MTA entry/exit points. The GTFS graphs use explicit
minimum transfer times where supplied and preserve route/state paths so the
browser can explain each result. The driving snapshot uses a directed OSMnx
road graph with posted and fallback free-flow speeds.

The site is an accessibility study, not a live journey planner or listing
service. It does not model transit delays, road traffic, parking, crowding,
elevator outages, temporary service changes, buses, or ferries. ACS gross rent
includes utilities and is not live asking rent.

The interface uses a self-hosted MapLibre renderer and project-owned GeoJSON,
so it does not fail when a commercial basemap token is absent. Address search
uses the OpenStreetMap Nominatim search endpoint; neighborhood lookup is local.

## Optional: rebuild data and run full validation

The two viewing methods above use the committed, browser-ready files and do not
need Python. Only use this section if you want to regenerate the datasets or run
the complete validation suite. This workflow additionally requires the Mapping
Systems `cdp` Python/conda environment:

```bash
conda activate cdp
npm ci
npm run data:build
npm run data:validate
npm test
npm run test:e2e
```

The notebook at `notebooks/final_project_analysis.ipynb` provides a reader-facing
audit of the generated assets and model assumptions. The system diagram, data
dictionary, limitations, and final reflection are in `methodology/` and are
downloadable from the site.

`npm run build:pages` creates a static `dist/pages` artifact. The deployment
workflow and hosting-instance configuration are intentionally omitted from
this nested course-repository copy; the verified public release remains at the
live-site link above.

## Course repository copy

This folder is the clean course-repository submission snapshot. It contains the
tracked application source, browser-ready data, methodology, notebook, tests,
and submission image. Local dependencies, raw data caches, temporary build
outputs, Playwright reports, and hosting-instance files are excluded so the
submission remains reproducible and safe to review.
