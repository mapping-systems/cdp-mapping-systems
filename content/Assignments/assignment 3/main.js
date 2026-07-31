const DATA_URL = "outputs/ip_locations.geojson";
const DEFAULT_VIEW = { center: [-98, 38], zoom: 2.4 };

const map = new maplibregl.Map({
  container: "map",
  style: "https://demotiles.maplibre.org/style.json",
  center: DEFAULT_VIEW.center,
  zoom: DEFAULT_VIEW.zoom,
  attributionControl: true
});

map.addControl(new maplibregl.NavigationControl(), "top-right");
map.addControl(new maplibregl.FullscreenControl(), "top-right");

const statusEl = document.getElementById("status");
const requestCountEl = document.getElementById("request-count");
const locationCountEl = document.getElementById("location-count");
const resetButton = document.getElementById("reset-view");

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function uniqueCoordinateCount(features) {
  return new Set(features.map((f) => f.geometry.coordinates.join(","))).size;
}

function fitToData(features) {
  if (!features.length) return;
  const bounds = new maplibregl.LngLatBounds();
  features.forEach((feature) => bounds.extend(feature.geometry.coordinates));
  map.fitBounds(bounds, { padding: 70, maxZoom: 5.5, duration: 900 });
}

async function loadData() {
  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error(`Could not load ${DATA_URL}`);
  return response.json();
}

map.on("load", async () => {
  try {
    const data = await loadData();
    const features = (data.features || []).filter(
      (f) => f.geometry && f.geometry.type === "Point" && Array.isArray(f.geometry.coordinates)
    );

    requestCountEl.textContent = features.length;
    locationCountEl.textContent = uniqueCoordinateCount(features);

    map.addSource("requests", {
      type: "geojson",
      data: { type: "FeatureCollection", features },
      cluster: true,
      clusterMaxZoom: 8,
      clusterRadius: 48
    });

    map.addLayer({
      id: "request-clusters",
      type: "circle",
      source: "requests",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#183c55",
        "circle-radius": ["step", ["get", "point_count"], 18, 8, 24, 20, 31],
        "circle-stroke-width": 2,
        "circle-stroke-color": "rgba(255,255,255,0.88)"
      }
    });

    map.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: "requests",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 12
      },
      paint: { "text-color": "#ffffff" }
    });

    map.addLayer({
      id: "request-points",
      type: "circle",
      source: "requests",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 5, 8, 8],
        "circle-color": "#ef5b3f",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.9
      }
    });

    map.on("click", "request-clusters", async (event) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: ["request-clusters"] })[0];
      if (!feature) return;
      const clusterId = feature.properties.cluster_id;
      const zoom = await map.getSource("requests").getClusterExpansionZoom(clusterId);
      map.easeTo({ center: feature.geometry.coordinates, zoom });
    });

    map.on("click", "request-points", (event) => {
      const feature = event.features[0];
      const ip = escapeHTML(feature.properties.ip || "Unknown IP");
      const url = escapeHTML(feature.properties.url || "No URL available");

      new maplibregl.Popup({ offset: 12, maxWidth: "340px" })
        .setLngLat(feature.geometry.coordinates)
        .setHTML(`<p class="popup-ip">${ip}</p><p class="popup-url">${url}</p>`)
        .addTo(map);
    });

    ["request-clusters", "request-points"].forEach((layer) => {
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
    });

    fitToData(features);
    statusEl.classList.add("is-hidden");
  } catch (error) {
    console.error(error);
    statusEl.textContent = "GeoJSON could not be loaded. Open this project with Live Server.";
    statusEl.classList.add("is-error");
  }
});

resetButton.addEventListener("click", () => {
  const source = map.getSource("requests");
  if (source && source._data && source._data.features) {
    fitToData(source._data.features);
  } else {
    map.flyTo({ center: DEFAULT_VIEW.center, zoom: DEFAULT_VIEW.zoom });
  }
});
