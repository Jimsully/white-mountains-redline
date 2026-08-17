import type { LineString, MultiLineString, Position } from "geojson";
import type { SegmentCandidate, SegmentReviewDecision } from "@/types/segment-construction";

export const ACTIVITY_MATCHING_ALGORITHM_VERSION = "activity-matching-v1";
export const ACTIVITY_KEY_VERSION = "activity-key-v2";

export type ActivitySource = "gpx" | "normalized_json" | "strava_export" | "coros_export" | "manual" | "demo";
export type SegmentMatchClassification = "strong_candidate" | "candidate" | "needs_review" | "insufficient_coverage";
export type ActivityMatchDecisionValue = "accepted" | "rejected" | "needs_review";

export type ActivityTrace = {
  geometry: MultiLineString;
  componentPointCounts: number[];
  pointTimes?: Array<string | undefined>[];
  pointElevationsMeters?: Array<number | undefined>[];
};

export type ActivityRecord = {
  activityKey: string;
  source: ActivitySource;
  sourceActivityId?: string;
  title?: string;
  startTime?: string;
  activityType?: string;
  suppliedDistanceMeters?: number;
  suppliedElevationGainMeters?: number;
  elapsedDurationSeconds?: number;
  movingDurationSeconds?: number;
  trace: ActivityTrace;
  originalPointCount: number;
  normalizedPointCount: number;
  malformedPointCount: number;
  originalFilename?: string;
  sourceMetadata: Record<string, unknown>;
};

export type ActivityImportSummary = {
  activityCount: number;
  trackComponentCount: number;
  inputGpsPointCount: number;
  retainedPointCount: number;
  malformedPointCount: number;
  activityStartDate?: string;
  activityEndDate?: string;
};

export type ActivityMatchingConfig = {
  candidateSearchRadiusMeters: number;
  coverageSampleIntervalMeters: number;
  matchedPointToleranceMeters: number;
  endpointToleranceMeters: number;
  minimumCoverageRatio: number;
  strongCoverageRatio: number;
  strongMaximumMedianDistanceMeters: number;
  strongMaximumP95DistanceMeters: number;
  maximumMedianDistanceMeters: number;
  maximumP95DistanceMeters: number;
  maximumGapRatio: number;
  maximumInterpolatedActivityEdgeMeters: number;
};

export type ComponentMatchEvidence = {
  componentIndex: number;
  coverageRatio: number;
  coveredSampleCount: number;
  startJunctionDistanceMeters: number;
  endJunctionDistanceMeters: number;
  medianSampleDistanceMeters: number;
  p95SampleDistanceMeters: number;
  maxSampleDistanceMeters: number;
  longestUncoveredGapRatio: number;
};

export type EligibleMatchingSegmentApprovalEvidence = {
  segmentDecision: SegmentReviewDecision;
  startJunctionDecision: SegmentReviewDecision;
  endJunctionDecision: SegmentReviewDecision;
  decisionArtifactAlgorithmVersion: string;
  sourceSegmentArtifact: { generatedAt?: string; demoOnly?: boolean; algorithmVersion?: string };
};

export type EligibleMatchingSegment = {
  segmentKey: string;
  parentInventoryItemKey: string;
  trailDisplayName: string;
  trailNormalizedName: string;
  startJunctionKey: string;
  endJunctionKey: string;
  geometry: LineString;
  calculatedMeters: number;
  sourceFeatureIds: string[];
  sourceProvider: string;
  segmentConstructionAlgorithmVersion: string;
  sourceSegmentCandidate: SegmentCandidate;
  approvalEvidence: EligibleMatchingSegmentApprovalEvidence;
};

export type SegmentConstructionDecisionExport = {
  exportedAt?: string;
  algorithmVersion: string;
  sourceArtifact?: { generatedAt?: string; demoOnly?: boolean; algorithmVersion?: string };
  decisions: SegmentReviewDecision[];
};

