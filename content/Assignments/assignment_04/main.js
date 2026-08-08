const map = new maplibregl.Map({
  container: "map",
  style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  center: [-98, 39],
  zoom: 3,
  renderWorldCopies: false
});

map.addControl(new maplibregl.NavigationControl(), "top-right");

function getProvider(url) {
  const value = (url || "").toLowerCase();

  if (value.includes("uber.com") || value.includes("ubereats.com")) {
    return "Uber";
  }

  if (
    value.includes("google.com") ||
    value.includes("googleads") ||
    value.includes("googletagmanager") ||
    value.includes("doubleclick.net")
  ) {
    return "Google";
  }

  if (
    value.includes("bing.com") ||
    value.includes("clarity.ms")
  ) {
    return "Microsoft";
  }

  if (value.includes("tiktok.com")) {
    return "TikTok";
  }

  if (
    value.includes("facebook.com") ||
    value.includes("facebook.net")
  ) {
    return "Meta";
  }

  if (
    value.includes("twitter.com") ||
    value.includes("ads-twitter.com")
  ) {
    return "X / Twitter";
  }

  if (value.includes("pinterest.com")) {
    return "Pinterest";
  }

  if (
    value.includes("amazon-adsystem.com") ||
    value.includes("cloudfront.net")
  ) {
    return "Amazon / AWS";
  }

  if (value.includes("adsrvr.org")) {
    return "The Trade Desk";
  }

  return "Other";
}

map.on("load", async () => {
  const response = await fetch("./data/ip_locations.geojson");
  const geojson = await response.json();

  geojson.features.forEach((feature) => {
    feature.properties.provider = getProvider(feature.properties.url);
    feature.properties.isUber = feature.properties.provider === "Uber";
  });

  map.addSource("har-data", {
    type: "geojson",
    data: geojson
  });

  // Small center point. Uber is the only strong accent color.
  map.addLayer({
    id: "har-points",
    type: "circle",
    source: "har-data",
    paint: {
      "circle-radius": 4,
      "circle-color": "#ff4d2f",
      "circle-opacity": 1,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ff7a61",
      "circle-stroke-opacity": 1
    }
  });

  const bounds = new maplibregl.LngLatBounds();

  geojson.features.forEach((feature) => {
    if (
      feature.geometry &&
      feature.geometry.type === "Point" &&
      Array.isArray(feature.geometry.coordinates)
    ) {
      bounds.extend(feature.geometry.coordinates);
    }
  });

  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, {
      padding: 110,
      maxZoom: 6
    });
  }
});

const providerButtons = document.querySelectorAll(".provider-item");

providerButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const selectedProvider = button.dataset.provider;

    providerButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");

    const isAll = selectedProvider === "All";
    const selectedExpression = ["==", ["get", "provider"], selectedProvider];

    map.setPaintProperty(
      "har-points",
      "circle-color",
      isAll
        ? "#ff4d2f"
        : ["case", selectedExpression, "#ff4d2f", "#6b7175"]
    );

    map.setPaintProperty(
      "har-points",
      "circle-opacity",
      isAll
        ? 1
        : ["case", selectedExpression, 1, 0.06]
    );

    map.setPaintProperty(
      "har-points",
      "circle-stroke-color",
      isAll
        ? "#ff7a61"
        : ["case", selectedExpression, "#ff7a61", "#6b7175"]
    );

    map.setPaintProperty(
      "har-points",
      "circle-stroke-opacity",
      isAll
        ? 1
        : ["case", selectedExpression, 1, 0.06]
    );

  });
});

map.on("click", "har-points", (event) => {
  const feature = event.features[0];
  const properties = feature.properties || {};

  new maplibregl.Popup()
    .setLngLat(feature.geometry.coordinates)
    .setHTML(`
      <strong>Provider</strong><br>
      ${properties.provider || "Other"}<br><br>
      <strong>IP</strong><br>
      ${properties.ip || "Unknown"}<br><br>
      <strong>Request URL</strong><br>
      ${properties.url || "Unknown"}
    `)
    .addTo(map);
});

map.on("mouseenter", "har-points", () => {
  map.getCanvas().style.cursor = "pointer";
});

map.on("mouseleave", "har-points", () => {
  map.getCanvas().style.cursor = "";
});
