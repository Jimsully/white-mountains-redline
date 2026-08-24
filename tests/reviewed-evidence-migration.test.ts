import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/011_reviewed_evidence_materialization.sql"), "utf8");
const normalized = migration.replace(/\s+/g, " ").trim();
const loader = migration.match(/create or replace function public\.load_reviewed_completion_evidence_batch\([\s\S]*?\n\$\$;/)?.[0] ?? "";
const normalizedLoader = loader.replace(/\s+/g, " ").trim();
const safeResult = loader.match(/return jsonb_build_object\\([\\s\\S]*?\\);\\s*end;/)?.[0] ?? "";
const immutabilityFunction = migration.match(/create or replace function public\.protect_accepted_completion_evidence\(\)[\s\S]*?\n\$\$;/)?.[0] ?? "";

function grantColumns(operation: "insert" | "update") {
  const match = normalized.match(new RegExp(`grant ${operation} \\(([^)]+)\\) on public\\.activities to authenticated`));
  return match?.[1].split(",").map((column) => column.trim()) ?? [];
}

describe("migration 011 reviewed evidence materialization contract", () => {
  it("adds nullable stable activity/evidence identities with user-scoped partial uniqueness", () => {
    expect(normalized).toContain("alter table public.activities add column if not exists activity_key text");
    expect(normalized).toContain("on public.activities(user_id, activity_key) where activity_key is not null");
    expect(normalized).toContain("alter table public.completion_evidence add column if not exists evidence_key text");
    expect(normalized).toContain("on public.completion_evidence(user_id, evidence_key) where evidence_key is not null");
    expect(migration).not.toMatch(/update\s+public\.(activities|completion_evidence)\s+set\s+(activity_key|evidence_key)/i);
  });

  it("resets authenticated activity privileges to exact column-limited mutation", () => {
    expect(normalized).toContain("revoke all on public.activities from public, anon, authenticated");
    expect(normalized).toContain("grant select, delete on public.activities to authenticated");
    expect(grantColumns("insert")).toEqual(["user_id", "title", "activity_date", "source", "geom", "distance_miles", "trip_report_url", "notes"]);
    expect(grantColumns("update")).toEqual(["title", "activity_date", "source", "geom", "distance_miles", "trip_report_url", "notes"]);
    expect(grantColumns("insert")).not.toContain("activity_key");
    expect(grantColumns("update")).not.toContain("activity_key");
    expect(grantColumns("update")).not.toContain("user_id");
    expect(normalized).not.toContain("grant select, insert, update, delete on public.activities to authenticated");
    expect(normalized).toContain("grant select, insert, update, delete on public.activities to service_role");
  });

  it("keeps raw completion evidence unavailable to browser roles", () => {
    expect(normalized).toContain("revoke all on public.completion_evidence from public, anon, authenticated");
    expect(normalized).not.toMatch(/grant (?:select|insert|update|delete)[^;]*public\.completion_evidence[^;]*to (?:anon|authenticated)/);
    expect(normalized).toContain("grant select, insert, update, delete on public.completion_evidence to service_role");
  });

  it("protects accepted semantic evidence while allowing only FK cleanup to null", () => {
    for (const column of ["id", "user_id", "evidence_key", "segment_candidate_key", "evidence_source", "evidence", "provenance", "accepted_at", "created_at"]) {
      expect(immutabilityFunction).toContain(`new.${column} is distinct from old.${column}`);
    }
    for (const column of ["activity_id", "match_candidate_id", "future_trail_segment_id"]) {
      expect(immutabilityFunction).toContain(`new.${column} is distinct from old.${column}`);
      expect(immutabilityFunction).toContain(`old.${column} is not null and new.${column} is null`);
    }
    expect(normalized).toContain("before update on public.completion_evidence");
    expect(immutabilityFunction).not.toMatch(/security\s+definer/i);
  });

  it("defines one invoker-rights service-role-only loader RPC", () => {
    expect(loader).not.toBe("");
    expect(normalizedLoader).toContain("target_user_id uuid, run_payload jsonb, activities_payload jsonb, evidence_payload jsonb");
    expect(loader).not.toMatch(/security\s+definer/i);
    expect(loader).not.toMatch(/execute\s+immediate|format\s*\(/i);
    expect(normalized).toContain("revoke execute on function public.load_reviewed_completion_evidence_batch(uuid, jsonb, jsonb, jsonb) from public");
    expect(normalized).toContain("revoke execute on function public.load_reviewed_completion_evidence_batch(uuid, jsonb, jsonb, jsonb) from anon");
    expect(normalized).toContain("revoke execute on function public.load_reviewed_completion_evidence_batch(uuid, jsonb, jsonb, jsonb) from authenticated");
    expect(normalized).toContain("grant execute on function public.load_reviewed_completion_evidence_batch(uuid, jsonb, jsonb, jsonb) to service_role");
  });

  it("makes every invoker dependency an explicit service-role privilege", () => {
    expect(normalized).toContain("grant usage on schema public, extensions to service_role");
    expect(normalized).toContain("grant usage, select on sequence public.activities_id_seq to service_role");
    expect(normalized).toContain("grant select on public.trails, public.trail_segments to service_role");
    for (const signature of [
      "extensions.st_setsrid(extensions.geometry, integer)",
      "extensions.st_geomfromgeojson(text)",
      "extensions.geometrytype(extensions.geometry)",
      "extensions.st_isempty(extensions.geometry)",
      "extensions.st_isvalid(extensions.geometry)",
      "extensions.st_equals(extensions.geometry, extensions.geometry)",
    ]) {
      expect(normalized).toContain(`grant execute on function ${signature} to service_role`);
    }
    expect(normalized).not.toMatch(/grant (?:select|insert|update|delete)[^;]*public\.(?:trails|trail_segments)[^;]*to (?:anon|authenticated)/);
  });

  it("rejects malformed JSON and validates exact two-dimensional GeoJSON before PostGIS conversion", () => {
    expect(normalizedLoader).toContain("run_payload->>'loader_schema_version' is distinct from 'reviewed-evidence-loader-v1'");
    expect(normalizedLoader).toContain("activity_item->'geometry'->>'type' is distinct from 'MultiLineString'");
    expect(normalizedLoader).toContain("jsonb_array_length(position_item) <> 2");
    expect(normalizedLoader).toContain("jsonb_typeof(position_item->0) is distinct from 'number'");
    expect(normalizedLoader).toContain("longitude < -180 or longitude > 180 or latitude < -90 or latitude > 90");
    expect(normalizedLoader).toContain("expected_activity_geom is null");
    expect(normalizedLoader).toContain("evidence_item->>'decision' is distinct from 'accepted'");
    expect(normalizedLoader).toContain("activity_item ? 'user_id'");
    expect(normalizedLoader).toContain("evidence_item ? 'user_id'");
  });

  it("resolves stable keys only through the verified production segment and parent", () => {
    expect(loader).toContain("from public.trail_segments s");
    expect(loader).toContain("join public.trails t on t.id = s.trail_id");
    expect(loader).toContain("s.segment_key = evidence_item->>'segment_key'");
    expect(loader).toContain("s.data_status = 'verified'");
    expect(loader).toContain("s.verification_status = 'human_verified'");
    expect(loader).toContain("t.data_status = 'verified'");
    expect(loader).toContain("t.verification_status = 'human_verified'");
    expect(loader).not.toMatch(/evidence_item->>'future_trail_segment_id'|evidence_item->>'activity_id'/);
  });

  it("uses compare-before-insert idempotency without rewriting accepted rows", () => {
    expect(loader).toContain("Activity identity conflict for %.");
    expect(loader).toContain("Completion evidence identity conflict for %.");
    expect(loader).toContain("ce.accepted_at = (evidence_item->>'accepted_at')::timestamptz");
    expect(loader).toContain("ce.provenance = evidence_item->'provenance'");
    expect(loader).not.toMatch(/update\s+public\.(activities|completion_evidence)/i);
    expect(normalizedLoader).toContain("'evidence_already_loaded', evidence_already_loaded");
  });

  it("is one atomic function and never creates a SegmentCompletion", () => {
    expect(loader).not.toMatch(/insert\s+into\s+public\.segment_completions/i);
    expect(loader).not.toMatch(/exception\s+when/i);
    expect(loader).not.toMatch(/commit|rollback/i);
    expect(safeResult).not.toMatch(/geometry'|evidence'|provenance'/i);
    expect(normalizedLoader).toContain("'artifact_fingerprint', run_payload->>'artifact_fingerprint'");
    expect(normalizedLoader).toContain("'activities_created', activities_created");
    expect(normalizedLoader).toContain("'evidence_created', evidence_created");
  });
});