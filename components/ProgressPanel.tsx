"use client";

import type { TrailFilters } from "@/lib/trail-filters";
import type { TrailRegion, TrailSegment } from "@/types/trails";
import { calculateProgress } from "@/lib/progress";

type Props = {
  segments: TrailSegment[];
  selected?: TrailSegment;
  onToggle: (id: string) => void;
  filters: TrailFilters;
  onFiltersChange: (filters: TrailFilters) => void;
  availableRegions: TrailRegion[];
  totalSegmentCount: number;
};

export function ProgressPanel({
  segments,
  selected,
  onToggle,
  filters,
  onFiltersChange,
  availableRegions,
  totalSegmentCount,
}: Props) {
  const progress = calculateProgress(segments);

  return (
    <aside className="panel">
      <div className="eyebrow">WHITE MOUNTAINS</div>
      <h1>Redline</h1>
      <p className="lede">Turn the trail network red, one verified segment at a time.</p>

      <div className="progressBlock">
        <div className="progressNumbers">
          <strong>{progress.completedMiles.toFixed(1)}</strong>
          <span>/ {progress.totalMiles.toFixed(1)} demo mi</span>
        </div>
        <div className="progressTrack" aria-label="Mileage progress">
          <div className="progressFill" style={{ width: `${progress.mileagePercent}%` }} />
        </div>
        <div className="progressMeta">
          <span>{progress.mileagePercent.toFixed(1)}% mileage</span>
          <span>{progress.completedSegments}/{progress.totalSegments} shown segments</span>
        </div>
      </div>

      <div className="notice">
        Prototype data only. Trail geometry is deliberately simplified and must not be used for navigation.
      </div>

      <div className="sectionHeading">Filters</div>
      <div className="filters" aria-label="Trail filters">
        <label>
          <span>Search</span>
          <input
            value={filters.query}
            onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })}
            placeholder="Trail or segment"
          />
        </label>
        <label>
          <span>Region</span>
          <select
            value={filters.region}
            onChange={(event) => onFiltersChange({ ...filters, region: event.target.value as TrailFilters["region"] })}
          >
            <option value="all">All regions</option>
            {availableRegions.map((region) => <option key={region} value={region}>{region}</option>)}
          </select>
        </label>
        <fieldset>
          <legend>Completion</legend>
          <div className="segmented">
            {(["all", "completed", "incomplete"] as const).map((completion) => (
              <button
                key={completion}
                type="button"
                className={filters.completion === completion ? "active" : ""}
                onClick={() => onFiltersChange({ ...filters, completion })}
              >
                {completion === "all" ? "All" : completion === "completed" ? "Done" : "Open"}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="filterCount">Showing {segments.length} of {totalSegmentCount} segments.</p>
      </div>

      <div className="sectionHeading">Selected segment</div>
      {selected ? (
        <div className="trailCard">
          <div className="statusRow">
            <span className={selected.completed ? "status complete" : "status open"}>
              {selected.completed ? "Completed" : "Unfinished"}
            </span>
            <span>{selected.miles.toFixed(1)} mi</span>
          </div>
          <h2>{selected.trailName}</h2>
          <p>{selected.segmentName}</p>
          <dl>
            <div><dt>Region</dt><dd>{selected.region}</dd></div>
            <div><dt>Gain</dt><dd>{selected.elevationGainFt?.toLocaleString() ?? "-"} ft</dd></div>
          </dl>
          <button onClick={() => onToggle(selected.id)}>
            {selected.completed ? "Mark unfinished" : "Mark completed"}
          </button>
        </div>
      ) : (
        <p className="muted">No visible segment matches the current filters.</p>
      )}
    </aside>
  );
}
