import type { ActivityMatchingConfig } from "@/types/activity-matching";

export const DEFAULT_ACTIVITY_MATCHING_CONFIG: ActivityMatchingConfig = {
  candidateSearchRadiusMeters: 35,
  coverageSampleIntervalMeters: 20,
  matchedPointToleranceMeters: 25,
  endpointToleranceMeters: 35,
  minimumCoverageRatio: 0.55,
  strongCoverageRatio: 0.9,
  strongMaximumMedianDistanceMeters: 8,
  strongMaximumP95DistanceMeters: 18,
  maximumMedianDistanceMeters: 18,
  maximumP95DistanceMeters: 35,
  maximumGapRatio: 0.2,
  maximumInterpolatedActivityEdgeMeters: 120,
};

export const ACTIVITY_MATCHING_CONFIG_NOTES = "Initial local v1 GPS-evidence matching parameters. Coverage is measured from canonical segment samples, not by counting GPS points. Strong matches use stricter proximity and single-component continuity than review candidates.";