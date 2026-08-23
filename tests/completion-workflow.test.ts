import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CompletionRepository } from "@/lib/completions/completion-repository";
import { applySegmentCompletions } from "@/lib/completions/composition";
import { COMPLETION_SAVE_FAILED } from "@/lib/completions/errors";
import { createTrailRepositoryRuntime } from "@/lib/repositories";
import { isValidProductionSegmentId, mapSegmentCompletionRow, normalizeCompletedOn, normalizeCompletionNotes, validateManualCompletionInput } from "@/types/completion";
import type { SegmentCompletionRow } from "@/types/completion";
import type { TrailSegment } from "@/types/trails";

const root = process.cwd();
const actionsSource = fs.readFileSync(path.join(root, "lib/completions/actions.ts"), "utf8");
const repositorySource = fs.readFileSync(path.join(root, "lib/completions/completion-repository.ts"), "utf8");
const redlineAppSource = fs.readFileSync(path.join(root, "app/redline/RedlineApp.tsx"), "utf8");
const progressPanelSource = fs.readFileSync(path.join(root, "components/ProgressPanel.tsx"), "utf8");

function segment(id: string, completed = false): TrailSegment {
  return {
    id,
    slug: `segment-${id}`,
    trailId: "trail-1",
    trailName: "Trail",
    segmentName: `Segment ${id}`,
    region: "Franconia-Pemigewasset",
    miles: 1,
    completed,
    coordinates: [[-71, 44], [-71.1, 44.1]],
    dataStatus: "verified",
    verificationStatus: "human_verified",
    provenance: { provider: "demo", dataset: "test", sourceFeatureIds: [], manuallyModified: false },
  };
}

function completion(segmentId: string) {
  return { id: `completion-${segmentId}`, segmentId, completedOn: null, completionMethod: "manual" as const, createdAt: "2026-01-01T00:00:00Z" };
}

class QueryMock {
  filters: Array<[string, unknown]> = [];
  insertPayload: unknown;
  deleteCalled = false;

  constructor(private readonly result: unknown = {}) {}

  select() { return this; }
  order() { return this; }
  insert(payload: unknown) { this.insertPayload = payload; return this; }
  delete() { this.deleteCalled = true; return this; }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  single() { return this.result; }
  maybeSingle() { return this.result; }
  then(resolve: (value: unknown) => void) { resolve(this.result); }
}

class SupabaseMock {
  queries: QueryMock[] = [];
  constructor(private readonly results: unknown[]) {}
  from(table: string) {
    expect(table).toBe("segment_completions");
    const query = new QueryMock(this.results.shift());
    this.queries.push(query);
    return query;
  }
}

describe("completion composition", () => {
  it("keeps all current segments incomplete when no completions exist", () => {
    expect(applySegmentCompletions([segment("1", true), segment("2", true)], []).map((item) => item.completed)).toEqual([false, false]);
  });

  it("marks only matching current segments complete and ignores stale completion rows", () => {
    const result = applySegmentCompletions([segment("1"), segment("2")], [completion("2"), completion("999")]);
    expect(result.map((item) => item.completed)).toEqual([false, true]);
  });

  it("handles multiple completions deterministically without mutating inputs", () => {
    const inputs = [segment("1"), segment("2")];
    const before = JSON.stringify(inputs);
    const result = applySegmentCompletions(inputs, [completion("1"), completion("2")]);
    expect(result.map((item) => item.completed)).toEqual([true, true]);
    expect(JSON.stringify(inputs)).toBe(before);
    expect(result[0]).not.toBe(inputs[0]);
  });
});

describe("completion validation and mapping", () => {
  it("accepts only positive PostgreSQL bigint production segment ids", () => {
    expect(isValidProductionSegmentId("1")).toBe(true);
    expect(isValidProductionSegmentId("42")).toBe(true);
    expect(isValidProductionSegmentId("9223372036854775807")).toBe(true);
    expect(isValidProductionSegmentId("0")).toBe(false);
    expect(isValidProductionSegmentId("-1")).toBe(false);
    expect(isValidProductionSegmentId("demo-1")).toBe(false);
    expect(isValidProductionSegmentId("1.2")).toBe(false);
    expect(isValidProductionSegmentId("9223372036854775808")).toBe(false);
    expect(isValidProductionSegmentId("12345678901234567890")).toBe(false);
  });

  it("validates completion dates and notes", () => {
    expect(normalizeCompletedOn(undefined)).toBeNull();
    expect(normalizeCompletedOn("2026-08-18")).toBe("2026-08-18");
    expect(normalizeCompletedOn("2026-02-30")).toBeUndefined();
    expect(normalizeCompletedOn("08/18/2026")).toBeUndefined();
    expect(normalizeCompletionNotes("  done  ")).toBe("done");
    expect(normalizeCompletionNotes("")).toBeNull();
    expect(normalizeCompletionNotes("x".repeat(1001))).toBeUndefined();
  });

  it("validates manual completion input and maps rows without leaking snake_case", () => {
    expect(validateManualCompletionInput({ segmentId: "42", completedOn: "2026-08-18", notes: " ok " })).toEqual({ ok: true, value: { segmentId: "42", completedOn: "2026-08-18", notes: "ok" } });
    expect(validateManualCompletionInput({ segmentId: "demo-42" }).ok).toBe(false);
    const row: SegmentCompletionRow = { id: 7, segment_id: "42", completed_on: null, completion_method: "manual", created_at: "now" };
    expect(mapSegmentCompletionRow(row)).toEqual({ id: "7", segmentId: "42", completedOn: null, completionMethod: "manual", createdAt: "now" });
  });
});

