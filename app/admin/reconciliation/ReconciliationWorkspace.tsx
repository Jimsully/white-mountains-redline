"use client";

import { useMemo, useState } from "react";
import type { ReconciliationArtifact, ReconciliationCandidate, ReconciliationDecision, ReconciliationDecisionValue, ReconciliationItemResult } from "@/types/reconciliation";
import { buildDecisionExport } from "@/lib/reconciliation/artifact";
import { buildReviewDecision, findCandidateByKey, notesByItemFromDecisions, parseStoredDecisions, selectedCandidateKeyForResult } from "@/lib/reconciliation/review-state";

type Props = { artifact: ReconciliationArtifact };
type FilterMode = "all" | "exact" | "ambiguous" | "unmatched" | "needs_review";

const STORAGE_KEY = "white-mountains-redline-reconciliation-decisions";

export function ReconciliationWorkspace({ artifact }: Props) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState(artifact.results[0]?.item.itemKey);
  const [selectedCandidateKey, setSelectedCandidateKey] = useState<string | undefined>(() => selectedCandidateKeyForResult(artifact.results[0]));
  const [decisions, setDecisions] = useState<Record<string, ReconciliationDecision>>(() => {
    if (typeof window === "undefined") return {};
    return parseStoredDecisions(window.localStorage.getItem(STORAGE_KEY));
  });
  const [notesByItem, setNotesByItem] = useState<Record<string, string>>(() => notesByItemFromDecisions(decisions));

  const visible = useMemo(() => artifact.results.filter((result) => {
    if (filter !== "all" && result.status !== filter) return false;
    const haystack = [result.item.displayName, result.item.normalizedName, ...result.candidates.map((candidate) => candidate.sourceTrailDisplayName)].join(" ").toLocaleLowerCase();
    return haystack.includes(query.trim().toLocaleLowerCase());
  }), [artifact.results, filter, query]);
  const selected = artifact.results.find((result) => result.item.itemKey === selectedKey) ?? visible[0] ?? artifact.results[0];
  const selectedCandidate = findCandidateByKey(selected, selectedCandidateKey);
  const notes = selected ? notesByItem[selected.item.itemKey] ?? decisions[selected.item.itemKey]?.notes ?? "" : "";

  function persistDecisions(next: Record<string, ReconciliationDecision>) {
    setDecisions(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function saveDecision(decision: ReconciliationDecisionValue, candidate = selectedCandidate) {
    if (!selected) return;
    const nextDecision = buildReviewDecision({
      itemKey: selected.item.itemKey,
      candidate,
      decision,
      reviewTimestamp: new Date().toISOString(),
      notes,
    });
    persistDecisions({ ...decisions, [selected.item.itemKey]: nextDecision });
  }

  function clearDecision() {
    if (!selected) return;
    const next = { ...decisions };
    delete next[selected.item.itemKey];
    persistDecisions(next);
  }

  function updateNotes(value: string) {
    if (!selected) return;
    setNotesByItem((current) => ({ ...current, [selected.item.itemKey]: value }));
  }

  function selectItem(result: ReconciliationItemResult) {
    setSelectedKey(result.item.itemKey);
    setSelectedCandidateKey(selectedCandidateKeyForResult(result));
  }

  function selectCandidate(candidate: ReconciliationCandidate) {
    setSelectedCandidateKey(candidate.sourceTrailNormalizedName);
  }

  function exportDecisions() {
    const blob = new Blob([JSON.stringify(buildDecisionExport(Object.values(decisions)), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "reconciliation-decisions.prototype.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="reconShell">
      <header className="reconHeader">
        <div>
          <p className="eyebrow">SOURCE RECONCILIATION WORKSPACE</p>
          <h1>NOT FOR NAVIGATION * NOT CHALLENGE VERIFIED</h1>
        </div>
        <button type="button" onClick={exportDecisions}>Export review decisions</button>
      </header>
      <section className="reconStats">
        <span>{artifact.summary.inventoryItemCount} demo inventory items</span>
        <span>{artifact.summary.exactMatchCount} exact</span>
        <span>{artifact.summary.ambiguousCount} ambiguous</span>
        <span>{artifact.summary.unmatchedCount} unmatched</span>
        <span>{artifact.summary.sourceTrailGroupCount} source groups</span>
      </section>
      <div className="reconGrid">
        <aside className="reconList">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search inventory or source name" />
          <div className="reconFilters">
            {(["all", "exact", "ambiguous", "unmatched", "needs_review"] as const).map((mode) => (
              <button key={mode} className={filter === mode ? "active" : ""} onClick={() => setFilter(mode)} type="button">{mode.replace("_", " ")}</button>
            ))}
          </div>
          {visible.map((result) => (
            <button key={result.item.itemKey} type="button" className={selected?.item.itemKey === result.item.itemKey ? "reconItem active" : "reconItem"} onClick={() => selectItem(result)}>
              <strong>{result.item.displayName}</strong>
              <span>{result.status} * {result.candidates.length} candidates</span>
            </button>
          ))}
        </aside>
        <section className="reconDetail">
          {selected ? <Detail result={selected} decision={decisions[selected.item.itemKey]} selectedCandidate={selectedCandidate} onCandidateSelect={selectCandidate} onAccept={(candidate) => saveDecision("accepted", candidate)} onReject={(candidate) => saveDecision("rejected", candidate)} onNeedsReview={() => saveDecision("needs_review")} onClear={clearDecision} notes={notes} onNotesChange={updateNotes} /> : null}
        </section>
        <section className="reconMap">
          <CandidateSketch artifact={artifact} candidate={selectedCandidate} />
        </section>
      </div>
    </main>
  );
}

function Detail({ result, decision, selectedCandidate, onCandidateSelect, onAccept, onReject, onNeedsReview, onClear, notes, onNotesChange }: { result: ReconciliationItemResult; decision?: ReconciliationDecision; selectedCandidate?: ReconciliationCandidate; onCandidateSelect: (candidate: ReconciliationCandidate) => void; onAccept: (candidate: ReconciliationCandidate) => void; onReject: (candidate: ReconciliationCandidate) => void; onNeedsReview: () => void; onClear: () => void; notes: string; onNotesChange: (value: string) => void }) {
  return <>
    <p className="eyebrow">Challenge inventory item</p>
    <h2>{result.item.displayName}</h2>
    <dl className="reconFacts"><div><dt>Normalized</dt><dd>{result.item.normalizedName}</dd></div><div><dt>Region hint</dt><dd>{result.item.regionHint ?? "none"}</dd></div><div><dt>Decision</dt><dd>{decision?.decision ?? "prototype localStorage only"}</dd></div></dl>
    <textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Optional prototype review notes" />
    <button type="button" onClick={onNeedsReview}>Needs review</button> <button type="button" onClick={onClear}>Clear decision</button>
    <div className="candidateStack">
      {result.candidates.map((candidate) => {
        const active = candidate.sourceTrailNormalizedName === selectedCandidate?.sourceTrailNormalizedName;
        return <article key={candidate.sourceTrailNormalizedName} className={active ? "candidateCard active" : "candidateCard"}>
          <button type="button" className="candidateSelect" onClick={() => onCandidateSelect(candidate)} aria-pressed={active}>
            <strong>{candidate.sourceTrailDisplayName}</strong><span>{candidate.score}/100</span>
          </button>
          <p>{candidate.evidence.reasons.join("; ")}</p>
          <dl><div><dt>Feature count</dt><dd>{candidate.evidence.sourceFeatureCount}</dd></div><div><dt>GIS miles</dt><dd>{candidate.evidence.sourceGisMiles}</dd></div><div><dt>Source IDs</dt><dd>{candidate.evidence.sourceFeatureIds.join(", ")}</dd></div></dl>
          <button type="button" onClick={() => { onCandidateSelect(candidate); onAccept(candidate); }}>Accept candidate</button><button type="button" onClick={() => { onCandidateSelect(candidate); onReject(candidate); }}>Reject candidate</button>
        </article>;
      })}
    </div>
  </>;
}

function CandidateSketch({ artifact, candidate }: { artifact: ReconciliationArtifact; candidate?: ReconciliationCandidate }) {
  const group = artifact.sourceTrailGroups.find((item) => item.normalizedName === candidate?.sourceTrailNormalizedName);
  if (!group) return <p className="muted">Select an item with candidates to preview source geometry.</p>;
  const [minX, minY, maxX, maxY] = group.bbox;
  const width = Math.max(maxX - minX, 0.0001);
  const height = Math.max(maxY - minY, 0.0001);
  return <svg viewBox="0 0 360 360" role="img" aria-label="Schematic candidate source geometry"><rect width="360" height="360" fill="#d6d4ca" />{group.geometry.coordinates.map((line, index) => <polyline key={index} points={line.map(([x, y]) => `${20 + ((x - minX) / width) * 320},${340 - ((y - minY) / height) * 320}`).join(" ")} fill="none" stroke="#d94a3a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />)}<text x="18" y="28" fontSize="12" fill="#161a18">SOURCE GEOMETRY * NOT FOR NAVIGATION</text></svg>;
}