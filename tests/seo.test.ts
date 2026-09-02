import { describe, expect, it, vi, afterEach } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { metadata as accountMetadata } from "@/app/account/page";
import { metadata as loginMetadata } from "@/app/login/page";
import { metadata as adminPublicationMetadata } from "@/app/admin/publication/page";
import {
  defaultDescription,
  homeMetadata,
  rootMetadata,
  trailDirectoryMetadata,
  trailMetadata,
} from "@/lib/seo/metadata";
import {
  isPublicIndexingEnabled,
  parsePublicSiteUrl,
  publicUrl,
  resolvePublicSiteUrl,
} from "@/lib/seo/site-url";
import type { TrailDetail } from "@/types/trails";

const safeProductionEnv = {
  NODE_ENV: "production",
  PUBLIC_INDEXING_ENABLED: "true",
  NEXT_PUBLIC_SITE_URL: "https://jamesscottsullivan.com/redline",
  TRAIL_REPOSITORY: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("SEO public site URL contract", () => {
  it("normalizes configured base URLs and trailing slashes", () => {
    expect(parsePublicSiteUrl("https://example.com/redline///")?.toString()).toBe("https://example.com/redline");
    expect(parsePublicSiteUrl("https://example.com")?.toString()).toBe("https://example.com/");
  });

  it("preserves a configured path prefix when building public route URLs", () => {
    expect(publicUrl("/", safeProductionEnv)).toBe("https://jamesscottsullivan.com/redline/");
    expect(publicUrl("/trails", safeProductionEnv)).toBe("https://jamesscottsullivan.com/redline/trails");
    expect(publicUrl("/trails/franconia-ridge-trail-demo", safeProductionEnv))
      .toBe("https://jamesscottsullivan.com/redline/trails/franconia-ridge-trail-demo");
  });

  it("does not let URL constructor semantics discard the prefix for absolute route paths", () => {
    expect(new URL("/trails", "https://jamesscottsullivan.com/redline").toString())
      .toBe("https://jamesscottsullivan.com/trails");
    expect(publicUrl("/trails", safeProductionEnv))
      .toBe("https://jamesscottsullivan.com/redline/trails");
  });

  it("falls back to localhost in development but not production when malformed", () => {
    expect(resolvePublicSiteUrl({ NODE_ENV: "development", NEXT_PUBLIC_SITE_URL: "not a url" })?.toString())
      .toBe("http://localhost:3000/");
    expect(resolvePublicSiteUrl({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: undefined })?.toString())
      .toBe("http://localhost:3000/");
    expect(resolvePublicSiteUrl({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "not a url" })).toBeNull();
    expect(parsePublicSiteUrl("ftp://example.com/redline")).toBeNull();
  });
});

describe("public indexing gate", () => {
  it("requires an explicit server-side public indexing opt-in", () => {
    expect(isPublicIndexingEnabled({ ...safeProductionEnv, PUBLIC_INDEXING_ENABLED: undefined })).toBe(false);
    expect(isPublicIndexingEnabled({ ...safeProductionEnv, PUBLIC_INDEXING_ENABLED: "false" })).toBe(false);
    expect(isPublicIndexingEnabled({ ...safeProductionEnv, PUBLIC_INDEXING_ENABLED: "TRUE" })).toBe(false);
  });

  it("allows explicitly opted-in production HTTPS Supabase indexing outside Vercel", () => {
    expect(isPublicIndexingEnabled(safeProductionEnv)).toBe(true);
  });

  it("requires Vercel production context when VERCEL_ENV is present", () => {
    expect(isPublicIndexingEnabled({ ...safeProductionEnv, VERCEL_ENV: "preview" })).toBe(false);
    expect(isPublicIndexingEnabled({ ...safeProductionEnv, VERCEL_ENV: "development" })).toBe(false);
    expect(isPublicIndexingEnabled({ ...safeProductionEnv, VERCEL_ENV: "production" })).toBe(true);
  });

  it("does not enable production indexing in demo mode", () => {
    expect(isPublicIndexingEnabled({ ...safeProductionEnv, TRAIL_REPOSITORY: "demo" })).toBe(false);
  });

  it("requires public Supabase configuration but not service-role credentials", () => {
    expect(isPublicIndexingEnabled({ ...safeProductionEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined })).toBe(false);
    expect(isPublicIndexingEnabled({ ...safeProductionEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key" })).toBe(true);
    expect(isPublicIndexingEnabled({ ...safeProductionEnv, NEXT_PUBLIC_SUPABASE_URL: undefined })).toBe(false);
    expect(isPublicIndexingEnabled({ ...safeProductionEnv, NEXT_PUBLIC_SUPABASE_URL: "not a url" })).toBe(false);
  });

  it("requires production and HTTPS for public indexing", () => {
    expect(isPublicIndexingEnabled({ ...safeProductionEnv, NODE_ENV: "development" })).toBe(false);
    expect(isPublicIndexingEnabled({ ...safeProductionEnv, NEXT_PUBLIC_SITE_URL: "http://example.com/redline" })).toBe(false);
  });

  it("cleans up environment mutations between tests", () => {
    expect(process.env.PUBLIC_INDEXING_ENABLED).toBeUndefined();
    expect(process.env.VERCEL_ENV).toBeUndefined();
  });
});

describe("canonical URLs and directory index policy", () => {
  it("sets home canonical metadata without private state", () => {
    stubSafeProductionEnv();
    const metadata = homeMetadata();

    expect(metadata.title).toBe("Interactive Redline Map");
    expect(metadata.alternates).toEqual({ canonical: "https://jamesscottsullivan.com/redline/" });
    expect(JSON.stringify(metadata)).not.toMatch(/completedMiles|completedSegments|completionPercent|activityDate|evidenceId|gps/i);
  });

  it("sets directory canonical metadata for the unfiltered route", async () => {
    stubSafeProductionEnv();
    const metadata = await trailDirectoryMetadata(Promise.resolve({}));

    expect(metadata.alternates).toEqual({ canonical: "https://jamesscottsullivan.com/redline/trails" });
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });

  it("canonicalizes filtered directory URLs to /trails and marks them noindex, follow", async () => {
    stubSafeProductionEnv();

    await expect(trailDirectoryMetadata(Promise.resolve({ q: "garfield" })))
      .resolves.toMatchObject({ alternates: { canonical: "https://jamesscottsullivan.com/redline/trails" }, robots: { index: false, follow: true } });
    await expect(trailDirectoryMetadata(Promise.resolve({ region: "Franconia-Pemigewasset" })))
      .resolves.toMatchObject({ alternates: { canonical: "https://jamesscottsullivan.com/redline/trails" }, robots: { index: false, follow: true } });
    await expect(trailDirectoryMetadata(Promise.resolve({ q: "garfield", region: "Franconia-Pemigewasset" })))
      .resolves.toMatchObject({ alternates: { canonical: "https://jamesscottsullivan.com/redline/trails" }, robots: { index: false, follow: true } });
  });
});

describe("trail and social metadata", () => {
  it("uses only public trail facts for trail detail metadata", () => {
    stubSafeProductionEnv();
    const metadata = trailMetadata(trailFixture());
    const serialized = JSON.stringify(metadata);

    expect(metadata.title).toBe("Franconia Ridge Trail");
    expect(metadata.description).toBe("Franconia Ridge Trail in Franconia-Pemigewasset: 4.5 verified miles across 2 published completion segments.");
    expect(metadata.alternates).toEqual({
      canonical: "https://jamesscottsullivan.com/redline/trails/franconia-ridge-trail-demo",
    });
    expect(metadata.openGraph).toMatchObject({
      title: "Franconia Ridge Trail",
      description: metadata.description,
      url: "https://jamesscottsullivan.com/redline/trails/franconia-ridge-trail-demo",
    });
    expect(metadata.twitter).toMatchObject({ title: "Franconia Ridge Trail", description: metadata.description });
    expect(serialized).not.toMatch(/completionPercent|completedMiles|GPS|evidence|activity|internal|notes|private/i);
  });

  it("sets restrained root Open Graph and Twitter defaults without fake images", () => {
    stubSafeProductionEnv();
    const metadata = rootMetadata();

    expect(metadata.title).toEqual({ default: "White Mountains Redline", template: "%s | White Mountains Redline" });
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      siteName: "White Mountains Redline",
      title: "White Mountains Redline",
      description: defaultDescription,
      url: "https://jamesscottsullivan.com/redline/",
    });
    expect(metadata.twitter).toMatchObject({ card: "summary", title: "White Mountains Redline" });
    expect(JSON.stringify(metadata)).not.toMatch(/images/i);
  });
});

describe("sitemap metadata route", () => {
  it("returns no URLs when indexing is not safely enabled, avoiding demo trail details", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("TRAIL_REPOSITORY", "demo");

    expect(await sitemap()).toEqual([]);
  });

  it("includes public routes and verified Supabase trail slugs when indexing is safe", async () => {
    stubSafeProductionEnv();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => [supabaseTrailRow()],
    })));

    const urls = await sitemap();

    expect(urls.map((entry) => entry.url)).toEqual([
      "https://jamesscottsullivan.com/redline/",
      "https://jamesscottsullivan.com/redline/trails",
      "https://jamesscottsullivan.com/redline/trails/franconia-ridge-trail-demo",
    ]);
    expect(urls.map((entry) => entry.url).join("\n")).not.toMatch(/\?|account|login|admin|auth/);
  });
});

