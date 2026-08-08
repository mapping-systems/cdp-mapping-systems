import { readFile, writeFile } from "node:fs/promises";

const inputPath = new URL("./data/open_space_parks.geojson", import.meta.url);
const outputPath = new URL("./data/open_space_simplified.geojson", import.meta.url);
const sourceUrl =
  "https://data.cityofnewyork.us/api/v3/views/g84h-jbjm/query.geojson?accessType=DOWNLOAD";
const tolerance = 0.000055;

function squaredSegmentDistance(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;

  if (dx !== 0 || dy !== 0) {
    const ratio = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (ratio > 1) {
      x = end[0];
      y = end[1];
    } else if (ratio > 0) {
      x += dx * ratio;
      y += dy * ratio;
    }
  }

  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplifyLine(points, squaredTolerance) {
  if (points.length <= 2) return points;
  let maximumDistance = squaredTolerance;
  let splitIndex = 0;

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = squaredSegmentDistance(points[index], points[0], points.at(-1));
    if (distance > maximumDistance) {
      splitIndex = index;
      maximumDistance = distance;
    }
  }

  if (!splitIndex) return [points[0], points.at(-1)];
  const left = simplifyLine(points.slice(0, splitIndex + 1), squaredTolerance);
  const right = simplifyLine(points.slice(splitIndex), squaredTolerance);
  return left.slice(0, -1).concat(right);
}

function simplifyRing(ring) {
  if (!Array.isArray(ring) || ring.length < 5) return ring;
  const openRing = ring.slice(0, -1);
  const simplified = simplifyLine(openRing, tolerance * tolerance);
  if (simplified.length < 3) return ring;
  return [...simplified, simplified[0]];
}

function simplifyGeometry(geometry) {
  if (geometry.type === "Polygon") {
    return { ...geometry, coordinates: geometry.coordinates.map(simplifyRing) };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) => polygon.map(simplifyRing)),
    };
  }
  return geometry;
}

let sourceText;
try {
  sourceText = await readFile(inputPath, "utf8");
} catch {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Open-space download failed: ${response.status}`);
  sourceText = await response.text();
}

const source = JSON.parse(sourceText);
const output = {
  type: "FeatureCollection",
  features: source.features
    .filter((feature) => feature.geometry)
    .map((feature) => ({
      type: "Feature",
      properties: {
        name: feature.properties?.park_name || "Mapped open space",
        landuse: feature.properties?.landuse || null,
        system: feature.properties?.system || null,
      },
      geometry: simplifyGeometry(feature.geometry),
    })),
};

await writeFile(outputPath, JSON.stringify(output));
console.log(`Prepared ${output.features.length} open-space features.`);
