import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CompletionEvidenceRepository } from "@/lib/completions/completion-evidence-repository";
import { EVIDENCE_CONFIRM_FAILED, EVIDENCE_LIST_FAILED } from "@/lib/completions/errors";
import { isValidCanonicalUuid } from "@/types/completion";

const evidenceId = "11111111-2222-4333-8444-555555555555";

function evidenceRow(overrides: Record<string, unknown> = {}) {
  return {
    evidence_id: evidenceId,
    segment_id: "9223372036854775807",
    trail_name: "Franconia Ridge Trail",
    segment_name: "Little Haystack to Lincoln",
    region: "Franconia-Pemigewasset",
    evidence_source: "historical_gps",
    accepted_at: "2026-08-20T14:30:00+00:00",
    activity_title: "Ridge day",
    activity_date: "2026-08-18",
    ignored_private_field: { geometry: "not retained" },
    ...overrides,
  };
}

class SupabaseRpcMock {
  calls: Array<{ name: string; args: unknown }> = [];

  constructor(private readonly results: unknown[]) {}

  async rpc(name: string, args?: unknown) {
    this.calls.push({ name, args });
    return this.results.shift();
  }
}

describe("CompletionEvidenceRepository list mapping", () => {
  it("uses one intentional canonical UUID policy without normalization", () => {
    const valid = [
      "11111111-2222-4333-8444-555555555555",
      "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE",
    ];
    const invalid = [
      "",
      "11111111222243338444555555555555",
      "11111111-2222-4333-8444-55555555555",
      "11111111-2222-4333-8444-5555555555555",
      "11111111-2222-4333-8444-55555555555g",
      " 11111111-2222-4333-8444-555555555555",
      "11111111-2222-4333-8444-555555555555 ",
    ];

    valid.forEach((value) => expect(isValidCanonicalUuid(value)).toBe(true));
    invalid.forEach((value) => expect(isValidCanonicalUuid(value)).toBe(false));
  });

  it("calls the exact owner projection RPC without arguments and maps only sanitized fields", async () => {
    const supabase = new SupabaseRpcMock([{ data: [evidenceRow()], error: null }]);
    const result = await new CompletionEvidenceRepository(supabase as never).listConfirmableEvidence();

    expect(supabase.calls).toEqual([{ name: "list_confirmable_completion_evidence", args: undefined }]);
    expect(result).toEqual([{
      evidenceId,
      segmentId: "9223372036854775807",
      trailName: "Franconia Ridge Trail",
      segmentName: "Little Haystack to Lincoln",
      region: "Franconia-Pemigewasset",
      evidenceSource: "historical_gps",
      acceptedAt: "2026-08-20T14:30:00+00:00",
      activityTitle: "Ridge day",
      activityDate: "2026-08-18",
    }]);
    expect(result[0]).not.toHaveProperty("ignored_private_field");
  });

  it("accepts an empty list, nullable titles, all source values, and safe numeric bigint values", async () => {
    await expect(new CompletionEvidenceRepository(new SupabaseRpcMock([{ data: [], error: null }]) as never).listConfirmableEvidence()).resolves.toEqual([]);

    const rows = [
      evidenceRow({ evidence_id: "11111111-2222-4333-8444-555555555551", segment_id: 1, evidence_source: "historical_gps", activity_title: null }),
      evidenceRow({ evidence_id: "11111111-2222-4333-8444-555555555552", segment_id: Number.MAX_SAFE_INTEGER, evidence_source: "gpx_import" }),
      evidenceRow({ evidence_id: "11111111-2222-4333-8444-555555555553", segment_id: "42", evidence_source: "connected_service" }),
    ];
    const result = await new CompletionEvidenceRepository(new SupabaseRpcMock([{ data: rows, error: null }]) as never).listConfirmableEvidence();
    expect(result.map((item) => item.segmentId)).toEqual(["1", String(Number.MAX_SAFE_INTEGER), "42"]);
    expect(result.map((item) => item.evidenceSource)).toEqual(["historical_gps", "gpx_import", "connected_service"]);
    expect(result[0].activityTitle).toBeNull();
  });

  it.each(["2024-02-29", "2026-01-01", "2026-06-15"])("accepts the real calendar date %s", async (activityDate) => {
    const repository = new CompletionEvidenceRepository(new SupabaseRpcMock([{ data: [evidenceRow({ activity_date: activityDate })], error: null }]) as never);
    await expect(repository.listConfirmableEvidence()).resolves.toMatchObject([{ activityDate }]);
  });

  it.each([
    ["malformed UUID", { evidence_id: "not-a-uuid" }],
    ["unsafe numeric segment", { segment_id: Number.MAX_SAFE_INTEGER + 1 }],
    ["zero segment", { segment_id: 0 }],
    ["negative segment", { segment_id: -1 }],
    ["fractional segment", { segment_id: 1.5 }],
    ["NaN segment", { segment_id: Number.NaN }],
    ["infinite segment", { segment_id: Number.POSITIVE_INFINITY }],
    ["leading-zero segment string", { segment_id: "01" }],
    ["malformed activity date", { activity_date: "08/18/2026" }],
    ["impossible activity date", { activity_date: "2026-02-30" }],
    ["non-leap February date", { activity_date: "2026-02-29" }],
    ["invalid activity month", { activity_date: "2026-13-01" }],
    ["zero activity month", { activity_date: "2026-00-01" }],
    ["zero activity day", { activity_date: "2026-01-00" }],
    ["overflow activity day", { activity_date: "2026-01-32" }],
    ["non-canonical activity date", { activity_date: "2026-1-01" }],
    ["empty activity date", { activity_date: "" }],
    ["malformed accepted timestamp", { accepted_at: "yesterday" }],
    ["impossible accepted timestamp date", { accepted_at: "2026-02-30T14:30:00+00:00" }],
    ["empty accepted timestamp", { accepted_at: "" }],
    ["unknown source", { evidence_source: "strava" }],
    ["non-null non-string title", { activity_title: 7 }],
    ["missing required string", { trail_name: null }],
  ])("rejects %s", async (_label, overrides) => {
    const repository = new CompletionEvidenceRepository(new SupabaseRpcMock([{ data: [evidenceRow(overrides)], error: null }]) as never);
    await expect(repository.listConfirmableEvidence()).rejects.toThrow(EVIDENCE_LIST_FAILED);
  });

  it("sanitizes RPC errors and non-array responses", async () => {
    const rpcError = new CompletionEvidenceRepository(new SupabaseRpcMock([{ data: null, error: { message: "raw private error", details: "secret" } }]) as never);
    await expect(rpcError.listConfirmableEvidence()).rejects.toThrow(EVIDENCE_LIST_FAILED);
    await expect(new CompletionEvidenceRepository(new SupabaseRpcMock([{ data: {}, error: null }]) as never).listConfirmableEvidence()).rejects.toThrow(EVIDENCE_LIST_FAILED);
  });
});

