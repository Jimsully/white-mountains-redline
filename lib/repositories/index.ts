import { DemoTrailRepository } from "@/lib/repositories/demo-trail-repository";
import { SupabaseTrailRepository } from "@/lib/repositories/supabase-trail-repository";
import type { TrailRepository } from "@/lib/repositories/trail-repository";
import { resolveSupabasePublicConfig } from "@/lib/supabase/config";

export const TRAIL_REPOSITORY_CONFIGURATION_ERROR = "Trail data is unavailable because the public repository is not configured.";

export type TrailRepositoryMode = "supabase" | "demo";

export type TrailRepositoryRuntime = {
  repository: TrailRepository;
  mode: TrailRepositoryMode;
};

type TrailRepositoryEnv = { [key: string]: string | undefined };

export function createTrailRepositoryRuntime(env: TrailRepositoryEnv = process.env): TrailRepositoryRuntime {
  const adapter = env.TRAIL_REPOSITORY?.trim().toLocaleLowerCase();
  const config = resolveSupabasePublicConfig(env);

  if (adapter === "supabase") {
    if (!config) throw new Error(TRAIL_REPOSITORY_CONFIGURATION_ERROR);
    return { repository: new SupabaseTrailRepository(config.url, config.publishableKey), mode: "supabase" };
  }

  if (env.VERCEL_ENV === "production") throw new Error(TRAIL_REPOSITORY_CONFIGURATION_ERROR);

  return { repository: new DemoTrailRepository(), mode: "demo" };
}

export function createTrailRepository(): TrailRepository {
  return createTrailRepositoryRuntime().repository;
}
