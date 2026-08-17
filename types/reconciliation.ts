import type { MultiLineString } from "geojson";

export type ChallengeReviewStatus =
  | "unreviewed"
  | "candidate_found"
  | "needs_review"
  | "accepted"
  | "rejected"
  | "unmatched";

export type ReconciliationStatus = ChallengeReviewStatus;

export type ChallengeEdition = {
  id: string;
  label: string;
  notes?: string;
};

export type ChallengeInventoryItem = {
  itemKey: string;
  displayName: string;
  normalizedName: string;
  regionHint?: string;
  editionLabel?: string;
  sourceNotes?: string;
  reviewStatus: ChallengeReviewStatus;
};

export type ReconciliationEvidence = {
  exactNormalizedName: boolean;
  normalizedSimilarity: number;
  tokenOverlap: number;
  regionHintCompatible?: boolean;
  sourceFeatureCount: number;
  sourceGisMiles: number;
  sourceFeatureIds: string[];
  reasons: string[];
};

export type SourceTrailGroup = {
  displayName: string;
  normalizedName: string;
  sourceFeatureCount: number;
  sourceFeatureIds: string[];
  totalGisMiles: number;
  bbox: [number, number, number, number];
  geometry: MultiLineString;
  sourceProvider: string;
  originalSourceNames: string[];
};

export type ReconciliationCandidate = {
  inventoryItemKey: string;
  sourceTrailNormalizedName: string;
  sourceTrailDisplayName: string;
  score: number;
  evidence: ReconciliationEvidence;
};

export type ReconciliationDecisionValue = "accepted" | "rejected" | "needs_review";

export type ReconciliationDecision = {
  inventoryItemKey: string;
  selectedCandidateNormalizedName?: string;
  selectedSourceFeatureIds: string[];
  decision: ReconciliationDecisionValue;
  reviewTimestamp: string;
  notes?: string;
};

export type ReconciliationItemResult = {
  item: ChallengeInventoryItem;
  candidates: ReconciliationCandidate[];
  status: "exact" | "ambiguous" | "unmatched" | "needs_review";
};

export type ReconciliationArtifact = {
  metadata: {
    generatedAt: string;
    demoOnly: boolean;
    sourceFeatureCount: number;
    sourceTrailGroupCount: number;
    warning: string;
    inventoryPath?: string;
  };
  summary: {
    inventoryItemCount: number;
    exactMatchCount: number;
    candidateFoundCount: number;
    unmatchedCount: number;
    ambiguousCount: number;
    sourceTrailGroupCount: number;
  };
  results: ReconciliationItemResult[];
  sourceTrailGroups: SourceTrailGroup[];
};
