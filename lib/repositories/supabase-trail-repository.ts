import type { TrailRepository } from "@/lib/repositories/trail-repository";
import type { DataStatus, TrailRegion, TrailSegment, VerificationStatus } from "@/types/trails";

type SupabaseSegmentRow = {
  id: number | string;
  segment_key: string;
  segment_name: string;
  miles: number | string;
  data_status: DataStatus;
  verification_status?: VerificationStatus;
  source_label?: string | null;
  source_ref?: string | null;
  provenance?: Record<string, unknown> | null;
  geom_geojson?: { type: "LineString"; coordinates: [number, number][] } | null;
  trails?: {
    id: number | string;
    slug: string;
    name: string;
    region: TrailRegion;
  } | null;
};

export class SupabaseTrailRepository implements TrailRepository {
  constructor(
    private readonly supabaseUrl: string,
    private readonly anonKey: string,
  ) {}

  async listSegments() {
    const params = new URLSearchParams({
      select: "id,segment_key,segment_name,miles,data_status,verification_status,source_label,source_ref,provenance,geom_geojson,trails(id,slug,name,region)",
      order: "segment_name.asc",
    });
    const rows = await this.fetchRows(`/rest/v1/trail_segments?${params.toString()}`);
    return rows.map(mapSupabaseSegment).filter((segment): segment is TrailSegment => Boolean(segment));
  }

  async getSegmentBySlug(slug: string) {
    const segments = await this.listSegments();
    return segments.find((segment) => segment.slug === slug);
  }

  private async fetchRows(path: string): Promise<SupabaseSegmentRow[]> {
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

    return response.json() as Promise<SupabaseSegmentRow[]>;
  }
}

function mapSupabaseSegment(row: SupabaseSegmentRow): TrailSegment | undefined {
  if (!row.trails || !row.geom_geojson?.coordinates?.length) return undefined;

  const sourceFeatureIds = Array.isArray(row.provenance?.sourceFeatureIds)
    ? row.provenance.sourceFeatureIds.filter((id): id is string => typeof id === "string")
    : [];

  return {
    id: String(row.id),
    slug: row.segment_key,
    trailId: String(row.trails.id),
    trailName: row.trails.name,
    segmentName: row.segment_name,
    region: row.trails.region,
    miles: Number(row.miles),
    completed: false,
    coordinates: row.geom_geojson.coordinates,
    dataStatus: row.data_status,
    verificationStatus: row.verification_status ?? "needs_reconciliation",
    provenance: {
      provider: "other",
      dataset: row.source_label ?? "Supabase trail_segments",
      sourceFeatureIds,
      sourceUrl: row.source_ref ?? undefined,
      manuallyModified: Boolean(row.provenance?.manuallyModified),
    },
  };
}
