import type { TrailDetail, TrailRegion } from "@/types/trails";

export type TrailDirectoryRegionFilter = TrailRegion | "all";

export type TrailDirectoryFilters = {
  query: string;
  region: TrailDirectoryRegionFilter;
};

export type TrailDirectorySearchParams = Record<string, string | string[] | undefined>;

export function getTrailDirectoryRegions(trails: TrailDetail[]): TrailRegion[] {
  return Array.from(new Set(trails.map((trail) => trail.region))).sort((left, right) => left.localeCompare(right));
}

export function normalizeTrailDirectoryQuery(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

export function normalizeTrailDirectoryRegion(
  value: string | string[] | undefined,
  regions: TrailRegion[],
): TrailDirectoryRegionFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || raw === "all") return "all";
  return regions.includes(raw as TrailRegion) ? raw as TrailRegion : "all";
}

export function normalizeTrailDirectoryFilters(
  searchParams: TrailDirectorySearchParams | undefined,
  regions: TrailRegion[],
): TrailDirectoryFilters {
  return {
    query: normalizeTrailDirectoryQuery(searchParams?.q),
    region: normalizeTrailDirectoryRegion(searchParams?.region, regions),
  };
}

export function hasActiveTrailDirectoryFilters(filters: TrailDirectoryFilters): boolean {
  return filters.query.length > 0 || filters.region !== "all";
}

export function buildTrailDirectoryUrl(
  pathname: string,
  currentSearch: string,
  filters: TrailDirectoryFilters,
): string {
  const params = new URLSearchParams(currentSearch);
  const query = normalizeTrailDirectoryQuery(filters.query);

  if (query) params.set("q", query);
  else params.delete("q");

  if (filters.region === "all") params.delete("region");
  else params.set("region", filters.region);

  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function filterTrailDirectory(trails: TrailDetail[], filters: TrailDirectoryFilters): TrailDetail[] {
  const query = normalizeTrailDirectoryQuery(filters.query).toLocaleLowerCase();
  const region = filters.region;

  return trails
    .filter((trail) => {
      const matchesQuery = query.length === 0 || trail.name.toLocaleLowerCase().includes(query);
      const matchesRegion = region === "all" || trail.region === region;
      return matchesQuery && matchesRegion;
    })
    .sort(compareTrailDirectoryEntries);
}

export function compareTrailDirectoryEntries(left: TrailDetail, right: TrailDetail) {
  return left.name.localeCompare(right.name) || left.trailSlug.localeCompare(right.trailSlug);
}
