import type { MultiLineString, Position } from "geojson";
import { distanceMeters, lineLengthMeters, round } from "@/lib/segment-construction/geometry";

export type ActivityGapEvidence = {
  componentIndex: number;
  start: Position;
  end: Position;
  distanceMeters: number;
};

export type TrustedActivityTraceEvidence = {
  componentLines: Position[][][];
  componentPoints: Position[][];
  allLines: Position[][];
  allPoints: Position[];
  pointGapsMeters: number[];
  ignoredGaps: ActivityGapEvidence[];
  ignoredLongActivityEdgeCount: number;
  trustedLengthMeters: number;
};

export function buildTrustedActivityTraceEvidence(trace: MultiLineString, maximumInterpolatedActivityEdgeMeters: number): TrustedActivityTraceEvidence {
  const componentLines: Position[][][] = [];
  const componentPoints: Position[][] = [];
  const pointGapsMeters: number[] = [];
  const ignoredGaps: ActivityGapEvidence[] = [];

  for (let componentIndex = 0; componentIndex < trace.coordinates.length; componentIndex += 1) {
    const component = trace.coordinates[componentIndex];
    const lines: Position[][] = [];
    let currentLine: Position[] = [];
    for (let index = 0; index < component.length; index += 1) {
      const point = component[index];
      if (!currentLine.length) currentLine.push(point);
      if (index === component.length - 1) continue;
      const next = component[index + 1];
      const gap = distanceMeters(point, next);
      pointGapsMeters.push(gap);
      if (gap <= maximumInterpolatedActivityEdgeMeters) {
        currentLine.push(next);
      } else {
        if (currentLine.length >= 2) lines.push(currentLine);
        currentLine = [next];
        ignoredGaps.push({ componentIndex, start: point, end: next, distanceMeters: round(gap, 3) });
      }
    }
    if (currentLine.length >= 2) lines.push(currentLine);
    componentLines.push(lines);
    componentPoints.push(component);
  }

  return {
    componentLines,
    componentPoints,
    allLines: componentLines.flat(),
    allPoints: componentPoints.flat(),
    pointGapsMeters,
    ignoredGaps,
    ignoredLongActivityEdgeCount: ignoredGaps.length,
    trustedLengthMeters: round(componentLines.flat().reduce((sum, line) => sum + lineLengthMeters(line), 0), 3),
  };
}