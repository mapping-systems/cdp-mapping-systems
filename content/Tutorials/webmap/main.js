var map = new maplibregl.Map({
  container: "map", // container id
  style: "style.json", // style URL for basemap
  center: [-73.97144, 40.70491], // starting position [lng, lat]
  zoom: 10, // starting zoom
});
map.addControl(new maplibregl.NavigationControl());

// Fetch pizza restaurant data from the NYC Open Data API
const jsonFeatures = fetch(
  "https://data.cityofnewyork.us/resource/43nn-pn8j.geojson?cuisine_description=Pizza&$limit=10000"
)
  .then((response) => response.json())
  .then((data) => {
    // do something with the data
    data.features.forEach((feature) => {
      feature.geometry = {
        type: "Point",
        coordinates: [
          Number(feature.properties.longitude),
          Number(feature.properties.latitude),
        ],
      };
    });

    map.on("load", () => {
      map.addSource("restaurants", {
        type: "geojson",
        data: data,
      });

      map.addLayer({
        id: "restaurants-layer",
        type: "circle",
        source: "restaurants",
        paint: {
          "circle-radius": 5,
          "circle-stroke-width": 2,
          "circle-color": "#ff7800",
          "circle-stroke-color": "white",
        },
      });
      map.on("click", "restaurants-layer", (e) => {
        console.log(e.features);
        const coordinates = e.features[0].geometry.coordinates.slice();
        const description = `${e.features[0].properties.dba} - ${e.features[0].properties.grade}`;
        new maplibregl.Popup()
          .setLngLat(coordinates)
          .setHTML(description)
          .addTo(map);
      });
    });
    // console.log("Data fetched successfully:", data);
  })
  .catch((error) => console.error("Error fetching data:", error));
