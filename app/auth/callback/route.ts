import { type NextRequest, NextResponse } from "next/server";
import { AUTH_ERROR_STATUS, AUTH_UNAVAILABLE_STATUS } from "@/lib/accounts/auth-errors";
import { safeRelativeRedirect } from "@/lib/accounts/redirects";
import { getSupabaseAuthRuntimeConfig } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const returnTo = safeRelativeRedirect(requestUrl.searchParams.get("returnTo"), "/account");

  if (!code) return noStoreRedirect(loginUrl(requestUrl.origin, "missing-code", returnTo));
  if (!getSupabaseAuthRuntimeConfig()) return noStoreRedirect(loginUrl(requestUrl.origin, AUTH_UNAVAILABLE_STATUS, returnTo));

  const supabase = await createServerSupabaseClient();
  if (!supabase) return noStoreRedirect(loginUrl(requestUrl.origin, AUTH_UNAVAILABLE_STATUS, returnTo));

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return noStoreRedirect(loginUrl(requestUrl.origin, AUTH_ERROR_STATUS, returnTo));

  return noStoreRedirect(new URL(returnTo, requestUrl.origin));
}

function loginUrl(origin: string, status: string, returnTo: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("status", status);
  url.searchParams.set("returnTo", returnTo);
  return url;
}

function noStoreRedirect(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  return response;
}
