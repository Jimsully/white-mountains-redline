import type { SegmentConstructionTolerances } from "@/types/segment-construction";

export const DEFAULT_SEGMENT_CONSTRUCTION_TOLERANCES: SegmentConstructionTolerances = {
  endpointSnapToleranceMeters: 12,
  intersectionToleranceMeters: 8,
  minimumSegmentLengthMeters: 20,
};

export const SEGMENT_TOLERANCE_NOTES = "Initial conservative topology-review tolerances. They are tuning parameters, not universal truths.";