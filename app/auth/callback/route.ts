import { type NextRequest, NextResponse } from "next/server";
import { safeRelativeRedirect } from "@/lib/accounts/redirects";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const returnTo = safeRelativeRedirect(requestUrl.searchParams.get("returnTo"), "/account");
  const redirectUrl = new URL(returnTo, requestUrl.origin);

  if (!code) {
    redirectUrl.pathname = "/login";
    redirectUrl.search = `?error=${encodeURIComponent("Missing authentication callback code.")}&returnTo=${encodeURIComponent(returnTo)}`;
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    redirectUrl.pathname = "/login";
    redirectUrl.search = `?status=unavailable&returnTo=${encodeURIComponent(returnTo)}`;
    return NextResponse.redirect(redirectUrl);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    redirectUrl.pathname = "/login";
    redirectUrl.search = `?error=${encodeURIComponent(error.message)}&returnTo=${encodeURIComponent(returnTo)}`;
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.redirect(redirectUrl);
}
