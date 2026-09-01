import type { LineString, MultiLineString } from "geojson";

export const trailRegions = [
  "Franconia-Pemigewasset",
  "Presidential Range",
  "Carter-Moriah",
  "Sandwich Range",
  "Waterville Valley",
  "Other",
] as const;

export type TrailRegion = (typeof trailRegions)[number];

export type DataStatus = "demo" | "unverified" | "verified" | "retired";

export type VerificationStatus =
  | "demo"
  | "raw_source"
  | "needs_reconciliation"
  | "reconciled"
  | "human_verified"
  | "retired";

export type SourceProvider = "USFS" | "OSM" | "manual" | "demo" | "other";

export type SourceProvenance = {
  provider: SourceProvider;
  dataset: string;
  sourceFeatureIds: string[];
  sourceUrl?: string;
  importedAt?: string;
  manuallyModified: boolean;
  reviewedAt?: string;
  notes?: string;
};

export type Trail = {
  id: string;
  slug: string;
  name: string;
  region: TrailRegion;
  dataStatus: DataStatus;
  verificationStatus: VerificationStatus;
  provenance: SourceProvenance;
};

export type TrailSegment = {
  id: string;
  slug: string;
  trailId: string;
  trailSlug: string;
  trailName: string;
  segmentName: string;
  region: TrailRegion;
  miles: number;
  elevationGainFt?: number;
  completed: boolean;
  coordinates: [number, number][];
  dataStatus: DataStatus;
  verificationStatus: VerificationStatus;
  provenance: SourceProvenance;
};

export type TrailDetail = {
  trailId: string;
  trailSlug: string;
  name: string;
  region: TrailRegion;
  segments: TrailSegment[];
  totalMiles: number;
  segmentCount: number;
  completedMiles: number;
  completedSegments: number;
  completionPercent: number;
  bounds?: [west: number, south: number, east: number, north: number];
};

export type ReconciliationStatus =
  | "raw"
  | "normalized"
  | "needs_review"
  | "matched_candidate"
  | "rejected"
  | "promoted";

export type SourceTrailFeature = {
  id: string;
  sourceProvider: SourceProvider;
  sourceDataset: string;
  sourceFeatureId: string;
  sourceUrl: string;
  sourceQueryUrl?: string;
  sourceRecordRef?: string;
  importedAt: string;
  originalProperties: Record<string, unknown>;
  geometry: LineString | MultiLineString;
  regionHint?: string;
  reconciliationStatus: ReconciliationStatus;
  trailName?: string;
  segmentLength?: number;
  gisMiles?: number;
};
