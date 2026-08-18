export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
  keySource: "publishable" | "anon-fallback";
};

export type SupabaseAuthRuntimeConfig = SupabasePublicConfig & {
  siteUrl: string;
};

type SupabaseEnv = { [key: string]: string | undefined };

export function resolveSupabasePublicConfig(env: SupabaseEnv): SupabasePublicConfig | null {
  const url = clean(env.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey = clean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const anonFallback = clean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url) return null;
  if (publishableKey) return { url, publishableKey, keySource: "publishable" };
  if (anonFallback) return { url, publishableKey: anonFallback, keySource: "anon-fallback" };
  return null;
}

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  return resolveSupabasePublicConfig({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

export function isSupabaseAuthConfigured() {
  return getSupabaseAuthRuntimeConfig() !== null;
}

export function resolveSupabaseAuthRuntimeConfig(env: SupabaseEnv, nodeEnv = env.NODE_ENV): SupabaseAuthRuntimeConfig | null {
  const publicConfig = resolveSupabasePublicConfig(env);
  if (!publicConfig) return null;

  const configuredSiteUrl = resolveAppBaseUrl(env.NEXT_PUBLIC_SITE_URL);
  if (configuredSiteUrl) {
    if (nodeEnv === "production" && !configuredSiteUrl.startsWith("https://")) return null;
    return { ...publicConfig, siteUrl: configuredSiteUrl };
  }

  if (nodeEnv === "production") return null;
  return { ...publicConfig, siteUrl: "http://localhost:3000" };
}

export function getSupabaseAuthRuntimeConfig(): SupabaseAuthRuntimeConfig | null {
  return resolveSupabaseAuthRuntimeConfig({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

export function getAppBaseUrl(): string | null {
  return resolveAppBaseUrl(process.env.NEXT_PUBLIC_SITE_URL);
}

export function resolveAppBaseUrl(value: string | undefined) {
  const configured = clean(value);
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function clean(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
