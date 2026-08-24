import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  confirmEvidence: vi.fn(),
  markManualComplete: vi.fn(),
  removeCompletion: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/lib/completions/completion-evidence-repository", () => ({
  CompletionEvidenceRepository: class {
    confirmEvidence(evidenceId: string) {
      return mocks.confirmEvidence(evidenceId);
    }
  },
}));
vi.mock("@/lib/completions/completion-repository", () => ({
  CompletionRepository: class {
    markManualComplete(input: unknown) {
      return mocks.markManualComplete(input);
    }
    removeCompletion(segmentId: string) {
      return mocks.removeCompletion(segmentId);
    }
  },
}));

import { confirmCompletionEvidenceAction, initialEvidenceConfirmationActionResult, markManualCompletionAction, removeCompletionAction } from "@/lib/completions/actions";
import { COMPLETION_SIGN_IN_REQUIRED, EVIDENCE_CONFIRM_FAILED, EVIDENCE_INVALID_INPUT, EVIDENCE_NOT_CONFIRMABLE } from "@/lib/completions/errors";

const evidenceId = "11111111-2222-4333-8444-555555555555";

function formData(extra: Record<string, string> = {}) {
  const data = new FormData();
  data.set("evidenceId", evidenceId);
  for (const [key, value] of Object.entries(extra)) data.set(key, value);
  return data;
}

describe("confirmCompletionEvidenceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase: { client: true }, user: { id: "user-1" }, unavailable: false });
  });

  it("rejects invalid UUID input before authentication or RPC", async () => {
    const data = new FormData();
    data.set("evidenceId", "not-a-uuid");
    await expect(confirmCompletionEvidenceAction(initialEvidenceConfirmationActionResult, data)).resolves.toEqual({
      status: "error",
      code: "invalid_input",
      message: EVIDENCE_INVALID_INPUT,
    });
    expect(mocks.getAuthenticatedUser).not.toHaveBeenCalled();
    expect(mocks.confirmEvidence).not.toHaveBeenCalled();
  });

  it.each([
    { supabase: null, user: null, unavailable: false },
    { supabase: null, user: null, unavailable: true },
  ])("rejects unavailable or unauthenticated callers before RPC", async (auth) => {
    mocks.getAuthenticatedUser.mockResolvedValue(auth);
    await expect(confirmCompletionEvidenceAction(initialEvidenceConfirmationActionResult, formData())).resolves.toEqual({
      status: "error",
      code: "unauthenticated",
      message: COMPLETION_SIGN_IN_REQUIRED,
    });
    expect(mocks.confirmEvidence).not.toHaveBeenCalled();
  });

  it.each([
    ["confirmed", "Trail segment marked complete."],
    ["already_confirmed", "This trail segment is already complete."],
    ["already_completed", "This trail segment is already complete."],
  ] as const)("returns sanitized success for %s and refreshes account and progress", async (status, message) => {
    mocks.confirmEvidence.mockResolvedValue({ status, segmentId: "42" });
    const result = await confirmCompletionEvidenceAction(initialEvidenceConfirmationActionResult, formData({
      userId: "foreign-user",
      segmentId: "999",
      activityId: "88",
      completedOn: "1999-01-01",
      completionMethod: "admin",
      notes: "forged",
    }));

    expect(result).toEqual({ status: "success", code: status, message });
    expect(mocks.confirmEvidence).toHaveBeenCalledTimes(1);
    expect(mocks.confirmEvidence).toHaveBeenCalledWith(evidenceId);
    expect(mocks.revalidatePath.mock.calls).toEqual([["/account"], ["/"]]);
  });

  it("returns a non-specific not-confirmable result and refreshes only account evidence", async () => {
    mocks.confirmEvidence.mockResolvedValue({ status: "not_confirmable", segmentId: null });
    await expect(confirmCompletionEvidenceAction(initialEvidenceConfirmationActionResult, formData())).resolves.toEqual({
      status: "error",
      code: "not_confirmable",
      message: EVIDENCE_NOT_CONFIRMABLE,
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([["/account"]]);
  });

  it("sanitizes repository failures and does not revalidate", async () => {
    mocks.confirmEvidence.mockRejectedValue(new Error("raw Supabase failure"));
    await expect(confirmCompletionEvidenceAction(initialEvidenceConfirmationActionResult, formData())).resolves.toEqual({
      status: "error",
      code: "persistence_error",
      message: EVIDENCE_CONFIRM_FAILED,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("manual completion account revalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase: { client: true }, user: { id: "user-1" }, unavailable: false });
  });

  it("refreshes progress and account evidence after manual mark and unmark", async () => {
    mocks.markManualComplete.mockResolvedValue({ id: "1", segmentId: "42", completedOn: null, completionMethod: "manual", createdAt: "now" });
    mocks.removeCompletion.mockResolvedValue(undefined);

    await expect(markManualCompletionAction({ segmentId: "42" })).resolves.toMatchObject({ ok: true });
    expect(mocks.revalidatePath.mock.calls).toEqual([["/"], ["/account"]]);

    mocks.revalidatePath.mockClear();
    await expect(removeCompletionAction("42")).resolves.toEqual({ ok: true, removed: true });
    expect(mocks.revalidatePath.mock.calls).toEqual([["/"], ["/account"]]);
  });
});
