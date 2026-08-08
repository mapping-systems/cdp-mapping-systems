import * as maplibregl from "https://unpkg.com/maplibre-gl@6.0.0/dist/maplibre-gl.mjs";

const DATA = {
  neighborhoods: "data/nta_hvi.geojson",
  gardens: "data/gardens_hvi.geojson",
  walkBuffers: "data/garden_walk_buffers.geojson",
  openSpace: "data/open_space_simplified.geojson",
  summary: "data/summary.json",
};

const COLORS = {
  paper: "#f3f0e8",
  ink: "#182019",
  parks: "#285e45",
  trust: "#187d8d",
  public: "#7562a8",
  private: "#2a2d2b",
};

const HVI_COLORS = ["#f2dfad", "#edbc72", "#dc8054", "#bd4b43", "#762e3b"];
const DENSITY_COLORS = ["#dfe9de", "#b5d0b5", "#7dac8a", "#477d61", "#174b38"];
const JURISDICTIONS = {
  nyc_parks: { label: "NYC Parks / DPR", color: COLORS.parks },
  land_trust: { label: "Land trust / nonprofit", color: COLORS.trust },
  other_public: { label: "Other public agency", color: COLORS.public },
  private: { label: "Private / other", color: COLORS.private },
};

const FACTOR_MODES = {
  park_adjusted: { riskProperty: "park_adjusted_pressure" },
  surface_temp: { riskProperty: "surface_temp_risk_percentile" },
  greenspace: { riskProperty: "greenspace_risk_percentile" },
  pct_households_ac: { riskProperty: "pct_households_ac_risk_percentile" },
  median_income: { riskProperty: "median_income_risk_percentile" },
  pct_black_pop: { riskProperty: "pct_black_pop_risk_percentile" },
};

const map = new maplibregl.Map({
  container: "map",
  center: [-73.97, 40.71],
  zoom: 9.7,
  minZoom: 8.5,
  maxZoom: 18,
  attributionControl: false,
  style: {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      carto: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
          "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
          "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        ],
        tileSize: 256,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      },
    },
    layers: [
      {
        id: "night-background",
        type: "background",
        paint: { "background-color": "#050707" },
      },
      { id: "basemap", type: "raster", source: "carto" },
    ],
  },
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
map.addControl(new maplibregl.AttributionControl({ compact: true }));

const statusElement = document.querySelector("#map-status");
const hoverTip = document.querySelector("#hover-tip");
const neighborhoodCard = document.querySelector("#neighborhood-card");
const hviLegend = document.querySelector("#hvi-legend");
const densityLegend = document.querySelector("#density-legend");
const factorLegend = document.querySelector("#factor-legend");
const factorLegendNote = document.querySelector("#factor-legend-note");
const greenspaceKey = document.querySelector("#greenspace-key");
const influenceLegend = document.querySelector("#influence-legend");
const focusButton = document.querySelector("#focus-high-hvi");
const mapVariable = document.querySelector("#map-variable");
const layerOpacity = document.querySelector("#layer-opacity");
const layerOpacityValue = document.querySelector("#layer-opacity-value");
const factorProfileBars = document.querySelector("#factor-profile-bars");
let currentMapMode = "hvi";
let currentLayerOpacity = Number(layerOpacity.value) / 100;

const hviFillExpression = [
  "match",
  ["get", "hvi_rank"],
  1,
  HVI_COLORS[0],
  2,
  HVI_COLORS[1],
  3,
  HVI_COLORS[2],
  4,
  HVI_COLORS[3],
  5,
  HVI_COLORS[4],
  "#dedbd2",
];

const monochromeHviExpression = [
  "match",
  ["get", "hvi_rank"],
  1,
  "#d7d7d7",
  2,
  "#a6a6a6",
  3,
  "#757575",
  4,
  "#414141",
  5,
  "#111111",
  "#ececec",
];

const densityFillExpression = [
  "match",
  ["get", "density_class"],
  0,
  DENSITY_COLORS[0],
  1,
  DENSITY_COLORS[1],
  2,
  DENSITY_COLORS[2],
  3,
  DENSITY_COLORS[3],
  4,
  DENSITY_COLORS[4],
  "#e9e7df",
];

