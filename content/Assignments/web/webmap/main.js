var map = new maplibregl.Map({
  container: "map", // container id
  style: "style.json", // style URL for basemap
  center: [-95, 40], // roughly the center of the continental US
  zoom: 3,
});

map.addControl(new maplibregl.NavigationControl());

// Unlike the class example, this is a static GeoJSON file (produced by
// scrape_har_locations.py from a HAR capture of www.arch.columbia.edu), not an
// API endpoint, so the geometry is already correctly formatted and we can add
// it to the map as-is.
fetch("ip_locations.geojson")
  .then((response) => response.json())
  .then((data) => {
    // tag each feature as the origin site vs. a third-party request, so we can
    // symbolize the two differently
    data.features.forEach((feature) => {
      const host = new URL(feature.properties.url).hostname;
      feature.properties.host = host;
      feature.properties.is_origin = host.endsWith("arch.columbia.edu");
    });

    map.on("load", () => {
      map.addSource("requests", {
        type: "geojson",
        data: data,
      });

      map.addLayer({
        id: "requests-layer",
        type: "circle",
        source: "requests",
        paint: {
          "circle-radius": 8,
          "circle-stroke-width": 2,
          "circle-color": [
            "case",
            ["get", "is_origin"],
            "#0057b7",
            "#ff7800",
          ],
          "circle-stroke-color": "white",
          "circle-opacity": 0.85,
        },
      });

      // frame the map around the request locations rather than the fixed
      // continental-US default above
      const bounds = new maplibregl.LngLatBounds();
      data.features.forEach((feature) =>
        bounds.extend(feature.geometry.coordinates)
      );
      map.fitBounds(bounds, { padding: 60, maxZoom: 6 });
    });

    map.on("click", "requests-layer", (e) => {
      const coordinates = e.features[0].geometry.coordinates.slice();
      const { ip, host, is_origin } = e.features[0].properties;
      const description = `<b>${host}</b><br>${
        is_origin ? "GSAPP's own server" : "Third-party request"
      }<br>IP: ${ip}`;
      new maplibregl.Popup()
        .setLngLat(coordinates)
        .setHTML(description)
        .addTo(map);
    });

    map.on("mouseenter", "requests-layer", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "requests-layer", () => {
      map.getCanvas().style.cursor = "";
    });
  })
  .catch((error) => console.error("Error fetching data:", error));