describe("CompletionEvidenceRepository confirmation mapping", () => {
  it.each([
    ["confirmed", "42"],
    ["already_confirmed", 42],
    ["already_completed", "9223372036854775807"],
  ] as const)("maps %s with a valid segment ID", async (status, segmentId) => {
    const supabase = new SupabaseRpcMock([{ data: [{ status, segment_id: segmentId }], error: null }]);
    const result = await new CompletionEvidenceRepository(supabase as never).confirmEvidence(evidenceId);
    expect(supabase.calls).toEqual([{ name: "confirm_completion_evidence", args: { target_evidence_id: evidenceId } }]);
    expect(result).toEqual({ status, segmentId: String(segmentId) });
  });

  it("maps not_confirmable only with a null segment", async () => {
    const repository = new CompletionEvidenceRepository(new SupabaseRpcMock([{ data: [{ status: "not_confirmable", segment_id: null }], error: null }]) as never);
    await expect(repository.confirmEvidence(evidenceId)).resolves.toEqual({ status: "not_confirmable", segmentId: null });
  });

  it.each([
    ["unknown status", [{ status: "maybe", segment_id: "42" }]],
    ["success without segment", [{ status: "confirmed", segment_id: null }]],
    ["not confirmable with segment", [{ status: "not_confirmable", segment_id: "42" }]],
    ["invalid segment", [{ status: "confirmed", segment_id: "0" }]],
    ["zero rows", []],
    ["multiple rows", [{ status: "confirmed", segment_id: "42" }, { status: "confirmed", segment_id: "42" }]],
    ["non-array response", {}],
  ])("rejects %s", async (_label, data) => {
    const repository = new CompletionEvidenceRepository(new SupabaseRpcMock([{ data, error: null }]) as never);
    await expect(repository.confirmEvidence(evidenceId)).rejects.toThrow(EVIDENCE_CONFIRM_FAILED);
  });

  it("rejects invalid input before RPC and sanitizes RPC failures", async () => {
    const invalidSupabase = new SupabaseRpcMock([]);
    await expect(new CompletionEvidenceRepository(invalidSupabase as never).confirmEvidence("bad")).rejects.toThrow(EVIDENCE_CONFIRM_FAILED);
    expect(invalidSupabase.calls).toEqual([]);

    const rpcError = new CompletionEvidenceRepository(new SupabaseRpcMock([{ data: null, error: { message: "private database detail" } }]) as never);
    await expect(rpcError.confirmEvidence(evidenceId)).rejects.toThrow(EVIDENCE_CONFIRM_FAILED);
  });
});

describe("evidence repository source contract", () => {
  it("uses only the two M7D-B RPCs and never queries raw completion evidence", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "lib/completions/completion-evidence-repository.ts"), "utf8");
    expect(source).toContain('rpc("list_confirmable_completion_evidence")');
    expect(source).toContain('rpc("confirm_completion_evidence"');
    expect(source).not.toMatch(/\.from\(["']completion_evidence["']\)/);
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
