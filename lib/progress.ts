import type { TrailSegment } from "@/types/trails";

export function calculateProgress(segments: TrailSegment[]) {
  const totalMiles = segments.reduce((sum, segment) => sum + segment.miles, 0);
  const completedMiles = segments
    .filter((segment) => segment.completed)
    .reduce((sum, segment) => sum + segment.miles, 0);
  const completedSegments = segments.filter((segment) => segment.completed).length;

  return {
    totalMiles,
    completedMiles,
    completedSegments,
    totalSegments: segments.length,
    mileagePercent: totalMiles ? (completedMiles / totalMiles) * 100 : 0,
    segmentPercent: segments.length ? (completedSegments / segments.length) * 100 : 0,
  };
}
