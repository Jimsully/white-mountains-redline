import { verifiedNetworkToTrailSegments } from "@/lib/publication/adapters";
import { loadDefaultPublicationArtifact } from "@/lib/publication/server-artifact";
import type { TrailRepository } from "@/lib/repositories/trail-repository";

const demoSegments = verifiedNetworkToTrailSegments(loadDefaultPublicationArtifact());

export class DemoTrailRepository implements TrailRepository {
  async listSegments() {
    return demoSegments;
  }

  async getSegmentBySlug(slug: string) {
    return demoSegments.find((segment) => segment.slug === slug);
  }
}
