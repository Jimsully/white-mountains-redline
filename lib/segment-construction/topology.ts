import crypto from "node:crypto";
import type { Position } from "geojson";
import { DEFAULT_SEGMENT_CONSTRUCTION_TOLERANCES } from "@/lib/segment-construction/config";
import { distanceMeters, endpointCoordinates, lineLengthMeters, metersToMiles, multiLineLengthMeters, pointMeasureOnLineMeters, segmentIntersection, sliceLineByMeasures, distancePointToSegmentMeters, round } from "@/lib/segment-construction/geometry";
import { SEGMENT_CONSTRUCTION_ALGORITHM_VERSION, type AcceptedTrailSource, type JunctionCandidate, type JunctionReason, type SegmentCandidate, type SegmentConstructionArtifact, type SegmentConstructionDiagnostics, type SegmentConstructionTolerances } from "@/types/segment-construction";

type Detection = {
  coordinate: Position;
  reason: JunctionReason;
  statusHint?: "needs_review";
  measuredDistanceMeters?: number;
  participatingTrailNormalizedNames: string[];
  participatingInventoryItemKeys: string[];
  sourceFeatureIds: string[];
};

type WorkingLine = {
  source: AcceptedTrailSource;
  componentIndex: number;
  sourceFeatureIds: string[];
  coordinates: Position[];
};

export function buildSegmentConstructionArtifact(args: {
  acceptedTrailSources: AcceptedTrailSource[];
  generatedAt: string;
  demoOnly: boolean;
  reconciliationArtifactPath?: string;
  decisionsPath?: string;
  tolerances?: SegmentConstructionTolerances;
}): SegmentConstructionArtifact {
  const tolerances = args.tolerances ?? DEFAULT_SEGMENT_CONSTRUCTION_TOLERANCES;
  const workingLines = buildWorkingLines(args.acceptedTrailSources);
  const detections = detectJunctions(args.acceptedTrailSources, workingLines, tolerances);
  const junctionCandidates = clusterDetections(detections, tolerances);
  const segmentCandidates = splitSegments(workingLines, junctionCandidates, tolerances);
  const diagnostics = summarize(args.acceptedTrailSources, workingLines, junctionCandidates, segmentCandidates, detections);

  return {
    metadata: {
      generatedAt: args.generatedAt,
      demoOnly: args.demoOnly,
      algorithmVersion: SEGMENT_CONSTRUCTION_ALGORITHM_VERSION,
      warning: args.demoOnly
        ? "DEMO DATA ONLY. Proposed topology candidates only; not navigation, not segment verified, and not published trail_segments."
        : "Private/local segment construction artifact. Do not commit unless it is demo/test data.",
      reconciliationArtifactPath: args.reconciliationArtifactPath,
      decisionsPath: args.decisionsPath,
    },
    tolerances,
    acceptedTrailSources: args.acceptedTrailSources,
    junctionCandidates,
    segmentCandidates,
    diagnostics,
  };
}

function buildWorkingLines(sources: AcceptedTrailSource[]): WorkingLine[] {
  return sources.flatMap((source) => source.geometry.coordinates.map((coordinates, componentIndex) => ({
    source,
    componentIndex,
    sourceFeatureIds: [source.sourceFeatureIds[componentIndex] ?? source.sourceFeatureIds[0]].filter(Boolean),
    coordinates,
  }))).filter((line) => line.coordinates.length >= 2);
}

function detectJunctions(sources: AcceptedTrailSource[], lines: WorkingLine[], tolerances: SegmentConstructionTolerances): Detection[] {
  const detections: Detection[] = [];
  for (const source of sources) {
    for (const endpoint of endpointCoordinates(source.geometry)) {
      detections.push(detection(endpoint.coordinate, "trail_endpoint", [source]));
    }
  }

  for (let aIndex = 0; aIndex < lines.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < lines.length; bIndex += 1) {
      const a = lines[aIndex], b = lines[bIndex];
      if (a.source.itemKey === b.source.itemKey) continue;
      for (let ai = 1; ai < a.coordinates.length; ai += 1) {
        for (let bi = 1; bi < b.coordinates.length; bi += 1) {
          const point = segmentIntersection(a.coordinates[ai - 1], a.coordinates[ai], b.coordinates[bi - 1], b.coordinates[bi]);
          if (point) detections.push(detection(point, "cross_trail_intersection", [a.source, b.source], [...a.sourceFeatureIds, ...b.sourceFeatureIds]));
        }
      }
    }
  }

  for (let aIndex = 0; aIndex < lines.length; aIndex += 1) {
    for (let bIndex = 0; bIndex < lines.length; bIndex += 1) {
      if (aIndex === bIndex) continue;
      const a = lines[aIndex], b = lines[bIndex];
      if (a.source.itemKey === b.source.itemKey) continue;
      for (const endpoint of [a.coordinates[0], a.coordinates[a.coordinates.length - 1]]) {
        const closest = closestPointOnLine(endpoint, b.coordinates);
        if (closest && closest.distanceMeters > 0.05 && closest.distanceMeters <= tolerances.endpointSnapToleranceMeters) {
          detections.push(detection(closest.closest, "ambiguous_near_intersection", [a.source, b.source], [...a.sourceFeatureIds, ...b.sourceFeatureIds], closest.distanceMeters, "needs_review"));
        }
      }
    }
  }

  return detections;
}

