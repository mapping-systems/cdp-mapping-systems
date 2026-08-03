const statusElement = document.querySelector("#map-status");
const categoryButtons = [...document.querySelectorAll("[data-category]")];
const resetMapButton = document.querySelector("#reset-map");
const resourceTotalElement = document.querySelector("#resource-total");
const modeButtons = [...document.querySelectorAll("[data-mode]")];
const resourcePanels = [...document.querySelectorAll("[data-resource-panel]")];
const neighborhoodPanels = [
  ...document.querySelectorAll("[data-neighborhood-panel]"),
];
const activeCategories = new Set(
  categoryButtons.map((button) => button.dataset.category),
);
let resourceData = null;
let neighborhoodData = null;
let mapMode = "resources";

const colors = {
  learn: "#68b7df",
  experience: "#d890db",
  make: "#e3aa62",
  connect: "#c8da69",
};

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/dark",
  center: [-73.97, 40.71],
  zoom: 9.7,
  clickTolerance: 6,
  attributionControl: false,
});

map.addControl(new maplibregl.NavigationControl(), "top-right");
map.addControl(
  new maplibregl.AttributionControl({ compact: true }),
  "bottom-right",
);

function fitToFeatures(features, animate = true) {
  if (!features.length) return;
  const bounds = new maplibregl.LngLatBounds();
  features.forEach((feature) => bounds.extend(feature.geometry.coordinates));
  const narrowScreen = window.innerWidth < 700;
  map.fitBounds(bounds, {
    padding: narrowScreen
      ? { top: 180, right: 36, bottom: 230, left: 36 }
      : { top: 76, right: 60, bottom: 60, left: 360 },
    maxZoom: 10.5,
    duration: animate ? 650 : 0,
  });
}

function updateFilter() {
  if (!resourceData) return;
  const visibleFeatures = resourceData.features.filter((feature) =>
    activeCategories.has(feature.properties.category),
  );
  map.getSource("design-resources").setData({
    type: "FeatureCollection",
    features: visibleFeatures,
  });
  fitToFeatures(visibleFeatures);
  statusElement.textContent = `${visibleFeatures.length} visible resources · ${activeCategories.size} active categories`;
}

function setMapMode(mode) {
  mapMode = mode;
  modeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  });
  resourcePanels.forEach((panel) => {
    panel.hidden = mode !== "resources";
  });
  neighborhoodPanels.forEach((panel) => {
    panel.hidden = mode !== "neighborhoods";
  });

  if (!map.getLayer("resource-points")) return;
  map.setLayoutProperty(
    "resource-points",
    "visibility",
    mode === "resources" ? "visible" : "none",
  );
  map.setLayoutProperty(
    "neighborhood-fill",
    "visibility",
    mode === "neighborhoods" ? "visible" : "none",
  );
  map.setLayoutProperty(
    "neighborhood-outline",
    "visibility",
    mode === "neighborhoods" ? "visible" : "none",
  );
  fitToFeatures(resourceData.features);

  if (mode === "neighborhoods") {
    const analysis = neighborhoodData.analysis;
    statusElement.textContent = `${analysis.neighborhoods_with_resources} of ${analysis.neighborhood_total} neighborhoods contain documented resources`;
  } else {
    updateFilter();
  }
}

