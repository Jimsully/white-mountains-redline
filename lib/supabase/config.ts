export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
  keySource: "publishable" | "anon-fallback";
};

type SupabaseEnv = { [key: string]: string | undefined };

export function getSupabasePublicConfig(env: SupabaseEnv = process.env): SupabasePublicConfig | null {
  const url = clean(env.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey = clean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const anonFallback = clean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url) return null;
  if (publishableKey) return { url, publishableKey, keySource: "publishable" };
  if (anonFallback) return { url, publishableKey: anonFallback, keySource: "anon-fallback" };
  return null;
}

export function isSupabaseAuthConfigured(env: SupabaseEnv = process.env) {
  return getSupabasePublicConfig(env) !== null;
}

export function getAppBaseUrl(env: SupabaseEnv = process.env) {
  const configured = clean(env.NEXT_PUBLIC_SITE_URL);
  if (!configured) return null;
  try {
    const url = new URL(configured);
    return url.origin;
  } catch {
    return null;
  }
}

function clean(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
