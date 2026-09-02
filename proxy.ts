import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { shouldBlockAdminRoute } from "@/lib/admin/runtime";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function proxy(request: NextRequest) {
  if (shouldBlockAdminRoute(request.nextUrl.pathname)) {
    return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
  }

  const config = getSupabasePublicConfig();
  if (!config) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  let pendingCookies: CookieToSet[] = [];
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        pendingCookies = mergeCookies(pendingCookies, cookiesToSet);
        response = NextResponse.next({ request });
        pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}

function mergeCookies(existing: CookieToSet[], incoming: CookieToSet[]) {
  const merged = existing.filter((cookie) => !incoming.some((nextCookie) => nextCookie.name === cookie.name));
  merged.push(...incoming);
  return merged;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
