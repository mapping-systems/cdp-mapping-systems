from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
data = pd.read_csv(ROOT / "data" / "manhattan_rent_growth_points.csv")


def sql_text(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


rows = []
for row in data.itertuples(index=False):
    rows.append(
        "(" + ", ".join(
            [
                sql_text(row.area_id),
                sql_text(row.area_name),
                sql_text(row.borough),
                f"{row.longitude:.7f}",
                f"{row.latitude:.7f}",
                sql_text(row.baseline_month),
                sql_text(row.latest_month),
                str(int(row.baseline_rent_usd)),
                str(int(row.latest_rent_usd)),
                str(int(row.rent_change_usd)),
                f"{row.growth_pct:.1f}",
                (
                    "gis.st_setsrid(gis.st_makepoint("
                    f"{row.longitude:.7f}, {row.latitude:.7f}), 4326)::gis.geography"
                ),
            ]
        ) + ")"
    )

sql = """-- Generated from data/manhattan_rent_growth_points.csv.
-- Run after setup.sql. Re-running updates the frozen 2016-07 to 2026-06 snapshot.

insert into public.rent_growth_points (
    area_id, area_name, borough, longitude, latitude,
    baseline_month, latest_month, baseline_rent_usd, latest_rent_usd,
    rent_change_usd, growth_pct, geometry
)
values
""" + ",\n".join(rows) + """
on conflict (area_id) do update set
    area_name = excluded.area_name,
    longitude = excluded.longitude,
    latitude = excluded.latitude,
    baseline_rent_usd = excluded.baseline_rent_usd,
    latest_rent_usd = excluded.latest_rent_usd,
    rent_change_usd = excluded.rent_change_usd,
    growth_pct = excluded.growth_pct,
    geometry = excluded.geometry;
"""

(ROOT / "sql" / "seed.sql").write_text(sql)
print(f"Wrote {len(data)} rows to sql/seed.sql")
