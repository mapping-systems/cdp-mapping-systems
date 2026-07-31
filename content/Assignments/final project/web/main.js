const METRICS = {
  network_m: { title: "Nearest door-to-door distance", low: "Shorter", high: "Longer", suffix: " m" },
  detour_index: { title: "Detour index", low: "Low", high: "High" },
  network_store_count_10min: { title: "Stores within 10 minutes", low: "Fewer", high: "More", reverse: true },
  buffer_overcount: { title: "Euclidean buffer overcount", low: "Low", high: "High" },
  allocation_difference_pct: { title: "Allocation-method disagreement", low: "Negative", high: "Positive", diverging: true, suffix: "%" },
  known_capacity_pressure: { title: "Known-capacity pressure", low: "Low", high: "High" },
  priority_balanced: { title: "Balanced priority", low: "Low", high: "High" },
  priority_demand_focused: { title: "Demand-focused priority", low: "Low", high: "High" },
  priority_access_focused: { title: "Access-focused priority", low: "Low", high: "High" },
  priority_index: { title: "Robust priority mean", low: "Low", high: "High" },
  priority_rank_spread: { title: "Priority rank sensitivity", low: "Stable", high: "Sensitive" },
  closure_increase_min: { title: "Maximum closure impact", low: "Low", high: "High", suffix: " min" },
};

const map = new maplibregl.Map({
  container: "map",
  style: "https://demotiles.maplibre.org/style.json",
  center: [-73.947, 40.835],
  zoom: 11.5,
});

map.addControl(new maplibregl.NavigationControl(), "top-right");
map.addControl(new maplibregl.FullscreenControl(), "top-right");

const status = document.getElementById("status");
const select = document.getElementById("metric-select");
const storesToggle = document.getElementById("stores-toggle");
const closureToggle = document.getElementById("closure-toggle");
const routesToggle = document.getElementById("routes-toggle");
let metricDomains = {};

function numericValues(features, field) {
  return features
    .map((feature) => Number(feature.properties[field]))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
}

