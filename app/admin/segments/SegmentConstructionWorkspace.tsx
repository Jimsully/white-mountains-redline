"use client";

import { useMemo, useState } from "react";
import type { JunctionCandidate, SegmentCandidate, SegmentConstructionArtifact, SegmentReviewDecision, SegmentDecisionValue } from "@/types/segment-construction";
import { buildSegmentDecision, buildSegmentDecisionExport, parseStoredSegmentDecisions } from "@/lib/segment-construction/review-state";

type Props = { artifact: SegmentConstructionArtifact };
type FilterMode = "all" | "junctions" | "segments" | "needs_review" | "short_segments" | "near_intersections" | "disconnected";
type Selection = { type: "junction"; key: string } | { type: "segment"; key: string };

const STORAGE_KEY = "white-mountains-redline-segment-construction-decisions";

export function SegmentConstructionWorkspace({ artifact }: Props) {
  const firstSelection = artifact.junctionCandidates[0]
    ? { type: "junction" as const, key: artifact.junctionCandidates[0].key }
    : artifact.segmentCandidates[0]
      ? { type: "segment" as const, key: artifact.segmentCandidates[0].key }
      : undefined;
  const [filter, setFilter] = useState<FilterMode>("all");
  const [selection, setSelection] = useState<Selection | undefined>(firstSelection);
  const [notesByKey, setNotesByKey] = useState<Record<string, string>>({});
  const [decisions, setDecisions] = useState<Record<string, SegmentReviewDecision>>(() => {
    if (typeof window === "undefined") return {};
    return parseStoredSegmentDecisions(window.localStorage.getItem(STORAGE_KEY));
  });

  const visibleJunctions = useMemo(() => artifact.junctionCandidates.filter((junction) => {
    if (filter === "all" || filter === "junctions") return true;
    if (filter === "needs_review") return junction.reviewStatus === "needs_review";
    if (filter === "near_intersections") return junction.reasons.includes("ambiguous_near_intersection");
    return false;
  }), [artifact.junctionCandidates, filter]);
  const visibleSegments = useMemo(() => artifact.segmentCandidates.filter((segment) => {
    if (filter === "all" || filter === "segments") return true;
    if (filter === "needs_review") return segment.reviewStatus === "needs_review";
    if (filter === "short_segments") return segment.warningFlags.includes("very_short_segment");
    if (filter === "disconnected") return (artifact.acceptedTrailSources.find((source) => source.itemKey === segment.parentInventoryItemKey)?.geometry.coordinates.length ?? 0) > 1;
    return false;
  }), [artifact.acceptedTrailSources, artifact.segmentCandidates, filter]);
  const selectedJunction = selection?.type === "junction" ? artifact.junctionCandidates.find((item) => item.key === selection.key) : undefined;
  const selectedSegment = selection?.type === "segment" ? artifact.segmentCandidates.find((item) => item.key === selection.key) : undefined;
  const selectedKey = selectedJunction?.key ?? selectedSegment?.key;
  const selectedDecision = selectedKey ? decisions[selectedKey] : undefined;
  const notes = selectedKey ? notesByKey[selectedKey] ?? selectedDecision?.notes ?? "" : "";

  function saveDecision(decision: SegmentDecisionValue) {
    if (!selection) return;
    const nextDecision = buildSegmentDecision(selection.type, selection.key, decision, notes, new Date().toISOString());
    const next = { ...decisions, [selection.key]: nextDecision };
    setDecisions(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function clearDecision() {
    if (!selection) return;
    const next = { ...decisions };
    delete next[selection.key];
    setDecisions(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function exportDecisions() {
    const blob = new Blob([JSON.stringify(buildSegmentDecisionExport(artifact, Object.values(decisions)), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "segment-construction-decisions.prototype.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return <main className="segmentShell">
    <header className="reconHeader">
      <div>
        <p className="eyebrow">SEGMENT CONSTRUCTION WORKSPACE</p>
        <h1>NOT FOR NAVIGATION * NOT SEGMENT VERIFIED</h1>
      </div>
      <button type="button" onClick={exportDecisions}>Export review decisions</button>
    </header>
    <section className="reconStats">
      <span>{artifact.diagnostics.acceptedTrailSourceCount} accepted demo sources</span>
      <span>{artifact.diagnostics.junctionCandidateCount} junctions</span>
      <span>{artifact.diagnostics.segmentCandidateCount} segments</span>
      <span>{artifact.diagnostics.nearIntersectionWarningCount} near warnings</span>
      <span>{artifact.diagnostics.lengthDeltaMiles} mile delta</span>
    </section>
    <div className="segmentGrid">
      <aside className="reconList">
        <div className="reconFilters">
          {(["all", "junctions", "segments", "needs_review", "short_segments", "near_intersections", "disconnected"] as const).map((mode) => (
            <button key={mode} type="button" className={filter === mode ? "active" : ""} onClick={() => setFilter(mode)}>{mode.replace(/_/g, " ")}</button>
          ))}
        </div>
        {visibleJunctions.map((junction) => <button key={junction.key} type="button" className={selection?.key === junction.key ? "reconItem active" : "reconItem"} onClick={() => setSelection({ type: "junction", key: junction.key })}><strong>Junction</strong><span>{junction.reasons.join(", ")}</span></button>)}
        {visibleSegments.map((segment) => <button key={segment.key} type="button" className={selection?.key === segment.key ? "reconItem active" : "reconItem"} onClick={() => setSelection({ type: "segment", key: segment.key })}><strong>{segment.trailDisplayName}</strong><span>{segment.calculatedMiles} mi * {segment.reviewStatus}</span></button>)}
      </aside>
      <section className="reconDetail">
        {selectedJunction ? <JunctionDetail junction={selectedJunction} decision={selectedDecision} notes={notes} onNotesChange={(value) => selectedKey && setNotesByKey((current) => ({ ...current, [selectedKey]: value }))} onSave={saveDecision} onClear={clearDecision} /> : null}
        {selectedSegment ? <SegmentDetail segment={selectedSegment} decision={selectedDecision} notes={notes} onNotesChange={(value) => selectedKey && setNotesByKey((current) => ({ ...current, [selectedKey]: value }))} onSave={saveDecision} onClear={clearDecision} /> : null}
      </section>
      <section className="reconMap"><GeometryPreview artifact={artifact} selectedJunction={selectedJunction} selectedSegment={selectedSegment} /></section>
    </div>
  </main>;
}

function JunctionDetail({ junction, decision, notes, onNotesChange, onSave, onClear }: { junction: JunctionCandidate; decision?: SegmentReviewDecision; notes: string; onNotesChange: (value: string) => void; onSave: (value: SegmentDecisionValue) => void; onClear: () => void }) {
  return <><p className="eyebrow">Junction candidate</p><h2>{junction.key}</h2><dl className="reconFacts"><div><dt>Coordinate</dt><dd>{junction.coordinate.map((value) => Number(value).toFixed(6)).join(", ")}</dd></div><div><dt>Reasons</dt><dd>{junction.reasons.join(", ")}</dd></div><div><dt>Trails</dt><dd>{junction.participatingTrailNormalizedNames.join(", ")}</dd></div><div><dt>Source IDs</dt><dd>{junction.sourceFeatureIds.join(", ")}</dd></div><div><dt>Cluster spread</dt><dd>{junction.maximumClusterSpreadMeters} m</dd></div><div><dt>Decision</dt><dd>{decision?.decision ?? junction.reviewStatus}</dd></div></dl><textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Optional prototype topology notes" /><DecisionButtons onSave={onSave} onClear={onClear} /></>;
}

function SegmentDetail({ segment, decision, notes, onNotesChange, onSave, onClear }: { segment: SegmentCandidate; decision?: SegmentReviewDecision; notes: string; onNotesChange: (value: string) => void; onSave: (value: SegmentDecisionValue) => void; onClear: () => void }) {
  return <><p className="eyebrow">Segment candidate</p><h2>{segment.trailDisplayName}</h2><dl className="reconFacts"><div><dt>Calculated miles</dt><dd>{segment.calculatedMiles}</dd></div><div><dt>Start</dt><dd>{segment.startJunctionKey}</dd></div><div><dt>End</dt><dd>{segment.endJunctionKey}</dd></div><div><dt>Source IDs</dt><dd>{segment.sourceFeatureIds.join(", ")}</dd></div><div><dt>Status</dt><dd>{decision?.decision ?? segment.reviewStatus}</dd></div><div><dt>Warnings</dt><dd>{segment.warningFlags.join(", ") || "none"}</dd></div></dl><textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Optional prototype segment notes" /><DecisionButtons onSave={onSave} onClear={onClear} /></>;
}

function DecisionButtons({ onSave, onClear }: { onSave: (value: SegmentDecisionValue) => void; onClear: () => void }) {
  return <p><button type="button" onClick={() => onSave("accepted")}>Accept</button> <button type="button" onClick={() => onSave("rejected")}>Reject</button> <button type="button" onClick={() => onSave("needs_review")}>Needs review</button> <button type="button" onClick={onClear}>Clear decision</button></p>;
}

function GeometryPreview({ artifact, selectedJunction, selectedSegment }: { artifact: SegmentConstructionArtifact; selectedJunction?: JunctionCandidate; selectedSegment?: SegmentCandidate }) {
  const lines = selectedSegment ? [selectedSegment.geometry.coordinates] : artifact.segmentCandidates.map((segment) => segment.geometry.coordinates);
  const points = artifact.junctionCandidates.map((junction) => junction.coordinate);
  const allCoordinates = [...lines.flat(), ...points];
  if (!allCoordinates.length) return <p className="muted">No geometry candidates available.</p>;
  const xs = allCoordinates.map(([x]) => x), ys = allCoordinates.map(([, y]) => y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 0.0001), height = Math.max(maxY - minY, 0.0001);
  const project = ([x, y]: number[]) => `${20 + ((x - minX) / width) * 320},${340 - ((y - minY) / height) * 320}`;
  return <svg viewBox="0 0 360 360" role="img" aria-label="Schematic segment construction geometry"><rect width="360" height="360" fill="#d6d4ca" />{lines.map((line, index) => <polyline key={index} points={line.map(project).join(" ")} fill="none" stroke="#d94a3a" strokeWidth={selectedSegment ? 5 : 2} strokeLinecap="round" strokeLinejoin="round" />)}{points.map((point, index) => <circle key={index} cx={Number(project(point).split(",")[0])} cy={Number(project(point).split(",")[1])} r={selectedJunction?.coordinate === point ? 7 : 4} fill="#161a18" />)}<text x="18" y="28" fontSize="12" fill="#161a18">PROPOSED TOPOLOGY * NOT FOR NAVIGATION</text></svg>;
}
