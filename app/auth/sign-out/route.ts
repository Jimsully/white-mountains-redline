import { type NextRequest, NextResponse } from "next/server";
import { safeRelativeRedirect } from "@/lib/accounts/redirects";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const returnToValue = formData.get("returnTo");
  const returnTo = safeRelativeRedirect(typeof returnToValue === "string" ? returnToValue : "/", "/");
  const supabase = await createServerSupabaseClient();
  if (supabase) await supabase.auth.signOut();
  return NextResponse.redirect(new URL(returnTo, request.url), { status: 303 });
}
