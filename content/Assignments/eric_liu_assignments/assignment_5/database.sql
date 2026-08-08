-- Add a geography column.
ALTER TABLE public."open-restaurant-inspections"
ADD COLUMN geometry gis.geography(POINT, 4326);

-- Populate it only when both coordinate strings are valid numbers.
UPDATE public."open-restaurant-inspections"
SET geometry = gis.ST_SetSRID(
    gis.st_makepoint(
        "Longitude"::double precision,
        "Latitude"::double precision),
    4326
)
WHERE "Longitude" ~ '^[+-]?[0-9]+(\.[0-9]+)?$'
  AND "Latitude" ~ '^[+-]?[0-9]+(\.[0-9]+)?$';

-- Create the spatial index.
CREATE INDEX open_restaurant_inspections_geometry_idx
ON public."open-restaurant-inspections"
USING gist (geometry);

-- Allow API roles to use the PostGIS schema.
GRANT USAGE ON SCHEMA gis TO anon, authenticated;

-- Return only the latest inspection for each restaurant/address pair within n meters.
CREATE OR REPLACE FUNCTION find_nearest_n_restaurants(
    lat double precision,
    lon double precision,
    n integer
)
RETURNS TABLE (
    restaurant_inspection_id public."open-restaurant-inspections"."RestaurantInspectionID"%TYPE,
    restaurant_name public."open-restaurant-inspections"."RestaurantName"%TYPE,
    business_address public."open-restaurant-inspections"."BusinessAddress"%TYPE,
    seating_choice public."open-restaurant-inspections"."SeatingChoice"%TYPE,
    inspected_on public."open-restaurant-inspections"."InspectedOn"%TYPE,
    lat double precision,
    long double precision,
    dist_meters double precision
)
SET search_path = ''
LANGUAGE sql AS $$
    WITH nearby AS (
        SELECT
            inspections."RestaurantInspectionID" AS restaurant_inspection_id,
            inspections."RestaurantName" AS restaurant_name,
            inspections."BusinessAddress" AS business_address,
            inspections."SeatingChoice" AS seating_choice,
            inspections."InspectedOn" AS inspected_on,
            gis.st_y(inspections.geometry::gis.geometry) AS lat,
            gis.st_x(inspections.geometry::gis.geometry) AS long,
            gis.st_distance(
                inspections.geometry,
                gis.st_point($2, $1)::gis.geography
            ) AS dist_meters,
            row_number() OVER (
                PARTITION BY
                    lower(trim(coalesce(inspections."RestaurantName", ''))),
                    lower(trim(coalesce(inspections."BusinessAddress", '')))
                ORDER BY
                    pg_catalog.to_timestamp(
                        pg_catalog.nullif(inspections."InspectedOn", ''),
                        'YYYY Mon DD HH12:MI:SS AM'
                    ) DESC NULLS LAST,
                    inspections."RestaurantInspectionID" DESC
            ) AS recency_rank
        FROM public."open-restaurant-inspections" AS inspections
        WHERE inspections.geometry IS NOT NULL
          AND gis.st_dwithin(
              inspections.geometry,
              gis.st_point($2, $1)::gis.geography,
              $3
          )
    )
    SELECT
        nearby.restaurant_inspection_id,
        nearby.restaurant_name,
        nearby.business_address,
        nearby.seating_choice,
        nearby.inspected_on,
        nearby.lat,
        nearby.long,
        nearby.dist_meters
    FROM nearby
    WHERE nearby.recency_rank = 1
    ORDER BY nearby.dist_meters;
$$;