function factorFillExpression(property) {
  return [
    "case",
    ["has", property],
    [
      "interpolate",
      ["linear"],
      ["get", property],
      0,
      HVI_COLORS[0],
      25,
      HVI_COLORS[1],
      50,
      HVI_COLORS[2],
      75,
      HVI_COLORS[3],
      100,
      HVI_COLORS[4],
    ],
    "#dedbd2",
  ];
}

const jurisdictionColorExpression = [
  "match",
  ["get", "jurisdiction_group"],
  "nyc_parks",
  COLORS.parks,
  "land_trust",
  COLORS.trust,
  "other_public",
  COLORS.public,
  "private",
  COLORS.private,
  "#6f756f",
];

function formatNumber(value, maximumFractionDigits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString("en-US", { maximumFractionDigits });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadJson(url, errorMessage) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(errorMessage);
  return response.json();
}

function addRiskPercentiles(featureCollection) {
  const metrics = [
    { property: "surface_temp", direction: "high" },
    { property: "greenspace", direction: "low" },
    { property: "pct_households_ac", direction: "low" },
    { property: "median_income", direction: "low" },
    { property: "pct_black_pop", direction: "high" },
    {
      property: "park_coverage_pct",
      direction: "high",
      output: "park_coverage_percentile",
    },
  ];

  metrics.forEach(({ property, direction, output }) => {
    const values = featureCollection.features
      .map((feature) => Number(feature.properties?.[property]))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    featureCollection.features.forEach((feature) => {
      const value = Number(feature.properties?.[property]);
      if (!Number.isFinite(value) || values.length < 2) return;
      const first = values.indexOf(value);
      const last = values.lastIndexOf(value);
      const percentile = (((first + last) / 2) / (values.length - 1)) * 100;
      feature.properties[output || `${property}_risk_percentile`] =
        direction === "high" ? percentile : 100 - percentile;
    });
  });

  const pressureProperties = [
    "surface_temp_risk_percentile",
    "pct_households_ac_risk_percentile",
    "median_income_risk_percentile",
    "pct_black_pop_risk_percentile",
  ];
  featureCollection.features.forEach((feature) => {
    const properties = feature.properties || {};
    const pressureValues = pressureProperties.map((property) =>
      Number(properties[property]),
    );
    const parkRelief = Number(properties.park_coverage_percentile);
    if (!pressureValues.every(Number.isFinite) || !Number.isFinite(parkRelief)) return;

    const pressureSum = pressureValues.reduce((sum, value) => sum + value, 0);
    properties.combined_pressure = pressureSum / pressureValues.length;
    properties.park_adjusted_pressure = Math.min(
      100,
      Math.max(0, (pressureSum - parkRelief) / pressureValues.length),
    );
  });

  return featureCollection;
}

function profileColor(percentile) {
  const index = Math.min(4, Math.max(0, Math.floor(Number(percentile) / 20)));
  return HVI_COLORS[index];
}

