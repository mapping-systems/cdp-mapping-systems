// ---------------------------------------------------------
// Supabase connection
// ---------------------------------------------------------
// TODO: replace with your own project values (Project Settings > API)
const { createClient } = window.supabase;
const supabaseUrl = "https://uvoinhyenvlxuprdqosb.supabase.co";
const supabaseKey = "API-KEY";
const supabaseClient = createClient(supabaseUrl, supabaseKey);

// Search radius (meters) used for every click query.
const SEARCH_RADIUS_M = 1000;

// ---------------------------------------------------------
// Palette
// ---------------------------------------------------------
const COLOR_ACCENT = "#FF6B35"; // Atomic Tangerine — click point + boundary
const COLOR_NEAR = "#1E3C9F"; // Egyptian Blue — closest restaurants
const COLOR_MID = "#6A8DFF"; // Cornflower Blue — mid distance
const COLOR_FAR = "#D1D3F0"; // Lavender — farthest restaurants
const COLOR_LINE = "#2222b6"; // thin connector lines

// ---------------------------------------------------------
// Map setup (dark basemap)
// ---------------------------------------------------------
const map = new maplibregl.Map({
  container: "map",
  style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  center: [-73.98, 40.75], // Manhattan-ish default
  zoom: 12,
});

const CLICK_SOURCE = "click-point";
const CLICK_LAYER = "click-point-layer";
const RADIUS_SOURCE = "search-radius";
const LINES_SOURCE = "connector-lines";
const LINES_LAYER = "connector-lines-layer";

let popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false });
let restaurantMarkers = []; // track HTML markers so we can clear them between clicks

map.on("load", () => {
  // -------------------------------------------------------
  // Glowing search-radius boundary
  // -------------------------------------------------------
  map.addSource(RADIUS_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addLayer({
    id: "search-radius-glow-outer",
    type: "fill",
    source: RADIUS_SOURCE,
    paint: { "fill-color": COLOR_ACCENT, "fill-opacity": 0.04 },
  });
  map.addLayer({
    id: "search-radius-glow-inner",
    type: "fill",
    source: RADIUS_SOURCE,
    paint: { "fill-color": COLOR_ACCENT, "fill-opacity": 0.08 },
  });
  map.addLayer({
    id: "search-radius-outline-soft",
    type: "line",
    source: RADIUS_SOURCE,
    paint: {
      "line-color": COLOR_ACCENT,
      "line-width": 8,
      "line-opacity": 0.12,
      "line-blur": 4,
    },
  });
  map.addLayer({
    id: "search-radius-outline-crisp",
    type: "line",
    source: RADIUS_SOURCE,
    paint: {
      "line-color": COLOR_ACCENT,
      "line-width": 1.5,
      "line-opacity": 0.8,
    },
  });

  // -------------------------------------------------------
  // Thin connector lines from click point to each restaurant
  // -------------------------------------------------------
  map.addSource(LINES_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: LINES_LAYER,
    type: "line",
    source: LINES_SOURCE,
    paint: {
      "line-color": COLOR_LINE,
      "line-width": 1,
      "line-opacity": 0.35,
    },
  });

  // -------------------------------------------------------
  // Click-location marker (orange)
  // -------------------------------------------------------
  map.addSource(CLICK_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: CLICK_LAYER,
    type: "circle",
    source: CLICK_SOURCE,
    paint: {
      "circle-radius": 7,
      "circle-color": COLOR_ACCENT,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#2222b6",
    },
  });

  // -------------------------------------------------------
  // Click handler: query Supabase, draw boundary + lines + squares
  // -------------------------------------------------------
  map.on("click", (e) => {
    const point = [e.lngLat.lng, e.lngLat.lat];

    map.getSource(CLICK_SOURCE).setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: point },
          properties: {},
        },
      ],
    });

    map.getSource(RADIUS_SOURCE).setData({
      type: "FeatureCollection",
      features: [makeCircleFeature(point, SEARCH_RADIUS_M)],
    });

    queryWithinDistance(point, SEARCH_RADIUS_M);
  });
});

// ---------------------------------------------------------
// Query Supabase for nearby restaurant inspection points
// ---------------------------------------------------------
async function queryWithinDistance(point, n = 1000) {
  const { data, error } = await supabaseClient.rpc(
    "find_nearest_n_restaurants",
    {
      lat: point[1],
      lon: point[0],
      n: n,
    }
  );

  if (error) {
    console.error("Error fetching nearest points:", error);
    return;
  }

  renderResults(point, data, n);
}

// Draw connector lines + square markers for the query results
function renderResults(clickPoint, rows, maxDistance) {
  // clear previous markers
  restaurantMarkers.forEach((m) => m.remove());
  restaurantMarkers = [];

  // connector lines (click point -> each restaurant)
  const lineFeatures = rows.map((row) => ({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [clickPoint, [row.long, row.lat]],
    },
    properties: {},
  }));
  map.getSource(LINES_SOURCE).setData({
    type: "FeatureCollection",
    features: lineFeatures,
  });

  // square markers, colored + sized by distance
  rows.forEach((row) => {
    const t = Math.min(row.dist_meters / maxDistance, 1); // 0 = closest, 1 = farthest
    const color = distanceToColor(t);
    const size = 16 - t * 8; // 16px near -> 8px far

    const el = document.createElement("div");
    el.className = "restaurant-marker";
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.backgroundColor = color;

    el.addEventListener("click", (evt) => {
      evt.stopPropagation();
      popup
        .setLngLat([row.long, row.lat])
        .setHTML(
          `<strong>${row.name ?? "Unknown restaurant"}</strong><br/>
           ${Math.round(row.dist_meters)} m away`
        )
        .addTo(map);
    });

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([row.long, row.lat])
      .addTo(map);

    restaurantMarkers.push(marker);
  });
}

// ---------------------------------------------------------
// Color helpers: 3-stop gradient, near (Egyptian Blue) -> mid (Cornflower Blue) -> far (Lavender)
// ---------------------------------------------------------
function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ];
}

function rgbToHex([r, g, b]) {
  const toHex = (v) => Math.round(v).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lerpColor(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex(a.map((channel, i) => channel + (b[i] - channel) * t));
}

// t: 0 (closest) -> 1 (farthest)
function distanceToColor(t) {
  if (t <= 0.5) {
    return lerpColor(COLOR_NEAR, COLOR_MID, t / 0.5);
  }
  return lerpColor(COLOR_MID, COLOR_FAR, (t - 0.5) / 0.5);
}

// ---------------------------------------------------------
// Build an approximate circle polygon
// ---------------------------------------------------------
function makeCircleFeature(center, radiusMeters, points = 64) {
  const [lon, lat] = center;
  const km = radiusMeters / 500;
  const distanceX = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  const distanceY = km / 110.574;

  const coords = [];
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    coords.push([lon + distanceX * Math.cos(theta), lat + distanceY * Math.sin(theta)]);
  }
  coords.push(coords[0]);

  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [coords] },
    properties: {},
  };
}
