#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SERVICE_URL = "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublishWithDataStatus_01/MapServer/0";
const QUERY_URL = `${SERVICE_URL}/query`;
const OUT_DIR = path.join("data", "staging", "usfs", "franconia-pemi");
const IMPORTED_AT = process.env.USFS_IMPORT_TIMESTAMP ?? new Date().toISOString();
const PAGE_SIZE = Number(process.env.USFS_IMPORT_PAGE_SIZE ?? 1000);
const SHOULD_LOAD = process.argv.includes("--load");
const ENVELOPE = { west: -71.95, south: 43.75, east: -71.35, north: 44.35 };
const OUT_FIELDS = [
  "objectid",
  "trail_name",
  "trail_cn",
  "segment_length",
  "gis_miles",
  "admin_org",
  "managing_org",
  "attributesubset",
  "trail_class",
  "trail_type",
];

async function main() {
  if (SHOULD_LOAD) assertSupabaseLoadCredentials();

  const features = [];
  const skippedFeatures = [];
  let offset = 0;

  while (true) {
    const page = await fetchPage(offset);
    const pageFeatures = Array.isArray(page.features) ? page.features : [];
    for (const feature of pageFeatures) {
      const normalized = normalizeUsfsFeature(feature);
      if (normalized.feature) features.push(normalized.feature);
      else skippedFeatures.push(normalized.skippedReason ?? "Unknown malformed feature");
    }

    if (pageFeatures.length < PAGE_SIZE || !page.exceededTransferLimit) break;
    offset += PAGE_SIZE;
  }

  const summary = buildSummary(features, skippedFeatures);
  const featureCollection = {
    type: "FeatureCollection",
    name: "USFS Franconia-Pemigewasset ingestion-envelope source features - NOT FOR NAVIGATION OR CHALLENGE VERIFICATION",
    metadata: {
      warning: "Raw USFS source GIS inside an approximate ingestion envelope. Broad source import only; not an AMC challenge inventory, not human verified, and not for navigation.",
      sourceProvider: "USFS",
      sourceDataset: "EDW_TrailNFSPublishWithDataStatus_01/MapServer/0",
      sourceUrl: SERVICE_URL,
      sourceQueryUrl: QUERY_URL,
      importedAt: IMPORTED_AT,
      envelope: ENVELOPE,
      requestedFields: OUT_FIELDS,
      summary,
    },
    features: features.map((feature) => ({
      type: "Feature",
      id: feature.id,
      properties: {
        id: feature.id,
        sourceProvider: feature.sourceProvider,
        sourceDataset: feature.sourceDataset,
        sourceFeatureId: feature.sourceFeatureId,
        sourceUrl: feature.sourceUrl,
        sourceQueryUrl: feature.sourceQueryUrl,
        sourceRecordRef: feature.sourceRecordRef,
        importedAt: feature.importedAt,
        regionHint: feature.regionHint,
        reconciliationStatus: feature.reconciliationStatus,
        trailName: feature.trailName ?? null,
        segmentLength: feature.segmentLength ?? null,
        gisMiles: feature.gisMiles ?? null,
        originalProperties: feature.originalProperties,
      },
      geometry: feature.geometry,
    })),
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "source-features.geojson"), `${JSON.stringify(featureCollection, stableJson)}\n`);
  await writeFile(path.join(OUT_DIR, "source-features.json"), `${JSON.stringify({ importedAt: IMPORTED_AT, sourceUrl: SERVICE_URL, sourceQueryUrl: QUERY_URL, envelope: ENVELOPE, features }, stableJson)}\n`);
  await writeFile(path.join(OUT_DIR, "summary.json"), `${JSON.stringify(summary, stableJson, 2)}\n`);
  await writeFile(path.join(OUT_DIR, "README.md"), stagingReadme(summary));

  if (SHOULD_LOAD) {
    const result = await loadIntoSupabase(features, summary);
    console.log(`Supabase staging import batch: ${result.import_batch_id ?? result.importBatchId}`);
    console.log(`Supabase raw source features upserted: ${result.upserted_count ?? result.upsertedCount}`);
  }

  console.log(`USFS source features downloaded: ${summary.sourceFeatureCount}`);
  console.log(`Named features: ${summary.namedFeatureCount}`);
  console.log(`Unnamed features: ${summary.unnamedFeatureCount}`);
  console.log(`Unique trail names: ${summary.uniqueTrailNameCount}`);
  console.log(`Total source GIS miles: ${summary.totalSourceGisMiles}`);
  console.log(`Malformed/skipped features: ${summary.malformedOrSkippedFeatureCount}`);
  console.log(`Output: ${OUT_DIR}`);
}