map.on("load", async () => {
  const [dataResponse, summaryResponse, neighborhoodResponse] = await Promise.all([
    fetch("data/processed/design-resources.geojson"),
    fetch("data/processed/summary.json"),
    fetch("data/processed/neighborhood-resource-analysis.geojson"),
  ]);
  resourceData = await dataResponse.json();
  const summary = await summaryResponse.json();
  neighborhoodData = await neighborhoodResponse.json();
  resourceTotalElement.textContent = summary.total;
  document.querySelector("#neighborhoods-with-resources").textContent =
    `${neighborhoodData.analysis.neighborhoods_with_resources} / ${neighborhoodData.analysis.neighborhood_total}`;
  document.querySelector("#neighborhood-average").textContent =
    `${neighborhoodData.analysis.city_average} resources`;
  Object.entries(summary.categories).forEach(([category, count]) => {
    const countElement = document.querySelector(`[data-count="${category}"]`);
    const barElement = document.querySelector(`[data-bar="${category}"]`);
    if (countElement) countElement.textContent = count;
    if (barElement) {
      barElement.style.setProperty("--bar-width", `${(count / summary.total) * 100}%`);
      barElement.style.setProperty("--category-color", colors[category]);
    }
  });

  map.addSource("design-resources", {
    type: "geojson",
    data: resourceData,
  });

  map.addSource("neighborhood-analysis", {
    type: "geojson",
    data: neighborhoodData,
  });

  map.addLayer({
    id: "neighborhood-fill",
    type: "fill",
    source: "neighborhood-analysis",
    layout: { visibility: "none" },
    paint: {
      "fill-color": [
        "step",
        ["get", "resource_total"],
        "#1a2326",
        1,
        "#3b4b42",
        3,
        "#667548",
        6,
        "#9cae55",
        11,
        "#d9e875",
      ],
      "fill-opacity": [
        "case",
        ["==", ["get", "resource_total"], 0],
        0.28,
        0.78,
      ],
    },
  });

  map.addLayer({
    id: "neighborhood-outline",
    type: "line",
    source: "neighborhood-analysis",
    layout: { visibility: "none" },
    paint: {
      "line-color": "rgba(230, 238, 230, 0.38)",
      "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.45, 13, 1.2],
    },
  });

  map.addLayer({
    id: "resource-points",
    type: "circle",
    source: "design-resources",
    paint: {
      "circle-color": [
        "match",
        ["get", "category"],
        "learn",
        colors.learn,
        "experience",
        colors.experience,
        "make",
        colors.make,
        "connect",
        colors.connect,
        "#ffffff",
      ],
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 6, 14, 10],
      "circle-stroke-color": "#0c1115",
      "circle-stroke-width": 1.5,
    },
  });

  map.on("click", "resource-points", (event) => {
    const feature = event.features[0];
    const properties = feature.properties;
    const website = properties.website
      ? `<a href="${properties.website}" target="_blank" rel="noreferrer">Visit website</a>`
      : "<span class=\"popup-note\">No website listed in the source data</span>";
    const location = [properties.neighborhood, properties.borough]
      .filter(Boolean)
      .join(" · ");
    const address = properties.address
      ? `<p>${properties.address}</p>`
      : "";
    new maplibregl.Popup({ offset: 10 })
      .setLngLat(feature.geometry.coordinates)
      .setHTML(`
        <p class="popup-category">${properties.category}</p>
        <h2>${properties.name}</h2>
        <p>${location}</p>
        ${address}
        <p class="popup-source">Source: ${properties.source}</p>
        ${website}
      `)
      .addTo(map);
  });

  map.on("mouseenter", "resource-points", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "resource-points", () => {
    map.getCanvas().style.cursor = "";
  });

  map.on("click", "neighborhood-fill", (event) => {
    const properties = event.features[0].properties;
    new maplibregl.Popup({ offset: 8 })
      .setLngLat(event.lngLat)
      .setHTML(`
        <p class="popup-category">${properties.borough}</p>
        <h2>${properties.neighborhood}</h2>
        <div class="neighborhood-popup-grid">
          <span>Total resources</span><span>${properties.resource_total}</span>
          <span>Learn</span><span>${properties.learn_count}</span>
          <span>Experience</span><span>${properties.experience_count}</span>
          <span>Make</span><span>${properties.make_count}</span>
          <span>Connect</span><span>${properties.connect_count}</span>
          <span>Share of NYC total</span><span>${properties.city_share_pct}%</span>
        </div>
        <p class="popup-source">${properties.comparison}</p>
      `)
      .addTo(map);
  });

  map.on("mouseenter", "neighborhood-fill", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "neighborhood-fill", () => {
    map.getCanvas().style.cursor = "";
  });

  fitToFeatures(resourceData.features, false);
  statusElement.textContent = `${summary.total} preliminary resources · click a colored point for details`;
});

categoryButtons.forEach((button) => {
  const category = button.dataset.category;
  button.style.setProperty("--category-color", colors[category]);
  button.setAttribute("aria-pressed", "true");
  button.addEventListener("click", () => {
    if (activeCategories.has(category)) {
      activeCategories.delete(category);
    } else {
      activeCategories.add(category);
    }
    button.setAttribute(
      "aria-pressed",
      String(activeCategories.has(category)),
    );
    updateFilter();
  });
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMapMode(button.dataset.mode));
});

resetMapButton.addEventListener("click", () => {
  const visibleFeatures = resourceData
    ? resourceData.features.filter((feature) =>
        activeCategories.has(feature.properties.category),
      )
    : [];
  fitToFeatures(visibleFeatures);
  if (mapMode === "neighborhoods") {
    statusElement.textContent = `${neighborhoodData.analysis.neighborhoods_with_resources} of ${neighborhoodData.analysis.neighborhood_total} neighborhoods contain documented resources`;
  } else {
    statusElement.textContent = `${visibleFeatures.length} visible resources · full NYC extent`;
  }
});
