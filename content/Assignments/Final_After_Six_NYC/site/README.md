# After Six NYC

After Six NYC is an interactive cultural-access planner for New York City. It
compares geographic proximity with the time, price, opening schedule, transit
route, and personal preferences that shape whether a cultural place is truly
reachable after the day ends.

## Public Features

- 161 screened museums, galleries, cinemas, performance venues, cultural
  centers, and community arts spaces across all five boroughs
- Route and estimated arrival information for every place
- Arrival-time opening and cinema-screening filters
- 16 date-checked current programs with official links and image credits
- Device-local profiles and saved places
- Separate website and trip sharing so profile information stays private

## Run Locally

Serve this directory with any static web server. For example:

```bash
python3 -m http.server 8765
```

Then open `http://127.0.0.1:8765/`.

## Data Note

The planner is a research prototype, not a live trip or ticketing service.
Opening hours, admission, programs, and modeled routes should be confirmed with
the linked official sources before visiting.
