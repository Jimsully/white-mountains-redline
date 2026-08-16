import type { TrailSegment } from "@/types/trails";

export type TrailRepository = {
  listSegments(): Promise<TrailSegment[]>;
  getSegmentBySlug(slug: string): Promise<TrailSegment | undefined>;
};
