// =============================================================
// Web Map Visualization — 04. Web Mapping (Part 2)
// Extends the previous week's web map with a Supabase/PostGIS
// backend and data-driven styling.
//
// Variables visualized:
//   - SeatingChoice   (categorical: sidewalk / roadway / both)  -> circle color
//   - distance from the clicked point (continuous, meters)      -> circle size + opacity
//   - compliance flag (derived, binary)                         -> circle stroke
// =============================================================

// ---- Supabase configuration ------------------------------------------
// Replace these with your own project's values (Project Settings > API).
const SUPABASE_URL = "https://rrkmamzfwuytxvddyylj.supabase.co";
const SUPABASE_KEY = "sb_publishable_7cX_COSDs4Vx_5ZUrJ27jg_eeL7iLKR";

const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---- Map configuration -------------------------------------------------
const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const NYC_CENTER = [-73.98, 40.75];

const DEFAULT_RADIUS_M = 500;
const MIN_RADIUS_M = 100;
const MAX_RADIUS_M = 2000;

const SEATING_COLORS = {
  sidewalk: "#3fe1c4",
  roadway: "#f2a65a",
  both: "#b98af2",
  unknown: "#7c8b99",
};

let currentRadius = DEFAULT_RADIUS_M;
let lastClick = null; // { lng, lat }
let layersReady = false;

// ---- Map setup -----------------------------------------------------------
const map = new maplibregl.Map({
  container: "map",
  style: BASEMAP_STYLE,
  center: NYC_CENTER,
  zoom: 12,
});

map.addControl(new maplibregl.NavigationControl(), "top-right");
map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");

const emptyFC = { type: "FeatureCollection", features: [] };

// ---- Helpers -------------------------------------------------------------

// Normalize the raw SeatingChoice string ("sidewalk" / "roadway" / "both",
// occasionally inconsistent case) into one of our four known categories.
function normalizeSeating(value) {
  const v = (value || "").toString().trim().toLowerCase();
  if (v === "sidewalk" || v === "roadway" || v === "both") return v;
  return "unknown";
}

// A restaurant is "flagged" if either compliance column has any non-empty
// note on file (e.g. "Non-Compliant", "Cease and Desist", "For HIQA Review").
// A blank value means no issue was recorded for that seating type.
function isFlagged(row) {
  const s = (row.sidewalk_compliance || "").toString().trim();
  const r = (row.roadway_compliance || "").toString().trim();
  return s.length > 0 || r.length > 0;
}

function complianceSummary(row) {
  const s = (row.sidewalk_compliance || "").toString().trim();
  const r = (row.roadway_compliance || "").toString().trim();
  if (!s && !r) return "No compliance issues on file";
  const parts = [];
  if (s) parts.push(`Sidewalk: ${s}`);
  if (r) parts.push(`Roadway: ${r}`);
  return parts.join(" &middot; ");
}

// Build a circle polygon (in degrees) approximating a `radiusMeters` ring
// around `center`, for the search-radius overlay.
function circlePolygon(center, radiusMeters, steps = 64) {
  const [lng, lat] = center;
  const latRad = (lat * Math.PI) / 180;
  const dLat = radiusMeters / 111320;
  const dLng = radiusMeters / (111320 * Math.cos(latRad));

  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(theta), lat + dLat * Math.sin(theta)]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

// Convert rows returned by the find_nearest_n_restaurants RPC into a
// GeoJSON FeatureCollection ready for the map. Each feature carries the
// query radius alongside dist_meters so the paint expressions can compute
// a normalized 0-1 "how close was this" ratio without needing to be
// rebuilt every time the radius slider changes.
function rowsToGeoJSON(rows, radiusMeters) {
  return {
    type: "FeatureCollection",
    features: rows.map((row) => {
      const seating = normalizeSeating(row.seating_choice);
      const flagged = isFlagged(row);
      return {
        type: "Feature",
        properties: {
          id: row.restaurant_inspection_id,
          name: row.name || "Unnamed restaurant",
          seating: seating,
          dist_meters: row.dist_meters,
          radius_at_query: radiusMeters,
          flagged: flagged,
          sidewalk_compliance: row.sidewalk_compliance,
          roadway_compliance: row.roadway_compliance,
        },
        geometry: { type: "Point", coordinates: [row.long, row.lat] },
      };
    }),
  };
}

// ---- Supabase query --------------------------------------------------------

async function queryNearby(lngLat, radiusMeters) {
  setStatus(`Searching within ${radiusMeters} m...`);

  const { data, error } = await supabaseClient.rpc("find_nearest_n_restaurants", {
    lat: lngLat.lat,
    lon: lngLat.lng,
    n: radiusMeters,
  });

  if (error) {
    console.error("Error fetching nearest restaurants:", error);
    setStatus(`Query failed: ${error.message}`, true);
    return;
  }

  const geojson = rowsToGeoJSON(data, radiusMeters);
  updateMapData(geojson, lngLat, radiusMeters);
  updateStats(geojson);
  setStatus(null);
}

// ---- Map layers ------------------------------------------------------------

