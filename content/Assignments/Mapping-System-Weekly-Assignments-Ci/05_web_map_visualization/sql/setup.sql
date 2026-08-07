-- Mapping Systems Assignment 05: rent-growth point API
-- Run in the Supabase SQL Editor before seed.sql.

create schema if not exists gis;
create extension if not exists postgis with schema gis;

grant usage on schema gis to anon, authenticated;

create table if not exists public.rent_growth_points (
    area_id text primary key,
    area_name text not null,
    borough text not null check (borough = 'Manhattan'),
    longitude double precision not null check (longitude between -180 and 180),
    latitude double precision not null check (latitude between -90 and 90),
    baseline_month text not null,
    latest_month text not null,
    baseline_rent_usd integer not null check (baseline_rent_usd > 0),
    latest_rent_usd integer not null check (latest_rent_usd > 0),
    rent_change_usd integer not null,
    growth_pct double precision not null,
    geometry gis.geography(Point, 4326) not null
);

create index if not exists rent_growth_points_geometry_idx
on public.rent_growth_points using gist (geometry);

alter table public.rent_growth_points enable row level security;

drop policy if exists "public read rent growth points" on public.rent_growth_points;
create policy "public read rent growth points"
on public.rent_growth_points
for select
to anon, authenticated
using (true);

revoke insert, update, delete on public.rent_growth_points from anon, authenticated;
grant select on public.rent_growth_points to anon, authenticated;

create or replace function public.find_rent_areas_within_radius(
    lat double precision,
    lon double precision,
    radius_m integer default 3000
)
returns table (
    area_id text,
    area_name text,
    baseline_rent_usd integer,
    latest_rent_usd integer,
    rent_change_usd integer,
    growth_pct double precision,
    longitude double precision,
    latitude double precision,
    distance_m double precision
)
set search_path = ''
language sql
stable
security invoker
as $$
    select
        p.area_id,
        p.area_name,
        p.baseline_rent_usd,
        p.latest_rent_usd,
        p.rent_change_usd,
        p.growth_pct,
        p.longitude,
        p.latitude,
        gis.st_distance(
            p.geometry,
            gis.st_setsrid(gis.st_makepoint(lon, lat), 4326)::gis.geography
        ) as distance_m
    from public.rent_growth_points as p
    where radius_m between 100 and 20000
      and gis.st_dwithin(
          p.geometry,
          gis.st_setsrid(gis.st_makepoint(lon, lat), 4326)::gis.geography,
          radius_m
      )
    order by p.geometry operator(gis.<->)
        gis.st_setsrid(gis.st_makepoint(lon, lat), 4326)::gis.geography;
$$;

revoke execute on function public.find_rent_areas_within_radius(
    double precision, double precision, integer
) from public;

grant execute on function public.find_rent_areas_within_radius(
    double precision, double precision, integer
) to anon, authenticated;
