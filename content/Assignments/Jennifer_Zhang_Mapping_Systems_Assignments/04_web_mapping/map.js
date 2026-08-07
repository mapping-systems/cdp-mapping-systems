const ROLE_CONFIG = {
  all: { label: "All requests", color: "#f4f1ea" },
  site: { label: "Site code + data", color: "#f4f1ea" },
  terrain: { label: "Terrain tiles", color: "#89c9cd" },
  imagery: { label: "Imagery tiles", color: "#f3aa92" },
};

const initialView = { center: [42.7, -122.36], zoom: 5 };
const map = L.map("map", {
  zoomControl: false,
  worldCopyJump: true,
  minZoom: 2,
  preferCanvas: true,
}).setView(initialView.center, initialView.zoom);

L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    attribution:
      "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  },
).addTo(map);

L.control.zoom({ position: "bottomright" }).addTo(map);

const elements = {
  requestCount: document.querySelector("#request-count"),
  serverCount: document.querySelector("#server-count"),
  placeCount: document.querySelector("#place-count"),
  status: document.querySelector("#status"),
  locationList: document.querySelector("#location-list"),
  accessibleList: document.querySelector("#accessible-server-list"),
  shareBar: document.querySelector("#share-bar"),
  shareLabels: document.querySelector("#share-labels"),
  resetButton: document.querySelector("#reset-view"),
  methodPanel: document.querySelector("#method-panel"),
  openMethod: document.querySelector("#open-method"),
  closeMethod: document.querySelector("#close-method"),
};

const filterButtons = [...document.querySelectorAll(".filter-button")];
let sourceData = null;
let displayLayer = null;
let activeRole = "all";
let dataBounds = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function requestCount(features) {
  return features.reduce(
    (sum, feature) => sum + Number(feature.properties?.request_count || 0),
    0,
  );
}

function rolesFor(feature) {
  const roles = feature.properties?.roles;
  return Array.isArray(roles) && roles.length ? roles : ["other"];
}

