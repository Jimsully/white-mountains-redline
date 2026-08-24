import type { MultiLineString } from "geojson";
import { stableActivityKey } from "@/lib/activity-matching/activities";
import { stableMatchKey, validateActivityMatchArtifact } from "@/lib/activity-matching/matcher";
import { isActivityMatchArtifactShape } from "@/lib/activity-matching/server-artifact";
import { sha256Fingerprint } from "@/lib/canonical-json";
import type {
  ActivityMatchArtifact,
  ActivityMatchReviewDecision,
  ActivityMatchReviewDecisionExport,
  ActivityRecord,
  EligibleMatchingSegment,
  ReviewedCompletionEvidencePayload,
  ReviewedEvidenceActivityPayload,
  ReviewedEvidenceMaterializationPayload,
  SegmentMatchCandidate,
} from "@/types/activity-matching";
import {
  EVIDENCE_KEY_VERSION,
  REVIEWED_EVIDENCE_LOADER_SCHEMA_VERSION,
} from "@/types/activity-matching";

export const REVIEW_TIMESTAMP_CLOCK_SKEW_MS = 5 * 60 * 1000;
const VALID_ACTIVITY_SOURCES = new Set<ActivityRecord["source"]>([
  "gpx",
  "normalized_json",
  "strava_export",
  "coros_export",
  "manual",
  "demo",
]);

export function buildReviewedEvidenceMaterialization(args: {
  artifact: unknown;
  decisionExport: unknown;
  targetUserId: string;
  now?: Date;
}): ReviewedEvidenceMaterializationPayload {
  if (!isUuid(args.targetUserId)) throw new Error("--user-id must be an exact auth user UUID.");
  if (!isActivityMatchArtifactShape(args.artifact)) throw new Error("The activity artifact has an invalid shape.");

  const artifact = args.artifact;
  assertProductionArtifact(artifact);
  const artifactErrors = validateActivityMatchArtifact(artifact);
  if (artifact.diagnostics.integrityErrors.length) artifactErrors.push(...artifact.diagnostics.integrityErrors);
  if (artifactErrors.length) throw new Error(`Activity matching artifact failed integrity validation:\n${artifactErrors.join("\n")}`);
  validateActivityIdentities(artifact);

  const decisionExport = requireDecisionExport(args.decisionExport);
  validateDecisionExportIdentity(artifact, decisionExport);
  const decisions = validateDecisions(artifact, decisionExport, args.now ?? new Date());
  const artifactFingerprint = canonicalActivityMatchArtifactFingerprint(artifact);
  const activitiesByKey = new Map(artifact.activities.map((activity) => [activity.activityKey, activity]));
  const candidatesByKey = new Map(artifact.matchCandidates.map((candidate) => [candidate.key, candidate]));
  const acceptedDecisions = decisions.filter((decision) => decision.decision === "accepted").sort((a, b) => a.matchKey.localeCompare(b.matchKey));
  const activities = new Map<string, ReviewedEvidenceActivityPayload>();
  const evidence: ReviewedCompletionEvidencePayload[] = [];
  const evidenceKeys = new Set<string>();

  for (const decision of acceptedDecisions) {
    const activity = activitiesByKey.get(decision.activityKey);
    const candidate = candidatesByKey.get(decision.matchKey);
    if (!activity || !candidate) throw new Error(`Accepted decision ${decision.matchKey} lost its validated artifact references.`);
    const activityPayload = mapActivity(activity);
    activities.set(activityPayload.activity_key, activityPayload);
    const acceptedAt = normalizeReviewTimestamp(decision.reviewTimestamp, args.now ?? new Date());
    const evidenceKey = reviewedEvidenceKeyFor(artifactFingerprint, candidate);
    if (evidenceKeys.has(evidenceKey)) throw new Error(`Duplicate deterministic evidence key ${evidenceKey}.`);
    evidenceKeys.add(evidenceKey);
    evidence.push({
      evidence_key: evidenceKey,
      activity_key: activity.activityKey,
      segment_key: candidate.segmentKey,
      match_key: candidate.key,
      decision: "accepted",
      evidence_source: "historical_gps",
      evidence: candidate.evidence,
      accepted_at: acceptedAt,
      provenance: {
        loaderSchemaVersion: REVIEWED_EVIDENCE_LOADER_SCHEMA_VERSION,
        artifactFingerprint,
        matchKey: candidate.key,
        activityKey: activity.activityKey,
        segmentKey: candidate.segmentKey,
        activityMatchingAlgorithmVersion: artifact.metadata.algorithmVersion,
        segmentConstructionAlgorithmVersion: candidate.evidence.segmentConstructionAlgorithmVersion,
        classification: candidate.classification,
        reviewDecision: { status: "accepted", reviewTimestamp: acceptedAt },
        activityDate: activityPayload.activity_date,
      },
    });
  }

  const sortedActivities = [...activities.values()].sort((a, b) => a.activity_key.localeCompare(b.activity_key));
  const run: ReviewedEvidenceMaterializationPayload["run"] = {
    loader_schema_version: REVIEWED_EVIDENCE_LOADER_SCHEMA_VERSION,
    evidence_key_version: EVIDENCE_KEY_VERSION,
    artifact_fingerprint: artifactFingerprint,
    demo_only: false as const,
    activity_matching_algorithm_version: artifact.metadata.algorithmVersion,
    source_artifact: {
      generatedAt: artifact.metadata.generatedAt,
      demoOnly: false as const,
      algorithmVersion: artifact.metadata.algorithmVersion,
    },
  };
  const rpcBody = {
    target_user_id: args.targetUserId,
    run_payload: run,
    activities_payload: sortedActivities,
    evidence_payload: evidence,
  };

  return {
    targetUserId: args.targetUserId,
    run,
    activities: sortedActivities,
    evidence,
    summary: {
      acceptedDecisionCount: acceptedDecisions.length,
      rejectedDecisionCount: decisions.filter((decision) => decision.decision === "rejected").length,
      needsReviewDecisionCount: decisions.filter((decision) => decision.decision === "needs_review").length,
      activitiesRequired: sortedActivities.length,
      evidenceCount: evidence.length,
      artifactFingerprint,
      payloadBytes: Buffer.byteLength(JSON.stringify(rpcBody), "utf8"),
    },
  };
}

