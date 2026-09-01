import type { Metadata } from "next";
import Link from "next/link";
import { PublicNav } from "@/components/PublicNav";
import { AUTH_ERROR_STATUS, AUTH_UNAVAILABLE_STATUS, MAGIC_LINK_SENT_STATUS } from "@/lib/accounts/auth-errors";
import { safeRelativeRedirect } from "@/lib/accounts/redirects";
import { isSupabaseAuthConfigured } from "@/lib/supabase/config";
import { signInWithMagicLinkAction, signInWithOAuthAction } from "@/app/login/actions";
import { privateRobots } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Sign in",
  robots: privateRobots,
};

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnTo = safeRelativeRedirect(first(params?.returnTo), "/account");
  const status = first(params?.status);
  const configured = isSupabaseAuthConfigured();

  return (
    <main className="accountShell">
      <section className="accountPanel">
        <PublicNav current="account" compact />
        <p className="eyebrow">Account</p>
        <h1>Sign in</h1>
        <p className="lede">Save private profile settings without changing the public trail map. Browsing remains available without an account.</p>
        {!configured || status === AUTH_UNAVAILABLE_STATUS ? (
          <div className="notice" role="status">Supabase Auth is not configured for this environment. Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and a production HTTPS NEXT_PUBLIC_SITE_URL to enable login.</div>
        ) : null}
        {status === MAGIC_LINK_SENT_STATUS ? <div className="notice" role="status">Check your email for a magic link.</div> : null}
        {status === "email-required" ? <div className="notice errorNotice" role="alert">Enter an email address.</div> : null}
        {status === "unsupported-provider" ? <div className="notice errorNotice" role="alert">Unsupported sign-in provider.</div> : null}
        {status === AUTH_ERROR_STATUS ? <div className="notice errorNotice" role="alert">Sign-in failed. Please try again.</div> : null}

        <form action={signInWithMagicLinkAction} className="accountForm">
          <input type="hidden" name="returnTo" value={returnTo} />
          <label>
            Email
            <input name="email" type="email" autoComplete="email" disabled={!configured} required />
          </label>
          <button type="submit" disabled={!configured}>Send magic link</button>
        </form>

        <div className="oauthGrid">
          <form action={signInWithOAuthAction}>
            <input type="hidden" name="provider" value="google" />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button type="submit" disabled={!configured}>Continue with Google</button>
          </form>
          <form action={signInWithOAuthAction}>
            <input type="hidden" name="provider" value="apple" />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button type="submit" disabled={!configured}>Continue with Apple</button>
          </form>
        </div>

        <p className="accountFooter"><Link href="/">Back to public map</Link></p>
      </section>
    </main>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
