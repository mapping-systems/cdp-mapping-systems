"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  Map as MapboxMap,
  Marker,
  Popup,
  StyleSpecification,
} from "maplibre-gl";
import { bbox, distance as turfDistance, lineString, point } from "@turf/turf";
import type {
  Feature,
  FeatureCollection,
  Point,
  Polygon,
} from "geojson";
import type {
  CellProperties,
  DriveNetwork,
  HeightMode,
  InteractionMode,
  Manifest,
  RouteResult,
  ScenarioId,
  StationAccess,
  SubwayGraph,
  ViewMode,
  WalkNetwork,
  WorkerResult,
} from "../lib/types";

declare global {
  interface Window {
    mapboxgl?: typeof import("maplibre-gl");
    maplibregl?: typeof import("maplibre-gl");
  }
}

type CellCollection = FeatureCollection<Polygon, CellProperties>;
type SimpleCollection = FeatureCollection;
type Destination = { lng: number; lat: number; label: string };
type StationFeature = Feature<
  Point,
  { station_index: number; stop_id: string; name: string; routes: string }
>;
type PopupRouteStatus = "loading" | "ready" | "error";
type HoverPopupContext = {
  cell: number;
  properties: CellProperties;
  requestId: number;
  cacheKey: string;
};
type RideLeg = {
  route: string;
  fromStation: number;
  toStation: number;
  minutes: number;
  stops: number;
};

const PRESETS: Destination[] = [
  { lng: -73.9636, lat: 40.8075, label: "Columbia GSAPP" },
  { lng: -73.9772, lat: 40.7527, label: "Grand Central" },
  { lng: -73.9896, lat: 40.6924, label: "Downtown Brooklyn" },
];

const SCENARIO_LABELS: Record<ScenarioId, string> = {
  weekday_am: "Weekday AM",
  weekday_midday: "Weekday Midday",
  weekend: "Weekend",
};

const VIEW_LABELS: Record<ViewMode, string> = {
  subway: "Subway",
  driving: "Driving",
  walking: "Walking",
};

const VIEW_DESCRIPTIONS: Record<ViewMode, string> = {
  subway: "Walk + wait + ride + transfer + walk",
  driving: "OSM road time · no live traffic or parking",
  walking: "OSM pedestrian shortest path · 4.8 km/h",
};

const ROUTE_GRAPH_ASSETS: Record<ScenarioId, string> = {
  weekday_am: "/data/subway-graph-weekday-am.json",
  weekday_midday: "/data/subway-graph-weekday-midday.json",
  weekend: "/data/subway-graph-weekend.json",
};

const HEIGHT_LABELS: Record<HeightMode, string> = {
  time: "Time remaining",
  rent: "Estimated rent",
};

function publicAsset(path: string): string {
  if (
    typeof window !== "undefined" &&
    window.location.hostname.endsWith("github.io")
  ) {
    const pathname = window.location.pathname;
    const deploymentBase = pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname.slice(0, pathname.lastIndexOf("/"));
    return `${deploymentBase}${path}`;
  }
  return path;
}

async function fetchJsonAsset<T>(path: string): Promise<T> {
  const response = await fetch(publicAsset(path));
  if (!response.ok) {
    throw new Error(`Asset request failed (${response.status}): ${path}`);
  }
  return (await response.json()) as T;
}

async function fetchArrayBufferAsset(path: string): Promise<ArrayBuffer> {
  const response = await fetch(publicAsset(path));
  if (!response.ok) {
    throw new Error(`Asset request failed (${response.status}): ${path}`);
  }
  return response.arrayBuffer();
}

let scrollBehaviorRestoreFrame: number | null = null;
let previousInlineScrollBehavior: string | null = null;

function scrollInstantlyToTop() {
  const root = document.documentElement;
  if (previousInlineScrollBehavior === null) {
    previousInlineScrollBehavior = root.style.scrollBehavior;
  }
  if (scrollBehaviorRestoreFrame !== null) {
    window.cancelAnimationFrame(scrollBehaviorRestoreFrame);
  }
  root.style.scrollBehavior = "auto";
  window.scrollTo({ top: 0, left: 0 });
  scrollBehaviorRestoreFrame = window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0 });
    scrollBehaviorRestoreFrame = window.requestAnimationFrame(() => {
      if (previousInlineScrollBehavior) {
        root.style.scrollBehavior = previousInlineScrollBehavior;
      } else {
        root.style.removeProperty("scroll-behavior");
      }
      previousInlineScrollBehavior = null;
      scrollBehaviorRestoreFrame = null;
    });
  });
}

function clearPageHashForIntro() {
  if (!window.location.hash) return;
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
}

const ROUTE_COLORS: Record<string, string> = {
  "1": "#EE352E",
  "2": "#EE352E",
  "3": "#EE352E",
  "4": "#00933C",
  "5": "#00933C",
  "6": "#00933C",
  "6X": "#00933C",
  "7": "#B933AD",
  "7X": "#B933AD",
  A: "#0039A6",
  C: "#0039A6",
  E: "#0039A6",
  B: "#FF6319",
  D: "#FF6319",
  F: "#FF6319",
  FX: "#FF6319",
  M: "#FF6319",
  G: "#6CBE45",
  J: "#996633",
  Z: "#996633",
  L: "#A7A9AC",
  N: "#FCCC0A",
  Q: "#FCCC0A",
  R: "#FCCC0A",
  W: "#FCCC0A",
  SI: "#0039A6",
  FS: "#808183",
  GS: "#808183",
  H: "#808183",
};

const ROUTE_ORDER = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "6X",
  "7",
  "7X",
  "A",
  "C",
  "E",
  "B",
  "D",
  "F",
  "FX",
  "M",
  "G",
  "J",
  "Z",
  "L",
  "N",
  "Q",
  "R",
  "W",
  "SI",
  "FS",
  "GS",
  "H",
];
const ROUTE_ORDER_INDEX = new Map(
  ROUTE_ORDER.map((route, index) => [route, index]),
);
const HOVER_POPUP_DELAY_MS = 420;

function routeTextColor(route: string) {
  return ["N", "Q", "R", "W"].includes(route) ? "#111111" : "#ffffff";
}

function RouteBullet({
  route,
  className = "",
}: {
  route: string;
  className?: string;
}) {
  return (
    <span
      className={`route-bullet ${className}`.trim()}
      data-length={route.length}
      data-route={route}
      style={{
        background: ROUTE_COLORS[route] || "#6f6f6f",
        color: routeTextColor(route),
      }}
    >
      <b>{route}</b>
    </span>
  );
}

const ROUTE_VIEWBOX = { width: 1440, height: 900, edgePadding: 120 };
const ROUTE_PATHS: Record<
  string,
  (left: number, right: number) => string
> = {
  "map-route-manhattan": (left, right) =>
    `M${left} 160H960L1010 110L1040 80L1080 120V220L1050 250V330L1020 360V430L990 460L950 500L910 460L950 420V340L980 310V230L1010 200L1050 240H${right}`,
  "map-route-queens": (left, right) =>
    `M${left} 320H1080L1120 280L1160 240H1360L1400 280V400L1360 440H1210L1200 450L1160 410V320L1200 360H${right}`,
  "map-route-brooklyn": (left, right) =>
    `M${left} 410H960L1000 450L1040 410H1160L1200 450H1340L1380 490L1340 530V630L1300 670H1080L1040 630V550L1000 510L1040 550H${right}`,
  "map-route-bronx": (left, right) =>
    `M${left} 80H960L1000 40H1130L1170 80V180L1130 220H1080V120L1040 80L1080 40H${right}`,
  "map-route-staten-island": (left, right) =>
    `M${left} 250H820V490L900 570L940 530H1040L1080 570V670L1040 710H940L900 670L940 630H${right}`,
};

function OpeningFilm({
  time,
  transitioning,
  finished,
}: {
  time: number;
  transitioning: boolean;
  finished: boolean;
}) {
  return (
    <div
      className={`opening-film${transitioning ? " is-transitioning" : ""}${
        finished ? " is-finished" : " is-replaying"
      }`}
      aria-hidden="true"
    >
      <div className="opening-grid" />
      <svg
        className="opening-routes route-map"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid meet"
        focusable="false"
      >
        <g className="borough-outlines">
          <path
            className="map-outline borough-outline-manhattan"
            pathLength="100"
            d="M1040 80L1080 120V220L1050 250V330L1020 360V430L990 460L950 500L910 460L950 420V340L980 310V230L1010 200V110Z"
          />
          <path
            className="map-outline borough-outline-bronx"
            pathLength="100"
            d="M1040 80L1000 40H1130L1170 80V180L1130 220H1080V120Z"
          />
          <path
            className="map-outline borough-outline-queens"
            pathLength="100"
            d="M1160 240H1360L1400 280V400L1360 440H1210L1200 450L1160 410V320L1120 280Z"
          />
          <path
            className="map-outline borough-outline-brooklyn"
            pathLength="100"
            d="M1000 450L1040 410H1160L1200 450H1340L1380 490L1340 530V630L1300 670H1080L1040 630V550L1000 510Z"
          />
          <path
            className="map-outline borough-outline-staten-island"
            pathLength="100"
            d="M900 570L940 530H1040L1080 570V670L1040 710H940L900 670Z"
          />
        </g>
        <g className="map-route-lines">
          <path
            className="map-route map-route-manhattan"
            pathLength="100"
            d="M-120 160H960L1010 110L1040 80L1080 120V220L1050 250V330L1020 360V430L990 460L950 500L910 460L950 420V340L980 310V230L1010 200L1050 240H1560"
          />
          <path
            className="map-route map-route-queens"
            pathLength="100"
            d="M-120 320H1080L1120 280L1160 240H1360L1400 280V400L1360 440H1210L1200 450L1160 410V320L1200 360H1560"
          />
          <path
            className="map-route map-route-brooklyn"
            pathLength="100"
            d="M-120 410H960L1000 450L1040 410H1160L1200 450H1340L1380 490L1340 530V630L1300 670H1080L1040 630V550L1000 510L1040 550H1560"
          />
          <path
            className="map-route map-route-bronx"
            pathLength="100"
            d="M-120 80H960L1000 40H1130L1170 80V180L1130 220H1080V120L1040 80L1080 40H1560"
          />
          <path
            className="map-route map-route-staten-island"
            pathLength="100"
            d="M-120 250H820V490L900 570L940 530H1040L1080 570V670L1040 710H940L900 670L940 630H1560"
          />
        </g>
        <g className="map-stations">
          <circle className="map-station station-manhattan" cx="1010" cy="110" r="12" />
          <circle className="map-station station-manhattan" cx="1050" cy="250" r="12" />
          <circle className="map-station station-manhattan" cx="950" cy="500" r="12" />
          <circle className="map-station station-queens" cx="1160" cy="240" r="12" />
          <circle className="map-station station-queens" cx="1360" cy="440" r="12" />
          <circle className="map-station station-brooklyn" cx="1000" cy="450" r="12" />
          <circle className="map-station station-brooklyn" cx="1340" cy="530" r="12" />
          <circle className="map-station station-bronx" cx="1000" cy="40" r="12" />
          <circle className="map-station station-bronx" cx="1130" cy="220" r="12" />
          <circle className="map-station station-staten-island" cx="900" cy="570" r="12" />
          <circle className="map-station station-staten-island" cx="1040" cy="710" r="12" />
          <circle className="map-transfer" cx="1200" cy="450" r="14" />
        </g>
      </svg>
      <div className="opening-copy">
        <p>NYC Commute Network / 15–90 Minutes</p>
        <h1>
          NYC
          <br />
          TIME FIELD
        </h1>
        <div className="opening-year">
          <span key={time}>{time} MIN</span>
        </div>
      </div>
    </div>
  );
}