function buildFactorProfile(properties) {
  const factors = [
    {
      label: "Surface temperature",
      percentile: properties.surface_temp_risk_percentile,
      value: `${formatNumber(properties.surface_temp, 1)}°F`,
    },
    {
      label: "Limited green cover",
      percentile: properties.greenspace_risk_percentile,
      value: `${formatNumber(properties.greenspace, 1)}%`,
    },
    {
      label: "Limited home AC",
      percentile: properties.pct_households_ac_risk_percentile,
      value: `${formatNumber(properties.pct_households_ac, 1)}%`,
    },
    {
      label: "Lower median income",
      percentile: properties.median_income_risk_percentile,
      value: `$${formatNumber(properties.median_income)}`,
    },
    {
      label: "Structural inequity context",
      percentile: properties.pct_black_pop_risk_percentile,
      value: `${formatNumber(properties.pct_black_pop, 1)}%`,
    },
  ];

  return factors
    .map(({ label, percentile, value }) => {
      const width = Number.isFinite(Number(percentile))
        ? Math.min(100, Math.max(0, Number(percentile)))
        : 0;
      return `
        <div class="profile-row">
          <span class="profile-label">${escapeHtml(label)}</span>
          <span class="profile-track" role="img" aria-label="${escapeHtml(label)}: ${formatNumber(width)}th city risk percentile">
            <span class="profile-fill" style="display:block;width:${width}%;background:${profileColor(width)}"></span>
          </span>
          <span class="profile-value">${escapeHtml(value)}</span>
        </div>
      `;
    })
    .join("");
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function showStatus(message) {
  statusElement.textContent = message;
  statusElement.hidden = false;
}

function hideStatus() {
  statusElement.hidden = true;
}

function hviDescription(rank) {
  return {
    1: "Lower relative heat vulnerability",
    2: "Low–moderate heat vulnerability",
    3: "Moderate heat vulnerability",
    4: "High heat vulnerability",
    5: "Highest relative heat vulnerability",
  }[Number(rank)] || "HVI not available";
}

function buildJurisdictionBars(properties) {
  const counts = Object.entries(JURISDICTIONS).map(([key, metadata]) => ({
    ...metadata,
    count: Number(properties[`${key}_count`]) || 0,
  }));
  const maximum = Math.max(...counts.map(({ count }) => count), 1);

  return counts
    .map(
      ({ label, color, count }) => `
        <div class="bar-row">
          <span>${escapeHtml(label)}</span>
          <span class="bar-track">
            <span class="bar-fill" style="display:block;width:${(count / maximum) * 100}%;background:${color}"></span>
          </span>
          <strong>${count}</strong>
        </div>
      `,
    )
    .join("");
}

function showNeighborhoodCard(properties) {
  setText("#card-kicker", hviDescription(properties.hvi_rank));
  setText("#card-name", properties.hvi_neighborhood || "Unnamed NTA");
  setText("#card-hvi", `${formatNumber(properties.hvi_rank)} / 5`);
  setText("#card-gardens", formatNumber(properties.garden_count));
  setText("#card-density", formatNumber(properties.gardens_per_sq_mile, 1));
  setText("#card-park-coverage", `${formatNumber(properties.park_coverage_pct, 1)}%`);
  setText(
    "#card-adjusted-pressure",
    `${formatNumber(properties.park_adjusted_pressure, 0)} / 100`,
  );
  factorProfileBars.innerHTML = buildFactorProfile(properties);
  document.querySelector("#jurisdiction-bars").innerHTML =
    buildJurisdictionBars(properties);
  neighborhoodCard.hidden = false;
}

function showGardenPopup(feature) {
  const properties = feature.properties || {};
  const jurisdiction = JURISDICTIONS[properties.jurisdiction_group];
  const coordinates = feature.geometry.coordinates.slice();

  new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 9 })
    .setLngLat(coordinates)
    .setHTML(`
      <div class="garden-popup-name">${escapeHtml(properties.garden_name || "Unnamed garden")}</div>
      <div class="garden-popup-meta">${escapeHtml(properties.address || "Address not recorded")}</div>
      <div class="garden-popup-meta">${escapeHtml(properties.hvi_neighborhood || "NTA not assigned")} · HVI ${escapeHtml(properties.hvi_rank || "—")}</div>
      <div class="garden-popup-meta">Land: ${escapeHtml(jurisdiction?.label || properties.jurisdiction || "Not recorded")}</div>
    `)
    .addTo(map);
}

function updateGardenFilter() {
  if (!map.getLayer("gardens")) return;
  const selected = [...document.querySelectorAll(".filter-row input:checked")].map(
    (input) => input.value,
  );
  map.setFilter("gardens", [
    "in",
    ["get", "jurisdiction_group"],
    ["literal", selected],
  ]);
  map.setFilter("garden-labels", [
    "in",
    ["get", "jurisdiction_group"],
    ["literal", selected],
  ]);
  map.setFilter("garden-glow", [
    "in",
    ["get", "jurisdiction_group"],
    ["literal", selected],
  ]);
  for (const ring of ["outer", "middle", "inner"]) {
    map.setFilter(`walk-catchment-${ring}`, [
      "all",
      ["==", ["get", "ring"], ring],
      ["in", ["get", "jurisdiction_group"], ["literal", selected]],
    ]);
  }
  map.setFilter("walk-catchment-edge", [
    "all",
    ["==", ["get", "ring"], "outer"],
    ["in", ["get", "jurisdiction_group"], ["literal", selected]],
  ]);
}

