"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Provider } from "@supabase/supabase-js";
import { safeRelativeRedirect } from "@/lib/accounts/redirects";
import { getAppBaseUrl } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function signInWithMagicLinkAction(formData: FormData) {
  const email = stringField(formData.get("email"));
  const returnTo = safeRelativeRedirect(stringField(formData.get("returnTo")), "/account");
  if (!email) redirect(`/login?error=${encodeURIComponent("Enter an email address.")}&returnTo=${encodeURIComponent(returnTo)}`);

  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect(`/login?status=unavailable&returnTo=${encodeURIComponent(returnTo)}`);

  const origin = await requestOrigin();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}` },
  });

  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}&returnTo=${encodeURIComponent(returnTo)}`);
  redirect(`/login?status=magic-link-sent&returnTo=${encodeURIComponent(returnTo)}`);
}

export async function signInWithOAuthAction(formData: FormData) {
  const provider = stringField(formData.get("provider"));
  const returnTo = safeRelativeRedirect(stringField(formData.get("returnTo")), "/account");
  if (provider !== "google" && provider !== "apple") redirect(`/login?error=${encodeURIComponent("Unsupported sign-in provider.")}&returnTo=${encodeURIComponent(returnTo)}`);

  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect(`/login?status=unavailable&returnTo=${encodeURIComponent(returnTo)}`);

  const origin = await requestOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as Provider,
    options: { redirectTo: `${origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}` },
  });

  if (error || !data.url) redirect(`/login?error=${encodeURIComponent(error?.message ?? "OAuth sign-in did not return a redirect URL.")}&returnTo=${encodeURIComponent(returnTo)}`);
  redirect(data.url);
}

async function requestOrigin() {
  const configured = getAppBaseUrl();
  if (configured) return configured;

  const headerStore = await headers();
  const host = headerStore.get("host") ?? "localhost:3000";
  const protocol = headerStore.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

function stringField(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : undefined;
}
