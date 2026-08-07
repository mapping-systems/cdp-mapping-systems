/// <reference lib="webworker" />

import type {
  DriveNetwork,
  RouteResult,
  ScenarioId,
  StationAccess,
  SubwayEdge,
  SubwayGraph,
  WalkNetwork,
  WorkerResult,
} from "../lib/types";

type InitPayload = {
  type: "init";
  stationCount: number;
  cellCenters: [number, number][];
  stationCoordinates: [number, number][];
  access: StationAccess;
  walk: WalkNetwork;
  drive: DriveNetwork;
  matrices: Record<ScenarioId, ArrayBuffer>;
  referenceSpeeds: Record<ScenarioId, number>;
  matrixUnit: number;
  unreachable: number;
  entryOverhead: number;
  exitOverhead: number;
};

type RouteGraphPayload = {
  type: "route-graph";
  graph: SubwayGraph;
};

type ComputePayload = {
  type: "compute";
  destinationCell: number;
  scenario: ScenarioId;
};

type RoutePayload = {
  type: "route";
  purpose: "inspect" | "hover";
  requestId: number;
  cell: number;
  destinationCell: number;
  scenario: ScenarioId;
  originStation: number;
  destinationStation: number;
  originWalk: number;
  destinationWalk: number;
};

let stationCount = 0;
let cellCenters: [number, number][] = [];
let stationCoordinates: [number, number][] = [];
let access: StationAccess;
let adjacency: [number, number][][] = [];
let driveReverseAdjacency: [number, number][][] = [];
let matrices: Record<ScenarioId, Uint16Array>;
const graphs = {} as Record<ScenarioId, SubwayGraph>;
const graphAdjacency = {} as Record<ScenarioId, SubwayEdge[][]>;
let referenceSpeeds: Record<ScenarioId, number>;
let matrixUnit = 0.1;
let unreachable = 65535;
let entryOverhead = 2;
let exitOverhead = 1;

function haversineKm(
  first: [number, number],
  second: [number, number],
): number {
  const radius = 6371.0088;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const [lng1, lat1] = first;
  const [lng2, lat2] = second;
  const p1 = toRadians(lat1);
  const p2 = toRadians(lat2);
  const dp = toRadians(lat2 - lat1);
  const dl = toRadians(lng2 - lng1);
  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

class MinHeap {
  private values: [number, number][] = [];

  push(value: [number, number]) {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.values[parent][0] <= value[0]) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = value;
  }

  pop(): [number, number] | undefined {
    if (!this.values.length) return undefined;
    const root = this.values[0];
    const last = this.values.pop();
    if (!this.values.length || !last) return root;
    let index = 0;
    this.values[0] = last;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (
        left < this.values.length &&
        this.values[left][0] < this.values[smallest][0]
      ) {
        smallest = left;
      }
      if (
        right < this.values.length &&
        this.values[right][0] < this.values[smallest][0]
      ) {
        smallest = right;
      }
      if (smallest === index) break;
      [this.values[index], this.values[smallest]] = [
        this.values[smallest],
        this.values[index],
      ];
      index = smallest;
    }
    return root;
  }

  get size() {
    return this.values.length;
  }
}

function walkingDistances(origin: number): number[] {
  const distance = new Array(cellCenters.length).fill(Number.POSITIVE_INFINITY);
  const heap = new MinHeap();
  distance[origin] = 0;
  heap.push([0, origin]);
  while (heap.size) {
    const current = heap.pop();
    if (!current) break;
    const [minutes, node] = current;
    if (minutes !== distance[node] || minutes > 90) continue;
    for (const [neighbor, weight] of adjacency[node]) {
      const candidate = minutes + weight;
      if (candidate < distance[neighbor] && candidate <= 90) {
        distance[neighbor] = candidate;
        heap.push([candidate, neighbor]);
      }
    }
  }
  return distance;
}

