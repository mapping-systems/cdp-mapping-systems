"use strict";

const CURRENT_SERVICE_CANDIDATES = [
  "https://services.arcgis.com/wmZOI9vyUBq1zTZx/ArcGIS/rest/services/Open_Streets_Program/FeatureServer",
  "https://services.arcgis.com/wmZOI9vyUBq1zTZx/ArcGIS/rest/services/Open_Streets_Program_QA/FeatureServer"
];
const BOROUGH_PATH = "./data/borough_boundaries.geojson";
const ZCTA_URL = "https://data.cityofnewyork.us/resource/35j5-n34v.geojson?$limit=500";
const TARGET_YEAR = 2026;
const WALKSHED_KM = 0.8;
const BLUE_STOPS = [[239,246,255],[191,219,254],[96,165,250],[37,99,235],[23,37,84]];
const DAY_CODES = ["sun","mon","tue","wed","thu","fri","sat"];
const DAY_NAMES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

let allSiteData, allWalkshedData, allMarkerData, allZipData, boroughData;
let map, walkshedLayer, lineHaloLayer, lineLayer, lineHitLayer, lineGroup, markerLayer, boroughLayer;
let legendMax = 100, zipDataReady = false;

async function loadJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
  return response.json();
}

function normalizedKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function propertyLookup(properties) {
  const lookup = new Map();
  Object.entries(properties || {}).forEach(([key,value]) => lookup.set(normalizedKey(key), value));
  return lookup;
}
function pick(lookup, aliases, fallback = null) {
  for (const alias of aliases) {
    const value = lookup.get(normalizedKey(alias));
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return fallback;
}
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function parseArcDate(value) {
  if (value === null || value === undefined || value === "") return null;
  let date;
  if (typeof value === "number" || /^\d{11,}$/.test(String(value))) date = new Date(Number(value));
  else date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function isoDate(date) {
  if (!date) return "";
  const y=date.getFullYear(), m=String(date.getMonth()+1).padStart(2,"0"), d=String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function parseTime(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const text=String(value).trim().toLowerCase().replace(/\s+/g,"");
  const match=text.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
  if (!match) return null;
  let hour=Number(match[1]), minute=Number(match[2] || 0), period=match[3];
  if (period === "am" && hour === 12) hour=0;
  if (period === "pm" && hour !== 12) hour+=12;
  if (hour===24 && minute===0) return 1440;
  if (hour>23 || minute>59) return null;
  return hour*60+minute;
}
function durationHours(open, close) {
  if (!Number.isFinite(open) || !Number.isFinite(close)) return 0;
  let adjusted=close;
  if (adjusted <= open) adjusted += 1440;
  return Math.max(0,(adjusted-open)/60);
}
function uniqueWindows(windows) {
  const seen=new Set();
  return windows.filter(([open,close]) => {
    if (!Number.isFinite(open)||!Number.isFinite(close)) return false;
    const key=`${open}-${close}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function parseOpenDays(value, typeText, lookup) {
  const text=String(value || "").toLowerCase();
  const days=new Set();
  if (/daily|every day/.test(text)) DAY_CODES.forEach(d=>days.add(d));
  if (/weekday|school day/.test(text)) ["mon","tue","wed","thu","fri"].forEach(d=>days.add(d));
  if (/weekend/.test(text)) ["sat","sun"].forEach(d=>days.add(d));
  const names={mon:"mon",monday:"mon",tue:"tue",tues:"tue",tuesday:"tue",wed:"wed",wednesday:"wed",thu:"thu",thur:"thu",thurs:"thu",thursday:"thu",fri:"fri",friday:"fri",sat:"sat",saturday:"sat",sun:"sun",sunday:"sun"};
  Object.entries(names).forEach(([name,code]) => { if (new RegExp(`\\b${name}s?\\b`).test(text)) days.add(code); });
  DAY_CODES.forEach(code => {
    if (pick(lookup,[`appr${code}Open`,`approved${code}open`,`${code}open`]) !== null) days.add(code);
  });
  if (!days.size && /school/i.test(typeText || "")) ["mon","tue","wed","thu","fri"].forEach(d=>days.add(d));
  return days;
}
function windowsForDay(code, lookup, openDays) {
  if (!openDays.has(code)) return [];
  const cap=code.charAt(0).toUpperCase()+code.slice(1);
  const windows=[];
  const mainOpen=parseTime(pick(lookup,[`appr${cap}Open`,`approved${cap}open`,`${code}open`]));
  const mainClose=parseTime(pick(lookup,[`appr${cap}Close`,`approved${cap}close`,`${code}close`]));
  if (mainOpen !== null && mainClose !== null) windows.push([mainOpen,mainClose]);
  const globalPairs=[
    ["apprArrivalOpen","apprArrivalClose"],["apprMiddayOpen","apprMiddayClose"],
    ["apprRecessOpen","apprRecessClose"],["apprDismissalOpen","apprDismissalClose"]
  ];
  globalPairs.forEach(([a,b]) => {
    const o=parseTime(pick(lookup,[a])), c=parseTime(pick(lookup,[b]));
    if (o !== null && c !== null) windows.push([o,c]);
  });
  return uniqueWindows(windows);
}
function countTotalHours(startDate,endDate,dayWindows) {
  if (!startDate || !endDate || endDate < startDate) return null;
  let total=0;
  const cursor=new Date(startDate.getFullYear(),startDate.getMonth(),startDate.getDate(),12);
  const end=new Date(endDate.getFullYear(),endDate.getMonth(),endDate.getDate(),12);
  while (cursor <= end) {
    const code=DAY_CODES[cursor.getDay()];
    (dayWindows[code] || []).forEach(([o,c]) => total += durationHours(o,c));
    cursor.setDate(cursor.getDate()+1);
  }
  return total;
}
function normalizeFeature(feature,index) {
  const raw=feature.properties || {}, lookup=propertyLookup(raw);
  const onStreet=pick(lookup,["apprOnStreet","appronstre","on_street","onstreet"],"Unknown street");
  const fromStreet=pick(lookup,["apprFromStreet","apprfromst","from_street","fromstreet"],"");
  const toStreet=pick(lookup,["apprToStreet","apprtostre","to_street","tostreet"],"");
  const borough=pick(lookup,["borough","boroughname","boro"],"");
  const programType=pick(lookup,["apprOSPType","reviewstat","osp_type","programtype"],"");
  const organization=pick(lookup,["apprOrgName","orgname","organizationname"],"");
  const start=parseArcDate(pick(lookup,["apprStartDate","apprstartd","approvedstartdate"]));
  const end=parseArcDate(pick(lookup,["apprEndDate","apprenddat","approvedenddate"]));
  const appYear=Number(pick(lookup,["appYear","applicationyear","year"], start ? start.getFullYear() : NaN));
  const openDays=parseOpenDays(pick(lookup,["apprOpenDays","apprdayswe","approveddays"]), programType, lookup);
  const dayWindows={}; DAY_CODES.forEach(code => dayWindows[code]=windowsForDay(code,lookup,openDays));
  const weekly=DAY_CODES.reduce((sum,code)=>sum+(dayWindows[code]||[]).reduce((s,[o,c])=>s+durationHours(o,c),0),0);
  const total=countTotalHours(start,end,dayWindows);
  const props={
    site_id:String(index+1), "Approved On Street":String(onStreet), "Approved From Street":String(fromStreet),
    "Approved To Street":String(toStreet), "Borough Name":String(borough), program_type:String(programType),
    "Organization Name":String(organization), approved_start:isoDate(start), approved_end:isoDate(end),
    approved_days_per_week:openDays.size, weekly_approved_hours:weekly, total_approved_hours:total,
    application_year:Number.isFinite(appYear)?appYear:null, schedule_source:"NYC DOT live ArcGIS service"
  };
  DAY_CODES.forEach(code => props[`${code}_windows`]=dayWindows[code]);
  const key=[borough,onStreet,fromStreet,toStreet,organization,isoDate(start),isoDate(end),programType].map(normalizedKey).join("|");
  return {feature:{type:"Feature",properties:props,geometry:feature.geometry},key,start,end,appYear};
}
function lineParts(geometry) {
  if (!geometry) return [];
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return [];
}
function buildSites(rawGeoJSON) {
  const normalized=rawGeoJSON.features.map(normalizeFeature);
  let current=normalized.filter(item => item.appYear===TARGET_YEAR || (item.start && item.start.getFullYear()===TARGET_YEAR) || (item.end && item.end.getFullYear()>=TARGET_YEAR));
  if (!current.length) throw new Error("The current NYC DOT service returned no 2026 records.");
  const groups=new Map();
  current.forEach(item => {
    if (!groups.has(item.key)) groups.set(item.key,{properties:item.feature.properties,parts:[]});
    groups.get(item.key).parts.push(...lineParts(item.feature.geometry));
  });
  const features=[]; let id=1;
  groups.forEach(group => {
    group.properties.site_id=String(id++);
    features.push({type:"Feature",properties:group.properties,geometry:{type:"MultiLineString",coordinates:group.parts}});
  });
  return {type:"FeatureCollection",features};
}
async function queryCurrentArcGIS() {
  let lastError=null;
  for (const base of CURRENT_SERVICE_CANDIDATES) {
    try {
      let ids=[0,1,2];
      try {
        const metadata=await loadJSON(`${base}?f=json`);
        if (Array.isArray(metadata.layers) && metadata.layers.length) ids=metadata.layers.map(layer=>layer.id);
      } catch (_) {}
      for (const id of ids) {
        const params=new URLSearchParams({where:"1=1",outFields:"*",returnGeometry:"true",outSR:"4326",f:"geojson"});
        try {
          const data=await loadJSON(`${base}/${id}/query?${params.toString()}`);
          if (data && Array.isArray(data.features) && data.features.length) return buildSites(data);
        } catch (error) { lastError=error; }
      }
    } catch (error) { lastError=error; }
  }
  throw lastError || new Error("Current NYC DOT Open Streets service could not be loaded.");
}
function buildDerivedLayers(sites) {
  const walksheds=[], markers=[];
  sites.features.forEach(feature => {
    try {
      const buffer=turf.buffer(feature,WALKSHED_KM,{units:"kilometers"});
      buffer.properties={...feature.properties}; walksheds.push(buffer);
      const marker=turf.pointOnFeature(feature); marker.properties={...feature.properties}; markers.push(marker);
    } catch (error) { console.warn("Could not derive access area",error); }
  });
  return {
    walksheds:{type:"FeatureCollection",features:walksheds},
    markers:{type:"FeatureCollection",features:markers}
  };
}
function roundLegendMaximum(value) {
  if (!Number.isFinite(value)||value<=0) return 100;
  if (value>=4000) return Math.ceil(value/1000)*1000;
  if (value>=2000) return Math.ceil(value/500)*500;
  return Math.ceil(value/100)*100;
}
function interpolateRgb(start,end,amount) { return start.map((c,i)=>Math.round(c+(end[i]-c)*amount)); }
function rgbToHex(rgb) { return `#${rgb.map(v=>v.toString(16).padStart(2,"0")).join("")}`; }
function colorForHours(value) {
  if (!Number.isFinite(Number(value))) return "#d9d9d9";
  const n=Math.max(0,Math.min(1,Number(value)/legendMax)), scaled=n*(BLUE_STOPS.length-1);
  const i=Math.min(Math.floor(scaled),BLUE_STOPS.length-2);
  return rgbToHex(interpolateRgb(BLUE_STOPS[i],BLUE_STOPS[i+1],scaled-i));
}
function formatHours(value,decimals=0) {
  const n=Number(value); if (!Number.isFinite(n)) return "No valid calculation";
  return `${n.toLocaleString(undefined,{minimumFractionDigits:decimals,maximumFractionDigits:decimals})} hours`;
}
function popupContent(p) {
  return `<div class="open-street-popup"><div class="open-street-popup-title">${escapeHtml(p["Approved On Street"])}</div>
  <div><strong>From:</strong> ${escapeHtml(p["Approved From Street"])}</div><div><strong>To:</strong> ${escapeHtml(p["Approved To Street"])}</div>
  <div><strong>Borough:</strong> ${escapeHtml(p["Borough Name"])}</div><div><strong>Open Street type:</strong> ${escapeHtml(p.program_type)}</div>
  <div><strong>Listed partner:</strong> ${escapeHtml(p["Organization Name"])}</div>
  <div><strong>Approved period:</strong> ${escapeHtml(p.approved_start)}–${escapeHtml(p.approved_end)}</div>
  <div><strong>Days open per week:</strong> ${escapeHtml(p.approved_days_per_week)}</div>
  <div><strong>Approved hours per week:</strong> ${formatHours(p.weekly_approved_hours,1)}</div>
  <div><strong>Total approved time:</strong> ${formatHours(p.total_approved_hours,0)}</div></div>`;
}
function bindFeatureInteraction(feature,layer) {
  const p=feature.properties||{};
  layer.bindTooltip(`<strong>${escapeHtml(p["Approved On Street"])}</strong><br>${formatHours(p.total_approved_hours,0)}`,{sticky:false});
  layer.bindPopup(popupContent(p),{maxWidth:350});
}
function makeFeatureCollection(features) { return {type:"FeatureCollection",features}; }
function updateGeoJsonLayer(layer,features) { layer.clearLayers(); layer.addData(makeFeatureCollection(features)); }
function createLegend() {
  const ticks=Array.from({length:5},(_,i)=>Math.round(legendMax*i/4));
  document.getElementById("legend-values").innerHTML=ticks.map(v=>`<span>${v.toLocaleString()}</span>`).join("");
}
function createZipOptions() {
  const options=[...new Set(allZipData.features.map(f=>String(f.properties.zcta5||"")).filter(v=>/^\d{5}$/.test(v)))].sort();
  document.getElementById("zip-options").innerHTML=options.map(z=>`<option value="${z}"></option>`).join("");
}
function createMap() {
  map=L.map("map",{zoomControl:true,preferCanvas:true}).setView([40.7128,-73.95],10);
  [["walkshedPane",410],["lineHaloPane",420],["linePane",430],["lineHitPane",435],["markerPane",440],["labelPane",650]].forEach(([name,z])=>{map.createPane(name);map.getPane(name).style.zIndex=z;});
  map.getPane("labelPane").style.pointerEvents="none";
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",{attribution:"© OpenStreetMap contributors © CARTO",maxZoom:20,opacity:.95}).addTo(map);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png",{attribution:"© OpenStreetMap contributors © CARTO",maxZoom:20,opacity:.72,pane:"labelPane"}).addTo(map);
  boroughLayer=L.geoJSON(boroughData,{style:()=>({fillOpacity:0,color:"#9ca3af",weight:.65,opacity:.6,dashArray:"2,5"}),interactive:false}).addTo(map);
  walkshedLayer=L.geoJSON(allWalkshedData,{pane:"walkshedPane",interactive:false,style:f=>({fillColor:colorForHours(f.properties.total_approved_hours),fillOpacity:.53,color:"#7e9bb5",weight:.45,opacity:.65,dashArray:"2,5"})}).addTo(map);
  lineHaloLayer=L.geoJSON(allSiteData,{pane:"lineHaloPane",interactive:false,style:()=>({color:"#fff",weight:10,opacity:.92})});
  lineLayer=L.geoJSON(allSiteData,{pane:"linePane",interactive:false,style:()=>({color:"#4087c9",weight:5,opacity:.98})});
  lineHitLayer=L.geoJSON(allSiteData,{pane:"lineHitPane",style:()=>({color:"#5bb6da",weight:14,opacity:.01}),onEachFeature:(f,l)=>{bindFeatureInteraction(f,l);l.on({mouseover:e=>e.target.setStyle({color:"#5bb6da",weight:8,opacity:.48}),mouseout:e=>lineHitLayer.resetStyle(e.target)});}});
  lineGroup=L.layerGroup([lineHaloLayer,lineLayer,lineHitLayer]).addTo(map);
  markerLayer=L.geoJSON(allMarkerData,{pane:"markerPane",pointToLayer:(f,ll)=>L.circleMarker(ll,{radius:4.2,color:"#5bb6da",weight:1.4,fill:true,fillColor:"#fff",fillOpacity:1}),onEachFeature:(f,l)=>{bindFeatureInteraction(f,l);l.on({mouseover:()=>{l.setRadius(5.4);l.setStyle({color:"#328fba",weight:1.7,fillColor:"#e8f8ff"});},mouseout:()=>{l.setRadius(4.2);l.setStyle({color:"#5bb6da",weight:1.4,fillColor:"#fff"});}});}}).addTo(map);
  L.control.layers(null,{"Walking-access areas":walkshedLayer,"Open Street lines":lineGroup,"Reference points":markerLayer,"Borough boundaries":boroughLayer},{collapsed:true,position:"bottomright"}).addTo(map);
  const panel=document.querySelector(".filter-panel"); L.DomEvent.disableClickPropagation(panel); L.DomEvent.disableScrollPropagation(panel);
  setTimeout(()=>{map.invalidateSize(true);if(lineLayer.getBounds().isValid())map.fitBounds(lineLayer.getBounds(),{padding:[24,24]});},100);
}
function matchesDateTime(p,value) {
  if (!value) return true;
  const [datePart,timePart]=value.split("T"); if(!datePart||!timePart)return true;
  if(p.approved_start&&datePart<p.approved_start)return false;
  if(p.approved_end&&datePart>p.approved_end)return false;
  const [y,m,d]=datePart.split("-").map(Number), selected=new Date(y,m-1,d,12);
  const code=DAY_CODES[selected.getDay()], [h,min]=timePart.split(":").map(Number), minutes=h*60+min;
  const windows=p[`${code}_windows`]||[];
  return windows.some(([o,c])=>{let close=c;if(close<=o)close+=1440;let selectedMinute=minutes;if(selectedMinute<o&&close>1440)selectedMinute+=1440;return selectedMinute>=o&&selectedMinute<close;});
}
function selectedZipFeature(value) { if(!value||!zipDataReady)return null;return allZipData.features.find(f=>String(f.properties.zcta5||"")===value)||null; }
function matchesZip(feature,zipFeature) { if(!zipFeature)return true;try{return turf.booleanIntersects(feature,zipFeature);}catch(_){return false;} }
function applyOpenStreetFilters(adjustView=true) {
  const zipValue=document.getElementById("zip-filter").value.trim(), dateTimeValue=document.getElementById("datetime-filter").value||"", result=document.getElementById("result-count"), zipFeature=selectedZipFeature(zipValue);
  if(zipValue&&!zipDataReady){result.innerHTML='<span class="error-message">ZIP boundaries are still loading.</span>';return;}
  if(zipValue&&!zipFeature){result.innerHTML='<span class="error-message">ZIP Code not found.</span>';return;}
  const sites=allSiteData.features.filter(f=>matchesDateTime(f.properties||{},dateTimeValue)&&matchesZip(f,zipFeature));
  const ids=new Set(sites.map(f=>String(f.properties.site_id)));
  updateGeoJsonLayer(lineHaloLayer,sites);updateGeoJsonLayer(lineLayer,sites);updateGeoJsonLayer(lineHitLayer,sites);
  updateGeoJsonLayer(walkshedLayer,allWalkshedData.features.filter(f=>ids.has(String(f.properties.site_id))));
  updateGeoJsonLayer(markerLayer,allMarkerData.features.filter(f=>ids.has(String(f.properties.site_id))));
  const desc=[];if(dateTimeValue)desc.push(`open at ${dateTimeValue.replace("T"," ")}`);if(zipValue)desc.push(`in ZIP ${zipValue}`);
  result.innerHTML=sites.length?`<strong>${sites.length} Open Street${sites.length===1?"":"s"} shown</strong>${desc.length?`<br>${escapeHtml(desc.join(" and "))}`:"<br>Showing all current 2026 sites"}`:`<span class="error-message">0 Open Streets found</span>${desc.length?`<br>${escapeHtml(desc.join(" and "))}`:""}`;
  map.invalidateSize(true);if(!adjustView)return;
  if(zipFeature){const b=L.geoJSON(zipFeature).getBounds();if(b.isValid()){map.fitBounds(b,{padding:[30,30],maxZoom:14});return;}}
  if(sites.length&&lineLayer.getBounds().isValid())map.fitBounds(lineLayer.getBounds(),{padding:[35,35],maxZoom:14});
}
function attachEvents() {
  document.getElementById("search-button").addEventListener("click",()=>applyOpenStreetFilters(true));
  document.getElementById("clear-button").addEventListener("click",()=>{document.getElementById("zip-filter").value="";document.getElementById("datetime-filter").value="";applyOpenStreetFilters(true);});
  ["zip-filter","datetime-filter"].forEach(id=>document.getElementById(id).addEventListener("keydown",e=>{if(e.key==="Enter")applyOpenStreetFilters(true);}));
}
function median(values) { const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2; }
async function initialize() {
  const result=document.getElementById("result-count"), status=document.getElementById("source-status");
  try {
    if(typeof turf==="undefined")throw new Error("Turf.js did not load.");
    [boroughData,allSiteData]=await Promise.all([loadJSON(BOROUGH_PATH),queryCurrentArcGIS()]);
    const derived=buildDerivedLayers(allSiteData);allWalkshedData=derived.walksheds;allMarkerData=derived.markers;
    allWalkshedData.features.sort((a,b)=>Number(a.properties.total_approved_hours||0)-Number(b.properties.total_approved_hours||0));
    const hours=allSiteData.features.map(f=>Number(f.properties.total_approved_hours)).filter(Number.isFinite);legendMax=roundLegendMaximum(Math.max(...hours));
    createLegend();createMap();attachEvents();applyOpenStreetFilters(false);
    status.textContent=`Current 2026 records loaded from NYC DOT · ${allSiteData.features.length} sites`;
    window.parent.postMessage({type:"open-streets-live-summary",year:TARGET_YEAR,siteCount:allSiteData.features.length,medianHours:median(hours)},"*");
    try { allZipData=await loadJSON(ZCTA_URL);zipDataReady=true;createZipOptions(); }
    catch(error){console.warn(error);const input=document.getElementById("zip-filter");input.disabled=true;input.placeholder="ZIP search unavailable";}
  } catch(error) {
    console.error(error);result.innerHTML='<span class="error-message">Current 2026 map data could not be loaded.</span><br>Check the browser console and internet connection.';
    status.textContent="Live NYC DOT data unavailable";status.classList.add("error-message");
  }
}
initialize();
