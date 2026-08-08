const { createClient } = window.supabase;

const supabaseUrl = "https://qbrjctourwzirphymcem.supabase.co";
const supabaseKey = "sb_publishable_rdAvDChIrQrPQPiyHdjYLA_X979egc9";
const supabaseClient = createClient(supabaseUrl, supabaseKey);

const map = new maplibregl.Map({
  container: "map",
  style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  center: [-73.9857, 40.7484],
  zoom: 11,
});

map.addControl(new maplibregl.NavigationControl());

const statusElement = document.querySelector("#status");
const SEARCH_RADIUS_METERS = 500;
const SELECTION_STORAGE_KEY = "restaurant-inspection-map-selection";
let selectedPoint = null;
let latestQueryId = 0;
const emptyFeatureCollection = () => ({
  type: "FeatureCollection",
  features: [],
});

function setStatus(message) {
  statusElement.textContent = message;
}

function saveSelectedPoint(point) {
  try {
    sessionStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(point));
  } catch (storageError) {
    console.warn("The selected point could not be saved for reload recovery:", storageError);
  }
}

function loadSelectedPoint() {
  try {
    const point = JSON.parse(sessionStorage.getItem(SELECTION_STORAGE_KEY));
    const isValidPoint = Array.isArray(point)
      && point.length === 2
      && Number.isFinite(point[0])
      && Number.isFinite(point[1])
      && point[0] >= -180
      && point[0] <= 180
      && point[1] >= -90
      && point[1] <= 90;

    return isValidPoint ? point : null;
  } catch (storageError) {
    console.warn("The saved selected point could not be restored:", storageError);
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createPinImage(color) {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 58;
  const context = canvas.getContext("2d");

  context.beginPath();
  context.moveTo(24, 54);
  context.bezierCurveTo(20, 45, 7, 33, 7, 20);
  context.bezierCurveTo(7, 10, 14.5, 3, 24, 3);
  context.bezierCurveTo(33.5, 3, 41, 10, 41, 20);
  context.bezierCurveTo(41, 33, 28, 45, 24, 54);
  context.closePath();
  context.fillStyle = color;
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = "#ffffff";
  context.stroke();

  context.beginPath();
  context.arc(24, 20, 6, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();

  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function createRadiusPolygon(center, radiusMeters, steps = 96) {
  const earthRadius = 6371008.8;
  const angularDistance = radiusMeters / earthRadius;
  const latitude = (center[1] * Math.PI) / 180;
  const longitude = (center[0] * Math.PI) / 180;
  const coordinates = [];

  for (let index = 0; index <= steps; index += 1) {
    const bearing = (index / steps) * Math.PI * 2;
    const destinationLatitude = Math.asin(
      Math.sin(latitude) * Math.cos(angularDistance)
        + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const destinationLongitude = longitude + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(destinationLatitude),
    );

    coordinates.push([
      (destinationLongitude * 180) / Math.PI,
      (destinationLatitude * 180) / Math.PI,
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

function inspectionsToGeoJSON(rows) {
  return {
    type: "FeatureCollection",
    features: rows
      .map((row) => {
        const longitude = Number(row.long);
        const latitude = Number(row.lat);

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
            id: row.restaurant_inspection_id ?? row.restaurantinspectionid,
            restaurant_name: row.restaurant_name ?? row.name ?? "Unknown restaurant",
            business_address: row.business_address ?? "Address unavailable",
            seating_choice: String(row.seating_choice ?? "unknown").toLowerCase(),
            inspected_on: row.inspected_on ?? "Date unavailable",
            distance_m: Math.round(Number(row.dist_meters) || 0),
          },
        };
      })
      .filter(Boolean),
  };
}

function inspectionTime(value) {
  const timestamp = Date.parse(value ?? "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function keepLatestInspection(rows) {
  const latestByRestaurant = new Map();

  rows.forEach((row) => {
    const key = [row.restaurant_name, row.business_address]
      .map((value) => String(value ?? "").trim().toLowerCase())
      .join("|");
    const current = latestByRestaurant.get(key);

    if (!current || inspectionTime(row.inspected_on) > inspectionTime(current.inspected_on)) {
      latestByRestaurant.set(key, row);
    }
  });

  return [...latestByRestaurant.values()].sort(
    (first, second) => Number(first.dist_meters) - Number(second.dist_meters),
  );
}

async function enrichTutorialResults(rows) {
  const locationsById = new Map(
    rows.map((row) => [
      String(row.restaurant_inspection_id ?? row.restaurantinspectionid),
      row,
    ]),
  );
  const inspectionIds = [...locationsById.keys()];
  const batchSize = 200;
  const batches = [];

  for (let index = 0; index < inspectionIds.length; index += batchSize) {
    batches.push(inspectionIds.slice(index, index + batchSize));
  }

  const responses = await Promise.all(
    batches.map((ids) =>
      supabaseClient
        .from("open-restaurant-inspections")
        .select("RestaurantInspectionID, RestaurantName, BusinessAddress, SeatingChoice, InspectedOn")
        .in("RestaurantInspectionID", ids),
    ),
  );
  const failedResponse = responses.find(({ error }) => error);

  if (failedResponse) {
    throw failedResponse.error;
  }

  const enrichedRows = responses.flatMap(({ data }) => data).map((inspection) => {
    const location = locationsById.get(String(inspection.RestaurantInspectionID));
    return {
      restaurant_inspection_id: inspection.RestaurantInspectionID,
      restaurant_name: inspection.RestaurantName,
      business_address: inspection.BusinessAddress,
      seating_choice: inspection.SeatingChoice,
      inspected_on: inspection.InspectedOn,
      lat: location.lat,
      long: location.long,
      dist_meters: location.dist_meters,
    };
  });

  return keepLatestInspection(enrichedRows);
}

async function queryWithinDistance(
  point,
  n = SEARCH_RADIUS_METERS,
  queryId = latestQueryId,
) {
  const { data, error } = await supabaseClient.rpc(
    "find_nearest_n_restaurants",
    {
      lat: point[1],
      lon: point[0],
      n,
    },
  );

  if (queryId !== latestQueryId) return;

  if (error) {
    console.error("Error fetching nearest points:", error);
    setStatus("The inspection query failed. Check the browser console and Supabase function.");
  } else {
    try {
      const hasLatestFields = data.length === 0 || "inspected_on" in data[0];
      const latestRows = hasLatestFields ? data : await enrichTutorialResults(data);
      if (queryId !== latestQueryId) return;

      console.log("Latest inspection points fetched successfully:", latestRows);
      const inspections = inspectionsToGeoJSON(latestRows);
      map.getSource("restaurant-inspections").setData(inspections);

      if (inspections.features.length === 0) {
        setStatus(`No restaurant inspections were found within ${SEARCH_RADIUS_METERS} meters.`);
      } else {
        setStatus(`${inspections.features.length.toLocaleString()} latest restaurant inspections found.`);
      }
    } catch (enrichmentError) {
      if (queryId !== latestQueryId) return;

      console.error("Error loading inspection details:", enrichmentError);
      setStatus("The restaurant details could not be loaded. Check the browser console.");
    }
  }
}

function selectLocation(point, { animate = true } = {}) {
  selectedPoint = point;
  latestQueryId += 1;
  saveSelectedPoint(point);

  map.getSource("clicked-location").setData({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: point,
    },
    properties: {},
  });
  map.getSource("search-radius").setData(
    createRadiusPolygon(point, SEARCH_RADIUS_METERS),
  );
  map.getSource("hover-connector").setData(emptyFeatureCollection());

  const cameraOptions = {
    center: point,
    zoom: Math.max(map.getZoom(), 14),
  };
  if (animate) {
    map.easeTo({ ...cameraOptions, duration: 900 });
  } else {
    map.jumpTo(cameraOptions);
  }

  setStatus("Searching for the latest inspections…");
  queryWithinDistance(point, SEARCH_RADIUS_METERS, latestQueryId);
}

map.on("load", () => {
  const pinColors = {
    sidewalk: "#6f9187",
    roadway: "#6f7f99",
    both: "#8f7aa8",
    other: "#8a8178",
  };

  Object.entries(pinColors).forEach(([name, color]) => {
    map.addImage(`pin-${name}`, createPinImage(color), { pixelRatio: 2 });
  });

  map.addSource("search-radius", {
    type: "geojson",
    data: emptyFeatureCollection(),
  });

  map.addLayer({
    id: "search-radius-fill",
    type: "fill",
    source: "search-radius",
    paint: {
      "fill-color": "#f97316",
      "fill-opacity": 0.08,
    },
  });

  map.addLayer({
    id: "search-radius-outline",
    type: "line",
    source: "search-radius",
    paint: {
      "line-color": "#f97316",
      "line-width": 2,
      "line-opacity": 0.5,
      "line-dasharray": [2, 2],
    },
  });

  map.addSource("restaurant-inspections", {
    type: "geojson",
    data: emptyFeatureCollection(),
  });

  map.addSource("hover-connector", {
    type: "geojson",
    data: emptyFeatureCollection(),
  });

  map.addLayer({
    id: "inspection-points",
    type: "symbol",
    source: "restaurant-inspections",
    layout: {
      "icon-image": [
        "match",
        ["get", "seating_choice"],
        "sidewalk",
        "pin-sidewalk",
        "roadway",
        "pin-roadway",
        "both",
        "pin-both",
        "pin-other",
      ],
      "icon-size": [
        "interpolate",
        ["linear"],
        ["get", "distance_m"],
        0,
        1.1,
        SEARCH_RADIUS_METERS,
        0.72,
      ],
      "icon-anchor": "bottom",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
    paint: {
      "icon-opacity": [
        "interpolate",
        ["linear"],
        ["get", "distance_m"],
        0,
        0.9,
        SEARCH_RADIUS_METERS,
        0.6,
      ],
    },
  });

  map.addLayer({
    id: "hover-connector-casing",
    type: "line",
    source: "hover-connector",
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#ffffff",
      "line-width": 9,
      "line-opacity": 0.95,
      "line-dasharray": [0.1, 1.25],
    },
  });

  map.addLayer({
    id: "hover-connector-line",
    type: "line",
    source: "hover-connector",
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#f97316",
      "line-width": 5,
      "line-opacity": 0.9,
      "line-dasharray": [0.1, 1.25],
    },
  });

  map.addSource("clicked-location", {
    type: "geojson",
    data: emptyFeatureCollection(),
  });

  map.addLayer({
    id: "clicked-location-point",
    type: "circle",
    source: "clicked-location",
    paint: {
      "circle-color": "#f97316",
      "circle-radius": 8,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 3,
    },
  });

  const hoverPopup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 12,
  });

  map.on("mouseenter", "inspection-points", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mousemove", "inspection-points", (event) => {
    const feature = event.features?.[0];
    if (!feature) return;

    const properties = feature.properties;
    const restaurantPoint = feature.geometry.coordinates;

    if (selectedPoint) {
      map.getSource("hover-connector").setData({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [selectedPoint, restaurantPoint],
        },
        properties: {},
      });
    }

    hoverPopup
      .setLngLat(restaurantPoint)
      .setHTML(`
        <div class="inspection-popup">
          <strong>${escapeHtml(properties.restaurant_name)}</strong>
          <span>${escapeHtml(properties.business_address)}</span>
          <span>Latest inspection: ${escapeHtml(properties.inspected_on)}</span>
          <span>${Number(properties.distance_m).toLocaleString()} m from selected point</span>
        </div>
      `)
      .addTo(map);
  });

  map.on("mouseleave", "inspection-points", () => {
    map.getCanvas().style.cursor = "";
    hoverPopup.remove();
    map.getSource("hover-connector").setData(emptyFeatureCollection());
  });

  map.on("click", (event) => {
    const restaurantHits = map.queryRenderedFeatures(event.point, {
      layers: ["inspection-points"],
    });
    if (restaurantHits.length > 0) return;

    const point = [event.lngLat.lng, event.lngLat.lat];
    selectLocation(point);
  });

  const savedPoint = loadSelectedPoint();
  if (savedPoint) {
    selectLocation(savedPoint, { animate: false });
  }
});
