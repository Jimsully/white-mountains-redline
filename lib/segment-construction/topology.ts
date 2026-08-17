import crypto from "node:crypto";
import type { Position } from "geojson";
import { DEFAULT_SEGMENT_CONSTRUCTION_TOLERANCES } from "@/lib/segment-construction/config";
import { distanceMeters, distancePointToSegmentMeters, lineLengthMeters, metersToMiles, multiLineLengthMeters, pointMeasureOnLineMeters, round, segmentIntersection, sliceLineByMeasures } from "@/lib/segment-construction/geometry";
import { SEGMENT_CONSTRUCTION_ALGORITHM_VERSION, type AcceptedTrailSource, type JunctionCandidate, type JunctionReason, type SegmentCandidate, type SegmentConstructionArtifact, type SegmentConstructionDiagnostics, type SegmentConstructionTolerances, type SourceFeatureProvenancePrecision } from "@/types/segment-construction";

type Detection = { coordinate: Position; reason: JunctionReason; statusHint?: "needs_review"; measuredDistanceMeters?: number; participatingTrailNormalizedNames: string[]; participatingInventoryItemKeys: string[]; sourceFeatureIds: string[] };
type RawComponent = { source: AcceptedTrailSource; componentIndex: number; coordinates: Position[] };
type WorkingLine = { source: AcceptedTrailSource; componentIndex: number; componentKey: string; sourceFeatureIds: string[]; provenancePrecision: SourceFeatureProvenancePrecision; coordinates: Position[]; disconnectedSource: boolean };
type ComponentConnection = { a: RawComponent; b: RawComponent; distanceMeters: number };
type PreparedTopology = { lines: WorkingLine[]; disconnectedComponentCount: number; coarseSourceComponentBoundaryCount: number; sameTrailNearConnectionWarningCount: number; sameTrailSourceBoundarySnapCount: number; sameTrailSourceBoundarySnapMeters: number; maxSameTrailSourceBoundarySnapMeters: number; integrityWarnings: string[] };

export function buildSegmentConstructionArtifact(args: { acceptedTrailSources: AcceptedTrailSource[]; generatedAt: string; demoOnly: boolean; reconciliationArtifactPath?: string; decisionsPath?: string; tolerances?: SegmentConstructionTolerances }): SegmentConstructionArtifact {
  const tolerances = args.tolerances ?? DEFAULT_SEGMENT_CONSTRUCTION_TOLERANCES;
  const prepared = prepareWorkingLines(args.acceptedTrailSources, tolerances);
  const detections = detectJunctions(prepared.lines, tolerances);
  const junctionCandidates = clusterDetections(detections, tolerances);
  const segmentCandidates = splitSegments(prepared.lines, junctionCandidates, tolerances);
  const diagnostics = summarize(args.acceptedTrailSources, prepared, junctionCandidates, segmentCandidates, detections, tolerances);
  diagnostics.integrityWarnings.push(...prepared.integrityWarnings);
  diagnostics.integrityErrors.push(...validateTopology(args.acceptedTrailSources, prepared.lines, junctionCandidates, segmentCandidates, tolerances, diagnostics));
  if (diagnostics.integrityErrors.length) throw new Error(`Segment construction integrity failed:\n${diagnostics.integrityErrors.join("\n")}`);

  return {
    metadata: { generatedAt: args.generatedAt, demoOnly: args.demoOnly, algorithmVersion: SEGMENT_CONSTRUCTION_ALGORITHM_VERSION, warning: args.demoOnly ? "DEMO DATA ONLY. Proposed topology candidates only; not navigation, not segment verified, and not published trail_segments." : "Private/local segment construction artifact. Do not commit unless it is demo/test data.", reconciliationArtifactPath: args.reconciliationArtifactPath, decisionsPath: args.decisionsPath },
    tolerances,
    acceptedTrailSources: args.acceptedTrailSources,
    junctionCandidates,
    segmentCandidates,
    diagnostics,
  };
}

