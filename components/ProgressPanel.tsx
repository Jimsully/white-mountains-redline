"use client";

import type { TrailSegment } from "@/types/trails";
import { calculateProgress } from "@/lib/progress";

type Props = {
  segments: TrailSegment[];
  selected?: TrailSegment;
  onToggle: (id: string) => void;
};

export function ProgressPanel({ segments, selected, onToggle }: Props) {
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
          <span>{progress.completedSegments}/{progress.totalSegments} segments</span>
        </div>
      </div>

      <div className="notice">
        Prototype data only. Trail geometry is deliberately simplified and must not be used for navigation.
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
            <div><dt>Gain</dt><dd>{selected.elevationGainFt?.toLocaleString() ?? "—"} ft</dd></div>
          </dl>
          <button onClick={() => onToggle(selected.id)}>
            {selected.completed ? "Mark unfinished" : "Mark completed"}
          </button>
        </div>
      ) : (
        <p className="muted">Click a trail segment on the map.</p>
      )}
    </aside>
  );
}
