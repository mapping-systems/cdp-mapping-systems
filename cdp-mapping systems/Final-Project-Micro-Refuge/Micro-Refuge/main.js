"use strict";

const BRYANT_CENTER = [-73.9832, 40.7536];
const WALK_SPEED_M_PER_MIN = 80;
const MAX_FIELD_RADIUS_M = 15 * WALK_SPEED_M_PER_MIN;
const SOURCE_PADDING_M = 180;
const SAMPLE_INTERVAL_M = 10;
const GRID_SIZE_M = 80;
const MAX_GRID_RING = 8;

const PALETTE = {
  black: "#111111",
  charcoal: "#252525",
  deepGreen: "#1F5A43",
  lightGreen: "#86B978",
  yellow: "#E2C84A",
  lime: "#C8E63C",
  paleBlue: "#DCEBFA",
  blue: "#2F6FB0",
  white: "#FFFFFF",
  pending: "#A7AAA5",
};

const VISUAL_COLORS = {
  "Exposed Edge": PALETTE.blue,
  "Screened Edge": PALETTE.deepGreen,
  "Vegetated Buffer": PALETTE.lightGreen,
  "Open Field": PALETTE.yellow,
  pending: PALETTE.pending,
};

const state = {
  origin: BRYANT_CENTER,
  originName: "Bryant Park",
  minutes: 15,
  bench: true,
  leaning: true,
  preference: "all",
  pickingOrigin: false,
  candidates: null,
  fieldSegments: [],
  fieldSamples: [],
  fieldReady: false,
  fieldFailed: false,
  thresholds: null,
  filteredFeatures: [],
  selectedCandidateId: null,
};

const map = new maplibregl.Map({
  container: "map",
  style: "./map-style.json",
  center: BRYANT_CENTER,
  zoom: 14.35,
  minZoom: 12.5,
  maxZoom: 19,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function haversineMeters(a, b) {
  const R = 6371008.8;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function destinationPoint(center, distanceMeters, bearingRad) {
  const [lng, lat] = center;
  const R = 6371008.8;
  const angular = distanceMeters / R;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
    Math.cos(lat1) * Math.sin(angular) * Math.cos(bearingRad)
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearingRad) * Math.sin(angular) * Math.cos(lat1),
    Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
  );
  return [((lng2 * 180) / Math.PI + 540) % 360 - 180, (lat2 * 180) / Math.PI];
}

function circleGeoJSON(center, radiusMeters, steps = 120) {
  const ring = [];
  for (let i = 0; i <= steps; i += 1) {
    ring.push(destinationPoint(center, radiusMeters, (i / steps) * Math.PI * 2));
  }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} };
}

function circleBounds(center, radiusMeters) {
  const north = destinationPoint(center, radiusMeters, 0);
  const east = destinationPoint(center, radiusMeters, Math.PI / 2);
  const south = destinationPoint(center, radiusMeters, Math.PI);
  const west = destinationPoint(center, radiusMeters, Math.PI * 1.5);
  return [[west[0], south[1]], [east[0], north[1]]];
}

function fitToSelectedRange() {
  const radius = state.minutes * WALK_SPEED_M_PER_MIN;
  map.fitBounds(circleBounds(state.origin, radius), {
    padding: { top: 48, right: 48, bottom: 48, left: window.innerWidth > 760 ? 400 : 32 },
    duration: 500,
    maxZoom: 17,
  });
}