function updateMapMode(mode) {
  if (!map.getLayer("nta-fill")) return;
  currentMapMode = mode;
  const factorMode = FACTOR_MODES[mode];
  const isOpenSpace = mode === "open_space";
  const isGardenInfluence = mode === "garden_influence";
  const isParkAdjusted = mode === "park_adjusted";

  map.setPaintProperty(
    "nta-fill",
    "fill-color",
    isGardenInfluence
      ? monochromeHviExpression
      : mode === "density"
      ? densityFillExpression
      : factorMode
        ? factorFillExpression(factorMode.riskProperty)
        : hviFillExpression,
  );

  const focusing = focusButton.dataset.active === "true";
  map.setPaintProperty(
    "nta-fill",
    "fill-opacity",
    isOpenSpace
      ? 0.14
      : isGardenInfluence
        ? 0.9
      : focusing
        ? [
            "case",
            [">=", ["get", "hvi_rank"], 4],
            currentLayerOpacity,
            Math.max(0.06, currentLayerOpacity * 0.13),
          ]
        : currentLayerOpacity,
  );
  map.setPaintProperty(
    "open-space-fill",
    "fill-opacity",
    isOpenSpace
      ? currentLayerOpacity
      : isParkAdjusted
        ? currentLayerOpacity * 0.34
      : 0,
  );
  map.setPaintProperty(
    "open-space-outline",
    "line-opacity",
    isOpenSpace ? Math.min(0.9, currentLayerOpacity + 0.12) : isParkAdjusted ? 0.34 : 0,
  );

  const catchmentOpacity = isGardenInfluence ? currentLayerOpacity : 0;
  map.setPaintProperty("walk-catchment-outer", "fill-opacity", catchmentOpacity * 0.055);
  map.setPaintProperty("walk-catchment-middle", "fill-opacity", catchmentOpacity * 0.085);
  map.setPaintProperty("walk-catchment-inner", "fill-opacity", catchmentOpacity * 0.13);
  map.setPaintProperty("walk-catchment-edge", "line-opacity", catchmentOpacity * 0.16);
  map.setPaintProperty("garden-glow", "circle-opacity", isGardenInfluence ? 0.72 : 0);

  map.setPaintProperty(
    "gardens",
    "circle-color",
    isGardenInfluence ? "#ffffff" : jurisdictionColorExpression,
  );
  map.setPaintProperty(
    "gardens",
    "circle-stroke-color",
    isGardenInfluence ? "rgba(255,255,255,0.92)" : COLORS.paper,
  );
  map.setPaintProperty(
    "gardens",
    "circle-opacity",
    isGardenInfluence ? 0.98 : focusing
      ? ["case", [">=", ["get", "hvi_rank"], 4], 0.96, 0.13]
      : 0.9,
  );
  map.setLayoutProperty("garden-labels", "visibility", isGardenInfluence ? "none" : "visible");
  map.setPaintProperty(
    "nta-outline",
    "line-color",
    isGardenInfluence ? "rgba(255,255,255,0.24)" : "rgba(24,32,25,0.32)",
  );
  map.setPaintProperty(
    "nta-labels",
    "text-color",
    isGardenInfluence ? "#ffffff" : COLORS.ink,
  );
  map.setPaintProperty(
    "nta-labels",
    "text-halo-color",
    isGardenInfluence ? "#111111" : COLORS.paper,
  );

  hviLegend.hidden = mode !== "hvi";
  densityLegend.hidden = mode !== "density";
  factorLegend.hidden = !factorMode;
  factorLegendNote.textContent = isParkAdjusted
    ? "Equal-weight exploratory score · four risk layers minus formal park coverage"
    : "City percentile · all factors point toward higher vulnerability";
  greenspaceKey.hidden = !isOpenSpace && !isParkAdjusted;
  influenceLegend.hidden = !isGardenInfluence;
  focusButton.hidden = isOpenSpace || isGardenInfluence;
}

