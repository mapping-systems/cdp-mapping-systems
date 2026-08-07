# Jennifer Zhang — Mapping Systems assignments + final project

This folder contains four assignments and the complete source files for the final project. The first three assignments examine **digital and pedestrian access around Columbia University and Morningside Heights**. The fourth follows the course's independent HAR web-mapping exercise using a selected public website. The final project, **Vanishing Network — Hailun**, is an interactive atlas of demographic change, settlement, mobility, and public-service access in Hailun, Heilongjiang.

| Assignment | Submission |
| --- | --- |
| 01 · Loading and visualizing data | [`01_loading_and_visualizing_data/01_nyc_wifi_access.ipynb`](01_loading_and_visualizing_data/01_nyc_wifi_access.ipynb) |
| 02 · Geoprocessing | [`02_geoprocessing/02_route_wifi_geoprocessing.ipynb`](02_geoprocessing/02_route_wifi_geoprocessing.ipynb), [`02_geoprocessing/daily_study_loop.geojson`](02_geoprocessing/daily_study_loop.geojson), and [`02_geoprocessing/README.md`](02_geoprocessing/README.md) |
| 03 · Networks | [`03_networks/03_morningside_walking_network.ipynb`](03_networks/03_morningside_walking_network.ipynb) |
| 04 · Web mapping | [`04_web_mapping/index.html`](04_web_mapping/index.html) |
| Final project · Vanishing Network — Hailun | [`Final_Project_Vanishing_Network/index.html`](Final_Project_Vanishing_Network/index.html) · [live website](https://jzhang2468.github.io/mapping-system-final-project/) |

The folder numbers above follow the order in which the four assignment links were provided. The course repository itself labels Networks as exercise 04 and Web Mapping as exercise 03.

## Reproduce

The committed notebooks are already executed and include their outputs. To rebuild them in a compatible Python environment:

```bash
pip install -r requirements.txt
python build_notebooks.py
python 02_geoprocessing/analyze_route.py
jupyter nbconvert --to notebook --execute --inplace 01_loading_and_visualizing_data/01_nyc_wifi_access.ipynb
jupyter nbconvert --to notebook --execute --inplace 02_geoprocessing/02_route_wifi_geoprocessing.ipynb
python 03_networks/execute_notebook_inprocess.py
python 04_web_mapping/scrape_har_locations.py
```

To view the web mapping assignment or final project, serve the repository root:

```bash
python -m http.server 8000
```

Then open either:

- Assignment 04: `http://localhost:8000/content/Assignments/Jennifer_Zhang_Mapping_Systems_Assignments/04_web_mapping/`
- Final project: `http://localhost:8000/content/Assignments/Jennifer_Zhang_Mapping_Systems_Assignments/Final_Project_Vanishing_Network/`

The final project is also published at <https://jzhang2468.github.io/mapping-system-final-project/>. Its copied folder includes all HTML, CSS, JavaScript, local MapLibre assets, and data files needed to launch it from this submission.

## Privacy and scope

The geoprocessing route is a deliberately generalized, student-centered study loop using public places. It is not exported location history and does not disclose a home address. The HAR capture uses only a public project page; cookies, query strings, headers, request bodies, and response bodies were removed before committing. The raw browser archive is excluded from Git.

## Data sources

- NYC Open Data, [NYC Wi-Fi Hotspot Locations](https://data.cityofnewyork.us/d/yjub-udmw), downloaded 2026-08-07.
- OpenStreetMap contributors, [copyright and attribution](https://www.openstreetmap.org/copyright). The network notebook uses a frozen, checksum-verified OSM pedestrian graph created with OSMnx 2.1.0 and clipped to Morningside Heights.
- Jennifer Zhang, [Vanishing Network — Hailun](https://jzhang2468.github.io/mapping-system-final-project/), captured as a privacy-reviewed HAR on 2026-08-07.
- Mapping Systems, [geolocate-har-file](https://github.com/mapping-systems/geolocate-har-file), used as the method for extracting and mapping server IP locations.
