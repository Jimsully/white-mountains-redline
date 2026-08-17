import type { SegmentConstructionTolerances } from "@/types/segment-construction";

export const DEFAULT_SEGMENT_CONSTRUCTION_TOLERANCES: SegmentConstructionTolerances = {
  endpointSnapToleranceMeters: 12,
  intersectionToleranceMeters: 8,
  junctionDeduplicationToleranceMeters: 1,
  sameTrailAutoConnectToleranceMeters: 1,
  geometryLengthEpsilonMeters: 0.25,
  minimumSegmentLengthMeters: 20,
};

export const SEGMENT_TOLERANCE_NOTES = "Initial conservative topology-review tolerances. Broad intersection tolerance is for topology checks; same-trail auto-connect, junction deduplication, and length conservation use tighter meter thresholds.";