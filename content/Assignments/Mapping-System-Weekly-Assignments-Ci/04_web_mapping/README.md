# Assignment 03 — Web Mapping: Behind the Rent Map

## Research question

What network geography becomes visible when a public NYC housing-data story is
loaded in a browser, and how can that infrastructure view remain connected to
the project's ten-year asking-rent investigation?

This assignment follows the course HAR workflow: capture browser requests in an
isolated session, remove sensitive request data, extract public server IPs,
geolocate them approximately, and load the resulting GeoJSON into MapLibre. A
second map state places the same project beside five-borough asking-rent change
from July 2016 to June 2026.

## Review the work on GitHub

**[Open the interactive MapLibre result on GitHub Pages](https://cisanotheraccount.github.io/cdp-mapping-systems_Ci/content/Assignments/Mapping-System-Weekly-Assignments-Ci/04_web_mapping/)**

- **Web map source:** [`index.html`](index.html) · [`map.js`](map.js) ·
  [`style.css`](style.css)
- **HAR pipeline:**
  [`capture_and_sanitize.mjs`](scripts/capture_and_sanitize.mjs) ·
  [`geolocate_har.py`](scripts/geolocate_har.py)
- **Formal evidence:**
  [`mapping-systems-course.sanitized.har`](data/mapping-systems-course.sanitized.har) ·
  [`server_locations.geojson`](data/server_locations.geojson) ·
  [`capture report`](data/mapping-systems-course.capture-report.json)
- **Course-equivalent output:**
  [`ip_map_folium.html`](outputs/ip_map_folium.html)
- **Provenance:** [`UPSTREAM_VERSION.md`](UPSTREAM_VERSION.md)

The JavaScript map is the primary result. It must be served over HTTP because it
fetches local GeoJSON; the complete local command is included under
**Reproduce the assignment**.

## 1. Capture a page without reusing personal browser state

The planned target was the
[StreetEasy Data Dashboard](https://streeteasy.com/blog/data-dashboard/).
An isolated, unsigned Playwright session reached an “Access to this page has
been denied” response. That result is retained in the
[`StreetEasy capture report`](data/streeteasy-dashboard.capture-report.json),
rather than being presented as a successful capture.

The assignment permits a website of the student's choice. The formal dataset
uses the public [Mapping Systems course site](https://mapping-systems.org/),
keeping the capture directly connected to the class. The capture starts a new
browser context, blocks service workers, and records a HAR without response
bodies:

```javascript
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: "en-US",
  viewport: { width: 1440, height: 1000 },
  serviceWorkers: "block",
  recordHar: { path: rawPath, content: "omit", mode: "full" },
});

const page = await context.newPage();
await page.goto(targetUrl, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
```

The public HAR is not the raw browser record. Each entry is rebuilt with empty
headers and cookies, no bodies, no credentials, and redacted query values. The
temporary raw file is then deleted:

```javascript
const entries = (raw.log?.entries ?? []).map(stripEntry);
const safeHar = {
  log: {
    version: raw.log?.version ?? "1.2",
    creator: {
      name: "Playwright capture, sanitized for coursework",
      version: "1",
    },
    pages: [],
    entries,
  },
};

await fs.writeFile(safePath, `${JSON.stringify(safeHar, null, 2)}\n`, "utf8");
await fs.rm(rawPath, { force: true });
```

The committed sanitizer preserves only the fields needed for the assignment.
See the complete [`stripEntry`](scripts/capture_and_sanitize.mjs) implementation
for the request and response schema.

## 2. Turn HAR server addresses into GeoJSON

The Python stage reads `serverIPAddress` from the sanitized HAR, rejects
missing, malformed, private, loopback, and link-local addresses, and associates
each remaining public address with the request host:

```python
def extract_ip_hosts(har_path: Path) -> dict[str, set[str]]:
    har = json.loads(har_path.read_text(encoding="utf-8"))
    found: dict[str, set[str]] = {}
    for entry in har.get("log", {}).get("entries", []):
        value = str(entry.get("serverIPAddress") or "").strip("[]")
        if not value:
            continue
        try:
            ip = ipaddress.ip_address(value)
        except ValueError:
            continue
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            continue
        host = urlparse(entry.get("request", {}).get("url", "")).hostname
        found.setdefault(str(ip), set()).add(host or "unknown")
    return found
```

Public IPs are resolved through the unauthenticated IPInfo endpoint and written
to [`server_locations.geojson`](data/server_locations.geojson). The same
features also produce the supplied Folium map, preserving the three core steps
of the course script while adding a cache, deterministic ordering, provenance,
and explicit limitations.

## 3. Load the infrastructure and rent layers in MapLibre

The interface loads the server result and the project's shared five-borough
rent-growth data as separate GeoJSON sources:

```javascript
Promise.all([
  fetch("data/server_locations.geojson").then((response) => response.json()),
  fetch("data/borough_rent_growth.geojson").then((response) => response.json()),
]).then(([servers, boroughs]) => {
  map.on("load", () => {
    map.addSource("servers", { type: "geojson", data: servers });
    map.addSource("boroughs", { type: "geojson", data: boroughs });

    map.addLayer({
      id: "borough-fill",
      type: "fill",
      source: "boroughs",
      paint: {
        "fill-color": [
          "interpolate", ["linear"], ["get", "rent_growth_pct"],
          44, "#f8d6a5", 60, "#ff8d5b", 77, "#bb3f31",
        ],
        "fill-opacity": 0.78,
      },
    });
  });
});
```

The network state shows a New York origin, a conceptual endpoint relation, and
the approximate public-IP geolocation. Clicking the server marker opens its
organization and location caveat. The NYC state uses polygon color to encode
nominal median asking-rent growth; clicking a borough reports its July 2016 and
June 2026 values. Both views are created at runtime by `map.js` and can be
inspected in the [live map](https://cisanotheraccount.github.io/cdp-mapping-systems_Ci/content/Assignments/Mapping-System-Weekly-Assignments-Ci/04_web_mapping/).

## Results

The formal Mapping Systems course-site capture produced:

| Measure | Recorded result |
|---|---:|
| HAR requests | 7 |
| Requests with a server IP | 7 |
| Unique request hosts | 4 |
| Geolocated public-IP features | 4 |
| Capture errors | 0 |
| Failed requests | 0 |
| Browser console errors | 0 |

The four public IPs resolved to two repeated approximate map locations:
**San Francisco / Cloudflare** and **New York City / Google**. These are
consistent with edge-network or registration locations; they do not establish
where a physical server or database is located.

The independent rent-context layer records the following frozen endpoints:

| Borough | July 2016 | June 2026 | Nominal growth |
|---|---:|---:|---:|
| Bronx | $1,700 | $2,995 | +76.2% |
| Staten Island | $2,050 | $3,300 | +61.0% |
| Manhattan | $3,400 | $4,965 | +46.0% |
| Queens | $2,305 | $3,350 | +45.3% |
| Brooklyn | $2,699 | $3,900 | +44.5% |

## Reproduce the assignment

From the `Mapping-System-Weekly-Assignments-Ci` project folder:

```bash
npm ci

node 04_web_mapping/scripts/capture_and_sanitize.mjs \
  https://mapping-systems.org/ mapping-systems-course

python 04_web_mapping/scripts/geolocate_har.py \
  04_web_mapping/data/mapping-systems-course.sanitized.har

python -m http.server 8005
```

Open <http://127.0.0.1:8005/04_web_mapping/>. `npm ci` installs the pinned
Playwright dependency used by the capture script.

## Interpretation limits

- IP geolocation is approximate. It may describe a CDN edge, network
  registration, or routing intermediary rather than a physical server or data
  store.
- The curved line is a designed relation between two endpoints, not a measured
  packet route, latency trace, or traceroute.
- A HAR is a time-specific browser-session record. DNS, caching, CDN selection,
  browser configuration, and page code can produce different results later.
- The StreetEasy page was challenged, so its capture is evidence of the failed
  primary target and is not mixed into the formal IP-location result.
- The rent layer provides thematic continuity only. It is not inferred from the
  HAR, and the assignment does not claim that rent change caused network
  geography.
- StreetEasy asking rent describes advertised platform listings, not every
  tenant's paid rent. Dollar values are nominal and the comparisons are
  descriptive rather than causal.

## Submission files

- [`web-map-desktop.png`](outputs/web-map-desktop.png) — the single screenshot
  required by the teacher, generated from the running page by the Playwright
  interaction test; the application never loads it
- [`server_locations.geojson`](data/server_locations.geojson) — generated
  public-IP result
- [`index.html`](index.html), [`style.css`](style.css), and [`map.js`](map.js) —
  launchable MapLibre implementation
- [`ip_map_folium.html`](outputs/ip_map_folium.html) — course-script-equivalent
  Folium output
- [`mapping-systems-course.sanitized.har`](data/mapping-systems-course.sanitized.har) —
  submission-safe formal input
- [`UPSTREAM_VERSION.md`](UPSTREAM_VERSION.md) — exact upstream revision and
  adaptation boundary
