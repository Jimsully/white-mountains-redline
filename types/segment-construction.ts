import type { LineString, MultiLineString, Position } from "geojson";
import type { ReconciliationCandidate } from "@/types/reconciliation";

export const SEGMENT_CONSTRUCTION_ALGORITHM_VERSION = "segment-construction-v1";

export type JunctionReason =
  | "trail_endpoint"
  | "cross_trail_intersection"
  | "same_trail_source_boundary"
  | "manual"
  | "ambiguous_near_intersection";

export type JunctionReviewStatus = "proposed" | "accepted" | "rejected" | "needs_review";
export type SegmentReviewStatus = "proposed" | "accepted" | "rejected" | "needs_review";
export type SegmentDecisionValue = "accepted" | "rejected" | "needs_review";
export type SourceFeatureProvenancePrecision = "exact" | "coarse";

export type SegmentConstructionTolerances = {
  endpointSnapToleranceMeters: number;
  intersectionToleranceMeters: number;
  minimumSegmentLengthMeters: number;
};

export type AcceptedTrailSource = {
  itemKey: string;
  trailDisplayName: string;
  trailNormalizedName: string;
  sourceTrailDisplayName: string;
  sourceTrailNormalizedName: string;
  sourceProvider: string;
  sourceFeatureIds: string[];
  sourceGisMiles: number;
  geometry: MultiLineString;
  reconciliation: {
    decisionTimestamp: string;
    selectedCandidateNormalizedName?: string;
    evidence: ReconciliationCandidate["evidence"];
  };
  warnings: string[];
  componentProvenance?: Array<{ componentKey: string; sourceFeatureIds: string[]; provenancePrecision: SourceFeatureProvenancePrecision }>;
};

export type JunctionCandidate = {
  key: string;
  coordinate: Position;
  reasons: JunctionReason[];
  reviewStatus: JunctionReviewStatus;
  participatingTrailNormalizedNames: string[];
  participatingInventoryItemKeys: string[];
  sourceFeatureIds: string[];
  rawDetectedPoints: Position[];
  maximumClusterSpreadMeters: number;
  evidence: Array<{
    reason: JunctionReason;
    measuredDistanceMeters?: number;
    participatingTrailNormalizedNames: string[];
    participatingInventoryItemKeys: string[];
    sourceFeatureIds: string[];
  }>;
};

export type SegmentCandidate = {
  key: string;
  parentInventoryItemKey: string;
  trailDisplayName: string;
  trailNormalizedName: string;
  startJunctionKey: string;
  endJunctionKey: string;
  geometry: LineString;
  calculatedMiles: number;
  calculatedMeters: number;
  sourceFeatureIds: string[];
  sourceProvider: string;
  sourceReconciliation: {
    selectedCandidateNormalizedName?: string;
    evidenceFeatureIds: string[];
  };
  geometryModification: {
    splitFromAcceptedSource: boolean;
    snappedToJunction: boolean;
    componentIndex: number;
    sourceComponentKey: string;
    sourceFeatureProvenancePrecision: SourceFeatureProvenancePrecision;
    startMeasureMeters: number;
    endMeasureMeters: number;
  };
  reviewStatus: SegmentReviewStatus;
  warningFlags: string[];
};

export type SegmentConstructionDiagnostics = {
  acceptedTrailSourceCount: number;
  junctionCandidateCount: number;
  exactIntersectionCount: number;
  nearIntersectionWarningCount: number;
  segmentCandidateCount: number;
  shortSegmentWarningCount: number;
  disconnectedComponentCount: number;
  sourceFeatureBoundaryCount: number;
  excessiveSpreadJunctionCount: number;
  inputGeometryMiles: number;
  outputSegmentMiles: number;
  lengthDeltaMiles: number;
  warnings: string[];
  integrityWarnings: string[];
  integrityErrors: string[];
};

export type SegmentConstructionArtifact = {
  metadata: {
    generatedAt: string;
    demoOnly: boolean;
    algorithmVersion: string;
    warning: string;
    reconciliationArtifactPath?: string;
    decisionsPath?: string;
  };
  tolerances: SegmentConstructionTolerances;
  acceptedTrailSources: AcceptedTrailSource[];
  junctionCandidates: JunctionCandidate[];
  segmentCandidates: SegmentCandidate[];
  diagnostics: SegmentConstructionDiagnostics;
};

export type SegmentReviewDecision = {
  targetType: "junction" | "segment";
  targetKey: string;
  decision: SegmentDecisionValue;
  reviewTimestamp: string;
  notes?: string;
};