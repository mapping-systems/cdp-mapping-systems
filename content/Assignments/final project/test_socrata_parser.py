"""Offline regression test for the NY Open Data parser used by the notebook."""
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import geopandas as gpd
import pandas as pd
import requests
from shapely.geometry import shape
from shapely import wkt
import re


def require_columns(frame, columns, label):
    missing=sorted(set(columns)-set(frame.columns))
    if missing: raise KeyError(f"{label} is missing required fields: {missing}")

def _point_from_socrata(value):
    if value is None or (isinstance(value,float) and pd.isna(value)): return None
    if isinstance(value,dict):
        try:
            geom=shape(value); return geom if geom.geom_type=='Point' else None
        except Exception: return None
    if isinstance(value,str) and value.strip():
        try:
            geom=wkt.loads(value); return geom if geom.geom_type=='Point' else None
        except Exception: return None
    return None

class FakeResponse:
    def __init__(self,payload): self.payload=payload
    def raise_for_status(self): return None
    def json(self): return self.payload

payload=[
 {"county":"NEW YORK","license_number":"1","georeference":{"type":"Point","coordinates":[-73.96,40.81]}},
 {"county":"New York","license_number":"2","georeference":"POINT (-73.95 40.82)"},
 {"county":"KINGS","license_number":"3","georeference":{"type":"Point","coordinates":[-73.9,40.7]}},
]
frame=pd.DataFrame(payload); frame.columns=frame.columns.str.lower()
county_key='NEW YORK'.casefold()
frame=frame[frame['county'].str.casefold().eq(county_key)].copy()
frame['geometry']=frame['georeference'].map(_point_from_socrata)
gdf=gpd.GeoDataFrame(frame.drop(columns=['georeference']),geometry='geometry',crs='EPSG:4326')
assert len(gdf)==2
assert gdf.geometry.notna().all()
assert set(gdf.license_number)=={'1','2'}
print('PASS: Socrata county normalization and point parsing')