export function canonicalActivityMatchArtifactFingerprint(artifact: ActivityMatchArtifact): string {
  return sha256Fingerprint({
    schemaVersion: "activity-match-semantic-artifact-v1",
    metadata: {
      demoOnly: artifact.metadata.demoOnly,
      algorithmVersion: artifact.metadata.algorithmVersion,
    },
    config: artifact.config,
    activities: [...artifact.activities].sort((a, b) => a.activityKey.localeCompare(b.activityKey)).map(semanticActivity),
    eligibleSegments: [...artifact.eligibleSegments].sort((a, b) => a.segmentKey.localeCompare(b.segmentKey)).map(semanticSegment),
    matchCandidates: [...artifact.matchCandidates].sort((a, b) => a.key.localeCompare(b.key)),
    diagnostics: artifact.diagnostics,
  });
}

export function reviewedEvidenceKeyFor(artifactFingerprint: string, candidate: SegmentMatchCandidate): string {
  return `evidence_${sha256Fingerprint([
    EVIDENCE_KEY_VERSION,
    artifactFingerprint,
    candidate.key,
    candidate.activityKey,
    candidate.segmentKey,
    candidate.evidence.activityMatchingAlgorithmVersion,
    candidate.evidence.segmentConstructionAlgorithmVersion,
  ])}`;
}

export async function executeReviewedEvidenceMaterialization<T>(
  payload: ReviewedEvidenceMaterializationPayload,
  options: {
    load: boolean;
    verifyUser?: (userId: string) => Promise<void>;
    loadBatch?: (payload: ReviewedEvidenceMaterializationPayload) => Promise<T>;
  },
): Promise<{ mode: "dry_run" } | { mode: "loaded"; result: T }> {
  if (!options.load) return { mode: "dry_run" };
  if (!options.verifyUser || !options.loadBatch) throw new Error("Load mode requires controlled user verification and RPC dependencies.");
  await options.verifyUser(payload.targetUserId);
  return { mode: "loaded", result: await options.loadBatch(payload) };
}

