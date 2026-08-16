import type { TrailRegion, TrailSegment } from "@/types/trails";

export type CompletionFilter = "all" | "completed" | "incomplete";

export type TrailFilters = {
  region: TrailRegion | "all";
  query: string;
  completion: CompletionFilter;
};

export const defaultTrailFilters: TrailFilters = {
  region: "all",
  query: "",
  completion: "all",
};

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function filterTrailSegments(segments: TrailSegment[], filters: TrailFilters) {
  const query = normalizeSearch(filters.query);

  return segments.filter((segment) => {
    if (filters.region !== "all" && segment.region !== filters.region) return false;
    if (filters.completion === "completed" && !segment.completed) return false;
    if (filters.completion === "incomplete" && segment.completed) return false;
    if (!query) return true;

    return [segment.trailName, segment.segmentName, segment.region]
      .some((value) => normalizeSearch(value).includes(query));
  });
}

export function getAvailableRegions(segments: TrailSegment[]) {
  return Array.from(new Set(segments.map((segment) => segment.region))).sort();
}

export function hasActiveTrailFilters(filters: TrailFilters) {
  return filters.region !== "all" || filters.completion !== "all" || filters.query.trim().length > 0;
}
