"use client";

import { useMemo, useState } from "react";
import type { PublicationCandidateSegment, PublicationCandidateTrail, PublicationDecision, PublicationDecisionValue, VerifiedNetworkArtifact, VerifiedPublishedSegment } from "@/types/publication";
import { buildPublicationDecision, buildPublicationDecisionExport, parseStoredPublicationDecisions } from "@/lib/publication/review-state";

type Props = { artifact: VerifiedNetworkArtifact };
type FilterMode = "all" | "verified" | "needs_review" | "rejected" | "candidate_trails";
type VisibleItem = { type: "trail"; key: string; trail: PublicationCandidateTrail } | { type: "segment"; key: string; segment: PublicationCandidateSegment };

const STORAGE_KEY = "white-mountains-redline-publication-decisions";

export function PublicationWorkspace({ artifact }: Props) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [selectedKey, setSelectedKey] = useState(artifact.candidateSegments[0]?.candidateSegmentKey ?? artifact.candidateTrails[0]?.candidateTrailKey ?? "");
  const [notesByKey, setNotesByKey] = useState<Record<string, string>>({});
  const [decisions, setDecisions] = useState<Record<string, PublicationDecision>>(() => {
    if (typeof window === "undefined") return {};
    return parseStoredPublicationDecisions(window.localStorage.getItem(STORAGE_KEY));
  });

  const committedDecisions = useMemo(() => new Map(artifact.publicationDecisions.map((decision) => [`${decision.targetType}:${decision.targetKey}`, decision] as const)), [artifact.publicationDecisions]);
  const decisionFor = (type: "trail" | "segment", key: string) => decisions[key] ?? committedDecisions.get(`${type}:${key}`);
  const visibleItems: VisibleItem[] = (() => {
    if (filter === "candidate_trails") return artifact.candidateTrails.map((trail) => ({ type: "trail", key: trail.candidateTrailKey, trail }));
    return artifact.candidateSegments.flatMap((segment) => {
      const decision = decisionFor("segment", segment.candidateSegmentKey);
      if (filter === "all" || (filter === "verified" && decision?.decision === "verified_for_publication") || decision?.decision === filter) return [{ type: "segment" as const, key: segment.candidateSegmentKey, segment }];
      return [];
    });
  })();

  const selectedItem = visibleItems.find((item) => item.key === selectedKey) ?? visibleItems[0];
  const selectedSegment = selectedItem?.type === "segment" ? selectedItem.segment : undefined;
  const selectedTrail = selectedItem?.type === "trail" ? selectedItem.trail : artifact.candidateTrails.find((trail) => trail.candidateTrailKey === selectedSegment?.candidateTrailKey);
  const selectedPublished = artifact.trailSegments.find((segment) => segment.provenance.candidateSegmentKey === selectedSegment?.candidateSegmentKey);
  const selectedTargetKey = selectedItem?.key;
  const selectedTargetType = selectedItem?.type;
  const selectedDecision = selectedTargetType && selectedTargetKey ? decisionFor(selectedTargetType, selectedTargetKey) : undefined;
  const notes = selectedTargetKey ? notesByKey[selectedTargetKey] ?? selectedDecision?.notes ?? "" : "";

  function saveDecision(decision: PublicationDecisionValue) {
    if (!selectedTargetType || !selectedTargetKey) return;
    const nextDecision = buildPublicationDecision(selectedTargetType, selectedTargetKey, decision, notes, new Date().toISOString());
    const next = { ...decisions, [selectedTargetKey]: nextDecision };
    setDecisions(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSelectedKey(selectedTargetKey);
  }

  function clearDecision() {
    if (!selectedTargetKey) return;
    const next = { ...decisions };
    delete next[selectedTargetKey];
    setDecisions(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function exportDecisions() {
    const blob = new Blob([JSON.stringify(buildPublicationDecisionExport(artifact, Object.values(decisions)), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "publication-decisions.prototype.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return <main className="publicationShell">
    <header className="reconHeader">
      <div>
        <p className="eyebrow">PUBLICATION WORKSPACE</p>
        <h1>VERIFIED PUBLICATION GATE</h1>
        <p className="muted">NOT FOR NAVIGATION * DOES NOT CREATE COMPLETIONS</p>
      </div>
      <button type="button" onClick={exportDecisions}>Export publication decisions</button>
    </header>
    <section className="reconStats">
      <span>{artifact.diagnostics.candidateTrailCount} candidate trails</span>
      <span>{artifact.diagnostics.candidateSegmentCount} candidate segments</span>
      <span>{artifact.diagnostics.verifiedTrailCount} verified trails</span>
      <span>{artifact.diagnostics.verifiedSegmentCount} verified segments</span>
      <span>{artifact.diagnostics.totalPublishedMiles} published miles</span>
      <span>{artifact.diagnostics.integrityErrors.length} errors</span>
    </section>
    <div className="publicationGrid">
      <aside className="reconList">
        <div className="reconFilters">
          {(["all", "verified", "needs_review", "rejected", "candidate_trails"] as const).map((mode) => <button key={mode} type="button" className={filter === mode ? "active" : ""} onClick={() => setFilter(mode)}>{mode.replace(/_/g, " ")}</button>)}
        </div>
        {visibleItems.map((item) => item.type === "trail"
          ? <button key={item.key} type="button" className={selectedItem?.key === item.key ? "reconItem active" : "reconItem"} onClick={() => setSelectedKey(item.key)}><strong>{item.trail.canonicalDisplayName}</strong><span>{item.trail.region} * {item.trail.segmentCandidateKeys.length} segments</span></button>
          : <button key={item.key} type="button" className={selectedItem?.key === item.key ? "reconItem active" : "reconItem"} onClick={() => setSelectedKey(item.key)}><strong>{item.segment.trailDisplayName}</strong><span>{item.segment.calculatedMiles} mi * {decisionFor("segment", item.key)?.decision ?? "undecided"}</span></button>)}
      </aside>
      <section className="reconDetail">
        {selectedTrail ? <Detail trail={selectedTrail} segment={selectedSegment} published={selectedPublished} decision={selectedDecision} notes={notes} onNotesChange={(value) => selectedTargetKey && setNotesByKey((current) => ({ ...current, [selectedTargetKey]: value }))} onSave={saveDecision} onClear={clearDecision} /> : <p className="muted">No publication candidate selected.</p>}
      </section>
      <section className="reconMap">{selectedSegment ? <SegmentPreview segment={selectedSegment} /> : <p className="muted">Select a segment to inspect geometry.</p>}</section>
    </div>
  </main>;
}

function Detail({ trail, segment, published, decision, notes, onNotesChange, onSave, onClear }: { trail: PublicationCandidateTrail; segment?: PublicationCandidateSegment; published?: VerifiedPublishedSegment; decision?: PublicationDecision; notes: string; onNotesChange: (value: string) => void; onSave: (value: PublicationDecisionValue) => void; onClear: () => void }) {
  return <><p className="eyebrow">Publication candidate</p><h2>{trail.canonicalDisplayName}</h2><dl className="reconFacts"><div><dt>Decision</dt><dd>{decision?.decision ?? "undecided"}</dd></div><div><dt>Region</dt><dd>{trail.region}</dd></div>{segment ? <><div><dt>Candidate key</dt><dd>{segment.candidateSegmentKey}</dd></div><div><dt>Production key</dt><dd>{published?.productionSegmentKey ?? "not published"}</dd></div><div><dt>Miles</dt><dd>{segment.calculatedMiles}</dd></div><div><dt>Junctions</dt><dd>{segment.startJunctionKey} / {segment.endJunctionKey}</dd></div><div><dt>Source</dt><dd>{segment.sourceProvider} * {segment.sourceFeatureIds.join(", ")}</dd></div></> : null}</dl><textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Optional publication review notes" /><p><button type="button" onClick={() => onSave("verified_for_publication")}>Verify for publication</button> <button type="button" onClick={() => onSave("rejected")}>Reject</button> <button type="button" onClick={() => onSave("needs_review")}>Needs review</button> <button type="button" onClick={onClear}>Clear</button></p></>;
}

function SegmentPreview({ segment }: { segment: { geometry: { coordinates: number[][] } } }) {
  const coordinates = segment.geometry.coordinates;
  const xs = coordinates.map(([x]) => x), ys = coordinates.map(([, y]) => y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 0.0001), height = Math.max(maxY - minY, 0.0001);
  const project = ([x, y]: number[]) => `${20 + ((x - minX) / width) * 320},${340 - ((y - minY) / height) * 320}`;
  return <svg viewBox="0 0 360 360" role="img" aria-label="Schematic publication geometry"><rect width="360" height="360" fill="#d6d4ca" /><polyline points={coordinates.map(project).join(" ")} fill="none" stroke="#d94a3a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /><circle cx={Number(project(coordinates[0]).split(",")[0])} cy={Number(project(coordinates[0]).split(",")[1])} r="6" fill="#161a18" /><circle cx={Number(project(coordinates[coordinates.length - 1]).split(",")[0])} cy={Number(project(coordinates[coordinates.length - 1]).split(",")[1])} r="6" fill="#161a18" /><text x="18" y="28" fontSize="12" fill="#161a18">PUBLICATION REVIEW * NOT FOR NAVIGATION</text></svg>;
}

