#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Installing or checking dependencies..."
python3 -m pip install -r requirements.txt

echo
echo "Running HAR geolocation..."
python3 scrape_har_locations.py

echo
echo "Opening generated map..."
open outputs/ip_map.html

echo
read -n 1 -s -r -p "Press any key to close this window..."
echo
