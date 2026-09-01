import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrailDirectoryResults } from "@/app/trails/page";
import { aggregateTrailSegments } from "@/lib/trails/trail-aggregation";
import {
  buildTrailDirectoryUrl,
  filterTrailDirectory,
  getTrailDirectoryRegions,
  normalizeTrailDirectoryFilters,
  normalizeTrailDirectoryQuery,
} from "@/lib/trails/trail-directory";
import type { TrailDirectoryFilters } from "@/lib/trails/trail-directory";
import type { TrailDetail, TrailSegment } from "@/types/trails";

const root = process.cwd();
const trailsPageSource = fs.readFileSync(path.join(root, "app/trails/page.tsx"), "utf8");
const trailDirectoryControlsSource = fs.readFileSync(path.join(root, "app/trails/TrailDirectoryControls.tsx"), "utf8");

function segment(input: Partial<TrailSegment> & Pick<TrailSegment, "id" | "trailId" | "trailSlug" | "trailName" | "segmentName" | "miles">): TrailSegment {
  return {
    slug: `segment-${input.id}`,
    region: "Franconia-Pemigewasset",
    completed: false,
    coordinates: [[-71, 44], [-71.1, 44.1]],
    dataStatus: "verified",
    verificationStatus: "human_verified",
    provenance: { provider: "demo", dataset: "test", sourceFeatureIds: [], manuallyModified: false },
    ...input,
  };
}

function directoryFixture(): TrailDetail[] {
  return aggregateTrailSegments([
    segment({ id: "1", trailId: "garfield-a", trailSlug: "garfield-ridge-west", trailName: "Garfield Ridge Trail", segmentName: "West", miles: 1.25, region: "Franconia-Pemigewasset" }),
    segment({ id: "2", trailId: "garfield-a", trailSlug: "garfield-ridge-west", trailName: "Garfield Ridge Trail", segmentName: "East", miles: 2.25, region: "Franconia-Pemigewasset" }),
    segment({ id: "3", trailId: "ammonoosuc", trailSlug: "ammonoosuc-ravine", trailName: "Ammonoosuc Ravine Trail", segmentName: "Only", miles: 3, region: "Presidential Range" }),
    segment({ id: "4", trailId: "garfield-b", trailSlug: "garfield-trail", trailName: "Garfield Trail", segmentName: "Only", miles: 4, region: "Other" }),
    segment({ id: "5", trailId: "bondcliff", trailSlug: "bondcliff-trail", trailName: "Bondcliff Trail", segmentName: "Only", miles: 5, region: "Franconia-Pemigewasset" }),
  ]);
}

describe("trail directory data", () => {
  it("listTrails-derived directory data is deterministic and alphabetical", () => {
    expect(directoryFixture().map((trail) => trail.name)).toEqual([
      "Ammonoosuc Ravine Trail",
      "Bondcliff Trail",
      "Garfield Ridge Trail",
      "Garfield Trail",
    ]);
  });

  it("uses trail-level identity and keeps separate trails separate", () => {
    const trails = directoryFixture();
    const garfieldRidge = trails.find((trail) => trail.trailSlug === "garfield-ridge-west");
    const garfieldTrail = trails.find((trail) => trail.trailSlug === "garfield-trail");

    expect(garfieldRidge).toMatchObject({ trailSlug: "garfield-ridge-west", totalMiles: 3.5, segmentCount: 2 });
    expect(garfieldTrail).toMatchObject({ trailSlug: "garfield-trail", totalMiles: 4, segmentCount: 1 });
  });
});

describe("trail directory search and regions", () => {
  it("performs case-insensitive trail-name search with whitespace trimming", () => {
    const filtered = filterTrailDirectory(directoryFixture(), { query: "  GARFIELD ridge  ", region: "all" });

    expect(filtered.map((trail) => trail.trailSlug)).toEqual(["garfield-ridge-west"]);
  });

  it("combines name search and region filtering", () => {
    const filtered = filterTrailDirectory(directoryFixture(), {
      query: "garfield",
      region: "Franconia-Pemigewasset",
    });

    expect(filtered.map((trail) => trail.trailSlug)).toEqual(["garfield-ridge-west"]);
  });

  it("returns an empty result for no matches", () => {
    expect(filterTrailDirectory(directoryFixture(), { query: "not a trail", region: "all" })).toEqual([]);
  });

  it("derives available regions from actual trail data in deterministic order", () => {
    expect(getTrailDirectoryRegions(directoryFixture())).toEqual([
      "Franconia-Pemigewasset",
      "Other",
      "Presidential Range",
    ]);
  });

  it("filters by selected region", () => {
    const filtered = filterTrailDirectory(directoryFixture(), { query: "", region: "Presidential Range" });

    expect(filtered.map((trail) => trail.trailSlug)).toEqual(["ammonoosuc-ravine"]);
  });

  it("normalizes query and invalid region input from route search params", () => {
    const regions = getTrailDirectoryRegions(directoryFixture());

    expect(normalizeTrailDirectoryFilters({ q: "  garfield  ", region: "Franconia-Pemigewasset" }, regions)).toEqual({
      query: "garfield",
      region: "Franconia-Pemigewasset",
    });
    expect(normalizeTrailDirectoryFilters({ q: "   ", region: "not-real" }, regions)).toEqual({
      query: "",
      region: "all",
    });
    expect(normalizeTrailDirectoryFilters({ region: "all" }, regions)).toEqual({ query: "", region: "all" });
  });
});

