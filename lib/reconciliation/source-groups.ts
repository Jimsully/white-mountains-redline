import type { SourceTrailFeature } from "@/types/trails";
import type { SourceTrailGroup } from "@/types/reconciliation";
import { normalizeTrailName } from "@/lib/reconciliation/name-normalization";

export function groupSourceTrailFeatures(features: SourceTrailFeature[]): SourceTrailGroup[] {
  const groups = new Map<string, SourceTrailFeature[]>();
  for (const feature of features) {
    if (!feature.trailName?.trim()) continue;
    const normalized = normalizeTrailName(feature.trailName);
    if (!normalized) continue;
    groups.set(normalized, [...(groups.get(normalized) ?? []), feature]);
  }

  return [...groups.entries()].map(([normalizedName, groupFeatures]) => {
    const originalSourceNames = Array.from(new Set(groupFeatures.map((feature) => feature.trailName).filter((name): name is string => Boolean(name)))).sort();
    return {
      displayName: originalSourceNames[0] ?? normalizedName,
      normalizedName,
      sourceFeatureCount: groupFeatures.length,
      sourceFeatureIds: groupFeatures.map((feature) => feature.sourceFeatureId).sort(naturalSort),
      totalGisMiles: round(groupFeatures.reduce((sum, feature) => sum + (feature.gisMiles ?? 0), 0)),
      bbox: calculateBbox(groupFeatures),
      geometry: {
        type: "MultiLineString" as const,
        coordinates: groupFeatures.flatMap((feature) => feature.geometry.type === "LineString"
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates),
      },
      sourceProvider: "USFS",
      originalSourceNames,
    };
  }).sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));
}

function calculateBbox(features: SourceTrailFeature[]): [number, number, number, number] {
  const coordinates = features.flatMap((feature) => feature.geometry.type === "LineString"
    ? feature.geometry.coordinates
    : feature.geometry.coordinates.flat());
  const xs = coordinates.map(([x]) => x);
  const ys = coordinates.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function round(value: number) {
  return Math.round(value * 1000000) / 1000000;
}

function naturalSort(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true });
}

