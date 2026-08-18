import { type NextRequest, NextResponse } from "next/server";
import { safeRelativeRedirect } from "@/lib/accounts/redirects";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const returnToValue = formData.get("returnTo");
  const returnTo = safeRelativeRedirect(typeof returnToValue === "string" ? returnToValue : "/", "/");
  const supabase = await createServerSupabaseClient();
  if (supabase) await supabase.auth.signOut();

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: returnTo,
      "Cache-Control": "private, no-store",
      Expires: "0",
      Pragma: "no-cache",
    },
  });
}