function assertProductionArtifact(artifact: ActivityMatchArtifact) {
  if (artifact.metadata.demoOnly) throw new Error("Demo activity matching artifacts must not be materialized.");
  if (!artifact.metadata.generatedAt) throw new Error("Activity matching artifact generatedAt identity is required.");
  for (const activity of artifact.activities) {
    if (activity.source === "demo") throw new Error(`Demo activity ${activity.activityKey} must not be materialized.`);
  }
  for (const segment of artifact.eligibleSegments) {
    if (segment.approvalEvidence?.sourceSegmentArtifact.demoOnly !== false) {
      throw new Error(`Eligible segment ${segment.segmentKey} does not have non-demo upstream artifact identity.`);
    }
  }
}

function validateActivityIdentities(artifact: ActivityMatchArtifact) {
  for (const activity of artifact.activities) {
    if (!VALID_ACTIVITY_SOURCES.has(activity.source)) throw new Error(`Activity ${activity.activityKey} has an unsupported source.`);
    if (typeof activity.activityKey !== "string" || !activity.activityKey) throw new Error("Activity artifact contains a missing activity key.");
    for (const [field, value] of [
      ["sourceActivityId", activity.sourceActivityId],
      ["title", activity.title],
      ["startTime", activity.startTime],
      ["activityType", activity.activityType],
    ] as const) {
      if (value !== undefined && typeof value !== "string") throw new Error(`Activity ${activity.activityKey} has an invalid ${field}.`);
    }
    for (const [field, value] of [
      ["suppliedDistanceMeters", activity.suppliedDistanceMeters],
      ["suppliedElevationGainMeters", activity.suppliedElevationGainMeters],
      ["elapsedDurationSeconds", activity.elapsedDurationSeconds],
      ["movingDurationSeconds", activity.movingDurationSeconds],
    ] as const) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error(`Activity ${activity.activityKey} has an invalid ${field}.`);
    }
    for (const count of [activity.originalPointCount, activity.normalizedPointCount, activity.malformedPointCount]) {
      if (!Number.isInteger(count) || count < 0) throw new Error(`Activity ${activity.activityKey} has an invalid point count.`);
    }
    validateGeometry(activity.trace?.geometry, activity.activityKey);
    const expected = stableActivityKey(activity.source, activity.sourceActivityId, activity.startTime, activity.trace.geometry);
    if (activity.activityKey !== expected) throw new Error(`Activity ${activity.activityKey} has a non-deterministic activity key.`);
  }
}

function validateDecisionExportIdentity(artifact: ActivityMatchArtifact, decisionExport: ActivityMatchReviewDecisionExport) {
  if (decisionExport.activityMatchingAlgorithmVersion !== artifact.metadata.algorithmVersion) {
    throw new Error("Review decision export algorithm version does not match the activity artifact.");
  }
  assertSameArtifactIdentity(decisionExport.sourceArtifact, artifact.metadata, "Review decision export");
  if (decisionExport.sourceArtifact.demoOnly) throw new Error("Demo review decisions must not be materialized.");
}

function validateDecisions(artifact: ActivityMatchArtifact, decisionExport: ActivityMatchReviewDecisionExport, now: Date) {
  const candidates = new Map(artifact.matchCandidates.map((candidate) => [candidate.key, candidate]));
  const seen = new Set<string>();
  for (const decision of decisionExport.decisions) {
    if (seen.has(decision.matchKey)) throw new Error(`Duplicate review decision for match ${decision.matchKey}.`);
    seen.add(decision.matchKey);
    const candidate = candidates.get(decision.matchKey);
    if (!candidate) throw new Error(`Review decision references unknown match ${decision.matchKey}.`);
    if (decision.activityKey !== candidate.activityKey || decision.segmentKey !== candidate.segmentKey) {
      throw new Error(`Review decision ${decision.matchKey} does not match its activity/segment candidate identity.`);
    }
    if (decision.matchKey !== stableMatchKey(decision.activityKey, decision.segmentKey)) {
      throw new Error(`Review decision ${decision.matchKey} has a non-deterministic match key.`);
    }
    if (decision.activityMatchingAlgorithmVersion !== artifact.metadata.algorithmVersion
      || candidate.evidence.activityMatchingAlgorithmVersion !== artifact.metadata.algorithmVersion) {
      throw new Error(`Review decision ${decision.matchKey} has a stale activity-matching algorithm version.`);
    }
    if (decision.segmentConstructionAlgorithmVersion !== candidate.evidence.segmentConstructionAlgorithmVersion) {
      throw new Error(`Review decision ${decision.matchKey} has a stale segment-construction algorithm version.`);
    }
    if (!decision.sourceArtifact) throw new Error(`Review decision ${decision.matchKey} is missing source artifact identity.`);
    assertSameArtifactIdentity(decision.sourceArtifact, artifact.metadata, `Review decision ${decision.matchKey}`);
    normalizeReviewTimestamp(decision.reviewTimestamp, now);
  }
  return decisionExport.decisions;
}

