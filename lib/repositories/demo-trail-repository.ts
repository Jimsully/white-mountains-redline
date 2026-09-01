import { verifiedNetworkToTrailSegments } from "@/lib/publication/adapters";
import { loadDefaultPublicationArtifact } from "@/lib/publication/server-artifact";
import type { TrailRepository } from "@/lib/repositories/trail-repository";
import { aggregateTrailSegments, getTrailBySlugFromSegments } from "@/lib/trails/trail-aggregation";

const demoSegments = verifiedNetworkToTrailSegments(loadDefaultPublicationArtifact());

export class DemoTrailRepository implements TrailRepository {
  async listSegments() {
    return demoSegments;
  }

  async getSegmentBySlug(slug: string) {
    return demoSegments.find((segment) => segment.slug === slug);
  }

  async listTrails() {
    return aggregateTrailSegments(demoSegments);
  }

  async getTrailBySlug(slug: string) {
    return getTrailBySlugFromSegments(demoSegments, slug);
  }
}
