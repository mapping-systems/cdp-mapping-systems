const NYC = [-73.97, 40.71];
const networkBounds = [[-127, 34], [-70, 45]];

const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    sources: {
      carto: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors © CARTO",
      },
    },
    layers: [{ id: "carto", type: "raster", source: "carto", paint: { "raster-opacity": 0.86 } }],
  },
  bounds: networkBounds,
  fitBoundsOptions: { padding: 70 },
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

function growthColor(value) {
  if (value >= 68) return "#bb3f31";
  if (value >= 58) return "#e86142";
  if (value >= 50) return "#ff8d5b";
  return "#f2c891";
}

function lineFeature(destination) {
  const points = [];
  for (let step = 0; step <= 40; step += 1) {
    const t = step / 40;
    points.push([
      NYC[0] + (destination[0] - NYC[0]) * t,
      NYC[1] + (destination[1] - NYC[1]) * t + Math.sin(Math.PI * t) * 3.8,
    ]);
  }
  return { type: "Feature", geometry: { type: "LineString", coordinates: points }, properties: {} };
}

Promise.all([
  fetch("data/server_locations.geojson").then((response) => response.json()),
  fetch("data/borough_rent_growth.geojson").then((response) => response.json()),
]).then(([servers, boroughs]) => {
  const destination = servers.features[0]?.geometry.coordinates ?? [-122.3971, 37.7621];
  const path = { type: "FeatureCollection", features: [lineFeature(destination)] };
  const origin = {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { name: "New York City" }, geometry: { type: "Point", coordinates: NYC } }],
  };

  document.querySelector("#server-count").textContent = servers.features.length;
  const locationCount = new Set(
    servers.features.map((feature) => feature.geometry.coordinates.join(",")),
  ).size;
  document.querySelector("#trace-summary").textContent = servers.features.length
    ? `${servers.metadata.har_entry_count} captured requests produced ${servers.features.length} public-IP features across ${locationCount} approximate map locations.`
    : "No public server IPs were available in the sanitized capture.";

  const list = document.querySelector("#borough-list");
  [...boroughs.features]
    .sort((a, b) => b.properties.rent_growth_pct - a.properties.rent_growth_pct)
    .forEach((feature) => {
      const row = document.createElement("div");
      row.className = "borough-row";
      row.innerHTML = `<span>${feature.properties.borough}</span><span>+${feature.properties.rent_growth_pct.toFixed(1)}%</span>`;
      list.append(row);
    });

  map.on("load", () => {
    map.addSource("boroughs", { type: "geojson", data: boroughs });
    map.addLayer({
      id: "borough-fill", type: "fill", source: "boroughs",
      paint: {
        "fill-color": ["interpolate", ["linear"], ["get", "rent_growth_pct"], 44, "#f8d6a5", 60, "#ff8d5b", 77, "#bb3f31"],
        "fill-opacity": 0.78,
      },
    });
    map.addLayer({ id: "borough-outline", type: "line", source: "boroughs", paint: { "line-color": "#15362e", "line-width": 1.2 } });
    map.addSource("request-path", { type: "geojson", data: path });
    map.addLayer({
      id: "request-path", type: "line", source: "request-path",
      paint: { "line-color": "#19755e", "line-width": 2, "line-dasharray": [2, 2], "line-opacity": .8 },
    });
    map.addSource("origin", { type: "geojson", data: origin });
    map.addLayer({
      id: "origin", type: "circle", source: "origin",
      paint: { "circle-radius": 8, "circle-color": "#f0eee7", "circle-stroke-width": 3, "circle-stroke-color": "#ff8d5b" },
    });
    map.addSource("servers", { type: "geojson", data: servers });
    map.addLayer({
      id: "servers", type: "circle", source: "servers",
      paint: { "circle-radius": 9, "circle-color": "#71e0bd", "circle-stroke-width": 3, "circle-stroke-color": "#15362e" },
    });

    map.on("click", "servers", (event) => {
      const props = event.features[0].properties;
      new maplibregl.Popup()
        .setLngLat(event.features[0].geometry.coordinates)
        .setHTML(`<div class="popup-title">${props.city}, ${props.region}</div><div>${props.organization}</div><div class="popup-note">Approximate IP geolocation—not a physical server address.</div>`)
        .addTo(map);
    });
    map.on("click", "borough-fill", (event) => {
      const props = event.features[0].properties;
      new maplibregl.Popup()
        .setLngLat(event.lngLat)
        .setHTML(`<div class="popup-title">${props.borough}</div><div>$${Number(props.baseline_rent_usd).toLocaleString()} → $${Number(props.latest_rent_usd).toLocaleString()}</div><div class="popup-note">+${Number(props.rent_growth_pct).toFixed(1)}% nominal asking rent</div>`)
        .addTo(map);
    });
    ["servers", "borough-fill"].forEach((layer) => {
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
    });
  });
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("active", item === button));
    const nycView = button.dataset.view === "nyc";
    document.querySelector("#map-note").textContent = nycView
      ? "NYC VIEW · CLICK A BOROUGH FOR RENT CHANGE"
      : "NETWORK VIEW · CLICK A MARKER FOR DETAILS";
    if (nycView) {
      map.fitBounds([[-74.27, 40.48], [-73.68, 40.94]], { padding: 55, duration: 1100 });
    } else {
      map.fitBounds(networkBounds, { padding: 70, duration: 1100 });
    }
  });
});