function requireDecisionExport(value: unknown): ActivityMatchReviewDecisionExport {
  if (!isRecord(value) || !Array.isArray(value.decisions) || typeof value.activityMatchingAlgorithmVersion !== "string") {
    throw new Error("A valid activity review-decision export is required.");
  }
  if (!isCompleteArtifactIdentity(value.sourceArtifact)) throw new Error("Review decision export source artifact identity is incomplete.");
  for (const decision of value.decisions) {
    if (!isReviewDecision(decision)) throw new Error("Review decision export contains a malformed decision.");
  }
  return value as ActivityMatchReviewDecisionExport;
}

function mapActivity(activity: ActivityRecord): ReviewedEvidenceActivityPayload {
  if (activity.source === "manual" || activity.source === "demo") {
    throw new Error(`Activity ${activity.activityKey} source ${activity.source} cannot produce historical GPS evidence.`);
  }
  const source = activity.source === "gpx" ? "gpx" : activity.source === "strava_export" ? "strava" : "other";
  let distanceMiles: number | null = null;
  if (activity.suppliedDistanceMeters !== undefined) {
    if (!Number.isFinite(activity.suppliedDistanceMeters) || activity.suppliedDistanceMeters < 0) throw new Error(`Activity ${activity.activityKey} has invalid supplied distance.`);
    distanceMiles = Math.round((activity.suppliedDistanceMeters / 1609.344) * 1000) / 1000;
    if (distanceMiles > 99_999.999) throw new Error(`Activity ${activity.activityKey} exceeds the database distance range.`);
  }
  return {
    activity_key: activity.activityKey,
    title: activity.title ?? null,
    activity_date: activityDateFromStartTime(activity.startTime, activity.activityKey),
    source,
    geometry: activity.trace.geometry,
    distance_miles: distanceMiles,
  };
}

