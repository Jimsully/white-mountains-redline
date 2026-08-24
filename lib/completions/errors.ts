export const COMPLETION_SAVE_FAILED = "Could not save completion. Please try again.";
export const COMPLETION_REMOVE_FAILED = "Could not remove completion. Please try again.";
export const COMPLETION_SIGN_IN_REQUIRED = "Sign in to save progress.";
export const COMPLETION_INVALID_INPUT = "Invalid segment completion request.";
export const EVIDENCE_LIST_FAILED = "Evidence ready to confirm is temporarily unavailable.";
export const EVIDENCE_CONFIRM_FAILED = "Could not confirm this trail segment. Please try again.";
export const EVIDENCE_INVALID_INPUT = "Invalid evidence confirmation request.";
export const EVIDENCE_NOT_CONFIRMABLE = "This evidence is no longer available to confirm.";

const browserSafeCompletionMessages = new Set([
  COMPLETION_SAVE_FAILED,
  COMPLETION_REMOVE_FAILED,
  COMPLETION_SIGN_IN_REQUIRED,
  COMPLETION_INVALID_INPUT,
  EVIDENCE_LIST_FAILED,
  EVIDENCE_CONFIRM_FAILED,
  EVIDENCE_INVALID_INPUT,
  EVIDENCE_NOT_CONFIRMABLE,
]);

export function completionErrorMessageForDisplay(error: unknown, fallback = COMPLETION_SAVE_FAILED) {
  const message = error instanceof Error ? error.message : undefined;
  return message && browserSafeCompletionMessages.has(message) ? message : fallback;
}

export function isDuplicateCompletionError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error["code"] === "23505";
}