describe("robots metadata route and private metadata", () => {
  it("allows public crawling with private route disallows and sitemap only when indexing is safe", () => {
    stubSafeProductionEnv();

    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/account", "/login", "/auth/"],
      },
      sitemap: "https://jamesscottsullivan.com/redline/sitemap.xml",
    });
  });

  it("blocks crawling broadly when indexing is disabled", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");

    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        disallow: "/",
      },
      sitemap: undefined,
    });
  });

  it("marks account, login, and existing admin pages noindex/nofollow", () => {
    expect(accountMetadata.robots).toEqual({ index: false, follow: false });
    expect(loginMetadata.robots).toEqual({ index: false, follow: false });
    expect(adminPublicationMetadata.robots).toEqual({ index: false, follow: false });
  });
});

function stubSafeProductionEnv() {
  for (const [key, value] of Object.entries(safeProductionEnv)) {
    vi.stubEnv(key, value);
  }
}

function trailFixture(): TrailDetail {
  return {
    trailId: "trail-1",
    trailSlug: "franconia-ridge-trail-demo",
    name: "Franconia Ridge Trail",
    region: "Franconia-Pemigewasset",
    totalMiles: 4.5,
    segmentCount: 2,
    completedMiles: 3,
    completedSegments: 1,
    completionPercent: 50,
    bounds: [-71.7, 44.1, -71.6, 44.2],
    segments: [],
  };
}

function supabaseTrailRow() {
  return {
    id: "1",
    slug: "segment-one",
    segment_key: "segment-one",
    segment_name: "Segment One",
    miles: 4.5,
    data_status: "verified",
    verification_status: "human_verified",
    source_feature_ids: [],
    trail_id: "trail-1",
    trail_slug: "franconia-ridge-trail-demo",
    trail_name: "Franconia Ridge Trail",
    trail_region: "Franconia-Pemigewasset",
    coordinates: [[-71.7, 44.1], [-71.6, 44.2]],
  };
}