function formatDistance(m) {
  if (!Number.isFinite(m)) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatMinutes(min) {
  if (!Number.isFinite(min)) return "—";
  return `${Math.max(1, Math.round(min))} min`;
}

function candidateTypeLabel(type) {
  return type === "Leaning Bar" ? "Leaning Bar" : "Bench";
}

function conditionLabel(condition) {
  return condition || "Field pending";
}

function conditionExplanation(properties) {
  const condition = properties.visual_condition;
  if (!condition) return "The live visual field has not assigned a condition to this pause location yet.";
  if (condition === "Vegetated Buffer") return "Nearby trees provide a stronger filtering relationship while the nearest building edge is relatively farther away, producing a vegetation-led buffering condition.";
  if (condition === "Screened Edge") return "Trees and building edges are both relatively close, producing a layered condition where vegetation and the built edge act together.";
  if (condition === "Exposed Edge") return "The built edge is relatively close while nearby tree filtering is weaker, producing a more direct exposed-edge condition.";
  return "Both nearby trees and building edges are relatively farther away, producing a more open condition with less close-range visual filtering.";
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function localProjector(origin) {
  const lat0 = origin[1] * Math.PI / 180;
  const xScale = 111320 * Math.cos(lat0);
  const yScale = 110540;
  return {
    toXY(coord) { return [(coord[0] - origin[0]) * xScale, (coord[1] - origin[1]) * yScale]; },
    toLngLat(xy) { return [origin[0] + xy[0] / xScale, origin[1] + xy[1] / yScale]; },
  };
}

function geometryLines(geometry) {
  if (!geometry) return [];
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return [];
}

function geometryPolygons(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function lineLengthXY(coords) {
  let length = 0;
  for (let i = 1; i < coords.length; i += 1) {
    length += Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
  }
  return length;
}

function pointAlongLineXY(coords, distance) {
  let walked = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const a = coords[i - 1];
    const b = coords[i];
    const segment = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (walked + segment >= distance || i === coords.length - 1) {
      const t = segment === 0 ? 0 : Math.max(0, Math.min(1, (distance - walked) / segment));
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    walked += segment;
  }
  return coords[coords.length - 1];
}

function pointToSegmentDistance(p, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = p[0] - a[0];
  const wy = p[1] - a[1];
  const vv = vx * vx + vy * vy;
  const t = vv === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / vv));
  const dx = p[0] - (a[0] + t * vx);
  const dy = p[1] - (a[1] + t * vy);
  return Math.hypot(dx, dy);
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersects = ((yi > point[1]) !== (yj > point[1])) &&
      (point[0] < (xj - xi) * (point[1] - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointToPolygonDistance(point, polygon) {
  const outer = polygon.rings[0];
  if (outer && pointInRing(point, outer)) return 0;
  let best = Infinity;
  for (const ring of polygon.rings) {
    for (let i = 1; i < ring.length; i += 1) {
      best = Math.min(best, pointToSegmentDistance(point, ring[i - 1], ring[i]));
    }
  }
  return best;
}

function gridKey(ix, iy) { return `${ix},${iy}`; }
function cellIndex(value) { return Math.floor(value / GRID_SIZE_M); }

function addToGrid(grid, ix, iy, value) {
  const key = gridKey(ix, iy);
  if (!grid.has(key)) grid.set(key, []);
  grid.get(key).push(value);
}

function ringCells(ix, iy, ring) {
  if (ring === 0) return [[ix, iy]];
  const cells = [];
  for (let dx = -ring; dx <= ring; dx += 1) {
    cells.push([ix + dx, iy - ring], [ix + dx, iy + ring]);
  }
  for (let dy = -ring + 1; dy <= ring - 1; dy += 1) {
    cells.push([ix - ring, iy + dy], [ix + ring, iy + dy]);
  }
  return cells;
}

function nearestTreeDistance(point, treeGrid) {
  const ix = cellIndex(point[0]);
  const iy = cellIndex(point[1]);
  let best = Infinity;
  for (let ring = 0; ring <= MAX_GRID_RING; ring += 1) {
    for (const [cx, cy] of ringCells(ix, iy, ring)) {
      const trees = treeGrid.get(gridKey(cx, cy)) || [];
      for (const tree of trees) best = Math.min(best, Math.hypot(tree[0] - point[0], tree[1] - point[1]));
    }
    if (Number.isFinite(best) && best < Math.max(0, ring - 1) * GRID_SIZE_M) break;
  }
  return best;
}

function nearestBuildingDistance(point, buildingGrid, buildings) {
  const ix = cellIndex(point[0]);
  const iy = cellIndex(point[1]);
  let best = Infinity;
  const seen = new Set();
  for (let ring = 0; ring <= MAX_GRID_RING; ring += 1) {
    for (const [cx, cy] of ringCells(ix, iy, ring)) {
      const ids = buildingGrid.get(gridKey(cx, cy)) || [];
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        best = Math.min(best, pointToPolygonDistance(point, buildings[id]));
      }
    }
    if (Number.isFinite(best) && best < Math.max(0, ring - 1) * GRID_SIZE_M) break;
  }
  return best;
}

function classifyCondition(treeDistance, buildingDistance, treeThreshold, buildingThreshold) {
  const treeNear = treeDistance <= treeThreshold;
  const buildingNear = buildingDistance <= buildingThreshold;
  if (buildingNear && !treeNear) return "Exposed Edge";
  if (buildingNear && treeNear) return "Screened Edge";
  if (!buildingNear && treeNear) return "Vegetated Buffer";
  return "Open Field";
}

function bboxAround(center, radiusMeters) {
  const bounds = circleBounds(center, radiusMeters);
  return { west: bounds[0][0], south: bounds[0][1], east: bounds[1][0], north: bounds[1][1] };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function socrataGeoJsonUrl(datasetId, bbox) {
  const params = new URLSearchParams();
  params.set("$limit", "50000");
  params.set("$where", `within_box(the_geom, ${bbox.north}, ${bbox.west}, ${bbox.south}, ${bbox.east})`);
  return `https://data.cityofnewyork.us/resource/${datasetId}.geojson?${params.toString()}`;
}

async function fetchSocrataGeoJson(datasetIds, bbox) {
  const errors = [];
  for (const id of datasetIds) {
    try {
      const data = await fetchJson(socrataGeoJsonUrl(id, bbox));
      if (data && data.type === "FeatureCollection") return data;
    } catch (error) {
      errors.push(`${id}: ${error.message}`);
    }
  }
  throw new Error(errors.join(" | "));
}

async function fetchTrees(bbox) {
  const params = new URLSearchParams();
  params.set("$limit", "50000");
  params.set("$select", "latitude,longitude");
  params.set("$where", `latitude >= ${bbox.south} AND latitude <= ${bbox.north} AND longitude >= ${bbox.west} AND longitude <= ${bbox.east}`);
  const records = await fetchJson(`https://data.cityofnewyork.us/resource/uvpi-gqnh.json?${params.toString()}`);
  return records
    .map((record) => [Number(record.longitude), Number(record.latitude)])
    .filter((coord) => Number.isFinite(coord[0]) && Number.isFinite(coord[1]));
}

function setFieldStatus(message, short = "LOADING", kind = "") {
  $("field-status").textContent = message;
  $("field-status").className = `field-status ${kind}`.trim();
  $("field-status-short").textContent = short;
}

async function buildFullVisualField() {
  setFieldStatus("Loading streets, street trees, and building footprints for the full 15-minute area…", "LOADING");
  const bbox = bboxAround(BRYANT_CENTER, MAX_FIELD_RADIUS_M + SOURCE_PADDING_M);

  const [streets, treeCoords, buildingData] = await Promise.all([
    fetchSocrataGeoJson(["inkn-q76z", "3mf9-qshr"], bbox),
    fetchTrees(bbox),
    fetchSocrataGeoJson(["3g6p-4u5s", "5zhs-2jue"], bbox),
  ]);

  setFieldStatus("Sampling the street network every 10 meters…", "BUILDING");
  const projector = localProjector(BRYANT_CENTER);
  const studyRadius = MAX_FIELD_RADIUS_M + 20;

  const treesXY = treeCoords.map(projector.toXY);
  const treeGrid = new Map();
  for (const tree of treesXY) addToGrid(treeGrid, cellIndex(tree[0]), cellIndex(tree[1]), tree);

  const buildings = [];
  const buildingGrid = new Map();
  for (const feature of buildingData.features) {
    for (const polygonCoords of geometryPolygons(feature.geometry)) {
      const rings = polygonCoords.map((ring) => ring.map(projector.toXY));
      const flat = rings.flat();
      if (!flat.length) continue;
      const xs = flat.map((p) => p[0]);
      const ys = flat.map((p) => p[1]);
      const polygon = { rings, minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
      const id = buildings.length;
      buildings.push(polygon);
      for (let ix = cellIndex(polygon.minX); ix <= cellIndex(polygon.maxX); ix += 1) {
        for (let iy = cellIndex(polygon.minY); iy <= cellIndex(polygon.maxY); iy += 1) addToGrid(buildingGrid, ix, iy, id);
      }
    }
  }

  const rawSamples = [];
  let streetPartId = 0;
  for (const feature of streets.features) {
    const streetName = feature.properties?.stname_label || feature.properties?.street_name_label || feature.properties?.street_name || feature.properties?.full_stree || "";
    for (const lineLngLat of geometryLines(feature.geometry)) {
      const lineXY = lineLngLat.map(projector.toXY);
      if (lineXY.length < 2) continue;
      const length = lineLengthXY(lineXY);
      if (length < 1) continue;
      streetPartId += 1;
      const positions = length <= SAMPLE_INTERVAL_M
        ? [length / 2]
        : Array.from({ length: Math.max(1, Math.floor(length / SAMPLE_INTERVAL_M)) }, (_, i) => SAMPLE_INTERVAL_M / 2 + i * SAMPLE_INTERVAL_M).filter((d) => d < length);

      for (let i = 0; i < positions.length; i += 1) {
        const d = positions[i];
        const pointXY = pointAlongLineXY(lineXY, d);
        if (Math.hypot(pointXY[0], pointXY[1]) > studyRadius) continue;
        const half = SAMPLE_INTERVAL_M * 0.48;
        const startXY = pointAlongLineXY(lineXY, Math.max(0, d - half));
        const endXY = pointAlongLineXY(lineXY, Math.min(length, d + half));
        rawSamples.push({
          sample_id: `S${streetPartId}_${i + 1}`,
          street_name: streetName,
          pointXY,
          pointLngLat: projector.toLngLat(pointXY),
          lineLngLat: [projector.toLngLat(startXY), projector.toLngLat(endXY)],
        });
      }
    }
  }

  setFieldStatus(`Measuring ${rawSamples.length.toLocaleString()} street samples against nearby trees and building edges…`, "MEASURING");
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const chunkSize = 250;
  for (let start = 0; start < rawSamples.length; start += chunkSize) {
    const end = Math.min(rawSamples.length, start + chunkSize);
    for (let i = start; i < end; i += 1) {
      const sample = rawSamples[i];
      sample.tree_distance_m = nearestTreeDistance(sample.pointXY, treeGrid);
      sample.building_distance_m = nearestBuildingDistance(sample.pointXY, buildingGrid, buildings);
    }
    if (start % 1000 === 0) {
      const pct = Math.round((end / rawSamples.length) * 100);
      setFieldStatus(`Measuring visual relationships across the full study area… ${pct}%`, "MEASURING");
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const treeThreshold = median(rawSamples.map((s) => s.tree_distance_m));
  const buildingThreshold = median(rawSamples.map((s) => s.building_distance_m));
  state.thresholds = { treeThreshold, buildingThreshold };

  state.fieldSamples = rawSamples.map((sample) => ({
    ...sample,
    visual_condition: classifyCondition(sample.tree_distance_m, sample.building_distance_m, treeThreshold, buildingThreshold),
  }));

  state.fieldSegments = state.fieldSamples.map((sample) => ({
    type: "Feature",
    properties: {
      sample_id: sample.sample_id,
      street_name: sample.street_name,
      tree_distance_m: sample.tree_distance_m,
      building_distance_m: sample.building_distance_m,
      visual_condition: sample.visual_condition,
      sample_lon: sample.pointLngLat[0],
      sample_lat: sample.pointLngLat[1],
    },
    geometry: { type: "LineString", coordinates: sample.lineLngLat },
  }));

  attachVisualConditionsToCandidates();
  state.fieldReady = true;
  setFieldStatus(
    `Full field ready: ${state.fieldSamples.length.toLocaleString()} 10 m street samples. Tree threshold ${treeThreshold.toFixed(1)} m · building threshold ${buildingThreshold.toFixed(1)} m.`,
    "READY",
    "ready"
  );
  updateMapAndSummary();
}

function attachVisualConditionsToCandidates() {
  if (!state.candidates || !state.fieldSamples.length) return;
  const projector = localProjector(BRYANT_CENTER);
  for (const feature of state.candidates.features) {
    const p = feature.properties;
    const point = projector.toXY(feature.geometry.coordinates);
    let bestSample = null;
    let bestDistance = Infinity;
    for (const sample of state.fieldSamples) {
      const d = Math.hypot(sample.pointXY[0] - point[0], sample.pointXY[1] - point[1]);
      if (d < bestDistance) {
        bestDistance = d;
        bestSample = sample;
      }
    }
    if (!bestSample) continue;
    p.sample_id = bestSample.sample_id;
    p.sample_link_distance_m = bestDistance;
    p.tree_distance_m = bestSample.tree_distance_m;
    p.building_distance_m = bestSample.building_distance_m;
    p.visual_condition = bestSample.visual_condition;
    p.visual_measured = true;
    p.screening_potential = ["Screened Edge", "Vegetated Buffer"].includes(bestSample.visual_condition);
  }
}

function fieldFeaturesForCurrentRange() {
  if (!state.fieldReady) return [];
  const radius = state.minutes * WALK_SPEED_M_PER_MIN;
  return state.fieldSegments.filter((feature) => {
    const p = feature.properties;
    return haversineMeters(state.origin, [p.sample_lon, p.sample_lat]) <= radius;
  });
}

function enhanceCandidateFeatures() {
  if (!state.candidates) return [];
  const maxDistance = state.minutes * WALK_SPEED_M_PER_MIN;
  return state.candidates.features.map((feature) => {
    const copy = structuredClone(feature);
    const p = copy.properties;
    const coords = copy.geometry.coordinates;
    const distance = haversineMeters(state.origin, coords);
    const walkMinutes = distance / WALK_SPEED_M_PER_MIN;
    const typeAllowed = (p.candidate_type === "Bench" && state.bench) || (p.candidate_type === "Leaning Bar" && state.leaning);
    const reachable = distance <= maxDistance && typeAllowed;
    const measured = Boolean(p.visual_measured) && Boolean(p.visual_condition);
    const screened = p.visual_condition === "Screened Edge" || p.visual_condition === "Vegetated Buffer";
    const preferenceMatch = state.preference === "all" || (state.preference === "screened" && screened);
    p.distance_from_origin_m = distance;
    p.walk_minutes = walkMinutes;
    p.reachable = reachable;
    p.visual_measured = measured;
    p.screening_potential = screened;
    p.preference_match = preferenceMatch;
    p.visible_candidate = reachable && preferenceMatch;
    p.selected_candidate = p.candidate_id === state.selectedCandidateId;
    return copy;
  });
}

function updateMapAndSummary() {
  if (!map.loaded() || !state.candidates || !map.getSource("pause-candidates")) return;
  const features = enhanceCandidateFeatures();
  state.filteredFeatures = features.filter((f) => f.properties.visible_candidate);
  map.getSource("pause-candidates").setData({ type: "FeatureCollection", features });
  map.getSource("walk-area").setData(circleGeoJSON(state.origin, state.minutes * WALK_SPEED_M_PER_MIN));
  map.getSource("origin").setData({ type: "Feature", geometry: { type: "Point", coordinates: state.origin }, properties: {} });

  if (map.getSource("visual-field")) {
    map.getSource("visual-field").setData({ type: "FeatureCollection", features: fieldFeaturesForCurrentRange() });
  }

  const visible = state.filteredFeatures;
  const screened = visible.filter((f) => f.properties.screening_potential);
  $("reachable-count").textContent = visible.length;
  $("screened-count").textContent = screened.length;

  const allReachable = features.filter((f) => f.properties.reachable);
  $("bench-count").textContent = allReachable.filter((f) => f.properties.candidate_type === "Bench").length;
  $("leaning-count").textContent = allReachable.filter((f) => f.properties.candidate_type === "Leaning Bar").length;
  updateCompareCards(allReachable);
}

function updateCompareCards(allReachable) {
  const nearest = [...allReachable].sort((a, b) => a.properties.distance_from_origin_m - b.properties.distance_from_origin_m)[0];
  const screened = allReachable
    .filter((f) => f.properties.screening_potential)
    .sort((a, b) => a.properties.distance_from_origin_m - b.properties.distance_from_origin_m)[0];

  const makeCard = (label, feature, emptyText) => {
    if (!feature) return `<article class="compare-card empty"><small>${label}</small><strong>${emptyText}</strong></article>`;
    const p = feature.properties;
    return `<article class="compare-card" data-candidate-id="${escapeHtml(p.candidate_id)}">
      <small>${label}</small>
      <strong>${escapeHtml(p.candidate_name || p.On_Street || "DOT pause location")}</strong>
      <span>${formatMinutes(p.walk_minutes)} · ${candidateTypeLabel(p.candidate_type)} · ${conditionLabel(p.visual_condition)}</span>
    </article>`;
  };

  $("compare-cards").innerHTML =
    makeCard("NEAREST", nearest, "No pause location in the current range") +
    makeCard("MORE SCREENED", screened, state.fieldReady ? "No screened option in the current range" : "Building the visual field…");

  $("compare-cards").querySelectorAll("[data-candidate-id]").forEach((card) => {
    card.addEventListener("click", () => {
      const feature = state.candidates.features.find((f) => f.properties.candidate_id === card.dataset.candidateId);
      if (feature) selectCandidate(feature);
    });
  });
}

function selectCandidate(feature) {
  state.selectedCandidateId = feature.properties.candidate_id;
  updateMapAndSummary();
  const enhanced = enhanceCandidateFeatures().find((f) => f.properties.candidate_id === feature.properties.candidate_id) || feature;
  const p = enhanced.properties;
  $("detail-name").textContent = p.candidate_name || p.On_Street || "DOT pause location";
  $("detail-type").textContent = candidateTypeLabel(p.candidate_type);
  $("detail-walk").textContent = formatMinutes(p.walk_minutes);
  $("detail-condition").textContent = conditionLabel(p.visual_condition);
  $("detail-tree").textContent = Number.isFinite(Number(p.tree_distance_m)) ? formatDistance(Number(p.tree_distance_m)) : "Pending";
  $("detail-building").textContent = Number.isFinite(Number(p.building_distance_m)) ? formatDistance(Number(p.building_distance_m)) : "Pending";
  $("detail-explain").textContent = conditionExplanation(p);
  $("detail-panel").classList.remove("hidden");
  map.easeTo({ center: feature.geometry.coordinates, zoom: Math.max(map.getZoom(), 16.3), duration: 500 });
}

function setOrigin(coords, label) {
  state.origin = coords;
  state.originName = label;
  $("origin-label").textContent = `Origin: ${label}`;
  $("origin-bryant").classList.toggle("active", label === "Bryant Park");
  state.pickingOrigin = false;
  $("origin-map").classList.remove("active");
  $("map-hint").textContent = "Click a pause location to see why it was classified this way.";
  updateMapAndSummary();
  fitToSelectedRange();
}

function bindControls() {
  $("origin-bryant").addEventListener("click", () => setOrigin(BRYANT_CENTER, "Bryant Park"));

  $("origin-location").addEventListener("click", () => {
    if (!navigator.geolocation) {
      $("origin-label").textContent = "Geolocation is not supported. Choose a point on the map instead.";
      return;
    }
    $("origin-label").textContent = "Reading your location…";
    navigator.geolocation.getCurrentPosition(
      (pos) => setOrigin([pos.coords.longitude, pos.coords.latitude], "My Location"),
      () => { $("origin-label").textContent = "Unable to read your location. Choose a point on the map instead."; },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  $("origin-map").addEventListener("click", () => {
    state.pickingOrigin = !state.pickingOrigin;
    $("origin-map").classList.toggle("active", state.pickingOrigin);
    $("map-hint").textContent = state.pickingOrigin ? "Click anywhere near Bryant Park to set your origin." : "Click a pause location to see why it was classified this way.";
  });

  $("time-control").querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.minutes = Number(button.dataset.minutes);
      $("time-control").querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === button));
      updateMapAndSummary();
      fitToSelectedRange();
    });
  });

  $("preference-control").querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.preference = button.dataset.preference;
      $("preference-control").querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === button));
      updateMapAndSummary();
    });
  });

  $("filter-bench").addEventListener("change", (e) => { state.bench = e.target.checked; updateMapAndSummary(); });
  $("filter-leaning").addEventListener("change", (e) => { state.leaning = e.target.checked; updateMapAndSummary(); });
  $("detail-close").addEventListener("click", () => $("detail-panel").classList.add("hidden"));
}

