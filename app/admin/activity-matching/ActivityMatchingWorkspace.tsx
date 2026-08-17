"use client";

import { useMemo, useState } from "react";
import type { ActivityMatchArtifact, ActivityMatchReviewDecision, ActivityMatchDecisionValue, SegmentMatchCandidate } from "@/types/activity-matching";
import { buildActivityMatchDecision, buildActivityMatchDecisionExport, parseStoredActivityMatchDecisions } from "@/lib/activity-matching/review-state";

type Props = { artifact: ActivityMatchArtifact };
type FilterMode = "all" | "strong_candidate" | "candidate" | "needs_review" | "insufficient_coverage" | "unmatched_activities" | "matched_segments";

const STORAGE_KEY = "white-mountains-redline-activity-match-decisions";

export function ActivityMatchingWorkspace({ artifact }: Props) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [selectedMatchKey, setSelectedMatchKey] = useState(artifact.matchCandidates[0]?.key ?? "");
  const [notesByKey, setNotesByKey] = useState<Record<string, string>>({});
  const [decisions, setDecisions] = useState<Record<string, ActivityMatchReviewDecision>>(() => {
    if (typeof window === "undefined") return {};
    return parseStoredActivityMatchDecisions(window.localStorage.getItem(STORAGE_KEY));
  });

  const candidateMatches = useMemo(() => artifact.matchCandidates.filter((match) => match.classification !== "insufficient_coverage"), [artifact.matchCandidates]);
  const matchedActivityKeys = useMemo(() => new Set(candidateMatches.map((match) => match.activityKey)), [candidateMatches]);
  const matchedSegmentKeys = useMemo(() => new Set(candidateMatches.map((match) => match.segmentKey)), [candidateMatches]);
  const unmatchedActivities = useMemo(() => artifact.activities.filter((activity) => !matchedActivityKeys.has(activity.activityKey)), [artifact.activities, matchedActivityKeys]);
  const visibleMatches = useMemo(() => artifact.matchCandidates.filter((match) => {
    if (filter === "all") return true;
    if (filter === "matched_segments") return matchedSegmentKeys.has(match.segmentKey) && match.classification !== "insufficient_coverage";
    if (filter === "unmatched_activities") return !matchedActivityKeys.has(match.activityKey);
    return match.classification === filter;
  }), [artifact.matchCandidates, filter, matchedActivityKeys, matchedSegmentKeys]);
  const selectedMatch = artifact.matchCandidates.find((match) => match.key === selectedMatchKey) ?? visibleMatches[0];
  const selectedActivity = artifact.activities.find((activity) => activity.activityKey === selectedMatch?.activityKey);
  const selectedSegment = artifact.eligibleSegments.find((segment) => segment.segmentKey === selectedMatch?.segmentKey);
  const selectedDecision = selectedMatch ? decisions[selectedMatch.key] : undefined;
  const notes = selectedMatch ? notesByKey[selectedMatch.key] ?? selectedDecision?.notes ?? "" : "";

  function saveDecision(decision: ActivityMatchDecisionValue) {
    if (!selectedMatch) return;
    const nextDecision = buildActivityMatchDecision(artifact, selectedMatch.key, decision, notes, new Date().toISOString());
    const next = { ...decisions, [selectedMatch.key]: nextDecision };
    setDecisions(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function clearDecision() {
    if (!selectedMatch) return;
    const next = { ...decisions };
    delete next[selectedMatch.key];
    setDecisions(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function exportDecisions() {
    const blob = new Blob([JSON.stringify(buildActivityMatchDecisionExport(artifact, Object.values(decisions)), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "activity-match-decisions.prototype.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return <main className="activityShell">
    <header className="reconHeader">
      <div>
        <p className="eyebrow">ACTIVITY MATCHING WORKSPACE</p>
        <h1>GPS IS EVIDENCE, NOT CANONICAL GEOMETRY</h1>
        <p className="muted">NOT COMPLETION VERIFIED * NOT FOR NAVIGATION</p>
      </div>
      <button type="button" onClick={exportDecisions}>Export review decisions</button>
    </header>
    <section className="reconStats">
      <span>{artifact.diagnostics.activitiesLoaded} activities</span>
      <span>{artifact.diagnostics.eligibleSegmentCount} eligible segments</span>
      <span>{artifact.diagnostics.strongCandidateCount} strong</span>
      <span>{artifact.diagnostics.candidateCount} candidates</span>
      <span>{artifact.diagnostics.needsReviewCount} needs review</span>
      <span>{unmatchedActivities.length} unmatched activities</span>
    </section>
    <div className="activityGrid">
      <aside className="reconList">
        <div className="reconFilters">
          {(["all", "strong_candidate", "candidate", "needs_review", "insufficient_coverage", "unmatched_activities", "matched_segments"] as const).map((mode) => (
            <button key={mode} type="button" className={filter === mode ? "active" : ""} onClick={() => setFilter(mode)}>{mode.replace(/_/g, " ")}</button>
          ))}
        </div>
        {visibleMatches.map((match) => <button key={match.key} type="button" className={selectedMatch?.key === match.key ? "reconItem active" : "reconItem"} onClick={() => setSelectedMatchKey(match.key)}><strong>{match.trailDisplayName}</strong><span>{match.classification.replace(/_/g, " ")} * {Math.round(match.evidence.segmentCoverageRatio * 100)}%</span></button>)}
        {filter === "unmatched_activities" ? unmatchedActivities.map((activity) => <p key={activity.activityKey} className="muted">{activity.title ?? activity.activityKey}</p>) : null}
      </aside>
      <section className="reconDetail">
        {selectedMatch && selectedActivity && selectedSegment ? <MatchDetail match={selectedMatch} activityTitle={selectedActivity.title ?? selectedActivity.activityKey} activityDate={selectedActivity.startTime} segmentSourceIds={selectedSegment.sourceFeatureIds} decision={selectedDecision} notes={notes} onNotesChange={(value) => setNotesByKey((current) => ({ ...current, [selectedMatch.key]: value }))} onSave={saveDecision} onClear={clearDecision} /> : <p className="muted">No activity match candidate selected.</p>}
      </section>
      <section className="reconMap">{selectedMatch && selectedActivity && selectedSegment ? <ActivityPreview match={selectedMatch} activityCoordinates={selectedActivity.trace.geometry.coordinates} segmentCoordinates={selectedSegment.geometry.coordinates} /> : null}</section>
    </div>
  </main>;
}

function MatchDetail({ match, activityTitle, activityDate, segmentSourceIds, decision, notes, onNotesChange, onSave, onClear }: { match: SegmentMatchCandidate; activityTitle: string; activityDate?: string; segmentSourceIds: string[]; decision?: ActivityMatchReviewDecision; notes: string; onNotesChange: (value: string) => void; onSave: (value: ActivityMatchDecisionValue) => void; onClear: () => void }) {
  const evidence = match.evidence;
  return <><p className="eyebrow">Match candidate</p><h2>{match.trailDisplayName}</h2><dl className="reconFacts"><div><dt>Activity</dt><dd>{activityTitle}</dd></div><div><dt>Date</dt><dd>{activityDate ?? "unknown"}</dd></div><div><dt>Coverage</dt><dd>{Math.round(evidence.segmentCoverageRatio * 100)}%</dd></div><div><dt>Endpoint distances</dt><dd>{evidence.startJunctionDistanceMeters} m / {evidence.endJunctionDistanceMeters} m</dd></div><div><dt>Median / p95</dt><dd>{evidence.medianSampleDistanceMeters} m / {evidence.p95SampleDistanceMeters} m</dd></div><div><dt>Gap</dt><dd>{evidence.longestUncoveredRunSamples} samples / {Math.round(evidence.longestUncoveredGapRatio * 100)}%</dd></div><div><dt>Classification</dt><dd>{match.classification.replace(/_/g, " ")}</dd></div><div><dt>Decision</dt><dd>{decision?.decision ?? "unreviewed"}</dd></div><div><dt>Source IDs</dt><dd>{segmentSourceIds.join(", ")}</dd></div><div><dt>Algorithms</dt><dd>{evidence.activityMatchingAlgorithmVersion} / {evidence.segmentConstructionAlgorithmVersion}</dd></div></dl><textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Optional evidence review notes" /><p><button type="button" onClick={() => onSave("accepted")}>Accept completion evidence</button> <button type="button" onClick={() => onSave("rejected")}>Reject evidence</button> <button type="button" onClick={() => onSave("needs_review")}>Needs review</button> <button type="button" onClick={onClear}>Clear</button></p></>;
}

function ActivityPreview({ match, activityCoordinates, segmentCoordinates }: { match: SegmentMatchCandidate; activityCoordinates: number[][][]; segmentCoordinates: number[][] }) {
  const allCoordinates = [...activityCoordinates.flat(), ...segmentCoordinates];
  const xs = allCoordinates.map(([x]) => x), ys = allCoordinates.map(([, y]) => y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 0.0001), height = Math.max(maxY - minY, 0.0001);
  const project = ([x, y]: number[]) => `${20 + ((x - minX) / width) * 320},${340 - ((y - minY) / height) * 320}`;
  return <svg viewBox="0 0 360 360" role="img" aria-label="Schematic activity matching evidence"><rect width="360" height="360" fill="#d6d4ca" />{activityCoordinates.map((line, index) => <polyline key={`activity-${index}`} points={line.map(project).join(" ")} fill="none" stroke="#345f7c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.72" />)}<polyline points={segmentCoordinates.map(project).join(" ")} fill="none" stroke="#d94a3a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><circle cx={Number(project(segmentCoordinates[0]).split(",")[0])} cy={Number(project(segmentCoordinates[0]).split(",")[1])} r="6" fill="#161a18" /><circle cx={Number(project(segmentCoordinates[segmentCoordinates.length - 1]).split(",")[0])} cy={Number(project(segmentCoordinates[segmentCoordinates.length - 1]).split(",")[1])} r="6" fill="#161a18" /><text x="18" y="28" fontSize="12" fill="#161a18">GPS EVIDENCE * {match.classification.replace(/_/g, " ").toUpperCase()}</text></svg>;
}