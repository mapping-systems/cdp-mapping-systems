# Geolocate HAR file IPs
This script extracts IP addresses from a HAR file, geolocates them using the ipinfo.io API,
and visualizes their locations on a map using Folium.

# Usage:
- Ensure you have the required libraries installed. 
- Download a HAR file from your browser and update the `HAR_FILE` variable.
- Run the script from a terminal or command prompt: `python scrape_har_locations.py`
- The output map will be saved to `outputs/ip_map.html` and the geolocated data to `outputs/ip_locations.geojson`.