import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const dataRoot = new URL("../public/data/", import.meta.url);

test("model manifest and matrix files share one stable station index", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("manifest.json", dataRoot), "utf8"),
  );
  assert.ok(manifest.cell_count > 6000);
  assert.equal(manifest.station_count, 496);
  assert.equal(manifest.scenarios.length, 3);
  assert.equal(manifest.matrix_unit_minutes, 0.1);
  assert.equal(manifest.unreachable_value, 65535);
  assert.equal(manifest.model_version, "2026.07.29-v5");
  assert.equal(manifest.assumptions.driving_model, "osmnx_free_flow_drive_v1");
  assert.equal(
    manifest.rent.source,
    "U.S. Census Bureau 2020–2024 ACS five-year detailed tables",
  );
  assert.ok(manifest.rent.block_groups_with_estimate > 5_000);
  assert.ok(manifest.rent.unique_cell_estimates > 4_000);
  assert.ok(manifest.rent.unique_bar_heights > 4_000);
  assert.equal(manifest.rent.rent_table_rows, 5_543);
  assert.equal(manifest.rent.rent_table_asset, "rent-by-cell.csv");
  assert.ok(manifest.rent.residential_unit_coverage > 0.999);
  assert.ok(
    manifest.rent.min_gross_rent < manifest.rent.city_reference_gross_rent,
  );
  assert.ok(
    manifest.rent.city_reference_gross_rent < manifest.rent.max_gross_rent,
  );
  assert.ok(manifest.rent.height_scale_low < manifest.rent.height_scale_high);
  assert.equal(
    manifest.assumptions.walking_model,
    "osmnx_shortest_path_v1",
  );
  assert.deepEqual(
    manifest.scenarios.find(({ scenario }) => scenario === "weekend")
      .service_ids,
    ["Saturday", "Sunday"],
  );

  const expectedBytes = manifest.station_count ** 2 * 2;
  for (const name of [
    "subway-weekday-am.bin",
    "subway-weekday-midday.bin",
    "subway-weekend.bin",
  ]) {
    const info = await stat(new URL(name, dataRoot));
    assert.equal(info.size, expectedBytes);
  }
});

test("walking access uses valid OSMnx-derived station candidates", async () => {
  const [manifest, access, walk] = await Promise.all(
    ["manifest.json", "station-access.json", "walk-network.json"].map(
      async (name) =>
        JSON.parse(await readFile(new URL(name, dataRoot), "utf8")),
    ),
  );
  const expectedLength = manifest.cell_count * access.candidate_count;
  assert.equal(access.walking_model, "osmnx_shortest_path_v1");
  assert.equal(access.entry_stations.length, expectedLength);
  assert.equal(access.exit_stations.length, expectedLength);
  assert.match(walk.model, /OSMnx/);
  assert.ok(walk.source_graph_nodes > 300_000);
  assert.ok(walk.edges.length > 30_000);
  for (const station of [
    ...access.entry_stations,
    ...access.exit_stations,
  ]) {
    assert.ok(station === -1 || (station >= 0 && station < manifest.station_count));
  }
});

test("driving and H3 rent assets cover all residential cells", async () => {
  const [manifest, drive, cells, rentCsv] = await Promise.all([
    JSON.parse(await readFile(new URL("manifest.json", dataRoot), "utf8")),
    JSON.parse(await readFile(new URL("drive-network.json", dataRoot), "utf8")),
    JSON.parse(await readFile(new URL("cells.geojson", dataRoot), "utf8")),
    readFile(new URL("rent-by-cell.csv", dataRoot), "utf8"),
  ]);
  assert.equal(drive.directed, true);
  assert.equal(drive.node_count, manifest.cell_count);
  assert.ok(drive.edges.length > 100_000);
  for (const [from, to, minutes] of drive.edges) {
    assert.ok(from >= 0 && from < manifest.cell_count);
    assert.ok(to >= 0 && to < manifest.cell_count);
    assert.ok(minutes > 0);
  }
  const residential = cells.features.filter(
    ({ properties }) => properties.housing_units > 0,
  );
  const rentRows = rentCsv.trim().split(/\r?\n/);
  assert.equal(rentRows.length, residential.length + 1);
  assert.match(rentRows[0], /median_gross_rent_usd/);
  assert.match(rentRows[0], /bar_height_m/);
  assert.ok(
    residential.every(
      ({ properties }) =>
        properties.rent_estimate > 250 &&
        properties.rent_estimate < 10_000 &&
        properties.rent_estimate_moe > 0 &&
        properties.rent_bar_height_m >= manifest.rent.bar_height_min_m &&
        properties.rent_bar_height_m <= manifest.rent.bar_height_max_m &&
        properties.rent_source_count >= 1 &&
        properties.rent_coverage_share > 0.99,
    ),
  );
  const uniqueCellRents = new Set(
    residential.map(({ properties }) => properties.rent_estimate),
  );
  assert.ok(uniqueCellRents.size / residential.length > 0.7);

  const rentToHeight = new Map();
  for (const { properties } of residential) {
    const existing = rentToHeight.get(properties.rent_estimate);
    if (existing !== undefined) {
      assert.equal(existing, properties.rent_bar_height_m);
    } else {
      rentToHeight.set(
        properties.rent_estimate,
        properties.rent_bar_height_m,
      );
    }
  }
  const sortedEncoding = [...rentToHeight.entries()].sort(
    ([first], [second]) => first - second,
  );
  for (let index = 1; index < sortedEncoding.length; index += 1) {
    assert.ok(sortedEncoding[index][1] > sortedEncoding[index - 1][1]);
  }
});

test("scenario graphs expose reconstructable time components and explicit transfers", async () => {
  for (const scenario of ["weekday-am", "weekday-midday", "weekend"]) {
    const graph = JSON.parse(
      await readFile(
        new URL(`subway-graph-${scenario}.json`, dataRoot),
        "utf8",
      ),
    );
    assert.ok(graph.states.length > 1_000);
    assert.ok(graph.edges.some((edge) => edge.explicit_gtfs === true));
    for (const edge of graph.edges) {
      const parts =
        edge.ride_minutes + edge.wait_minutes + edge.transfer_minutes;
      assert.ok(Math.abs(edge.minutes - parts) <= 0.02);
    }
  }
});

test("weekend graph omits weekday-only service patterns", async () => {
  const graph = JSON.parse(
    await readFile(
      new URL("subway-graph-weekend.json", dataRoot),
      "utf8",
    ),
  );
  const routes = new Set(graph.states.map(({ route }) => route));
  for (const route of ["B", "W", "Z", "6X", "7X", "FX"]) {
    assert.equal(routes.has(route), false);
  }
});

test("public geospatial assets are non-empty feature collections", async () => {
  for (const name of [
    "cells.geojson",
    "neighborhoods.geojson",
    "stations.geojson",
    "subway-lines.geojson",
  ]) {
    const collection = JSON.parse(await readFile(new URL(name, dataRoot), "utf8"));
    assert.equal(collection.type, "FeatureCollection");
    assert.ok(collection.features.length > 0);
  }
});
