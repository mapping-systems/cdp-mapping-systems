# Design Resources NYC

**Live map:** https://nicoleluu.github.io/design-resources-nyc/

**Project source:** https://github.com/Nicoleluu/design-resources-nyc

Design Resources NYC is an interactive inventory and neighborhood-level analysis of places where design can be learned, experienced, made, and connected with across New York City. New York is used as the first case study because its unusually visible concentration of design institutions provides a baseline for later comparison with cities and regions where design resources may be less available.

## Project goal

The project asks: **How are documented design-related resources distributed across New York City?**

The map has two linked views:

- **Resources** displays individual locations organized as Learn, Experience, Make, and Connect.
- **Neighborhoods** aggregates the locations into NYC Neighborhood Tabulation Areas and visualizes their concentration.

The purpose is not to rank neighborhoods or claim that a larger number automatically means better access. Instead, the map makes the documented concentration and unevenness of resources visible while establishing a method that can later support comparison with other places.

## Relationship to course assignments

This final expands three course workflows:

1. **01 — Loading and Visualizing Data:** loading, examining, categorizing, and communicating spatial data while identifying its limitations.
2. **02 — Geoprocessing:** assigning resource points to neighborhood polygons with a spatial join, then calculating neighborhood totals and category-specific counts.
3. **05 — Web Map Visualization:** building a MapLibre web map with data-driven colors, sizes, filters, popups, legends, and linked analytical views.

Assignment 05 is the primary foundation. The project moves beyond displaying one variable by allowing viewers to switch between individual resources and an aggregated neighborhood analysis.

## Categories

| Category | Included resource types |
| --- | --- |
| Learn | Design schools, programs, libraries, and educational resources |
| Experience | Museums, galleries, archives, and cultural institutions |
| Make | Makerspaces, fabrication labs, workshops, and shared facilities |
| Connect | Design organizations, communities, and recurring programs |

## Data and methodology

Resource candidates were assembled from NYC Open Data, the NYC Department of Cultural Affairs, and OpenStreetMap. NYC Neighborhood Tabulation Area boundaries came from the NYC Department of City Planning.

The Python workflow in `scripts/process_data.py`:

1. loads the source records;
2. normalizes names and removes duplicate candidates;
3. applies documented inclusion and category rules;
4. tests each resource point against neighborhood polygons;
5. calculates total and category counts for every neighborhood;
6. exports the map-ready GeoJSON and summary data used by the website.

The browser loads the processed files directly and uses MapLibre GL JS for rendering and interaction. The workflow is summarized in `project-diagram.svg`.

## Interpretation and limitations

The map represents **documented locations**, not a complete census of design opportunity. Counts are affected by the coverage, tagging practices, and definitions used by the source datasets. The four categories are interpretive and some resources could reasonably belong to more than one.

Neighborhood totals do not measure:

- affordability or admission cost;
- public eligibility;
- opening hours or current operating status;
- program capacity or quality;
- travel time and transit access;
- informal resources that are absent from official or volunteered datasets.

For these reasons, the neighborhood layer should be read as an exploratory measure of geographic concentration, not a definitive accessibility score.

## Future development

The next phase would apply the same collection, categorization, and visualization system to additional cities—initially Taipei and one other comparable city. A consistent cross-city definition would make it possible to compare how many resources are documented, what types are represented, and how concentrated they are.

Accessibility could then be examined more directly through walking or transit-time isochrones, opening hours, cost, eligibility, and population-normalized measures. This would connect the inventory to the broader capstone question of how geographic differences in access to design resources shape opportunities to learn and practice design.

## Run the map

Because the project loads local GeoJSON files, serve the folder through a local web server rather than double-clicking `index.html`.

From this folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Folder contents

```text
Final_Nicole_Lu_Design_Resources_NYC/
├── README.md
├── project-diagram.svg
├── screenshot.png
├── index.html
├── css/style.css
├── js/map.js
├── data/processed/
├── documentation/
└── scripts/process_data.py
```

Detailed source attribution and selection criteria are in `documentation/`.