function drivingDistances(destination: number): number[] {
  const distance = new Array(cellCenters.length).fill(Number.POSITIVE_INFINITY);
  const heap = new MinHeap();
  distance[destination] = 0;
  heap.push([0, destination]);
  while (heap.size) {
    const current = heap.pop();
    if (!current) break;
    const [minutes, node] = current;
    if (minutes !== distance[node] || minutes > 90) continue;
    for (const [origin, weight] of driveReverseAdjacency[node]) {
      const candidate = minutes + weight;
      if (candidate < distance[origin] && candidate <= 90) {
        distance[origin] = candidate;
        heap.push([candidate, origin]);
      }
    }
  }
  return distance;
}

function walkingRoute(origin: number, destination: number): number[] {
  if (origin === destination) return [origin];
  const distance = new Array(cellCenters.length).fill(Number.POSITIVE_INFINITY);
  const previous = new Array(cellCenters.length).fill(-1);
  const heap = new MinHeap();
  distance[origin] = 0;
  heap.push([0, origin]);
  while (heap.size) {
    const current = heap.pop();
    if (!current) break;
    const [minutes, node] = current;
    if (minutes !== distance[node] || minutes > 90) continue;
    if (node === destination) break;
    for (const [neighbor, weight] of adjacency[node]) {
      const candidate = minutes + weight;
      if (candidate < distance[neighbor] && candidate <= 90) {
        distance[neighbor] = candidate;
        previous[neighbor] = node;
        heap.push([candidate, neighbor]);
      }
    }
  }
  if (!Number.isFinite(distance[destination])) return [];
  const path = [destination];
  let current = destination;
  while (current !== origin && previous[current] >= 0) {
    current = previous[current];
    path.push(current);
  }
  return path.reverse();
}

function reconstructSubwayRoute(
  scenario: ScenarioId,
  originStation: number,
  destinationStation: number,
): { edges: SubwayEdge[]; initialWait: number } {
  if (originStation < 0 || destinationStation < 0) {
    return { edges: [], initialWait: 0 };
  }
  if (originStation === destinationStation) {
    return { edges: [], initialWait: 0 };
  }
  const graph = graphs[scenario];
  if (!graph || !graphAdjacency[scenario]) {
    return { edges: [], initialWait: 0 };
  }
  const stateCount = graph.states.length;
  const distance = new Array(stateCount).fill(Number.POSITIVE_INFINITY);
  const previousState = new Array(stateCount).fill(-1);
  const previousEdge: Array<SubwayEdge | null> = new Array(stateCount).fill(null);
  const heap = new MinHeap();
  for (const state of graph.station_states[String(originStation)] || []) {
    const key = `${graph.states[state].route}:${graph.states[state].direction}`;
    const wait = (graph.headways[key] || 10) / 2;
    distance[state] = wait;
    heap.push([wait, state]);
  }
  const destinations = new Set(
    graph.station_states[String(destinationStation)] || [],
  );
  let target = -1;
  while (heap.size) {
    const current = heap.pop();
    if (!current) break;
    const [minutes, state] = current;
    if (minutes !== distance[state]) continue;
    if (destinations.has(state)) {
      target = state;
      break;
    }
    for (const edge of graphAdjacency[scenario][state]) {
      const candidate = minutes + edge.minutes;
      if (candidate < distance[edge.to]) {
        distance[edge.to] = candidate;
        previousState[edge.to] = state;
        previousEdge[edge.to] = edge;
        heap.push([candidate, edge.to]);
      }
    }
  }
  if (target < 0) return { edges: [], initialWait: 0 };
  const edges: SubwayEdge[] = [];
  let state = target;
  while (previousState[state] >= 0 && previousEdge[state]) {
    edges.push(previousEdge[state]!);
    state = previousState[state];
  }
  edges.reverse();
  const root = graph.states[state];
  const initialWait =
    (graph.headways[`${root.route}:${root.direction}`] || 10) / 2;
  return { edges, initialWait };
}

