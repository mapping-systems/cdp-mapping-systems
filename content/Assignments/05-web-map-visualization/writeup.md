# Web Map Visualization

## Variable visualized

This map visualizes **distance from the clicked location** to nearby Open Restaurants seating setups, calculated server-side in Supabase/PostGIS (`dist_meters`, returned by the `find_nearest_n_restaurants` function) within a 500-meter search radius.

**Note:** the assignment asks for one of the seating/compliance variables (e.g. `SeatingChoice`: Sidewalk / Roadway / Both) to be visualized alongside distance. In an earlier version of this map, `SeatingChoice` was encoded as point color. However, I was not able to find any seating data from the resturant instpection dataset, so I replaced that categorical color encoding with a distance gradient for aesthetic reasons, and the seating variable is not a main focus in here. Instead, this map provides guideline of nearest restaurant within the boundary of your selected location.

## How it's styled

- **Click point:** rendered as a single orange circle marker at the exact location clicked.

- **Search boundary:** a soft, glowing orange ring traces the true 500-meter search radius around the click point, built as a real geodesic circle polygon (not just a fixed-pixel circle), so it scales correctly with zoom.

- **Restaurant points:** rendered as small squares, one per result.
  - **Color** is a continuous gradient across three stops — Egyptian Blue (closest) → Cornflower Blue (mid-distance) → Lavender (farthest) interpolated per point based on `dist_meters` relative to the 500 m search radius.

  - **Size** is a secondary, weaker distance cue: closer points render slightly larger (16px) and farther points slightly smaller (8px).

  - **Connector lines:** a thin line is drawn from the click point to every restaurant square, reinforcing which points belong to the current query and making the spatial relationship to the click point explicit even for outlying points.

- **Popups:** clicking a restaurant square shows its name and distance in meters. Seating type is not included, since it isn't part of the current encoding.

- **Basemap:** dark mode (CARTO Dark Matter), chosen so the orange/blue point colors have strong contrast against the background.

## Rationale

Distance is a continuous, ordered variable, so a color gradient is an appropriate encoding — closer points read as visually "heavier" (darker, more saturated blue) and farther points fade toward a lighter, cooler tone, which matches how someone would intuitively scan outward from their location. Size reinforces the same variable rather than encoding something independent, which is a deliberate simplification: an earlier version relied on size/opacity alone, but the difference wasn't visually distinct enough at the small point scale used here, so color was made the primary channel and size was kept only as a mild secondary cue. The connector lines and glowing
boundary ring were added to make the search radius and its relationship to each result immediately legible, without needing a separate legend to explain "why is this point here."

**Known gap:** because the seating-choice variable was dropped in favor of this distance-only design, the map as built does not fulfill the letter of the assignment (which asks for a seating/compliance variable *and* distance). I'm flagging this explicitly rather than describing a map that doesn't match what's submitted.
