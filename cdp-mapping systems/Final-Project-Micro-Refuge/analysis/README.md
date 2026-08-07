# Micro-Refuge Around Bryant Park — 15-Minute DOT Seating Version

## Research question

If I only have about fifteen minutes around Bryant Park and want a relatively screened place for a short pause, how should I choose where to go?

The project treats a **micro-refuge** as a public, short-duration pause location that may offer some potential visual buffering. It does not claim to measure privacy, safety, comfort, quietness, or literal visibility.

## Updated logic

1. Use a 15-minute everyday pause need as the project’s real-world starting point.
2. Translate 15 minutes into a **1,200 m preparation radius** around Bryant Park using 80 m/min as a simple walking assumption.
3. Sample streets every 10 m.
4. Measure distance from each sample to the nearest street tree and building edge.
5. Classify samples into four visual conditions: Exposed Edge, Screened Edge, Vegetated Buffer, Open Field.
6. Merge consecutive conditions into local visual zones.
7. Use **NYC DOT Seating Locations only** as real pause destinations. Keep benches and leaning bars; POPS are removed.
8. Attach each DOT pause asset to its nearest environmental sample.
9. In the web phase, replace the 1,200 m radial approximation with actual 5 / 10 / 15-minute pedestrian-network reachability from the user's location.

## Why the 1,200 m circle is not the final walkshed

The radius is only used to build a candidate pool and environmental dataset. A real 15-minute trip depends on the pedestrian network, crossings, blocks, and the user's exact starting location. The final web tool will calculate that network reachability dynamically.

## Current DOT candidate pool

The included NYC DOT dataset yields **47 public pause assets** within 1,200 m of the Bryant Park reference point: **34 benches and 13 leaning bars**.

## Files

- `bryant_park_micro_refuge_final.ipynb` — revised analytical notebook
- `data/nyc_dot_seating_locations_2026-06-05.csv` — active DOT pause dataset
- `outputs/dot_pause_candidates_approx_15min.geojson` — precomputed DOT candidate pool
- `outputs/dot_pause_candidates_approx_15min.csv` — same candidate pool as table
- `outputs/dot_pause_candidate_pool_15min.png` — candidate-pool overview
- `archive_v3_core_area/` — previous smaller-area environmental inputs and outputs, retained only for reference

## First run

The revised notebook uses new `streets_15min.geojson`, `trees_15min.geojson`, and `buildings_15min.geojson` cache names. On first run, it downloads the expanded NYC Open Data subsets and then stores them locally. Internet access is therefore required once.


## Visual system (v9)

The notebook and web prototype now share one visual language:

- white map background
- black / neutral gray urban geometry
- Screened Edge — deep green `#1F5A43`
- Vegetated Buffer — light green `#86B978`
- Open Field — yellow `#E2C84A`
- Exposed Edge — blue `#2F6FB0`
- blue `#2F6FB0` reserved for analysis boundaries, sampling-method markers, and interaction states

The previous teal/coral and dark presentation maps were removed from the active notebook. Old notebook outputs were cleared so rerunning in VS Code regenerates every figure in the new white-map palette.