function quantile(values, probability) {
  if (!values.length) return 0;
  const index = (values.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return values[lower];
  return values[lower] + (values[upper] - values[lower]) * (index - lower);
}

function calculateDomains(features) {
  Object.keys(METRICS).forEach((field) => {
    const values = numericValues(features, field);
    let min = quantile(values, 0.02);
    let max = quantile(values, 0.98);
    if (METRICS[field].diverging) {
      const extent = Math.max(Math.abs(min), Math.abs(max));
      min = -extent;
      max = extent;
    }
    if (min === max) max = min + 1;
    metricDomains[field] = { min, max };
  });
}

function colorExpression(metricName) {
  const metric = METRICS[metricName];
  const domain = metricDomains[metricName] || { min: 0, max: 1 };
  if (metric.diverging) {
    return [
      "interpolate", ["linear"], ["coalesce", ["to-number", ["get", metricName]], 0],
      domain.min, "#2166ac",
      0, "#f7f7f7",
      domain.max, "#b2182b",
    ];
  }
  const colors = metric.reverse
    ? ["#7f0000", "#e34a33", "#fdbb84", "#fff7ec"]
    : ["#fff7ec", "#fdbb84", "#e34a33", "#7f0000"];
  return [
    "interpolate", ["linear"], ["coalesce", ["to-number", ["get", metricName]], domain.min],
    domain.min, colors[0],
    domain.min + (domain.max - domain.min) * 0.33, colors[1],
    domain.min + (domain.max - domain.min) * 0.66, colors[2],
    domain.max, colors[3],
  ];
}

function formatValue(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function updateLegend(metricName) {
  const metric = METRICS[metricName];
  const domain = metricDomains[metricName] || { min: 0, max: 1 };
  document.getElementById("legend-title").textContent = metric.title;
  document.getElementById("legend-min").textContent = `${formatValue(domain.min)}${metric.suffix || ""}`;
  document.getElementById("legend-max").textContent = `${formatValue(domain.max)}${metric.suffix || ""}`;
  const legendBar = document.querySelector(".legend-bar");
  legendBar.classList.toggle("diverging", Boolean(metric.diverging));
  legendBar.classList.toggle("reverse", Boolean(metric.reverse));
}

function setSummary(summaryPayload) {
  const summary = summaryPayload.summary || {};
  document.getElementById("summary-cells").textContent = formatValue(summary["H3 cells"], 0);
  document.getElementById("summary-units").textContent = formatValue(summary["Residential units represented"], 0);
  document.getElementById("summary-distance").textContent = `${formatValue(summary["Unit-weighted nearest network distance (m)"], 0)} m`;
  document.getElementById("summary-overcount").textContent = formatValue(summary["Unit-weighted circular-buffer overcount"], 1);
}

map.on("load", async () => {
  try {
    const responses = await Promise.all([
      fetch("data/access_cells.geojson"),
      fetch("data/stores.geojson"),
      fetch("data/study_core.geojson"),
      fetch("data/closure_stores.geojson"),
      fetch("data/representative_routes.geojson"),
      fetch("data/summary.json"),
    ]);
    if (!responses.every((response) => response.ok)) {
      throw new Error("Project exports are missing. Run the notebook through the export cell first.");
    }
    const [cells, stores, core, closures, routes, summary] = await Promise.all(
      responses.map((response) => response.json())
    );

    calculateDomains(cells.features);
    setSummary(summary);

    map.addSource("core", { type: "geojson", data: core });
    map.addLayer({
      id: "core-line", type: "line", source: "core",
      paint: { "line-color": "#111111", "line-width": 1.4, "line-opacity": 0.75 },
    });

    map.addSource("access-cells", { type: "geojson", data: cells });
    map.addLayer({
      id: "access-fill", type: "fill", source: "access-cells",
      paint: {
        "fill-color": colorExpression(select.value),
        "fill-opacity": 0.78,
        "fill-outline-color": "rgba(255,255,255,0.72)",
      },
    });
    map.addLayer({
      id: "access-hover", type: "line", source: "access-cells",
      paint: { "line-color": "#111111", "line-width": 2 },
      filter: ["==", ["get", "h3_id"], ""],
    });

    map.addSource("stores", { type: "geojson", data: stores });
    map.addLayer({
      id: "stores-layer", type: "circle", source: "stores",
      paint: {
        "circle-radius": [
          "case",
          ["==", ["get", "store_size"], "Large (10,000+ sq ft)"], 7,
          ["==", ["get", "store_size"], "Medium (2,500–9,999 sq ft)"], 5,
          3.5,
        ],
        "circle-color": "#17365d",
        "circle-stroke-color": "white",
        "circle-stroke-width": 1,
        "circle-opacity": 0.82,
      },
    });

    map.addSource("closure-stores", { type: "geojson", data: closures });
    map.addLayer({
      id: "closure-store-layer", type: "circle", source: "closure-stores",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "scenario"], 1, 11, 3, 7],
        "circle-color": "#ffe600",
        "circle-stroke-color": "#111111",
        "circle-stroke-width": 2,
      },
    });

    map.addSource("representative-routes", { type: "geojson", data: routes });
    map.addLayer({
      id: "routes-layer", type: "line", source: "representative-routes",
      layout: { visibility: "none" },
      paint: { "line-color": "#1f78b4", "line-width": 4, "line-opacity": 0.9 },
    });

    map.on("mousemove", "access-fill", (event) => {
      map.getCanvas().style.cursor = "pointer";
      const feature = event.features[0];
      map.setFilter("access-hover", ["==", ["get", "h3_id"], feature.properties.h3_id]);
    });
    map.on("mouseleave", "access-fill", () => {
      map.getCanvas().style.cursor = "";
      map.setFilter("access-hover", ["==", ["get", "h3_id"], ""]);
    });

    map.on("click", "access-fill", (event) => {
      const p = event.features[0].properties;
      const html = `
        <div class="popup-title">${p.district_name || "Residential demand cell"}</div>
        <div class="popup-grid">
          <span>Residential units</span><span>${formatValue(p.residential_units, 0)}</span>
          <span>Allocation disagreement</span><span>${formatValue(p.allocation_difference_pct)}%</span>
          <span>Nearest network distance</span><span>${formatValue(p.network_m)} m</span>
          <span>Nearest walk time</span><span>${formatValue(p.walk_min_nearest)} min</span>
          <span>Detour index</span><span>${formatValue(p.detour_index, 2)}</span>
          <span>Stores in 10 min</span><span>${formatValue(p.network_store_count_10min, 0)}</span>
          <span>Buffer overcount</span><span>${formatValue(p.buffer_overcount, 0)}</span>
          <span>Robust priority</span><span>${formatValue(p.priority_index)}</span>
          <span>Rank sensitivity</span><span>${formatValue(p.priority_rank_spread, 0)}</span>
          <span>Maximum closure impact</span><span>${formatValue(p.closure_increase_min)} min</span>
        </div>`;
      new maplibregl.Popup().setLngLat(event.lngLat).setHTML(html).addTo(map);
    });

    map.on("click", "stores-layer", (event) => {
      const p = event.features[0].properties;
      const html = `
        <div class="popup-title">${p.store_name || "Retail food store"}</div>
        <div class="popup-grid">
          <span>Address</span><span>${p.address || "—"}</span>
          <span>Size class</span><span>${p.store_size || "—"}</span>
          <span>Square footage</span><span>${formatValue(p.square_footage, 0)}</span>
          <span>Store snap distance</span><span>${formatValue(p.snap_distance_m)} m</span>
          <span>Establishment code</span><span>${p.estab_type || "—"}</span>
        </div>`;
      new maplibregl.Popup().setLngLat(event.lngLat).setHTML(html).addTo(map);
    });

    select.addEventListener("change", () => {
      map.setPaintProperty("access-fill", "fill-color", colorExpression(select.value));
      updateLegend(select.value);
    });
    storesToggle.addEventListener("change", () => {
      map.setLayoutProperty("stores-layer", "visibility", storesToggle.checked ? "visible" : "none");
    });
    closureToggle.addEventListener("change", () => {
      map.setLayoutProperty("closure-store-layer", "visibility", closureToggle.checked ? "visible" : "none");
    });
    routesToggle.addEventListener("change", () => {
      map.setLayoutProperty("routes-layer", "visibility", routesToggle.checked ? "visible" : "none");
    });

    updateLegend(select.value);
    status.textContent = `${cells.features.length.toLocaleString()} demand cells · ${stores.features.length.toLocaleString()} stores · corrected door-to-door model`;
  } catch (error) {
    console.error(error);
    status.textContent = error.message;
  }
});
