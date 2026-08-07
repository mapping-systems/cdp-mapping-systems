const DATA_URL = "data/manhattan_rent_growth_points.geojson";
const NTA_URL = "data/manhattan_nta.geojson";
const DEFAULT_POINT = [-73.9626, 40.8076];

const state = {
  localData: null,
  radiusKm: 3,
  selectedPoint: DEFAULT_POINT,
  results: [],
  mode: "local",
};

const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": "#f3efe6" } }],
  },
  center: [-73.978, 40.776],
  zoom: 11.15,
  minZoom: 9.6,
  maxZoom: 16,
  attributionControl: false,
});

map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");
map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

const radiusInput = document.querySelector("#radius");
const radiusOutput = document.querySelector("#radius-output");
const modeBadge = document.querySelector("#mode-badge");
const resultCount = document.querySelector("#result-count");
const resultsList = document.querySelector("#results-list");
const selectedCoordinates = document.querySelector("#selected-coordinates");

function hasSupabaseConfig() {
  const config = window.RENT_MAP_CONFIG || {};
  return Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function haversineMeters(origin, destination) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadius = 6371008.8;
  const [lon1, lat1] = origin.map(toRadians);
  const [lon2, lat2] = destination.map(toRadians);
  const deltaLat = lat2 - lat1;
  const deltaLon = lon2 - lon1;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

function localQuery(point, radiusMeters) {
  return state.localData.features
    .map((feature) => {
      const distanceMeters = haversineMeters(point, feature.geometry.coordinates);
      return {
        ...feature.properties,
        longitude: feature.geometry.coordinates[0],
        latitude: feature.geometry.coordinates[1],
        distance_m: distanceMeters,
      };
    })
    .filter((row) => row.distance_m <= radiusMeters)
    .sort((a, b) => a.distance_m - b.distance_m);
}

async function apiQuery(point, radiusMeters) {
  const config = window.RENT_MAP_CONFIG;
  const response = await fetch(`${config.SUPABASE_URL}/rest/v1/rpc/find_rent_areas_within_radius`, {
    method: "POST",
    headers: {
      apikey: config.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${config.SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ lat: point[1], lon: point[0], radius_m: Math.round(radiusMeters) }),
  });
  if (!response.ok) throw new Error(`Supabase RPC returned HTTP ${response.status}`);
  return response.json();
}

async function runQuery() {
  const radiusMeters = state.radiusKm * 1000;
  let results;
  if (hasSupabaseConfig()) {
    try {
      results = await apiQuery(state.selectedPoint, radiusMeters);
      state.mode = "api";
    } catch (error) {
      console.warn("Supabase unavailable; using local fallback.", error);
      results = localQuery(state.selectedPoint, radiusMeters);
      state.mode = "local";
    }
  } else {
    results = localQuery(state.selectedPoint, radiusMeters);
    state.mode = "local";
  }
  state.results = results;
  renderSelection();
}

function lineCollection() {
  return {
    type: "FeatureCollection",
    features: state.results.map((row) => ({
      type: "Feature",
      properties: { area_id: row.area_id, distance_m: Number(row.distance_m) },
      geometry: {
        type: "LineString",
        coordinates: [state.selectedPoint, [Number(row.longitude), Number(row.latitude)]],
      },
    })),
  };
}

function selectedPointFeature() {
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: state.selectedPoint } }],
  };
}

function popupHtml(row) {
  return `
    <div class="popup-title">${escapeHtml(row.area_name)}</div>
    <div class="popup-grid">
      <span>July 2016</span><span>$${Number(row.baseline_rent_usd).toLocaleString()}</span>
      <span>June 2026</span><span>$${Number(row.latest_rent_usd).toLocaleString()}</span>
      <span>Nominal growth</span><span>+${Number(row.growth_pct).toFixed(1)}%</span>
      ${row.distance_m == null ? "" : `<span>Distance</span><span>${(Number(row.distance_m) / 1000).toFixed(2)} km</span>`}
    </div>`;
}

function showPopup(row) {
  new maplibregl.Popup({ offset: 14 })
    .setLngLat([Number(row.longitude), Number(row.latitude)])
    .setHTML(popupHtml(row))
    .addTo(map);
}

