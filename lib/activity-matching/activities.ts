import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import type { MultiLineString, Position } from "geojson";
import type { ActivityImportSummary, ActivityRecord, ActivitySource } from "@/types/activity-matching";
import { multiLineLengthMeters, stableCoordinateFingerprint } from "@/lib/activity-matching/geometry";

export function loadActivitiesFromPath(inputPath: string): ActivityRecord[] {
  const stat = fs.statSync(inputPath);
  if (stat.isDirectory()) {
    return fs.readdirSync(inputPath)
      .filter((file) => /\.(gpx|json|geojson)$/i.test(file))
      .sort((a, b) => a.localeCompare(b))
      .flatMap((file) => loadActivitiesFromPath(path.join(inputPath, file)));
  }
  const raw = fs.readFileSync(inputPath, "utf8");
  if (/\.gpx$/i.test(inputPath)) return [parseGpxActivity(raw, path.basename(inputPath))];
  return parseNormalizedActivities(raw, path.basename(inputPath));
}

export function summarizeActivities(activities: ActivityRecord[]): ActivityImportSummary {
  const starts = activities.map((activity) => activity.startTime).filter((value): value is string => Boolean(value)).sort();
  return {
    activityCount: activities.length,
    trackComponentCount: activities.reduce((sum, activity) => sum + activity.trace.geometry.coordinates.length, 0),
    inputGpsPointCount: activities.reduce((sum, activity) => sum + activity.originalPointCount, 0),
    retainedPointCount: activities.reduce((sum, activity) => sum + activity.normalizedPointCount, 0),
    malformedPointCount: activities.reduce((sum, activity) => sum + activity.malformedPointCount, 0),
    activityStartDate: starts[0],
    activityEndDate: starts[starts.length - 1],
  };
}

export function parseGpxActivity(raw: string, originalFilename = "activity.gpx"): ActivityRecord {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });
  const parsed = parser.parse(raw) as Record<string, unknown>;
  const gpx = parsed.gpx as Record<string, unknown> | undefined;
  const tracks = asArray(gpx?.trk);
  const components: Position[][] = [];
  const times: Array<Array<string | undefined>> = [];
  const elevations: Array<Array<number | undefined>> = [];
  let originalPointCount = 0;
  let malformedPointCount = 0;
  let title = typeof gpx?.metadata === "object" && gpx.metadata && "name" in gpx.metadata ? String((gpx.metadata as { name?: unknown }).name ?? "") : undefined;

  for (const track of tracks) {
    if (typeof track === "object" && track && "name" in track && !title) title = String((track as { name?: unknown }).name ?? "");
    for (const segment of asArray((track as { trkseg?: unknown })?.trkseg)) {
      const points: Position[] = [];
      const pointTimes: Array<string | undefined> = [];
      const pointElevations: Array<number | undefined> = [];
      for (const point of asArray((segment as { trkpt?: unknown })?.trkpt)) {
        originalPointCount += 1;
        const normalized = normalizeGpxPoint(point);
        if (!normalized) {
          malformedPointCount += 1;
          continue;
        }
        points.push(normalized.coordinate);
        pointTimes.push(normalized.time);
        pointElevations.push(normalized.elevationMeters);
      }
      if (points.length >= 2) {
        components.push(points);
        times.push(pointTimes);
        elevations.push(pointElevations);
      }
    }
  }

  const geometry: MultiLineString = { type: "MultiLineString", coordinates: components };
  const startTime = times.flat().filter((value): value is string => Boolean(value)).sort()[0];
  return makeActivityRecord({ source: "gpx", title, startTime, geometry, originalPointCount, malformedPointCount, originalFilename, times, elevations, sourceMetadata: { parser: "fast-xml-parser" } });
}

export function parseNormalizedActivities(raw: string, originalFilename = "activities.json"): ActivityRecord[] {
  const parsed = JSON.parse(raw) as unknown;
  const records = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { activities?: unknown })?.activities) ? (parsed as { activities: unknown[] }).activities : [parsed];
  return records.map((record, index) => normalizedRecordToActivity(record, `${originalFilename}#${index + 1}`));
}

