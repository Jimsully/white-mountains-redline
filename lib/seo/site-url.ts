import { resolveSupabasePublicConfig } from "@/lib/supabase/config";

type PublicSiteEnv = {
  NODE_ENV?: string;
  PUBLIC_INDEXING_ENABLED?: string;
  VERCEL_ENV?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  TRAIL_REPOSITORY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
};

const LOCAL_PUBLIC_SITE_URL = "http://localhost:3000";

export function resolvePublicSiteUrl(env: PublicSiteEnv = process.env): URL | null {
  const configured = parsePublicSiteUrl(env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;
  if (clean(env.NEXT_PUBLIC_SITE_URL) && env.NODE_ENV === "production") return null;
  return parsePublicSiteUrl(LOCAL_PUBLIC_SITE_URL);
}

export function publicUrl(path: string, env: PublicSiteEnv = process.env): string | null {
  const base = resolvePublicSiteUrl(env);
  if (!base) return null;

  const routePath = normalizeRoutePath(path);
  const prefix = normalizeBasePath(base.pathname);
  const combinedPath = routePath === "/"
    ? `${prefix}/`
    : `${prefix}${routePath}`;

  const url = new URL(base.toString());
  url.pathname = combinedPath.replace(/\/{2,}/g, "/");
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function isPublicIndexingEnabled(env: PublicSiteEnv = process.env): boolean {
  if (env.PUBLIC_INDEXING_ENABLED !== "true") return false;
  if (clean(env.VERCEL_ENV) && env.VERCEL_ENV !== "production") return false;

  const siteUrl = parsePublicSiteUrl(env.NEXT_PUBLIC_SITE_URL);
  if (!siteUrl || siteUrl.protocol !== "https:") return false;
  if (env.NODE_ENV !== "production") return false;
  if (env.TRAIL_REPOSITORY?.toLowerCase() !== "supabase") return false;

  const supabaseConfig = resolveSupabasePublicConfig({
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  return supabaseConfig !== null && isHttpsUrl(supabaseConfig.url);
}

export function parsePublicSiteUrl(value: string | undefined): URL | null {
  const configured = clean(value);
  if (!configured) return null;

  try {
    const url = new URL(configured);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.pathname = normalizeConfiguredPath(url.pathname);
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function normalizeConfiguredPath(pathname: string) {
  const normalized = pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return normalized.length > 0 ? normalized : "/";
}

function normalizeBasePath(pathname: string) {
  const normalized = normalizeConfiguredPath(pathname);
  return normalized === "/" ? "" : normalized;
}

function normalizeRoutePath(path: string) {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "/") return "/";
  return `/${trimmed.replace(/^\/+/, "")}`;
}

function clean(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
