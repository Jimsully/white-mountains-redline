import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = path.join(process.cwd(), "supabase/migrations");
const migrationPath = path.join(migrationsDir, "014_public_projection_minimization.sql");
const sql = fs.readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

describe("migration 014 public projection minimization", () => {
  it("is the latest migration and recreates the public projection with owner rights and a security barrier", () => {
    expect(fs.readdirSync(migrationsDir).filter((file) => /^\d+_.*\.sql$/.test(file)).sort().at(-1))
      .toBe("014_public_projection_minimization.sql");
    expect(normalized).toContain("drop view if exists public.trail_segment_api");
    expect(normalized).toContain("security_invoker = false");
    expect(normalized).toContain("security_barrier = true");
  });

  it("exposes an exact public-safe allowlist and retains every verified-only predicate", () => {
    const view = normalized.match(/create view public\.trail_segment_api.+? from public\.trail_segments s.+?t\.verification_status = 'human_verified'/)?.[0] ?? "";
    for (const column of [
      "s.id::text as id", "s.segment_key as slug", "s.segment_name", "s.miles", "s.data_status",
      "s.verification_status", "t.id::text as trail_id", "t.slug as trail_slug", "t.name as trail_name",
      "t.region as trail_region", "coordinates",
    ]) expect(view).toContain(column);
    for (const privateField of [
      "provenance", "source_ref", "source_feature_ids", "reviewed_at", "verification_notes",
      "publication_artifact_fingerprint", "geometry_manually_modified",
    ]) expect(view).not.toContain(privateField);
    expect(view).toContain("where s.data_status = 'verified'");
    expect(view).toContain("and s.verification_status = 'human_verified'");
    expect(view).toContain("and t.data_status = 'verified'");
    expect(view).toContain("and t.verification_status = 'human_verified'");
  });

  it("normalizes projection grants without changing completion or evidence data", () => {
    expect(normalized).toContain("from public, anon, authenticated");
    expect(normalized).toContain("grant select on table public.trail_segment_api to anon, authenticated");
    expect(normalized).not.toMatch(/segment_completions|completion_evidence|\b(?:insert|update|delete)\s+(?:into|from)\b/);
  });
});
