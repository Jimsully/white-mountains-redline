import { DemoTrailRepository } from "@/lib/repositories/demo-trail-repository";
import { SupabaseTrailRepository } from "@/lib/repositories/supabase-trail-repository";
import type { TrailRepository } from "@/lib/repositories/trail-repository";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export function createTrailRepository(): TrailRepository {
  const adapter = process.env.TRAIL_REPOSITORY?.toLocaleLowerCase();
  const config = getSupabasePublicConfig();

  if (adapter === "supabase" && config) {
    return new SupabaseTrailRepository(config.url, config.publishableKey);
  }

  return new DemoTrailRepository();
}
