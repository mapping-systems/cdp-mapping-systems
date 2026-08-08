const map=new maplibregl.Map({
  container:"map",
  style:{
    version:8,
    sources:{
      carto:{type:"raster",tiles:[
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
      ],tileSize:256,attribution:"© OpenStreetMap © CARTO"}
    },
    layers:[
      {id:"bg",type:"background",paint:{"background-color":"#f4f1e8"}},
      {id:"base",type:"raster",source:"carto",paint:{"raster-opacity":0.68,"raster-saturation":-0.75}}
    ]
  },
  center:[116.40,39.91],
  zoom:9.4,
  pitch:58,
  bearing:-18,
  antialias:true
});

map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),"bottom-right");

map.on("load",async()=>{
  const data=await fetch("data/dark_kitchen_rent_3d.geojson").then(r=>r.json());

  map.addSource("hex-data",{type:"geojson",data});

  map.addLayer({
    id:"hex-extrusion",
    type:"fill-extrusion",
    source:"hex-data",
    paint:{
      "fill-extrusion-color":[
        "interpolate",["linear"],["get","dark_median_rent"],
        3,"#fee5d9",
        8,"#fcbba1",
        15,"#fc9272",
        25,"#ef3b2c",
        40,"#99000d"
      ],
      "fill-extrusion-height":[
        "+",120,["*",["coalesce",["get","dark_kitchen_count"],0],180]
      ],
      "fill-extrusion-base":0,
      "fill-extrusion-opacity":0.88
    }
  });

  map.addLayer({
    id:"hex-outline",
    type:"line",
    source:"hex-data",
    paint:{"line-color":"#ffffff","line-width":0.6,"line-opacity":0.75}
  });

  const b=new maplibregl.LngLatBounds();
  data.features.forEach(f=>{
    f.geometry.coordinates[0].forEach(c=>b.extend(c));
  });
  if(!b.isEmpty()) map.fitBounds(b,{padding:{top:70,right:70,bottom:70,left:360},pitch:58,bearing:-18,duration:0});
});

map.on("mousemove","hex-extrusion",()=>map.getCanvas().style.cursor="pointer");
map.on("mouseleave","hex-extrusion",()=>map.getCanvas().style.cursor="");

map.on("click","hex-extrusion",e=>{
  const p=e.features[0].properties;
  new maplibregl.Popup()
    .setLngLat(e.lngLat)
    .setHTML(`
      <div class="popup-title">Observed Hex ${p.grid_id}</div>
      <div class="popup-row"><span>Median rent</span><strong>¥${Number(p.dark_median_rent).toFixed(2)} / ㎡ / day</strong></div>
      <div class="popup-row"><span>Dark kitchens</span><strong>${p.dark_kitchen_count}</strong></div>
      <div class="popup-row"><span>Rental samples</span><strong>${p.dark_rent_samples}</strong></div>
      <div class="popup-row"><span>Rent level</span><strong>${p.rent_level}</strong></div>
    `)
    .addTo(map);
});
