import { DemoTrailRepository } from "@/lib/repositories/demo-trail-repository";
import { SupabaseTrailRepository } from "@/lib/repositories/supabase-trail-repository";
import type { TrailRepository } from "@/lib/repositories/trail-repository";

export function createTrailRepository(): TrailRepository {
  const adapter = process.env.TRAIL_REPOSITORY?.toLocaleLowerCase();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (adapter === "supabase" && supabaseUrl && supabaseAnonKey) {
    return new SupabaseTrailRepository(supabaseUrl, supabaseAnonKey);
  }

  return new DemoTrailRepository();
}
