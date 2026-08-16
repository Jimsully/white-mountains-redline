import type { TrailRepository } from "@/lib/repositories/trail-repository";
import type { DataStatus, TrailRegion, TrailSegment, VerificationStatus } from "@/types/trails";

type TrailSegmentApiRow = {
  id: string;
  slug: string;
  segment_key: string;
  segment_name: string;
  miles: number | string;
  data_status: DataStatus;
  verification_status: VerificationStatus;
  source_label?: string | null;
  source_ref?: string | null;
  source_feature_ids?: string[] | null;
  geometry_manually_modified?: boolean | null;
  reviewed_at?: string | null;
  provenance?: Record<string, unknown> | null;
  trail_id: string;
  trail_slug: string;
  trail_name: string;
  trail_region: TrailRegion;
  coordinates?: unknown;
};

export class SupabaseTrailRepository implements TrailRepository {
  constructor(
    private readonly supabaseUrl: string,
    private readonly anonKey: string,
  ) {}

  async listSegments() {
    const params = new URLSearchParams({
      select: "*",
      order: "segment_name.asc",
    });
    const rows = await this.fetchRows(`/rest/v1/trail_segment_api?${params.toString()}`);
    return rows.map(mapSupabaseSegmentRow).filter((segment): segment is TrailSegment => Boolean(segment));
  }

  async getSegmentBySlug(slug: string) {
    const params = new URLSearchParams({
      select: "*",
      slug: `eq.${slug}`,
      limit: "1",
    });
    const rows = await this.fetchRows(`/rest/v1/trail_segment_api?${params.toString()}`);
    return mapSupabaseSegmentRow(rows[0]);
  }

  private async fetchRows(path: string): Promise<TrailSegmentApiRow[]> {
    const response = await fetch(`${this.supabaseUrl.replace(/\/$/, "")}${path}`, {
      headers: {
        apikey: this.anonKey,
        authorization: `Bearer ${this.anonKey}`,
      },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      throw new Error(`Supabase trail query failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<TrailSegmentApiRow[]>;
  }
}

export function mapSupabaseSegmentRow(row?: TrailSegmentApiRow): TrailSegment | undefined {
  if (!row) return undefined;
  const coordinates = normalizeCoordinates(row.coordinates);
  if (!coordinates) return undefined;

  const provenance = row.provenance ?? {};
  const sourceFeatureIds = Array.isArray(row.source_feature_ids)
    ? row.source_feature_ids.filter((id): id is string => typeof id === "string")
    : [];

  return {
    id: row.id,
    slug: row.slug,
    trailId: row.trail_id,
    trailName: row.trail_name,
    segmentName: row.segment_name,
    region: row.trail_region,
    miles: Number(row.miles),
    completed: false,
    coordinates,
    dataStatus: row.data_status,
    verificationStatus: row.verification_status,
    provenance: {
      provider: sourceProviderFrom(provenance.provider),
      dataset: stringFrom(provenance.dataset) ?? row.source_label ?? "Supabase trail_segment_api",
      sourceFeatureIds,
      sourceUrl: stringFrom(provenance.sourceUrl) ?? row.source_ref ?? undefined,
      importedAt: stringFrom(provenance.importedAt),
      manuallyModified: row.geometry_manually_modified ?? Boolean(provenance.manuallyModified),
      reviewedAt: row.reviewed_at ?? stringFrom(provenance.reviewedAt),
      notes: stringFrom(provenance.notes),
    },
  };
}

function normalizeCoordinates(value: unknown): [number, number][] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;

  const coordinates = value.filter((coordinate): coordinate is [number, number] => Array.isArray(coordinate)
    && coordinate.length >= 2
    && typeof coordinate[0] === "number"
    && typeof coordinate[1] === "number");

  return coordinates.length === value.length ? coordinates : undefined;
}

function sourceProviderFrom(value: unknown) {
  return value === "USFS" || value === "OSM" || value === "manual" || value === "demo" || value === "other"
    ? value
    : "other";
}

function stringFrom(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}
