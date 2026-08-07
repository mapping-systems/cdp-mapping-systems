var map = new maplibregl.Map({
    container: 'map', // container id
    style: 'style@440_theme@light_lang@en.json', // style URL for basemap
    center: [-98.5795, 39.8283], // starting position [lng, lat] - center of USA
    zoom: 3.5 // starting zoom
});

map.addControl(new maplibregl.NavigationControl());

map.on('load', () => {
    fetch('../ip_locations.geojson')
        .then((response) => response.json())
        .then((data) => {
            console.log(data);

            map.addSource("ip-locations", {
                type: "geojson",
                data: data
            });

            map.addLayer({
                id: "ip-locations-layer",
                type: "circle",
                source: "ip-locations",
                paint: {
                    "circle-radius": 10,
                    "circle-stroke-width": 2,
                    "circle-color": "#8d79fd",
                    "circle-stroke-color": "white",
                },
            });

            map.on("click", "ip-locations-layer", (e) => {
                const coordinates = e.features[0].geometry.coordinates.slice();
                const { ip, url } = e.features[0].properties;
                new maplibregl.Popup()
                    .setLngLat(coordinates)
                    .setHTML(`IP: ${ip}<br>URL: ${url}`)
                    .addTo(map);
            });
        });
});