import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import type { SupabaseCookieToSet } from "@/lib/supabase/cookies";

export async function createServerSupabaseClient() {
  const config = getSupabasePublicConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: SupabaseCookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]));
        } catch {
          // Server Components cannot always write response cookies; proxy refresh handles that path.
        }
      },
    },
  });
}

export async function getAuthenticatedUser() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, user: null, unavailable: true as const };
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { supabase, user: null, unavailable: false as const };
  return { supabase, user: data.user, unavailable: false as const };
}


