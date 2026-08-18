export const AUTH_UNAVAILABLE_STATUS = "unavailable";
export const MAGIC_LINK_SENT_STATUS = "magic-link-sent";
export const AUTH_ERROR_STATUS = "auth-error";

export function sanitizeAuthErrorStatus() {
  return AUTH_ERROR_STATUS;
}