function normalizedRecordToActivity(record: unknown, fallbackName: string): ActivityRecord {
  if (!record || typeof record !== "object") throw new Error(`Invalid activity record in ${fallbackName}`);
  const candidate = record as Record<string, unknown>;
  const geometry = normalizeGeometry(candidate.trace ?? candidate.geometry);
  const originalPointCount = Number(candidate.originalPointCount ?? geometry.coordinates.flat().length);
  const malformedPointCount = Number(candidate.malformedPointCount ?? 0);
  return makeActivityRecord({
    source: (candidate.source as ActivitySource | undefined) ?? "normalized_json",
    sourceActivityId: stringOrUndefined(candidate.sourceActivityId),
    title: stringOrUndefined(candidate.title ?? candidate.name),
    startTime: stringOrUndefined(candidate.startTime ?? candidate.activityDate),
    activityType: stringOrUndefined(candidate.activityType),
    suppliedDistanceMeters: numberOrUndefined(candidate.suppliedDistanceMeters ?? candidate.distanceMeters),
    suppliedElevationGainMeters: numberOrUndefined(candidate.suppliedElevationGainMeters),
    elapsedDurationSeconds: numberOrUndefined(candidate.elapsedDurationSeconds),
    movingDurationSeconds: numberOrUndefined(candidate.movingDurationSeconds),
    geometry,
    originalPointCount,
    malformedPointCount,
    originalFilename: stringOrUndefined(candidate.originalFilename),
    sourceMetadata: typeof candidate.sourceMetadata === "object" && candidate.sourceMetadata ? candidate.sourceMetadata as Record<string, unknown> : {},
  });
}

function makeActivityRecord(args: { source: ActivitySource; sourceActivityId?: string; title?: string; startTime?: string; activityType?: string; suppliedDistanceMeters?: number; suppliedElevationGainMeters?: number; elapsedDurationSeconds?: number; movingDurationSeconds?: number; geometry: MultiLineString; originalPointCount: number; malformedPointCount: number; originalFilename?: string; times?: Array<Array<string | undefined>>; elevations?: Array<Array<number | undefined>>; sourceMetadata: Record<string, unknown> }): ActivityRecord {
  const normalizedPointCount = args.geometry.coordinates.reduce((sum, line) => sum + line.length, 0);
  const activityKey = stableActivityKey(args.source, args.sourceActivityId, args.startTime, args.title, args.geometry);
  return {
    activityKey,
    source: args.source,
    sourceActivityId: args.sourceActivityId,
    title: args.title,
    startTime: args.startTime,
    activityType: args.activityType,
    suppliedDistanceMeters: args.suppliedDistanceMeters,
    suppliedElevationGainMeters: args.suppliedElevationGainMeters,
    elapsedDurationSeconds: args.elapsedDurationSeconds,
    movingDurationSeconds: args.movingDurationSeconds,
    trace: { geometry: args.geometry, componentPointCounts: args.geometry.coordinates.map((line) => line.length), pointTimes: args.times, pointElevationsMeters: args.elevations },
    originalPointCount: args.originalPointCount,
    normalizedPointCount,
    malformedPointCount: args.malformedPointCount,
    originalFilename: args.originalFilename ? sanitizeFilename(args.originalFilename) : undefined,
    sourceMetadata: { ...args.sourceMetadata, traceLengthMeters: multiLineLengthMeters(args.geometry) },
  };
}

function normalizeGpxPoint(point: unknown) {
  if (!point || typeof point !== "object") return undefined;
  const candidate = point as Record<string, unknown>;
  const lon = Number(candidate["@_lon"]);
  const lat = Number(candidate["@_lat"]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) return undefined;
  return { coordinate: [lon, lat] as Position, time: stringOrUndefined(candidate.time), elevationMeters: numberOrUndefined(candidate.ele) };
}

function normalizeGeometry(value: unknown): MultiLineString {
  if (!value || typeof value !== "object") throw new Error("Activity geometry is required.");
  const geometry = value as { type?: string; coordinates?: unknown };
  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) return { type: "MultiLineString", coordinates: [normalizeLine(geometry.coordinates)] };
  if (geometry.type === "MultiLineString" && Array.isArray(geometry.coordinates)) return { type: "MultiLineString", coordinates: geometry.coordinates.map(normalizeLine).filter((line) => line.length >= 2) };
  throw new Error("Activity geometry must be LineString or MultiLineString.");
}

function normalizeLine(value: unknown): Position[] {
  if (!Array.isArray(value)) return [];
  const coordinates: Position[] = [];
  for (const point of value) {
    if (!Array.isArray(point)) continue;
    const coordinate: Position = [Number(point[0]), Number(point[1])];
    if (Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1])) coordinates.push(coordinate);
  }
  return coordinates;
}

function stableActivityKey(source: ActivitySource, sourceActivityId: string | undefined, startTime: string | undefined, title: string | undefined, geometry: MultiLineString) {
  const fingerprint = geometry.coordinates.map(stableCoordinateFingerprint).join("|");
  return `activity_${crypto.createHash("sha1").update([source, sourceActivityId, startTime, title, fingerprint].join("|")).digest("hex").slice(0, 16)}`;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberOrUndefined(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function sanitizeFilename(input: string) {
  return path.basename(input).replace(/[^a-zA-Z0-9._-]/g, "_");
}
