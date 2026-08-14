// === CONFIG ===
const GEOJSON_PATH = "./outputs/ip_locations.geojson";

// === MAP SETUP ===
const map = L.map("map", {
  worldCopyJump: true,
  zoomControl: false,
}).setView([20, 10], 2);

L.control.zoom({ position: "bottomright" }).addTo(map);

L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19,
  }
).addTo(map);

// custom "ping" divIcon for each request point
function pingIcon() {
  return L.divIcon({
    className: "",
    html: `<div class="ping-marker"><span class="ring"></span><span class="core"></span></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

const cluster = L.markerClusterGroup({
  iconCreateFunction: function (c) {
    const count = c.getChildCount();
    return L.divIcon({
      html: `<span>${count}</span>`,
      className: "marker-cluster-custom",
      iconSize: L.point(36, 36),
    });
  },
  maxClusterRadius: 45,
});

const detailPanel = document.getElementById("detail");
const detailIp = document.getElementById("detail-ip");
const detailUrl = document.getElementById("detail-url");
document.getElementById("detail-close").addEventListener("click", () => {
  detailPanel.classList.add("hidden");
});

function showDetail(ip, url) {
  detailIp.textContent = ip || "unknown IP";
  detailUrl.textContent = url || "unknown URL";
  detailPanel.classList.remove("hidden");
}

// === LOAD GEOJSON ===
fetch(GEOJSON_PATH)
  .then((res) => {
    if (!res.ok) throw new Error(`Could not load ${GEOJSON_PATH} (${res.status})`);
    return res.json();
  })
  .then((geojson) => {
    const uniqueIps = new Set();

    const layer = L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => L.marker(latlng, { icon: pingIcon() }),
      onEachFeature: (feature, marker) => {
        const { ip, url, organization, city, region, request_count } =
          feature.properties || {};
        if (ip) uniqueIps.add(ip);

        const place = [city, region].filter(Boolean).join(", ");
        const label = `${ip || "unknown IP"}${
          organization ? ` — ${organization}` : ""
        }`;

        marker.bindPopup(
          `<strong>${label}</strong><br>${place}<br>${
            request_count ? `${request_count} request(s)<br>` : ""
          }${url || "unknown URL"}`
        );
        marker.on("click", () =>
          showDetail(label, `${place ? place + " — " : ""}${url || "unknown URL"}`)
        );
      },
    });

    cluster.addLayer(layer);
    map.addLayer(cluster);

    // stats
    const featureCount = geojson.features ? geojson.features.length : 0;
    document.getElementById("stat-count").textContent = featureCount;
    document.getElementById("stat-ips").textContent = uniqueIps.size;

    // fit map to data, but don't zoom in too far for a single point
    if (featureCount > 0) {
      map.fitBounds(cluster.getBounds().pad(0.25), { maxZoom: 6 });
    }
  })
  .catch((err) => {
    console.error(err);
    document.querySelector(".sub").textContent =
      `Couldn't load ${GEOJSON_PATH}. Make sure your generated GeoJSON file is in this folder and named "ip_locations.geojson" (or update GEOJSON_PATH in script.js).`;
  });
