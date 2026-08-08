# Meredith Cui - Mapping Systems Submission

This submission contains four weekly assignments and a final project developed
from the Networks exercise.

## Assignment 1 - Loading and Visualizing Data

[`01_harbor_water_quality.ipynb`](./01_harbor_water_quality.ipynb) explores NYC
Harbor water-quality sampling data. The executed notebook documents the source
metadata, inspects dissolved oxygen and fecal coliform attributes, and includes
map and non-map visualizations with interpretation and limits.

## Assignment 2 - Geoprocessing

- [`02_columbia_hudson_routine.geojson`](./02_columbia_hudson_routine.geojson)
  records a personal course-day mental map as six point features.
- [`02_columbia_hudson_routine.md`](./02_columbia_hudson_routine.md) proposes a
  spatial relationship to NYC's Future Floodplain 2050s dataset and documents a
  buffer, intersection, overlap, and distance workflow.
- [`images/02_columbia_hudson_workflow.png`](./images/02_columbia_hudson_workflow.png)
  is the required workflow diagram.

## Assignment 3 - Networks

[`03_columbia_hudson_networks.ipynb`](./03_columbia_hudson_networks.ipynb)
defines a pedestrian network for places visited around Columbia and the Hudson,
compares Euclidean and shortest-path distance, and reflects on the experiential
difference. The executed notebook contains maps, charts, route metrics, and a
reusable GraphML snapshot in [`data/`](./data/).

## Assignment 4 - Web Mapping

[`04_meredith_web_mapping/`](./04_meredith_web_mapping/) contains a
privacy-reviewed HAR capture of the Mapping Systems website, a Python workflow
that geolocates public server IPs, the generated GeoJSON and Folium map, and a
custom MapLibre map with the required screenshot. Its README explains how to
launch the site and why CDN/IP geography must be interpreted cautiously.

## Final Project - After Six NYC

[`Final_After_Six_NYC/`](./Final_After_Six_NYC/) expands the Networks assignment
into a public cultural-access planner. It combines 161 screened public cultural
places, opening schedules, admission information, current programs, and a
schedule-weighted subway graph. The folder includes the executed analytical
notebook, data and source scripts, ten figures, the complete static website,
and the final six-slide deck.

**Live website:** <https://mere0125.github.io/after-six-nyc/>

The planner is a research prototype based on a typical weekday transit model,
not a live MTA or ticketing service. The project README documents its sources,
assumptions, and limits.
