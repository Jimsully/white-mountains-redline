import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PROFILE_UPDATE_FAILED, profileErrorMessageForDisplay, sanitizeProfilePersistenceError } from "@/lib/accounts/errors";
import { loginPathForReturn, safeRelativeRedirect } from "@/lib/accounts/redirects";
import { resolveAppBaseUrl, resolveSupabaseAuthRuntimeConfig, resolveSupabasePublicConfig } from "@/lib/supabase/config";
import { mapProfileRow, profileUpdatePayload, validateProfileUpdate, validateUsername } from "@/types/account";

const root = process.cwd();
const migration009 = fs.readFileSync(path.join(root, "supabase/migrations/009_accounts_persistence.sql"), "utf8");
const proxySource = fs.readFileSync(path.join(root, "proxy.ts"), "utf8");
const browserConfigSource = fs.readFileSync(path.join(root, "lib/supabase/config.ts"), "utf8");
const loginActionsSource = fs.readFileSync(path.join(root, "app/login/actions.ts"), "utf8");
const callbackSource = fs.readFileSync(path.join(root, "app/auth/callback/route.ts"), "utf8");
const confirmSource = fs.readFileSync(path.join(root, "app/auth/confirm/route.ts"), "utf8");
const signOutSource = fs.readFileSync(path.join(root, "app/auth/sign-out/route.ts"), "utf8");

function appSourceFiles() {
  const roots = ["app", "lib", "types", "components"];
  const files: string[] = [];
  for (const folder of roots) collect(path.join(root, folder), files);
  return files.filter((file) => /\.(ts|tsx)$/.test(file));
}

function collect(folder: string, files: string[]) {
  if (!fs.existsSync(folder)) return;
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) collect(fullPath, files);
    else files.push(fullPath);
  }
}

