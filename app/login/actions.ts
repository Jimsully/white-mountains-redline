"use server";

import { redirect } from "next/navigation";
import type { Provider } from "@supabase/supabase-js";
import { AUTH_UNAVAILABLE_STATUS, MAGIC_LINK_SENT_STATUS, sanitizeAuthErrorStatus } from "@/lib/accounts/auth-errors";
import { safeRelativeRedirect } from "@/lib/accounts/redirects";
import { getSupabaseAuthRuntimeConfig } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function signInWithMagicLinkAction(formData: FormData) {
  const email = stringField(formData.get("email"));
  const returnTo = safeRelativeRedirect(stringField(formData.get("returnTo")), "/account");
  if (!email) redirect(loginRedirect("email-required", returnTo));

  const runtime = getSupabaseAuthRuntimeConfig();
  const supabase = await createServerSupabaseClient();
  if (!runtime || !supabase) redirect(loginRedirect(AUTH_UNAVAILABLE_STATUS, returnTo));

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${runtime.siteUrl}/auth/confirm?returnTo=${encodeURIComponent(returnTo)}` },
  });

  if (error) redirect(loginRedirect(sanitizeAuthErrorStatus(), returnTo));
  redirect(loginRedirect(MAGIC_LINK_SENT_STATUS, returnTo));
}

export async function signInWithOAuthAction(formData: FormData) {
  const provider = stringField(formData.get("provider"));
  const returnTo = safeRelativeRedirect(stringField(formData.get("returnTo")), "/account");
  if (provider !== "google" && provider !== "apple") redirect(loginRedirect("unsupported-provider", returnTo));

  const runtime = getSupabaseAuthRuntimeConfig();
  const supabase = await createServerSupabaseClient();
  if (!runtime || !supabase) redirect(loginRedirect(AUTH_UNAVAILABLE_STATUS, returnTo));

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as Provider,
    options: { redirectTo: `${runtime.siteUrl}/auth/callback?returnTo=${encodeURIComponent(returnTo)}` },
  });

  if (error || !data.url) redirect(loginRedirect(sanitizeAuthErrorStatus(), returnTo));
  redirect(data.url);
}

function loginRedirect(status: string, returnTo: string) {
  return `/login?status=${encodeURIComponent(status)}&returnTo=${encodeURIComponent(returnTo)}`;
}

function stringField(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : undefined;
}
