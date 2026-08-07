# Assignment 03 — Web mapping a POPS website HAR

## Research statement

The *Public by Requirement* POPS project appears as one webpage, but it depends on a distributed network of hosting, library, and basemap services. This assignment maps the approximate server locations observed while a fresh browser session loaded the public project and navigated to its interactive map.

## Process

1. Reviewed the instructor-provided `geolocate-har-file` workflow.
2. Captured a HAR from a fresh headless Chrome context while loading the public POPS website.
3. Navigated to the project’s interactive-map slide and allowed its mapping requests to complete.
4. Sanitized the archive by removing headers, cookies, submitted data, and response bodies.
5. Extracted public `serverIPAddress` values and requested hostnames.
6. Geolocated the four observed IPs with the same `ipinfo.io` service used by the instructor workflow.
7. Aggregated requests by server IP and saved the result as GeoJSON.
8. Loaded the static GeoJSON into MapLibre GL JS and styled points by service and request volume.

## Files

- `index.html` — page structure
- `style.css` — layout and visual design
- `main.js` — MapLibre map, GeoJSON loading, popups, and interaction
- `pops_request_locations.geojson` — submitted geolocated server data
- `pops-site-sanitized.har` — sanitized source archive
- `web-map-screenshot.png` — required screenshot

## Run locally

From this folder:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

The map uses MapLibre GL JS and a CARTO basemap from CDNs, so internet access is required for those resources. The submitted GeoJSON is local and static.

## Repository folder

<https://github.com/krishna-397/Krishna-s-MAPPING-SYSTEMS-COPY/tree/pops-assignments-1-4/content/Assignments/03_pops_har_web_map>

## Interpretation and limitation

The map describes the geography of web infrastructure encountered during one POPS-project capture. It does **not** locate plazas, users, or necessarily the origin of the content. IP geolocation is approximate and often represents a CDN edge, cloud region, or registered network location. Results may change between visits as services route requests dynamically.
