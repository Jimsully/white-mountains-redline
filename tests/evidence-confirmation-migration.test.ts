import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(process.cwd(), "supabase/migrations/012_evidence_confirmation.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const migration011 = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/011_reviewed_evidence_materialization.sql"), "utf8");
const normalized = migration.replace(/\s+/g, " ").trim().toLowerCase();
const normalizedMigration011 = migration011.replace(/\s+/g, " ").trim().toLowerCase();

function functionBlock(name: string) {
  return migration.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, "i"))?.[0] ?? "";
}

function normalizedSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function returnColumns(sql: string) {
  const columns = sql.match(/returns table\s*\(([\s\S]*?)\)\s*language/i)?.[1] ?? "";
  return columns.split(",").map((column) => normalizedSql(column));
}

const dateHelper = functionBlock("validated_completion_evidence_activity_date");
const listRpc = functionBlock("list_confirmable_completion_evidence");
const confirmRpc = functionBlock("confirm_completion_evidence");
const normalizedDateHelper = normalizedSql(dateHelper);
const normalizedListRpc = normalizedSql(listRpc);
const normalizedConfirmRpc = normalizedSql(confirmRpc);

describe("migration 012 evidence confirmation static contract", () => {
  it("exists and defines only the reviewed M7D-B function boundary", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(dateHelper).not.toBe("");
    expect(listRpc).not.toBe("");
    expect(confirmRpc).not.toBe("");
    expect(migration).not.toMatch(/\b(?:alter|create)\s+table\b/i);
    expect(migration).not.toMatch(/create\s+policy|enable\s+row\s+level\s+security/i);
  });

  it("defines the exact user-facing signatures and sanitized return columns", () => {
    expect(listRpc).toMatch(/create or replace function public\.list_confirmable_completion_evidence\(\)/i);
    expect(returnColumns(listRpc)).toEqual([
      "evidence_id uuid",
      "segment_id bigint",
      "trail_name text",
      "segment_name text",
      "region text",
      "evidence_source text",
      "accepted_at timestamptz",
      "activity_title text",
      "activity_date date",
    ]);
    expect(confirmRpc).toMatch(/create or replace function public\.confirm_completion_evidence\(target_evidence_id uuid\)/i);
    expect(returnColumns(confirmRpc)).toEqual(["status text", "segment_id bigint"]);
    expect(listRpc).not.toMatch(/\buser_id\s+(?:uuid|text|bigint)\b/i);
    expect(confirmRpc.match(/confirm_completion_evidence\(([^)]*)\)/i)?.[1]).toBe("target_evidence_id uuid");
  });

  it("hardens both RPCs as empty-search-path security definer functions without dynamic SQL", () => {
    for (const rpc of [normalizedListRpc, normalizedConfirmRpc]) {
      expect(rpc).toContain("security definer set search_path = ''");
      expect(rpc).not.toMatch(/execute immediate|format\s*\(/i);
    }
  });

  it("revokes every application-role default and grants RPC execution only to authenticated", () => {
    const signatures = ["public.list_confirmable_completion_evidence()", "public.confirm_completion_evidence(uuid)"];
    for (const signature of signatures) {
      for (const role of ["public", "anon", "authenticated", "service_role"]) {
        expect(normalized).toContain(`revoke execute on function ${signature} from ${role}`);
      }
      expect(normalized).toContain(`grant execute on function ${signature} to authenticated`);
      expect(normalized).not.toContain(`grant execute on function ${signature} to anon`);
      expect(normalized).not.toContain(`grant execute on function ${signature} to service_role`);
    }
    expect(normalizedMigration011).toContain("revoke all on public.completion_evidence from public, anon, authenticated");
    expect(normalized).not.toMatch(/grant\s+(?:select|insert|update|delete|all)[^;]*public\.completion_evidence[^;]*to\s+authenticated/);
  });

  it("keeps the date validator internal and rejects malformed immutable provenance dates", () => {
    expect(dateHelper).toMatch(/create or replace function public\.validated_completion_evidence_activity_date\(evidence_provenance jsonb\)\s*returns date/i);
    expect(normalizedDateHelper).toContain("language plpgsql stable set search_path = ''");
    expect(normalizedDateHelper).toContain("jsonb_typeof(evidence_provenance) is distinct from 'object'");
    expect(normalizedDateHelper).toContain("jsonb_typeof(evidence_provenance->'activitydate') is distinct from 'string'");
    expect(normalizedDateHelper).toContain("!~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'");
    expect(normalizedDateHelper).toContain("return activity_date_text::date");
    expect(normalizedDateHelper).toContain("when invalid_datetime_format or datetime_field_overflow then return null");
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(normalized).toContain(`revoke execute on function public.validated_completion_evidence_activity_date(jsonb) from ${role}`);
    }
    expect(normalized).not.toMatch(/grant execute on function public\.validated_completion_evidence_activity_date/);
  });

  it("uses auth.uid ownership and the exact non-manual evidence eligibility rules", () => {
    for (const rpc of [normalizedListRpc, normalizedConfirmRpc]) {
      expect(rpc).toContain("auth.uid()");
      expect(rpc).toContain("ce.user_id =");
      expect(rpc).toContain("ce.accepted_at is not null");
      expect(rpc).toContain("ce.future_trail_segment_id is not null");
      expect(rpc).toContain("ce.evidence_source in ('historical_gps', 'gpx_import', 'connected_service')");
      expect(rpc).toContain("validated_completion_evidence_activity_date(ce.provenance)");
      expect(rpc).toContain("ce.activity_id is null or a.id is not null");
      expect(rpc).not.toMatch(/evidence_source\s*=\s*'manual'|evidence_source\s+in\s*\([^)]*'manual'/i);
    }
    expect(normalizedConfirmRpc).toContain("where ce.id = target_evidence_id and ce.user_id = current_user_id");
  });

  it("returns only the sanitized owner projection and filters any existing owner completion", () => {
    expect(normalizedListRpc).toContain("a.title as activity_title");
    expect(normalizedListRpc).toContain("a.user_id = (select auth.uid())");
    expect(normalizedListRpc).toContain("not exists ( select 1 from public.segment_completions sc where sc.user_id = (select auth.uid()) and sc.segment_id = ce.future_trail_segment_id )");
    expect(normalizedListRpc).toContain("order by validated.activity_date desc, ce.accepted_at desc, ce.id");
    expect(returnColumns(listRpc).join(" ")).not.toMatch(/provenance|geometry|coordinates|match_|candidate|activity_id|source_metadata|token|credential/i);
    expect(returnColumns(listRpc)).not.toContain("evidence jsonb");
  });

  it("revalidates and locks the verified segment and verified parent trail", () => {
    for (const rpc of [normalizedListRpc, normalizedConfirmRpc]) {
      expect(rpc).toContain("s.data_status = 'verified'");
      expect(rpc).toContain("s.verification_status = 'human_verified'");
      expect(rpc).toContain("t.data_status = 'verified'");
      expect(rpc).toContain("t.verification_status = 'human_verified'");
    }
    expect(normalizedConfirmRpc).toContain("from public.trail_segments s join public.trails t on t.id = s.trail_id");
    expect(normalizedConfirmRpc).toContain("where s.id = evidence_segment_id");
    expect(normalizedConfirmRpc).toContain("for share of s, t");
  });

  it("derives the exact gpx completion payload from owned evidence and immutable provenance", () => {
    expect(normalizedConfirmRpc).toContain("immutable_activity_date");
    expect(normalizedConfirmRpc).not.toMatch(/a\.activity_date|current_date/);
    expect(normalizedConfirmRpc).not.toMatch(/completed_on[\s\S]{0,250}accepted_at/i);
    expect(normalizedConfirmRpc).toContain("insert into public.segment_completions( user_id, segment_id, activity_id, completed_on, completion_method, match_confidence, notes, completion_evidence_id )");
    expect(normalizedConfirmRpc).toContain("values ( current_user_id, evidence_segment_id, evidence_activity_id, immutable_activity_date, 'gpx_match', null, null, owned_evidence_id )");
    expect(normalizedConfirmRpc).not.toMatch(/'manual'|'admin'/);
  });

  it("classifies retries and expected uniqueness/FK races without changing existing rows", () => {
    const assignedStatuses = [...normalizedConfirmRpc.matchAll(/status := '([^']+)'/g)].map((match) => match[1]);
    expect([...new Set(assignedStatuses)].sort()).toEqual(["already_completed", "already_confirmed", "confirmed", "not_confirmable"]);
    expect(normalizedConfirmRpc.match(/status := 'not_confirmable'; segment_id := null/g)).toHaveLength(4);
    expect(normalizedConfirmRpc).toContain("from public.segment_completions sc where sc.user_id = current_user_id and sc.segment_id = evidence_segment_id for update");
    expect(normalizedConfirmRpc).toContain("existing_completion_evidence_id is not distinct from owned_evidence_id");
    expect(normalizedConfirmRpc).toContain("when unique_violation then");
    expect(normalizedConfirmRpc).toContain("sc.segment_id = evidence_segment_id or sc.completion_evidence_id = owned_evidence_id");
    expect(normalizedConfirmRpc).toContain("when foreign_key_violation then status := 'not_confirmable'; segment_id := null");
    expect(normalizedConfirmRpc).not.toContain("when others");
    expect(normalizedConfirmRpc).not.toMatch(/update\s+public\.segment_completions|delete\s+from\s+public\.segment_completions/i);
  });

  it("never mutates evidence or requires service_role for normal confirmation", () => {
    expect(`${listRpc}\n${confirmRpc}`).not.toMatch(/(?:update|delete from)\s+public\.completion_evidence/i);
    expect(confirmRpc).not.toMatch(/service_role/i);
    expect(normalized).toContain("grant execute on function public.confirm_completion_evidence(uuid) to authenticated");
  });
});
