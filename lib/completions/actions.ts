"use server";

import { revalidatePath } from "next/cache";
import { CompletionRepository } from "@/lib/completions/completion-repository";
import { COMPLETION_INVALID_INPUT, COMPLETION_REMOVE_FAILED, COMPLETION_SAVE_FAILED, COMPLETION_SIGN_IN_REQUIRED, completionErrorMessageForDisplay } from "@/lib/completions/errors";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { isValidProductionSegmentId, validateManualCompletionInput } from "@/types/completion";
import type { ManualCompletionInput, SegmentCompletion } from "@/types/completion";

export type CompletionActionResult =
  | { ok: true; completion: SegmentCompletion }
  | { ok: true; removed: true }
  | { ok: false; code: "unauthenticated" | "invalid_input" | "persistence_error"; message: string };

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
    return { ok: true, removed: true };
  } catch (error) {
    return { ok: false, code: "persistence_error", message: completionErrorMessageForDisplay(error, COMPLETION_REMOVE_FAILED) };
  }
}