function readUrlState() {
  const query = new URLSearchParams(window.location.search);
  const lng = query.has("lng") ? Number(query.get("lng")) : Number.NaN;
  const lat = query.has("lat") ? Number(query.get("lat")) : Number.NaN;
  const minutes = Math.min(90, Math.max(15, Number(query.get("minutes")) || 35));
  const scenarioValues: ScenarioId[] = [
    "weekday_am",
    "weekday_midday",
    "weekend",
  ];
  const viewValues: ViewMode[] = ["subway", "driving", "walking"];
  const heightValues: HeightMode[] = ["time", "rent"];
  const scenario = scenarioValues.includes(query.get("scenario") as ScenarioId)
    ? (query.get("scenario") as ScenarioId)
    : "weekday_am";
  const viewMode = viewValues.includes(query.get("mode") as ViewMode)
    ? (query.get("mode") as ViewMode)
    : "subway";
  const heightMode = heightValues.includes(query.get("height") as HeightMode)
    ? (query.get("height") as HeightMode)
    : "time";
  const insideStudyArea =
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -74.34 &&
    lng <= -73.67 &&
    lat >= 40.45 &&
    lat <= 41.02;
  return {
    destination: insideStudyArea
      ? { lng, lat, label: "Shared destination" }
      : PRESETS[0],
    minutes,
    scenario,
    viewMode,
    heightMode,
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: value > 999_999 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stationName(stations: SimpleCollection | null, stationIndex: number) {
  const feature = (stations?.features as StationFeature[] | undefined)?.[
    stationIndex
  ];
  return feature?.properties.name || "subway station";
}

function buildRideLegs(route: RouteResult): RideLeg[] {
  const legs: RideLeg[] = [];
  let current: RideLeg | null = null;
  for (const edge of route.edges) {
    if (edge.kind !== "ride") {
      current = null;
      continue;
    }
    const sameLeg =
      current &&
      current.route === edge.route &&
      current.toStation === edge.from_station;
    if (sameLeg && current) {
      current.toStation = edge.to_station;
      current.minutes += edge.ride_minutes;
      if (edge.from_station !== edge.to_station) current.stops += 1;
      continue;
    }
    current = {
      route: edge.route,
      fromStation: edge.from_station,
      toStation: edge.to_station,
      minutes: edge.ride_minutes,
      stops: edge.from_station === edge.to_station ? 0 : 1,
    };
    legs.push(current);
  }
  return legs;
}

function routeBadge(route: string) {
  const background = ROUTE_COLORS[route] || "#6f6f6f";
  const color = routeTextColor(route);
  return `<span class="route-bullet popup-line-badge" data-length="${route.length}" data-route="${escapeHtml(route)}" style="background:${background};color:${color}"><b>${escapeHtml(route)}</b></span>`;
}

function popupJourneyHtml({
  cell,
  destination,
  result,
  route,
  status,
  stations,
  viewMode,
}: {
  cell: number;
  destination: Destination;
  result: WorkerResult | null;
  route: RouteResult | null;
  status: PopupRouteStatus;
  stations: SimpleCollection | null;
  viewMode: ViewMode;
}) {
  if (!result) {
    return `<section class="popup-journey popup-route-loading" aria-live="polite"><div class="popup-spinner"></div><div><strong>Preparing commute model…</strong><small>Loading the network for this destination.</small></div></section>`;
  }
  const total =
    viewMode === "driving"
      ? result.drivingTimes[cell]
      : viewMode === "walking"
        ? result.directTimes[cell]
        : result.times[cell];
  const destinationLabel = escapeHtml(destination.label);

  if (viewMode !== "subway") {
    const verb = viewMode === "driving" ? "Drive" : "Walk";
    const note =
      viewMode === "driving"
        ? "Free-flow road estimate; live traffic and parking are not included."
        : "Shortest modeled pedestrian path at 4.8 km/h.";
    return (
      `<section class="popup-journey" aria-label="${escapeHtml(verb)} route to ${destinationLabel}">` +
      `<div class="popup-journey-heading"><span>ROUTE TO ${destinationLabel}</span><strong>${total.toFixed(1)} min</strong></div>` +
      `<ol class="popup-steps"><li class="popup-step"><span class="popup-step-icon ${viewMode}">${viewMode === "driving" ? "D" : "W"}</span><div><strong>${verb} ${total.toFixed(1)} min</strong><small>From this hex to ${destinationLabel}</small></div></li></ol>` +
      `<p class="popup-route-note">${escapeHtml(note)}</p></section>`
    );
  }

  if (status === "loading") {
    return (
      `<section class="popup-journey popup-route-loading" aria-live="polite">` +
      `<div class="popup-spinner"></div><div><strong>Building the fastest route…</strong>` +
      `<small>Tracing scheduled trains, transfers, and walking links.</small></div>` +
      `<div class="popup-route-skeleton"><i></i><i></i><i></i></div></section>`
    );
  }
  if (status === "error" || !route) {
    return (
      `<section class="popup-journey popup-route-error" aria-live="polite">` +
      `<strong>Route details are unavailable.</strong>` +
      `<small>The total time is still valid. Click the hex to inspect it in the full route panel.</small></section>`
    );
  }

  if (route.originStation < 0) {
    return (
      `<section class="popup-journey" aria-label="Direct walking route to ${destinationLabel}">` +
      `<div class="popup-journey-heading"><span>ROUTE TO ${destinationLabel}</span><strong>${total.toFixed(1)} min</strong></div>` +
      `<ol class="popup-steps"><li class="popup-step"><span class="popup-step-icon walking">W</span><div><strong>Walk directly · ${total.toFixed(1)} min</strong><small>The pedestrian network is faster than entering the subway.</small></div></li></ol></section>`
    );
  }

  if (
    route.originStation !== route.destinationStation &&
    route.edges.length === 0
  ) {
    return (
      `<section class="popup-journey popup-route-error" aria-live="polite">` +
      `<strong>The detailed station path could not be reconstructed.</strong>` +
      `<small>The ${total.toFixed(1)}-minute matrix result remains available in the map.</small></section>`
    );
  }

  const originWalk = result.originWalk[cell];
  const destinationWalk = result.destinationWalk[cell];
  const originName = escapeHtml(stationName(stations, route.originStation));
  const destinationStationName = escapeHtml(
    stationName(stations, route.destinationStation),
  );
  const legs = buildRideLegs(route);
  const transferCount = Math.max(0, legs.length - 1);
  const transferMinutes =
    transferCount > 0 ? route.transferMinutes / transferCount : 0;
  const steps: string[] = [
    `<li class="popup-step"><span class="popup-step-icon walking">W</span><div><strong>Walk + enter · ${originWalk.toFixed(1)} min</strong><small>To ${originName}</small></div></li>`,
  ];
  if (route.waitMinutes > 0) {
    steps.push(
      `<li class="popup-step"><span class="popup-step-icon wait">~</span><div><strong>Expected platform waits · ${route.waitMinutes.toFixed(1)} min</strong><small>Half-headway estimate across the trip</small></div></li>`,
    );
  }
  legs.forEach((leg, index) => {
    if (index > 0) {
      const transferAt = escapeHtml(
        stationName(stations, legs[index - 1].toStation),
      );
      steps.push(
        `<li class="popup-step"><span class="popup-step-icon transfer">↳</span><div><strong>Transfer to ${escapeHtml(leg.route)}${transferMinutes > 0 ? ` · ${transferMinutes.toFixed(1)} min` : ""}</strong><small>At ${transferAt}</small></div></li>`,
      );
    }
    const from = escapeHtml(stationName(stations, leg.fromStation));
    const to = escapeHtml(stationName(stations, leg.toStation));
    steps.push(
      `<li class="popup-step"><span class="popup-step-badge">${routeBadge(leg.route)}</span><div><strong>Take ${escapeHtml(leg.route)} · ${leg.minutes.toFixed(1)} min</strong><small>${from} → ${to} · ${leg.stops} ${leg.stops === 1 ? "stop" : "stops"}</small></div></li>`,
    );
  });
  steps.push(
    `<li class="popup-step"><span class="popup-step-icon walking">W</span><div><strong>Exit + walk · ${destinationWalk.toFixed(1)} min</strong><small>${destinationStationName} → ${destinationLabel}</small></div></li>`,
  );

  return (
    `<section class="popup-journey" aria-label="Modeled route to ${destinationLabel}">` +
    `<div class="popup-journey-heading"><span>ROUTE TO ${destinationLabel}</span><strong>${total.toFixed(1)} min</strong></div>` +
    `<ol class="popup-steps">${steps.join("")}</ol>` +
    `<p class="popup-route-note">${SCENARIO_LABELS[route.scenario]} scheduled service · ${legs.length > 1 ? `${legs.length - 1} transfer${legs.length > 2 ? "s" : ""}` : "no transfer"}</p></section>`
  );
}

function popupHtml({
  context,
  destination,
  minutes,
  result,
  route,
  status,
  stations,
  viewMode,
}: {
  context: HoverPopupContext;
  destination: Destination;
  minutes: number;
  result: WorkerResult | null;
  route: RouteResult | null;
  status: PopupRouteStatus;
  stations: SimpleCollection | null;
  viewMode: ViewMode;
}) {
  const properties = context.properties;
  const travel = result
    ? viewMode === "driving"
      ? result.drivingTimes[context.cell]
      : viewMode === "walking"
        ? result.directTimes[context.cell]
        : result.times[context.cell]
    : Number(properties.travel_time);
  const rent = Number(properties.rent_estimate);
  const rentMoe = Number(properties.rent_estimate_moe);
  const reachable = Number.isFinite(travel) && travel <= minutes;
  const rentLine =
    Number.isFinite(rent) && rent > 0
      ? `<div class="popup-rent"><strong>${escapeHtml(formatCurrency(rent))}</strong><small>estimated median gross rent / month</small>${Number.isFinite(rentMoe) && rentMoe > 0 ? `<em>ACS + residential-lot allocation · ±${escapeHtml(formatCurrency(rentMoe))}</em>` : ""}</div>`
      : "";
  return (
    `<div class="popup-kicker">${escapeHtml(VIEW_LABELS[viewMode])} commute</div>` +
    `<strong class="popup-title">${escapeHtml(properties.nta_name)}</strong>` +
    `<div class="popup-time">${reachable ? `${travel.toFixed(1)} min` : `Beyond ${minutes} min`}</div>` +
    rentLine +
    `<small class="popup-units">${formatNumber(Number(properties.housing_units))} residential units in this hex</small>` +
    popupJourneyHtml({
      cell: context.cell,
      destination,
      result,
      route,
      status,
      stations,
      viewMode,
    })
  );
}

function cloneCells(cells: CellCollection): CellCollection {
  return {
    type: "FeatureCollection",
    features: cells.features.map((feature) => ({
      ...feature,
      properties: { ...feature.properties },
    })),
  };
}

function nearestCell(
  cells: CellCollection,
  _cellLookup: Map<string, number>,
  lng: number,
  lat: number,
) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const feature of cells.features) {
    const ring = feature.geometry.coordinates[0];
    const centerLng =
      ring.reduce((sum, coordinate) => sum + coordinate[0], 0) / ring.length;
    const centerLat =
      ring.reduce((sum, coordinate) => sum + coordinate[1], 0) / ring.length;
    const distance = (centerLng - lng) ** 2 + (centerLat - lat) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = feature.properties.cell_index;
    }
  }
  return bestIndex;
}

