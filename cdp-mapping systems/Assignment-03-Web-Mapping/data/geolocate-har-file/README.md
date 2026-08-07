# Geolocate The Met HAR File — Fixed Version

This folder is ready to run. It contains the verified HAR captured from
`www.metmuseum.org` under the exact filename expected by the script.

## Folder structure

```text
geolocate-har-file-fixed/
├── scrape_har_locations.py
├── requirements.txt
├── run.command
├── inputs/
│   └── www.metmuseum.org.har
├── outputs/
└── cache/
```

## What was fixed

- The script verifies that the HAR actually contains requests to
  `metmuseum.org` before creating outputs.
- It ignores stale environment proxy variables such as
  `127.0.0.1:7890`.
- It removes private and invalid IP addresses.
- It aggregates requests by unique server IP.
- It records request counts and associated domains for every IP.
- It uses `ipinfo.io` first and `ipwho.is` as a fallback.
- Successful geolocation responses are cached so rerunning the script
  does not repeat every request.
- The GeoJSON stores `source_har` and `source_site`, preventing an old
  unrelated result from being mistaken for the current output.
- The generated Folium map automatically fits to the valid points and
  includes a summary panel.

## Run on macOS

### Option A — Terminal

Open this folder in VS Code, open the integrated terminal, and run:

```bash
python -m pip install -r requirements.txt
python scrape_har_locations.py
```

### Option B — Double-click

Double-click `run.command`.

If macOS blocks it, right-click the file, choose **Open**, and confirm.

## Expected output

After a successful run:

```text
outputs/
├── ip_map.html
├── ip_locations.geojson
└── run_summary.json
```

The terminal should report a nonzero value for:

```text
Successfully located:
Features written:
```

Open `outputs/ip_map.html` in a browser or with Live Server.

## Important

Do not reuse an older `ip_locations.geojson`. This folder begins with
a clean `outputs` directory and writes new outputs from the included
The Met HAR.
