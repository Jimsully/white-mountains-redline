import type { TrailSegment } from "@/types/trails";

export type SegmentBounds = [west: number, south: number, east: number, north: number];

const collapsedBoundsPaddingDegrees = 0.0005;

export function getSegmentBounds(coordinates: TrailSegment["coordinates"]): SegmentBounds | undefined {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return undefined;

  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const coordinate of coordinates) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return undefined;
    const [longitude, latitude] = coordinate;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return undefined;
    west = Math.min(west, longitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    north = Math.max(north, latitude);
  }

  if (!Number.isFinite(west) || !Number.isFinite(south) || !Number.isFinite(east) || !Number.isFinite(north)) return undefined;

  if (west === east) {
    west -= collapsedBoundsPaddingDegrees;
    east += collapsedBoundsPaddingDegrees;
  }
  if (south === north) {
    south -= collapsedBoundsPaddingDegrees;
    north += collapsedBoundsPaddingDegrees;
  }

  return [roundBound(west), roundBound(south), roundBound(east), roundBound(north)];
}

export function cameraDurationForReducedMotion(reducedMotion: boolean) {
  return reducedMotion ? 0 : 500;
}

function roundBound(value: number) {
  return Number(value.toFixed(6));
}