function toggleHighHviFocus() {
  const focusing = focusButton.dataset.active !== "true";
  focusButton.dataset.active = String(focusing);
  focusButton.textContent = focusing ? "Show all HVI levels" : "Focus HVI 4–5";
  updateMapMode(currentMapMode);
  if (map.getLayer("gardens")) {
    map.setPaintProperty(
      "gardens",
      "circle-opacity",
      focusing
        ? ["case", [">=", ["get", "hvi_rank"], 4], 0.96, 0.13]
        : 0.9,
    );
  }
}

function updateSummary(summary) {
  setText("#mapped-count", formatNumber(summary.mapped_gardens));
  setText("#high-hvi-count", formatNumber(summary.gardens_in_high_hvi));
  setText("#neighborhood-count", formatNumber(summary.neighborhoods_with_gardens));
  setText(
    "#high-hvi-share",
    `${formatNumber((summary.gardens_in_high_hvi / summary.mapped_gardens) * 100, 0)}%`,
  );
  setText("#count-nyc-parks", formatNumber(summary.jurisdiction_counts.nyc_parks));
  setText("#count-land-trust", formatNumber(summary.jurisdiction_counts.land_trust));
  setText(
    "#count-other-public",
    formatNumber(summary.jurisdiction_counts.other_public),
  );
  setText("#count-private", formatNumber(summary.jurisdiction_counts.private));
}

function bindMapInteractions() {
  map.on("mouseenter", "nta-fill", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mousemove", "nta-fill", (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    const properties = feature.properties || {};
    hoverTip.innerHTML = `
      <strong>${escapeHtml(properties.hvi_neighborhood)}</strong>
      <span>HVI ${escapeHtml(properties.hvi_rank)} · ${escapeHtml(properties.garden_count)} gardens · ${formatNumber(properties.gardens_per_sq_mile, 1)} / sq. mi.</span>
    `;
    hoverTip.style.left = `${Math.min(event.point.x + 15, map.getContainer().clientWidth - 260)}px`;
    hoverTip.style.top = `${Math.max(event.point.y - 10, 10)}px`;
    hoverTip.hidden = false;
  });

  map.on("mouseleave", "nta-fill", () => {
    map.getCanvas().style.cursor = "";
    hoverTip.hidden = true;
  });

  map.on("click", (event) => {
    const features = map.queryRenderedFeatures(event.point, {
      layers: ["gardens", "nta-fill"],
    });
    const garden = features.find((feature) => feature.layer.id === "gardens");
    if (garden) {
      showGardenPopup(garden);
      return;
    }

    const neighborhood = features.find((feature) => feature.layer.id === "nta-fill");
    if (neighborhood) {
      showNeighborhoodCard(neighborhood.properties || {});
    }
  });
}

let mapInitialized = false;

