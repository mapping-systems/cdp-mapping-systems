-- =====================================================================
-- Supabase / PostGIS setup for the "open-restaurant-inspections" table
-- -----------------------------------------------------------------------
-- Run each numbered block, in order, in the Supabase SQL Editor.
-- Assumes:
--   1. You've already created a Supabase project and enabled the
--      PostGIS extension into a schema named `gis`
--      (Database > Extensions > postgis).
--   2. You've imported the Open Restaurants Inspections CSV
--      (https://data.cityofnewyork.us/Transportation/Open-Restaurants-Inspections/4dx7-axux)
--      into a table named public."open-restaurant-inspections", with
--      "RestaurantInspectionID" set as the primary key.
--
-- Real columns in that CSV (confirmed against the live dataset) include:
--   RestaurantInspectionID, RestaurantName, SeatingChoice,
--   LegalBusinessName, BusinessAddress, IsSidewayCompliant,
--   IsRoadwayCompliant, InspectedOn, Borough, Latitude, Longitude, ...
--
-- SeatingChoice is our chosen data-driven-styling variable: it's a
-- categorical (nominal) field with values "sidewalk", "roadway", and
-- "both", describing what kind of outdoor seating structure the
-- restaurant was inspected for.
-- =====================================================================


-- 1. Add a geography column and populate it from Latitude / Longitude
-- -----------------------------------------------------------------------
ALTER TABLE public."open-restaurant-inspections"
ADD COLUMN geometry gis.geography(POINT, 4326);

CREATE INDEX open_restaurant_inspections_geometry_idx
ON public."open-restaurant-inspections"
USING gist (geometry);

-- Some rows have blank/invalid coordinates — only update the ones that
-- parse cleanly as numbers.
UPDATE public."open-restaurant-inspections"
SET geometry = gis.ST_SetSRID(
    gis.st_makepoint("Longitude"::double precision, "Latitude"::double precision),
    4326
)
WHERE "Longitude" ~ '^[+-]?[0-9]+(\.[0-9]+)?$'
  AND "Latitude"  ~ '^[+-]?[0-9]+(\.[0-9]+)?$';


-- 2. Grant read access so the anon/browser client can query it
-- -----------------------------------------------------------------------
GRANT USAGE ON SCHEMA gis TO anon, authenticated;

ALTER TABLE public."open-restaurant-inspections" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access"
ON public."open-restaurant-inspections"
FOR SELECT
USING (true);


-- 3. Spatial query function used by map.js on every map click
-- -----------------------------------------------------------------------
-- Given a clicked (lat, lon) and a search radius `n` in meters, returns
-- every inspected restaurant within that radius, ordered nearest-first,
-- along with the two variables the web map visualizes:
--   - seating_choice                (categorical: sidewalk / roadway / both)
--   - sidewalk/roadway compliance   (used to flag non-compliant setups)
--   - dist_meters                   (continuous: distance from the click)
CREATE OR REPLACE FUNCTION find_nearest_n_restaurants(
    lat double precision,
    lon double precision,
    n integer
)
RETURNS TABLE (
    restaurant_inspection_id public."open-restaurant-inspections"."RestaurantInspectionID"%TYPE,
    name                     public."open-restaurant-inspections"."RestaurantName"%TYPE,
    seating_choice           public."open-restaurant-inspections"."SeatingChoice"%TYPE,
    sidewalk_compliance      public."open-restaurant-inspections"."IsSidewayCompliant"%TYPE,
    roadway_compliance       public."open-restaurant-inspections"."IsRoadwayCompliant"%TYPE,
    lat                      double precision,
    long                     double precision,
    dist_meters              double precision
)
SET search_path = ''
LANGUAGE sql AS $$
    SELECT
        "RestaurantInspectionID",
        "RestaurantName",
        "SeatingChoice",
        "IsSidewayCompliant",
        "IsRoadwayCompliant",
        gis.st_y(geometry::gis.geometry) AS lat,
        gis.st_x(geometry::gis.geometry) AS long,
        gis.st_distance(geometry, gis.st_point(lon, lat)::gis.geography) AS dist_meters
    FROM public."open-restaurant-inspections"
    WHERE geometry IS NOT NULL
      AND gis.st_dwithin(geometry, gis.st_point(lon, lat)::gis.geography, n)
    ORDER BY geometry OPERATOR(gis.<->) gis.st_point(lon, lat)::gis.geography
    LIMIT 300;
$$;