export function TimeField() {
  const initial = useMemo(
    () => ({
      destination: PRESETS[0],
      minutes: 35,
      scenario: "weekday_am" as ScenarioId,
      viewMode: "subway" as ViewMode,
      heightMode: "time" as HeightMode,
    }),
    [],
  );
  const heroRef = useRef<HTMLElement>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const routeGraphPromisesRef = useRef(
    new Map<ScenarioId, Promise<void>>(),
  );
  const resultRef = useRef<WorkerResult | null>(null);
  const stationsRef = useRef<SimpleCollection | null>(null);
  const scenarioRef = useRef<ScenarioId>(initial.scenario);
  const hoverPopupContextRef = useRef<HoverPopupContext | null>(null);
  const hoverPopupTimerRef = useRef<number | null>(null);
  const hoverRequestSequenceRef = useRef(0);
  const inspectRequestSequenceRef = useRef(0);
  const hoverRouteCacheRef = useRef(new Map<string, RouteResult>());
  const hoverPopupRenderRef = useRef<
    (status: PopupRouteStatus, route?: RouteResult | null) => void
  >(() => undefined);
  const interactionRef = useRef<InteractionMode>("destination");
  const viewModeRef = useRef<ViewMode>(initial.viewMode);
  const destinationRef = useRef<Destination>(initial.destination);
  const minutesRef = useRef(35);
  const playTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncRouteMapRef = useRef<() => void>(() => undefined);

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [cells, setCells] = useState<CellCollection | null>(null);
  const [neighborhoods, setNeighborhoods] =
    useState<SimpleCollection | null>(null);
  const [stations, setStations] = useState<SimpleCollection | null>(null);
  const [subwayLines, setSubwayLines] = useState<SimpleCollection | null>(null);
  const [workerReady, setWorkerReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [result, setResult] = useState<WorkerResult | null>(null);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [destination, setDestination] = useState<Destination>(
    initial.destination,
  );
  const [minutes, setMinutes] = useState(initial.minutes);
  const [scenario, setScenario] = useState<ScenarioId>(initial.scenario);
  const [viewMode, setViewMode] = useState<ViewMode>(initial.viewMode);
  const [heightMode, setHeightMode] = useState<HeightMode>(
    initial.heightMode,
  );
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>("destination");
  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [selectedNta, setSelectedNta] = useState<string | null>(null);
  const [newOnly, setNewOnly] = useState(false);
  const [tilted, setTilted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [calculating, setCalculating] = useState(true);
  const [searchValue, setSearchValue] = useState("");
  const [searchMessage, setSearchMessage] = useState("");
  const [introRun, setIntroRun] = useState(0);
  const [introFinished, setIntroFinished] = useState(false);
  const [introTime, setIntroTime] = useState(15);
  const [introTransitioning, setIntroTransitioning] = useState(false);
  const [dataError, setDataError] = useState("");
  const [urlReady, setUrlReady] = useState(false);

  useEffect(() => {
    const state = readUrlState();
    const timer = window.setTimeout(() => {
      setDestination(state.destination);
      setMinutes(state.minutes);
      setScenario(state.scenario);
      setViewMode(state.viewMode);
      setHeightMode(state.heightMode);
      setUrlReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    interactionRef.current = interactionMode;
  }, [interactionMode]);

  const chooseInteractionMode = useCallback((mode: InteractionMode) => {
    interactionRef.current = mode;
    setInteractionMode(mode);
    setSearchMessage(
      mode === "inspect"
        ? "Inspect mode: click a colored residential hex."
        : "",
    );
  }, []);

  useEffect(() => {
    viewModeRef.current = viewMode;
    hoverRequestSequenceRef.current += 1;
    hoverPopupContextRef.current = null;
    popupRef.current?.remove();
  }, [viewMode]);

  useEffect(() => {
    minutesRef.current = minutes;
  }, [minutes]);

  useEffect(() => {
    destinationRef.current = destination;
  }, [destination]);

  useEffect(() => {
    scenarioRef.current = scenario;
  }, [scenario]);

  useEffect(() => {
    stationsRef.current = stations;
  }, [stations]);

  useEffect(() => {
    resultRef.current = result;
    hoverRequestSequenceRef.current += 1;
    hoverPopupContextRef.current = null;
    hoverRouteCacheRef.current.clear();
    if (hoverPopupTimerRef.current !== null) {
      window.clearTimeout(hoverPopupTimerRef.current);
      hoverPopupTimerRef.current = null;
    }
    popupRef.current?.remove();
  }, [result]);

  useEffect(() => {
    hoverPopupRenderRef.current = (
      status: PopupRouteStatus,
      route: RouteResult | null = null,
    ) => {
      const context = hoverPopupContextRef.current;
      const popup = popupRef.current;
      const map = mapRef.current;
      if (!context || !popup || !map) return;
      popup
        .setHTML(
          popupHtml({
            context,
            destination,
            minutes,
            result,
            route,
            status,
            stations,
            viewMode,
          }),
        )
        .addTo(map);
    };
  }, [destination, minutes, result, stations, viewMode]);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;

    let resizeFrame = 0;

    const syncRouteMapGeometry = () => {
      const routeMaps = Array.from(
        document.querySelectorAll<SVGSVGElement>(".route-map"),
      );
      const referenceMap =
        routeMaps.find((svg) => svg.classList.contains("hero-lines")) ??
        routeMaps[0];
      const heroBounds = hero.getBoundingClientRect();
      const referenceBounds = referenceMap?.getBoundingClientRect();
      const mapWidth = referenceBounds?.width;
      const mapHeight = referenceBounds?.height;
      if (!mapWidth || !mapHeight) return;

      if (heroBounds.height) {
        document.documentElement.style.setProperty(
          "--intro-hero-height",
          `${heroBounds.height}px`,
        );
      }

      const viewportRatio = mapWidth / mapHeight;
      const baseRatio = ROUTE_VIEWBOX.width / ROUTE_VIEWBOX.height;
      let viewX = 0;
      let viewY = 0;
      let viewWidth = ROUTE_VIEWBOX.width;
      let viewHeight = ROUTE_VIEWBOX.height;

      if (viewportRatio > baseRatio) {
        viewWidth = ROUTE_VIEWBOX.height * viewportRatio;
        viewX = (ROUTE_VIEWBOX.width - viewWidth) / 2;
      } else {
        viewHeight = ROUTE_VIEWBOX.width / viewportRatio;
        viewY = (ROUTE_VIEWBOX.height - viewHeight) / 2;
      }

      const round = (value: number) => Number(value.toFixed(2));
      viewX = round(viewX);
      viewY = round(viewY);
      viewWidth = round(viewWidth);
      viewHeight = round(viewHeight);
      const leftEdge = round(viewX - ROUTE_VIEWBOX.edgePadding);
      const rightEdge = round(
        viewX + viewWidth + ROUTE_VIEWBOX.edgePadding,
      );
      const sharedViewBox = `${viewX} ${viewY} ${viewWidth} ${viewHeight}`;

      for (const svg of routeMaps) {
        svg.setAttribute("viewBox", sharedViewBox);
        for (const [className, buildPath] of Object.entries(ROUTE_PATHS)) {
          for (const path of svg.querySelectorAll<SVGPathElement>(
            `.${className}`,
          )) {
            path.setAttribute("d", buildPath(leftEdge, rightEdge));
          }
        }
      }
    };

    const scheduleRouteMapSync = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(syncRouteMapGeometry);
    };
    syncRouteMapRef.current = syncRouteMapGeometry;
    scheduleRouteMapSync();

    const observer = new ResizeObserver(scheduleRouteMapSync);
    observer.observe(hero);
    window.addEventListener("resize", scheduleRouteMapSync, { passive: true });

    return () => {
      window.cancelAnimationFrame(resizeFrame);
      observer.disconnect();
      window.removeEventListener("resize", scheduleRouteMapSync);
      syncRouteMapRef.current = () => undefined;
      document.documentElement.style.removeProperty("--intro-hero-height");
    };
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reducedMotion) {
      const reducedTimer = window.setTimeout(() => setIntroFinished(true), 0);
      return () => {
        window.clearTimeout(reducedTimer);
        document.body.classList.remove("film-active");
      };
    }

    const timeStops = [15, 30, 45, 60, 75, 90];
    let timeIndex = 0;
    document.body.classList.add("film-active");
    scrollInstantlyToTop();
    syncRouteMapRef.current();

    if (introRun > 0) {
      const opening = document.querySelector<HTMLElement>(".opening-film");
      const animatedElements = opening?.querySelectorAll<HTMLElement>(
        ".opening-routes .map-outline, .opening-routes .map-route, .opening-routes .map-station, .opening-routes .map-transfer, .opening-copy",
      );
      animatedElements?.forEach((element) => {
        element.style.animation = "none";
      });
      if (opening) void opening.offsetWidth;
      animatedElements?.forEach((element) => {
        element.style.animation = "";
      });
    }

    const timeInterval = window.setInterval(() => {
      timeIndex += 1;
      if (timeIndex >= timeStops.length) {
        window.clearInterval(timeInterval);
        return;
      }
      setIntroTime(timeStops[timeIndex]);
    }, 330);
    const transitionTimer = window.setTimeout(
      () => setIntroTransitioning(true),
      2140,
    );
    const finishTimer = window.setTimeout(() => {
      setIntroTransitioning(false);
      setIntroFinished(true);
      document.body.classList.remove("film-active");
    }, 2600);

    return () => {
      window.clearInterval(timeInterval);
      window.clearTimeout(transitionTimer);
      window.clearTimeout(finishTimer);
      document.body.classList.remove("film-active");
    };
  }, [introRun]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [
          manifestData,
          cellsData,
          neighborhoodsData,
          stationsData,
          lineData,
          accessData,
          walkData,
          driveData,
          weekdayAm,
          weekdayMidday,
          weekend,
        ] = await Promise.all([
          fetchJsonAsset<Manifest>("/data/manifest.json"),
          fetchJsonAsset<CellCollection>("/data/cells.geojson"),
          fetchJsonAsset<SimpleCollection>("/data/neighborhoods.geojson"),
          fetchJsonAsset<FeatureCollection<Point>>("/data/stations.geojson"),
          fetchJsonAsset<SimpleCollection>("/data/subway-lines.geojson"),
          fetchJsonAsset<StationAccess>("/data/station-access.json"),
          fetchJsonAsset<WalkNetwork>("/data/walk-network.json"),
          fetchJsonAsset<DriveNetwork>("/data/drive-network.json"),
          fetchArrayBufferAsset("/data/subway-weekday-am.bin"),
          fetchArrayBufferAsset("/data/subway-weekday-midday.bin"),
          fetchArrayBufferAsset("/data/subway-weekend.bin"),
        ]);
        if (cancelled) return;
        const typedCells = cellsData;
        const typedStations = stationsData;
        setManifest(manifestData);
        setCells(typedCells);
        setNeighborhoods(neighborhoodsData as SimpleCollection);
        setStations(typedStations);
        setSubwayLines(lineData as SimpleCollection);

        const centers = typedCells.features.map((feature) => {
          const ring = feature.geometry.coordinates[0];
          return [
            ring.reduce((sum, coordinate) => sum + coordinate[0], 0) /
              ring.length,
            ring.reduce((sum, coordinate) => sum + coordinate[1], 0) /
              ring.length,
          ] as [number, number];
        });
        const stationCoordinates = typedStations.features.map(
          (feature) => feature.geometry.coordinates as [number, number],
        );
        const scenarioSpeeds = Object.fromEntries(
          manifestData.scenarios.map((item) => [
            item.scenario,
            item.reference_speed_kmh,
          ]),
        ) as Record<ScenarioId, number>;
        const worker = new Worker(publicAsset("/commute.worker.js"), {
          type: "module",
        });
        worker.onmessage = (event) => {
          if (event.data.type === "ready") {
            setWorkerReady(true);
          } else if (event.data.type === "result") {
            setResult(event.data as WorkerResult);
            setRouteResult(null);
            setCalculating(false);
          } else if (event.data.type === "route") {
            const route = event.data as RouteResult;
            if (route.purpose === "hover") {
              const cacheKey = `${route.scenario}:${route.destinationCell}:${route.cell}`;
              const cache = hoverRouteCacheRef.current;
              cache.set(cacheKey, route);
              if (cache.size > 240) {
                const oldestKey = cache.keys().next().value;
                if (oldestKey) cache.delete(oldestKey);
              }
              const context = hoverPopupContextRef.current;
              if (
                context &&
                context.requestId === route.requestId &&
                context.cacheKey === cacheKey
              ) {
                hoverPopupRenderRef.current("ready", route);
              }
            } else {
              setRouteResult(route);
            }
          }
        };
        worker.postMessage(
          {
            type: "init",
            stationCount: manifestData.station_count,
            cellCenters: centers,
            stationCoordinates,
            access: accessData as StationAccess,
            walk: walkData as WalkNetwork,
            drive: driveData as DriveNetwork,
            matrices: {
              weekday_am: weekdayAm,
              weekday_midday: weekdayMidday,
              weekend,
            },
            referenceSpeeds: scenarioSpeeds,
            matrixUnit: manifestData.matrix_unit_minutes,
            unreachable: manifestData.unreachable_value,
            entryOverhead: Number(
              manifestData.assumptions.entry_overhead_minutes || 2,
            ),
            exitOverhead: Number(
              manifestData.assumptions.exit_overhead_minutes || 1,
            ),
          },
          [weekdayAm, weekdayMidday, weekend],
        );
        workerRef.current = worker;
      } catch (error) {
        console.error(error);
        setDataError(
          "The model assets could not be loaded. Refresh the page or try again shortly.",
        );
        setCalculating(false);
      }
    }
    load();
    return () => {
      cancelled = true;
      workerRef.current?.terminate();
    };
  }, []);

  const ensureRouteGraph = useCallback((scenarioId: ScenarioId) => {
    const existing = routeGraphPromisesRef.current.get(scenarioId);
    if (existing) return existing;
    const promise = fetchJsonAsset<SubwayGraph>(
      ROUTE_GRAPH_ASSETS[scenarioId],
    )
      .then((graph) => {
        workerRef.current?.postMessage({
          type: "route-graph",
          graph,
        });
      })
      .catch((error) => {
        routeGraphPromisesRef.current.delete(scenarioId);
        throw error;
      });
    routeGraphPromisesRef.current.set(scenarioId, promise);
    return promise;
  }, []);

  const cellLookup = useMemo(() => {
    const lookup = new Map<string, number>();
    cells?.features.forEach((feature) => {
      lookup.set(feature.properties.cell_id, feature.properties.cell_index);
    });
    return lookup;
  }, [cells]);

  useEffect(() => {
    if (!workerReady || !cells || !workerRef.current) return;
    const destinationCell = nearestCell(
      cells,
      cellLookup,
      destination.lng,
      destination.lat,
    );
    setCalculating(true);
    setSelectedCell(null);
    workerRef.current.postMessage({
      type: "compute",
      destinationCell,
      scenario,
    });
  }, [workerReady, cells, cellLookup, destination, scenario]);

  useEffect(() => {
    if (selectedCell === null || !result || !workerRef.current) return;
    if (viewMode !== "subway") {
      const clearRouteTimer = window.setTimeout(() => setRouteResult(null), 0);
      return () => window.clearTimeout(clearRouteTimer);
    }
    let cancelled = false;
    const requestId = ++inspectRequestSequenceRef.current;
    ensureRouteGraph(scenario)
      .then(() => {
        if (cancelled) return;
        workerRef.current?.postMessage({
          type: "route",
          purpose: "inspect",
          requestId,
          cell: selectedCell,
          destinationCell: result.destinationCell,
          scenario,
          originStation: result.originStations[selectedCell],
          destinationStation: result.destinationStations[selectedCell],
          originWalk: result.originWalk[selectedCell],
          destinationWalk: result.destinationWalk[selectedCell],
        });
      })
      .catch((error) => {
        console.error(error);
        setDataError("Route details could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCell, result, scenario, viewMode, ensureRouteGraph]);

  useEffect(() => {
    if (!workerReady || !result) return;
    const preloadTimer = window.setTimeout(() => {
      ensureRouteGraph(scenario).catch((error) => {
        console.error(error);
      });
    }, 450);
    return () => window.clearTimeout(preloadTimer);
  }, [workerReady, result, scenario, ensureRouteGraph]);

  const activeTimes = useMemo(() => {
    if (!result) return null;
    if (viewMode === "driving") return result.drivingTimes;
    if (viewMode === "walking") return result.directTimes;
    return result.times;
  }, [result, viewMode]);

  const decoratedCells = useMemo(() => {
    if (!cells || !result || !activeTimes) return null;
    const next = cloneCells(cells);
    for (const feature of next.features) {
      const index = feature.properties.cell_index;
      const travelTime = activeTimes[index];
      const euclideanTime = result.euclideanTimes[index];
      feature.properties.travel_time = travelTime;
      feature.properties.euclidean_time = euclideanTime;
      feature.properties.delta = result.deltas[index];
      feature.properties.reachable = travelTime <= minutes;
      feature.properties.newly_reachable =
        travelTime > minutes && travelTime <= minutes + 5;
      feature.properties.display_value = travelTime;
      feature.properties.slack = Math.max(0, minutes - travelTime);
    }
    return next;
  }, [cells, result, activeTimes, minutes]);

  const neighborhoodRanking = useMemo(() => {
    if (!cells || !result || !activeTimes) return [];
    const aggregate = new Map<
      string,
      {
        id: string;
        name: string;
        borough: string;
        total: number;
        reachable: number;
        times: number[];
        fastest: number;
        slowest: number;
        stationWeights: Map<number, number>;
      }
    >();
    for (const feature of cells.features) {
      const { nta_id, nta_name, borough, housing_units, cell_index } =
        feature.properties;
      if (!aggregate.has(nta_id)) {
        aggregate.set(nta_id, {
          id: nta_id,
          name: nta_name,
          borough,
          total: 0,
          reachable: 0,
          times: [],
          fastest: Number.POSITIVE_INFINITY,
          slowest: 0,
          stationWeights: new Map(),
        });
      }
      const row = aggregate.get(nta_id)!;
      row.total += housing_units;
      if (activeTimes[cell_index] <= minutes) {
        row.reachable += housing_units;
        row.times.push(activeTimes[cell_index]);
        row.fastest = Math.min(row.fastest, activeTimes[cell_index]);
        row.slowest = Math.max(row.slowest, activeTimes[cell_index]);
        const stationIndex = result.originStations[cell_index];
        if (viewMode === "subway" && stationIndex >= 0) {
          row.stationWeights.set(
            stationIndex,
            (row.stationWeights.get(stationIndex) || 0) + housing_units,
          );
        }
      }
    }
    return [...aggregate.values()]
      .filter((row) => row.total > 0 && row.reachable > 0)
      .map((row) => {
        const sorted = row.times.sort((a, b) => a - b);
        const primaryStationIndex = [...row.stationWeights.entries()].sort(
          (first, second) => second[1] - first[1],
        )[0]?.[0];
        const primaryStation = (
          stations?.features as StationFeature[] | undefined
        )?.[primaryStationIndex]?.properties;
        return {
          ...row,
          share: row.reachable / row.total,
          median: sorted.length
            ? sorted[Math.floor(sorted.length / 2)]
            : Number.POSITIVE_INFINITY,
          primaryStation,
        };
      })
      .sort((a, b) => b.share - a.share || a.median - b.median);
  }, [cells, result, activeTimes, minutes, stations, viewMode]);

  const neighborhoodColumns = useMemo(() => {
    const ranked = neighborhoodRanking.slice(0, 12);
    const midpoint = Math.ceil(ranked.length / 2);
    return [ranked.slice(0, midpoint), ranked.slice(midpoint)];
  }, [neighborhoodRanking]);

  const metrics = useMemo(() => {
    if (!cells || !result || !activeTimes) {
      return {
        units: 0,
        cells: 0,
        ntas: 0,
        routes: 0,
        routeIds: [] as string[],
        newUnits: 0,
      };
    }
    let units = 0;
    let reachableCells = 0;
    let newUnits = 0;
    const routes = new Set<string>();
    for (const feature of cells.features) {
      const index = feature.properties.cell_index;
      const time = activeTimes[index];
      if (time <= minutes) {
        units += feature.properties.housing_units;
        reachableCells += 1;
        if (viewMode === "subway") {
          const station = result.originStations[index];
          const stationFeature = (
            stations?.features as StationFeature[] | undefined
          )?.[station];
          stationFeature?.properties.routes
            .split(" ")
            .filter(Boolean)
            .forEach((route) => routes.add(route));
        }
      } else if (time <= minutes + 5) {
        newUnits += feature.properties.housing_units;
      }
    }
    return {
      units,
      cells: reachableCells,
      ntas: neighborhoodRanking.length,
      routes: routes.size,
      routeIds: [...routes].sort(
        (first, second) =>
          (ROUTE_ORDER_INDEX.get(first) ?? Number.MAX_SAFE_INTEGER) -
            (ROUTE_ORDER_INDEX.get(second) ?? Number.MAX_SAFE_INTEGER) ||
          first.localeCompare(second),
      ),
      newUnits,
    };
  }, [
    cells,
    result,
    activeTimes,
    minutes,
    neighborhoodRanking.length,
    stations,
    viewMode,
  ]);

  const activeRouteResult =
    routeResult &&
    routeResult.cell === selectedCell &&
    routeResult.scenario === scenario
      ? routeResult
      : null;

  const selectedDetail = useMemo(() => {
    if (
      selectedCell === null ||
      !cells ||
      !result ||
      !activeTimes ||
      !cells.features[selectedCell]
    ) {
      return null;
    }
    const feature = cells.features[selectedCell];
    const originStationIndex = result.originStations[selectedCell];
    const destinationStationIndex = result.destinationStations[selectedCell];
    const typedStations = stations?.features as StationFeature[] | undefined;
    const originStation = typedStations?.[originStationIndex]?.properties;
    const destinationStation =
      typedStations?.[destinationStationIndex]?.properties;
    const delta = result.deltas[selectedCell];
    const ring = feature.geometry.coordinates[0];
    const homeCenter: [number, number] = [
      ring.reduce((sum, coordinate) => sum + coordinate[0], 0) / ring.length,
      ring.reduce((sum, coordinate) => sum + coordinate[1], 0) / ring.length,
    ];
    const straightDistanceKm = turfDistance(
      point(homeCenter),
      point([destination.lng, destination.lat]),
      { units: "kilometers" },
    );
    const explanation =
      viewMode === "walking"
        ? "This is the shortest modeled pedestrian path on OpenStreetMap at 4.8 km/h."
        : viewMode === "driving"
          ? "This is a free-flow road estimate. Live traffic, parking, tolls, and incidents are not included."
          : originStationIndex < 0
            ? "Direct walking is faster than entering the subway for this cell."
            : activeRouteResult && activeRouteResult.transferMinutes >= 4
              ? `${activeRouteResult.transferMinutes.toFixed(1)} minutes of station transfer time and ${activeRouteResult.waitMinutes.toFixed(1)} minutes of expected waiting add friction to this trip.`
              : result.originWalk[selectedCell] >= 10
                ? "The rail trip is useful, but a long first walk reduces its advantage."
                : delta < -5
                  ? `The ${activeRouteResult?.routeSequence.join(" → ") || "subway"} corridor creates a strong time advantage.`
                  : "Station access, waiting, and transfers shape this result.";
    const walkingNetworkDistance =
      (result.directTimes[selectedCell] * 4.8) / 60;
    return {
      properties: feature.properties,
      mode: viewMode,
      total: activeTimes[selectedCell],
      direct: result.directTimes[selectedCell],
      euclidean: result.euclideanTimes[selectedCell],
      delta,
      originStation,
      destinationStation,
      originWalk: result.originWalk[selectedCell],
      destinationWalk: result.destinationWalk[selectedCell],
      transit: result.transitTime[selectedCell],
      wait: activeRouteResult?.waitMinutes ?? 0,
      ride: activeRouteResult?.rideMinutes ?? result.transitTime[selectedCell],
      transfer: activeRouteResult?.transferMinutes ?? 0,
      stationSequence: activeRouteResult?.stationSequence ?? [],
      routeSequence: activeRouteResult?.routeSequence ?? [],
      walkCellSequence: activeRouteResult?.walkCellSequence ?? [],
      networkDistanceKm:
        viewMode === "walking"
          ? walkingNetworkDistance
          : activeRouteResult?.networkDistanceKm,
      straightDistanceKm:
        activeRouteResult?.straightDistanceKm ?? straightDistanceKm,
      circuityRatio:
        viewMode === "walking"
          ? walkingNetworkDistance / Math.max(straightDistanceKm, 0.001)
          : activeRouteResult?.circuityRatio,
      explanation,
    };
  }, [
    selectedCell,
    cells,
    result,
    activeTimes,
    stations,
    activeRouteResult,
    viewMode,
    destination,
  ]);

  const updateUrl = useCallback(() => {
    if (!urlReady) return;
    const query = new URLSearchParams({
      lng: destination.lng.toFixed(5),
      lat: destination.lat.toFixed(5),
      minutes: String(Math.round(minutes)),
      scenario,
      mode: viewMode,
      height: heightMode,
    });
    window.history.replaceState({}, "", `?${query.toString()}`);
  }, [destination, minutes, scenario, viewMode, heightMode, urlReady]);

  useEffect(() => {
    updateUrl();
  }, [updateUrl]);

  const setMapDestination = useCallback(
    (lng: number, lat: number, label: string) => {
      if (cells) {
        const nearestIndex = nearestCell(cells, cellLookup, lng, lat);
        const ring = cells.features[nearestIndex].geometry.coordinates[0];
        const center: [number, number] = [
          ring.reduce((sum, coordinate) => sum + coordinate[0], 0) /
            ring.length,
          ring.reduce((sum, coordinate) => sum + coordinate[1], 0) /
            ring.length,
        ];
        const distanceToStudyArea = turfDistance(
          point([lng, lat]),
          point(center),
          { units: "kilometers" },
        );
        if (distanceToStudyArea > 4.5) {
          setSearchMessage(
            "Choose a destination inside the five-borough study area.",
          );
          markerRef.current?.setLngLat([
            destinationRef.current.lng,
            destinationRef.current.lat,
          ]);
          return false;
        }
      }
      setSearchMessage("");
      setDestination({ lng, lat, label });
      markerRef.current?.setLngLat([lng, lat]);
      return true;
    },
    [cells, cellLookup],
  );

  const clearHoverPopup = useCallback(() => {
    hoverRequestSequenceRef.current += 1;
    hoverPopupContextRef.current = null;
    if (hoverPopupTimerRef.current !== null) {
      window.clearTimeout(hoverPopupTimerRef.current);
      hoverPopupTimerRef.current = null;
    }
    popupRef.current?.remove();
  }, []);

  const requestHoverRoute = useCallback(
    (cell: number, properties: CellProperties) => {
      const currentResult = resultRef.current;
      const scenarioId = scenarioRef.current;
      const destinationCell = currentResult?.destinationCell ?? -1;
      const cacheKey = `${scenarioId}:${destinationCell}:${cell}`;
      const previous = hoverPopupContextRef.current;
      if (previous?.cacheKey === cacheKey) {
        previous.properties = { ...properties };
        return;
      }

      if (hoverPopupTimerRef.current !== null) {
        window.clearTimeout(hoverPopupTimerRef.current);
      }
      const requestId = ++hoverRequestSequenceRef.current;
      hoverPopupContextRef.current = {
        cell,
        properties: { ...properties },
        requestId,
        cacheKey,
      };

      hoverPopupTimerRef.current = window.setTimeout(() => {
        hoverPopupTimerRef.current = null;
        const activeContext = hoverPopupContextRef.current;
        const latestResult = resultRef.current;
        if (
          !activeContext ||
          activeContext.requestId !== requestId ||
          activeContext.cacheKey !== cacheKey
        ) {
          return;
        }
        if (viewModeRef.current !== "subway") {
          hoverPopupRenderRef.current("ready");
          return;
        }
        const cached = hoverRouteCacheRef.current.get(cacheKey);
        if (cached) {
          hoverPopupRenderRef.current("ready", cached);
          return;
        }
        hoverPopupRenderRef.current("loading");
        if (
          !latestResult ||
          !workerRef.current ||
          latestResult.destinationCell !== destinationCell
        ) {
          return;
        }
        const postRouteRequest = () => {
          const context = hoverPopupContextRef.current;
          const nextResult = resultRef.current;
          if (
            !context ||
            !nextResult ||
            context.requestId !== requestId ||
            context.cacheKey !== cacheKey
          ) {
            return;
          }
          workerRef.current?.postMessage({
            type: "route",
            purpose: "hover",
            requestId,
            cell,
            destinationCell,
            scenario: scenarioId,
            originStation: nextResult.originStations[cell],
            destinationStation: nextResult.destinationStations[cell],
            originWalk: nextResult.originWalk[cell],
            destinationWalk: nextResult.destinationWalk[cell],
          });
        };
        if (latestResult.originStations[cell] < 0) {
          postRouteRequest();
          return;
        }
        ensureRouteGraph(scenarioId)
          .then(postRouteRequest)
          .catch((error) => {
            console.error(error);
            const context = hoverPopupContextRef.current;
            if (context?.requestId === requestId) {
              hoverPopupRenderRef.current("error");
            }
          });
      }, HOVER_POPUP_DELAY_MS);
    },
    [ensureRouteGraph],
  );

  useEffect(() => {
    if (
      mapRef.current ||
      !mapContainer.current ||
      !cells ||
      !neighborhoods ||
      !stations ||
      !subwayLines
    ) {
      return;
    }
    const mapboxgl = window.mapboxgl;
    if (!mapboxgl) {
      const rendererErrorTimer = window.setTimeout(
        () =>
          setDataError(
            "The map renderer did not load. The analysis remains available below.",
          ),
        0,
      );
      return () => window.clearTimeout(rendererErrorTimer);
    }
    const fallbackStyle: StyleSpecification = {
      version: 8,
      sources: {},
      layers: [
        {
          id: "background",
          type: "background",
          paint: { "background-color": "#080808" },
        },
      ],
    };
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: fallbackStyle,
      center: [-73.98, 40.74],
      zoom: 10.25,
      pitch: 53,
      bearing: -18,
      minZoom: 9.4,
      maxZoom: 16.5,
      maxBounds: [
        [-74.34, 40.45],
        [-73.67, 41.02],
      ],
      canvasContextAttributes: { antialias: true },
    });
    mapRef.current = map;
    let resizeFrame = 0;
    const mapResizeObserver = new ResizeObserver(() => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        if (mapRef.current === map) map.resize();
      });
    });
    mapResizeObserver.observe(mapContainer.current);
    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      "bottom-right",
    );
    map.addControl(new mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

    map.on("load", () => {
      map.addSource("neighborhoods", {
        type: "geojson",
        data: neighborhoods,
      });
      map.addSource("subway-lines", {
        type: "geojson",
        data: subwayLines,
      });
      map.addSource("stations", { type: "geojson", data: stations });
      map.addSource("time-cells", {
        type: "geojson",
        data: cells,
        promoteId: "cell_index",
      });
      map.addSource("route-trace", {
        type: "geojson",
        lineMetrics: true,
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "nta-soft-fill",
        type: "fill",
        source: "neighborhoods",
        paint: { "fill-color": "#11110f", "fill-opacity": 0.16 },
      });
      map.addLayer({
        id: "nta-outline",
        type: "line",
        source: "neighborhoods",
        paint: {
          "line-color": "#f3f1e9",
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.35, 14, 1.2],
          "line-opacity": 0.18,
        },
      });
      map.addLayer({
        id: "nta-selected",
        type: "line",
        source: "neighborhoods",
        filter: ["==", ["get", "nta_id"], ""],
        paint: {
          "line-color": "#fff7dd",
          "line-width": 3,
          "line-opacity": 0.95,
        },
      });
      map.addLayer({
        id: "subway-base",
        type: "line",
        source: "subway-lines",
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.7, 14, 2.6],
          "line-opacity": 0.28,
        },
      });
      map.addLayer({
        id: "time-cells",
        type: "fill-extrusion",
        source: "time-cells",
        paint: {
          "fill-extrusion-color": "rgba(0, 0, 0, 0)",
          "fill-extrusion-height": 0,
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.86,
          "fill-extrusion-vertical-gradient": true,
        },
      });
      map.addLayer({
        id: "cell-wire",
        type: "line",
        source: "time-cells",
        paint: {
          "line-color": "#fff9e9",
          "line-width": 0.45,
          "line-opacity": 0.08,
        },
      });
      map.addLayer({
        id: "stations",
        type: "circle",
        source: "stations",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 1.2, 14, 4.2],
          "circle-color": "#f7f4e9",
          "circle-stroke-color": "#080808",
          "circle-stroke-width": 1,
          "circle-opacity": 0.75,
        },
      });
      map.addLayer({
        id: "route-trace",
        type: "line",
        source: "route-trace",
        paint: {
          "line-color": ["coalesce", ["get", "color"], "#fff0bd"],
          "line-width": 5,
          "line-opacity": 0.95,
        },
      });
      map.addLayer({
        id: "route-pulse",
        type: "line",
        source: "route-trace",
        paint: {
          "line-width": 2.4,
          "line-opacity": 0.95,
          "line-gradient": [
            "interpolate",
            ["linear"],
            ["line-progress"],
            0,
            "rgba(255,255,255,0)",
            0.42,
            "rgba(255,255,255,0)",
            0.5,
            "#ffffff",
            0.58,
            "rgba(255,255,255,0)",
            1,
            "rgba(255,255,255,0)",
          ],
        },
      });

      const markerElement = document.createElement("div");
      markerElement.className = "destination-marker";
      markerElement.setAttribute("role", "img");
      markerElement.setAttribute("aria-label", "Selected destination");
      const marker = new mapboxgl.Marker({
        element: markerElement,
        draggable: true,
      })
        .setLngLat([
          destinationRef.current.lng,
          destinationRef.current.lat,
        ])
        .addTo(map);
      marker.on("dragend", () => {
        const point = marker.getLngLat();
        if (!setMapDestination(point.lng, point.lat, "Dragged destination")) {
          marker.setLngLat([
            destinationRef.current.lng,
            destinationRef.current.lat,
          ]);
        }
      });
      markerRef.current = marker;

      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "timefield-popup",
        offset: 12,
      });

      map.on("mousemove", "time-cells", (event) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = event.features?.[0];
        if (!feature || !popupRef.current) return;
        const properties = feature.properties as unknown as CellProperties;
        const cell = Number(properties.cell_index);
        if (!Number.isFinite(cell)) return;
        popupRef.current.setLngLat(event.lngLat);
        requestHoverRoute(cell, properties);
      });
      map.on("mouseleave", "time-cells", () => {
        map.getCanvas().style.cursor = "";
        clearHoverPopup();
      });
      map.on("click", (event) => {
        clearHoverPopup();
        if (interactionRef.current === "inspect") {
          const hitPadding = 14;
          const exactFeatures = map.queryRenderedFeatures(event.point, {
            layers: ["time-cells"],
          });
          const nearbyFeatures = exactFeatures.length
            ? exactFeatures
            : map.queryRenderedFeatures(
                [
                  [event.point.x - hitPadding, event.point.y - hitPadding],
                  [event.point.x + hitPadding, event.point.y + hitPadding],
                ],
                { layers: ["time-cells"] },
              );
          const selectedFeature = nearbyFeatures.find((feature) =>
            Number.isFinite(Number(feature.properties?.cell_index)),
          );
          if (selectedFeature) {
            const index = Number(selectedFeature.properties?.cell_index);
            setSelectedCell(index);
            const ntaId = String(selectedFeature.properties?.nta_id || "");
            setSelectedNta(ntaId || null);
            setSearchMessage("Residential hex selected. Route details updated below.");
          } else {
            setSearchMessage(
              "No residential hex here. Click one of the colored cells.",
            );
          }
          return;
        }
        setMapDestination(event.lngLat.lng, event.lngLat.lat, "Map destination");
      });
      map.getCanvas().dataset.timeFieldLoaded = "true";
      setMapLoaded(true);
    });
    return () => {
      window.cancelAnimationFrame(resizeFrame);
      mapResizeObserver.disconnect();
      setMapLoaded(false);
      clearHoverPopup();
      markerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [
    cells,
    neighborhoods,
    stations,
    subwayLines,
    setMapDestination,
    requestHoverRoute,
    clearHoverPopup,
  ]);

  useEffect(() => {
    markerRef.current?.setLngLat([destination.lng, destination.lat]);
  }, [destination]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !decoratedCells || !map.getSource("time-cells")) return;
    const source = map.getSource("time-cells") as GeoJSONSource | undefined;
    source?.setData(decoratedCells);
    map.getCanvas().dataset.timeFieldCells = String(
      decoratedCells.features.length,
    );
    if (map.getLayer("time-cells")) {
      const reachableFilter: FilterSpecification = newOnly
        ? ["==", ["get", "newly_reachable"], true]
        : ["==", ["get", "reachable"], true];
      const activeFilter: FilterSpecification =
        heightMode === "rent"
          ? [
              "all",
              reachableFilter,
              [">", ["coalesce", ["get", "housing_units"], 0], 0],
              [">", ["coalesce", ["get", "rent_bar_height_m"], 0], 0],
            ]
          : reachableFilter;
      const activeExpression: ExpressionSpecification = newOnly
        ? ["boolean", ["get", "newly_reachable"], false]
        : ["boolean", ["get", "reachable"], false];
      const travelTimeColor: ExpressionSpecification = [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "display_value"], 999],
        0,
        "#78aaff",
        Math.max(10, minutes * 0.58),
        "#dddcd5",
        minutes,
        "#ff7f68",
      ];
      const rentLow = manifest?.rent.height_scale_low ?? 1300;
      const rentHigh = manifest?.rent.height_scale_high ?? 3300;
      const rentMid =
        manifest?.rent.city_reference_gross_rent ?? (rentLow + rentHigh) / 2;
      const rentMin = manifest?.rent.min_gross_rent ?? rentLow;
      const rentMax = manifest?.rent.max_gross_rent ?? rentHigh;
      const rentColor: ExpressionSpecification = [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "rent_estimate"], rentMin],
        rentMin,
        "#315caa",
        rentLow,
        "#78aaff",
        rentMid,
        "#dddcd5",
        rentHigh,
        "#ff7f68",
        rentMax,
        "#ff4933",
      ];
      const heightExpression: ExpressionSpecification =
        heightMode === "rent"
          ? ["coalesce", ["get", "rent_bar_height_m"], 0]
          : ["*", ["coalesce", ["get", "slack"], 0], 55];
      map.setFilter("time-cells", activeFilter);
      map.setPaintProperty(
        "time-cells",
        "fill-extrusion-color",
        heightMode === "rent" ? rentColor : travelTimeColor,
      );
      map.setPaintProperty(
        "time-cells",
        "fill-extrusion-height",
        ["case", activeExpression, heightExpression, 0],
      );
      map.setPaintProperty("time-cells", "fill-extrusion-opacity", 0.86);
      if (map.getLayer("cell-wire")) {
        map.setFilter("cell-wire", activeFilter);
      }
      map.getCanvas().dataset.timeFieldEncoding = heightMode;
      map.getCanvas().dataset.timeFieldHeightScale =
        heightMode === "rent" ? "continuous-per-cell" : "time-remaining";
      map.getCanvas().dataset.timeFieldRange = newOnly
        ? "newly-reachable"
        : "reachable";
      window.setTimeout(() => {
        const rendered = map.queryRenderedFeatures(undefined, {
          layers: ["time-cells"],
        }).length;
        map.getCanvas().dataset.timeFieldRendered = String(rendered);
      }, 300);
    }
    const subwayVisibility = viewMode === "subway" ? "visible" : "none";
    for (const layer of ["subway-base", "stations"]) {
      if (map.getLayer(layer)) {
        map.setLayoutProperty(layer, "visibility", subwayVisibility);
      }
    }
  }, [
    decoratedCells,
    mapLoaded,
    minutes,
    viewMode,
    heightMode,
    manifest,
    newOnly,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.loaded()) return;
    map.easeTo({
      pitch: tilted ? 53 : 0,
      bearing: tilted ? -18 : 0,
      duration: 700,
    });
  }, [tilted]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.loaded()) return;
    if (selectedNta) {
      map.setFilter("nta-selected", ["==", ["get", "nta_id"], selectedNta]);
    } else {
      map.setFilter("nta-selected", ["==", ["get", "nta_id"], ""]);
    }
  }, [selectedNta]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.loaded()) return;
    const source = map.getSource("route-trace") as GeoJSONSource | undefined;
    if (!source) return;
    if (
      viewMode !== "subway" ||
      !selectedDetail ||
      selectedCell === null ||
      !cells
    ) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const centerForCell = (cellIndex: number): [number, number] => {
      const ring = cells.features[cellIndex].geometry.coordinates[0];
      return [
        ring.reduce((sum, coordinate) => sum + coordinate[0], 0) / ring.length,
        ring.reduce((sum, coordinate) => sum + coordinate[1], 0) / ring.length,
      ];
    };
    const typedStations = stations?.features as StationFeature[] | undefined;
    const features: Feature[] = [];
    const home = centerForCell(selectedCell);
    if (activeRouteResult?.walkCellSequence.length) {
      const coordinates = activeRouteResult.walkCellSequence.map(centerForCell);
      coordinates.push([destination.lng, destination.lat]);
      features.push(
        lineString(coordinates, {
          color: "#eee9db",
          mode: "walk",
        }),
      );
    } else if (
      activeRouteResult &&
      activeRouteResult.originStation >= 0 &&
      activeRouteResult.destinationStation >= 0
    ) {
      const originFeature =
        typedStations?.[activeRouteResult.originStation];
      const destinationFeature =
        typedStations?.[activeRouteResult.destinationStation];
      if (originFeature) {
        features.push(
          lineString(
            [
              home,
              originFeature.geometry.coordinates as [number, number],
            ],
            { color: "#eee9db", mode: "walk" },
          ),
        );
      }
      for (const edge of activeRouteResult.edges) {
        const from = typedStations?.[edge.from_station];
        const to = typedStations?.[edge.to_station];
        if (!from || !to || edge.from_station === edge.to_station) continue;
        features.push(
          lineString(
            [
              from.geometry.coordinates as [number, number],
              to.geometry.coordinates as [number, number],
            ],
            {
              color:
                edge.kind === "ride"
                  ? ROUTE_COLORS[edge.route] || "#fff0bd"
                  : "#ff7f68",
              mode: edge.kind,
              route: edge.route,
            },
          ),
        );
      }
      if (destinationFeature) {
        features.push(
          lineString(
            [
              destinationFeature.geometry.coordinates as [number, number],
              [destination.lng, destination.lat],
            ],
            { color: "#eee9db", mode: "walk" },
          ),
        );
      }
    } else {
      features.push(
        lineString(
          [
            home,
            [destination.lng, destination.lat],
          ],
          { color: "#eee9db", mode: "walk" },
        ),
      );
    }
    source.setData({ type: "FeatureCollection", features });
  }, [
    selectedDetail,
    selectedCell,
    cells,
    destination,
    stations,
    activeRouteResult,
    viewMode,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (
      viewMode !== "subway" ||
      !map?.loaded() ||
      !map.getLayer("route-pulse") ||
      !selectedDetail
    ) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let lastPaint = 0;
    const animate = (now: number) => {
      if (now - lastPaint > 48) {
        lastPaint = now;
        const position = 0.1 + ((now / 2200) % 1) * 0.8;
        map.setPaintProperty("route-pulse", "line-gradient", [
          "interpolate",
          ["linear"],
          ["line-progress"],
          0,
          "rgba(255,255,255,0)",
          position - 0.08,
          "rgba(255,255,255,0)",
          position,
          "#ffffff",
          position + 0.08,
          "rgba(255,255,255,0)",
          1,
          "rgba(255,255,255,0)",
        ]);
      }
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [selectedDetail, activeRouteResult, viewMode]);

  useEffect(() => {
    if (!playing) {
      if (playTimer.current) clearInterval(playTimer.current);
      playTimer.current = null;
      return;
    }
    playTimer.current = setInterval(() => {
      setMinutes((current) => (current >= 90 ? 15 : current + 1));
    }, 140);
    return () => {
      if (playTimer.current) clearInterval(playTimer.current);
    };
  }, [playing]);

  const selectNeighborhood = useCallback(
    (ntaId: string) => {
      setSelectedNta(ntaId);
      if (cells && activeTimes) {
        const representativeCells = cells.features
          .filter(
            (feature) =>
              feature.properties.nta_id === ntaId &&
              activeTimes[feature.properties.cell_index] <= minutes,
          )
          .sort(
            (first, second) =>
              activeTimes[first.properties.cell_index] -
              activeTimes[second.properties.cell_index],
          );
        const representativeCell =
          representativeCells[Math.floor(representativeCells.length / 2)];
        if (representativeCell) {
          setSelectedCell(representativeCell.properties.cell_index);
          chooseInteractionMode("inspect");
        }
      }
      if (!neighborhoods || !mapRef.current) return;
      const features = neighborhoods.features.filter(
        (feature) => feature.properties?.nta_id === ntaId,
      );
      if (!features.length) return;
      const bounds = bbox({
        type: "FeatureCollection",
        features,
      }) as [number, number, number, number];
      mapRef.current.fitBounds(
        [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[3]],
        ],
        { padding: 70, duration: 800 },
      );
    },
    [cells, activeTimes, minutes, neighborhoods, chooseInteractionMode],
  );

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    const query = searchValue.trim();
    if (!query) return;
    const local = neighborhoodRanking.find((row) =>
      row.name.toLowerCase().includes(query.toLowerCase()),
    );
    if (local) {
      selectNeighborhood(local.id);
      setSearchMessage(`Showing ${local.name}`);
      return;
    }
    try {
      const endpoint = new URL("https://nominatim.openstreetmap.org/search");
      endpoint.searchParams.set("q", `${query}, New York City`);
      endpoint.searchParams.set("format", "jsonv2");
      endpoint.searchParams.set("viewbox", "-74.26,40.92,-73.70,40.49");
      endpoint.searchParams.set("bounded", "1");
      endpoint.searchParams.set("limit", "1");
      const response = await fetch(endpoint, {
        headers: { "Accept-Language": "en" },
      });
      if (!response.ok) throw new Error("Geocoder request failed");
      const payload = (await response.json()) as Array<{
        lon: string;
        lat: string;
        display_name?: string;
      }>;
      const feature = payload?.[0];
      if (!feature) {
        setSearchMessage("No NYC location found.");
        return;
      }
      const lng = Number(feature.lon);
      const lat = Number(feature.lat);
      const label = String(feature.display_name || query).split(",")[0];
      if (!setMapDestination(lng, lat, label)) return;
      mapRef.current?.flyTo({ center: [lng, lat], zoom: 12.2, duration: 900 });
      setSearchMessage(`Destination: ${label}`);
    } catch {
      setSearchMessage("Search is unavailable; click the map instead.");
    }
  }

  function reset() {
    setMinutes(35);
    setScenario("weekday_am");
    setViewMode("subway");
    setHeightMode("time");
    chooseInteractionMode("destination");
    setNewOnly(false);
    setSelectedCell(null);
    setSelectedNta(null);
    setTilted(true);
    setMapDestination(PRESETS[0].lng, PRESETS[0].lat, PRESETS[0].label);
    mapRef.current?.flyTo({
      center: [-73.98, 40.74],
      zoom: 10.25,
      pitch: 53,
      bearing: -18,
      duration: 900,
    });
  }

  function replayIntro() {
    clearPageHashForIntro();
    scrollInstantlyToTop();
    setIntroTime(15);
    setIntroTransitioning(false);
    setIntroFinished(false);
    setIntroRun((value) => value + 1);
  }

  return (
    <main>
      <OpeningFilm
        time={introTime}
        transitioning={introTransitioning}
        finished={introFinished}
      />

      <header
        className={`site-header ${
          introFinished ? "is-intro-complete" : "is-intro-pending"
        }`}
      >
        <a className="brand" href="#top" aria-label="NYC Time Field home">
          NYC TIME FIELD
        </a>
        <nav aria-label="Main navigation">
          <a href="#map-lab">Map Lab</a>
          <a href="#research">Research</a>
          <a href="#methodology">Methodology</a>
        </nav>
        <button
          className="replay"
          type="button"
          onClick={replayIntro}
        >
          Replay intro
        </button>
      </header>

      <section
        ref={heroRef}
        className={`hero ${
          introFinished ? "is-intro-complete" : "is-intro-pending"
        }`}
        id="top"
      >
        <div className="hero-grid" aria-hidden="true" />
        <svg
          className="hero-lines route-map"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          focusable="false"
        >
          <g className="borough-outlines">
            <path
              className="map-outline borough-outline-manhattan"
              pathLength="100"
              d="M1040 80L1080 120V220L1050 250V330L1020 360V430L990 460L950 500L910 460L950 420V340L980 310V230L1010 200V110Z"
            />
            <path
              className="map-outline borough-outline-bronx"
              pathLength="100"
              d="M1040 80L1000 40H1130L1170 80V180L1130 220H1080V120Z"
            />
            <path
              className="map-outline borough-outline-queens"
              pathLength="100"
              d="M1160 240H1360L1400 280V400L1360 440H1210L1200 450L1160 410V320L1120 280Z"
            />
            <path
              className="map-outline borough-outline-brooklyn"
              pathLength="100"
              d="M1000 450L1040 410H1160L1200 450H1340L1380 490L1340 530V630L1300 670H1080L1040 630V550L1000 510Z"
            />
            <path
              className="map-outline borough-outline-staten-island"
              pathLength="100"
              d="M900 570L940 530H1040L1080 570V670L1040 710H940L900 670Z"
            />
          </g>
          <g className="map-route-lines">
            <path
              className="map-route map-route-manhattan"
              pathLength="100"
              d="M-120 160H960L1010 110L1040 80L1080 120V220L1050 250V330L1020 360V430L990 460L950 500L910 460L950 420V340L980 310V230L1010 200L1050 240H1560"
            />
            <path
              className="map-route map-route-queens"
              pathLength="100"
              d="M-120 320H1080L1120 280L1160 240H1360L1400 280V400L1360 440H1210L1200 450L1160 410V320L1200 360H1560"
            />
            <path
              className="map-route map-route-brooklyn"
              pathLength="100"
              d="M-120 410H960L1000 450L1040 410H1160L1200 450H1340L1380 490L1340 530V630L1300 670H1080L1040 630V550L1000 510L1040 550H1560"
            />
            <path
              className="map-route map-route-bronx"
              pathLength="100"
              d="M-120 80H960L1000 40H1130L1170 80V180L1130 220H1080V120L1040 80L1080 40H1560"
            />
            <path
              className="map-route map-route-staten-island"
              pathLength="100"
              d="M-120 250H820V490L900 570L940 530H1040L1080 570V670L1040 710H940L900 670L940 630H1560"
            />
          </g>
          <g className="map-stations">
            <circle className="map-station station-manhattan" cx="1010" cy="110" r="12" />
            <circle className="map-station station-manhattan" cx="1050" cy="250" r="12" />
            <circle className="map-station station-manhattan" cx="950" cy="500" r="12" />
            <circle className="map-station station-queens" cx="1160" cy="240" r="12" />
            <circle className="map-station station-queens" cx="1360" cy="440" r="12" />
            <circle className="map-station station-brooklyn" cx="1000" cy="450" r="12" />
            <circle className="map-station station-brooklyn" cx="1340" cy="530" r="12" />
            <circle className="map-station station-bronx" cx="1000" cy="40" r="12" />
            <circle className="map-station station-bronx" cx="1130" cy="220" r="12" />
            <circle className="map-station station-staten-island" cx="900" cy="570" r="12" />
            <circle className="map-station station-staten-island" cx="1040" cy="710" r="12" />
            <circle className="map-transfer" cx="1200" cy="450" r="14" />
          </g>
        </svg>

        <div className="hero-inner">
          <p className="hero-kicker">NYC Commute Network / 15–90 Minutes</p>
          <h1>
            NYC
            <br />
            TIME FIELD
          </h1>
          <p className="hero-deck">
            Where can 30 minutes take you? Compare subway, driving, and walking
            through one shared New York.
          </p>

          <div className="hero-routes" aria-label="Five New York City boroughs">
            <span className="route-disc disc-manhattan" aria-label="Manhattan">M</span>
            <span className="route-disc disc-queens" aria-label="Queens">Q</span>
            <span className="route-disc disc-brooklyn" aria-label="Brooklyn">BK</span>
            <span className="route-disc disc-bronx" aria-label="Bronx">BX</span>
            <span className="route-disc disc-staten-island" aria-label="Staten Island">SI</span>
          </div>

          <div className="hero-meta">
            <div>
              <span>DESTINATION</span>
              <strong>YOU CHOOSE</strong>
            </div>
            <div>
              <span>TIME RANGE</span>
              <strong>15–90 MIN</strong>
            </div>
            <div>
              <span>ANALYSIS</span>
              <strong>3 MODES</strong>
            </div>
          </div>

          <div className="hero-actions">
            <a className="hero-button hero-button-light" href="#map-lab">
              Enter Map Lab
            </a>
            <button
              className="hero-button hero-button-ghost"
              type="button"
              onClick={replayIntro}
            >
              Replay opening
            </button>
          </div>
        </div>

        <div className="hero-scroll" aria-hidden="true">
          <span />
          Scroll to depart
        </div>
      </section>

      <section className="map-section" id="map-lab">
        <div className="section-heading">
          <div className="index">01</div>
          <div>
            <p className="eyebrow">Interactive model</p>
            <h2>Commute Map Lab</h2>
          </div>
          <p>
            Click to place a destination, then switch to Inspect Homes to read
            the best route from any residential hex.
          </p>
        </div>

        <div className="map-layout">
          <div className="map-stage">
            <div className="map-toolbar">
              <div className="time-readout">
                <span>TIME BUDGET</span>
                <strong>{minutes} MIN</strong>
              </div>
              <label className="sr-only" htmlFor="time-budget">
                Commute time budget
              </label>
              <input
                id="time-budget"
                type="range"
                min="15"
                max="90"
                step="1"
                value={minutes}
                onChange={(event) => setMinutes(Number(event.target.value))}
              />
              <button
                type="button"
                className={playing ? "active" : ""}
                aria-pressed={playing}
                onClick={() => {
                  if (!playing) setMinutes(15);
                  setPlaying((value) => !value);
                }}
              >
                {playing ? "Pause" : "Play 15→90"}
              </button>
              <button type="button" onClick={reset}>
                Reset
              </button>
            </div>

            <div className="map-commandbar">
              <div className="segmented" aria-label="Map interaction mode">
                <button
                  className={interactionMode === "destination" ? "active" : ""}
                  type="button"
                  onClick={() => chooseInteractionMode("destination")}
                >
                  Place destination
                </button>
                <button
                  className={interactionMode === "inspect" ? "active" : ""}
                  type="button"
                  onClick={() => chooseInteractionMode("inspect")}
                >
                  Inspect homes
                </button>
              </div>
              <div className="preset-row" aria-label="Destination presets">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setMapDestination(preset.lng, preset.lat, preset.label);
                      mapRef.current?.flyTo({
                        center: [preset.lng, preset.lat],
                        zoom: 11.6,
                        duration: 800,
                      });
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="map-shell">
              <div
                ref={mapContainer}
                className="map-canvas"
                role="application"
                aria-label="Interactive map of New York City commute accessibility"
              />
              <div className="map-status">
                <span className={calculating ? "status-dot busy" : "status-dot"} />
                {dataError ||
                  (calculating
                    ? "Calculating the time field…"
                    : `${destination.label} · ${VIEW_LABELS[viewMode]} model`)}
              </div>
              <div className="map-mode-note">
                <span>
                  {heightMode === "rent"
                    ? "Estimated gross rent"
                    : VIEW_LABELS[viewMode]}
                </span>
                {heightMode === "rent"
                  ? "Color + price-ranked height · reachable homes only"
                  : VIEW_DESCRIPTIONS[viewMode]}
                <small>
                  {heightMode === "rent"
                    ? `Outside your time limit: hidden${viewMode === "subway" ? " · pause on a hex for route steps" : ""}`
                    : `Height: time remaining${viewMode === "subway" ? " · pause on a hex for route steps" : ""}`}
                </small>
              </div>
              <div
                className="map-legend"
                aria-label={
                  heightMode === "rent"
                    ? "Estimated gross rent legend"
                    : "Travel time legend"
                }
              >
                <i
                  className={`legend-gradient ${
                    heightMode === "rent" ? "rent-gradient" : ""
                  }`}
                />
                <span>
                  {heightMode === "rent"
                    ? `$${Math.round(
                        (manifest?.rent.min_gross_rent ?? 965) / 100,
                      ) / 10}K lower`
                    : "shorter"}
                </span>
                <span>
                  {heightMode === "rent"
                    ? `$${Math.round(
                        (manifest?.rent.max_gross_rent ?? 4927) / 100,
                      ) / 10}K higher`
                    : "near limit"}
                </span>
              </div>
            </div>
          </div>

          <aside className="control-panel">
            <section className="destination-card">
              <p className="panel-label">Destination</p>
              <strong>{destination.label}</strong>
              <small>
                {destination.lat.toFixed(4)}, {destination.lng.toFixed(4)}
              </small>
              <form onSubmit={runSearch}>
                <label className="sr-only" htmlFor="location-search">
                  Search a neighborhood or address
                </label>
                <input
                  id="location-search"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Neighborhood or address"
                />
                <button type="submit">Find</button>
              </form>
              {searchMessage && <p className="search-message">{searchMessage}</p>}
            </section>

            <section className="control-group">
              <p className="panel-label">Analysis view</p>
              <div className="view-grid">
                {(Object.keys(VIEW_LABELS) as ViewMode[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={viewMode === item ? "active" : ""}
                    data-mode={item}
                    onClick={() => setViewMode(item)}
                  >
                    <span>{VIEW_LABELS[item]}</span>
                    <small>{VIEW_DESCRIPTIONS[item]}</small>
                  </button>
                ))}
              </div>
              <p className="control-help">
                Reachable area follows the selected travel mode.
              </p>
            </section>

            {viewMode === "subway" && (
              <section className="control-group scheduled-control">
                <p className="panel-label">Scheduled service</p>
                <div className="stacked-buttons">
                  {(Object.keys(SCENARIO_LABELS) as ScenarioId[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={scenario === item ? "active" : ""}
                      onClick={() => setScenario(item)}
                    >
                      {SCENARIO_LABELS[item]}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="control-group height-control">
              <p className="panel-label">Map encoding</p>
              <div className="height-buttons">
                {(Object.keys(HEIGHT_LABELS) as HeightMode[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={heightMode === item ? "active" : ""}
                    onClick={() => setHeightMode(item)}
                  >
                    {HEIGHT_LABELS[item]}
                  </button>
                ))}
              </div>
              <p className="control-help">
                {heightMode === "rent"
                  ? "Every residential hex reads one row from the 2020–2024 ACS + MapPLUTO rent table. Every different dollar value receives a different, continuously ranked bar height; homes beyond your commute limit stay hidden."
                  : "Color = commute time. Height = minutes left inside your commute budget."}
              </p>
              {heightMode === "rent" && (
                <a
                  className="data-download"
                  href={publicAsset("/data/rent-by-cell.csv")}
                  download
                >
                  Download the 5,543-row rent table
                </a>
              )}
            </section>

            <section className="switch-row">
              <label>
                <input
                  type="checkbox"
                  checked={newOnly}
                  onChange={(event) => setNewOnly(event.target.checked)}
                />
                <span>Highlight the next +5 min</span>
              </label>
              <button type="button" onClick={() => setTilted((value) => !value)}>
                {tilted ? "Flatten map" : "Tilt map"}
              </button>
            </section>
          </aside>
        </div>
      </section>

      <section className="results-section" id="research">
        <div className="metric-strip">
          <article>
            <span>Reachable homes</span>
            <strong>{formatNumber(metrics.units)}</strong>
          </article>
          <article>
            <span>Reachable hexes</span>
            <strong>{formatNumber(metrics.cells)}</strong>
          </article>
          <article>
            <span>Neighborhoods</span>
            <strong>{metrics.ntas}</strong>
          </article>
          <article>
            <span>
              {viewMode === "subway" ? "Lines available" : "Travel model"}
            </span>
            {viewMode === "subway" ? (
              <>
                <strong>{metrics.routes}</strong>
                <div
                  className="metric-route-list"
                  aria-label={`${metrics.routeIds.length} reachable subway lines: ${metrics.routeIds.join(", ")}`}
                >
                  {metrics.routeIds.slice(0, 8).map((route) => (
                    <RouteBullet
                      key={route}
                      route={route}
                      className="metric-route-bullet"
                    />
                  ))}
                  {metrics.routeIds.length > 8 && (
                    <small className="metric-route-overflow">
                      +{metrics.routeIds.length - 8} more
                    </small>
                  )}
                </div>
              </>
            ) : (
              <strong>{viewMode === "driving" ? "ROAD" : "WALK"}</strong>
            )}
          </article>
          <article className="accent-metric">
            <span>Unlocked by +5 min</span>
            <strong>+{formatNumber(metrics.newUnits)}</strong>
          </article>
        </div>

        <div className="results-grid">
          <section className="ranking-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-label">Residential reach</p>
                <h2>Neighborhood field</h2>
              </div>
              <span>
                Top 12 of {neighborhoodRanking.length}
                <small>Reachable share ↓ · median time ↑</small>
              </span>
            </div>
            <div className="ranking-tables">
              {neighborhoodColumns.map((column, columnIndex) => (
                <table
                  key={columnIndex}
                  aria-label={`Neighborhood accessibility ranking ${
                    columnIndex + 1
                  }`}
                >
                  <thead>
                    <tr>
                      <th scope="col">Rank</th>
                      <th scope="col">Neighborhood</th>
                      <th scope="col">Time</th>
                      <th scope="col">Reach</th>
                    </tr>
                  </thead>
                  <tbody>
                    {column.map((row, rowIndex) => {
                      const rank =
                        columnIndex * neighborhoodColumns[0].length +
                        rowIndex +
                        1;
                      return (
                        <tr
                          key={row.id}
                          className={selectedNta === row.id ? "selected" : ""}
                        >
                          <td className="rank">
                            {String(rank).padStart(2, "0")}
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => selectNeighborhood(row.id)}
                            >
                              <strong>{row.name}</strong>
                              <small>
                                {row.borough}
                                {row.primaryStation
                                  ? ` · via ${row.primaryStation.name}`
                                  : ""}
                              </small>
                            </button>
                          </td>
                          <td className="ranking-time">
                            <strong>{row.median.toFixed(0)} min</strong>
                            <small>
                              {row.fastest.toFixed(0)}–
                              {row.slowest.toFixed(0)}
                            </small>
                          </td>
                          <td className="rank-share">
                            <strong>{(row.share * 100).toFixed(0)}%</strong>
                            <i
                              style={{
                                width: `${Math.max(3, row.share * 100)}%`,
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ))}
            </div>
          </section>
        </div>
      </section>

      <section className="methodology-section" id="methodology">
        <div className="section-heading">
          <div className="index">02</div>
          <div>
            <p className="eyebrow">Transparent by design</p>
            <h2>How the field is built</h2>
          </div>
          <p>
            This is a comparative accessibility study, not a live journey
            planner or rental-listing service. Every assumption stays visible.
          </p>
        </div>

        <div className="method-flow" aria-label="Project data flow">
          <article>
            <span>01 / SOURCE</span>
            <strong>MTA + OSM</strong>
            <p>Subway schedules, entrances, pedestrian paths, and roads.</p>
          </article>
          <i>→</i>
          <article>
            <span>02 / NETWORK</span>
            <strong>Three modes</strong>
            <p>Subway, walking, and directed free-flow driving graphs.</p>
          </article>
          <i>→</i>
          <article>
            <span>03 / ACCESS</span>
            <strong>Homes + rent</strong>
            <p>Residential lots allocate official ACS rent to each H3 cell.</p>
          </article>
          <i>→</i>
          <article>
            <span>04 / INTERFACE</span>
            <strong>Time field</strong>
            <p>A worker changes mode while height changes independently.</p>
          </article>
        </div>

        <div className="method-grid">
          <article>
            <p className="panel-label">Model snapshot</p>
            <h3>
              {manifest ? formatNumber(manifest.cell_count) : "—"} H3 cells
            </h3>
            <p>
              Resolution 9 cells are joined to 2020 Neighborhood Tabulation
              Areas and weighted by MapPLUTO residential units.
            </p>
          </article>
          <article>
            <p className="panel-label">Transit graph</p>
            <h3>
              {manifest ? formatNumber(manifest.station_count) : "—"} stations
            </h3>
            <p>
              Direction-aware GTFS graphs are rebuilt for weekday peak,
              weekday midday, and combined Saturday–Sunday service. Published
              GTFS transfer times are used before the documented fallback.
            </p>
          </article>
          <article>
            <p className="panel-label">Road + walking graphs</p>
            <h3>OpenStreetMap networks</h3>
            <p>
              Walking follows the pedestrian network at 4.8 km/h. Driving
              follows directed roads with OSM speed data and excludes live
              traffic and parking.
            </p>
          </article>
        </div>

        <div className="method-notes">
          <article>
            <p className="panel-label">Research goal</p>
            <h3>What does one time budget mean across three travel modes?</h3>
            <p>
              Subway, driving, and walking are shown as separate maps. The
              interface does not hide their different assumptions inside a
              composite score.
            </p>
          </article>
          <article>
            <p className="panel-label">Pedestrian model</p>
            <h3>OSMnx shortest paths</h3>
            <p>
              H3 centers and valid station entrances or exits are snapped to
              the OpenStreetMap walking graph. Direct walking and first/last
              mile access use network distance at 4.8 km/h.
            </p>
          </article>
          <article>
            <p className="panel-label">Rent height</p>
            <h3>H3-level median gross rent estimate</h3>
            <p>
              MapPLUTO residential units allocate official Census block-group
              values to each cell. Missing observations use the official tract
              or borough value—never a neighboring-area interpolation. Each
              distinct rent value receives a distinct ranked height.
            </p>
          </article>
          <article>
            <p className="panel-label">Model date</p>
            <h3>{manifest?.model_version || "Loading model…"}</h3>
            <p>
              GTFS feed {manifest?.gtfs.feed_start_date || "—"}–
              {manifest?.gtfs.feed_end_date || "—"} · generated{" "}
              {manifest
                ? new Date(manifest.generated_at).toLocaleDateString("en-US")
                : "—"}
              .
            </p>
          </article>
          <article>
            <p className="panel-label">Validation</p>
            <h3>Geometry, indexes, paths, and matrices</h3>
            <p>
              Automated checks cover CRS, unique H3 and station indexes,
              residential NTA coverage, entry/exit rules, OSM connectivity,
              GTFS path sums, weekend routes, and Staten Island separation.
            </p>
          </article>
        </div>

        <div className="artifact-links" aria-label="Project deliverables">
          <a
            href={publicAsset("/methodology/final_project_analysis.ipynb")}
            download
          >
            Analysis notebook ↘
          </a>
          <a href={publicAsset("/methodology/project-diagram.svg")}>
            System diagram ↗
          </a>
          <a href={publicAsset("/methodology/data-dictionary.md")}>
            Data dictionary ↗
          </a>
          <a href={publicAsset("/data/rent-by-cell.csv")} download>
            Rent data table ↘
          </a>
          <a href={publicAsset("/methodology/rent-data-audit.md")}>
            Rent data audit ↗
          </a>
          <a href={publicAsset("/methodology/limitations.md")}>
            Full limitations ↗
          </a>
          <a href={publicAsset("/methodology/final-reflection.md")}>
            Final reflection ↗
          </a>
        </div>

        <div className="limitations">
          <div>
            <p className="panel-label">What this map does not know</p>
            <h2>Schedules are not lived experience.</h2>
          </div>
          <div>
            <p>
              The model does not include live delays, crowding, stairs, elevator
              outages, construction, safety perception, fare cost, or the
              emotional texture of a commute.
            </p>
            <p>
              Buses and ferries are excluded. Staten Island Railway remains
              disconnected from the subway because the model will not invent a
              ferry edge. NTA names are statistical approximations, not final
              definitions of neighborhood identity.
            </p>
            <p>
              OpenStreetMap paths and MTA schedules are still models: walk
              connectors are snapped to nearby graph nodes, expected waiting is
              half the scheduled headway, and temporary service conditions are
              absent.
            </p>
            <p>
              Driving uses free-flow road speeds and omits traffic, parking,
              incidents, toll delay, and curb access. The H3 rent surface
              allocates five-year ACS estimates by residential units and
              carries sampling error; it is not a live market price.
            </p>
          </div>
        </div>

        <div className="reflection">
          <p className="panel-label">Reflection and next questions</p>
          <h2>The field is precise about its assumptions, not about lived certainty.</h2>
          <p>
            Building the project showed that “30 minutes” is not a neutral
            measure. Express corridors stretch it, walking compresses it, and
            roads create a third field whose apparent speed excludes the cost of
            congestion and parking. Rent height adds housing context while the
            commute threshold still controls which homes appear. A future
            version should add
            observed reliability, live traffic, accessibility, and asking-rent
            data with an explicit license.
          </p>
        </div>
      </section>

      <footer>
        <strong>NYC TIME FIELD</strong>
        <p>
          Columbia GSAPP · Mapping Systems · Data from MTA, NYC Planning,
          the U.S. Census Bureau, MapPLUTO, and{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © OpenStreetMap contributors
          </a>
        </p>
        <a href="#top">Back to top ↑</a>
      </footer>
    </main>
  );
}