export type SegmentMatchEvidence = {
  canonicalSegmentLengthMeters: number;
  activityTraceLengthMeters: number;
  rawActivityTraceLengthMeters: number;
  trustedActivityEvidenceLengthMeters: number;
  segmentSampleCount: number;
  coveredSampleCount: number;
  segmentCoverageRatio: number;
  startJunctionDistanceMeters: number;
  endJunctionDistanceMeters: number;
  medianSampleDistanceMeters: number;
  p95SampleDistanceMeters: number;
  maxSampleDistanceMeters: number;
  longestUncoveredRunSamples: number;
  longestUncoveredGapRatio: number;
  maximumActivityPointGapMeters: number;
  p95ActivityPointGapMeters: number;
  ignoredLongActivityEdgeCount: number;
  componentEvidence: ComponentMatchEvidence[];
  componentCoverageRatios: number[];
  bestSingleComponentCoverageRatio: number;
  bestSingleComponentIndex?: number;
  bestStrongComponentIndex?: number;
  singleComponentReachesBothEndpoints: boolean;
  blockedStrongByComponentDiscontinuity: boolean;
  sourceActivityKey: string;
  sourceActivityId?: string;
  segmentCandidateKey: string;
  segmentConstructionAlgorithmVersion: string;
  activityMatchingAlgorithmVersion: string;
  firstMatchedActivityPosition?: Position;
  lastMatchedActivityPosition?: Position;
  activityBbox: [number, number, number, number];
  segmentBbox: [number, number, number, number];
};

export type SegmentMatchCandidate = {
  key: string;
  activityKey: string;
  segmentKey: string;
  trailDisplayName: string;
  classification: SegmentMatchClassification;
  evidence: SegmentMatchEvidence;
  reviewStatus: "unreviewed" | "accepted" | "rejected" | "needs_review";
};

export type ActivityMatchDiagnostics = {
  activitiesLoaded: number;
  eligibleSegmentCount: number;
  pairsConsidered: number;
  bboxRejectedPairs: number;
  fullyScoredPairs: number;
  strongCandidateCount: number;
  candidateCount: number;
  needsReviewCount: number;
  insufficientCoverageCount: number;
  unmatchedActivityCount: number;
  activitiesWithCandidateCount: number;
  segmentsWithCandidateCount: number;
  ignoredActivityEdgeCount: number;
  componentDiscontinuityBlockedStrongCount: number;
  integrityWarnings: string[];
  integrityErrors: string[];
};

export type ActivityMatchRun = {
  generatedAt: string;
  activityMatchingAlgorithmVersion: string;
  segmentConstructionAlgorithmVersion: string;
  config: ActivityMatchingConfig;
};

export type ActivityMatchArtifact = {
  metadata: {
    generatedAt: string;
    demoOnly: boolean;
    algorithmVersion: string;
    warning: string;
    segmentArtifactPath?: string;
    segmentDecisionsPath?: string;
    activitiesPath?: string;
  };
  config: ActivityMatchingConfig;
  activities: ActivityRecord[];
  eligibleSegments: EligibleMatchingSegment[];
  matchCandidates: SegmentMatchCandidate[];
  diagnostics: ActivityMatchDiagnostics;
};

export type ActivityMatchReviewDecision = {
  activityKey: string;
  segmentKey: string;
  matchKey: string;
  decision: ActivityMatchDecisionValue;
  reviewTimestamp: string;
  notes?: string;
  activityMatchingAlgorithmVersion: string;
  segmentConstructionAlgorithmVersion: string;
  sourceArtifact?: { generatedAt?: string; demoOnly?: boolean; algorithmVersion?: string };
};

export type CompletionEvidenceCandidate = {
  evidenceKey: string;
  source: "historical_gps" | "gpx_import" | "manual" | "connected_service";
  activityKey: string;
  segmentKey: string;
  matchKey: string;
  acceptedAt?: string;
  evidence: SegmentMatchEvidence;
};