function groupedByCoordinate(features) {
  const groups = new Map();
  for (const feature of features) {
    const coordinates = feature.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    const key = `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
    if (!groups.has(key)) groups.set(key, { longitude, latitude, features: [] });
    groups.get(key).features.push(feature);
  }
  return [...groups.values()];
}

function roleTotals(features) {
  const totals = { site: 0, terrain: 0, imagery: 0 };
  for (const feature of features) {
    for (const role of rolesFor(feature)) {
      if (role in totals) totals[role] += Number(feature.properties?.request_count || 0);
    }
  }
  return totals;
}

function popupHtml(group) {
  const first = group.features[0]?.properties || {};
  const location = [first.city, first.region, first.country].filter(Boolean).join(", ");
  const total = requestCount(group.features);
  const groupRoles = [...new Set(group.features.flatMap(rolesFor))];
  const roleText = groupRoles
    .map((role) => ROLE_CONFIG[role]?.label || role)
    .join(" + ");
  const servers = group.features
    .slice()
    .sort((a, b) => Number(b.properties?.request_count || 0) - Number(a.properties?.request_count || 0))
    .map((feature) => {
      const item = feature.properties || {};
      const hosts = (item.hosts || []).map(escapeHtml).join(", ");
      return `
        <li>
          <strong>${escapeHtml(item.ip)}</strong><br>
          <span class="server-meta">${escapeHtml(item.organization || "Organization unavailable")}<br>
          ${Number(item.request_count || 0).toLocaleString()} request(s) · ${hosts || "host unavailable"}</span>
        </li>`;
    })
    .join("");

  return `
    <p class="popup-kicker">${escapeHtml(roleText)}</p>
    <h2 class="popup-title">${escapeHtml(location || "Approximate server location")}</h2>
    <p class="popup-summary">${total.toLocaleString()} requests across ${group.features.length.toLocaleString()} captured server IP(s)</p>
    <ul class="server-list">${servers}</ul>
  `;
}

function markerFill(roles) {
  const colors = roles.map((role) => ROLE_CONFIG[role]?.color || "#efc66f");
  if (colors.length <= 1) return colors[0] || "#efc66f";
  const step = 100 / colors.length;
  const stops = colors.flatMap((color, index) => [
    `${color} ${(index * step).toFixed(2)}%`,
    `${color} ${((index + 1) * step).toFixed(2)}%`,
  ]);
  return `conic-gradient(${stops.join(", ")})`;
}

function markerFor(group) {
  const count = requestCount(group.features);
  const roles = [...new Set(group.features.flatMap(rolesFor))].sort();
  const size = Math.max(42, Math.min(66, 34 + Math.sqrt(count) * 4.5));
  const location = [
    group.features[0]?.properties?.city,
    group.features[0]?.properties?.region,
  ].filter(Boolean).join(", ");
  const icon = L.divIcon({
    className: "request-marker-wrap",
    html: `<div class="request-marker" style="--marker-size:${size}px;--marker-fill:${markerFill(roles)};--marker-ring:${ROLE_CONFIG[roles[0]]?.color || "#efc66f"}" aria-hidden="true"><span>${count.toLocaleString()}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
  const marker = L.marker([group.latitude, group.longitude], {
    icon,
    keyboard: true,
    title: `${location || "Approximate location"}: ${count} requests`,
    riseOnHover: true,
  }).bindPopup(popupHtml(group), { maxWidth: 360, minWidth: 260 });
  marker.bindTooltip(
    `<strong>${escapeHtml(firstCity(group))}</strong><small>${count.toLocaleString()} requests</small>`,
    {
      permanent: true,
      direction: "right",
      className: "location-tooltip",
      offset: [size / 2 + 8, 0],
    },
  );
  return marker;
}

function firstCity(group) {
  const item = group.features[0]?.properties || {};
  return [item.city, item.region].filter(Boolean).join(", ") || "Approximate location";
}

function updateLocationList(groups) {
  const rows = groups
    .slice()
    .sort((a, b) => requestCount(b.features) - requestCount(a.features))
    .map((group) => {
      const properties = group.features[0]?.properties || {};
      const city = [properties.city, properties.region].filter(Boolean).join(", ");
      const roles = [...new Set(group.features.flatMap(rolesFor))]
        .map((role) => ROLE_CONFIG[role]?.label || role)
        .join(" + ");
      return `<div class="location-row"><div><strong>${escapeHtml(city || "Approximate location")}</strong><span>${escapeHtml(roles)}</span></div><b>${requestCount(group.features).toLocaleString()}</b></div>`;
    })
    .join("");
  elements.locationList.innerHTML = rows;
}

function updateAccessibleList(features) {
  elements.accessibleList.innerHTML = features
    .map((feature) => {
      const item = feature.properties || {};
      const location = [item.city, item.region, item.country].filter(Boolean).join(", ");
      return `<li>${escapeHtml(item.ip)} — ${escapeHtml(location)} — ${Number(item.request_count || 0).toLocaleString()} requests</li>`;
    })
    .join("");
}

function updateFilterState(role) {
  for (const button of filterButtons) {
    const selected = button.dataset.role === role;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  for (const segment of document.querySelectorAll(".share-segment")) {
    segment.classList.toggle("is-muted", role !== "all" && segment.dataset.role !== role);
  }
}

function fitCurrentData() {
  if (dataBounds?.isValid()) {
    map.fitBounds(dataBounds, { padding: [82, 82], maxZoom: 6, animate: true });
  } else {
    map.setView(initialView.center, initialView.zoom);
  }
}

function renderMap(role, { fit = true } = {}) {
  if (!sourceData) return;
  activeRole = role;
  const allFeatures = Array.isArray(sourceData.features) ? sourceData.features : [];
  const features = role === "all"
    ? allFeatures
    : allFeatures.filter((feature) => rolesFor(feature).includes(role));
  const groups = groupedByCoordinate(features);

  if (displayLayer) displayLayer.remove();
  displayLayer = L.featureGroup(groups.map(markerFor)).addTo(map);
  dataBounds = displayLayer.getBounds();

  elements.requestCount.textContent = requestCount(features).toLocaleString();
  elements.serverCount.textContent = features.length.toLocaleString();
  elements.placeCount.textContent = groups.length.toLocaleString();
  updateLocationList(groups);
  updateAccessibleList(features);
  updateFilterState(role);

  const roleLabel = ROLE_CONFIG[role]?.label || "Requests";
  elements.status.textContent = `${roleLabel} · ${requestCount(features).toLocaleString()} requests · ${features.length.toLocaleString()} IPs`;
  if (fit) fitCurrentData();
}

function renderShareRail(features) {
  const totals = roleTotals(features);
  const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const roles = ["site", "terrain", "imagery"];
  elements.shareBar.innerHTML = roles
    .map((role) => {
      const value = totals[role];
      const width = total ? (value / total) * 100 : 0;
      return `<button class="share-segment" type="button" data-role="${role}" style="width:${width}%" title="Filter to ${escapeHtml(ROLE_CONFIG[role].label)}: ${value} requests"><span class="sr-only">Filter to ${escapeHtml(ROLE_CONFIG[role].label)}, ${value} requests</span></button>`;
    })
    .join("");

  elements.shareLabels.innerHTML = roles
    .map((role) => `<div class="share-label" style="--role-color:${ROLE_CONFIG[role].color}"><i aria-hidden="true"></i><span>${escapeHtml(ROLE_CONFIG[role].label)}</span><strong>${totals[role].toLocaleString()}</strong></div>`)
    .join("");

  for (const segment of document.querySelectorAll(".share-segment")) {
    segment.addEventListener("click", () => renderMap(segment.dataset.role));
  }
}

function displayGeoJson(data, source = "Static GeoJSON") {
  if (!data || data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    throw new Error("The generated data is not a valid GeoJSON FeatureCollection.");
  }
  sourceData = data;
  const totals = roleTotals(data.features);
  const allTotal = requestCount(data.features);
  document.querySelector("#all-filter-count").textContent = allTotal.toLocaleString();
  for (const role of ["site", "terrain", "imagery"]) {
    document.querySelector(`#${role}-filter-count`).textContent = totals[role].toLocaleString();
  }
  renderShareRail(data.features);
  renderMap("all");
  elements.status.textContent = `${source} · ${allTotal.toLocaleString()} requests · select a marker for IP details`;
}

function openMethodPanel() {
  elements.methodPanel.classList.add("is-open");
  elements.methodPanel.setAttribute("aria-hidden", "false");
  elements.methodPanel.removeAttribute("inert");
  elements.openMethod.setAttribute("aria-expanded", "true");
  elements.closeMethod.focus();
}

function closeMethodPanel({ restoreFocus = true } = {}) {
  elements.methodPanel.classList.remove("is-open");
  elements.methodPanel.setAttribute("aria-hidden", "true");
  elements.methodPanel.setAttribute("inert", "");
  elements.openMethod.setAttribute("aria-expanded", "false");
  if (restoreFocus) elements.openMethod.focus();
}

for (const button of filterButtons) {
  button.addEventListener("click", () => renderMap(button.dataset.role));
}

elements.resetButton.addEventListener("click", fitCurrentData);
elements.openMethod.addEventListener("click", openMethodPanel);
elements.closeMethod.addEventListener("click", () => closeMethodPanel());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.methodPanel.classList.contains("is-open")) {
    closeMethodPanel();
  }
});

fetch("outputs/ip_locations.geojson")
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((data) => displayGeoJson(data))
  .catch((error) => {
    if (window.IP_LOCATION_DATA) {
      displayGeoJson(window.IP_LOCATION_DATA, "Local GeoJSON mirror");
      return;
    }
    console.error(error);
    elements.status.textContent = "GeoJSON could not load. Serve this folder with a local web server.";
  });
