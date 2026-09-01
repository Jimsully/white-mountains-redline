import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicNav } from "@/components/PublicNav";
import { TrailDetailMap } from "@/components/TrailDetailMap";
import { CompletionRepository } from "@/lib/completions/completion-repository";
import { applySegmentCompletions } from "@/lib/completions/composition";
import { createTrailRepositoryRuntime } from "@/lib/repositories";
import { trailMetadata } from "@/lib/seo/metadata";
import { getTrailBySlugFromSegments } from "@/lib/trails/trail-aggregation";
import { getSupabaseAuthRuntimeConfig } from "@/lib/supabase/config";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import type { CompletionMode } from "@/types/completion";
import type { TrailDetail } from "@/types/trails";

type TrailPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export async function generateStaticParams() {
  const runtime = createTrailRepositoryRuntime();
  const trails = await runtime.repository.listTrails();
  return trails.map((trail) => ({ slug: trail.trailSlug }));
}

export async function generateMetadata({ params }: TrailPageProps) {
  const { slug } = await params;
  const runtime = createTrailRepositoryRuntime();
  const trail = await runtime.repository.getTrailBySlug(slug);

  if (!trail) {
    return { title: "Trail not found", robots: { index: false, follow: false } };
  }

  return trailMetadata(trail);
}

export default async function TrailPage({ params }: TrailPageProps) {
  const { slug } = await params;
  const runtime = createTrailRepositoryRuntime();
  const publicTrail = await runtime.repository.getTrailBySlug(slug);
  if (!publicTrail) notFound();

  const { trail, completionMode } = await composeTrailCompletion(publicTrail, runtime.mode);
  const progressLabel = completionMode === "authenticated" || completionMode === "demo"
    ? `${trail.completedSegments} of ${trail.segmentCount} segments complete`
    : "Sign in to track completed segments";

  return (
    <main className="trailDetailShell">
      <div className="trailDetailNavWrap">
        <PublicNav current="trails" />
      </div>
      <nav className="trailDetailBreadcrumb" aria-label="Breadcrumb">
        <Link href="/">Interactive redline map</Link>
        <span aria-hidden="true">/</span>
        <Link href="/trails">Browse all trails</Link>
        <span aria-hidden="true">/</span>
        <span>{trail.region}</span>
      </nav>

      <header className="trailDetailHero">
        <p className="eyebrow">{trail.region}</p>
        <h1>{trail.name}</h1>
        <p className="trailDetailLede">
          A public trail page assembled from verified constituent completion segments.
        </p>
      </header>

      <section className="trailDetailLayout" aria-label={`${trail.name} trail facts and map`}>
        <div className="trailDetailPrimary">
          <section className="trailStats" aria-labelledby="trail-facts-heading">
            <h2 id="trail-facts-heading">Trail Facts</h2>
            <dl>
              <div>
                <dt>Total verified mileage</dt>
                <dd>{trail.totalMiles.toFixed(1)} mi</dd>
              </div>
              <div>
                <dt>Verified segments</dt>
                <dd>{trail.segmentCount}</dd>
              </div>
              <div>
                <dt>Region</dt>
                <dd>{trail.region}</dd>
              </div>
            </dl>
          </section>

          <section className="trailProgressPanel" aria-labelledby="trail-progress-heading">
            <div>
              <p className="eyebrow">Personal Progress</p>
              <h2 id="trail-progress-heading">{progressLabel}</h2>
            </div>
            {completionMode === "authenticated" || completionMode === "demo" ? (
              <>
                <div className="progressTrack" aria-hidden="true">
                  <div className="progressFill" style={{ width: `${trail.completionPercent}%` }} />
                </div>
                <p>
                  {trail.completedMiles.toFixed(1)} of {trail.totalMiles.toFixed(1)} verified miles complete.
                  Segment completions remain the underlying tracking unit.
                </p>
              </>
            ) : (
              <p>
                Public trail facts remain visible without an account. Sign in only when you want to save personal progress.
              </p>
            )}
            {completionMode === "anonymous" ? <Link className="trailDetailButton" href="/login">Sign in to track progress</Link> : null}
            {completionMode === "unavailable" ? <p className="muted">Progress saving is unavailable in this environment.</p> : null}
            <div className="trailDetailActions" aria-label="Trail navigation">
              <Link className="trailDetailButton" href="/trails">Browse All Trails</Link>
              <Link className="trailDetailButton secondary" href="/">Interactive Redline Map</Link>
            </div>
          </section>

          <section className="trailSegmentListSection" aria-labelledby="trail-segments-heading">
            <h2 id="trail-segments-heading">Constituent Segments</h2>
            <ul className="trailSegmentList">
              {trail.segments.map((segment) => (
                <li key={segment.id} className="trailSegmentListItem">
                  <div>
                    <h3>{segment.segmentName}</h3>
                    <p>{segment.miles.toFixed(1)} mi</p>
                  </div>
                  {completionMode === "authenticated" || completionMode === "demo" ? (
                    <span className={segment.completed ? "segmentState complete" : "segmentState open"}>
                      {segment.completed ? "Completed" : "Incomplete"}
                    </span>
                  ) : (
                    <span className="segmentState open">Progress not shown</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="trailDetailAside" aria-label="Trail map and publication note">
          <TrailDetailMap trail={trail} />
          <section className="publicationNote">
            <h2>Publication Note</h2>
            <p>
              This page uses verified public trail-segment records for redline progress context. It is not a navigation
              product and does not include private GPS evidence or internal review notes.
            </p>
          </section>
        </aside>
      </section>
    </main>
  );
}

async function composeTrailCompletion(publicTrail: TrailDetail, mode: "demo" | "supabase"): Promise<{
  trail: TrailDetail;
  completionMode: CompletionMode;
}> {
  if (mode === "demo") {
    return { trail: publicTrail, completionMode: "demo" };
  }

  if (getSupabaseAuthRuntimeConfig() === null) {
    return { trail: publicTrail, completionMode: "unavailable" };
  }

  const auth = await getAuthenticatedUser();
  if (!auth.supabase || !auth.user) {
    return { trail: publicTrail, completionMode: "anonymous" };
  }

  const completionRepository = new CompletionRepository(auth.supabase, auth.user.id);
  const completions = await completionRepository.listOwnCompletions();
  const personalizedSegments = applySegmentCompletions(publicTrail.segments, completions);
  const personalizedTrail = getTrailBySlugFromSegments(personalizedSegments, publicTrail.trailSlug);

  return { trail: personalizedTrail ?? publicTrail, completionMode: "authenticated" };
}