function route(payload: RoutePayload): RouteResult {
  const subway = reconstructSubwayRoute(
    payload.scenario,
    payload.originStation,
    payload.destinationStation,
  );
  const waitMinutes =
    subway.initialWait +
    subway.edges.reduce((sum, edge) => sum + edge.wait_minutes, 0);
  const rideMinutes = subway.edges.reduce(
    (sum, edge) => sum + edge.ride_minutes,
    0,
  );
  const transferMinutes = subway.edges.reduce(
    (sum, edge) => sum + edge.transfer_minutes,
    0,
  );
  const stationSequence = [payload.originStation];
  const routeSequence: string[] = [];
  let rideDistanceKm = 0;
  for (const edge of subway.edges) {
    if (stationSequence[stationSequence.length - 1] !== edge.to_station) {
      stationSequence.push(edge.to_station);
    }
    if (
      edge.kind === "ride" &&
      routeSequence[routeSequence.length - 1] !== edge.route
    ) {
      routeSequence.push(edge.route);
    }
    if (edge.kind === "ride") {
      const from = stationCoordinates[edge.from_station];
      const to = stationCoordinates[edge.to_station];
      if (from && to) rideDistanceKm += haversineKm(from, to);
    }
  }
  const direct = payload.originStation < 0;
  const walkCellSequence = direct
    ? walkingRoute(payload.cell, payload.destinationCell)
    : [];
  const straightDistanceKm = haversineKm(
    cellCenters[payload.cell],
    cellCenters[payload.destinationCell],
  );
  const walkingMinutes = direct
    ? Math.max(
        0,
        walkingDistances(payload.destinationCell)[payload.cell],
      )
    : Math.max(0, payload.originWalk - entryOverhead) +
      Math.max(0, payload.destinationWalk - exitOverhead);
  const networkDistanceKm =
    (walkingMinutes * 80) / 1000 +
    rideDistanceKm +
    (transferMinutes * 80) / 1000;
  return {
    type: "route",
    purpose: payload.purpose,
    requestId: payload.requestId,
    cell: payload.cell,
    destinationCell: payload.destinationCell,
    scenario: payload.scenario,
    originStation: payload.originStation,
    destinationStation: payload.destinationStation,
    stationSequence: direct ? [] : stationSequence,
    routeSequence,
    walkCellSequence,
    waitMinutes: Number(waitMinutes.toFixed(2)),
    rideMinutes: Number(rideMinutes.toFixed(2)),
    transferMinutes: Number(transferMinutes.toFixed(2)),
    subwayMinutes: Number(
      (waitMinutes + rideMinutes + transferMinutes).toFixed(2),
    ),
    networkDistanceKm: Number(networkDistanceKm.toFixed(3)),
    straightDistanceKm: Number(straightDistanceKm.toFixed(3)),
    circuityRatio: Number(
      (
        networkDistanceKm / Math.max(straightDistanceKm, 0.001)
      ).toFixed(2),
    ),
    edges: subway.edges,
  };
}

