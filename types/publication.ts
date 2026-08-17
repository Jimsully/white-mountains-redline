import type { LineString } from "geojson";
import type { SegmentCandidate, SegmentReviewDecision } from "@/types/segment-construction";

export const PUBLICATION_ALGORITHM_VERSION = "publication-v1";
export const PRODUCTION_SEGMENT_KEY_VERSION = "production-segment-key-v1";
export const PRODUCTION_TRAIL_KEY_VERSION = "production-trail-key-v1";

export type PublicationDecisionValue = "verified_for_publication" | "rejected" | "needs_review";
export type PublicationTargetType = "trail" | "segment";

export type PublicationDecision = {
  targetType: PublicationTargetType;
  targetKey: string;
  decision: PublicationDecisionValue;
  reviewTimestamp: string;
  reviewer?: string;
  notes?: string;
};

export type PublicationDecisionExport = {
  exportedAt?: string;
  warning?: string;
  algorithmVersion: string;
  sourceArtifact?: { generatedAt?: string; demoOnly?: boolean; algorithmVersion?: string };
  sourceSegmentDecisions?: { exportedAt?: string; algorithmVersion?: string; sourceArtifact?: { generatedAt?: string; demoOnly?: boolean; algorithmVersion?: string } };
  decisions: PublicationDecision[];
};

export type PublicationCandidateTrail = {
  candidateTrailKey: string;
  parentInventoryItemKey: string;
  trailDisplayName: string;
  trailNormalizedName: string;
  sourceProvider: string;
  sourceFeatureIds: string[];
  calculatedMiles: number;
  segmentCandidateKeys: string[];
};

export type PublicationCandidateSegment = {
  candidateSegmentKey: string;
  candidateTrailKey: string;
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
  segmentConstructionAlgorithmVersion: string;
  sourceSegmentArtifact: { generatedAt?: string; demoOnly?: boolean; algorithmVersion?: string };
  sourceSegmentCandidate: SegmentCandidate;
  upstreamDecisions: {
    segmentDecision: SegmentReviewDecision;
    startJunctionDecision: SegmentReviewDecision;
    endJunctionDecision: SegmentReviewDecision;
  };
};

export type PublishedTrailStatus = "verified";
export type PublishedVerificationStatus = "human_verified";

export type VerifiedPublishedTrail = {
  id: string;
  productionTrailKey: string;
  productionTrailKeyVersion: typeof PRODUCTION_TRAIL_KEY_VERSION;
  slug: string;
  name: string;
  normalizedName: string;
  region: string;
  dataStatus: PublishedTrailStatus;
  verificationStatus: PublishedVerificationStatus;
  totalMiles: number;
  sourceFeatureIds: string[];
  provenance: {
    publicationAlgorithmVersion: typeof PUBLICATION_ALGORITHM_VERSION;
    candidateTrailKey: string;
    parentInventoryItemKey: string;
    sourceProvider: string;
    sourceSegmentCandidateKeys: string[];
    publicationDecision: PublicationDecision;
    acceptedReconciliationLineage: Array<SegmentCandidate["sourceReconciliation"]>;
  };
};

export type VerifiedPublishedSegment = {
  id: string;
  productionSegmentKey: string;
  productionSegmentKeyVersion: typeof PRODUCTION_SEGMENT_KEY_VERSION;
  slug: string;
  trailId: string;
  trailName: string;
  segmentName: string;
  region: string;
  miles: number;
  completed: false;
  coordinates: LineString["coordinates"];
  dataStatus: PublishedTrailStatus;
  verificationStatus: PublishedVerificationStatus;
  sourceFeatureIds: string[];
  sourceProvider: string;
  provenance: {
    publicationAlgorithmVersion: typeof PUBLICATION_ALGORITHM_VERSION;
    candidateSegmentKey: string;
    candidateTrailKey: string;
    parentInventoryItemKey: string;
    startJunctionKey: string;
    endJunctionKey: string;
    segmentConstructionAlgorithmVersion: string;
    sourceSegmentArtifact: { generatedAt?: string; demoOnly?: boolean; algorithmVersion?: string };
    publicationDecision: PublicationDecision;
    trailPublicationDecision: PublicationDecision;
    upstreamDecisions: PublicationCandidateSegment["upstreamDecisions"];
    sourceSegmentCandidate: SegmentCandidate;
    acceptedReconciliationLineage: SegmentCandidate["sourceReconciliation"];
  };
};

export type PublicationDiagnostics = {
  candidateTrailCount: number;
  candidateSegmentCount: number;
  verifiedTrailCount: number;
  verifiedSegmentCount: number;
  rejectedTrailCount: number;
  rejectedSegmentCount: number;
  needsReviewTrailCount: number;
  needsReviewSegmentCount: number;
  unresolvedUpstreamDependencyCount: number;
  totalPublishedMiles: number;
  warnings: string[];
  integrityErrors: string[];
};

export type VerifiedNetworkArtifact = {
  metadata: {
    generatedAt: string;
    demoOnly: boolean;
    algorithmVersion: typeof PUBLICATION_ALGORITHM_VERSION;
    productionTrailKeyVersion: typeof PRODUCTION_TRAIL_KEY_VERSION;
    productionSegmentKeyVersion: typeof PRODUCTION_SEGMENT_KEY_VERSION;
    warning: string;
    segmentArtifactPath?: string;
    segmentDecisionsPath?: string;
    publicationDecisionsPath?: string;
  };
  candidateTrails: PublicationCandidateTrail[];
  candidateSegments: PublicationCandidateSegment[];
  trails: VerifiedPublishedTrail[];
  trailSegments: VerifiedPublishedSegment[];
  diagnostics: PublicationDiagnostics;
};



