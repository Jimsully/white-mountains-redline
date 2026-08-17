import type { MultiLineString, Position } from "geojson";
import { distanceMeters, distancePointToSegmentMeters, lineLengthMeters, round } from "@/lib/segment-construction/geometry";

export function multiLineLengthMeters(geometry: MultiLineString) {
  return geometry.coordinates.reduce((sum, line) => sum + lineLengthMeters(line), 0);
}

export function bboxForMultiLine(geometry: MultiLineString): [number, number, number, number] {
  return bboxForCoordinates(geometry.coordinates.flat());
}

export function bboxForCoordinates(coordinates: Position[]): [number, number, number, number] {
  const xs = coordinates.map((point) => point[0]);
  const ys = coordinates.map((point) => point[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function expandedBboxIntersects(a: [number, number, number, number], b: [number, number, number, number], radiusMeters: number) {
  const expansion = radiusMeters / 111_320;
  return !(a[2] + expansion < b[0] || a[0] - expansion > b[2] || a[3] + expansion < b[1] || a[1] - expansion > b[3]);
}

export function sampleLine(coordinates: Position[], intervalMeters: number): Position[] {
  const length = lineLengthMeters(coordinates);
  if (coordinates.length < 2) return [];
  if (length === 0) return [coordinates[0], coordinates[coordinates.length - 1]];
  const samples: Position[] = [coordinates[0]];
  for (let measure = intervalMeters; measure < length; measure += intervalMeters) samples.push(pointAtMeasure(coordinates, measure));
  samples.push(coordinates[coordinates.length - 1]);
  return dedupeSequential(samples);
}

export function minDistanceToTrace(point: Position, trace: MultiLineString) {
  let best = Number.POSITIVE_INFINITY;
  let bestPosition: Position | undefined;
  for (const line of trace.coordinates) {
    for (let index = 1; index < line.length; index += 1) {
      const candidate = distancePointToSegmentMeters(point, line[index - 1], line[index]);
      if (candidate.distanceMeters < best) {
        best = candidate.distanceMeters;
        bestPosition = candidate.closest;
      }
    }
  }
  return { distanceMeters: round(best, 3), position: bestPosition };
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

export function longestFalseRun(values: boolean[]) {
  let longest = 0;
  let current = 0;
  for (const value of values) {
    if (value) current = 0;
    else {
      current += 1;
      longest = Math.max(longest, current);
    }
  }
  return longest;
}

export function stableCoordinateFingerprint(coordinates: Position[]) {
  return coordinates.map((point) => `${round(point[0], 6)},${round(point[1], 6)}`).join(";");
}

function pointAtMeasure(coordinates: Position[], measureMeters: number): Position {
  let before = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const segmentLength = distanceMeters(start, end);
    const after = before + segmentLength;
    if (after >= measureMeters) {
      const ratio = segmentLength === 0 ? 0 : (measureMeters - before) / segmentLength;
      return [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio];
    }
    before = after;
  }
  return coordinates[coordinates.length - 1];
}

function dedupeSequential(coordinates: Position[]) {
  return coordinates.filter((coordinate, index) => index === 0 || distanceMeters(coordinates[index - 1], coordinate) > 0.01);
}
