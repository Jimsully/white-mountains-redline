"use server";

import { revalidatePath } from "next/cache";
import { CompletionEvidenceRepository } from "@/lib/completions/completion-evidence-repository";
import { CompletionRepository } from "@/lib/completions/completion-repository";
import { COMPLETION_INVALID_INPUT, COMPLETION_REMOVE_FAILED, COMPLETION_SAVE_FAILED, COMPLETION_SIGN_IN_REQUIRED, EVIDENCE_CONFIRM_FAILED, EVIDENCE_INVALID_INPUT, EVIDENCE_NOT_CONFIRMABLE, completionErrorMessageForDisplay } from "@/lib/completions/errors";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { isValidCanonicalUuid, isValidProductionSegmentId, validateManualCompletionInput } from "@/types/completion";
import type { ManualCompletionInput, SegmentCompletion } from "@/types/completion";

export type CompletionActionResult =
  | { ok: true; completion: SegmentCompletion }
  | { ok: true; removed: true }
  | { ok: false; code: "unauthenticated" | "invalid_input" | "persistence_error"; message: string };

export type EvidenceConfirmationActionResult =
  | { status: "idle" }
  | { status: "success"; code: "confirmed" | "already_confirmed" | "already_completed"; message: string }
  | { status: "error"; code: "not_confirmable" | "unauthenticated" | "invalid_input" | "persistence_error"; message: string };

export const initialEvidenceConfirmationActionResult: EvidenceConfirmationActionResult = { status: "idle" };

export async function markManualCompletionAction(input: ManualCompletionInput): Promise<CompletionActionResult> {
  const validation = validateManualCompletionInput(input);
  if (!validation.ok) return { ok: false, code: "invalid_input", message: validation.message };

  const auth = await getAuthenticatedUser();
  if (!auth.supabase || auth.unavailable || !auth.user) {
    return { ok: false, code: "unauthenticated", message: COMPLETION_SIGN_IN_REQUIRED };
  }

  try {
    const repository = new CompletionRepository(auth.supabase, auth.user.id);
    const completion = await repository.markManualComplete(validation.value);
    revalidatePath("/");
    revalidatePath("/account");
    return { ok: true, completion };
  } catch (error) {
    return { ok: false, code: "persistence_error", message: completionErrorMessageForDisplay(error, COMPLETION_SAVE_FAILED) };
  }
}

export async function removeCompletionAction(segmentId: string): Promise<CompletionActionResult> {
  if (!isValidProductionSegmentId(segmentId)) {
    return { ok: false, code: "invalid_input", message: COMPLETION_INVALID_INPUT };
  }

  const auth = await getAuthenticatedUser();
  if (!auth.supabase || auth.unavailable || !auth.user) {
    return { ok: false, code: "unauthenticated", message: COMPLETION_SIGN_IN_REQUIRED };
  }

  try {
    const repository = new CompletionRepository(auth.supabase, auth.user.id);
    await repository.removeCompletion(segmentId);
    revalidatePath("/");
    revalidatePath("/account");
    return { ok: true, removed: true };
  } catch (error) {
    return { ok: false, code: "persistence_error", message: completionErrorMessageForDisplay(error, COMPLETION_REMOVE_FAILED) };
  }
}

export async function confirmCompletionEvidenceAction(
  _previousState: EvidenceConfirmationActionResult,
  formData: FormData,
): Promise<EvidenceConfirmationActionResult> {
  const evidenceId = formData.get("evidenceId");
  if (typeof evidenceId !== "string" || !isValidCanonicalUuid(evidenceId)) {
    return { status: "error", code: "invalid_input", message: EVIDENCE_INVALID_INPUT };
  }

  const auth = await getAuthenticatedUser();
  if (!auth.supabase || auth.unavailable || !auth.user) {
    return { status: "error", code: "unauthenticated", message: COMPLETION_SIGN_IN_REQUIRED };
  }

  try {
    const result = await new CompletionEvidenceRepository(auth.supabase).confirmEvidence(evidenceId);
    if (result.status === "not_confirmable") {
      revalidatePath("/account");
      return { status: "error", code: "not_confirmable", message: EVIDENCE_NOT_CONFIRMABLE };
    }

    revalidatePath("/account");
    revalidatePath("/");
    return {
      status: "success",
      code: result.status,
      message: result.status === "confirmed" ? "Trail segment marked complete." : "This trail segment is already complete.",
    };
  } catch (error) {
    return { status: "error", code: "persistence_error", message: completionErrorMessageForDisplay(error, EVIDENCE_CONFIRM_FAILED) };
  }
}