function addLayers() {
  // Search-radius ring (drawn first, underneath everything else)
  map.addSource("search-radius", { type: "geojson", data: emptyFC });
  map.addLayer({
    id: "search-radius-fill",
    type: "fill",
    source: "search-radius",
    paint: { "fill-color": SEATING_COLORS.sidewalk, "fill-opacity": 0.05 },
  });
  map.addLayer({
    id: "search-radius-line",
    type: "line",
    source: "search-radius",
    paint: {
      "line-color": SEATING_COLORS.sidewalk,
      "line-width": 1.2,
      "line-dasharray": [2, 2],
      "line-opacity": 0.5,
    },
  });

  // Search origin marker
  map.addSource("search-origin", { type: "geojson", data: emptyFC });
  map.addLayer({
    id: "search-origin-point",
    type: "circle",
    source: "search-origin",
    paint: {
      "circle-radius": 5,
      "circle-color": "#ffffff",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#0a0e13",
    },
  });

  // Nearby restaurants — the data-driven layer
  map.addSource("nearby-restaurants", { type: "geojson", data: emptyFC });
  map.addLayer({
    id: "nearby-restaurants-points",
    type: "circle",
    source: "nearby-restaurants",
    paint: {
      // Color encodes the categorical variable: seating type
      "circle-color": [
        "match",
        ["get", "seating"],
        "sidewalk",
        SEATING_COLORS.sidewalk,
        "roadway",
        SEATING_COLORS.roadway,
        "both",
        SEATING_COLORS.both,
        SEATING_COLORS.unknown,
      ],
      // Size AND opacity both encode the continuous variable: distance
      // from the clicked point, normalized against the current search
      // radius so the encoding stays meaningful as the radius changes.
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["/", ["get", "dist_meters"], ["get", "radius_at_query"]],
        0,
        15,
        1,
        4,
      ],
      "circle-opacity": [
        "interpolate",
        ["linear"],
        ["/", ["get", "dist_meters"], ["get", "radius_at_query"]],
        0,
        0.95,
        1,
        0.45,
      ],
      // Stroke flags the derived compliance variable
      "circle-stroke-width": ["case", ["get", "flagged"], 2.5, 1],
      "circle-stroke-color": ["case", ["get", "flagged"], "#f2685f", "#0a0e13"],
    },
  });

  layersReady = true;
}

function updateMapData(geojson, origin, radiusMeters) {
  map.getSource("nearby-restaurants").setData(geojson);
  map.getSource("search-origin").setData({
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [origin.lng, origin.lat] } }],
  });
  map.getSource("search-radius").setData({
    type: "FeatureCollection",
    features: [circlePolygon([origin.lng, origin.lat], radiusMeters)],
  });
}

// ---- Interactions ------------------------------------------------------------

map.on("load", () => {
  addLayers();

  map.on("click", (e) => {
    lastClick = e.lngLat;
    queryNearby(lastClick, currentRadius);
  });

  map.on("click", "nearby-restaurants-points", (e) => {
    // Stop this click from also re-triggering the whole-map handler above,
    // so clicking directly on a point opens its popup without moving the
    // search origin.
    e.preventDefault();

    const f = e.features[0];
    const p = f.properties;
    const color = SEATING_COLORS[p.seating] || SEATING_COLORS.unknown;

    new maplibregl.Popup({ closeButton: true, offset: 10 })
      .setLngLat(f.geometry.coordinates)
      .setHTML(
        `<div class="popup-kind" style="background:${color}22;color:${color}">${escapeHtml(p.seating)}</div>` +
          `<div class="popup-name">${escapeHtml(p.name)}</div>` +
          `<div class="popup-row"><b>${Math.round(p.dist_meters)} m</b> from your click</div>` +
          `<div class="popup-row">${complianceSummary(p)}</div>` +
          (p.flagged ? `<div class="popup-flag">&#9679; flagged for review</div>` : "")
      )
      .addTo(map);
  });

  map.on("mouseenter", "nearby-restaurants-points", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "nearby-restaurants-points", () => (map.getCanvas().style.cursor = ""));
});

// ---- UI: panel, slider, stats, status --------------------------------------

function updateStats(geojson) {
  const total = geojson.features.length;
  const flaggedCount = geojson.features.filter((f) => f.properties.flagged).length;
  const closest = total ? Math.round(Math.min(...geojson.features.map((f) => f.properties.dist_meters))) : "–";

  document.getElementById("stat-count").textContent = total;
  document.getElementById("stat-closest").textContent = total ? `${closest}m` : "–";
  document.getElementById("stat-flagged").textContent = flaggedCount;
}

function setStatus(message, isError = false) {
  const el = document.getElementById("status-line");
  if (!message) {
    el.textContent = "";
    el.className = "footnote";
    return;
  }
  el.textContent = message;
  el.className = isError ? "error" : "footnote";
}

const radiusSlider = document.getElementById("radius-slider");
const radiusValue = document.getElementById("radius-value");

radiusSlider.min = MIN_RADIUS_M;
radiusSlider.max = MAX_RADIUS_M;
radiusSlider.value = DEFAULT_RADIUS_M;
radiusValue.textContent = `${DEFAULT_RADIUS_M} m`;

radiusSlider.addEventListener("input", (e) => {
  currentRadius = Number(e.target.value);
  radiusValue.textContent = `${currentRadius} m`;
  if (lastClick && layersReady) {
    queryNearby(lastClick, currentRadius);
  }
});

document.getElementById("panel-toggle").addEventListener("click", () => {
  document.getElementById("panel").classList.toggle("open");
});
