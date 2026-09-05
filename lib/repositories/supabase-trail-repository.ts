import type { TrailRepository } from "@/lib/repositories/trail-repository";
import { aggregateTrailSegments, getTrailBySlugFromSegments } from "@/lib/trails/trail-aggregation";
import type { DataStatus, TrailRegion, TrailSegment, VerificationStatus } from "@/types/trails";

type TrailSegmentApiRow = {
  id: string;
  slug: string;
  segment_name: string;
  miles: number | string;
  data_status: DataStatus;
  verification_status: VerificationStatus;
  trail_id: string;
  trail_slug: string;
  trail_name: string;
  trail_region: TrailRegion;
  coordinates?: unknown;
};

export const PUBLIC_TRAIL_SEGMENT_FIELDS = [
  "id",
  "slug",
  "segment_name",
  "miles",
  "data_status",
  "verification_status",
  "trail_id",
  "trail_slug",
  "trail_name",
  "trail_region",
  "coordinates",
].join(",");

export class SupabaseTrailRepository implements TrailRepository {
  constructor(
    private readonly supabaseUrl: string,
    private readonly anonKey: string,
  ) {}

  async listSegments() {
    const params = new URLSearchParams({
      select: PUBLIC_TRAIL_SEGMENT_FIELDS,
      order: "segment_name.asc",
    });
    const rows = await this.fetchRows(`/rest/v1/trail_segment_api?${params.toString()}`);
    return rows.map(mapSupabaseSegmentRow).filter((segment): segment is TrailSegment => Boolean(segment));
  }

  async getSegmentBySlug(slug: string) {
    const params = new URLSearchParams({
      select: PUBLIC_TRAIL_SEGMENT_FIELDS,
      slug: `eq.${slug}`,
      limit: "1",
    });
    const rows = await this.fetchRows(`/rest/v1/trail_segment_api?${params.toString()}`);
    return mapSupabaseSegmentRow(rows[0]);
  }

  async listTrails() {
    return aggregateTrailSegments(await this.listSegments());
  }

  async getTrailBySlug(slug: string) {
    const params = new URLSearchParams({
      select: PUBLIC_TRAIL_SEGMENT_FIELDS,
      trail_slug: `eq.${slug}`,
      order: "segment_name.asc",
    });
    const rows = await this.fetchRows(`/rest/v1/trail_segment_api?${params.toString()}`);
    const segments = rows.map(mapSupabaseSegmentRow).filter((segment): segment is TrailSegment => Boolean(segment));
    return getTrailBySlugFromSegments(segments, slug);
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
  if (row.data_status !== "verified" || row.verification_status !== "human_verified") return undefined;
  const coordinates = normalizeCoordinates(row.coordinates);
  if (!coordinates) return undefined;
  const miles = Number(row.miles);
  if (!Number.isFinite(miles) || miles < 0) return undefined;

  return {
    id: row.id,
    slug: row.slug,
    trailId: row.trail_id,
    trailSlug: row.trail_slug,
    trailName: row.trail_name,
    segmentName: row.segment_name,
    region: row.trail_region,
    miles,
    completed: false,
    coordinates,
    dataStatus: row.data_status,
    verificationStatus: row.verification_status,
    provenance: {
      provider: "other",
      dataset: "Verified public trail segment projection",
      sourceFeatureIds: [],
      manuallyModified: false,
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
