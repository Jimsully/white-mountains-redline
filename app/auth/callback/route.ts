import { type NextRequest, NextResponse } from "next/server";
import { AUTH_ERROR_STATUS, AUTH_UNAVAILABLE_STATUS } from "@/lib/accounts/auth-errors";
import { safeRelativeRedirect } from "@/lib/accounts/redirects";
import { getSupabaseAuthRuntimeConfig } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const runtime = getSupabaseAuthRuntimeConfig();
  if (!runtime) return authUnavailableResponse();

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const returnTo = safeRelativeRedirect(requestUrl.searchParams.get("returnTo"), "/account");
  const redirectBase = runtime.siteUrl;

  if (!code) return noStoreRedirect(loginUrl(redirectBase, "missing-code", returnTo));

  const supabase = await createServerSupabaseClient();
  if (!supabase) return noStoreRedirect(loginUrl(redirectBase, AUTH_UNAVAILABLE_STATUS, returnTo));

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return noStoreRedirect(loginUrl(redirectBase, AUTH_ERROR_STATUS, returnTo));

  return noStoreRedirect(new URL(returnTo, redirectBase));
}

function loginUrl(origin: string, status: string, returnTo: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("status", status);
  url.searchParams.set("returnTo", returnTo);
  return url;
}

function authUnavailableResponse() {
  return new NextResponse("Authentication is unavailable in this environment.", {
    status: 503,
    headers: noStoreHeaders(),
  });
}

function noStoreRedirect(url: URL) {
  return NextResponse.redirect(url, { headers: noStoreHeaders() });
}

function noStoreHeaders() {
  return {
    "Cache-Control": "private, no-store",
    Expires: "0",
    Pragma: "no-cache",
  };
}
