import type { Metadata } from "next";
import Link from "next/link";
import { TrailDirectoryControls } from "@/app/trails/TrailDirectoryControls";
import { PublicNav } from "@/components/PublicNav";
import { createTrailRepositoryRuntime } from "@/lib/repositories";
import { trailDirectoryMetadata } from "@/lib/seo/metadata";
import {
  compareTrailDirectoryEntries,
  filterTrailDirectory,
  getTrailDirectoryRegions,
  hasActiveTrailDirectoryFilters,
  normalizeTrailDirectoryFilters,
} from "@/lib/trails/trail-directory";
import type { TrailDirectorySearchParams } from "@/lib/trails/trail-directory";
import type { TrailDetail } from "@/types/trails";

type TrailsPageProps = {
  searchParams?: Promise<TrailDirectorySearchParams>;
};

export async function generateMetadata({ searchParams }: TrailsPageProps): Promise<Metadata> {
  return trailDirectoryMetadata(searchParams);
}

export default async function TrailsPage({ searchParams }: TrailsPageProps) {
  const runtime = createTrailRepositoryRuntime();
  const trails = (await runtime.repository.listTrails()).sort(compareTrailDirectoryEntries);
  const regions = getTrailDirectoryRegions(trails);
  const filters = normalizeTrailDirectoryFilters(await searchParams, regions);
  const filteredTrails = filterTrailDirectory(trails, filters);

  return (
    <main className="trailDirectoryShell">
      <div className="trailDirectoryInner">
        <PublicNav current="trails" />
        {runtime.mode === "demo" ? (
          <div className="notice" role="status">
            Demo trail data only. The simplified geometry is not a complete challenge inventory and is not for navigation.
          </div>
        ) : null}
        <nav className="trailDetailBreadcrumb" aria-label="Breadcrumb">
          <Link href="/">Interactive redline map</Link>
          <span aria-hidden="true">/</span>
          <span>Trails</span>
        </nav>

        <header className="trailDirectoryHero">
          <p className="eyebrow">Trail Directory</p>
          <h1>White Mountains Trails</h1>
          <p>
            {runtime.mode === "demo"
              ? "Browse the demonstration trail set used to exercise the segment-oriented directory and map experience."
              : "Browse public trail pages assembled from verified completion segments. Segment records remain the tracking unit; this directory is an index of their parent trails."}
          </p>
        </header>

        <section className="trailDirectoryControls" aria-labelledby="trail-directory-results-heading">
          <TrailDirectoryControls filters={filters} regions={regions} />
          <TrailDirectoryResults
            trails={trails}
            filteredTrails={filteredTrails}
            hasActiveFilters={hasActiveTrailDirectoryFilters(filters)}
            demoOnly={runtime.mode === "demo"}
          />
        </section>
      </div>
    </main>
  );
}

export function TrailDirectoryResults({
  trails,
  filteredTrails,
  hasActiveFilters,
  demoOnly = false,
}: {
  trails: TrailDetail[];
  filteredTrails: TrailDetail[];
  hasActiveFilters: boolean;
  demoOnly?: boolean;
}) {
  return (
    <>
      <div className="trailDirectoryResultBar">
        <h2 id="trail-directory-results-heading">
          {filteredTrails.length} of {trails.length} trails
        </h2>
        <p>{demoOnly ? "Alphabetical demonstration results." : "Alphabetical results from verified public trail data."}</p>
      </div>

      {filteredTrails.length ? (
        <ul className="trailDirectoryList">
          {filteredTrails.map((trail) => (
            <li key={trail.trailSlug}>
              <Link className="trailDirectoryRow" href={`/trails/${trail.trailSlug}`}>
                <span className="trailDirectoryName">{trail.name}</span>
                <span className="trailDirectoryRegion">{trail.region}</span>
                <span>{trail.totalMiles.toFixed(1)} mi</span>
                <span>{trail.segmentCount} segment{trail.segmentCount === 1 ? "" : "s"}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="trailDirectoryEmpty" role="status">
          <h3>No trails match those filters.</h3>
          <p>{hasActiveFilters ? "Try a shorter trail name or switch back to all regions." : "No public trails are available yet."}</p>
          <Link className="secondaryButton" href="/trails">Reset search</Link>
        </div>
      )}
    </>
  );
}
