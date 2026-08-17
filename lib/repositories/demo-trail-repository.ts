import demoArtifact from "@/data/generated/publication/demo-verified-network.json";
import type { VerifiedNetworkArtifact } from "@/types/publication";
import { verifiedNetworkToTrailSegments } from "@/lib/publication/adapters";
import type { TrailRepository } from "@/lib/repositories/trail-repository";

const demoSegments = verifiedNetworkToTrailSegments(demoArtifact as unknown as VerifiedNetworkArtifact);

export class DemoTrailRepository implements TrailRepository {
  async listSegments() {
    return demoSegments;
  }

  async getSegmentBySlug(slug: string) {
    return demoSegments.find((segment) => segment.slug === slug);
  }
}
