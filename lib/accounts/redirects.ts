export function safeRelativeRedirect(value: string | null | undefined, fallback = "/") {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (decoded.startsWith("//") || decoded.includes("\\")) return fallback;

  try {
    const parsed = new URL(value, "http://local.invalid");
    if (parsed.origin !== "http://local.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function loginPathForReturn(returnTo: string) {
  return `/login?returnTo=${encodeURIComponent(safeRelativeRedirect(returnTo, "/account"))}`;
}