function clusterDetections(detections: Detection[], tolerances: SegmentConstructionTolerances): JunctionCandidate[] {
  const clusters: Detection[][] = [];
  for (const item of detections) {
    const existing = clusters.find((cluster) => cluster.some((candidate) => distanceMeters(candidate.coordinate, item.coordinate) <= tolerances.intersectionToleranceMeters));
    if (existing) existing.push(item);
    else clusters.push([item]);
  }

  return clusters.map((cluster) => {
    const coordinate = representativePoint(cluster.map((item) => item.coordinate));
    const reasons = unique(cluster.map((item) => item.reason)).sort();
    const participatingTrailNormalizedNames = unique(cluster.flatMap((item) => item.participatingTrailNormalizedNames)).sort();
    const participatingInventoryItemKeys = unique(cluster.flatMap((item) => item.participatingInventoryItemKeys)).sort();
    const sourceFeatureIds = unique(cluster.flatMap((item) => item.sourceFeatureIds)).sort(naturalSort);
    const maximumClusterSpreadMeters = Math.max(0, ...cluster.map((item) => distanceMeters(coordinate, item.coordinate)));
    const reviewStatus = cluster.some((item) => item.statusHint === "needs_review") || maximumClusterSpreadMeters > tolerances.intersectionToleranceMeters ? "needs_review" : "proposed";
    return {
      key: stableKey("junction", [SEGMENT_CONSTRUCTION_ALGORITHM_VERSION, ...participatingInventoryItemKeys, quantizeCoordinate(coordinate)].join("|")),
      coordinate,
      reasons,
      reviewStatus,
      participatingTrailNormalizedNames,
      participatingInventoryItemKeys,
      sourceFeatureIds,
      rawDetectedPoints: cluster.map((item) => item.coordinate),
      maximumClusterSpreadMeters: round(maximumClusterSpreadMeters, 3),
      evidence: cluster.map((item) => ({
        reason: item.reason,
        measuredDistanceMeters: item.measuredDistanceMeters === undefined ? undefined : round(item.measuredDistanceMeters, 3),
        participatingTrailNormalizedNames: item.participatingTrailNormalizedNames,
        participatingInventoryItemKeys: item.participatingInventoryItemKeys,
        sourceFeatureIds: item.sourceFeatureIds,
      })),
    } satisfies JunctionCandidate;
  }).sort((a, b) => a.key.localeCompare(b.key));
}

function splitSegments(lines: WorkingLine[], junctions: JunctionCandidate[], tolerances: SegmentConstructionTolerances): SegmentCandidate[] {
  const segments: SegmentCandidate[] = [];
  for (const line of lines) {
    const splitPoints = junctions
      .map((junction) => ({ junction, measure: pointMeasureOnLineMeters(junction.coordinate, line.coordinates, tolerances.intersectionToleranceMeters) }))
      .filter((item): item is { junction: JunctionCandidate; measure: { distanceMeters: number; measureMeters: number; coordinate: Position } } => Boolean(item.measure))
      .sort((a, b) => a.measure.measureMeters - b.measure.measureMeters);
    const uniqueSplits = dedupeMeasures(splitPoints);
    for (let index = 1; index < uniqueSplits.length; index += 1) {
      const start = uniqueSplits[index - 1];
      const end = uniqueSplits[index];
      const coordinates = sliceLineByMeasures(line.coordinates, start.measure.measureMeters, end.measure.measureMeters);
      const calculatedMeters = lineLengthMeters(coordinates);
      if (!Number.isFinite(calculatedMeters) || calculatedMeters <= 0.01 || coordinates.length < 2) continue;
      const warningFlags = calculatedMeters < tolerances.minimumSegmentLengthMeters ? ["very_short_segment"] : [];
      segments.push({
        key: stableKey("segment", [SEGMENT_CONSTRUCTION_ALGORITHM_VERSION, line.source.itemKey, line.componentIndex, start.junction.key, end.junction.key].join("|")),
        parentInventoryItemKey: line.source.itemKey,
        trailDisplayName: line.source.trailDisplayName,
        trailNormalizedName: line.source.trailNormalizedName,
        startJunctionKey: start.junction.key,
        endJunctionKey: end.junction.key,
        geometry: { type: "LineString", coordinates },
        calculatedMiles: metersToMiles(calculatedMeters),
        calculatedMeters: round(calculatedMeters, 3),
        sourceFeatureIds: line.sourceFeatureIds.length ? line.sourceFeatureIds : line.source.sourceFeatureIds,
        sourceProvider: line.source.sourceProvider,
        sourceReconciliation: {
          selectedCandidateNormalizedName: line.source.reconciliation.selectedCandidateNormalizedName,
          evidenceFeatureIds: line.source.reconciliation.evidence.sourceFeatureIds,
        },
        geometryModification: {
          splitFromAcceptedSource: true,
          snappedToJunction: start.measure.distanceMeters > 0.05 || end.measure.distanceMeters > 0.05,
          componentIndex: line.componentIndex,
          startMeasureMeters: round(start.measure.measureMeters, 3),
          endMeasureMeters: round(end.measure.measureMeters, 3),
        },
        reviewStatus: warningFlags.length ? "needs_review" : "proposed",
        warningFlags,
      });
    }
  }
  return segments.sort((a, b) => a.key.localeCompare(b.key));
}