describe("accounts persistence hardening", () => {
  it("defaults profiles to private and enforces public-safe profile fields without email storage", () => {
    expect(migration009).toContain("alter table public.profiles alter column is_public set default false");
    expect(migration009).toContain("profiles_username_format_chk");
    expect(migration009).toContain("username ~ '^[a-z0-9][a-z0-9_-]{2,31}$'");
    expect(migration009).toContain("profiles_display_name_length_chk");
    expect(migration009).toContain("char_length(display_name) <= 120");
    expect(migration009).not.toMatch(/alter table public\.profiles add column[^;]*email/i);
  });

  it("drops stale permissive profile policies and defines explicit anon/authenticated owner checks", () => {
    expect(migration009).toContain("drop policy if exists \"public profiles are viewable\" on public.profiles");
    expect(migration009).toContain("drop policy if exists \"users update own profile\" on public.profiles");
    expect(migration009).toContain("to anon");
    expect(migration009).toContain("using (is_public = true)");
    expect(migration009).toContain("to authenticated");
    expect(migration009).toMatch(/create policy "authenticated can update own profile"[\s\S]*for update[\s\S]*using \([\s\S]*id = \(select auth\.uid\(\)\)[\s\S]*with check \([\s\S]*id = \(select auth\.uid\(\)\)/);
    expect(migration009).not.toMatch(/grant delete on public\.profiles to authenticated/i);
  });

  it("keeps activity rows authenticated-owner-only and blocks anon", () => {
    expect(migration009).toContain("drop policy if exists \"users read own activities\" on public.activities");
    expect(migration009).toContain("drop policy if exists \"users update own activities\" on public.activities");
    expect(migration009).toContain("revoke all on public.activities from public, anon, authenticated");
    expect(migration009).toContain("grant select, insert, update, delete on public.activities to authenticated");
    expect(migration009).toMatch(/create policy "authenticated can update own activities"[\s\S]*for update[\s\S]*using \([\s\S]*user_id = \(select auth\.uid\(\)\)[\s\S]*with check \([\s\S]*user_id = \(select auth\.uid\(\)\)/);
    expect(migration009).not.toMatch(/grant .*activities.* to anon/i);
  });

  it("does not grant M6 completion mutation privileges", () => {
    const completionBlock = migration009.slice(migration009.indexOf("revoke all on public.segment_completions"), migration009.indexOf("-- Completion evidence remains"));
    expect(migration009).toContain("drop policy if exists \"users create own completions\" on public.segment_completions");
    expect(migration009).toContain("drop policy if exists \"users update own completions\" on public.segment_completions");
    expect(migration009).toContain("drop policy if exists \"users delete own completions\" on public.segment_completions");
    expect(completionBlock).toContain("revoke all on public.segment_completions from public, anon, authenticated");
    expect(completionBlock).toContain("grant select on public.segment_completions to authenticated");
    expect(completionBlock).not.toMatch(/grant[^;]*(insert|update|delete)[^;]*segment_completions/i);
    expect(migration009).toContain("revoke all on public.completion_evidence from public, anon, authenticated");
  });

  it("keeps the auth trigger narrow and direct execution revoked", () => {
    expect(migration009).toContain("security definer");
    expect(migration009).toContain("set search_path = ''");
    expect(migration009).toContain("on conflict (id) do nothing");
    expect(migration009).toContain("revoke execute on function public.handle_new_auth_user_profile() from public");
    expect(migration009).toContain("revoke execute on function public.handle_new_auth_user_profile() from anon");
    expect(migration009).toContain("revoke execute on function public.handle_new_auth_user_profile() from authenticated");
  });

  it("keeps M7B completion writes narrow and does not add GPS/admin promotion", () => {
    const source = appSourceFiles().map((file) => fs.readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/\.from\(["']segment_completions["']\)\s*\.update/);
    expect(source).not.toMatch(/completion_method\s*:\s*["']manual["']/);
    expect(source).not.toMatch(/completion_method\s*:\s*["']gpx_match["']/);
    expect(source).not.toMatch(/completion_method\s*:\s*["']admin["']/);
    expect(source).not.toMatch(/\.from\(["']completion_evidence["']\)/);
  });

  it("keeps service-role secrets out of browser/client code", () => {
    const clientFiles = appSourceFiles().filter((file) => fs.readFileSync(file, "utf8").startsWith("\"use client\""));
    const clientSource = clientFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
    expect(clientSource).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(clientSource).not.toMatch(/NEXT_PUBLIC_.*SERVICE_ROLE/i);
  });
});

describe("auth and profile domain helpers", () => {
  it("rejects external redirects and accepts local app paths", () => {
    expect(safeRelativeRedirect("https://example.com/account", "/account")).toBe("/account");
    expect(safeRelativeRedirect("//example.com/account", "/account")).toBe("/account");
    expect(safeRelativeRedirect("/\\evil", "/account")).toBe("/account");
    expect(safeRelativeRedirect("/%5Cevil", "/account")).toBe("/account");
    expect(safeRelativeRedirect("/%2F%2Fevil.example", "/account")).toBe("/account");
    expect(safeRelativeRedirect("/account?tab=profile", "/")).toBe("/account?tab=profile");
    expect(loginPathForReturn("/account")).toBe("/login?returnTo=%2Faccount");
  });

  it("keeps public Supabase API config independent from auth runtime config", () => {
    const publicEnv = { NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", NODE_ENV: "production" };
    expect(resolveSupabasePublicConfig(publicEnv)?.keySource).toBe("anon-fallback");
    expect(resolveSupabaseAuthRuntimeConfig(publicEnv)).toBeNull();
  });

  it("requires a trusted auth base URL in production and allows localhost only outside production", () => {
    const base = { NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable" };
    expect(resolveSupabaseAuthRuntimeConfig({ ...base, NEXT_PUBLIC_SITE_URL: "https://trails.example.com/path", NODE_ENV: "production" })?.siteUrl).toBe("https://trails.example.com");
    expect(resolveSupabaseAuthRuntimeConfig({ ...base, NODE_ENV: "production" })).toBeNull();
    expect(resolveSupabaseAuthRuntimeConfig({ ...base, NEXT_PUBLIC_SITE_URL: "http://trails.example.com", NODE_ENV: "production" })).toBeNull();
    expect(resolveSupabaseAuthRuntimeConfig({ ...base, NEXT_PUBLIC_SITE_URL: "javascript:alert(1)", NODE_ENV: "production" })).toBeNull();
    expect(resolveSupabaseAuthRuntimeConfig({ ...base, NEXT_PUBLIC_SITE_URL: "file:///tmp/site", NODE_ENV: "production" })).toBeNull();
    expect(resolveSupabaseAuthRuntimeConfig({ ...base, NODE_ENV: "development" })?.siteUrl).toBe("http://localhost:3000");
    expect(resolveAppBaseUrl("not a url")).toBeNull();
  });

  it("uses direct NEXT_PUBLIC references for browser-bundled config", () => {
    expect(browserConfigSource).toContain("NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL");
    expect(browserConfigSource).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(browserConfigSource).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(browserConfigSource).not.toMatch(/const\s+\w+\s*=\s*process\.env[\s\S]*\w+\.NEXT_PUBLIC_/);
  });

  it("validates canonical profile fields consistently with migration 009", () => {
    expect(migration009).toContain("username ~ '^[a-z0-9][a-z0-9_-]{2,31}$'");
    expect(validateUsername("redliner_1")).toEqual({ ok: true, value: "redliner_1" });
    expect(validateUsername("")).toEqual({ ok: true, value: null });
    expect(validateUsername("ABc").ok).toBe(false);
    expect(validateUsername("ab").ok).toBe(false);
    expect(validateUsername("a".repeat(33)).ok).toBe(false);
    expect(validateUsername("bad.name").ok).toBe(false);

    const longDisplayName = new FormData();
    longDisplayName.set("displayName", "x".repeat(121));
    longDisplayName.set("username", "redliner");
    expect(validateProfileUpdate(longDisplayName)).toEqual({ ok: false, field: "displayName", message: "Display name must be 120 characters or fewer." });
  });

  it("maps profile rows and never lets mutation payloads change ownership away from the user id", () => {
    expect(mapProfileRow({ id: "user-1", username: "redliner", display_name: "Red Liner", is_public: false, created_at: "now", updated_at: "later" })).toEqual({
      id: "user-1",
      username: "redliner",
      displayName: "Red Liner",
      isPublic: false,
      createdAt: "now",
      updatedAt: "later",
    });
    expect(profileUpdatePayload("user-1", { displayName: "New", username: "new_name", isPublic: true })).toEqual({
      id: "user-1",
      display_name: "New",
      username: "new_name",
      is_public: true,
    });
  });

  it("sanitizes unknown profile persistence errors", () => {
    expect(sanitizeProfilePersistenceError("violates profiles_username_format_chk")).toBe("Username does not match the required public format.");
    expect(sanitizeProfilePersistenceError("duplicate key value violates unique constraint profiles_username_key")).toBe("That username is already taken.");
    expect(sanitizeProfilePersistenceError("new row violates row-level security policy for table profiles")).toBe(PROFILE_UPDATE_FAILED);
    expect(profileErrorMessageForDisplay(new Error("new row violates row-level security policy for table profiles"))).toBe(PROFILE_UPDATE_FAILED);
    expect(profileErrorMessageForDisplay(new Error("That username is already taken."))).toBe("That username is already taken.");
  });
});

describe("Supabase SSR source contracts", () => {
  it("proxy preserves Supabase cookies and cache-protection headers", () => {
    expect(proxySource).toContain("export async function proxy(request: NextRequest)");
    expect(proxySource).toContain("setAll(cookiesToSet, headers)");
    expect(proxySource).toContain("request.cookies.set(name, value)");
    expect(proxySource).toContain("response = NextResponse.next({ request })");
    expect(proxySource).toContain("pendingCookies = mergeCookies(pendingCookies, cookiesToSet)");
    expect(proxySource).toContain("pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))");
    expect(proxySource).toContain("Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))");
    expect(proxySource).toContain("supabase.auth.getClaims()");
    expect(proxySource).not.toContain("getSession(");
  });

  it("callback redirects use the trusted auth runtime site URL", () => {
    expect(callbackSource).toContain("const runtime = getSupabaseAuthRuntimeConfig()");
    expect(callbackSource).toContain("const redirectBase = runtime.siteUrl");
    expect(callbackSource).toContain("loginUrl(redirectBase");
    expect(callbackSource).toContain("new URL(returnTo, redirectBase)");
    expect(confirmSource).toContain("const runtime = getSupabaseAuthRuntimeConfig()");
    expect(confirmSource).toContain("const redirectBase = runtime.siteUrl");
    expect(confirmSource).toContain("loginUrl(redirectBase");
    expect(confirmSource).toContain("new URL(returnTo, redirectBase)");
    expect(callbackSource).not.toContain("requestUrl.origin");
    expect(callbackSource).not.toMatch(/new URL\(returnTo,\s*request/i);
    expect(confirmSource).not.toContain("requestUrl.origin");
    expect(confirmSource).not.toMatch(/new URL\(returnTo,\s*request/i);
  });

  it("sign-out returns a sanitized relative Location without request-origin resolution", () => {
    expect(signOutSource).toContain("const returnTo = safeRelativeRedirect");
    expect(signOutSource).toContain("Location: returnTo");
    expect(signOutSource).not.toContain("new URL(returnTo, request.url)");
    expect(signOutSource).not.toMatch(/new URL\(returnTo,\s*request/i);
    expect(safeRelativeRedirect("https://evil.example", "/")).toBe("/");
  });

  it("auth routes do not use host-derived origins, expose raw Supabase errors, or cache auth responses", () => {
    const authRouteSource = `${loginActionsSource}\n${callbackSource}\n${confirmSource}\n${signOutSource}`;
    expect(authRouteSource).not.toContain("error.message");
    expect(authRouteSource).not.toMatch(/x-forwarded|next\/headers|\.headers\.get\(["']host/i);
    expect(callbackSource).toContain("Cache-Control");
    expect(callbackSource).toContain("private, no-store");
    expect(confirmSource).toContain("Cache-Control");
    expect(confirmSource).toContain("private, no-store");
    expect(signOutSource).toContain("private, no-store");
  });

  it("keeps email token-hash confirmation separate from OAuth code exchange", () => {
    expect(loginActionsSource).toContain("/auth/confirm?returnTo=");
    expect(confirmSource).toContain("verifyOtp");
    expect(confirmSource).toContain("token_hash");
    expect(confirmSource).not.toContain("exchangeCodeForSession");
    expect(callbackSource).toContain("exchangeCodeForSession");
    expect(callbackSource).not.toContain("verifyOtp");
  });
});
