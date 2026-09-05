"use client";

import Link from "next/link";
import { PublicNav } from "@/components/PublicNav";
import { SegmentBrowser } from "@/components/SegmentBrowser";
import type { CompletionMode, SelectionOrigin } from "@/types/completion";
import type { TrailFilters } from "@/lib/trail-filters";
import { hasActiveTrailFilters } from "@/lib/trail-filters";
import type { TrailRegion, TrailSegment } from "@/types/trails";
import { calculateProgress } from "@/lib/progress";

type Props = {
  segments: TrailSegment[];
  visibleSegments: TrailSegment[];
  selected?: TrailSegment;
  selectedId?: string;
  selectionOrigin: SelectionOrigin;
  onSelectSegment: (id: string, origin: SelectionOrigin) => void;
  onToggle: (id: string) => void;
  filters: TrailFilters;
  onFiltersChange: (filters: TrailFilters) => void;
  availableRegions: TrailRegion[];
  completionMode: CompletionMode;
  completionError: string | null;
  completionPending: boolean;
};

export function ProgressPanel({
  segments,
  visibleSegments,
  selected,
  selectedId,
  selectionOrigin,
  onSelectSegment,
  onToggle,
  filters,
  onFiltersChange,
  availableRegions,
  completionMode,
  completionError,
  completionPending,
}: Props) {
  const progress = calculateProgress(segments);
  const filteredProgress = calculateProgress(visibleSegments);
  const filtersActive = hasActiveTrailFilters(filters);
  const isDemo = completionMode === "demo";
  const mileageUnit = isDemo ? "demo mi" : "mi";

  return (
    <section className="panel" aria-label="Progress and trail controls">
      <PublicNav current="map" compact />
      <div className="eyebrow">WHITE MOUNTAINS</div>
      <h1>Redline</h1>
      <p className="lede">Turn the trail network red, one verified segment at a time.</p>

      <div className="progressBlock">
        <div className="progressNumbers">
          <strong>{progress.completedMiles.toFixed(1)}</strong>
          <span>/ {progress.totalMiles.toFixed(1)} {mileageUnit}</span>
        </div>
        <div
          className="progressTrack"
          role="progressbar"
          aria-label="Overall mileage progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Number(progress.mileagePercent.toFixed(1))}
          aria-valuetext={`${progress.completedMiles.toFixed(1)} of ${progress.totalMiles.toFixed(1)} ${mileageUnit}`}
        >
          <div className="progressFill" style={{ width: `${progress.mileagePercent}%` }} />
        </div>
        <div className="progressMeta">
          <span>{progress.mileagePercent.toFixed(1)}% overall mileage</span>
          <span>{progress.completedSegments}/{progress.totalSegments} segments</span>
        </div>
        {filtersActive ? (
          <div className="filteredProgress">
            Filtered: {filteredProgress.completedMiles.toFixed(1)} / {filteredProgress.totalMiles.toFixed(1)} {mileageUnit} · {filteredProgress.mileagePercent.toFixed(1)}%
          </div>
        ) : null}
      </div>

      <div className="notice">
        {isDemo ? "Prototype data only. Trail geometry is deliberately simplified and must not be used for navigation." : "For progress tracking only. Not for navigation."}
        {isDemo ? <span> Local demo only — progress is not saved.</span> : null}
      </div>

      <h2 className="sectionHeading" id="trail-filters-heading">Filters</h2>
      <div className="filters" role="group" aria-labelledby="trail-filters-heading">
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
                aria-pressed={filters.completion === completion}
                onClick={() => onFiltersChange({ ...filters, completion })}
              >
                {completion === "all" ? "All" : completion === "completed" ? "Done" : "Open"}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="filterCount">Showing {visibleSegments.length} of {segments.length} segments.</p>
      </div>

      <h2 className="sectionHeading" id="trail-segments-heading">Segments</h2>
      <SegmentBrowser segments={visibleSegments} selectedId={selectedId} selectionOrigin={selectionOrigin} onSelect={onSelectSegment} labelledBy="trail-segments-heading" />

      <h2 className="sectionHeading">Selected segment</h2>
      {selected ? (
        <div className="trailCard" aria-busy={completionPending || undefined}>
          <div className="statusRow">
            <span className={selected.completed ? "status complete" : "status open"} aria-live="polite">
              {selected.completed ? "Completed" : "Unfinished"}
            </span>
            <span>{selected.miles.toFixed(1)} mi</span>
          </div>
          <h3>{selected.trailName}</h3>
          <p>{selected.segmentName}</p>
          <dl>
            <div><dt>Region</dt><dd>{selected.region}</dd></div>
            <div><dt>Gain</dt><dd>{selected.elevationGainFt?.toLocaleString() ?? "-"} ft</dd></div>
          </dl>
          {completionMode === "anonymous" ? (
            <Link className="buttonLink" href="/login?returnTo=%2F">Sign in to save progress</Link>
          ) : (
            <button onClick={() => onToggle(selected.id)} disabled={completionPending || completionMode === "unavailable"}>
              {completionPending ? "Saving..." : selected.completed ? "Mark unfinished" : "Mark completed"}
            </button>
          )}
          <Link className="trailDetailLink" href={`/trails/${selected.trailSlug}`}>View Trail Details</Link>
          {completionMode === "demo" ? <p className="muted">Local demo only — progress is not saved.</p> : null}
          {completionMode === "unavailable" ? <p className="muted">Completion saving is unavailable in this environment.</p> : null}
          {completionError ? <p className="formError" role="alert">{completionError}</p> : null}
        </div>
      ) : (
        <p className="muted">No visible segment matches the current filters.</p>
      )}
    </section>
  );
}