async function loadCandidateData() {
  const response = await fetch("./data/dot_pause_candidates.geojson");
  if (!response.ok) throw new Error("Could not load DOT pause candidates.");
  state.candidates = await response.json();
  for (const feature of state.candidates.features) {
    feature.properties.visual_condition = null;
    feature.properties.visual_measured = false;
    feature.properties.screening_potential = false;
  }
}

map.on("load", async () => {
  bindControls();
  await loadCandidateData();

  map.addSource("walk-area", { type: "geojson", data: circleGeoJSON(state.origin, state.minutes * WALK_SPEED_M_PER_MIN) });
  map.addLayer({
    id: "walk-area-fill", type: "fill", source: "walk-area",
    paint: { "fill-color": PALETTE.paleBlue, "fill-opacity": 0.52 },
  });
  map.addLayer({
    id: "walk-area-line", type: "line", source: "walk-area",
    paint: { "line-color": PALETTE.blue, "line-width": 1.35, "line-dasharray": [3, 2], "line-opacity": 0.72 },
  });

  map.addSource("visual-field", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "visual-field-casing", type: "line", source: "visual-field",
    paint: {
      "line-color": PALETTE.black,
      "line-width": ["interpolate", ["linear"], ["zoom"], 13, 3.2, 15, 5.4, 17, 8.6, 19, 11.8],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.20, 16, 0.30, 19, 0.38],
    },
  });
  map.addLayer({
    id: "visual-field", type: "line", source: "visual-field",
    paint: {
      "line-color": ["match", ["get", "visual_condition"],
        "Exposed Edge", VISUAL_COLORS["Exposed Edge"],
        "Screened Edge", VISUAL_COLORS["Screened Edge"],
        "Vegetated Buffer", VISUAL_COLORS["Vegetated Buffer"],
        "Open Field", VISUAL_COLORS["Open Field"], VISUAL_COLORS.pending],
      "line-width": ["interpolate", ["linear"], ["zoom"], 13, 2.25, 15, 4.25, 17, 7.25, 19, 10],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.68, 16, 0.86, 19, 0.96],
      "line-blur": 0.05,
    },
  });

  map.addSource("pause-candidates", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "pause-candidates-all", type: "circle", source: "pause-candidates",
    paint: {
      "circle-radius": ["case", ["==", ["get", "candidate_type"], "Leaning Bar"], 6, 7.5],
      "circle-color": PALETTE.black,
      "circle-opacity": ["case", ["get", "visible_candidate"], 0.98, ["get", "reachable"], 0.2, 0.055],
      "circle-stroke-color": PALETTE.white,
      "circle-stroke-width": ["case", ["get", "visible_candidate"], 1.8, 1],
      "circle-stroke-opacity": ["case", ["get", "visible_candidate"], 1, 0.4],
    },
  });
  map.addLayer({
    id: "pause-candidates-screened-ring", type: "circle", source: "pause-candidates",
    filter: ["all", ["==", ["get", "screening_potential"], true], ["==", ["get", "visible_candidate"], true]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 8, 16, 12, 18, 16],
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": PALETTE.lightGreen,
      "circle-stroke-width": 2,
      "circle-stroke-opacity": 0.88,
    },
  });

  map.addLayer({
    id: "pause-candidates-selected-ring", type: "circle", source: "pause-candidates",
    filter: ["==", ["get", "selected_candidate"], true],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 10, 16, 15, 18, 19],
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": PALETTE.lime,
      "circle-stroke-width": 3,
      "circle-stroke-opacity": 1,
    },
  });

  map.addSource("origin", { type: "geojson", data: { type: "Feature", geometry: { type: "Point", coordinates: state.origin }, properties: {} } });
  map.addLayer({
    id: "origin", type: "circle", source: "origin",
    paint: { "circle-radius": 6.5, "circle-color": PALETTE.lime, "circle-stroke-color": PALETTE.white, "circle-stroke-width": 2.2 },
  });

  updateMapAndSummary();
  fitToSelectedRange();

  map.on("mouseenter", "pause-candidates-all", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "pause-candidates-all", () => { map.getCanvas().style.cursor = state.pickingOrigin ? "crosshair" : ""; });

  map.on("click", (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: ["pause-candidates-all"] });
    const visibleHit = hits.find((f) => f.properties.visible_candidate === true || f.properties.visible_candidate === "true");
    if (visibleHit && !state.pickingOrigin) {
      const original = state.candidates.features.find((f) => f.properties.candidate_id === visibleHit.properties.candidate_id);
      if (original) selectCandidate(original);
      return;
    }
    if (state.pickingOrigin) setOrigin([e.lngLat.lng, e.lngLat.lat], "Map Point");
  });

  buildFullVisualField().catch((error) => {
    console.error("Full visual field error:", error);
    state.fieldFailed = true;
    setFieldStatus("The live 15-minute visual field could not be built. Check the internet connection and reload the page.", "ERROR", "error");
    updateMapAndSummary();
  });
});

map.on("error", (event) => console.error("Map error:", event.error || event));
