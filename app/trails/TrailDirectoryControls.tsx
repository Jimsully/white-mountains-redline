"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { TrailDirectoryFilters, TrailDirectoryRegionFilter } from "@/lib/trails/trail-directory";
import { buildTrailDirectoryUrl, hasActiveTrailDirectoryFilters, normalizeTrailDirectoryQuery } from "@/lib/trails/trail-directory";
import type { TrailRegion } from "@/types/trails";

type Props = {
  filters: TrailDirectoryFilters;
  regions: TrailRegion[];
};

export function TrailDirectoryControls({ filters, regions }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasActiveFilters = hasActiveTrailDirectoryFilters(filters);

  function updateFilters(next: { query?: string; region?: TrailDirectoryRegionFilter }) {
    const params = new URLSearchParams(searchParams.toString());
    const nextQuery = normalizeTrailDirectoryQuery(next.query ?? filters.query);
    const nextRegion = next.region ?? filters.region;
    const nextUrl = buildTrailDirectoryUrl(pathname, params.toString(), { query: nextQuery, region: nextRegion });
    router.replace(nextUrl, { scroll: false });
  }

  return (
    <div className="trailDirectoryFilters" role="search" aria-label="Trail directory filters">
      <label>
        <span>Search trail names</span>
        <input
          type="search"
          value={filters.query}
          onChange={(event) => updateFilters({ query: event.target.value })}
          placeholder="Garfield, Franconia, Twin..."
        />
      </label>
      <label>
        <span>Region</span>
        <select
          value={filters.region}
          onChange={(event) => updateFilters({ region: event.target.value as TrailDirectoryRegionFilter })}
        >
          <option value="all">All regions</option>
          {regions.map((region) => <option key={region} value={region}>{region}</option>)}
        </select>
      </label>
      <button type="button" className="secondaryButton" onClick={() => updateFilters({ query: "", region: "all" })} disabled={!hasActiveFilters}>
        Clear filters
      </button>
    </div>
  );
}
