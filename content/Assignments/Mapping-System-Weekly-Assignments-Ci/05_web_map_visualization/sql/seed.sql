-- Generated from data/manhattan_rent_growth_points.csv.
-- Run after setup.sql. Re-running updates the frozen 2016-07 to 2026-06 snapshot.

insert into public.rent_growth_points (
    area_id, area_name, borough, longitude, latitude,
    baseline_month, latest_month, baseline_rent_usd, latest_rent_usd,
    rent_change_usd, growth_pct, geometry
)
values
('battery_park_city', 'Battery Park City', 'Manhattan', -74.0163000, 40.7113000, '2016-07', '2026-06', 4750, 5758, 1008, 21.2, gis.st_setsrid(gis.st_makepoint(-74.0163000, 40.7113000), 4326)::gis.geography),
('central_harlem', 'Central Harlem', 'Manhattan', -73.9442000, 40.8116000, '2016-07', '2026-06', 2500, 3600, 1100, 44.0, gis.st_setsrid(gis.st_makepoint(-73.9442000, 40.8116000), 4326)::gis.geography),
('central_park_south', 'Central Park South', 'Manhattan', -73.9797000, 40.7669000, '2016-07', '2026-06', 7400, 12500, 5100, 68.9, gis.st_setsrid(gis.st_makepoint(-73.9797000, 40.7669000), 4326)::gis.geography),
('chelsea', 'Chelsea', 'Manhattan', -74.0014000, 40.7465000, '2016-07', '2026-06', 4200, 6131, 1931, 46.0, gis.st_setsrid(gis.st_makepoint(-74.0014000, 40.7465000), 4326)::gis.geography),
('chinatown', 'Chinatown', 'Manhattan', -73.9968000, 40.7158000, '2016-07', '2026-06', 2800, 4380, 1580, 56.4, gis.st_setsrid(gis.st_makepoint(-73.9968000, 40.7158000), 4326)::gis.geography),
('east_harlem', 'East Harlem', 'Manhattan', -73.9419000, 40.7957000, '2016-07', '2026-06', 2450, 3250, 800, 32.7, gis.st_setsrid(gis.st_makepoint(-73.9419000, 40.7957000), 4326)::gis.geography),
('east_village', 'East Village', 'Manhattan', -73.9840000, 40.7265000, '2016-07', '2026-06', 3300, 5250, 1950, 59.1, gis.st_setsrid(gis.st_makepoint(-73.9840000, 40.7265000), 4326)::gis.geography),
('financial_district', 'Financial District', 'Manhattan', -74.0100000, 40.7075000, '2016-07', '2026-06', 3695, 4925, 1230, 33.3, gis.st_setsrid(gis.st_makepoint(-74.0100000, 40.7075000), 4326)::gis.geography),
('flatiron', 'Flatiron', 'Manhattan', -73.9903000, 40.7411000, '2016-07', '2026-06', 5000, 6593, 1593, 31.9, gis.st_setsrid(gis.st_makepoint(-73.9903000, 40.7411000), 4326)::gis.geography),
('gramercy_park', 'Gramercy Park', 'Manhattan', -73.9851000, 40.7379000, '2016-07', '2026-06', 3600, 5350, 1750, 48.6, gis.st_setsrid(gis.st_makepoint(-73.9851000, 40.7379000), 4326)::gis.geography),
('greenwich_village', 'Greenwich Village', 'Manhattan', -73.9973000, 40.7336000, '2016-07', '2026-06', 3900, 5850, 1950, 50.0, gis.st_setsrid(gis.st_makepoint(-73.9973000, 40.7336000), 4326)::gis.geography),
('hamilton_heights', 'Hamilton Heights', 'Manhattan', -73.9496000, 40.8262000, '2016-07', '2026-06', 2300, 3250, 950, 41.3, gis.st_setsrid(gis.st_makepoint(-73.9496000, 40.8262000), 4326)::gis.geography),
('inwood', 'Inwood', 'Manhattan', -73.9217000, 40.8677000, '2016-07', '2026-06', 1875, 2795, 920, 49.1, gis.st_setsrid(gis.st_makepoint(-73.9217000, 40.8677000), 4326)::gis.geography),
('little_italy', 'Little Italy', 'Manhattan', -73.9975000, 40.7191000, '2016-07', '2026-06', 3500, 5250, 1750, 50.0, gis.st_setsrid(gis.st_makepoint(-73.9975000, 40.7191000), 4326)::gis.geography),
('lower_east_side', 'Lower East Side', 'Manhattan', -73.9897000, 40.7184000, '2016-07', '2026-06', 3391, 5100, 1709, 50.4, gis.st_setsrid(gis.st_makepoint(-73.9897000, 40.7184000), 4326)::gis.geography),
('marble_hill', 'Marble Hill', 'Manhattan', -73.9106000, 40.8763000, '2016-07', '2026-06', 1660, 3275, 1615, 97.3, gis.st_setsrid(gis.st_makepoint(-73.9106000, 40.8763000), 4326)::gis.geography),
('midtown', 'Midtown', 'Manhattan', -73.9845000, 40.7549000, '2016-07', '2026-06', 4200, 5765, 1565, 37.3, gis.st_setsrid(gis.st_makepoint(-73.9845000, 40.7549000), 4326)::gis.geography),
('midtown_east', 'Midtown East', 'Manhattan', -73.9712000, 40.7540000, '2016-07', '2026-06', 3400, 5095, 1695, 49.9, gis.st_setsrid(gis.st_makepoint(-73.9712000, 40.7540000), 4326)::gis.geography),
('midtown_south', 'Midtown South', 'Manhattan', -73.9850000, 40.7490000, '2016-07', '2026-06', 3930, 5450, 1520, 38.7, gis.st_setsrid(gis.st_makepoint(-73.9850000, 40.7490000), 4326)::gis.geography),
('midtown_west', 'Midtown West', 'Manhattan', -73.9922000, 40.7610000, '2016-07', '2026-06', 3433, 4930, 1497, 43.6, gis.st_setsrid(gis.st_makepoint(-73.9922000, 40.7610000), 4326)::gis.geography),
('morningside_heights', 'Morningside Heights', 'Manhattan', -73.9626000, 40.8075000, '2016-07', '2026-06', 3400, 4800, 1400, 41.2, gis.st_setsrid(gis.st_makepoint(-73.9626000, 40.8075000), 4326)::gis.geography),
('nolita', 'Nolita', 'Manhattan', -73.9952000, 40.7223000, '2016-07', '2026-06', 3695, 5495, 1800, 48.7, gis.st_setsrid(gis.st_makepoint(-73.9952000, 40.7223000), 4326)::gis.geography),
('roosevelt_island', 'Roosevelt Island', 'Manhattan', -73.9496000, 40.7617000, '2016-07', '2026-06', 3390, 4550, 1160, 34.2, gis.st_setsrid(gis.st_makepoint(-73.9496000, 40.7617000), 4326)::gis.geography),
('soho', 'Soho', 'Manhattan', -74.0016000, 40.7240000, '2016-07', '2026-06', 5000, 6250, 1250, 25.0, gis.st_setsrid(gis.st_makepoint(-74.0016000, 40.7240000), 4326)::gis.geography),
('stuyvesant_town_pcv', 'Stuyvesant Town/PCV', 'Manhattan', -73.9766000, 40.7317000, '2016-07', '2026-06', 4480, 6799, 2319, 51.8, gis.st_setsrid(gis.st_makepoint(-73.9766000, 40.7317000), 4326)::gis.geography),
('tribeca', 'Tribeca', 'Manhattan', -74.0086000, 40.7163000, '2016-07', '2026-06', 8700, 8750, 50, 0.6, gis.st_setsrid(gis.st_makepoint(-74.0086000, 40.7163000), 4326)::gis.geography),
('upper_east_side', 'Upper East Side', 'Manhattan', -73.9560000, 40.7736000, '2016-07', '2026-06', 2995, 4425, 1430, 47.7, gis.st_setsrid(gis.st_makepoint(-73.9560000, 40.7736000), 4326)::gis.geography),
('upper_west_side', 'Upper West Side', 'Manhattan', -73.9762000, 40.7870000, '2016-07', '2026-06', 3500, 4800, 1300, 37.1, gis.st_setsrid(gis.st_makepoint(-73.9762000, 40.7870000), 4326)::gis.geography),
('washington_heights', 'Washington Heights', 'Manhattan', -73.9389000, 40.8420000, '2016-07', '2026-06', 2195, 3000, 805, 36.7, gis.st_setsrid(gis.st_makepoint(-73.9389000, 40.8420000), 4326)::gis.geography),
('west_harlem', 'West Harlem', 'Manhattan', -73.9520000, 40.8216000, '2016-07', '2026-06', 2800, 3800, 1000, 35.7, gis.st_setsrid(gis.st_makepoint(-73.9520000, 40.8216000), 4326)::gis.geography),
('west_village', 'West Village', 'Manhattan', -74.0059000, 40.7358000, '2016-07', '2026-06', 3995, 6300, 2305, 57.7, gis.st_setsrid(gis.st_makepoint(-74.0059000, 40.7358000), 4326)::gis.geography)
on conflict (area_id) do update set
    area_name = excluded.area_name,
    longitude = excluded.longitude,
    latitude = excluded.latitude,
    baseline_rent_usd = excluded.baseline_rent_usd,
    latest_rent_usd = excluded.latest_rent_usd,
    rent_change_usd = excluded.rent_change_usd,
    growth_pct = excluded.growth_pct,
    geometry = excluded.geometry;
