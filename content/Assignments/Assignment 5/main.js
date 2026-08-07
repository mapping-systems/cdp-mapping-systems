const { createClient } = window.supabase;
const supabaseUrl = 'https://brlpcsrqpvcnrzyasiza.supabase.co';
const supabaseKey = 'sb_publishable_7pZtcL0kf3VVefUuQRFQ4g_7gchCDBG';
const supabaseClient = createClient(supabaseUrl, supabaseKey);

async function querySupabase() {
    const { data, error } = await supabaseClient
        .from("open-restaurant-inspections")
        .select("*")
        .limit(100);

    if (error) {
        console.error("Error fetching data:", error);
    } else {
        console.log("Data fetched successfully:", data);
    }
}

async function queryWithinDistance(point, n = 1000) {
    const { data, error } = await supabaseClient.rpc(
        "find_nearest_n_restaurants",
        {
            lat: point[1],
            lon: point[0],
            n: n,
        }
    );

    if (error) {
        console.error("Error fetching nearest points:", error);
        return;
    }

    console.log("Nearest points fetched successfully:", data);

    const nearestGeojson = {
        type: "FeatureCollection",
        features: data.map((row) => ({
            type: "Feature",
            properties: row,
            geometry: {
                type: "Point",
                coordinates: [row.long, row.lat]
            }
        }))
    };

    const nearestSource = map.getSource("nearest-restaurants");
    if (nearestSource) {
        nearestSource.setData(nearestGeojson);
        return;
    }

    map.addSource("nearest-restaurants", {
        type: "geojson",
        data: nearestGeojson
    });

    map.addLayer({
        id: "nearest-restaurants-layer",
        type: "circle",
        source: "nearest-restaurants",
        paint: {
            "circle-radius": 8,
            "circle-stroke-width": 2,
            "circle-color": "#00c2ff",
            "circle-stroke-color": "white",
        },
    });

    map.on("click", "nearest-restaurants-layer", (e) => {
        const coordinates = e.features[0].geometry.coordinates.slice();
        const props = e.features[0].properties;
        new maplibregl.Popup()
            .setLngLat(coordinates)
            .setHTML(`${props.name}<br>${Math.round(props.dist_meters)} m away`)
            .addTo(map);
    });
}

var map = new maplibregl.Map({
    container: 'map', // container id
    style: 'style@440_theme@light_lang@en.json',
    center: [-73.97144, 40.70491],
    zoom: 6 //
});

map.addControl(new maplibregl.NavigationControl());

map.on('load', () => {
    fetch("https://data.cityofnewyork.us/resource/43nn-pn8j.geojson")
        .then((response) => response.json())
        .then((data) => {
            data.features.forEach((feature) => {
                feature.geometry = {
                    type: "Point",
                    coordinates: [
                        Number(feature.properties.longitude),
                        Number(feature.properties.latitude)
                    ]
                };
            });

            map.addSource("restaurants", {
                type: "geojson",
                data: data
            });

            map.addLayer({
                id: "restaurants-layer",
                type: "circle",
                source: "restaurants",
                paint: {
                    "circle-radius": 6,
                    "circle-stroke-width": 2,
                    "circle-color": "#ff7800",
                    "circle-stroke-color": "white",
                },
            });

            map.on("click", "restaurants-layer", (e) => {
                const coordinates = e.features[0].geometry.coordinates.slice();
                const description = e.features[0].properties.dba;
                new maplibregl.Popup()
                    .setLngLat(coordinates)
                    .setHTML(description)
                    .addTo(map);
            });

            map.on("click", (e) => {
                const point = [e.lngLat.lng, e.lngLat.lat];
                queryWithinDistance(point, 1000);
            });
        });
});

document.addEventListener("DOMContentLoaded", () => {
    querySupabase();
});