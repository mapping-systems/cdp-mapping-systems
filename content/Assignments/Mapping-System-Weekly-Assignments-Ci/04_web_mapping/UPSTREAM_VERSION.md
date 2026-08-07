# Course repository snapshot

- Repository: <https://github.com/mapping-systems/geolocate-har-file>
- Commit: `0d599bf1b7ffc5caba6b8fce411276249f68f0c5`
- Retrieved: 2026-08-06
- Preserved files: `vendor/geolocate-har-file/scrape_har_locations.py` and `UPSTREAM_README.md`

The preserved Python file is unmodified. `scripts/geolocate_har.py` is a
documented wrapper of the same extract → geolocate → GeoJSON/Folium sequence.
It adds deterministic output, a local API cache, hashed server identifiers,
host-only properties, and explicit limitations.
