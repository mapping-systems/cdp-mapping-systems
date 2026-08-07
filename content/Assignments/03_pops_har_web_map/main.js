const COLORS = {
  "GitHub Pages": "#d95f4f",
  "MapLibre library": "#d5a53c",
  "CARTO basemap": "#2f7d61",
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const map = new maplibregl.Map({
  container: "map",
  style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  center: [-96, 39],
  zoom: 2.6,
  minZoom: 1.5,
});
map.addControl(new maplibregl.NavigationControl(), "top-right");

fetch("pops_request_locations.geojson")
  .then((response) => {
    if (!response.ok) throw new Error("Could not load the submitted GeoJSON.");
    return response.json();
  })
  .then((data) => {
    const features = data.features || [];
    const requestCount = features.reduce((sum, feature) => sum + Number(feature.properties.request_count || 0), 0);
    const hostnames = new Set(features.flatMap((feature) => feature.properties.hostnames || []));
    document.querySelector("#request-count").textContent = requestCount;
    document.querySelector("#server-count").textContent = features.length;
    document.querySelector("#host-count").textContent = hostnames.size;

    const list = document.querySelector("#server-list");
    features
      .slice()
      .sort((a, b) => Number(b.properties.request_count) - Number(a.properties.request_count))
      .forEach((feature) => {
        const p = feature.properties;
        const item = document.createElement("li");
        item.innerHTML = `<button type="button"><strong>${escapeHtml(p.service)}</strong><small>${escapeHtml(p.city)}, ${escapeHtml(p.region)} · ${escapeHtml(p.request_count)} requests</small></button>`;
        item.querySelector("button").addEventListener("click", () => {
          map.flyTo({ center: feature.geometry.coordinates, zoom: 6 });
          showPopup(feature);
        });
        list.appendChild(item);
      });

    map.on("load", () => {
      map.addSource("requests", { type: "geojson", data });
      map.addLayer({
        id: "request-points",
        type: "circle",
        source: "requests",
        paint: {
          "circle-color": ["match", ["get", "service"], "GitHub Pages", COLORS["GitHub Pages"], "MapLibre library", COLORS["MapLibre library"], COLORS["CARTO basemap"]],
          "circle-radius": ["interpolate", ["linear"], ["get", "request_count"], 1, 9, 8, 23],
          "circle-opacity": 0.82,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      map.on("click", "request-points", (event) => showPopup(event.features[0]));
      map.on("mouseenter", "request-points", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "request-points", () => { map.getCanvas().style.cursor = ""; });
      document.body.dataset.mapReady = "true";
    });
  })
  .catch((error) => {
    document.querySelector("#server-list").innerHTML = `<li>${escapeHtml(error.message)}</li>`;
  });

function showPopup(feature) {
  const p = feature.properties;
  const hostnames = Array.isArray(p.hostnames) ? p.hostnames : JSON.parse(p.hostnames || "[]");
  new maplibregl.Popup({ offset: 16 })
    .setLngLat(feature.geometry.coordinates)
    .setHTML(`<strong>${escapeHtml(p.service)}</strong>${escapeHtml(p.city)}, ${escapeHtml(p.region)}<br>${escapeHtml(p.request_count)} requests<br>${escapeHtml(hostnames.join(", "))}<br><small>${escapeHtml(p.organization)}</small>`)
    .addTo(map);
}
