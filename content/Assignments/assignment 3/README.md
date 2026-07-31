# Geolocate HAR file IPs
This script extracts IP addresses from a HAR file, geolocates them using the ipinfo.io API,
and visualizes their locations on a map using Folium.

# Usage:
- Ensure you have the required libraries installed. 
- Download a HAR file from your browser and update the `HAR_FILE` variable.
- Run the script from a terminal or command prompt: `python scrape_har_locations.py`
- The output map will be saved to `outputs/ip_map.html` and the geolocated data to `outputs/ip_locations.geojson`.
## Web map

The optimized MapLibre web map is composed of:

- `index.html` — page structure and explanatory sidebar
- `main.js` — loads `outputs/ip_locations.geojson`, clusters points, fits the map to the data, and adds popups
- `style.css` — responsive visual design

Open `index.html` with the VS Code **Live Server** extension. Opening it directly as a `file://` URL may prevent the browser from loading the local GeoJSON file.
