const DATA_PATHS = {
  profiles: "data/venues.geojson",
  places: "data/cultural_places.geojson",
  stations: "data/subway_stations.geojson",
  network: "data/subway_network.json",
  programs: "data/current_programs.json",
};

const COLUMBIA = {
  name: "Columbia / Avery Hall",
  longitude: -73.96255,
  latitude: 40.80766,
};

const CATEGORY_COLORS = {
  "Art & Exhibitions": "#16846a",
  "Museums & Heritage": "#7259c8",
  "Performance & Music": "#f05a43",
  "Film & Media": "#315cf3",
  "Cultural Centers": "#dc4f86",
  "Design, Books & Architecture": "#d8a624",
  "Community Arts": "#25889a",
};

const CATEGORY_LABELS = {
  "Art & Exhibitions": "Art",
  "Museums & Heritage": "Museums",
  "Performance & Music": "Performance",
  "Film & Media": "Film",
  "Cultural Centers": "Culture",
  "Design, Books & Architecture": "Design + books",
  "Community Arts": "Community arts",
};

const WALKING_METERS_PER_MINUTE = 80;
const INITIAL_WAIT_MINUTES = 4;
const DEFAULT_DETOUR_RATIO = 1.18;
const SCREENING_ARRIVAL_BUFFER_MINUTES = 10;
const FOOT_ROUTER_URL = "https://routing.openstreetmap.de/routed-foot/route/v1/driving";
const PROFILE_KEY = "afterSixProfileV2";
const SAVED_KEY = "afterSixSavedV2";

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimeValue(date = new Date()) {
  const rounded = new Date(date);
  rounded.setMinutes(Math.ceil(rounded.getMinutes() / 5) * 5, 0, 0);
  return `${String(rounded.getHours()).padStart(2, "0")}:${String(rounded.getMinutes()).padStart(2, "0")}`;
}

const defaultProfile = {
  name: "",
  interests: ["Art & Exhibitions", "Film & Media"],
  maxJourney: 60,
  budget: 15,
  student: true,
  resident: true,
  under25: false,
  independent: true,
  accessible: false,
};

function loadStoredJson(key, fallback) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || "null");
    return stored ?? fallback;
  } catch {
    return fallback;
  }
}

const storedProfile = loadStoredJson(PROFILE_KEY, {});
const state = {
  date: localDateValue(),
  time: localTimeValue(),
  origin: { ...COLUMBIA },
  originStationId: null,
  originAccessWalkM: 400,
  view: "explore",
  query: "",
  category: "all",
  borough: "all",
  openOnly: false,
  sort: "recommended",
  programCategory: "all",
  selectedVenueId: null,
  detailMinimized: false,
  pickingOrigin: false,
  profile: { ...defaultProfile, ...storedProfile },
  saved: new Set(loadStoredJson(SAVED_KEY, [])),
  layers: { places: true, subway: false },
};

let map;
let originMarker;
let subwayNetwork;
let stationGeojson;
let placesGeojson;
let currentPrograms = [];
let venues = [];
let evaluatedVenues = [];
let originNetwork = null;
let routeByVenue = new Map();
let toastTimer;
let originSearchTimer;
let originSearchController;
let originSuggestions = [];
let walkRouteRequestId = 0;
let detailDrag = null;
const walkRouteCache = new Map();

