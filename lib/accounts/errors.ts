export const PROFILE_UPDATE_FAILED = "Profile update failed. Please try again.";
export const PROFILE_USERNAME_FORMAT_FAILED = "Username does not match the required public format.";
export const PROFILE_USERNAME_TAKEN = "That username is already taken.";

const browserSafeProfileMessages = new Set([PROFILE_UPDATE_FAILED, PROFILE_USERNAME_FORMAT_FAILED, PROFILE_USERNAME_TAKEN]);

export function sanitizeProfilePersistenceError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("profiles_username_format_chk")) return PROFILE_USERNAME_FORMAT_FAILED;
  if (lower.includes("profiles_username_key") || lower.includes("duplicate key")) return PROFILE_USERNAME_TAKEN;
  return PROFILE_UPDATE_FAILED;
}

export function profileErrorMessageForDisplay(error: unknown) {
  const message = error instanceof Error ? error["message"] : undefined;
  return message && browserSafeProfileMessages.has(message) ? message : PROFILE_UPDATE_FAILED;
}
