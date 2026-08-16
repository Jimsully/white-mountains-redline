import type { Feature, Geometry, LineString, MultiLineString } from "geojson";
import type { SourceTrailFeature } from "@/types/trails";

export const USFS_TRAILS_SERVICE_URL = "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublishWithDataStatus_01/MapServer/0";
export const USFS_TRAILS_QUERY_URL = `${USFS_TRAILS_SERVICE_URL}/query`;
export const FRANCONIA_PEMI_STAGING_ENVELOPE = {
  west: -71.95,
  south: 43.75,
  east: -71.35,
  north: 44.35,
} as const;

type NormalizationResult = {
  feature?: SourceTrailFeature;
  skippedReason?: string;
};

export function normalizeUsfsFeature(
  feature: Feature,
  importedAt: string,
  regionHint = "Franconia-Pemigewasset ingestion envelope",
): NormalizationResult {
  const geometry = normalizeLineGeometry(feature.geometry);
  if (!geometry) return { skippedReason: `Unsupported geometry: ${feature.geometry?.type ?? "missing"}` };

  const properties = asProperties(feature.properties);
  const sourceFeatureId = stringifyFirst(properties.objectid, properties.OBJECTID, feature.id);
  if (!sourceFeatureId) return { skippedReason: "Missing source feature id" };

  const trailName = stringifyFirst(properties.trail_name, properties.TRAIL_NAME);
  const segmentLength = numberFrom(properties.segment_length ?? properties.SEGMENT_LENGTH);

  return {
    feature: {
      id: `usfs-${sourceFeatureId}`,
      sourceProvider: "USFS",
      sourceDataset: "EDW_TrailNFSPublishWithDataStatus_01/MapServer/0",
      sourceFeatureId,
      sourceUrl: `${USFS_TRAILS_SERVICE_URL}/${sourceFeatureId}`,
      importedAt,
      originalProperties: properties,
      geometry,
      regionHint,
      reconciliationStatus: "raw",
      trailName,
      segmentLength,
    },
  };
}

export function buildSourceFeatureSummary(features: SourceTrailFeature[], skippedFeatures: string[]) {
  const namedFeatures = features.filter((feature) => Boolean(feature.trailName?.trim()));
  const uniqueTrailNames = Array.from(new Set(namedFeatures.map((feature) => feature.trailName?.trim()).filter(Boolean))).sort();
  const totalSourceSegmentLength = features.reduce((sum, feature) => sum + (feature.segmentLength ?? 0), 0);

  return {
    sourceFeatureCount: features.length,
    namedFeatureCount: namedFeatures.length,
    unnamedFeatureCount: features.length - namedFeatures.length,
    uniqueTrailNameCount: uniqueTrailNames.length,
    uniqueTrailNames,
    totalSourceSegmentLength,
    malformedOrSkippedFeatureCount: skippedFeatures.length,
    skippedFeatures,
  };
}

function normalizeLineGeometry(geometry: Geometry | null): LineString | MultiLineString | undefined {
  if (!geometry) return undefined;
  if (geometry.type === "LineString" && isCoordinateLine(geometry.coordinates)) return geometry;
  if (geometry.type === "MultiLineString" && geometry.coordinates.every(isCoordinateLine)) return geometry;
  return undefined;
}

function isCoordinateLine(value: unknown): value is [number, number][] {
  return Array.isArray(value)
    && value.length >= 2
    && value.every((coordinate) => Array.isArray(coordinate)
      && coordinate.length >= 2
      && typeof coordinate[0] === "number"
      && typeof coordinate[1] === "number");
}

function asProperties(properties: Feature["properties"]): Record<string, unknown> {
  return properties && typeof properties === "object" ? { ...properties } : {};
}

function stringifyFirst(...values: unknown[]) {
  const value = values.find((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim() !== "");
  return value === undefined ? undefined : String(value);
}

function numberFrom(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}