function prepareWorkingLines(sources: AcceptedTrailSource[], tolerances: SegmentConstructionTolerances): PreparedTopology {
  const lines: WorkingLine[] = [];
  let disconnectedComponentCount = 0;
  let coarseSourceComponentBoundaryCount = 0;
  let sameTrailNearConnectionWarningCount = 0;
  let sameTrailSourceBoundarySnapCount = 0;
  let sameTrailSourceBoundarySnapMeters = 0;
  let maxSameTrailSourceBoundarySnapMeters = 0;
  const integrityWarnings: string[] = [];

  for (const source of sources) {
    const raw = source.geometry.coordinates.map((coordinates, componentIndex) => ({ source, componentIndex, coordinates })).filter((item) => item.coordinates.length >= 2);
    coarseSourceComponentBoundaryCount += Math.max(0, raw.length - 1);

    const nearConnections = sameTrailNearConnections(raw, tolerances.sameTrailAutoConnectToleranceMeters, tolerances.intersectionToleranceMeters);
    sameTrailNearConnectionWarningCount += nearConnections.length;
    integrityWarnings.push(...nearConnections.map((item) => `same_trail_component_near_connection:${source.itemKey}:${item.a.componentIndex}-${item.b.componentIndex}:${round(item.distanceMeters, 3)}m`));

    const groups = connectedComponentGroups(raw, tolerances.sameTrailAutoConnectToleranceMeters);
    disconnectedComponentCount += Math.max(0, groups.length - 1);
    groups.forEach((group, groupIndex) => {
      const merged = mergeConnectedGroup(group, tolerances.sameTrailAutoConnectToleranceMeters);
      if (merged.warning) integrityWarnings.push(`${source.itemKey}:${merged.warning}`);
      sameTrailSourceBoundarySnapCount += merged.snapDistancesMeters.length;
      const snapMeters = merged.snapDistancesMeters.reduce((sum, value) => sum + value, 0);
      sameTrailSourceBoundarySnapMeters += snapMeters;
      maxSameTrailSourceBoundarySnapMeters = Math.max(maxSameTrailSourceBoundarySnapMeters, ...merged.snapDistancesMeters, maxSameTrailSourceBoundarySnapMeters);
      integrityWarnings.push(...merged.snapDistancesMeters.map((distance) => `same_trail_source_boundary_snap:${source.itemKey}:${round(distance, 3)}m`));
      const fingerprints = group.map((item) => geometryFingerprint(item.coordinates)).sort();
      const componentKey = stableKey("component", [SEGMENT_CONSTRUCTION_ALGORITHM_VERSION, source.itemKey, ...fingerprints].join("|"));
      lines.push({ source, componentIndex: groupIndex, componentKey, sourceFeatureIds: source.sourceFeatureIds, provenancePrecision: "coarse", coordinates: merged.coordinates, disconnectedSource: groups.length > 1 });
    });
  }

  return { lines, disconnectedComponentCount, coarseSourceComponentBoundaryCount, sameTrailNearConnectionWarningCount, sameTrailSourceBoundarySnapCount, sameTrailSourceBoundarySnapMeters: round(sameTrailSourceBoundarySnapMeters, 3), maxSameTrailSourceBoundarySnapMeters: round(maxSameTrailSourceBoundarySnapMeters, 3), integrityWarnings };
}