const elements = {
  date: document.querySelector("#date-filter"),
  time: document.querySelector("#time-filter"),
  search: document.querySelector("#place-search"),
  category: document.querySelector("#category-filter"),
  borough: document.querySelector("#borough-filter"),
  openFilter: document.querySelector("#open-filter"),
  openFilterCount: document.querySelector("#open-filter-count"),
  sort: document.querySelector("#sort-filter"),
  programCategory: document.querySelector("#program-category-filter"),
  resultsList: document.querySelector("#results-list"),
  savedList: document.querySelector("#saved-list"),
  savedEmpty: document.querySelector("#saved-empty"),
  programsList: document.querySelector("#programs-list"),
  resultCount: document.querySelector("#result-count"),
  resultsTitle: document.querySelector("#results-title"),
  savedCount: document.querySelector("#saved-count"),
  placeCount: document.querySelector("#place-count"),
  withinJourneyCount: document.querySelector("#within-journey-count"),
  medianJourney: document.querySelector("#median-journey"),
  originName: document.querySelector("#origin-name"),
  originStation: document.querySelector("#origin-station"),
  originSearch: document.querySelector("#origin-search"),
  originSuggestions: document.querySelector("#origin-suggestions"),
  originSearchStatus: document.querySelector("#origin-search-status"),
  scenarioOrigin: document.querySelector("#scenario-origin"),
  scenarioWhen: document.querySelector("#scenario-when"),
  profileAvatar: document.querySelector("#profile-avatar"),
  profileSummary: document.querySelector("#profile-summary-text"),
  detail: document.querySelector("#venue-detail"),
  detailMinimize: document.querySelector("#minimize-detail"),
  walkRouteStatus: document.querySelector("#walk-route-status"),
  shareDialog: document.querySelector("#share-dialog"),
  methodDialog: document.querySelector("#method-dialog"),
  pickNotice: document.querySelector("#pick-notice"),
  toast: document.querySelector("#toast"),
};

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseProperty(value, fallback) {
  if (typeof value !== "string") {
    return value ?? fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseDateValue(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function departureDateTime() {
  const date = parseDateValue(state.date);
  const [hours, minutes] = state.time.split(":").map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}

function dayKey(date) {
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][date.getDay()];
}

function decimalTime(date) {
  return date.getHours() + date.getMinutes() / 60;
}

function decimalTimeValue(value) {
  if (Number.isFinite(Number(value)) && !String(value).includes(":")) return Number(value);
  const [hours, minutes] = String(value).split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours + minutes / 60 : null;
}

function formatTime(dateOrNumber) {
  if (dateOrNumber instanceof Date) {
    return dateOrNumber.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const totalMinutes = Math.round(Number(dateOrNumber) * 60);
  const date = new Date(2026, 0, 1, Math.floor(totalMinutes / 60) % 24, totalMinutes % 60);
  return formatTime(date);
}

function formatArrival(date) {
  const departure = departureDateTime();
  if (date.toDateString() === departure.toDateString()) {
    return formatTime(date);
  }
  return `${date.toLocaleDateString("en-US", { weekday: "short" })} ${formatTime(date)}`;
}

function selectedDateLabel() {
  return parseDateValue(state.date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function frequencyMatches(frequency, date) {
  const weekday = date.getDay();
  const dateNumber = date.getDate();
  if (["weekly", "daily", "seasonal-weekly"].includes(frequency)) return true;
  if (frequency === "first-friday") return weekday === 5 && dateNumber <= 7;
  if (frequency === "third-thursday") return weekday === 4 && dateNumber >= 15 && dateNumber <= 21;
  return false;
}

function haversineMeters(origin, destination) {
  const radius = 6_371_008.8;
  const radians = (value) => (value * Math.PI) / 180;
  const deltaLatitude = radians(destination.latitude - origin.latitude);
  const deltaLongitude = radians(destination.longitude - origin.longitude);
  const latitude1 = radians(origin.latitude);
  const latitude2 = radians(destination.latitude);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(a));
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function categoryColor(category) {
  return CATEGORY_COLORS[category] || "#16846a";
}

function priceLabel(price, fallback = "Price varies") {
  if (price === null || !Number.isFinite(price)) return fallback;
  if (price === 0) return "Free";
  if (price === 1) return "PWYW";
  return `$${Math.round(price)}`;
}

function metersLabel(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1609.344).toFixed(1)} mi`;
}

function isIndependentVenue(properties) {
  const text = `${properties.venue_type} ${properties.description}`.toLowerCase();
  return ["artist-run", "nonprofit", "community", "independent", "volunteer", "residency"].some((term) => text.includes(term));
}

class MinHeap {
  constructor() {
    this.items = [];
  }

  push(item) {
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent][0] <= item[0]) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = item;
  }

  pop() {
    if (!this.items.length) return null;
    const first = this.items[0];
    const last = this.items.pop();
    if (!this.items.length) return first;
    this.items[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.items.length && this.items[left][0] < this.items[smallest][0]) smallest = left;
      if (right < this.items.length && this.items[right][0] < this.items[smallest][0]) smallest = right;
      if (smallest === index) break;
      [this.items[index], this.items[smallest]] = [this.items[smallest], this.items[index]];
      index = smallest;
    }
    return first;
  }

  get size() {
    return this.items.length;
  }
}

function nearestStationTo(point, onlyAda = false) {
  let nearest = null;
  Object.values(subwayNetwork.nodes).forEach((station) => {
    if (onlyAda && Number(station.ada) <= 0) return;
    const distance = haversineMeters(point, {
      longitude: Number(station.longitude),
      latitude: Number(station.latitude),
    });
    if (!nearest || distance < nearest.distance) nearest = { station, distance };
  });
  return nearest;
}

function stationCandidates(feature, limit = 8) {
  const [longitude, latitude] = feature.geometry.coordinates;
  return Object.values(subwayNetwork.nodes)
    .map((station) => ({
      stationId: String(station.id),
      straightLineM: haversineMeters(
        { longitude, latitude },
        { longitude: Number(station.longitude), latitude: Number(station.latitude) },
      ),
    }))
    .sort((a, b) => a.straightLineM - b.straightLineM)
    .slice(0, limit);
}

function enrichVenue(culturalFeature, profileById) {
  const culture = culturalFeature.properties;
  const profile = culture.planner_id ? profileById[culture.planner_id] : null;
  const merged = {
    ...(profile?.properties || {}),
    ...culture,
    id: culture.id,
    planner_id: culture.planner_id || null,
    profile_complete: Boolean(culture.visit_checked),
    category: culture.category,
    venue_type: culture.venue_type,
    description: culture.description,
    website: culture.website,
    events_url: culture.events_url,
    program_label: culture.program_label,
    hours: parseProperty(culture.hours ?? profile?.properties.hours, {}),
    access_programs: parseProperty(profile?.properties.access_programs, []),
    screening_times: parseProperty(culture.screening_times, {}),
    closures: parseProperty(culture.closures, []),
  };
  const coordinates = culturalFeature.geometry.coordinates;
  const ada = nearestStationTo({ longitude: coordinates[0], latitude: coordinates[1] }, true);
  if (!merged.nearest_ada_station && ada) {
    merged.nearest_ada_station = ada.station.name;
    merged.nearest_ada_station_routes = ada.station.routes.join(" ");
    merged.nearest_ada_station_gtfs_id = ada.station.id;
    merged.ada_station_walk_m = ada.distance * DEFAULT_DETOUR_RATIO;
  }
  return {
    ...culturalFeature,
    properties: merged,
    stationCandidates: stationCandidates(culturalFeature),
  };
}

function buildOriginNetwork() {
  const routes = subwayNetwork.routes_by_station[state.originStationId] || [];
  const distances = {};
  const previous = {};
  const queue = new MinHeap();

  routes.forEach((route) => {
    const stateId = `${state.originStationId}|${route}`;
    if (subwayNetwork.state_adjacency[stateId]) {
      distances[stateId] = 0;
      queue.push([0, stateId]);
    }
  });

  while (queue.size) {
    const [distance, source] = queue.pop();
    if (distance !== distances[source]) continue;
    (subwayNetwork.state_adjacency[source] || []).forEach((edge) => {
      const candidate = distance + Number(edge.minutes);
      if (distances[edge.to] === undefined || candidate < distances[edge.to]) {
        distances[edge.to] = candidate;
        previous[edge.to] = source;
        queue.push([candidate, edge.to]);
      }
    });
  }
  originNetwork = { distances, previous };
}

function reconstructStatePath(target) {
  const path = [];
  let current = target;
  while (current) {
    path.push(current);
    current = originNetwork.previous[current];
  }
  return path.reverse();
}

function summarizeStatePath(statePath) {
  const routeNames = [];
  const stationPath = [];
  statePath.forEach((stateId) => {
    const separator = stateId.lastIndexOf("|");
    const stationId = stateId.slice(0, separator);
    const route = stateId.slice(separator + 1);
    if (stationPath.at(-1) !== stationId) stationPath.push(stationId);
    if (routeNames.at(-1) !== route) routeNames.push(route);
  });
  return { routeNames, stationPath, transferCount: Math.max(0, routeNames.length - 1) };
}

function calculateRoute(feature) {
  const detourRatio = Math.max(1, Number(feature.properties.network_detour_ratio) || DEFAULT_DETOUR_RATIO);
  let bestTransit = null;

  feature.stationCandidates.forEach((candidate) => {
    const destinationRoutes = subwayNetwork.routes_by_station[candidate.stationId] || [];
    destinationRoutes.forEach((route) => {
      const targetState = `${candidate.stationId}|${route}`;
      const networkMinutes = originNetwork.distances[targetState];
      if (!Number.isFinite(networkMinutes)) return;
      const egressWalkM = candidate.straightLineM * detourRatio;
      const totalMinutes =
        state.originAccessWalkM / WALKING_METERS_PER_MINUTE +
        INITIAL_WAIT_MINUTES +
        networkMinutes +
        egressWalkM / WALKING_METERS_PER_MINUTE;
      if (!bestTransit || totalMinutes < bestTransit.totalMinutes) {
        bestTransit = { mode: "subway", totalMinutes, networkMinutes, egressWalkM, destinationStationId: candidate.stationId, targetState };
      }
    });
  });

  const [longitude, latitude] = feature.geometry.coordinates;
  const directDistanceM = haversineMeters(state.origin, { longitude, latitude });
  const walkDistanceM = directDistanceM * detourRatio;
  const walkMinutes = walkDistanceM / WALKING_METERS_PER_MINUTE;

  if (!bestTransit || walkMinutes + 2 < bestTransit.totalMinutes) {
    return {
      mode: "walk",
      totalMinutes: walkMinutes,
      walkDistanceM,
      directDistanceM,
      routeNames: [],
      stationPath: [],
      transferCount: 0,
      egressWalkM: walkDistanceM,
      destinationStationId: null,
    };
  }

  const statePath = reconstructStatePath(bestTransit.targetState);
  return { ...bestTransit, ...summarizeStatePath(statePath), statePath, walkDistanceM, directDistanceM };
}

function updateRoutesForOrigin() {
  const nearest = nearestStationTo(state.origin);
  if (!nearest) return;
  state.originStationId = String(nearest.station.id);
  state.originAccessWalkM = state.origin.name === COLUMBIA.name ? 400 : nearest.distance * DEFAULT_DETOUR_RATIO;
  buildOriginNetwork();
  routeByVenue = new Map(venues.map((venue) => [venue.properties.id, calculateRoute(venue)]));
  elements.originName.textContent = state.origin.name;
  elements.originStation.textContent = `${nearest.station.routes.join(" ")} · ${nearest.station.name} · ${Math.round(state.originAccessWalkM)} m walk`;
}

function priceForProfile(properties) {
  if (properties.adult_price === null || properties.adult_price === undefined) return null;
  const prices = [Number(properties.adult_price)];
  if (state.profile.student && properties.student_price !== null && properties.student_price !== undefined) prices.push(Number(properties.student_price));
  if (state.profile.resident && properties.ny_resident_price !== null && properties.ny_resident_price !== undefined) prices.push(Number(properties.ny_resident_price));
  if (state.profile.under25 && properties.under_25_price !== null && properties.under_25_price !== undefined) prices.push(Number(properties.under_25_price));
  const valid = prices.filter(Number.isFinite);
  return valid.length ? Math.min(...valid) : null;
}

function programEligibilityMatches(program) {
  if (program.eligibility === "all") return true;
  if (program.eligibility === "student") return state.profile.student;
  if (program.eligibility === "ny_resident") return state.profile.resident;
  if (program.eligibility === "under_25") return state.profile.under25;
  return false;
}

function evaluateVenue(feature) {
  const properties = feature.properties;
  const route = routeByVenue.get(properties.id);
  const arrival = addMinutes(departureDateTime(), route.totalMinutes);
  const arrivalDecimal = decimalTime(arrival);
  const arrivalDay = dayKey(arrival);
  const arrivalDate = localDateValue(arrival);
  const regularHours = properties.hours[arrivalDay] || null;
  const activeClosure = properties.closures.find(
    (closure) => arrivalDate >= closure.start && arrivalDate <= closure.end,
  );
  const temporarilyClosed = properties.temporarily_closed === true || properties.temporarily_closed === "true" || Boolean(activeClosure);
  const hasWeeklyHours = Object.values(properties.hours).some(Boolean);
  const hasScreeningData = Object.prototype.hasOwnProperty.call(properties.screening_times, arrivalDate);
  const screeningTimes = (properties.screening_times[arrivalDate] || [])
    .map(decimalTimeValue)
    .filter(Number.isFinite)
    .sort((first, second) => first - second);
  const nextScreening = properties.schedule_type === "screening"
    ? screeningTimes.find((time) => time - arrivalDecimal >= SCREENING_ARRIVAL_BUFFER_MINUTES / 60) ?? null
    : null;
  let isOpen = hasWeeklyHours
    ? Boolean(regularHours && arrivalDecimal >= Number(regularHours[0]) && arrivalDecimal < Number(regularHours[1]) && !temporarilyClosed)
    : null;
  let closesAt = regularHours ? Number(regularHours[1]) : null;
  if (properties.schedule_type === "screening") {
    isOpen = temporarilyClosed ? false : hasScreeningData ? nextScreening !== null : null;
    closesAt = nextScreening;
  }
  let effectivePrice = priceForProfile(properties);
  let appliedProgram = null;

  if (properties.access_programs.length) {
    properties.access_programs.forEach((program) => {
      const active =
        program.days.includes(arrivalDay) &&
        arrivalDecimal >= Number(program.start) &&
        arrivalDecimal < Number(program.end) &&
        frequencyMatches(program.frequency, arrival) &&
        programEligibilityMatches(program);
      if (active) {
        isOpen = !temporarilyClosed;
        closesAt = Math.max(closesAt || 0, Number(program.end));
        if (effectivePrice === null || Number(program.price) <= effectivePrice) {
          effectivePrice = Number(program.price);
          appliedProgram = program.label;
        }
      }
    });
  }

  const withinBudget = effectivePrice === null ? null : effectivePrice <= state.profile.budget;
  const routeScore = clamp(105 - route.totalMinutes * 1.15, 0, 100);
  const interestMatch = state.profile.interests.includes(properties.category);
  const interestScore = interestMatch ? 100 : 52;
  const availabilityScore = isOpen === null ? 62 : isOpen ? clamp(72 + Math.max(0, closesAt - arrivalDecimal) * 8, 72, 100) : 15;
  const costScore = effectivePrice === null
    ? 62
    : withinBudget
      ? clamp(100 - (effectivePrice / Math.max(1, state.profile.budget)) * 35, 65, 100)
      : clamp(50 - ((effectivePrice - state.profile.budget) / Math.max(1, state.profile.budget)) * 45, 0, 50);
  const adaDistance = Number(properties.ada_station_walk_m);
  const adaScore = clamp(105 - adaDistance / 11, 0, 100);
  const weights = state.profile.accessible
    ? { route: 25, interest: 20, availability: 15, cost: 10, ada: 30 }
    : { route: 35, interest: 25, availability: 20, cost: 10, ada: 10 };
  let score = Math.round(
    (routeScore * weights.route +
      interestScore * weights.interest +
      availabilityScore * weights.availability +
      costScore * weights.cost +
      adaScore * weights.ada) /
      100,
  );
  if (state.profile.independent && isIndependentVenue(properties)) score = clamp(score + 8, 0, 100);

  let statusKey = "route-ready";
  let statusLabel = "Plan your visit";
  let statusNote = properties.hours_label;
  if (properties.schedule_type === "screening") {
    statusLabel = hasScreeningData ? "No later screening" : "Check today's showtimes";
    statusNote = hasScreeningData
      ? "No listed screening leaves enough time to arrive and check in."
      : "Today's screening times are not loaded; use the official schedule before leaving.";
  } else if (properties.schedule_type === "event") {
    statusLabel = "Event schedule";
  } else if (properties.schedule_type === "exhibition") {
    statusLabel = "Exhibition hours";
  }
  if (temporarilyClosed) {
    statusKey = "closed";
    statusLabel = "Temporarily closed";
    statusNote = activeClosure?.label || "A closure was recorded during the last data check.";
  } else if (isOpen === true && withinBudget === true) {
    statusKey = "available";
    statusLabel = properties.schedule_type === "screening" ? "Screening after you arrive" : "Open when you arrive";
    statusNote = properties.schedule_type === "screening"
      ? `Next listed show ${formatTime(nextScreening)}; includes a ${SCREENING_ARRIVAL_BUFFER_MINUTES}-minute check-in buffer.`
      : appliedProgram || `Open until ${formatTime(closesAt)}.`;
  } else if (isOpen === true && withinBudget === false) {
    statusKey = "over-budget";
    statusLabel = properties.schedule_type === "screening" ? "Show available, over your budget" : "Open, over your budget";
    statusNote = `${priceLabel(effectivePrice)} for your selected profile.`;
  } else if (isOpen === false) {
    statusKey = "closed";
    statusLabel = properties.schedule_type === "screening" ? "No later screening" : "Closed when you arrive";
    statusNote = properties.schedule_type === "screening"
      ? "No listed screening leaves enough time to arrive and check in."
      : "Regular weekly hours do not include one-off events.";
  }

  return {
    ...feature,
    properties: {
      ...properties,
      route,
      arrival,
      isOpen,
      closesAt,
      hasScreeningData,
      screeningTimes,
      nextScreening,
      activeClosure,
      effectivePrice,
      withinBudget,
      appliedProgram,
      interestMatch,
      statusKey,
      statusLabel,
      statusNote,
      score,
      distanceFromOriginM: route.directDistanceM,
      subScores: { route: Math.round(routeScore), interest: interestScore, availability: Math.round(availabilityScore), cost: Math.round(costScore), ada: Math.round(adaScore) },
    },
  };
}

function matchesDiscoveryFilters(properties) {
  const categoryMatches = state.category === "all" || properties.category === state.category;
  const boroughMatches = state.borough === "all" || properties.borough === state.borough;
  const query = state.query.trim().toLowerCase();
  if (!query) return categoryMatches && boroughMatches;
  const searchable = [properties.name, properties.category, properties.venue_type, properties.borough, properties.neighborhood, properties.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return categoryMatches && boroughMatches && searchable.includes(query);
}

function matchesFilters(properties) {
  return matchesDiscoveryFilters(properties) && (!state.openOnly || properties.isOpen === true);
}

function filteredVenues() {
  return evaluatedVenues.filter((venue) => matchesFilters(venue.properties));
}

function sortedVenues(items) {
  return [...items].sort((a, b) => {
    const first = a.properties;
    const second = b.properties;
    if (state.sort === "time") return first.route.totalMinutes - second.route.totalMinutes;
    if (state.sort === "distance") return first.distanceFromOriginM - second.distanceFromOriginM;
    if (state.sort === "cost") {
      const firstPrice = first.effectivePrice ?? Number.POSITIVE_INFINITY;
      const secondPrice = second.effectivePrice ?? Number.POSITIVE_INFINITY;
      return firstPrice - secondPrice || second.score - first.score;
    }
    return second.score - first.score || first.route.totalMinutes - second.route.totalMinutes;
  });
}

function routeLineLabel(route) {
  if (route.mode === "walk") return `${Math.round(route.totalMinutes)} min est. walk`;
  return `${route.routeNames.join(" ")} · ${Math.round(route.totalMinutes)} min`;
}

function compactAdmissionLabel(properties) {
  if (Number.isFinite(properties.effectivePrice)) return priceLabel(properties.effectivePrice);
  if (properties.schedule_type === "screening") return "By screening";
  if (properties.schedule_type === "event") return "By event";
  if (properties.schedule_type === "program") return "By program";
  const admission = properties.admission_label?.trim().toLowerCase() || "";
  if (admission.startsWith("always free") || admission.startsWith("free admission")) return "Free";
  if (admission.startsWith("free;")) return "Free / donation";
  return properties.admission_label || "Varies by program";
}

function availabilityLabel(properties) {
  if (properties.schedule_type === "screening" && properties.isOpen === true) {
    return { label: `Show ${formatTime(properties.nextScreening)}`, className: "open" };
  }
  if (properties.schedule_type === "screening" && properties.isOpen === false) {
    return { label: "No later show", className: "closed" };
  }
  if (properties.isOpen === true) return { label: "Open", className: "open" };
  if (properties.isOpen === false) return { label: "Closed", className: "closed" };
  if (properties.schedule_type === "screening") return { label: "Check showtimes", className: "scheduled" };
  if (properties.schedule_type === "event") return { label: "Event hours", className: "scheduled" };
  return { label: "Schedule", className: "scheduled" };
}

function venueCard(venue) {
  const properties = venue.properties;
  const availability = availabilityLabel(properties);
  const card = document.createElement("article");
  card.className = `result-card${state.selectedVenueId === properties.id ? " selected" : ""}`;
  card.tabIndex = 0;
  card.setAttribute("aria-label", `Open ${properties.name}`);
  card.style.setProperty("--category-color", categoryColor(properties.category));
  const saved = state.saved.has(properties.id);
  const arrivalStatus = `Arrive ${formatTime(properties.arrival)}`;
  card.innerHTML = `
    <div class="result-main">
      <div class="result-topline">
        <span class="result-category">${escapeHtml(CATEGORY_LABELS[properties.category] || properties.category)}</span>
        <span class="availability-label ${availability.className}">${escapeHtml(availability.label)}</span>
      </div>
      <strong class="result-name">${escapeHtml(properties.name)}</strong>
      <span class="result-kind">${escapeHtml(properties.venue_type)} · ${escapeHtml(properties.neighborhood)}</span>
      <div class="result-meta">
        <span><i data-lucide="${properties.route.mode === "walk" ? "footprints" : "train-front"}"></i>${escapeHtml(routeLineLabel(properties.route))}</span>
        <span><i data-lucide="clock-3"></i>${escapeHtml(arrivalStatus)}</span>
        <span><i data-lucide="ticket"></i>${escapeHtml(compactAdmissionLabel(properties))}</span>
      </div>
    </div>
    <div class="result-side">
      <span class="match-number">${properties.score}<small>%</small></span>
      <button class="save-button ${saved ? "saved" : ""}" type="button" aria-label="${saved ? "Remove" : "Save"} ${escapeHtml(properties.name)}"><i data-lucide="bookmark"></i></button>
    </div>
  `;
  card.addEventListener("click", (event) => {
    if (event.target.closest(".save-button")) {
      toggleSaved(properties.id);
      return;
    }
    selectVenue(properties.id, true);
  });
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.target.closest(".save-button")) selectVenue(properties.id, true);
  });
  return card;
}

function renderVenueLists() {
  const visible = sortedVenues(filteredVenues());
  const openCount = evaluatedVenues.filter((venue) => matchesDiscoveryFilters(venue.properties) && venue.properties.isOpen === true).length;
  if (visible.length) {
    elements.resultsList.replaceChildren(...visible.map(venueCard));
  } else {
    elements.resultsList.innerHTML = `
      <div class="empty-state search-empty">
        <i data-lucide="search-x"></i>
        <h2>No places found</h2>
        <p>Try another venue, neighborhood, or category.</p>
      </div>
    `;
  }
  elements.resultCount.textContent = `${visible.length} ${visible.length === 1 ? "place" : "places"}`;
  elements.openFilterCount.textContent = openCount;
  elements.resultsTitle.textContent = state.openOnly ? "Open when you arrive" : "Recommended for you";

  const saved = sortedVenues(evaluatedVenues.filter((venue) => state.saved.has(venue.properties.id)));
  elements.savedList.replaceChildren(...saved.map(venueCard));
  elements.savedList.hidden = saved.length === 0;
  elements.savedEmpty.hidden = saved.length > 0;
  elements.savedCount.textContent = state.saved.size;
  lucide.createIcons();
}

function programIsActive(program) {
  const selected = parseDateValue(state.date).getTime();
  const start = parseDateValue(program.start_date).getTime();
  const end = parseDateValue(program.end_date).getTime();
  return selected >= start && selected <= end;
}

function activeProgramsForVenue(venueId) {
  return currentPrograms.filter((program) => program.venue_id === venueId && programIsActive(program));
}

function programCard(program) {
  const venue = evaluatedVenues.find((item) => item.properties.id === program.venue_id);
  if (!venue) return null;
  const properties = venue.properties;
  const card = document.createElement("article");
  card.className = `program-card${program.featured ? " featured" : ""}`;
  card.style.setProperty("--category-color", categoryColor(properties.category));
  card.innerHTML = `
    <div class="program-card-accent"></div>
    <figure class="program-card-media">
      <img src="${escapeHtml(program.image_url)}" alt="${escapeHtml(program.image_alt || program.title)}" loading="lazy" />
      <figcaption>${escapeHtml(program.image_credit || properties.name)}</figcaption>
    </figure>
    <div class="program-card-body">
      <div class="program-card-top">
        <div><span class="program-kind">${escapeHtml(program.kind)}</span><h2>${escapeHtml(program.title)}</h2></div>
        <span class="program-date">${escapeHtml(program.date_label)}</span>
      </div>
      <p>${escapeHtml(program.description)}</p>
      <div class="program-venue">
        <div><strong>${escapeHtml(properties.name)}</strong><span>${escapeHtml(properties.neighborhood)} · ${escapeHtml(routeLineLabel(properties.route))} · arrive ${escapeHtml(formatTime(properties.arrival))}</span></div>
        <div class="program-card-actions">
          <button type="button" data-venue-id="${escapeHtml(properties.id)}" aria-label="Show route to ${escapeHtml(properties.name)}"><i data-lucide="route"></i></button>
          <a href="${escapeHtml(program.url)}" target="_blank" rel="noreferrer">Official details <i data-lucide="external-link"></i></a>
        </div>
      </div>
    </div>
  `;
  card.querySelector("button").addEventListener("click", () => selectVenue(properties.id, true));
  return card;
}

function renderPrograms() {
  const programs = currentPrograms
    .filter(programIsActive)
    .filter((program) => state.programCategory === "all" || program.kind === state.programCategory)
    .map((program) => ({
      program,
      venue: evaluatedVenues.find((item) => item.properties.id === program.venue_id),
    }))
    .filter((item) => item.venue)
    .sort((a, b) => {
      const aBoost = (a.program.featured ? 12 : 0) + (a.venue.properties.interestMatch ? 14 : 0);
      const bBoost = (b.program.featured ? 12 : 0) + (b.venue.properties.interestMatch ? 14 : 0);
      return b.venue.properties.score + bBoost - (a.venue.properties.score + aBoost);
    });
  if (programs.length) {
    elements.programsList.replaceChildren(...programs.map((item) => programCard(item.program)).filter(Boolean));
  } else {
    elements.programsList.innerHTML = `
      <div class="empty-state">
        <i data-lucide="calendar-x-2"></i>
        <h2>No checked programs for this date</h2>
        <p>Change the date or open a venue's official program page for the latest schedule.</p>
      </div>
    `;
  }
  document.querySelector("#program-check-label").textContent = `${selectedDateLabel()} · ${programs.length} current ${programs.length === 1 ? "program" : "programs"}`;
  lucide.createIcons();
}

function updateMetrics() {
  elements.placeCount.textContent = evaluatedVenues.length;
  const within = evaluatedVenues.filter((venue) => venue.properties.route.totalMinutes <= state.profile.maxJourney);
  elements.withinJourneyCount.textContent = within.length;
  elements.medianJourney.textContent = `${Math.round(median(evaluatedVenues.map((venue) => venue.properties.route.totalMinutes)))} min`;
  document.querySelector("#map-place-count").textContent = `${evaluatedVenues.length} places`;
  document.querySelector("#method-place-count").textContent = evaluatedVenues.length;
  document.querySelector("#method-route-count").textContent = evaluatedVenues.length;
}

function updateScenarioLabels() {
  elements.scenarioOrigin.textContent = state.origin.name;
  elements.scenarioWhen.textContent = `Leave ${selectedDateLabel()} at ${formatTime(departureDateTime())}`;
}

function updateProfileSummary() {
  const labels = state.profile.interests.slice(0, 2).map((category) => CATEGORY_LABELS[category] || category);
  elements.profileAvatar.textContent = (state.profile.name || "M").trim().charAt(0).toUpperCase() || "M";
  elements.profileSummary.textContent = `${labels.join(", ") || "Open to anything"} · $${state.profile.budget} max`;
}

function serializePlaces(items) {
  return {
    type: "FeatureCollection",
    features: items.map((venue) => ({
      type: "Feature",
      geometry: venue.geometry,
      properties: {
        id: venue.properties.id,
        name: venue.properties.name,
        category: venue.properties.category,
        score: venue.properties.score,
      },
    })),
  };
}

function updateMapData() {
  if (!map?.getSource("places")) return;
  map.getSource("places").setData(serializePlaces(filteredVenues()));
  map.setFilter("selected-place", ["==", ["get", "id"], state.selectedVenueId || ""]);
}

function updateApp({ writeUrl = true } = {}) {
  evaluatedVenues = venues.map(evaluateVenue);
  if (state.selectedVenueId) {
    const selected = evaluatedVenues.find((venue) => venue.properties.id === state.selectedVenueId);
    if (state.view === "explore" && selected && !matchesFilters(selected.properties)) {
      state.selectedVenueId = null;
      elements.detail.classList.remove("visible");
      clearRouteLine();
    }
  }
  renderVenueLists();
  renderPrograms();
  updateMetrics();
  updateScenarioLabels();
  updateProfileSummary();
  updateMapData();

  if (state.selectedVenueId) {
    const selected = evaluatedVenues.find((venue) => venue.properties.id === state.selectedVenueId);
    if (selected) {
      renderVenueDetail(selected);
      updateRouteLine(selected);
    }
  }
  if (writeUrl) writeScenarioToUrl();
}

function toggleSaved(id) {
  if (state.saved.has(id)) {
    state.saved.delete(id);
    showToast("Removed from saved places");
  } else {
    state.saved.add(id);
    showToast("Saved on this device");
  }
  localStorage.setItem(SAVED_KEY, JSON.stringify([...state.saved]));
  renderVenueLists();
  if (state.selectedVenueId === id) {
    const selected = evaluatedVenues.find((venue) => venue.properties.id === id);
    if (selected) renderVenueDetail(selected);
  }
}

function subwayRouteCoordinates(venue) {
  const route = venue.properties.route;
  if (route.mode !== "subway") return [];
  const coordinates = route.stationPath
    .map((stationId) => subwayNetwork.nodes[stationId])
    .filter(Boolean)
    .map((station) => [Number(station.longitude), Number(station.latitude)]);
  return coordinates.filter((coordinate, index) => index === 0 || coordinate[0] !== coordinates[index - 1][0] || coordinate[1] !== coordinates[index - 1][1]);
}

function walkingRouteEndpoints(venue) {
  const origin = [state.origin.longitude, state.origin.latitude];
  const destination = venue.geometry.coordinates;
  const subway = subwayRouteCoordinates(venue);
  if (!subway.length) return [[origin, destination]];
  return [
    [origin, subway[0]],
    [subway[subway.length - 1], destination],
  ].filter(([start, end]) => start[0] !== end[0] || start[1] !== end[1]);
}

function walkingRouteKey(start, end) {
  return [...start, ...end].map((value) => Number(value).toFixed(5)).join(",");
}

async function fetchWalkingRoute(start, end) {
  const key = walkingRouteKey(start, end);
  if (walkRouteCache.has(key)) return walkRouteCache.get(key);
  const coordinates = `${start[0]},${start[1]};${end[0]},${end[1]}`;
  const response = await fetch(`${FOOT_ROUTER_URL}/${coordinates}?overview=full&geometries=geojson&steps=false`);
  if (!response.ok) throw new Error("Street walking route is unavailable");
  const data = await response.json();
  const route = data.routes?.[0];
  if (!route?.geometry?.coordinates?.length) throw new Error("Street walking route is unavailable");
  const result = {
    coordinates: route.geometry.coordinates,
    distanceM: Number(route.distance),
    durationMinutes: Number(route.duration) / 60,
  };
  walkRouteCache.set(key, result);
  return result;
}

function routeFitCoordinates(venue) {
  return [
    [state.origin.longitude, state.origin.latitude],
    ...subwayRouteCoordinates(venue),
    venue.geometry.coordinates,
  ];
}

async function updateRouteLine(venue) {
  const subwaySource = map?.getSource("selected-route");
  const walkSource = map?.getSource("selected-walk");
  if (!subwaySource || !walkSource) return;
  const requestId = ++walkRouteRequestId;
  const subway = subwayRouteCoordinates(venue);
  subwaySource.setData(subway.length >= 2 ? {
    type: "Feature",
    properties: { mode: "subway" },
    geometry: { type: "LineString", coordinates: subway },
  } : { type: "FeatureCollection", features: [] });
  walkSource.setData({ type: "FeatureCollection", features: [] });
  elements.walkRouteStatus.textContent = "Finding street walk";
  try {
    const routes = await Promise.all(
      walkingRouteEndpoints(venue).map(([start, end]) => fetchWalkingRoute(start, end)),
    );
    if (requestId !== walkRouteRequestId || state.selectedVenueId !== venue.properties.id) return;
    walkSource.setData({
      type: "FeatureCollection",
      features: routes.map((route) => ({
        type: "Feature",
        properties: {
          mode: "street-walk",
          distance_m: Math.round(route.distanceM),
          duration_min: Math.round(route.durationMinutes),
        },
        geometry: { type: "LineString", coordinates: route.coordinates },
      })),
    });
    elements.walkRouteStatus.textContent = "Street walk";
  } catch {
    if (requestId !== walkRouteRequestId || state.selectedVenueId !== venue.properties.id) return;
    elements.walkRouteStatus.textContent = "Walk route unavailable";
    showToast("Street walking path unavailable; use Directions for turn-by-turn routing");
  }
}

function clearRouteLine() {
  walkRouteRequestId += 1;
  if (!map?.getSource("selected-route")) return;
  map.getSource("selected-route").setData({ type: "FeatureCollection", features: [] });
  if (map.getSource("selected-walk")) {
    map.getSource("selected-walk").setData({ type: "FeatureCollection", features: [] });
  }
  elements.walkRouteStatus.textContent = "Street walk";
  map.setFilter("selected-place", ["==", ["get", "id"], ""]);
}

function fitMapToRoute(venue) {
  if (!map) return;
  const coordinates = routeFitCoordinates(venue);
  const bounds = coordinates.reduce(
    (current, coordinate) => current.extend(coordinate),
    new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
  );
  const mobile = window.innerWidth <= 780;
  map.fitBounds(bounds, {
    padding: mobile ? { top: 70, right: 30, bottom: 230, left: 30 } : { top: 70, right: 470, bottom: 70, left: 55 },
    maxZoom: 14,
    duration: 700,
  });
}

function routeStepsHtml(properties) {
  const route = properties.route;
  if (route.mode === "walk") {
    return `<span class="route-step"><i data-lucide="footprints"></i>${escapeHtml(metersLabel(route.walkDistanceM))} estimated walk</span>`;
  }
  const destination = subwayNetwork.nodes[route.destinationStationId];
  const steps = [
    `<span class="route-step"><i data-lucide="footprints"></i>${Math.round(state.originAccessWalkM)} m</span>`,
    `<span class="route-arrow">›</span>`,
    `<span class="route-step"><i data-lucide="train-front"></i>${escapeHtml(route.routeNames.join(" → "))}</span>`,
    `<span class="route-arrow">›</span>`,
    `<span class="route-step">${route.transferCount} ${route.transferCount === 1 ? "transfer" : "transfers"}</span>`,
    `<span class="route-arrow">›</span>`,
    `<span class="route-step">${escapeHtml(destination?.name || "Destination station")}</span>`,
    `<span class="route-arrow">›</span>`,
    `<span class="route-step"><i data-lucide="footprints"></i>${Math.round(route.egressWalkM)} m</span>`,
  ];
  return steps.join("");
}

function formatHoursAtArrival(properties) {
  if (properties.activeClosure) return properties.activeClosure.label;
  if (properties.schedule_type === "screening") {
    if (properties.nextScreening !== null) return `Next listed show · ${formatTime(properties.nextScreening)}`;
    return properties.hasScreeningData ? "No later listed screening" : "Today's showtimes are not loaded";
  }
  const period = properties.hours[dayKey(properties.arrival)];
  if (!period) {
    const hasWeeklyHours = Object.values(properties.hours).some(Boolean);
    return hasWeeklyHours ? "Closed" : properties.hours_label;
  }
  return `${formatTime(period[0])}–${formatTime(period[1])}`;
}

function detailAdmissionLabel(properties) {
  if (properties.appliedProgram) return properties.appliedProgram;
  const label = properties.admission_label || compactAdmissionLabel(properties);
  if (!Number.isFinite(properties.effectivePrice)) return label;
  const profilePrice = priceLabel(properties.effectivePrice);
  if (label.startsWith(profilePrice) || label.toLowerCase().includes("free")) return label;
  return `${profilePrice} for your profile · ${label}`;
}

function renderVenueDetail(venue) {
  const properties = venue.properties;
  const color = categoryColor(properties.category);
  elements.detail.style.setProperty("--category-color", color);
  document.querySelector("#detail-accent").style.background = color;
  document.querySelector("#detail-category").textContent = `${properties.category} · ${properties.venue_type}`;
  document.querySelector("#detail-name").textContent = properties.name;
  document.querySelector("#detail-location").textContent = `${properties.address} · ${properties.neighborhood}, ${properties.borough}`;
  document.querySelector("#detail-description").textContent = properties.description;
  document.querySelector("#detail-score").textContent = properties.score;
  document.querySelector("#detail-status").textContent = properties.statusLabel;
  document.querySelector("#detail-status-note").textContent = properties.statusNote;
  document.querySelector("#detail-route-time").textContent = `${Math.round(properties.route.totalMinutes)} min`;
  document.querySelector("#detail-route-label").textContent = properties.route.mode === "walk" ? "Estimated walking time" : `${properties.route.routeNames.join(" → ")} · ${properties.route.transferCount} ${properties.route.transferCount === 1 ? "transfer" : "transfers"}`;
  document.querySelector("#detail-route-icon").innerHTML = `<i data-lucide="${properties.route.mode === "walk" ? "footprints" : "train-front"}"></i>`;
  document.querySelector("#detail-arrival").textContent = formatArrival(properties.arrival);
  document.querySelector("#detail-route-steps").innerHTML = routeStepsHtml(properties);
  document.querySelector("#detail-price").textContent = detailAdmissionLabel(properties);
  document.querySelector("#detail-hours").textContent = formatHoursAtArrival(properties);
  document.querySelector("#detail-link").href = properties.website;
  document.querySelector("#detail-events-link").href = properties.screening_source || properties.events_url;
  document.querySelector("#detail-events-label").textContent = properties.program_label || "Current programs";
  document.querySelector("#directions-link").href = `https://www.google.com/maps/dir/?api=1&origin=${state.origin.latitude},${state.origin.longitude}&destination=${venue.geometry.coordinates[1]},${venue.geometry.coordinates[0]}&travelmode=${properties.route.mode === "walk" ? "walking" : "transit"}`;

  const programs = activeProgramsForVenue(properties.id);
  const programSection = document.querySelector("#detail-programs-section");
  programSection.hidden = programs.length === 0;
  document.querySelector("#detail-programs").innerHTML = programs
    .map((program) => `<div class="venue-program-item"><a href="${escapeHtml(program.url)}" target="_blank" rel="noreferrer">${escapeHtml(program.title)}</a><span>${escapeHtml(program.date_label)}</span></div>`)
    .join("");

  const saveButton = document.querySelector("#detail-save");
  const saved = state.saved.has(properties.id);
  saveButton.classList.toggle("saved", saved);
  saveButton.setAttribute("aria-label", `${saved ? "Remove" : "Save"} ${properties.name}`);
  elements.detail.classList.add("visible");
  elements.detail.classList.toggle("minimized", state.detailMinimized);
  elements.detailMinimize.innerHTML = `<i data-lucide="${state.detailMinimized ? "maximize-2" : "minus"}"></i>`;
  elements.detailMinimize.setAttribute("aria-label", `${state.detailMinimized ? "Restore" : "Minimize"} venue details`);
  elements.detailMinimize.title = state.detailMinimized ? "Restore" : "Minimize";
  lucide.createIcons();
}

function selectVenue(id, fit = false) {
  state.selectedVenueId = id;
  const venue = evaluatedVenues.find((item) => item.properties.id === id);
  if (!venue) return;
  renderVenueLists();
  renderVenueDetail(venue);
  updateRouteLine(venue);
  updateMapData();
  if (fit) fitMapToRoute(venue);
  writeScenarioToUrl();
}

function closeDetail() {
  state.selectedVenueId = null;
  state.detailMinimized = false;
  elements.detail.classList.remove("visible");
  elements.detail.classList.remove("minimized");
  clearRouteLine();
  renderVenueLists();
  writeScenarioToUrl();
}

function toggleDetailMinimized() {
  state.detailMinimized = !state.detailMinimized;
  elements.detail.classList.toggle("minimized", state.detailMinimized);
  elements.detailMinimize.innerHTML = `<i data-lucide="${state.detailMinimized ? "maximize-2" : "minus"}"></i>`;
  elements.detailMinimize.setAttribute("aria-label", `${state.detailMinimized ? "Restore" : "Minimize"} venue details`);
  elements.detailMinimize.title = state.detailMinimized ? "Restore" : "Minimize";
  lucide.createIcons();
}

function resetDetailPosition() {
  elements.detail.style.removeProperty("left");
  elements.detail.style.removeProperty("top");
  elements.detail.style.removeProperty("right");
  elements.detail.style.removeProperty("bottom");
}

function bindDetailDragging() {
  const header = elements.detail.querySelector(".detail-header");
  header.addEventListener("pointerdown", (event) => {
    if (window.innerWidth <= 780 || event.target.closest("button, a")) return;
    const stage = document.querySelector(".map-stage").getBoundingClientRect();
    const detail = elements.detail.getBoundingClientRect();
    elements.detail.style.left = `${detail.left - stage.left}px`;
    elements.detail.style.top = `${detail.top - stage.top}px`;
    elements.detail.style.right = "auto";
    elements.detail.style.bottom = "auto";
    detailDrag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - detail.left,
      offsetY: event.clientY - detail.top,
    };
    elements.detail.classList.add("dragging");
    header.setPointerCapture(event.pointerId);
  });
  header.addEventListener("pointermove", (event) => {
    if (!detailDrag || detailDrag.pointerId !== event.pointerId) return;
    const stage = document.querySelector(".map-stage").getBoundingClientRect();
    const detail = elements.detail.getBoundingClientRect();
    const left = clamp(event.clientX - stage.left - detailDrag.offsetX, 8, Math.max(8, stage.width - detail.width - 8));
    const top = clamp(event.clientY - stage.top - detailDrag.offsetY, 8, Math.max(8, stage.height - detail.height - 8));
    elements.detail.style.left = `${left}px`;
    elements.detail.style.top = `${top}px`;
  });
  const stopDragging = (event) => {
    if (!detailDrag || detailDrag.pointerId !== event.pointerId) return;
    detailDrag = null;
    elements.detail.classList.remove("dragging");
  };
  header.addEventListener("pointerup", stopDragging);
  header.addEventListener("pointercancel", stopDragging);
  window.addEventListener("resize", () => {
    if (window.innerWidth <= 780) resetDetailPosition();
  });
}

function hideOriginSuggestions() {
  originSuggestions = [];
  elements.originSuggestions.hidden = true;
  elements.originSuggestions.replaceChildren();
}

function validNycCoordinate(coordinates) {
  const [longitude, latitude] = coordinates || [];
  return Number.isFinite(longitude) && Number.isFinite(latitude) && longitude >= -74.3 && longitude <= -73.65 && latitude >= 40.45 && latitude <= 40.95;
}

async function fetchOriginSuggestions(query, endpoint = "autocomplete") {
  originSearchController?.abort();
  originSearchController = new AbortController();
  const params = new URLSearchParams({ text: query, size: "5" });
  const response = await fetch(`https://geosearch.planninglabs.nyc/v2/${endpoint}?${params}`, { signal: originSearchController.signal });
  if (!response.ok) throw new Error("Address search is temporarily unavailable");
  const data = await response.json();
  return (data.features || [])
    .filter((feature) => validNycCoordinate(feature.geometry?.coordinates))
    .map((feature) => ({
      label: feature.properties?.label || feature.properties?.name || query,
      longitude: Number(feature.geometry.coordinates[0]),
      latitude: Number(feature.geometry.coordinates[1]),
    }));
}

function chooseOriginSuggestion(suggestion) {
  elements.originSearch.value = suggestion.label;
  elements.originSearchStatus.textContent = `Starting point set to ${suggestion.label}`;
  hideOriginSuggestions();
  setOrigin({ name: suggestion.label, longitude: suggestion.longitude, latitude: suggestion.latitude }, true);
  showToast("Starting point updated");
}

function renderOriginSuggestions(suggestions) {
  originSuggestions = suggestions;
  if (!suggestions.length) {
    hideOriginSuggestions();
    elements.originSearchStatus.textContent = "No matching New York City address found";
    return;
  }
  elements.originSuggestions.innerHTML = suggestions
    .map((suggestion, index) => `<button class="origin-suggestion" type="button" role="option" data-origin-index="${index}"><i data-lucide="map-pin"></i><span>${escapeHtml(suggestion.label)}</span></button>`)
    .join("");
  elements.originSuggestions.hidden = false;
  elements.originSuggestions.querySelectorAll("[data-origin-index]").forEach((button) => {
    button.addEventListener("click", () => chooseOriginSuggestion(originSuggestions[Number(button.dataset.originIndex)]));
  });
  elements.originSearchStatus.textContent = `${suggestions.length} address suggestions`;
  lucide.createIcons();
}

async function searchOrigin(query, endpoint = "autocomplete") {
  const trimmed = query.trim();
  if (trimmed.length < 3) {
    hideOriginSuggestions();
    return [];
  }
  try {
    const suggestions = await fetchOriginSuggestions(trimmed, endpoint);
    renderOriginSuggestions(suggestions);
    return suggestions;
  } catch (error) {
    if (error.name === "AbortError") return [];
    hideOriginSuggestions();
    elements.originSearchStatus.textContent = error.message;
    showToast(error.message);
    return [];
  }
}

function setOrigin(origin, fly = false) {
  state.origin = origin;
  elements.originSearch.value = origin.name === COLUMBIA.name ? "" : origin.name;
  originMarker?.setLngLat([origin.longitude, origin.latitude]);
  updateRoutesForOrigin();
  updateApp();
  if (fly && map) map.flyTo({ center: [origin.longitude, origin.latitude], zoom: 13, duration: 650 });
}

function subwayLinesGeojson() {
  const seen = new Set();
  const features = [];
  Object.entries(subwayNetwork.state_adjacency).forEach(([sourceState, edges]) => {
    const separator = sourceState.lastIndexOf("|");
    const sourceStationId = sourceState.slice(0, separator);
    const sourceRoute = sourceState.slice(separator + 1);
    edges.forEach((edge) => {
      if (edge.transfer) return;
      const targetSeparator = edge.to.lastIndexOf("|");
      const targetStationId = edge.to.slice(0, targetSeparator);
      const targetRoute = edge.to.slice(targetSeparator + 1);
      if (sourceRoute !== targetRoute || sourceStationId === targetStationId) return;
      const stationPair = [sourceStationId, targetStationId].sort().join("|");
      const key = `${sourceRoute}|${stationPair}`;
      if (seen.has(key)) return;
      seen.add(key);
      const source = subwayNetwork.nodes[sourceStationId];
      const target = subwayNetwork.nodes[targetStationId];
      if (!source || !target) return;
      features.push({
        type: "Feature",
        properties: { route: sourceRoute },
        geometry: { type: "LineString", coordinates: [[Number(source.longitude), Number(source.latitude)], [Number(target.longitude), Number(target.latitude)]] },
      });
    });
  });
  return { type: "FeatureCollection", features };
}

function createMap() {
  map = new maplibregl.Map({
    container: "map",
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    center: [-73.975, 40.743],
    zoom: 10.4,
    attributionControl: true,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  const markerElement = document.createElement("div");
  markerElement.className = "origin-marker";
  markerElement.style.cssText = "width:20px;height:20px;border:4px solid #fff;border-radius:50%;background:#315cf3;box-shadow:0 0 0 3px rgba(49,92,243,.25),0 3px 10px rgba(0,0,0,.25)";
  originMarker = new maplibregl.Marker({ element: markerElement }).setLngLat([state.origin.longitude, state.origin.latitude]).addTo(map);

  map.on("load", () => {
    map.addSource("subway-lines", { type: "geojson", data: subwayLinesGeojson() });
    map.addLayer({
      id: "subway-lines",
      type: "line",
      source: "subway-lines",
      layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#315cf3", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 14, 3], "line-opacity": 0.55 },
    });
    map.addSource("places", { type: "geojson", data: serializePlaces(filteredVenues()), cluster: true, clusterMaxZoom: 13, clusterRadius: 32 });
    map.addLayer({
      id: "place-clusters",
      type: "circle",
      source: "places",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#141414",
        "circle-radius": ["step", ["get", "point_count"], 16, 8, 20, 20, 24],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
    map.addLayer({
      id: "place-cluster-count",
      type: "symbol",
      source: "places",
      filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 11 },
      paint: { "text-color": "#ffffff" },
    });
    map.addLayer({
      id: "place-points",
      type: "circle",
      source: "places",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5, 15, 9],
        "circle-color": ["match", ["get", "category"],
          "Art & Exhibitions", CATEGORY_COLORS["Art & Exhibitions"],
          "Museums & Heritage", CATEGORY_COLORS["Museums & Heritage"],
          "Performance & Music", CATEGORY_COLORS["Performance & Music"],
          "Film & Media", CATEGORY_COLORS["Film & Media"],
          "Cultural Centers", CATEGORY_COLORS["Cultural Centers"],
          "Design, Books & Architecture", CATEGORY_COLORS["Design, Books & Architecture"],
          "Community Arts", CATEGORY_COLORS["Community Arts"],
          "#16846a"
        ],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
    map.addLayer({
      id: "selected-place",
      type: "circle",
      source: "places",
      filter: ["==", ["get", "id"], ""],
      paint: { "circle-radius": 13, "circle-color": "transparent", "circle-stroke-color": "#141414", "circle-stroke-width": 3 },
    });
    map.addSource("selected-walk", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "selected-walk-halo",
      type: "line",
      source: "selected-walk",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 },
    }, "place-clusters");
    map.addLayer({
      id: "selected-walk",
      type: "line",
      source: "selected-walk",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#77756f", "line-width": 3, "line-dasharray": [0.35, 1.55] },
    }, "place-clusters");
    map.addSource("selected-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "selected-route-halo",
      type: "line",
      source: "selected-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 },
    }, "place-clusters");
    map.addLayer({
      id: "selected-route",
      type: "line",
      source: "selected-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#315cf3", "line-width": 4 },
    }, "place-clusters");

    map.on("click", "place-points", (event) => {
      if (!state.pickingOrigin) selectVenue(event.features[0].properties.id, false);
    });
    map.on("click", "place-clusters", async (event) => {
      if (state.pickingOrigin) return;
      const feature = map.queryRenderedFeatures(event.point, { layers: ["place-clusters"] })[0];
      const zoom = await map.getSource("places").getClusterExpansionZoom(feature.properties.cluster_id);
      map.easeTo({ center: feature.geometry.coordinates, zoom });
    });
    ["place-points", "place-clusters"].forEach((layer) => {
      map.on("mouseenter", layer, () => { if (!state.pickingOrigin) map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, () => { if (!state.pickingOrigin) map.getCanvas().style.cursor = ""; });
    });
  });

  map.on("click", (event) => {
    if (!state.pickingOrigin) return;
    state.pickingOrigin = false;
    elements.pickNotice.classList.remove("visible");
    map.getCanvas().style.cursor = "";
    setOrigin({ name: "Selected map point", longitude: event.lngLat.lng, latitude: event.lngLat.lat });
  });
}

function switchView(view) {
  state.view = view;
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    const active = panel.dataset.viewPanel === view;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
  document.querySelectorAll(".view-button").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelector(".control-panel").scrollTo({ top: 0, behavior: "smooth" });
  writeScenarioToUrl();
}

function fitMapToFilters() {
  if (!map?.getSource("places")) return;
  const visible = filteredVenues();
  if (!visible.length) return;
  if (visible.length === 1) {
    map.flyTo({ center: visible[0].geometry.coordinates, zoom: 14, duration: 600 });
    return;
  }
  const bounds = visible.reduce(
    (current, venue) => current.extend(venue.geometry.coordinates),
    new maplibregl.LngLatBounds(visible[0].geometry.coordinates, visible[0].geometry.coordinates),
  );
  map.fitBounds(bounds, { padding: 45, maxZoom: 13, duration: 600 });
}

function syncProfileForm() {
  document.querySelector("#profile-name").value = state.profile.name;
  document.querySelector("#journey-limit").value = state.profile.maxJourney;
  document.querySelector("#journey-limit-output").textContent = `${state.profile.maxJourney} min`;
  document.querySelector("#profile-budget").value = state.profile.budget;
  document.querySelector("#profile-budget-output").textContent = `$${state.profile.budget}`;
  document.querySelector("#student-filter").checked = state.profile.student;
  document.querySelector("#resident-filter").checked = state.profile.resident;
  document.querySelector("#under25-filter").checked = state.profile.under25;
  document.querySelector("#independent-filter").checked = state.profile.independent;
  document.querySelector("#accessible-filter").checked = state.profile.accessible;
  document.querySelectorAll("[data-interest]").forEach((input) => {
    input.checked = state.profile.interests.includes(input.dataset.interest);
  });
}

function createInterestOptions() {
  const container = document.querySelector("#interest-options");
  container.innerHTML = Object.keys(CATEGORY_COLORS)
    .map((category) => `<label class="interest-option"><input type="checkbox" data-interest="${escapeHtml(category)}" /><span>${escapeHtml(CATEGORY_LABELS[category] || category)}</span></label>`)
    .join("");
}

function readProfileForm() {
  return {
    name: document.querySelector("#profile-name").value.trim(),
    interests: [...document.querySelectorAll("[data-interest]:checked")].map((input) => input.dataset.interest),
    maxJourney: Number(document.querySelector("#journey-limit").value),
    budget: Number(document.querySelector("#profile-budget").value),
    student: document.querySelector("#student-filter").checked,
    resident: document.querySelector("#resident-filter").checked,
    under25: document.querySelector("#under25-filter").checked,
    independent: document.querySelector("#independent-filter").checked,
    accessible: document.querySelector("#accessible-filter").checked,
  };
}

function setNow() {
  const now = new Date();
  state.date = localDateValue(now);
  state.time = localTimeValue(now);
  elements.date.value = state.date;
  elements.time.value = state.time;
  updateApp();
  showToast(`Leaving at ${formatTime(departureDateTime())}`);
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2300);
}

function writeScenarioToUrl() {
  const params = new URLSearchParams();
  params.set("date", state.date);
  params.set("time", state.time);
  params.set("view", state.view);
  if (state.borough !== "all") params.set("borough", state.borough);
  if (state.category !== "all") params.set("category", state.category);
  if (state.sort !== "recommended") params.set("sort", state.sort);
  if (state.openOnly) params.set("open", "1");
  if (state.selectedVenueId) params.set("place", state.selectedVenueId);
  if (state.origin.name !== COLUMBIA.name) {
    params.set("lat", state.origin.latitude.toFixed(5));
    params.set("lng", state.origin.longitude.toFixed(5));
    params.set("origin", state.origin.name);
  }
  history.replaceState(null, "", `${location.pathname}?${params}`);
}

function publicSiteUrl() {
  try {
    if (window.top !== window && window.top.location.origin === location.origin) {
      return `${location.origin}/`;
    }
  } catch {
    // Cross-origin embedding falls back to the current app path.
  }
  return `${location.origin}${location.pathname}`;
}

function selectedTripShareData() {
  writeScenarioToUrl();
  const selected = evaluatedVenues.find((venue) => venue.properties.id === state.selectedVenueId);
  return {
    title: selected ? `${selected.properties.name} · After Six NYC` : "After Six NYC trip",
    text: selected
      ? `${formatTime(departureDateTime())} departure · arrive ${formatTime(selected.properties.arrival)} · ${Math.round(selected.properties.route.totalMinutes)} min`
      : `Culture options from ${state.origin.name} at ${formatTime(departureDateTime())}`,
    url: location.href,
  };
}

async function shareOrCopy(shareData, successMessage, copyMessage) {
  if (navigator.share) {
    try {
      await navigator.share(shareData);
      showToast(successMessage);
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${shareData.title}\n${shareData.text}\n${shareData.url}`);
    showToast(copyMessage);
  } catch {
    showToast("Copy the link from your browser address bar");
  }
}

function readScenarioFromUrl() {
  const params = new URLSearchParams(location.search);
  if (params.has("date")) state.date = params.get("date");
  if (params.has("time")) state.time = params.get("time");
  if (["explore", "programs", "saved", "profile"].includes(params.get("view"))) state.view = params.get("view");
  if (["all", "Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"].includes(params.get("borough"))) state.borough = params.get("borough");
  if (["all", ...Object.keys(CATEGORY_COLORS)].includes(params.get("category"))) state.category = params.get("category");
  if (["recommended", "journey", "distance", "price"].includes(params.get("sort"))) state.sort = params.get("sort");
  state.openOnly = params.get("open") === "1";
  state.selectedVenueId = params.get("place") || null;
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lng"));
  if (params.has("lat") && params.has("lng") && Number.isFinite(latitude) && Number.isFinite(longitude)) {
    state.origin = { name: params.get("origin") || "Shared start", latitude, longitude };
  }
}

function bindControls() {
  document.querySelectorAll(".view-button").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  document.querySelectorAll("[data-go-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.goView)));
  document.querySelector("#brand-home").addEventListener("click", () => switchView("explore"));
  document.querySelector("#open-profile").addEventListener("click", () => switchView("profile"));

  elements.date.addEventListener("change", (event) => { state.date = event.target.value; updateApp(); });
  elements.time.addEventListener("change", (event) => { state.time = event.target.value; updateApp(); });
  document.querySelector("#now-button").addEventListener("click", setNow);
  elements.search.addEventListener("input", (event) => { state.query = event.target.value; updateApp({ writeUrl: false }); fitMapToFilters(); });
  elements.category.addEventListener("change", (event) => { state.category = event.target.value; updateApp({ writeUrl: false }); fitMapToFilters(); });
  elements.borough.addEventListener("change", (event) => { state.borough = event.target.value; updateApp(); fitMapToFilters(); });
  elements.openFilter.addEventListener("click", () => {
    state.openOnly = !state.openOnly;
    elements.openFilter.setAttribute("aria-pressed", String(state.openOnly));
    updateApp();
    fitMapToFilters();
  });
  elements.sort.addEventListener("change", (event) => { state.sort = event.target.value; renderVenueLists(); });
  elements.programCategory.addEventListener("change", (event) => { state.programCategory = event.target.value; renderPrograms(); });

  elements.originSearch.addEventListener("input", (event) => {
    clearTimeout(originSearchTimer);
    const query = event.target.value.trim();
    if (query.length < 3) {
      hideOriginSuggestions();
      return;
    }
    originSearchTimer = setTimeout(() => searchOrigin(query), 260);
  });
  elements.originSearch.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideOriginSuggestions();
  });
  document.querySelector("#origin-search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    clearTimeout(originSearchTimer);
    const query = elements.originSearch.value.trim();
    const suggestions = originSuggestions.length ? originSuggestions : await searchOrigin(query, "search");
    if (suggestions.length) chooseOriginSuggestion(suggestions[0]);
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#origin-search-form")) hideOriginSuggestions();
  });

  document.querySelector("#locate-button").addEventListener("click", () => {
    if (!navigator.geolocation) { showToast("Location is not available in this browser"); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => setOrigin({ name: "My location", longitude: position.coords.longitude, latitude: position.coords.latitude }, true),
      () => showToast("Your location could not be read"),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
  document.querySelector("#pick-button").addEventListener("click", () => {
    if (!map) return;
    state.pickingOrigin = !state.pickingOrigin;
    elements.pickNotice.classList.toggle("visible", state.pickingOrigin);
    map.getCanvas().style.cursor = state.pickingOrigin ? "crosshair" : "";
  });
  document.querySelector("#reset-origin").addEventListener("click", () => setOrigin({ ...COLUMBIA }, true));

  document.querySelector("#close-detail").addEventListener("click", closeDetail);
  elements.detailMinimize.addEventListener("click", toggleDetailMinimized);
  document.querySelector("#detail-save").addEventListener("click", () => { if (state.selectedVenueId) toggleSaved(state.selectedVenueId); });

  document.querySelector("#places-layer-button").addEventListener("click", (event) => {
    state.layers.places = !state.layers.places;
    ["place-clusters", "place-cluster-count", "place-points", "selected-place"].forEach((id) => {
      if (map?.getLayer(id)) map.setLayoutProperty(id, "visibility", state.layers.places ? "visible" : "none");
    });
    event.currentTarget.classList.toggle("active", state.layers.places);
    event.currentTarget.setAttribute("aria-pressed", String(state.layers.places));
  });
  document.querySelector("#subway-layer-button").addEventListener("click", (event) => {
    state.layers.subway = !state.layers.subway;
    if (map?.getLayer("subway-lines")) map.setLayoutProperty("subway-lines", "visibility", state.layers.subway ? "visible" : "none");
    event.currentTarget.classList.toggle("active", state.layers.subway);
    event.currentTarget.setAttribute("aria-pressed", String(state.layers.subway));
  });

  document.querySelector("#journey-limit").addEventListener("input", (event) => { document.querySelector("#journey-limit-output").textContent = `${event.target.value} min`; });
  document.querySelector("#profile-budget").addEventListener("input", (event) => { document.querySelector("#profile-budget-output").textContent = `$${event.target.value}`; });
  document.querySelector("#profile-form").addEventListener("submit", (event) => {
    event.preventDefault();
    state.profile = readProfileForm();
    localStorage.setItem(PROFILE_KEY, JSON.stringify(state.profile));
    updateApp();
    showToast("Culture profile saved on this device");
    switchView("explore");
  });

  document.querySelector("#share-button").addEventListener("click", () => elements.shareDialog.showModal());
  document.querySelector("#close-share").addEventListener("click", () => elements.shareDialog.close());
  document.querySelector("#share-site-option").addEventListener("click", async () => {
    elements.shareDialog.close();
    await shareOrCopy({
      title: "After Six NYC",
      text: "Find a cultural place that is genuinely reachable after your day ends.",
      url: publicSiteUrl(),
    }, "Website shared", "Website link copied");
  });
  document.querySelector("#share-trip-option").addEventListener("click", async () => {
    elements.shareDialog.close();
    await shareOrCopy(selectedTripShareData(), "Trip shared", "Trip link copied");
  });
  elements.shareDialog.addEventListener("click", (event) => { if (event.target === elements.shareDialog) elements.shareDialog.close(); });
  document.querySelector("#open-method").addEventListener("click", () => elements.methodDialog.showModal());
  document.querySelector("#close-method").addEventListener("click", () => elements.methodDialog.close());
  elements.methodDialog.addEventListener("click", (event) => { if (event.target === elements.methodDialog) elements.methodDialog.close(); });

  document.querySelector("#mobile-list-toggle").addEventListener("click", (event) => {
    document.body.classList.toggle("map-focused");
    const focused = document.body.classList.contains("map-focused");
    event.currentTarget.innerHTML = `<i data-lucide="${focused ? "list" : "map"}"></i><span>${focused ? "Show list" : "Full map"}</span>`;
    setTimeout(() => map.resize(), 20);
    lucide.createIcons();
  });
}

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}

async function initialize() {
  try {
    readScenarioFromUrl();
    createInterestOptions();
    const [profileData, placeData, stationData, networkData, programData] = await Promise.all([
      loadJson(DATA_PATHS.profiles),
      loadJson(DATA_PATHS.places),
      loadJson(DATA_PATHS.stations),
      loadJson(DATA_PATHS.network),
      loadJson(DATA_PATHS.programs),
    ]);
    subwayNetwork = networkData;
    stationGeojson = stationData;
    placesGeojson = placeData;
    currentPrograms = programData;
    const profileById = Object.fromEntries(profileData.features.map((feature) => [feature.properties.id, feature]));
    venues = placeData.features.map((feature) => enrichVenue(feature, profileById));

    elements.date.value = state.date;
    elements.time.value = state.time;
    elements.borough.value = state.borough;
    elements.category.value = state.category;
    elements.sort.value = state.sort;
    elements.openFilter.setAttribute("aria-pressed", String(state.openOnly));
    elements.originSearch.value = state.origin.name === COLUMBIA.name ? "" : state.origin.name;
    syncProfileForm();
    updateRoutesForOrigin();
    evaluatedVenues = venues.map(evaluateVenue);
    bindControls();
    bindDetailDragging();
    createMap();
    switchView(state.view);
    updateApp({ writeUrl: false });
    lucide.createIcons();
  } catch (error) {
    console.error(error);
    elements.resultsList.innerHTML = `<div class="empty-state"><h2>The planner could not load</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

initialize();
