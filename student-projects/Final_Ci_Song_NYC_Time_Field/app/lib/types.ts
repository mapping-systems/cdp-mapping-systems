export type ScenarioId = "weekday_am" | "weekday_midday" | "weekend";
export type ViewMode = "subway" | "driving" | "walking";
export type HeightMode = "time" | "rent";
export type InteractionMode = "destination" | "inspect";

export type ScenarioSummary = {
  scenario: ScenarioId;
  label: string;
  service_id: string;
  service_ids?: string[];
  window_seconds: [number, number];
  active_trip_count: number;
  state_count: number;
  ride_edge_count: number;
  transfer_edge_count?: number;
  explicit_transfer_rule_count?: number;
  reference_speed_kmh: number;
};

export type Manifest = {
  model_version: string;
  generated_at: string;
  title: string;
  cell_count: number;
  residential_cell_count: number;
  station_count: number;
  neighborhood_count: number;
  housing_units: number;
  h3_resolution: number;
  matrix_unit_minutes: number;
  unreachable_value: number;
  rent: {
    source: string;
    measure: string;
    geography: string;
    acs_period: string;
    source_hierarchy: string[];
    block_groups_with_estimate: number;
    block_groups_with_direct_estimate: number;
    source_unit_shares: Record<string, number>;
    unique_cell_estimates: number;
    unique_bar_heights: number;
    rent_table_rows: number;
    rent_table_asset: string;
    residential_unit_coverage: number;
    city_reference_gross_rent: number;
    median_margin_of_error: number;
    min_gross_rent: number;
    max_gross_rent: number;
    height_scale_low: number;
    height_scale_high: number;
    bar_height_method: string;
    bar_height_min_m: number;
    bar_height_max_m: number;
  };
  scenarios: ScenarioSummary[];
  assumptions: Record<string, unknown>;
  gtfs: {
    feed_start_date: number;
    feed_end_date: number;
    feed_version: string;
  };
};

export type CellProperties = {
  cell_index: number;
  cell_id: string;
  nta_id: string;
  nta_name: string;
  borough: string;
  housing_units: number;
  rent_estimate?: number | null;
  rent_estimate_moe?: number | null;
  rent_percentile?: number | null;
  rent_bar_height_m?: number | null;
  rent_source_level?: string | null;
  rent_primary_source?: string | null;
  rent_source_geoid?: string | null;
  rent_source_count?: number | null;
  rent_coverage_share?: number | null;
  travel_time?: number;
  euclidean_time?: number;
  delta?: number;
  reachable?: boolean;
  newly_reachable?: boolean;
  display_value?: number;
  slack?: number;
};

export type StationAccess = {
  candidate_count: number;
  walking_model: string;
  entry_stations: number[];
  entry_minutes: number[];
  exit_stations: number[];
  exit_minutes: number[];
};

export type WalkNetwork = {
  node_count: number;
  model: string;
  source_graph_nodes?: number;
  source_graph_edges?: number;
  edges: [number, number, number][];
};

export type DriveNetwork = {
  node_count: number;
  model: string;
  directed: true;
  source_graph_nodes?: number;
  source_graph_edges?: number;
  edges: [number, number, number][];
};

export type SubwayState = {
  station: number;
  route: string;
  direction: number;
};

export type SubwayEdge = {
  from: number;
  to: number;
  minutes: number;
  kind: "ride" | "transfer";
  route: string;
  from_station: number;
  to_station: number;
  ride_minutes: number;
  wait_minutes: number;
  transfer_minutes: number;
  explicit_gtfs?: boolean;
};

export type SubwayGraph = {
  scenario: ScenarioId;
  states: SubwayState[];
  edges: SubwayEdge[];
  station_states: Record<string, number[]>;
  headways: Record<string, number>;
};

export type WorkerResult = {
  type: "result";
  destinationCell: number;
  scenario: ScenarioId;
  times: number[];
  directTimes: number[];
  drivingTimes: number[];
  euclideanTimes: number[];
  deltas: number[];
  originStations: number[];
  destinationStations: number[];
  originWalk: number[];
  destinationWalk: number[];
  transitTime: number[];
};

export type RouteResult = {
  type: "route";
  purpose: "inspect" | "hover";
  requestId: number;
  cell: number;
  destinationCell: number;
  scenario: ScenarioId;
  originStation: number;
  destinationStation: number;
  stationSequence: number[];
  routeSequence: string[];
  walkCellSequence: number[];
  waitMinutes: number;
  rideMinutes: number;
  transferMinutes: number;
  subwayMinutes: number;
  networkDistanceKm: number;
  straightDistanceKm: number;
  circuityRatio: number;
  edges: SubwayEdge[];
};