function connectedComponentGroups(components: RawComponent[], toleranceMeters: number): RawComponent[][] {
  const visited = new Set<number>();
  const groups: RawComponent[][] = [];
  for (let index = 0; index < components.length; index += 1) {
    if (visited.has(index)) continue;
    const queue = [index];
    visited.add(index);
    const group: RawComponent[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      group.push(components[current]);
      for (let other = 0; other < components.length; other += 1) {
        if (!visited.has(other) && endpointConnection(components[current].coordinates, components[other].coordinates).distanceMeters <= toleranceMeters) {
          visited.add(other);
          queue.push(other);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

function sameTrailNearConnections(components: RawComponent[], autoConnectToleranceMeters: number, reviewToleranceMeters: number): ComponentConnection[] {
  const warnings: ComponentConnection[] = [];
  for (let a = 0; a < components.length; a += 1) {
    for (let b = a + 1; b < components.length; b += 1) {
      const connection = endpointConnection(components[a].coordinates, components[b].coordinates);
      if (connection.distanceMeters > autoConnectToleranceMeters && connection.distanceMeters <= reviewToleranceMeters) warnings.push({ a: components[a], b: components[b], distanceMeters: connection.distanceMeters });
    }
  }
  return warnings;
}

function mergeConnectedGroup(group: RawComponent[], toleranceMeters: number): { coordinates: Position[]; snapDistancesMeters: number[]; warning?: string } {
  if (group.length === 1) return { coordinates: group[0].coordinates, snapDistancesMeters: [] };
  const unused = new Set(group.map((_, index) => index));
  const ordered: Position[] = [...group[0].coordinates];
  const snapDistancesMeters: number[] = [];
  unused.delete(0);
  let extended = true;
  while (unused.size && extended) {
    extended = false;
    for (const index of Array.from(unused)) {
      const result = tryAppendOrPrepend(ordered, group[index].coordinates, toleranceMeters);
      if (result) {
        ordered.splice(0, ordered.length, ...result.coordinates);
        if (result.snapDistanceMeters > 0.01) snapDistancesMeters.push(result.snapDistanceMeters);
        unused.delete(index);
        extended = true;
      }
    }
  }
  if (unused.size) return { coordinates: [...ordered, ...Array.from(unused).flatMap((index) => group[index].coordinates)], snapDistancesMeters, warning: "connected_component_geometry_could_not_be_ordered_confidently" };
  return { coordinates: ordered, snapDistancesMeters };
}

function detectJunctions(lines: WorkingLine[], tolerances: SegmentConstructionTolerances): Detection[] {
  const detections: Detection[] = [];
  for (const line of lines) {
    detections.push(detection(line.coordinates[0], "trail_endpoint", [line], line.sourceFeatureIds));
    detections.push(detection(line.coordinates[line.coordinates.length - 1], "trail_endpoint", [line], line.sourceFeatureIds));
  }
  for (let aIndex = 0; aIndex < lines.length; aIndex += 1) for (let bIndex = aIndex + 1; bIndex < lines.length; bIndex += 1) {
    const a = lines[aIndex], b = lines[bIndex];
    if (a.source.itemKey === b.source.itemKey) continue;
    for (let ai = 1; ai < a.coordinates.length; ai += 1) for (let bi = 1; bi < b.coordinates.length; bi += 1) {
      const point = segmentIntersection(a.coordinates[ai - 1], a.coordinates[ai], b.coordinates[bi - 1], b.coordinates[bi]);
      if (point) detections.push(detection(point, "cross_trail_intersection", [a, b], [...a.sourceFeatureIds, ...b.sourceFeatureIds]));
    }
  }
  for (let aIndex = 0; aIndex < lines.length; aIndex += 1) for (let bIndex = 0; bIndex < lines.length; bIndex += 1) {
    if (aIndex === bIndex) continue;
    const a = lines[aIndex], b = lines[bIndex];
    if (a.source.itemKey === b.source.itemKey) continue;
    for (const endpoint of [a.coordinates[0], a.coordinates[a.coordinates.length - 1]]) {
      const closest = closestPointOnLine(endpoint, b.coordinates);
      if (closest && closest.distanceMeters > 0.05 && closest.distanceMeters <= tolerances.endpointSnapToleranceMeters) detections.push(detection(closest.closest, "ambiguous_near_intersection", [a, b], [...a.sourceFeatureIds, ...b.sourceFeatureIds], closest.distanceMeters, "needs_review"));
    }
  }
  return detections;
}

function clusterDetections(detections: Detection[], tolerances: SegmentConstructionTolerances): JunctionCandidate[] {
  const clusters: Detection[][] = [];
  for (const item of detections) {
    const tolerance = item.reason === "ambiguous_near_intersection" ? tolerances.intersectionToleranceMeters : tolerances.junctionDeduplicationToleranceMeters;
    const itemIsAmbiguous = item.reason === "ambiguous_near_intersection";
    const existing = clusters.find((cluster) => cluster.some((candidate) => candidate.reason === "ambiguous_near_intersection") === itemIsAmbiguous && cluster.some((candidate) => distanceMeters(candidate.coordinate, item.coordinate) <= tolerance));
    if (existing) existing.push(item); else clusters.push([item]);
  }
  return clusters.map((cluster) => {
    const coordinate = representativePoint(cluster.map((item) => item.coordinate));
    const reasons = unique(cluster.map((item) => item.reason)).sort();
    const participatingTrailNormalizedNames = unique(cluster.flatMap((item) => item.participatingTrailNormalizedNames)).sort();
    const participatingInventoryItemKeys = unique(cluster.flatMap((item) => item.participatingInventoryItemKeys)).sort();
    const sourceFeatureIds = unique(cluster.flatMap((item) => item.sourceFeatureIds)).sort(naturalSort);
    const maximumClusterSpreadMeters = maximumPairwiseDistance(cluster.map((item) => item.coordinate));
    const clusterTolerance = reasons.includes("ambiguous_near_intersection") ? tolerances.intersectionToleranceMeters : tolerances.junctionDeduplicationToleranceMeters;
    const reviewStatus = cluster.some((item) => item.statusHint === "needs_review") || maximumClusterSpreadMeters > clusterTolerance ? "needs_review" : "proposed";
    return { key: stableKey("junction", [SEGMENT_CONSTRUCTION_ALGORITHM_VERSION, ...participatingInventoryItemKeys, ...reasons, quantizeCoordinate(coordinate)].join("|")), coordinate, reasons, reviewStatus, participatingTrailNormalizedNames, participatingInventoryItemKeys, sourceFeatureIds, rawDetectedPoints: cluster.map((item) => item.coordinate), maximumClusterSpreadMeters: round(maximumClusterSpreadMeters, 3), evidence: cluster.map((item) => ({ reason: item.reason, measuredDistanceMeters: item.measuredDistanceMeters === undefined ? undefined : round(item.measuredDistanceMeters, 3), participatingTrailNormalizedNames: item.participatingTrailNormalizedNames, participatingInventoryItemKeys: item.participatingInventoryItemKeys, sourceFeatureIds: item.sourceFeatureIds })) } satisfies JunctionCandidate;
  }).sort((a, b) => a.key.localeCompare(b.key));
}

function splitSegments(lines: WorkingLine[], junctions: JunctionCandidate[], tolerances: SegmentConstructionTolerances): SegmentCandidate[] {
  const eligibleJunctions = junctions.filter((junction) => junction.reviewStatus !== "needs_review" && !junction.reasons.includes("ambiguous_near_intersection"));
  const segments: SegmentCandidate[] = [];
  for (const line of lines) {
    const lineLength = lineLengthMeters(line.coordinates);
    const endpointSplits = [
      endpointSplit(line, junctions, 0, 0, tolerances),
      endpointSplit(line, junctions, line.coordinates.length - 1, lineLength, tolerances),
    ].filter((item): item is { junction: JunctionCandidate; measure: { distanceMeters: number; measureMeters: number; coordinate: Position } } => Boolean(item));
    const interiorSplits = eligibleJunctions.map((junction) => ({ junction, measure: pointMeasureOnLineMeters(junction.coordinate, line.coordinates, tolerances.intersectionToleranceMeters) })).filter((item): item is { junction: JunctionCandidate; measure: { distanceMeters: number; measureMeters: number; coordinate: Position } } => Boolean(item.measure)).filter((item) => item.measure.measureMeters > 0.05 && item.measure.measureMeters < lineLength - 0.05);
    const splitPoints = [...endpointSplits, ...interiorSplits].sort((a, b) => a.measure.measureMeters - b.measure.measureMeters);
    const uniqueSplits = dedupeMeasures(splitPoints);
    for (let index = 1; index < uniqueSplits.length; index += 1) {
      const start = uniqueSplits[index - 1], end = uniqueSplits[index];
      const coordinates = sliceLineByMeasures(line.coordinates, start.measure.measureMeters, end.measure.measureMeters);
      const calculatedMeters = lineLengthMeters(coordinates);
      if (!Number.isFinite(calculatedMeters) || calculatedMeters <= 0.01 || coordinates.length < 2) continue;
      const warningFlags = [...(calculatedMeters < tolerances.minimumSegmentLengthMeters ? ["very_short_segment"] : []), ...(line.disconnectedSource ? ["disconnected_component"] : [])];
      const orderedJunctionKeys = [start.junction.key, end.junction.key].sort().join("|");
      segments.push({ key: stableKey("segment", [SEGMENT_CONSTRUCTION_ALGORITHM_VERSION, line.source.itemKey, line.componentKey, orderedJunctionKeys, geometryFingerprint(coordinates)].join("|")), parentInventoryItemKey: line.source.itemKey, trailDisplayName: line.source.trailDisplayName, trailNormalizedName: line.source.trailNormalizedName, startJunctionKey: start.junction.key, endJunctionKey: end.junction.key, geometry: { type: "LineString", coordinates }, calculatedMiles: metersToMiles(calculatedMeters), calculatedMeters: round(calculatedMeters, 3), sourceFeatureIds: line.sourceFeatureIds, sourceProvider: line.source.sourceProvider, sourceReconciliation: { selectedCandidateNormalizedName: line.source.reconciliation.selectedCandidateNormalizedName, evidenceFeatureIds: line.source.reconciliation.evidence.sourceFeatureIds }, geometryModification: { splitFromAcceptedSource: true, snappedToJunction: start.measure.distanceMeters > 0.05 || end.measure.distanceMeters > 0.05, componentIndex: line.componentIndex, sourceComponentKey: line.componentKey, sourceFeatureProvenancePrecision: line.provenancePrecision, startMeasureMeters: round(start.measure.measureMeters, 3), endMeasureMeters: round(end.measure.measureMeters, 3) }, reviewStatus: warningFlags.includes("very_short_segment") ? "needs_review" : "proposed", warningFlags });
    }
  }
  return segments.sort((a, b) => a.key.localeCompare(b.key));
}

function endpointSplit(line: WorkingLine, junctions: JunctionCandidate[], coordinateIndex: number, measureMeters: number, tolerances: SegmentConstructionTolerances) {
  const coordinate = line.coordinates[coordinateIndex];
  const candidates = junctions
    .filter((junction) => junction.reasons.includes("trail_endpoint") && junction.participatingInventoryItemKeys.includes(line.source.itemKey))
    .map((junction) => ({ junction, distanceMeters: distanceMeters(junction.coordinate, coordinate) }))
    .filter((item) => item.distanceMeters <= Math.max(tolerances.endpointSnapToleranceMeters, tolerances.intersectionToleranceMeters))
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
  const closest = candidates[0];
  return closest ? { junction: closest.junction, measure: { distanceMeters: closest.distanceMeters, measureMeters, coordinate } } : undefined;
}

function summarize(sources: AcceptedTrailSource[], prepared: PreparedTopology, junctions: JunctionCandidate[], segments: SegmentCandidate[], detections: Detection[], tolerances: SegmentConstructionTolerances): SegmentConstructionDiagnostics {
  const inputMeters = sources.reduce((sum, source) => sum + multiLineLengthMeters(source.geometry), 0);
  const outputMeters = segments.reduce((sum, segment) => sum + segment.calculatedMeters, 0);
  const lengthDeltaMeters = round(outputMeters - inputMeters, 3);
  return { acceptedTrailSourceCount: sources.length, junctionCandidateCount: junctions.length, exactIntersectionCount: junctions.filter((item) => item.reasons.includes("cross_trail_intersection")).length, nearIntersectionWarningCount: detections.filter((item) => item.reason === "ambiguous_near_intersection").length, sameTrailNearConnectionWarningCount: prepared.sameTrailNearConnectionWarningCount, segmentCandidateCount: segments.length, shortSegmentWarningCount: segments.filter((item) => item.warningFlags.includes("very_short_segment")).length, disconnectedComponentCount: prepared.disconnectedComponentCount, coarseSourceComponentBoundaryCount: prepared.coarseSourceComponentBoundaryCount, excessiveSpreadJunctionCount: junctions.filter((junction) => junction.maximumClusterSpreadMeters > (junction.reasons.includes("ambiguous_near_intersection") ? tolerances.intersectionToleranceMeters : tolerances.junctionDeduplicationToleranceMeters)).length, sameTrailSourceBoundarySnapCount: prepared.sameTrailSourceBoundarySnapCount, sameTrailSourceBoundarySnapMeters: prepared.sameTrailSourceBoundarySnapMeters, maxSameTrailSourceBoundarySnapMeters: prepared.maxSameTrailSourceBoundarySnapMeters, inputGeometryMeters: round(inputMeters, 3), outputGeometryMeters: round(outputMeters, 3), lengthDeltaMeters, inputGeometryMiles: metersToMiles(inputMeters), outputSegmentMiles: metersToMiles(outputMeters), lengthDeltaMiles: metersToMiles(outputMeters - inputMeters), warnings: junctions.filter((junction) => junction.maximumClusterSpreadMeters > (junction.reasons.includes("ambiguous_near_intersection") ? tolerances.intersectionToleranceMeters : tolerances.junctionDeduplicationToleranceMeters)).map((junction) => `excessive_spread_junction:${junction.key}`), integrityWarnings: [], integrityErrors: [] };
}

function validateTopology(sources: AcceptedTrailSource[], lines: WorkingLine[], junctions: JunctionCandidate[], segments: SegmentCandidate[], tolerances: SegmentConstructionTolerances, diagnostics: SegmentConstructionDiagnostics) {
  const errors: string[] = [];
  const junctionKeys = new Set(junctions.map((junction) => junction.key));
  for (const key of duplicateKeys(junctions.map((junction) => junction.key))) errors.push(`duplicate_junction_key:${key}`);
  for (const key of duplicateKeys(segments.map((segment) => segment.key))) errors.push(`duplicate_segment_key:${key}`);
  const acceptedSourceIds = new Set(sources.flatMap((source) => source.sourceFeatureIds));
  const eligible = junctions.filter((junction) => junction.reviewStatus !== "needs_review" && !junction.reasons.includes("ambiguous_near_intersection"));
  for (const segment of segments) {
    if (!junctionKeys.has(segment.startJunctionKey) || !junctionKeys.has(segment.endJunctionKey)) errors.push(`segment_missing_junction:${segment.key}`);
    const start = junctions.find((junction) => junction.key === segment.startJunctionKey), end = junctions.find((junction) => junction.key === segment.endJunctionKey);
    if (start && distanceMeters(segment.geometry.coordinates[0], start.coordinate) > tolerances.intersectionToleranceMeters) errors.push(`segment_start_not_at_junction:${segment.key}`);
    if (end && distanceMeters(segment.geometry.coordinates[segment.geometry.coordinates.length - 1], end.coordinate) > tolerances.intersectionToleranceMeters) errors.push(`segment_end_not_at_junction:${segment.key}`);
    if (!Number.isFinite(segment.calculatedMeters) || segment.calculatedMeters <= 0) errors.push(`segment_non_positive_length:${segment.key}`);
    if (segment.sourceFeatureIds.some((id) => !acceptedSourceIds.has(id))) errors.push(`segment_untraceable_source_id:${segment.key}`);
    for (const junction of eligible) {
      if (junction.key === segment.startJunctionKey || junction.key === segment.endJunctionKey) continue;
      const measure = pointMeasureOnLineMeters(junction.coordinate, segment.geometry.coordinates, tolerances.intersectionToleranceMeters);
      if (measure && measure.measureMeters > tolerances.intersectionToleranceMeters && measure.measureMeters < segment.calculatedMeters - tolerances.intersectionToleranceMeters) errors.push(`segment_contains_unsplit_junction:${segment.key}:${junction.key}`);
    }
  }
  for (const line of lines) if (!segments.some((segment) => segment.geometryModification.sourceComponentKey === line.componentKey)) errors.push(`input_component_not_accounted_for:${line.componentKey}`);
  const allowedLengthDeltaMeters = tolerances.geometryLengthEpsilonMeters + diagnostics.sameTrailSourceBoundarySnapMeters;
  if (Math.abs(diagnostics.lengthDeltaMeters) > allowedLengthDeltaMeters) errors.push(`length_delta_exceeds_epsilon_meters:${diagnostics.lengthDeltaMeters}`);
  return errors;
}

function detection(coordinate: Position, reason: JunctionReason, lines: WorkingLine[], sourceFeatureIds = lines.flatMap((line) => line.sourceFeatureIds), measuredDistanceMeters?: number, statusHint?: "needs_review"): Detection { return { coordinate, reason, statusHint, measuredDistanceMeters, participatingTrailNormalizedNames: unique(lines.map((line) => line.source.trailNormalizedName)).sort(), participatingInventoryItemKeys: unique(lines.map((line) => line.source.itemKey)).sort(), sourceFeatureIds: unique(sourceFeatureIds).sort(naturalSort) }; }
function endpointConnection(a: Position[], b: Position[]) { return endpointPairs(a, b).map(([x, y]) => ({ a: x, b: y, distanceMeters: distanceMeters(x, y) })).sort((x, y) => x.distanceMeters - y.distanceMeters)[0]; }
function endpointPairs(a: Position[], b: Position[]): Array<[Position, Position]> { return [[a[0], b[0]], [a[0], b[b.length - 1]], [a[a.length - 1], b[0]], [a[a.length - 1], b[b.length - 1]]]; }
function tryAppendOrPrepend(base: Position[], candidate: Position[], toleranceMeters: number) { const start = base[0], end = base[base.length - 1], cStart = candidate[0], cEnd = candidate[candidate.length - 1]; if (distanceMeters(end, cStart) <= toleranceMeters) return { coordinates: [...base, ...candidate.slice(1)], snapDistanceMeters: distanceMeters(end, cStart) }; if (distanceMeters(end, cEnd) <= toleranceMeters) return { coordinates: [...base, ...candidate.slice(0, -1).reverse()], snapDistanceMeters: distanceMeters(end, cEnd) }; if (distanceMeters(start, cEnd) <= toleranceMeters) return { coordinates: [...candidate.slice(0, -1), ...base], snapDistanceMeters: distanceMeters(start, cEnd) }; if (distanceMeters(start, cStart) <= toleranceMeters) return { coordinates: [...candidate.slice(1).reverse(), ...base], snapDistanceMeters: distanceMeters(start, cStart) }; return undefined; }
function closestPointOnLine(point: Position, coordinates: Position[]) { let best: { distanceMeters: number; closest: Position } | undefined; for (let index = 1; index < coordinates.length; index += 1) { const candidate = distancePointToSegmentMeters(point, coordinates[index - 1], coordinates[index]); if (!best || candidate.distanceMeters < best.distanceMeters) best = { distanceMeters: candidate.distanceMeters, closest: candidate.closest }; } return best; }
function dedupeMeasures(items: Array<{ junction: JunctionCandidate; measure: { distanceMeters: number; measureMeters: number; coordinate: Position } }>) { const output: typeof items = []; for (const item of items) if (!output.some((existing) => Math.abs(existing.measure.measureMeters - item.measure.measureMeters) <= 0.05)) output.push(item); return output; }
function representativePoint(points: Position[]): Position { return [round(points.reduce((sum, point) => sum + point[0], 0) / points.length, 7), round(points.reduce((sum, point) => sum + point[1], 0) / points.length, 7)]; }
function maximumPairwiseDistance(points: Position[]) { let max = 0; for (let a = 0; a < points.length; a += 1) for (let b = a + 1; b < points.length; b += 1) max = Math.max(max, distanceMeters(points[a], points[b])); return max; }
function quantizeCoordinate(coordinate: Position) { return `${round(coordinate[0], 5)},${round(coordinate[1], 5)}`; }
function geometryFingerprint(coordinates: Position[]) { const forward = coordinates.map((point) => `${round(point[0], 7)},${round(point[1], 7)}`).join(";"); const reverse = coordinates.slice().reverse().map((point) => `${round(point[0], 7)},${round(point[1], 7)}`).join(";"); return forward < reverse ? forward : reverse; }
function stableKey(prefix: string, input: string) { return `${prefix}_${crypto.createHash("sha1").update(input).digest("hex").slice(0, 16)}`; }
function unique<T>(items: T[]) { return Array.from(new Set(items)); }
function naturalSort(a: string, b: string) { return a.localeCompare(b, undefined, { numeric: true }); }
function duplicateKeys(keys: string[]) { const seen = new Set<string>(); return unique(keys.filter((key) => seen.size === seen.add(key).size)); }
