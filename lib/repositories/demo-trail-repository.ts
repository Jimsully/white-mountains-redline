import { demoTrails } from "@/data/demo-trails";
import type { TrailRepository } from "@/lib/repositories/trail-repository";

export class DemoTrailRepository implements TrailRepository {
  async listSegments() {
    return demoTrails;
  }

  async getSegmentBySlug(slug: string) {
    return demoTrails.find((segment) => segment.slug === slug);
  }
}
