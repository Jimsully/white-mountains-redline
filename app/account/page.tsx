import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EvidenceConfirmationSection } from "@/app/account/EvidenceConfirmationSection";
import { PublicNav } from "@/components/PublicNav";
import type { EvidenceConfirmationItem } from "@/app/account/EvidenceConfirmationSection";
import { updateProfileAction } from "@/lib/accounts/actions";
import { ProfileRepository } from "@/lib/accounts/profile-repository";
import { loginPathForReturn } from "@/lib/accounts/redirects";
import { CompletionEvidenceRepository } from "@/lib/completions/completion-evidence-repository";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { privateRobots } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Account",
  robots: privateRobots,
};

type AccountPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const auth = await getAuthenticatedUser();
  if (auth.unavailable) redirect("/login?status=unavailable&returnTo=%2Faccount");
  if (!auth.supabase || !auth.user) redirect(loginPathForReturn("/account"));

  const params = await searchParams;
  const profileRepository = new ProfileRepository(auth.supabase, auth.user.id);
  const evidenceRepository = new CompletionEvidenceRepository(auth.supabase);
  const evidencePromise = evidenceRepository.listConfirmableEvidence()
    .then((evidence) => ({ evidence, loadFailed: false }))
    .catch(() => ({ evidence: [], loadFailed: true }));
  const [profile, evidenceState] = await Promise.all([profileRepository.ensureProfile(), evidencePromise]);
  const evidenceItems: EvidenceConfirmationItem[] = evidenceState.evidence.map((item) => ({
    evidenceId: item.evidenceId,
    trailName: item.trailName,
    segmentName: item.segmentName,
    region: item.region,
    evidenceSource: item.evidenceSource,
    activityTitle: item.activityTitle,
    activityDate: item.activityDate,
  }));
  const provider = auth.user.app_metadata?.provider;
  const error = first(params?.error);
  const status = first(params?.status);

  return (
    <main className="accountShell">
      <section className="accountPanel wideAccountPanel">
        <PublicNav current="account" compact />
        <div className="accountHeaderRow">
          <div>
            <p className="eyebrow">Account</p>
            <h1>Profile</h1>
          </div>
          <form action="/auth/sign-out" method="post">
            <input type="hidden" name="returnTo" value="/" />
            <button type="submit" className="secondaryButton">Sign out</button>
          </form>
        </div>

        <p className="lede">Manage your profile and review activity evidence associated with your authenticated account.</p>
        {status === "saved" ? <div className="notice" role="status">Profile saved.</div> : null}
        {error ? <div className="notice errorNotice" role="alert">{error}</div> : null}

        <dl className="accountFacts">
          <div><dt>Signed in</dt><dd>Authenticated user</dd></div>
          <div><dt>Provider</dt><dd>{typeof provider === "string" ? provider : "email"}</dd></div>
          <div><dt>Profile visibility</dt><dd>{profile.isPublic ? "Public" : "Private"}</dd></div>
        </dl>

        <form action={updateProfileAction} className="accountForm">
          <input type="hidden" name="returnTo" value="/account" />
          <label>
            Display name
            <input name="displayName" defaultValue={profile.displayName ?? ""} maxLength={120} />
          </label>
          <label>
            Username
            <input name="username" defaultValue={profile.username ?? ""} pattern="[a-z0-9][a-z0-9_-]{2,31}" minLength={3} maxLength={32} />
          </label>
          <label className="checkRow">
            <input name="isPublic" type="checkbox" defaultChecked={profile.isPublic} />
            Public profile
          </label>
          <button type="submit">Save profile</button>
        </form>

        <EvidenceConfirmationSection evidence={evidenceItems} loadFailed={evidenceState.loadFailed} />

        <p className="accountFooter"><Link href="/">Back to public map</Link></p>
      </section>
    </main>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

