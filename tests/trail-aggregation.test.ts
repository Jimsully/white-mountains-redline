import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { applySegmentCompletions } from "@/lib/completions/composition";
import { DemoTrailRepository } from "@/lib/repositories/demo-trail-repository";
import { SupabaseTrailRepository, mapSupabaseSegmentRow } from "@/lib/repositories/supabase-trail-repository";
import { aggregateTrailSegments, getTrailBySlugFromSegments } from "@/lib/trails/trail-aggregation";
import type { SegmentCompletion } from "@/types/completion";
import type { TrailSegment } from "@/types/trails";

const root = process.cwd();
const trailPageSource = fs.readFileSync(path.join(root, "app/trails/[slug]/page.tsx"), "utf8");
const trailRepositorySource = fs.readFileSync(path.join(root, "lib/repositories/trail-repository.ts"), "utf8");

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

function completion(segmentId: string): SegmentCompletion {
  return {
    id: `completion-${segmentId}`,
    segmentId,
    completedOn: null,
    completionMethod: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("trail aggregation", () => {
  it("groups multiple verified segments by stable trail identity and totals mileage", () => {
    const trails = aggregateTrailSegments([
      segment({ id: "1", trailId: "trail-a", trailSlug: "trail-a-public", trailName: "Trail A", segmentName: "North", miles: 1.25 }),
      segment({ id: "2", trailId: "trail-a", trailSlug: "trail-a-public", trailName: "Trail A", segmentName: "South", miles: 2.5 }),
      segment({ id: "3", trailId: "trail-b", trailSlug: "trail-b-public", trailName: "Trail B", segmentName: "Only", miles: 4 }),
    ]);

    const trailA = trails.find((trail) => trail.trailSlug === "trail-a-public");
    const trailB = trails.find((trail) => trail.trailSlug === "trail-b-public");

    expect(trails).toHaveLength(2);
    expect(trailA).toMatchObject({ trailId: "trail-a", trailSlug: "trail-a-public", totalMiles: 3.75, segmentCount: 2 });
    expect(trailA?.segments.map((item) => item.id).sort()).toEqual(["1", "2"]);
    expect(trailB).toMatchObject({ trailId: "trail-b", trailSlug: "trail-b-public", totalMiles: 4, segmentCount: 1 });
  });

  it("does not merge trails that share names but have different stable identities", () => {
    const trails = aggregateTrailSegments([
      segment({ id: "1", trailId: "trail-a", trailSlug: "shared-name-west", trailName: "Shared Trail", segmentName: "West", miles: 1 }),
      segment({ id: "2", trailId: "trail-b", trailSlug: "shared-name-east", trailName: "Shared Trail", segmentName: "East", miles: 1 }),
    ]);

    expect(trails).toHaveLength(2);
    expect(trails.map((trail) => trail.trailSlug).sort()).toEqual(["shared-name-east", "shared-name-west"]);
  });

  it("derives aggregate bounds from all constituent segment geometry", () => {
    const [trail] = aggregateTrailSegments([
      segment({ id: "1", trailId: "trail-a", trailSlug: "trail-a", trailName: "Trail A", segmentName: "One", miles: 1, coordinates: [[-71.3, 44.1], [-71.2, 44.2]] }),
      segment({ id: "2", trailId: "trail-a", trailSlug: "trail-a", trailName: "Trail A", segmentName: "Two", miles: 1, coordinates: [[-71.5, 44.05], [-71.1, 44.3]] }),
    ]);

    expect(trail.bounds).toEqual([-71.5, 44.05, -71.1, 44.3]);
  });
});

describe("stable public trail routing", () => {
  it("resolves trail lookup from trail slug rather than segment slug", () => {
    const segments = [
      segment({ id: "1", slug: "opaque-segment-key", trailId: "trail-a", trailSlug: "trail-a-public", trailName: "Trail A", segmentName: "One", miles: 1 }),
    ];

    expect(getTrailBySlugFromSegments(segments, "trail-a-public")?.name).toBe("Trail A");
    expect(getTrailBySlugFromSegments(segments, "opaque-segment-key")).toBeUndefined();
    expect(getTrailBySlugFromSegments(segments, "missing")).toBeUndefined();
  });

  it("uses trail methods and notFound on the route source", () => {
    expect(trailPageSource).toContain("repository.listTrails()");
    expect(trailPageSource).toContain("repository.getTrailBySlug(slug)");
    expect(trailPageSource).toContain("notFound()");
    expect(trailPageSource).not.toContain("getSegmentBySlug(slug)");
    expect(trailRepositorySource).toContain("getSegmentBySlug");
    expect(trailRepositorySource).toContain("getTrailBySlug");
  });
});

describe("adapter trail identity contracts", () => {
  it("preserves Supabase trail_slug when mapping trail_segment_api rows", () => {
    const segment = mapSupabaseSegmentRow({
      id: "42",
      slug: "segment-key-slug",
      segment_name: "Segment",
      miles: 1,
      data_status: "verified",
      verification_status: "human_verified",
      trail_id: "7",
      trail_slug: "public-trail-slug",
      trail_name: "Public Trail",
      trail_region: "Franconia-Pemigewasset",
      coordinates: [[-71, 44], [-71.1, 44.1]],
    });

    expect(segment?.slug).toBe("segment-key-slug");
    expect(segment?.trailSlug).toBe("public-trail-slug");
  });

  it("demo repository produces compatible trail identities from publication data", async () => {
    const repository = new DemoTrailRepository();
    const trails = await repository.listTrails();
    const franconia = trails.find((trail) => trail.name === "Franconia Ridge Trail");

    expect(franconia?.trailSlug).toMatch(/^franconia-ridge-trail-/);
    expect(franconia?.segments).toHaveLength(2);
    expect(franconia?.segments.every((item) => item.trailSlug === franconia.trailSlug)).toBe(true);
  });

  it("Supabase trail lookup queries trail_slug, not the segment slug field", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("/rest/v1/trail_segment_api?");
      return {
        ok: true,
        json: async () => [{
        id: "42",
        slug: "segment-key-slug",
        segment_key: "segment-key-slug",
        segment_name: "Segment",
        miles: 1,
        data_status: "verified",
        verification_status: "human_verified",
        source_feature_ids: [],
        trail_id: "7",
        trail_slug: "public-trail-slug",
        trail_name: "Public Trail",
        trail_region: "Franconia-Pemigewasset",
        coordinates: [[-71, 44], [-71.1, 44.1]],
      }],
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const trail = await new SupabaseTrailRepository("https://project.supabase.co", "anon").getTrailBySlug("public-trail-slug");

    const requestUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(trail?.trailSlug).toBe("public-trail-slug");
    expect(requestUrl.searchParams.get("trail_slug")).toBe("eq.public-trail-slug");
    expect(requestUrl.searchParams.has("slug")).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("trail completion aggregation", () => {
  it("reports zero, partial, and full completion from segment completions", () => {
    const segments = [
      segment({ id: "1", trailId: "trail-a", trailSlug: "trail-a", trailName: "Trail A", segmentName: "One", miles: 1 }),
      segment({ id: "2", trailId: "trail-a", trailSlug: "trail-a", trailName: "Trail A", segmentName: "Two", miles: 2 }),
    ];

    const [zero] = aggregateTrailSegments(applySegmentCompletions(segments, []));
    const [partial] = aggregateTrailSegments(applySegmentCompletions(segments, [completion("1")]));
    const [full] = aggregateTrailSegments(applySegmentCompletions(segments, [completion("1"), completion("2")]));

    expect(zero).toMatchObject({ completedSegments: 0, completedMiles: 0, completionPercent: 0 });
    expect(partial).toMatchObject({ completedSegments: 1, completedMiles: 1, completionPercent: 50 });
    expect(full).toMatchObject({ completedSegments: 2, completedMiles: 3, completionPercent: 100 });
  });

  it("keeps the underlying completion unit as segment ids", () => {
    const segments = [
      segment({ id: "1", trailId: "trail-a", trailSlug: "trail-a", trailName: "Trail A", segmentName: "One", miles: 1 }),
      segment({ id: "2", trailId: "trail-a", trailSlug: "trail-a", trailName: "Trail A", segmentName: "Two", miles: 1 }),
    ];
    const personalized = applySegmentCompletions(segments, [completion("2")]);

    expect(personalized.map((item) => [item.id, item.completed])).toEqual([["1", false], ["2", true]]);
  });
});

describe("public and private separation", () => {
  it("aggregates public trails without requiring private completion data", () => {
    const [trail] = aggregateTrailSegments([
      segment({ id: "1", trailId: "trail-a", trailSlug: "trail-a", trailName: "Trail A", segmentName: "One", miles: 1 }),
    ]);

    expect(trail).toMatchObject({ name: "Trail A", completedSegments: 0, completedMiles: 0 });
  });

  it("composes completion only through the existing own-user repository pathway on the page", () => {
    expect(trailPageSource).toContain("new CompletionRepository(auth.supabase, auth.user.id)");
    expect(trailPageSource).toContain("completionRepository.listOwnCompletions()");
    expect(trailPageSource).toContain("applySegmentCompletions(publicTrail.segments, completions)");
    expect(trailPageSource).not.toMatch(/completion_evidence|activity_id|GPS traces|service_role/i);
  });
});