function activityDateFromStartTime(startTime: string | undefined, activityKey: string): string | null {
  if (!startTime) return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(startTime);
  if (!match) throw new Error(`Activity ${activityKey} has an invalid startTime calendar date.`);
  const parsed = new Date(`${match[1]}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== match[1]) {
    throw new Error(`Activity ${activityKey} has an invalid startTime calendar date.`);
  }
  return match[1];
}

function normalizeReviewTimestamp(value: string, now: Date): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error(`Review timestamp ${value} is malformed.`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error(`Review timestamp ${value} is malformed.`);
  if (milliseconds > now.valueOf() + REVIEW_TIMESTAMP_CLOCK_SKEW_MS) {
    throw new Error(`Review timestamp ${value} is materially in the future.`);
  }
  return new Date(milliseconds).toISOString();
}

function validateGeometry(geometry: MultiLineString | undefined, activityKey: string) {
  if (!geometry || geometry.type !== "MultiLineString" || !Array.isArray(geometry.coordinates) || !geometry.coordinates.length) {
    throw new Error(`Activity ${activityKey} requires MultiLineString geometry.`);
  }
  for (const line of geometry.coordinates) {
    if (!Array.isArray(line) || line.length < 2) throw new Error(`Activity ${activityKey} has a malformed trace component.`);
    for (const position of line) {
      if (!Array.isArray(position) || position.length !== 2) throw new Error(`Activity ${activityKey} requires two-dimensional coordinates.`);
      const longitude = position[0];
      const latitude = position[1];
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
        throw new Error(`Activity ${activityKey} has an invalid coordinate.`);
      }
    }
  }
}

function semanticActivity(activity: ActivityRecord) {
  return withoutUndefined({
    activityKey: activity.activityKey,
    source: activity.source,
    sourceActivityId: activity.sourceActivityId,
    title: activity.title,
    startTime: activity.startTime,
    activityType: activity.activityType,
    suppliedDistanceMeters: activity.suppliedDistanceMeters,
    suppliedElevationGainMeters: activity.suppliedElevationGainMeters,
    elapsedDurationSeconds: activity.elapsedDurationSeconds,
    movingDurationSeconds: activity.movingDurationSeconds,
    trace: activity.trace,
    originalPointCount: activity.originalPointCount,
    normalizedPointCount: activity.normalizedPointCount,
    malformedPointCount: activity.malformedPointCount,
  });
}

function withoutUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function semanticSegment(segment: EligibleMatchingSegment) {
  return {
    segmentKey: segment.segmentKey,
    parentInventoryItemKey: segment.parentInventoryItemKey,
    trailDisplayName: segment.trailDisplayName,
    trailNormalizedName: segment.trailNormalizedName,
    startJunctionKey: segment.startJunctionKey,
    endJunctionKey: segment.endJunctionKey,
    geometry: segment.geometry,
    calculatedMeters: segment.calculatedMeters,
    sourceFeatureIds: [...segment.sourceFeatureIds].sort(),
    sourceProvider: segment.sourceProvider,
    segmentConstructionAlgorithmVersion: segment.segmentConstructionAlgorithmVersion,
    sourceSegmentCandidate: segment.sourceSegmentCandidate,
    approvalEvidence: {
      segmentDecision: semanticUpstreamDecision(segment.approvalEvidence.segmentDecision),
      startJunctionDecision: semanticUpstreamDecision(segment.approvalEvidence.startJunctionDecision),
      endJunctionDecision: semanticUpstreamDecision(segment.approvalEvidence.endJunctionDecision),
      decisionArtifactAlgorithmVersion: segment.approvalEvidence.decisionArtifactAlgorithmVersion,
      sourceSegmentArtifact: {
        demoOnly: segment.approvalEvidence.sourceSegmentArtifact.demoOnly,
        algorithmVersion: segment.approvalEvidence.sourceSegmentArtifact.algorithmVersion,
      },
    },
  };
}

function semanticUpstreamDecision(decision: EligibleMatchingSegment["approvalEvidence"]["segmentDecision"]) {
  return { targetType: decision.targetType, targetKey: decision.targetKey, decision: decision.decision };
}

function assertSameArtifactIdentity(actual: { generatedAt?: string; demoOnly?: boolean; algorithmVersion?: string }, expected: ActivityMatchArtifact["metadata"], label: string) {
  if (actual.generatedAt !== expected.generatedAt || actual.demoOnly !== expected.demoOnly || actual.algorithmVersion !== expected.algorithmVersion) {
    throw new Error(`${label} identity does not match the activity matching artifact.`);
  }
}

function isCompleteArtifactIdentity(value: unknown): value is ActivityMatchReviewDecisionExport["sourceArtifact"] {
  return isRecord(value)
    && typeof value.generatedAt === "string"
    && typeof value.demoOnly === "boolean"
    && typeof value.algorithmVersion === "string";
}

function isReviewDecision(value: unknown): value is ActivityMatchReviewDecision {
  if (!isRecord(value)) return false;
  return typeof value.activityKey === "string"
    && typeof value.segmentKey === "string"
    && typeof value.matchKey === "string"
    && (value.decision === "accepted" || value.decision === "rejected" || value.decision === "needs_review")
    && typeof value.reviewTimestamp === "string"
    && typeof value.activityMatchingAlgorithmVersion === "string"
    && typeof value.segmentConstructionAlgorithmVersion === "string"
    && (value.notes === undefined || typeof value.notes === "string")
    && isCompleteArtifactIdentity(value.sourceArtifact);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}