describe("trail directory routing and privacy boundaries", () => {
  it("links every result through trailSlug", () => {
    expect(trailsPageSource).toContain("href={`/trails/${trail.trailSlug}`}");
    expect(trailsPageSource).not.toContain("segment.slug");
    expect(trailsPageSource).not.toContain("segment_key");
  });

  it("stores lightweight search state in the route query", () => {
    expect(trailDirectoryControlsSource).toContain("buildTrailDirectoryUrl");
    expect(trailDirectoryControlsSource).toContain("router.replace(nextUrl, { scroll: false })");
  });

  it("loads public directory trails without auth or private completion composition", () => {
    expect(trailsPageSource).toContain("repository.listTrails()");
    expect(trailsPageSource).toContain("normalizeTrailDirectoryFilters");
    expect(trailsPageSource).toContain("filterTrailDirectory");
    expect(trailsPageSource).not.toContain("getAuthenticatedUser");
    expect(trailsPageSource).not.toContain("CompletionRepository");
    expect(trailsPageSource).not.toContain("applySegmentCompletions");
    expect(trailDirectoryControlsSource).not.toContain("filterTrailDirectory");
    expect(trailDirectoryControlsSource).not.toContain("useSearchParams().get");
  });
});

describe("trail directory server-rendered results", () => {
  function renderServerResults(filters: TrailDirectoryFilters) {
    const trails = directoryFixture();
    const filteredTrails = filterTrailDirectory(trails, filters);
    return renderToStaticMarkup(
      createElement(TrailDirectoryResults, {
        trails,
        filteredTrails,
        hasActiveFilters: filters.query.length > 0 || filters.region !== "all",
      }),
    );
  }

  it("renders default trail links in server output", () => {
    const html = renderServerResults({ query: "", region: "all" });

    expect(html).toContain('href="/trails/ammonoosuc-ravine"');
    expect(html).toContain('href="/trails/bondcliff-trail"');
    expect(html).toContain("4 of 4 trails");
  });

  it("renders only matching query links in server output", () => {
    const html = renderServerResults({ query: "garfield ridge", region: "all" });

    expect(html).toContain('href="/trails/garfield-ridge-west"');
    expect(html).not.toContain('href="/trails/garfield-trail"');
    expect(html).not.toContain('href="/trails/bondcliff-trail"');
    expect(html).toContain("1 of 4 trails");
  });

  it("renders region-filtered links in server output", () => {
    const html = renderServerResults({ query: "", region: "Presidential Range" });

    expect(html).toContain('href="/trails/ammonoosuc-ravine"');
    expect(html).not.toContain('href="/trails/bondcliff-trail"');
    expect(html).toContain("1 of 4 trails");
  });

  it("renders combined query and region filtering in server output", () => {
    const html = renderServerResults({ query: "garfield", region: "Franconia-Pemigewasset" });

    expect(html).toContain('href="/trails/garfield-ridge-west"');
    expect(html).not.toContain('href="/trails/garfield-trail"');
    expect(html).not.toContain('href="/trails/ammonoosuc-ravine"');
  });

  it("renders coherent no-results state in server output", () => {
    const html = renderServerResults({ query: "zzzz", region: "all" });

    expect(html).toContain("No trails match those filters.");
    expect(html).toContain('href="/trails"');
    expect(html).not.toContain('href="/trails/garfield-ridge-west"');
  });
});

describe("trail directory client URL controls", () => {
  it("trims search query before URL storage", () => {
    expect(buildTrailDirectoryUrl("/trails", "", { query: "  garfield  ", region: "all" })).toBe("/trails?q=garfield");
  });

  it("removes q for whitespace-only search", () => {
    expect(buildTrailDirectoryUrl("/trails", "q=garfield&region=Other", { query: "   ", region: "Other" })).toBe("/trails?region=Other");
  });

  it("preserves normalized q when region changes", () => {
    expect(buildTrailDirectoryUrl("/trails", "q=%20%20garfield%20%20", { query: normalizeTrailDirectoryQuery("  garfield  "), region: "Franconia-Pemigewasset" }))
      .toBe("/trails?q=garfield&region=Franconia-Pemigewasset");
  });

  it("preserves valid region when query changes", () => {
    expect(buildTrailDirectoryUrl("/trails", "region=Franconia-Pemigewasset", { query: "bond", region: "Franconia-Pemigewasset" }))
      .toBe("/trails?region=Franconia-Pemigewasset&q=bond");
  });

  it("clears both filters without duplicate canonical noise", () => {
    expect(buildTrailDirectoryUrl("/trails", "q=garfield&region=Franconia-Pemigewasset", { query: "", region: "all" })).toBe("/trails");
  });

  it("keeps URL encoding safe", () => {
    expect(buildTrailDirectoryUrl("/trails", "", { query: "Garfield & Twin", region: "all" })).toBe("/trails?q=Garfield+%26+Twin");
  });
});
