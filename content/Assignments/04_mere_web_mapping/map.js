const DATA_URL = "outputs/ip_locations.geojson";

const map = new maplibregl.Map({
  container: "map",
  style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  center: [-20, 30],
  zoom: 1.6,
  minZoom: 1,
});

map.addControl(new maplibregl.NavigationControl(), "top-right");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

map.on("load", async () => {
  const response = await fetch(DATA_URL);
  if (!response.ok) {
    throw new Error(`Unable to load ${DATA_URL}: ${response.status}`);
  }

  const data = await response.json();
  const features = data.features || [];
  const requestCount = features.reduce(
    (sum, feature) => sum + Number(feature.properties.request_count || 0),
    0,
  );
  const cities = new Set(
    features.map((feature) =>
      [feature.properties.city, feature.properties.country].join(", "),
    ),
  );

  document.querySelector("#server-count").textContent = features.length;
  document.querySelector("#request-count").textContent = requestCount;
  document.querySelector("#city-count").textContent = cities.size;

  map.addSource("servers", { type: "geojson", data });
  map.addLayer({
    id: "server-circles",
    type: "circle",
    source: "servers",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["get", "request_count"],
        1,
        9,
        20,
        17,
      ],
      "circle-color": "#3159dc",
      "circle-opacity": 0.82,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });

  map.on("mouseenter", "server-circles", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "server-circles", () => {
    map.getCanvas().style.cursor = "";
  });

  map.on("click", "server-circles", (event) => {
    const feature = event.features[0];
    const properties = feature.properties;
    const coordinates = feature.geometry.coordinates.slice();
    const location = [properties.city, properties.region, properties.country]
      .filter(Boolean)
      .join(", ");

    const html = `
      <div class="popup-title">${escapeHtml(properties.hosts)}</div>
      <div class="popup-row"><strong>Approximate location:</strong> ${escapeHtml(location)}</div>
      <div class="popup-row"><strong>Captured requests:</strong> ${escapeHtml(properties.request_count)}</div>
      <div class="popup-row"><strong>Server IP:</strong> ${escapeHtml(properties.ip)}</div>
      <div class="popup-row"><strong>Network:</strong> ${escapeHtml(properties.organization)}</div>
    `;

    new maplibregl.Popup({ offset: 14 })
      .setLngLat(coordinates)
      .setHTML(html)
      .addTo(map);
  });

  if (features.length) {
    const bounds = new maplibregl.LngLatBounds();
    features.forEach((feature) => bounds.extend(feature.geometry.coordinates));
    map.fitBounds(bounds, { padding: 90, maxZoom: 4, duration: 0 });
  }
});
