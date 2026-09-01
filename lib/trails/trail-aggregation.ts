import { getSegmentBounds, mergeSegmentBounds } from "@/lib/map/segment-bounds";
import type { TrailDetail, TrailSegment } from "@/types/trails";

type TrailGroup = {
  trailId: string;
  trailSlug: string;
  name: string;
  region: TrailSegment["region"];
  segments: TrailSegment[];
};

export function aggregateTrailSegments(segments: TrailSegment[]): TrailDetail[] {
  const groups = new Map<string, TrailGroup>();

  for (const segment of segments) {
    const key = trailGroupKey(segment.trailId, segment.trailSlug);
    const existing = groups.get(key);
    if (existing) {
      existing.segments.push(segment);
      continue;
    }

    groups.set(key, {
      trailId: segment.trailId,
      trailSlug: segment.trailSlug,
      name: segment.trailName,
      region: segment.region,
      segments: [segment],
    });
  }

  return Array.from(groups.values())
    .map(toTrailDetail)
    .sort((left, right) => left.name.localeCompare(right.name) || left.trailSlug.localeCompare(right.trailSlug));
}

export function getTrailBySlugFromSegments(segments: TrailSegment[], trailSlug: string) {
  return aggregateTrailSegments(segments).find((trail) => trail.trailSlug === trailSlug);
}

function toTrailDetail(group: TrailGroup): TrailDetail {
  const segments = [...group.segments].sort((left, right) => left.segmentName.localeCompare(right.segmentName));
  const totalMiles = roundMiles(segments.reduce((sum, segment) => sum + segment.miles, 0));
  const completedMiles = roundMiles(
    segments.reduce((sum, segment) => sum + (segment.completed ? segment.miles : 0), 0),
  );
  const completedSegments = segments.filter((segment) => segment.completed).length;
  const bounds = segments.reduce<TrailDetail["bounds"]>((current, segment) => {
    const next = getSegmentBounds(segment.coordinates);
    return next ? mergeSegmentBounds(current, next) : current;
  }, undefined);

  return {
    trailId: group.trailId,
    trailSlug: group.trailSlug,
    name: group.name,
    region: group.region,
    segments,
    totalMiles,
    segmentCount: segments.length,
    completedMiles,
    completedSegments,
    completionPercent: segments.length === 0 ? 0 : Math.round((completedSegments / segments.length) * 100),
    bounds,
  };
}

function trailGroupKey(trailId: string, trailSlug: string) {
  return `${trailId}\u0000${trailSlug}`;
}

function roundMiles(value: number) {
  return Number(value.toFixed(3));
}
