import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration013Path = path.join(root, "supabase/migrations/013_public_projection_hardening.sql");
const migration008Path = path.join(root, "supabase/migrations/008_verified_publication.sql");
const migrationsDir = path.join(root, "supabase/migrations");

const migration013 = fs.readFileSync(migration013Path, "utf8");
const migration008 = fs.readFileSync(migration008Path, "utf8");
const normalized013 = normalizeSql(migration013);
const statements013 = statements(migration013);

const browserRoles = ["public", "anon", "authenticated"];
const baseTrailTables = ["public.trails", "public.trail_segments"];
const dangerousBaseTablePrivileges = ["select", "insert", "update", "delete", "truncate", "references", "trigger", "all", "all privileges"];

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function statements(sql: string) {
  return sql
    .split(";")
    .map((statement) => normalizeSql(statement))
    .filter(Boolean);
}

function statementContaining(sql: string, pattern: RegExp) {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .find((statement) => pattern.test(statement)) ?? "";
}

function splitSqlList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function normalizeGrantee(value: string) {
  return value.replace(/\s+with\s+grant\s+option$/, "");
}

function grantOnRelation(statement: string, relation: string) {
  const relationPattern = relation.replace(".", "\\.");
  return statement.match(new RegExp(`^grant\\s+(.+?)\\s+on\\s+(?:table\\s+)?${relationPattern}\\s+to\\s+(.+)$`));
}

function grantsPrivilegeToRole(statement: string, relation: string, privileges: string[], roles: string[]) {
  const grant = grantOnRelation(statement, relation);
  if (!grant) {
    return false;
  }

  const grantedPrivileges = splitSqlList(grant[1]);
  const grantedRoles = splitSqlList(grant[2]).map(normalizeGrantee);

  return grantedPrivileges.some((privilege) => privileges.includes(privilege)) && grantedRoles.some((role) => roles.includes(role));
}

describe("migration 013 public projection hardening contract", () => {
  it("preserves migration 013 as the owner-rights/base-table privilege hardening step", () => {
    expect(fs.existsSync(migration013Path)).toBe(true);
    expect(normalized013).toContain("alter view public.trail_segment_api set ( security_invoker = false, security_barrier = true )");
    expect(migration013).not.toMatch(/drop\s+view|create(?:\s+or\s+replace)?\s+view/i);
  });

  it("revokes direct trail network base-table access from browser roles", () => {
    for (const table of ["public.trails", "public.trail_segments"]) {
      const revoke = normalizeSql(statementContaining(migration013, new RegExp(`revoke all privileges[\\s\\S]*${table.replace(".", "\\.")}`, "i")));
      expect(revoke).toContain(`on table ${table}`);
      expect(revoke).toContain("from public, anon, authenticated");
    }
  });

  it("normalizes trail_segment_api privileges and grants only SELECT to anon/authenticated", () => {
    const revoke = normalizeSql(statementContaining(migration013, /revoke all privileges[\s\S]*public\.trail_segment_api/i));
    expect(revoke).toContain("on table public.trail_segment_api");
    expect(revoke).toContain("from public, anon, authenticated");

    const grants = statements013
      .map((statement) => grantOnRelation(statement, "public.trail_segment_api"))
      .filter((grant): grant is RegExpMatchArray => grant !== null);

    expect(grants).toHaveLength(1);
    expect(splitSqlList(grants[0][1])).toEqual(["select"]);
    expect(splitSqlList(grants[0][2])).toEqual(["anon", "authenticated"]);
  });

  it("does not regrant trail network base-table privileges to browser roles", () => {
    for (const table of baseTrailTables) {
      const forbiddenGrant = statements013.find((statement) =>
        grantsPrivilegeToRole(statement, table, dangerousBaseTablePrivileges, browserRoles),
      );
      expect(forbiddenGrant).toBeUndefined();
    }
  });

  it("does not revoke service_role, change default ACLs, grant sequences, or change RLS", () => {
    expect(statements013.some((statement) => /\brevoke\b.+\bfrom\b.*\bservice_role\b/.test(statement))).toBe(false);
    expect(normalized013).not.toMatch(/alter\s+default\s+privileges|default\s+acl/);
    expect(statements013.some((statement) => /\bgrant\b.+\bon\s+(?:sequence|all\s+sequences)\b/.test(statement))).toBe(false);
    expect(normalized013).not.toMatch(/\b(?:create|drop)\s+policy\b|enable\s+row\s+level\s+security|disable\s+row\s+level\s+security/);
  });

  it("leaves migrations 001-012 as the existing migration history", () => {
    const previousMigrations = fs.readdirSync(migrationsDir).filter((file) => /^(?:00[1-9]|01[0-2])_.*\.sql$/.test(file)).sort();
    expect(previousMigrations).toEqual([
      "001_init.sql",
      "002_source_trail_features.sql",
      "003_api_projection_and_source_load.sql",
      "004_security_hardening.sql",
      "005_reconciliation_workspace.sql",
      "006_segment_construction_workspace.sql",
      "007_activity_matching.sql",
      "008_verified_publication.sql",
      "009_accounts_persistence.sql",
      "010_completion_workflow.sql",
      "011_reviewed_evidence_materialization.sql",
      "012_evidence_confirmation.sql",
    ]);
  });
});

describe("trail_segment_api verified-only predicate contract", () => {
  it("requires verified/human-reviewed status for both segment and parent trail", () => {
    const viewDefinition = statementContaining(migration008, /create view public\.trail_segment_api/i);
    const normalizedView = normalizeSql(viewDefinition);
    expect(normalizedView).toContain("from public.trail_segments s join public.trails t on t.id = s.trail_id");
    expect(normalizedView).toContain("where s.data_status = 'verified'");
    expect(normalizedView).toContain("and s.verification_status = 'human_verified'");
    expect(normalizedView).toContain("and t.data_status = 'verified'");
    expect(normalizedView).toContain("and t.verification_status = 'human_verified'");
  });
});
