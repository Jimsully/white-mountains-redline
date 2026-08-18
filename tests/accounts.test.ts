import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getAppBaseUrl, getSupabasePublicConfig, isSupabaseAuthConfigured } from "@/lib/supabase/config";
import { loginPathForReturn, safeRelativeRedirect } from "@/lib/accounts/redirects";
import { mapProfileRow, profileUpdatePayload, validateProfileUpdate, validateUsername } from "@/types/account";

const root = process.cwd();
const migration009 = fs.readFileSync(path.join(root, "supabase/migrations/009_accounts_persistence.sql"), "utf8");

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
  it("defaults profiles to private and enforces public-safe usernames without email storage", () => {
    expect(migration009).toContain("alter table public.profiles alter column is_public set default false");
    expect(migration009).toContain("profiles_username_format_chk");
    expect(migration009).toContain("username ~ '^[a-z0-9][a-z0-9_-]{2,31}$'");
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

  it("does not add application completion writes or promotion", () => {
    const source = appSourceFiles().map((file) => fs.readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/\.from\(["']segment_completions["']\)\s*\.insert/);
    expect(source).not.toMatch(/\.from\(["']segment_completions["']\)\s*\.update/);
    expect(source).not.toMatch(/\.from\(["']segment_completions["']\)\s*\.delete/);
    expect(source).not.toMatch(/completed\s*:\s*true/);
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

  it("reports Supabase auth config availability without throwing", () => {
    expect(isSupabaseAuthConfigured({})).toBe(false);
    expect(getSupabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable" })).toEqual({
      url: "https://project.supabase.co",
      publishableKey: "publishable",
      keySource: "publishable",
    });
    expect(getSupabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" })?.keySource).toBe("anon-fallback");
    expect(getAppBaseUrl({ NEXT_PUBLIC_SITE_URL: "https://trails.example.com/path" })).toBe("https://trails.example.com");
    expect(getAppBaseUrl({ NEXT_PUBLIC_SITE_URL: "not a url" })).toBeNull();
  });

  it("validates canonical usernames consistently with migration 009", () => {
    expect(migration009).toContain("username ~ '^[a-z0-9][a-z0-9_-]{2,31}$'");
    expect(validateUsername("redliner_1")).toEqual({ ok: true, value: "redliner_1" });
    expect(validateUsername("")).toEqual({ ok: true, value: null });
    expect(validateUsername("ABc").ok).toBe(false);
    expect(validateUsername("ab").ok).toBe(false);
    expect(validateUsername("a".repeat(33)).ok).toBe(false);
    expect(validateUsername("bad.name").ok).toBe(false);
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

  it("validates profile form updates", () => {
    const form = new FormData();
    form.set("displayName", "Hiker");
    form.set("username", "hiker_1");
    form.set("isPublic", "on");
    expect(validateProfileUpdate(form)).toEqual({ ok: true, value: { displayName: "Hiker", username: "hiker_1", isPublic: true } });
  });
});