function summarize(sources: AcceptedTrailSource[], lines: WorkingLine[], junctions: JunctionCandidate[], segments: SegmentCandidate[], detections: Detection[]): SegmentConstructionDiagnostics {
  const inputMeters = sources.reduce((sum, source) => sum + multiLineLengthMeters(source.geometry), 0);
  const outputMeters = segments.reduce((sum, segment) => sum + segment.calculatedMeters, 0);
  const duplicateJunctionKeys = duplicateKeys(junctions.map((item) => item.key));
  const duplicateSegmentKeys = duplicateKeys(segments.map((item) => item.key));
  const warnings = [
    ...duplicateJunctionKeys.map((key) => `duplicate_junction_key:${key}`),
    ...duplicateSegmentKeys.map((key) => `duplicate_segment_key:${key}`),
  ];
  return {
    acceptedTrailSourceCount: sources.length,
    junctionCandidateCount: junctions.length,
    exactIntersectionCount: detections.filter((item) => item.reason === "cross_trail_intersection").length,
    nearIntersectionWarningCount: detections.filter((item) => item.reason === "ambiguous_near_intersection").length,
    segmentCandidateCount: segments.length,
    shortSegmentWarningCount: segments.filter((item) => item.warningFlags.includes("very_short_segment")).length,
    disconnectedComponentCount: sources.reduce((sum, source) => sum + Math.max(0, source.geometry.coordinates.length - 1), 0),
    sourceFeatureBoundaryCount: lines.length - sources.length,
    inputGeometryMiles: metersToMiles(inputMeters),
    outputSegmentMiles: metersToMiles(outputMeters),
    lengthDeltaMiles: round(metersToMiles(outputMeters - inputMeters), 6),
    warnings,
  };
}

function detection(coordinate: Position, reason: JunctionReason, sources: AcceptedTrailSource[], sourceFeatureIds = sources.flatMap((source) => source.sourceFeatureIds), measuredDistanceMeters?: number, statusHint?: "needs_review"): Detection {
  return {
    coordinate,
    reason,
    statusHint,
    measuredDistanceMeters,
    participatingTrailNormalizedNames: unique(sources.map((source) => source.trailNormalizedName)).sort(),
    participatingInventoryItemKeys: unique(sources.map((source) => source.itemKey)).sort(),
    sourceFeatureIds: unique(sourceFeatureIds).sort(naturalSort),
  };
}

function closestPointOnLine(point: Position, coordinates: Position[]) {
  let best: { distanceMeters: number; closest: Position } | undefined;
  for (let index = 1; index < coordinates.length; index += 1) {
    const candidate = distancePointToSegmentMeters(point, coordinates[index - 1], coordinates[index]);
    if (!best || candidate.distanceMeters < best.distanceMeters) best = { distanceMeters: candidate.distanceMeters, closest: candidate.closest };
  }
  return best;
}

function dedupeMeasures(items: Array<{ junction: JunctionCandidate; measure: { distanceMeters: number; measureMeters: number; coordinate: Position } }>) {
  const output: typeof items = [];
  for (const item of items) {
    if (!output.some((existing) => Math.abs(existing.measure.measureMeters - item.measure.measureMeters) <= 0.05)) output.push(item);
  }
  return output;
}

function representativePoint(points: Position[]): Position {
  return [round(points.reduce((sum, point) => sum + point[0], 0) / points.length, 7), round(points.reduce((sum, point) => sum + point[1], 0) / points.length, 7)];
}

function quantizeCoordinate(coordinate: Position) {
  return `${round(coordinate[0], 5)},${round(coordinate[1], 5)}`;
}

function stableKey(prefix: string, input: string) {
  return `${prefix}_${crypto.createHash("sha1").update(input).digest("hex").slice(0, 16)}`;
}

function unique<T>(items: T[]) { return Array.from(new Set(items)); }
function naturalSort(a: string, b: string) { return a.localeCompare(b, undefined, { numeric: true }); }
function duplicateKeys(keys: string[]) { const seen = new Set<string>(); return unique(keys.filter((key) => seen.size === seen.add(key).size)); }