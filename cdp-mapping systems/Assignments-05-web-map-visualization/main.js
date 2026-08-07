"use strict";

const SEARCH_RADIUS_METERS = 1000;
const INITIAL_CENTER = [-73.9857, 40.7484];

const map = new maplibregl.Map({
  container: "map",
  style: "./style.json",
  center: INITIAL_CENTER,
  zoom: 12,
});

map.addControl(new maplibregl.NavigationControl(), "top-right");

// The publishable key is intended for browser-side use. Access is controlled by RLS.
const { createClient } = window.supabase;
const supabaseUrl = "https://edkyphvohrzqrvtfohzh.supabase.co";
const supabaseKey = "sb_publishable_Xj1lHkP8LJ_YS52BN9IuyA_ojdA8cJ4";
const supabaseClient = createClient(supabaseUrl, supabaseKey);

const statusText = document.getElementById("status-text");
const statusDot = document.getElementById("status-dot");
const resultCount = document.getElementById("result-count");
const resultLabel = document.getElementById("result-label");

function setStatus(message, state = "ready") {
  statusText.textContent = message;
  statusDot.className = `status-dot ${state}`;
}

function setResultSummary(count) {
  resultCount.textContent = count.toLocaleString();
  resultLabel.textContent =
    count === 1 ? "inspection observation" : "inspection observations";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeSeatingChoice(value) {
  const normalized = String(value ?? "unknown").trim().toLowerCase();

  if (normalized === "sidewalk") return "sidewalk";
  if (normalized === "roadway") return "roadway";
  if (normalized === "both") return "both";
  return "unknown";
}

function formatSeatingChoice(value) {
  const normalized = normalizeSeatingChoice(value);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatDistance(distanceMeters) {
  const distance = Number(distanceMeters);
  if (!Number.isFinite(distance)) return "Unknown";
  if (distance < 1000) return `${Math.round(distance)} m`;
  return `${(distance / 1000).toFixed(2)} km`;
}

function rowsToGeoJSON(rows) {
  const features = rows
    .map((row) => {
      const longitude = Number(row.long);
      const latitude = Number(row.lat);
      const distance = Number(row.dist_meters);

      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return null;
      }

      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        properties: {
          inspection_id: row.RestaurantInspectionID ?? "",
          name: row.name || "Unnamed restaurant",
          seating_choice: normalizeSeatingChoice(row.seating_choice),
          dist_meters: Number.isFinite(distance) ? distance : SEARCH_RADIUS_METERS,
        },
      };
    })
    .filter(Boolean);

  return {
    type: "FeatureCollection",
    features,
  };
}

// Build an approximate geodesic circle as GeoJSON so the search radius is visible.
function createCircleGeoJSON(center, radiusMeters, steps = 96) {
  const [centerLng, centerLat] = center;
  const earthRadius = 6371008.8;
  const angularDistance = radiusMeters / earthRadius;
  const centerLatRad = (centerLat * Math.PI) / 180;
  const centerLngRad = (centerLng * Math.PI) / 180;
  const coordinates = [];

  for (let index = 0; index <= steps; index += 1) {
    const bearing = (index / steps) * Math.PI * 2;
    const latitude = Math.asin(
      Math.sin(centerLatRad) * Math.cos(angularDistance) +
        Math.cos(centerLatRad) * Math.sin(angularDistance) * Math.cos(bearing)
    );
    const longitude =
      centerLngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(centerLatRad),
        Math.cos(angularDistance) - Math.sin(centerLatRad) * Math.sin(latitude)
      );

    coordinates.push([
      ((longitude * 180) / Math.PI + 540) % 360 - 180,
      (latitude * 180) / Math.PI,
    ]);
  }

  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [coordinates],
    },
    properties: {},
  };
}

async function queryWithinDistance(point, radius = SEARCH_RADIUS_METERS) {
  const { data, error } = await supabaseClient.rpc(
    "find_nearest_n_restaurants",
    {
      p_lat: point[1],
      p_lon: point[0],
      p_radius_meters: radius,
    }
  );

  if (error) {
    throw new Error(error.message || "Supabase spatial query failed.");
  }

  return Array.isArray(data) ? data : [];
}

function updateSearchLocation(point) {
  map.getSource("search-radius").setData(
    createCircleGeoJSON(point, SEARCH_RADIUS_METERS)
  );

  map.getSource("search-point").setData({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: point,
    },
    properties: {},
  });
}

