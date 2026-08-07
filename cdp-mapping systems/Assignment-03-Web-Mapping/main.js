const DATA_URL = "data/ip_locations.geojson";

const MET_LOCATION = {
  type: "Feature",
  properties: {
    name: "The Metropolitan Museum of Art",
    address: "1000 Fifth Avenue, New York, NY",
  },
  geometry: {
    type: "Point",
    coordinates: [-73.9632, 40.7794],
  },
};

const CATEGORY_COLORS = {
  first_party: "#d40032",
  analytics: "#0057b8",
  advertising: "#ff8a00",
  social_tracking: "#7c3aed",
  infrastructure: "#5d665f",
};

const map = new maplibregl.Map({
  container: "map",
  style: "https://demotiles.maplibre.org/style.json",
  center: [-98, 39],
  zoom: 3.1,
  minZoom: 1.5,
});

map.addControl(
  new maplibregl.NavigationControl({
    showCompass: false,
  }),
  "top-right"
);

map.addControl(
  new maplibregl.FullscreenControl(),
  "top-right"
);

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createConnectionLines(features) {
  return {
    type: "FeatureCollection",
    features: features.map((feature) => ({
      type: "Feature",
      properties: {
        ip: feature.properties.ip,
      },
      geometry: {
        type: "LineString",
        coordinates: [
          MET_LOCATION.geometry.coordinates,
          feature.geometry.coordinates,
        ],
      },
    })),
  };
}

function createPopupHTML(properties) {
  const domains = Array.isArray(properties.domains)
    ? properties.domains.join(", ")
    : properties.domains;

  return `
    <div class="popup-title">
      ${escapeHTML(properties.primary_domain)}
    </div>

    <div class="popup-label">Category</div>
    <div class="popup-value">
      ${escapeHTML(properties.category_label)}
    </div>

    <div class="popup-label">Approximate location</div>
    <div class="popup-value">
      ${escapeHTML(properties.location_label)}
    </div>

    <div class="popup-label">Organization</div>
    <div class="popup-value">
      ${escapeHTML(properties.organization)}
    </div>

    <div class="popup-label">Server IP</div>
    <div class="popup-value">
      ${escapeHTML(properties.ip)}
    </div>

    <div class="popup-label">Requests in HAR</div>
    <div class="popup-value">
      ${escapeHTML(properties.request_count)}
    </div>

    <div class="popup-label">Domains</div>
    <div class="popup-value">
      ${escapeHTML(domains)}
    </div>

    <div class="popup-label">Representative URL</div>
    <div class="popup-value">
      ${escapeHTML(properties.display_url)}
    </div>
  `;
}

