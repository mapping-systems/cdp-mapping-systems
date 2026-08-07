# NYC Open Restaurant Seating Explorer

This web map queries the `open-restaurant-inspections` table in Supabase whenever a user clicks the map. It returns inspection observations within a 1,000-meter radius and displays them with data-driven styling.

## Visual encoding

- **Color** represents `SeatingChoice`:
  - Blue = sidewalk
  - Orange = roadway
  - Purple = both
  - Gray = other or unknown
- **Point size** represents `dist_meters` from the selected map location:
  - Larger points are closer
  - Smaller points are farther away
- A dashed circle shows the 1,000-meter query radius.
- Clicking a restaurant observation opens a popup with its restaurant name, seating type, distance, and inspection ID.

## Run locally

Open the folder in VS Code, right-click `index.html`, and select **Open with Live Server**.

## Submission description

I chose `SeatingChoice` as the categorical variable. Point color distinguishes sidewalk, roadway, and combined seating, while point size represents each inspection observation's distance from the user's selected map location. Larger points are closer and smaller points are farther away. This pairing makes it possible to compare seating configuration and spatial proximity at the same time. A popup provides the restaurant name, seating type, exact distance, and observation ID. Because restaurants can be inspected more than once, multiple observations may overlap at the same location.
