# Assignment 2

## Short introduction.

resolved_places.json is the result of utilizing convert_google_places to convert data.csv, containing a list of linked Google Places that I have saved, into a JSON format.

The script looks up coordinates using the public OpenStreetMap Nominatim service. It runs one request at a time, waits at least one second between requests, and caches responses in `nominatim_cache.json` so repeat runs do not send duplicate queries. Run it with:

```sh
python3 convert_google_places.py
```

You may optionally identify yourself to the service with `NOMINATIM_EMAIL` and override the descriptive user agent with `NOMINATIM_USER_AGENT`.

Geocoding data: © OpenStreetMap contributors, available under the Open Database License. See https://www.openstreetmap.org/copyright.

## Proposed data set

I think it would be interested to generate/append the time that it takes to get to these places. This would need to be calculated by accessing the Google Routes API or via OSMnx (assuming that we're driving) That in itself would be interesting to compare to another person’s version of this dataset (Google Saved Places). What is our travel radius in terms of commute time in NYC- do people tend to stay within a given time of travel (e.g. 45 mins)

Google Routes API: https://developers.google.com/maps/documentation/routes