async function initializeMap() {
  const response = await fetch(DATA_URL);

  if (!response.ok) {
    throw new Error(
      `Could not load ${DATA_URL}: ${response.status}`
    );
  }

  const data = await response.json();
  const metadata = data.metadata || {};

  document.getElementById("request-count").textContent =
    metadata.total_request_count ?? "600";
  document.getElementById("ip-count").textContent =
    data.features.length;
  document.getElementById("domain-count").textContent =
    metadata.unique_domain_count ?? "52";

  map.addSource("connections", {
    type: "geojson",
    data: createConnectionLines(data.features),
  });

  map.addLayer({
    id: "connections-layer",
    type: "line",
    source: "connections",
    paint: {
      "line-color": "#d40032",
      "line-width": 0.7,
      "line-opacity": 0.17,
    },
  });

  map.addSource("server-locations", {
    type: "geojson",
    data,
    cluster: true,
    clusterMaxZoom: 8,
    clusterRadius: 52,
  });

  map.addLayer({
    id: "server-clusters",
    type: "circle",
    source: "server-locations",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#161616",
      "circle-radius": [
        "step",
        ["get", "point_count"],
        15,
        5,
        19,
        10,
        24,
        20,
        30,
      ],
      "circle-stroke-color": "#f2efe8",
      "circle-stroke-width": 2,
      "circle-opacity": 0.92,
    },
  });

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "server-locations",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 11,
    },
    paint: {
      "text-color": "#f2efe8",
    },
  });

  map.addLayer({
    id: "server-points",
    type: "circle",
    source: "server-locations",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["get", "request_count"],
        1,
        5,
        20,
        8,
        60,
        13,
        183,
        22,
      ],
      "circle-color": [
        "match",
        ["get", "category"],
        "first_party",
        CATEGORY_COLORS.first_party,
        "analytics",
        CATEGORY_COLORS.analytics,
        "advertising",
        CATEGORY_COLORS.advertising,
        "social_tracking",
        CATEGORY_COLORS.social_tracking,
        CATEGORY_COLORS.infrastructure,
      ],
      "circle-stroke-color": "#f2efe8",
      "circle-stroke-width": 1.5,
      "circle-opacity": 0.9,
    },
  });

  map.addSource("physical-museum", {
    type: "geojson",
    data: MET_LOCATION,
  });

  map.addLayer({
    id: "physical-museum-layer",
    type: "circle",
    source: "physical-museum",
    paint: {
      "circle-radius": 7,
      "circle-color": "#161616",
      "circle-stroke-color": "#f2efe8",
      "circle-stroke-width": 2,
    },
  });

  map.addLayer({
    id: "physical-museum-label",
    type: "symbol",
    source: "physical-museum",
    layout: {
      "text-field": "THE MET",
      "text-offset": [0, 1.5],
      "text-size": 11,
      "text-letter-spacing": 0.08,
    },
    paint: {
      "text-color": "#161616",
      "text-halo-color": "#f2efe8",
      "text-halo-width": 1.5,
    },
  });

  const bounds = new maplibregl.LngLatBounds();
  bounds.extend(MET_LOCATION.geometry.coordinates);

  data.features.forEach((feature) => {
    bounds.extend(feature.geometry.coordinates);
  });

  map.fitBounds(bounds, {
    padding: 55,
    maxZoom: 4.4,
  });

  map.on("click", "server-clusters", async (event) => {
    const feature = map.queryRenderedFeatures(event.point, {
      layers: ["server-clusters"],
    })[0];

    const clusterId = feature.properties.cluster_id;

    const zoom = await map
      .getSource("server-locations")
      .getClusterExpansionZoom(clusterId);

    map.easeTo({
      center: feature.geometry.coordinates,
      zoom,
    });
  });

  map.on("click", "server-points", (event) => {
    const feature = event.features[0];

    new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: "360px",
    })
      .setLngLat(feature.geometry.coordinates)
      .setHTML(createPopupHTML(feature.properties))
      .addTo(map);
  });

  map.on("click", "physical-museum-layer", () => {
    new maplibregl.Popup({
      maxWidth: "300px",
    })
      .setLngLat(MET_LOCATION.geometry.coordinates)
      .setHTML(`
        <div class="popup-title">The Metropolitan Museum of Art</div>
        <div class="popup-label">Physical location</div>
        <div class="popup-value">
          1000 Fifth Avenue, New York, NY
        </div>
      `)
      .addTo(map);
  });

  [
    "server-clusters",
    "server-points",
    "physical-museum-layer",
  ].forEach((layerId) => {
    map.on("mouseenter", layerId, () => {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
    });
  });
}

map.on("load", () => {
  initializeMap().catch((error) => {
    console.error(error);

    document.querySelector(".map-caption").textContent =
      "Could not load the GeoJSON. Open this folder with Live Server.";
  });
});

document
  .getElementById("connection-toggle")
  .addEventListener("change", (event) => {
    if (!map.getLayer("connections-layer")) {
      return;
    }

    map.setLayoutProperty(
      "connections-layer",
      "visibility",
      event.target.checked ? "visible" : "none"
    );
  });
