import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration010 = fs.readFileSync(path.join(root, "supabase/migrations/010_completion_workflow.sql"), "utf8");

function normalizedSql(sql: string) {
  return sql.replace(/\s+/g, " ").toLowerCase();
}

function blockAfter(marker: string) {
  const start = migration010.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  return migration010.slice(start);
}

const normalizedMigration010 = normalizedSql(migration010);
const manualInsertPolicy = blockAfter('create policy "authenticated can manually create own completions"').split('create policy "authenticated can delete own completions"')[0];
const normalizedManualInsertPolicy = normalizedSql(manualInsertPolicy);

describe("M7A completion workflow migration contract", () => {
  it("adds only the minimal completion evidence linkage and completion constraints", () => {
    expect(normalizedMigration010).toContain("add column if not exists completion_evidence_id uuid references public.completion_evidence(id) on delete no action");
    expect(normalizedMigration010).not.toContain("references public.completion_evidence(id) on delete restrict");
    expect(normalizedMigration010).not.toContain("references public.completion_evidence(id) on delete cascade");
    expect(normalizedMigration010).not.toContain("references public.completion_evidence(id) on delete set null");
    expect(normalizedMigration010).toContain("create unique index if not exists segment_completions_completion_evidence_id_key on public.segment_completions(completion_evidence_id) where completion_evidence_id is not null");
    expect(migration010).toContain("segment_completions_match_confidence_range_chk");
    expect(normalizedMigration010).toContain("check (match_confidence is null or (match_confidence between 0 and 1))");
    expect(migration010).toContain("segment_completions_notes_length_chk");
    expect(normalizedMigration010).toContain("check (notes is null or char_length(notes) <= 1000)");
    expect(migration010).not.toMatch(/confirmed_at|updated_at|evidence_snapshot/i);
    expect(migration010).not.toMatch(/alter table public\.segment_completions[^;]*completed_on/i);
  });

  it("defines a narrow verified published segment helper for policy authorization", () => {
    expect(migration010).toMatch(/create or replace function public\.is_verified_published_segment\(target_segment_id bigint\)/);
    expect(migration010).not.toMatch(/create or replace function public\.is_verified_published_segment\([^)]*,/);
    expect(normalizedMigration010).toContain("returns boolean language sql stable security definer set search_path = ''");
    expect(migration010).toContain("from public.trail_segments s");
    expect(migration010).toContain("join public.trails t on t.id = s.trail_id");
    expect(migration010).toContain("where s.id = target_segment_id");
    expect(migration010).toContain("s.data_status = 'verified'");
    expect(migration010).toContain("s.verification_status = 'human_verified'");
    expect(migration010).toContain("t.data_status = 'verified'");
    expect(migration010).toContain("t.verification_status = 'human_verified'");
    expect(migration010).not.toMatch(/execute\s+immediate|format\s*\(/i);
  });

  it("locks down verified-segment helper execution before granting authenticated use", () => {
    expect(migration010).toContain("revoke execute on function public.is_verified_published_segment(bigint) from public");
    expect(migration010).toContain("revoke execute on function public.is_verified_published_segment(bigint) from anon");
    expect(migration010).toContain("revoke execute on function public.is_verified_published_segment(bigint) from authenticated");
    expect(migration010).toContain("grant execute on function public.is_verified_published_segment(bigint) to authenticated");
  });

  it("drops every historical completion policy before recreating the final policy set", () => {
    const requiredDrops = [
      "users read own completions",
      "users create own completions",
      "users update own completions",
      "users delete own completions",
      "authenticated can read own completions",
      "authenticated can manually create own completions",
      "authenticated can delete own completions",
    ];

    for (const policyName of requiredDrops) {
      expect(migration010).toContain(`drop policy if exists "${policyName}" on public.segment_completions`);
    }
  });

  it("resets privileges and grants authenticated users only select/delete plus exact column-limited manual insert", () => {
    expect(migration010).toContain("revoke all on public.segment_completions from public, anon, authenticated");
    expect(migration010).toContain("grant select, delete on public.segment_completions to authenticated");

    const insertGrant = normalizedMigration010.match(/grant insert \(([^)]+)\) on public\.segment_completions to authenticated/);
    expect(insertGrant).not.toBeNull();
    const columns = insertGrant?.[1].split(",").map((column) => column.trim()) ?? [];
    expect(columns).toEqual(["user_id", "segment_id", "completed_on", "notes"]);
    expect(columns).not.toEqual(expect.arrayContaining(["id", "activity_id", "completion_method", "match_confidence", "completion_evidence_id", "created_at"]));

    expect(normalizedMigration010).not.toContain("grant insert on public.segment_completions to authenticated");
    expect(normalizedMigration010).not.toContain("grant update on public.segment_completions to authenticated");
    expect(normalizedMigration010).not.toContain("grant select, insert, update, delete on public.segment_completions to authenticated");
    expect(migration010).toContain("grant select, insert, update, delete on public.segment_completions to service_role");
  });

  it("defines own-row select/delete policies and a single helper-backed manual insert policy", () => {
    expect(migration010).toMatch(/create policy "authenticated can read own completions"[\s\S]*for select[\s\S]*to authenticated[\s\S]*user_id = \(select auth\.uid\(\)\)/);
    expect(migration010).toMatch(/create policy "authenticated can delete own completions"[\s\S]*for delete[\s\S]*to authenticated[\s\S]*user_id = \(select auth\.uid\(\)\)/);
    expect(manualInsertPolicy).toMatch(/for insert[\s\S]*to authenticated[\s\S]*with check/);
    expect(manualInsertPolicy).toContain("completion_method = 'manual'");
    expect(manualInsertPolicy).toContain("activity_id is null");
    expect(manualInsertPolicy).toContain("completion_evidence_id is null");
    expect(manualInsertPolicy).toContain("match_confidence is null");
    expect(normalizedManualInsertPolicy).toContain("and public.is_verified_published_segment( segment_completions.segment_id )");
    expect(normalizedManualInsertPolicy).not.toContain("exists (");
    expect(normalizedManualInsertPolicy).not.toContain("from public.trail_segments");
    expect(normalizedManualInsertPolicy).not.toContain("join public.trails");
  });

  it("keeps evidence tables isolated and does not introduce GPS evidence RPCs in M7A", () => {
    expect(migration010).toContain("revoke all on public.activity_match_runs from public, anon, authenticated");
    expect(migration010).toContain("revoke all on public.activity_segment_match_candidates from public, anon, authenticated");
    expect(migration010).toContain("revoke all on public.activity_segment_match_review_decisions from public, anon, authenticated");
    expect(migration010).toContain("revoke all on public.completion_evidence from public, anon, authenticated");
    expect(migration010).not.toMatch(/confirm_completion_evidence|list_confirmable_completion_evidence/i);
    expect(migration010).not.toMatch(/grant\s+select\s+on\s+public\.completion_evidence\s+to\s+authenticated/i);
  });
});