async function initializeMap() {
  if (mapInitialized) return;
  mapInitialized = true;

  try {
    const [neighborhoodData, gardenData, summary] = await Promise.all([
      loadJson(DATA.neighborhoods, "Neighborhood data could not be loaded."),
      loadJson(DATA.gardens, "Garden data could not be loaded."),
      loadJson(DATA.summary, "Summary data could not be loaded."),
    ]);
    addRiskPercentiles(neighborhoodData);

    map.addSource("neighborhoods", {
      type: "geojson",
      data: neighborhoodData,
      generateId: true,
    });
    map.addLayer({
      id: "nta-fill",
      type: "fill",
      source: "neighborhoods",
      paint: {
        "fill-color": hviFillExpression,
        "fill-opacity": 0.72,
        "fill-outline-color": "rgba(255,255,255,0.72)",
      },
    });
    map.addLayer({
      id: "nta-outline",
      type: "line",
      source: "neighborhoods",
      paint: {
        "line-color": "rgba(24,32,25,0.32)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.35, 13, 1],
      },
    });

    map.addSource("open-space-source", {
      type: "geojson",
      data: DATA.openSpace,
      generateId: true,
    });
    map.addLayer({
      id: "open-space-fill",
      type: "fill",
      source: "open-space-source",
      paint: {
        "fill-color": "#4f8b54",
        "fill-opacity": 0,
        "fill-outline-color": "#285e45",
      },
    });
    map.addLayer({
      id: "open-space-outline",
      type: "line",
      source: "open-space-source",
      minzoom: 10,
      paint: {
        "line-color": "#285e45",
        "line-opacity": 0,
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.35, 15, 1.1],
      },
    });

    map.addSource("walk-catchments-source", {
      type: "geojson",
      data: DATA.walkBuffers,
      generateId: true,
    });
    for (const ring of ["outer", "middle", "inner"]) {
      map.addLayer({
        id: `walk-catchment-${ring}`,
        type: "fill",
        source: "walk-catchments-source",
        filter: ["==", ["get", "ring"], ring],
        paint: {
          "fill-color": "#ffffff",
          "fill-opacity": 0,
        },
      });
    }
    map.addLayer({
      id: "walk-catchment-edge",
      type: "line",
      source: "walk-catchments-source",
      filter: ["==", ["get", "ring"], "outer"],
      paint: {
        "line-color": "#ffffff",
        "line-opacity": 0,
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.25, 14, 0.8],
      },
    });
    map.addLayer({
      id: "nta-labels",
      type: "symbol",
      source: "neighborhoods",
      minzoom: 11.6,
      layout: {
        "text-field": ["get", "hvi_neighborhood"],
        "text-font": ["Open Sans Regular"],
        "text-size": 10,
        "text-max-width": 9,
      },
      paint: {
        "text-color": COLORS.ink,
        "text-halo-color": COLORS.paper,
        "text-halo-width": 1.3,
      },
    });

    map.addSource("gardens-source", {
      type: "geojson",
      data: gardenData,
      generateId: true,
    });
    map.addLayer({
      id: "garden-glow",
      type: "circle",
      source: "gardens-source",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 8, 14, 22],
        "circle-color": "#ffffff",
        "circle-blur": 0.9,
        "circle-opacity": 0,
      },
    });
    map.addLayer({
      id: "gardens",
      type: "circle",
      source: "gardens-source",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2.2, 14, 5],
        "circle-color": jurisdictionColorExpression,
        "circle-opacity": 0.9,
        "circle-stroke-color": COLORS.paper,
        "circle-stroke-width": 0.9,
      },
    });
    map.addLayer({
      id: "garden-labels",
      type: "symbol",
      source: "gardens-source",
      minzoom: 14,
      layout: {
        "text-field": ["get", "garden_name"],
        "text-font": ["Open Sans Semibold"],
        "text-size": 10.5,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
      },
      paint: {
        "text-color": COLORS.ink,
        "text-halo-color": COLORS.paper,
        "text-halo-width": 1.3,
      },
    });

    bindMapInteractions();
    updateSummary(summary);
    updateMapMode(mapVariable.value);
    hideStatus();
  } catch (error) {
    console.error(error);
    showStatus("The HVI map data could not be loaded. Open this project through a local server.");
  }
}

if (map.isStyleLoaded()) {
  initializeMap();
} else {
  map.once("style.load", initializeMap);
}

mapVariable.addEventListener("change", () => updateMapMode(mapVariable.value));

layerOpacity.addEventListener("input", () => {
  currentLayerOpacity = Number(layerOpacity.value) / 100;
  layerOpacityValue.value = `${layerOpacity.value}%`;
  updateMapMode(currentMapMode);
});

document.querySelectorAll(".filter-row input").forEach((input) => {
  input.addEventListener("change", updateGardenFilter);
});

focusButton.addEventListener("click", toggleHighHviFocus);

document.querySelector("#close-card").addEventListener("click", () => {
  neighborhoodCard.hidden = true;
});