async function fetchPage(offset) {
  const params = new URLSearchParams({
    f: "geojson",
    where: "1=1",
    outFields: OUT_FIELDS.join(","),
    returnGeometry: "true",
    geometry: `${ENVELOPE.west},${ENVELOPE.south},${ENVELOPE.east},${ENVELOPE.north}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outSR: "4326",
    orderByFields: "objectid ASC",
    resultOffset: String(offset),
    resultRecordCount: String(PAGE_SIZE),
  });

  const response = await fetch(`${QUERY_URL}?${params.toString()}`);
  if (!response.ok) throw new Error(`USFS query failed: ${response.status} ${response.statusText}`);
  const body = await response.json();
  if (body.error) throw new Error(`USFS query error: ${JSON.stringify(body.error)}`);
  return body;
}

function normalizeUsfsFeature(feature) {
  const geometry = normalizeLineGeometry(feature.geometry);
  if (!geometry) return { skippedReason: `Unsupported geometry: ${feature.geometry?.type ?? "missing"}` };

  const properties = feature.properties && typeof feature.properties === "object" ? { ...feature.properties } : {};
  const sourceFeatureId = stringifyFirst(properties.objectid, properties.OBJECTID, feature.id);
  if (!sourceFeatureId) return { skippedReason: "Missing source feature id" };

  return {
    feature: {
      id: `usfs-${sourceFeatureId}`,
      sourceProvider: "USFS",
      sourceDataset: "EDW_TrailNFSPublishWithDataStatus_01/MapServer/0",
      sourceFeatureId,
      sourceUrl: SERVICE_URL,
      sourceQueryUrl: QUERY_URL,
      sourceRecordRef: `objectid=${sourceFeatureId}`,
      importedAt: IMPORTED_AT,
      originalProperties: sortObject(properties),
      geometry,
      regionHint: "Franconia-Pemigewasset ingestion envelope",
      reconciliationStatus: "raw",
      trailName: stringifyFirst(properties.trail_name, properties.TRAIL_NAME),
      segmentLength: numberFrom(properties.segment_length ?? properties.SEGMENT_LENGTH),
      gisMiles: numberFrom(properties.gis_miles ?? properties.GIS_MILES),
    },
  };
}

function normalizeLineGeometry(geometry) {
  if (!geometry) return undefined;
  if (geometry.type === "LineString" && isCoordinateLine(geometry.coordinates)) return geometry;
  if (geometry.type === "MultiLineString" && geometry.coordinates.every(isCoordinateLine)) return geometry;
  return undefined;
}

function isCoordinateLine(value) {
  return Array.isArray(value)
    && value.length >= 2
    && value.every((coordinate) => Array.isArray(coordinate)
      && coordinate.length >= 2
      && typeof coordinate[0] === "number"
      && typeof coordinate[1] === "number");
}

function buildSummary(features, skippedFeatures) {
  const namedFeatures = features.filter((feature) => feature.trailName?.trim());
  const uniqueTrailNames = Array.from(new Set(namedFeatures.map((feature) => feature.trailName.trim()))).sort();
  const totalSourceSegmentLength = features.reduce((sum, feature) => sum + (feature.segmentLength ?? 0), 0);
  const totalSourceGisMiles = features.reduce((sum, feature) => sum + (feature.gisMiles ?? 0), 0);

  return {
    sourceFeatureCount: features.length,
    namedFeatureCount: namedFeatures.length,
    unnamedFeatureCount: features.length - namedFeatures.length,
    uniqueTrailNameCount: uniqueTrailNames.length,
    uniqueTrailNames,
    totalSourceSegmentLength,
    totalSourceGisMiles,
    malformedOrSkippedFeatureCount: skippedFeatures.length,
    skippedFeatures,
  };
}

async function loadIntoSupabase(features, summary) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/load_source_trail_feature_batch`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      p_batch: {
        sourceProvider: "USFS",
        sourceDataset: "EDW_TrailNFSPublishWithDataStatus_01/MapServer/0",
        sourceUrl: SERVICE_URL,
        envelopeGeoJson: envelopePolygon(),
        requestedFields: OUT_FIELDS,
        featureCount: summary.sourceFeatureCount,
        namedFeatureCount: summary.namedFeatureCount,
        unnamedFeatureCount: summary.unnamedFeatureCount,
        uniqueTrailNameCount: summary.uniqueTrailNameCount,
        malformedFeatureCount: summary.malformedOrSkippedFeatureCount,
        summary,
        notes: "Raw broad USFS staging import only. Does not create trails or trail_segments and does not verify challenge membership.",
      },
      p_features: features,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase staging load failed: ${response.status} ${response.statusText} ${body}`);
  }

  const body = await response.json();
  return Array.isArray(body) ? body[0] : body;
}

function assertSupabaseLoadCredentials() {
  const missing = [];
  if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    throw new Error(`--load requires ${missing.join(" and ")} in the environment. The service role key must never be committed.`);
  }
}

function envelopePolygon() {
  return {
    type: "Polygon",
    coordinates: [[
      [ENVELOPE.west, ENVELOPE.south],
      [ENVELOPE.east, ENVELOPE.south],
      [ENVELOPE.east, ENVELOPE.north],
      [ENVELOPE.west, ENVELOPE.north],
      [ENVELOPE.west, ENVELOPE.south],
    ]],
  };
}

function stagingReadme(summary) {
  return `# USFS Franconia-Pemigewasset Staging Data\n\nThis directory contains a broad raw USDA Forest Service trail GIS import downloaded from the ArcGIS query API inside an approximate Franconia/Pemigewasset ingestion envelope. Snowmobile, XC, mountain-bike, climbing, and other trail records are intentionally retained in the raw layer. Later reconciliation decides whether any source feature belongs to a hiking/redlining challenge dataset.\n\nThis is source GIS data only. It is not a navigational product, not an AMC White Mountain Guide challenge inventory, and not human verified for White Mountains Redline completion.\n\n- Source features: ${summary.sourceFeatureCount}\n- Named features: ${summary.namedFeatureCount}\n- Unnamed features: ${summary.unnamedFeatureCount}\n- Unique trail names: ${summary.uniqueTrailNameCount}\n- Total source GIS miles: ${summary.totalSourceGisMiles}\n- Malformed/skipped features: ${summary.malformedOrSkippedFeatureCount}\n`;
}

function stableJson(_key, value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return sortObject(value);
  return value;
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

function stringifyFirst(...values) {
  const value = values.find((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim() !== "");
  return value === undefined ? undefined : String(value);
}

function numberFrom(value) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