function renderSelection() {
  map.getSource("selected-point").setData(selectedPointFeature());
  map.getSource("distance-lines").setData(lineCollection());
  const resultIds = state.results.map((row) => row.area_id);
  map.setFilter("rent-results", ["in", ["get", "area_id"], ["literal", resultIds]]);

  modeBadge.textContent = state.mode === "api" ? "Supabase / PostGIS" : "Local GeoJSON fallback";
  modeBadge.classList.toggle("api", state.mode === "api");
  resultCount.textContent = `${state.results.length} area${state.results.length === 1 ? "" : "s"}`;
  selectedCoordinates.textContent = `${state.selectedPoint[1].toFixed(4)}, ${state.selectedPoint[0].toFixed(4)}`;

  resultsList.replaceChildren();
  if (state.results.length === 0) {
    const empty = document.createElement("li");
    empty.className = "result-metric";
    empty.textContent = "No rent areas fall within this radius. Increase the radius or select another Manhattan point.";
    resultsList.append(empty);
    return;
  }

  state.results.forEach((row, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.className = "result-button";
    button.type = "button";
    button.innerHTML = `
      <span class="rank">${String(index + 1).padStart(2, "0")}</span>
      <span><span class="result-name">${escapeHtml(row.area_name)}</span>
      <span class="result-metric">+${Number(row.growth_pct).toFixed(1)}% · $${Number(row.latest_rent_usd).toLocaleString()}</span></span>
      <span class="result-distance">${(Number(row.distance_m) / 1000).toFixed(2)} km</span>`;
    button.addEventListener("click", () => {
      map.easeTo({ center: [Number(row.longitude), Number(row.latitude)], zoom: 13.3, duration: 600 });
      showPopup(row);
    });
    item.append(button);
    resultsList.append(item);
  });
}

function addLayers(ntaData, rentData) {
  state.localData = rentData;
  map.addSource("nta", { type: "geojson", data: ntaData });
  map.addLayer({
    id: "nta-fill",
    type: "fill",
    source: "nta",
    paint: { "fill-color": "#e5dfd2", "fill-opacity": 0.72, "fill-outline-color": "#b7afa1" },
  });
  map.addSource("rent-areas", { type: "geojson", data: rentData });
  map.addLayer({
    id: "rent-context",
    type: "circle",
    source: "rent-areas",
    paint: {
      "circle-color": ["interpolate", ["linear"], ["get", "growth_pct"], 20, "#f5dfb1", 35, "#efb366", 50, "#e56c3d", 70, "#9e2f27"],
      "circle-radius": ["interpolate", ["linear"], ["get", "latest_rent_usd"], 2500, 5, 6000, 13],
      "circle-opacity": 0.28,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 0.75,
    },
  });
  map.addSource("distance-lines", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "distance-lines",
    type: "line",
    source: "distance-lines",
    paint: { "line-color": "#4f8cab", "line-width": 1.1, "line-opacity": 0.72, "line-dasharray": [2, 2] },
  });
  map.addLayer({
    id: "rent-results",
    type: "circle",
    source: "rent-areas",
    filter: ["in", ["get", "area_id"], ["literal", []]],
    paint: {
      "circle-color": ["interpolate", ["linear"], ["get", "growth_pct"], 20, "#f5dfb1", 35, "#efb366", 50, "#e56c3d", 70, "#9e2f27"],
      "circle-radius": ["interpolate", ["linear"], ["get", "latest_rent_usd"], 2500, 7, 6000, 15],
      "circle-opacity": 0.92,
      "circle-stroke-color": "#172029",
      "circle-stroke-width": 1.3,
    },
  });
  map.addSource("selected-point", { type: "geojson", data: selectedPointFeature() });
  map.addLayer({
    id: "selected-halo",
    type: "circle",
    source: "selected-point",
    paint: { "circle-radius": 15, "circle-color": "#67a7c7", "circle-opacity": 0.17 },
  });
  map.addLayer({
    id: "selected-point",
    type: "circle",
    source: "selected-point",
    paint: { "circle-radius": 5, "circle-color": "#245a73", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
  });

  map.on("mouseenter", "rent-results", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "rent-results", () => { map.getCanvas().style.cursor = ""; });
  map.on("click", "rent-results", (event) => {
    const feature = event.features[0];
    const matching = state.results.find((row) => row.area_id === feature.properties.area_id) || feature.properties;
    showPopup({ ...matching, longitude: feature.geometry.coordinates[0], latitude: feature.geometry.coordinates[1] });
  });
}

map.on("load", async () => {
  try {
    const [ntaResponse, rentResponse] = await Promise.all([fetch(NTA_URL), fetch(DATA_URL)]);
    if (!ntaResponse.ok || !rentResponse.ok) throw new Error("A local data file could not be loaded.");
    addLayers(await ntaResponse.json(), await rentResponse.json());
    await runQuery();
  } catch (error) {
    modeBadge.textContent = "Data load failed";
    console.error(error);
  }
});

map.on("click", (event) => {
  if (!state.localData) return;
  const rentHit = map.queryRenderedFeatures(event.point, { layers: ["rent-results"] });
  if (rentHit.length) return;
  state.selectedPoint = [event.lngLat.lng, event.lngLat.lat];
  runQuery();
});

radiusInput.addEventListener("input", () => {
  state.radiusKm = Number(radiusInput.value);
  radiusOutput.value = `${state.radiusKm.toFixed(1)} km`;
});

radiusInput.addEventListener("change", () => runQuery());
