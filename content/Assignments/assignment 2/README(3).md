# The Emotional Cost of the Walk to Studio

**Yizhang Mu · Columbia GSAPP CDP**

## Submission contents

- `data/daily_mental_map_amsterdam_to_gsapp.geojson`
- `data/data_dictionary.csv`
- `diagram/relationship_workflow.svg`
- `diagram/relationship_workflow.png`
- `METHODOLOGY.md`

## Project premise

My daily experience of New York is not organized primarily by landmarks. It is organized by repeated transitions:

**home → commuting corridor → academic pressure → temporary relief → home**

The submitted GeoJSON represents a typical weekday beginning and ending at **1440 Amsterdam Avenue** and moving through Amsterdam Avenue, Columbia’s campus, Avery Hall, a coffee stop, and Riverside Park.

The dataset combines three spatial forms:

- **Points** record specific stops and observations.
- **Lines** record the full route and individual experiential segments.
- **Polygons** record subjective mental zones rather than administrative boundaries.

The attributes describe time, duration, noise, stress, comfort, emotion, crowding, greenery, safety, social contact, spending, and phone use.

## Related dataset

### NYC 311 Service Requests from 2020 to Present

Official source:

https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2020-to-Present/erm2-nwe9

The NYC dataset contains individual service requests with complaint type, timestamps, responding agency, and geographic location. For this project, I propose filtering it to **noise-related complaints** within the area surrounding my route.

## Research question

> Where does my personal experience of noise and stress agree with, diverge from, or remain invisible within the collective record of NYC 311 noise complaints?

## Why this relationship matters

The datasets describe different kinds of urban knowledge.

My GeoJSON is:

- small,
- embodied,
- time-specific,
- subjective,
- and intentionally narrative.

NYC 311 data is:

- large,
- collectively produced,
- institutionally categorized,
- geolocated,
- and shaped by uneven reporting behavior.

The analysis therefore does not ask which dataset is “correct.” It asks what becomes visible when an individual mental map is compared with a public complaint system.

See `METHODOLOGY.md` for the full workflow, proposed calculations, outputs, and limitations.