function updateRestaurantResults(rows) {
  const geojson = rowsToGeoJSON(rows);
  map.getSource("supabase-restaurants").setData(geojson);
  setResultSummary(geojson.features.length);
}

async function performSearch(point) {
  setStatus("Querying Supabase within 1,000 meters…", "loading");
  updateSearchLocation(point);

  try {
    const rows = await queryWithinDistance(point);
    updateRestaurantResults(rows);

    if (rows.length === 0) {
      setStatus("No observations found. Try another location.", "ready");
    } else if (rows.length >= 1000) {
      setStatus("Showing the first 1,000 nearby observations.", "ready");
    } else {
      setStatus("Click another location to update the search.", "ready");
    }
  } catch (error) {
    console.error("Error fetching nearby restaurants:", error);
    setResultSummary(0);
    setStatus("The Supabase query failed. Check the Console.", "error");
  }
}

map.on("load", () => {
  map.addSource("search-radius", {
    type: "geojson",
    data: createCircleGeoJSON(INITIAL_CENTER, SEARCH_RADIUS_METERS),
  });

  map.addLayer({
    id: "search-radius-fill",
    type: "fill",
    source: "search-radius",
    paint: {
      "fill-color": "#111111",
      "fill-opacity": 0.055,
    },
  });

  map.addLayer({
    id: "search-radius-line",
    type: "line",
    source: "search-radius",
    paint: {
      "line-color": "#111111",
      "line-width": 1.5,
      "line-dasharray": [3, 2],
      "line-opacity": 0.75,
    },
  });

  map.addSource("supabase-restaurants", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [],
    },
  });

  map.addLayer({
    id: "supabase-restaurants-layer",
    type: "circle",
    source: "supabase-restaurants",
    paint: {
      "circle-color": [
        "match",
        ["get", "seating_choice"],
        "sidewalk",
        "#0066ff",
        "roadway",
        "#ff5a1f",
        "both",
        "#8b5cf6",
        "#6b7280",
      ],
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["get", "dist_meters"],
        0,
        13,
        250,
        10,
        500,
        8,
        750,
        6,
        1000,
        4,
      ],
      "circle-opacity": 0.82,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.4,
    },
  });

  map.addSource("search-point", {
    type: "geojson",
    data: {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: INITIAL_CENTER,
      },
      properties: {},
    },
  });

  map.addLayer({
    id: "search-point-outer",
    type: "circle",
    source: "search-point",
    paint: {
      "circle-radius": 9,
      "circle-color": "#ffffff",
      "circle-stroke-color": "#111111",
      "circle-stroke-width": 3,
    },
  });

  map.addLayer({
    id: "search-point-inner",
    type: "circle",
    source: "search-point",
    paint: {
      "circle-radius": 3.5,
      "circle-color": "#111111",
    },
  });

  map.on("mouseenter", "supabase-restaurants-layer", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "supabase-restaurants-layer", () => {
    map.getCanvas().style.cursor = "";
  });

  map.on("click", "supabase-restaurants-layer", (event) => {
    const feature = event.features?.[0];
    if (!feature) return;

    const coordinates = feature.geometry.coordinates.slice();
    const properties = feature.properties;

    new maplibregl.Popup({ offset: 10 })
      .setLngLat(coordinates)
      .setHTML(`
        <h3 class="popup-name">${escapeHtml(properties.name)}</h3>
        <dl class="popup-grid">
          <dt>Seating</dt>
          <dd>${escapeHtml(formatSeatingChoice(properties.seating_choice))}</dd>
          <dt>Distance</dt>
          <dd>${escapeHtml(formatDistance(properties.dist_meters))}</dd>
          <dt>Observation ID</dt>
          <dd>${escapeHtml(properties.inspection_id || "—")}</dd>
        </dl>
      `)
      .addTo(map);
  });

  map.on("click", (event) => {
    const clickedRestaurant = map.queryRenderedFeatures(event.point, {
      layers: ["supabase-restaurants-layer"],
    });

    if (clickedRestaurant.length > 0) return;

    performSearch([event.lngLat.lng, event.lngLat.lat]);
  });

  performSearch(INITIAL_CENTER);
});

map.on("error", (event) => {
  console.error("MapLibre error:", event.error || event);
});