describe("CompletionRepository", () => {
  it("lists and maps only the selected completion fields scoped to the repository user", async () => {
    const supabase = new SupabaseMock([{ data: [{ id: 1, segment_id: 2, completed_on: null, completion_method: "manual", created_at: "now" }], error: null }]);
    const result = await new CompletionRepository(supabase as never, "user-1").listOwnCompletions();
    expect(result).toEqual([{ id: "1", segmentId: "2", completedOn: null, completionMethod: "manual", createdAt: "now" }]);
    expect(supabase.queries[0].filters).toContainEqual(["user_id", "user-1"]);
  });

  it("manual insert payload contains only M7A-permitted columns", async () => {
    const supabase = new SupabaseMock([{ data: { id: 1, segment_id: "2", completed_on: null, completion_method: "manual", created_at: "now" }, error: null }]);
    await new CompletionRepository(supabase as never, "user-1").markManualComplete({ segmentId: "2", completedOn: null, notes: null });
    expect(supabase.queries[0].insertPayload).toEqual({ user_id: "user-1", segment_id: "2", completed_on: null, notes: null });
    expect(Object.keys(supabase.queries[0].insertPayload as Record<string, unknown>)).toEqual(["user_id", "segment_id", "completed_on", "notes"]);
  });

  it("returns an existing exact completion on duplicate insert", async () => {
    const supabase = new SupabaseMock([
      { data: null, error: { code: "23505", message: "duplicate" } },
      { data: { id: 9, segment_id: "2", completed_on: null, completion_method: "manual", created_at: "then" }, error: null },
    ]);
    await expect(new CompletionRepository(supabase as never, "user-1").markManualComplete({ segmentId: "2", completedOn: null, notes: null })).resolves.toEqual({ id: "9", segmentId: "2", completedOn: null, completionMethod: "manual", createdAt: "then" });
    expect(supabase.queries[1].filters).toContainEqual(["user_id", "user-1"]);
    expect(supabase.queries[1].filters).toContainEqual(["segment_id", "2"]);
  });

  it("sanitizes unrelated insert errors and missing duplicate lookups", async () => {
    await expect(new CompletionRepository(new SupabaseMock([{ data: null, error: { code: "42501", message: "rls" } }]) as never, "user-1").markManualComplete({ segmentId: "2", completedOn: null, notes: null })).rejects.toThrow(COMPLETION_SAVE_FAILED);
    await expect(new CompletionRepository(new SupabaseMock([{ data: null, error: { code: "23505", message: "duplicate" } }, { data: null, error: null }]) as never, "user-1").markManualComplete({ segmentId: "2", completedOn: null, notes: null })).rejects.toThrow(COMPLETION_SAVE_FAILED);
  });

  it("remove scopes deletion to the repository user and segment and is safe when absent", async () => {
    const supabase = new SupabaseMock([{ error: null }]);
    await expect(new CompletionRepository(supabase as never, "user-1").removeCompletion("2")).resolves.toBeUndefined();
    expect(supabase.queries[0].deleteCalled).toBe(true);
    expect(supabase.queries[0].filters).toContainEqual(["user_id", "user-1"]);
    expect(supabase.queries[0].filters).toContainEqual(["segment_id", "2"]);
  });
});

function restoreEnv(previous: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("completion runtime and action source contracts", () => {
  it("uses explicit repository runtime modes without duplicating private completion reads into TrailRepository", () => {
    const previous = { TRAIL_REPOSITORY: process.env.TRAIL_REPOSITORY, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
    delete process.env.TRAIL_REPOSITORY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(createTrailRepositoryRuntime().mode).toBe("demo");
    process.env.TRAIL_REPOSITORY = "supabase";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable";
    expect(createTrailRepositoryRuntime().mode).toBe("supabase");
    restoreEnv(previous);
    expect(process.env.TRAIL_REPOSITORY).toBe(previous.TRAIL_REPOSITORY);
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(previous.NEXT_PUBLIC_SUPABASE_URL);
    expect(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe(previous.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  });

  it("serializes selected-segment completion mutations in the existing UI", () => {
    expect(redlineAppSource).toContain("if (pendingSegmentId !== null) return");
    expect(redlineAppSource).toContain("completionPending={pendingSegmentId !== null}");
    expect(progressPanelSource).toContain("disabled={completionPending || completionMode === \"unavailable\"}");
  });

  it("uses mode-specific demo and persistent progress copy", () => {
    expect(progressPanelSource).toContain("const mileageUnit = isDemo ? \"demo mi\" : \"mi\"");
    expect(progressPanelSource).toContain("For progress tracking only. Not for navigation.");
    expect(progressPanelSource).toContain("Local demo only — progress is not saved.");
  });

  it("server actions use authenticated user orchestration and no service role or evidence RPCs", () => {
    expect(actionsSource).toContain("getAuthenticatedUser");
    expect(actionsSource).toContain("new CompletionRepository(auth.supabase, auth.user.id)");
    expect(actionsSource).toContain("revalidatePath(\"/\")");
    expect(actionsSource).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(actionsSource).not.toMatch(/completion_evidence|confirm_completion_evidence|list_confirmable_completion_evidence/);
    expect(repositorySource).not.toMatch(/completion_method\s*:/);
    expect(repositorySource).not.toMatch(/activity_id\s*:/);
    expect(repositorySource).not.toMatch(/completion_evidence_id\s*:/);
    expect(repositorySource).not.toMatch(/match_confidence\s*:/);
    expect(repositorySource).not.toMatch(/created_at\s*:/);
  });
});