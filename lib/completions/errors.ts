export const COMPLETION_SAVE_FAILED = "Could not save completion. Please try again.";
export const COMPLETION_REMOVE_FAILED = "Could not remove completion. Please try again.";
export const COMPLETION_SIGN_IN_REQUIRED = "Sign in to save progress.";
export const COMPLETION_INVALID_INPUT = "Invalid segment completion request.";

const browserSafeCompletionMessages = new Set([
  COMPLETION_SAVE_FAILED,
  COMPLETION_REMOVE_FAILED,
  COMPLETION_SIGN_IN_REQUIRED,
  COMPLETION_INVALID_INPUT,
]);

export function completionErrorMessageForDisplay(error: unknown, fallback = COMPLETION_SAVE_FAILED) {
  const message = error instanceof Error ? error.message : undefined;
  return message && browserSafeCompletionMessages.has(message) ? message : fallback;
}

export function isDuplicateCompletionError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error["code"] === "23505";
}