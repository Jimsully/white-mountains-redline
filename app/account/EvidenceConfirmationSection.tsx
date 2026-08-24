"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { confirmCompletionEvidenceAction, initialEvidenceConfirmationActionResult } from "@/lib/completions/actions";
import type { CompletionEvidenceSource, ConfirmableCompletionEvidence } from "@/types/completion";

export type EvidenceConfirmationItem = Pick<
  ConfirmableCompletionEvidence,
  "evidenceId" | "trailName" | "segmentName" | "region" | "evidenceSource" | "activityTitle" | "activityDate"
>;

type EvidenceConfirmationSectionProps = {
  evidence: EvidenceConfirmationItem[];
  loadFailed: boolean;
};

export function EvidenceConfirmationSection({ evidence, loadFailed }: EvidenceConfirmationSectionProps) {
  const [result, action] = useActionState(confirmCompletionEvidenceAction, initialEvidenceConfirmationActionResult);

  return (
    <section className="evidenceSection" aria-labelledby="evidence-heading">
      <h2 id="evidence-heading">Evidence ready to confirm</h2>
      <p className="evidenceIntro">Reviewed activity evidence can suggest that you completed a trail segment. Your progress will not change until you confirm it.</p>

      {result.status === "success" ? <div className="notice" role="status">{result.message}</div> : null}
      {result.status === "error" ? <div className="notice errorNotice" role="alert">{result.message}</div> : null}

      {loadFailed ? (
        <div className="notice errorNotice" role="alert">Evidence ready to confirm is temporarily unavailable.</div>
      ) : evidence.length === 0 ? (
        <p className="evidenceEmpty">No reviewed activity evidence is waiting for confirmation.</p>
      ) : (
        <form action={action}>
          <ul className="evidenceList">
            {evidence.map((item) => (
              <li className="evidenceItem" key={item.evidenceId}>
                <div>
                  <h3>{item.trailName}</h3>
                  <p className="evidenceSegmentName">{item.segmentName}</p>
                </div>
                <dl className="evidenceMeta">
                  <div><dt>Region</dt><dd>{item.region}</dd></div>
                  <div><dt>Activity date</dt><dd>{formatEvidenceActivityDate(item.activityDate)}</dd></div>
                  {item.activityTitle !== null ? <div><dt>Activity</dt><dd>{item.activityTitle}</dd></div> : null}
                  <div><dt>Source</dt><dd>{evidenceSourceLabel(item.evidenceSource)}</dd></div>
                </dl>
                <EvidenceSubmitButton evidenceId={item.evidenceId} trailName={item.trailName} segmentName={item.segmentName} />
              </li>
            ))}
          </ul>
        </form>
      )}
    </section>
  );
}

function EvidenceSubmitButton({ evidenceId, trailName, segmentName }: { evidenceId: string; trailName: string; segmentName: string }) {
  const { data, pending } = useFormStatus();
  const isCurrent = pending && data?.get("evidenceId") === evidenceId;

  return (
    <button
      className="evidenceConfirmButton"
      type="submit"
      name="evidenceId"
      value={evidenceId}
      disabled={pending}
      aria-label={`Mark ${trailName}, ${segmentName} complete`}
    >
      {isCurrent ? "Marking complete..." : "Mark complete"}
    </button>
  );
}

export function evidenceSourceLabel(source: CompletionEvidenceSource) {
  if (source === "historical_gps") return "Historical GPS";
  if (source === "gpx_import") return "GPX import";
  return "Connected activity";
}

export function formatEvidenceActivityDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
