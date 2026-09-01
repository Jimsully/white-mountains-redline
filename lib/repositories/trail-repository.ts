import type { TrailDetail, TrailSegment } from "@/types/trails";

export type TrailRepository = {
  listSegments(): Promise<TrailSegment[]>;
  getSegmentBySlug(slug: string): Promise<TrailSegment | undefined>;
  listTrails(): Promise<TrailDetail[]>;
  getTrailBySlug(slug: string): Promise<TrailDetail | undefined>;
};
