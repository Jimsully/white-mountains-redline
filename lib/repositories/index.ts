import { DemoTrailRepository } from "@/lib/repositories/demo-trail-repository";
import { SupabaseTrailRepository } from "@/lib/repositories/supabase-trail-repository";
import type { TrailRepository } from "@/lib/repositories/trail-repository";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export type TrailRepositoryMode = "supabase" | "demo";

export type TrailRepositoryRuntime = {
  repository: TrailRepository;
  mode: TrailRepositoryMode;
};

export function createTrailRepositoryRuntime(): TrailRepositoryRuntime {
  const adapter = process.env.TRAIL_REPOSITORY?.toLocaleLowerCase();
  const config = getSupabasePublicConfig();

  if (adapter === "supabase" && config) {
    return { repository: new SupabaseTrailRepository(config.url, config.publishableKey), mode: "supabase" };
  }

  return { repository: new DemoTrailRepository(), mode: "demo" };
}

export function createTrailRepository(): TrailRepository {
  return createTrailRepositoryRuntime().repository;
}