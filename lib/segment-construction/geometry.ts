import type { LineString, MultiLineString, Position } from "geojson";

const EARTH_RADIUS_METERS = 6371008.8;
const METERS_PER_MILE = 1609.344;

type XY = { x: number; y: number };

export function distanceMeters(a: Position, b: Position) {
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lineLengthMeters(coordinates: Position[]) {
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) total += distanceMeters(coordinates[index - 1], coordinates[index]);
  return total;
}

export function metersToMiles(value: number) {
  return round(value / METERS_PER_MILE, 6);
}

export function multiLineLengthMeters(geometry: MultiLineString) {
  return geometry.coordinates.reduce((sum, line) => sum + lineLengthMeters(line), 0);
}

export function segmentIntersection(a1: Position, a2: Position, b1: Position, b2: Position) {
  const origin = averagePoint([a1, a2, b1, b2]);
  const p = project(a1, origin), r = subtract(project(a2, origin), p);
  const q = project(b1, origin), s = subtract(project(b2, origin), q);
  const cross = cross2(r, s);
  const qmp = subtract(q, p);
  if (Math.abs(cross) < 1e-9) return undefined;
  const t = cross2(qmp, s) / cross;
  const u = cross2(qmp, r) / cross;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return undefined;
  return interpolate(a1, a2, clamp(t, 0, 1));
}

export function distancePointToSegmentMeters(point: Position, a: Position, b: Position) {
  const origin = averagePoint([point, a, b]);
  const p = project(point, origin);
  const start = project(a, origin);
  const end = project(b, origin);
  const line = subtract(end, start);
  const lengthSq = dot(line, line);
  const ratio = lengthSq === 0 ? 0 : clamp(dot(subtract(p, start), line) / lengthSq, 0, 1);
  const closest = unproject({ x: start.x + line.x * ratio, y: start.y + line.y * ratio }, origin);
  return { distanceMeters: distanceMeters(point, closest), closest, ratio };
}

export function pointMeasureOnLineMeters(point: Position, coordinates: Position[], toleranceMeters: number) {
  let best: { distanceMeters: number; measureMeters: number; coordinate: Position } | undefined;
  let before = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const projected = distancePointToSegmentMeters(point, start, end);
    const segmentLength = distanceMeters(start, end);
    const measureMeters = before + segmentLength * projected.ratio;
    if (!best || projected.distanceMeters < best.distanceMeters) best = { distanceMeters: projected.distanceMeters, measureMeters, coordinate: projected.closest };
    before += segmentLength;
  }
  return best && best.distanceMeters <= toleranceMeters ? best : undefined;
}

export function sliceLineByMeasures(coordinates: Position[], startMeasure: number, endMeasure: number): Position[] {
  if (endMeasure <= startMeasure) return [];
  const output: Position[] = [];
  let before = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const segmentLength = distanceMeters(start, end);
    const after = before + segmentLength;
    if (after < startMeasure) { before = after; continue; }
    if (before > endMeasure) break;
    const localStart = clamp((startMeasure - before) / segmentLength, 0, 1);
    const localEnd = clamp((endMeasure - before) / segmentLength, 0, 1);
    if (output.length === 0) output.push(interpolate(start, end, localStart));
    if (localEnd > localStart) output.push(interpolate(start, end, localEnd));
    before = after;
  }
  return dedupeSequentialCoordinates(output);
}

export function endpointCoordinates(geometry: MultiLineString) {
  return geometry.coordinates.flatMap((line, componentIndex) => {
    if (line.length < 2) return [];
    return [
      { coordinate: line[0], componentIndex, endpoint: "start" as const },
      { coordinate: line[line.length - 1], componentIndex, endpoint: "end" as const },
    ];
  });
}

export function asMultiLineString(geometry: LineString | MultiLineString): MultiLineString {
  return geometry.type === "LineString" ? { type: "MultiLineString", coordinates: [geometry.coordinates] } : geometry;
}

export function round(value: number, places = 6) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function interpolate(a: Position, b: Position, ratio: number): Position {
  return [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio];
}

function dedupeSequentialCoordinates(coordinates: Position[]) {
  return coordinates.filter((coordinate, index) => index === 0 || distanceMeters(coordinates[index - 1], coordinate) > 0.01);
}

function averagePoint(points: Position[]): Position {
  return [points.reduce((sum, point) => sum + point[0], 0) / points.length, points.reduce((sum, point) => sum + point[1], 0) / points.length];
}

function project(point: Position, origin: Position): XY {
  const latScale = 111320;
  const lonScale = 111320 * Math.cos(toRad(origin[1]));
  return { x: (point[0] - origin[0]) * lonScale, y: (point[1] - origin[1]) * latScale };
}

function unproject(point: XY, origin: Position): Position {
  const latScale = 111320;
  const lonScale = 111320 * Math.cos(toRad(origin[1]));
  return [origin[0] + point.x / lonScale, origin[1] + point.y / latScale];
}

function subtract(a: XY, b: XY): XY { return { x: a.x - b.x, y: a.y - b.y }; }
function dot(a: XY, b: XY) { return a.x * b.x + a.y * b.y; }
function cross2(a: XY, b: XY) { return a.x * b.y - a.y * b.x; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function toRad(value: number) { return value * Math.PI / 180; }