function compute(destinationCell: number, scenario: ScenarioId): WorkerResult {
  const candidateCount = access.candidate_count;
  const matrix = matrices[scenario];
  const directTimes = walkingDistances(destinationCell);
  const drivingTimes = drivingDistances(destinationCell);
  const destinationCandidates: { station: number; minutes: number }[] = [];

  for (let index = 0; index < candidateCount; index += 1) {
    const offset = destinationCell * candidateCount + index;
    const station = access.exit_stations[offset];
    if (station >= 0) {
      destinationCandidates.push({
        station,
        minutes: access.exit_minutes[offset],
      });
    }
  }

  const times = new Array(cellCenters.length).fill(Number.POSITIVE_INFINITY);
  const euclideanTimes = new Array(cellCenters.length).fill(
    Number.POSITIVE_INFINITY,
  );
  const deltas = new Array(cellCenters.length).fill(0);
  const originStations = new Array(cellCenters.length).fill(-1);
  const destinationStations = new Array(cellCenters.length).fill(-1);
  const originWalk = new Array(cellCenters.length).fill(0);
  const destinationWalk = new Array(cellCenters.length).fill(0);
  const transitTime = new Array(cellCenters.length).fill(0);
  const speed = referenceSpeeds[scenario] || 20;

  for (let cell = 0; cell < cellCenters.length; cell += 1) {
    let best = directTimes[cell];
    let bestOrigin = -1;
    let bestDestination = -1;
    let bestOriginWalk = best;
    let bestDestinationWalk = 0;
    let bestTransit = 0;

    for (let entryIndex = 0; entryIndex < candidateCount; entryIndex += 1) {
      const entryOffset = cell * candidateCount + entryIndex;
      const originStation = access.entry_stations[entryOffset];
      if (originStation < 0) continue;
      const originMinutes = access.entry_minutes[entryOffset];
      for (const destination of destinationCandidates) {
        const matrixValue =
          matrix[originStation * stationCount + destination.station];
        if (matrixValue === unreachable) continue;
        const subwayMinutes = matrixValue * matrixUnit;
        const total = originMinutes + subwayMinutes + destination.minutes;
        if (total < best) {
          best = total;
          bestOrigin = originStation;
          bestDestination = destination.station;
          bestOriginWalk = originMinutes;
          bestDestinationWalk = destination.minutes;
          bestTransit = subwayMinutes;
        }
      }
    }

    const straightDistance = haversineKm(
      cellCenters[cell],
      cellCenters[destinationCell],
    );
    const euclidean = (straightDistance / speed) * 60;
    times[cell] = Number.isFinite(best) ? Number(best.toFixed(2)) : 999;
    euclideanTimes[cell] = Number(euclidean.toFixed(2));
    deltas[cell] = Number((times[cell] - euclidean).toFixed(2));
    originStations[cell] = bestOrigin;
    destinationStations[cell] = bestDestination;
    originWalk[cell] = Number(bestOriginWalk.toFixed(2));
    destinationWalk[cell] = Number(bestDestinationWalk.toFixed(2));
    transitTime[cell] = Number(bestTransit.toFixed(2));
  }

  return {
    type: "result",
    destinationCell,
    scenario,
    times,
    directTimes,
    drivingTimes,
    euclideanTimes,
    deltas,
    originStations,
    destinationStations,
    originWalk,
    destinationWalk,
    transitTime,
  };
}

function loadRouteGraph(graph: SubwayGraph) {
  graphs[graph.scenario] = graph;
  graphAdjacency[graph.scenario] = Array.from(
    { length: graph.states.length },
    () => [],
  );
  for (const edge of graph.edges) {
    graphAdjacency[graph.scenario][edge.from].push(edge);
  }
}

self.addEventListener(
  "message",
  (
    event: MessageEvent<
      InitPayload | RouteGraphPayload | ComputePayload | RoutePayload
    >,
  ) => {
    if (event.data.type === "init") {
      stationCount = event.data.stationCount;
      cellCenters = event.data.cellCenters;
      stationCoordinates = event.data.stationCoordinates;
      access = event.data.access;
      adjacency = Array.from({ length: event.data.walk.node_count }, () => []);
      for (const [first, second, minutes] of event.data.walk.edges) {
        adjacency[first].push([second, minutes]);
        adjacency[second].push([first, minutes]);
      }
      driveReverseAdjacency = Array.from(
        { length: event.data.drive.node_count },
        () => [],
      );
      for (const [from, to, minutes] of event.data.drive.edges) {
        driveReverseAdjacency[to].push([from, minutes]);
      }
      matrices = {
        weekday_am: new Uint16Array(event.data.matrices.weekday_am),
        weekday_midday: new Uint16Array(event.data.matrices.weekday_midday),
        weekend: new Uint16Array(event.data.matrices.weekend),
      };
      referenceSpeeds = event.data.referenceSpeeds;
      matrixUnit = event.data.matrixUnit;
      unreachable = event.data.unreachable;
      entryOverhead = event.data.entryOverhead;
      exitOverhead = event.data.exitOverhead;
      self.postMessage({ type: "ready" });
      return;
    }
    if (event.data.type === "route-graph") {
      loadRouteGraph(event.data.graph);
      return;
    }
    if (event.data.type === "compute") {
      self.postMessage(compute(event.data.destinationCell, event.data.scenario));
      return;
    }
    if (event.data.type === "route") {
      self.postMessage(route(event.data));
    }
  },
);

export {};
