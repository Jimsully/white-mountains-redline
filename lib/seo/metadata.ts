import type { Metadata } from "next";
import type { TrailDirectorySearchParams } from "@/lib/trails/trail-directory";
import { publicUrl, resolvePublicSiteUrl, isPublicIndexingEnabled } from "@/lib/seo/site-url";
import type { TrailDetail } from "@/types/trails";

export const siteName = "White Mountains Redline";

export const defaultDescription = "Independent White Mountains trail-completion tracker focused on verified public trail segments.";

export const privateRobots: Metadata["robots"] = {
  index: false,
  follow: false,
};

export function publicRobots(): Metadata["robots"] {
  return isPublicIndexingEnabled()
    ? { index: true, follow: true }
    : { index: false, follow: true };
}

export function rootMetadata(): Metadata {
  const baseUrl = resolvePublicSiteUrl();
  const homeUrl = publicUrl("/");
  const indexingEnabled = isPublicIndexingEnabled();

  return {
    metadataBase: baseUrl ?? undefined,
    title: {
      default: siteName,
      template: `%s | ${siteName}`,
    },
    description: defaultDescription,
    robots: indexingEnabled
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: {
      type: "website",
      siteName,
      title: siteName,
      description: defaultDescription,
      url: homeUrl ?? undefined,
    },
    twitter: {
      card: "summary",
      title: siteName,
      description: defaultDescription,
    },
  };
}

export function homeMetadata(): Metadata {
  const url = publicUrl("/");
  return {
    title: "Interactive Redline Map",
    description: defaultDescription,
    alternates: canonical(url),
    openGraph: {
      title: "Interactive Redline Map",
      description: defaultDescription,
      url: url ?? undefined,
    },
    twitter: {
      title: "Interactive Redline Map",
      description: defaultDescription,
    },
  };
}

export async function trailDirectoryMetadata(searchParams?: Promise<TrailDirectorySearchParams>): Promise<Metadata> {
  const params = await searchParams;
  const filtered = hasDirectoryQueryState(params);
  const url = publicUrl("/trails");

  return {
    title: "White Mountains Trails",
    description: "Browse verified public White Mountains trail pages by name and region.",
    robots: filtered
      ? { index: false, follow: true }
      : publicRobots(),
    alternates: canonical(url),
    openGraph: {
      title: "White Mountains Trails",
      description: "Browse verified public White Mountains trail pages by name and region.",
      url: url ?? undefined,
    },
    twitter: {
      title: "White Mountains Trails",
      description: "Browse verified public White Mountains trail pages by name and region.",
    },
  };
}

export function trailMetadata(trail: TrailDetail): Metadata {
  const url = publicUrl(`/trails/${trail.trailSlug}`);
  const description = `${trail.name} in ${trail.region}: ${trail.totalMiles.toFixed(1)} verified miles across ${trail.segmentCount} published completion segment${trail.segmentCount === 1 ? "" : "s"}.`;

  return {
    title: trail.name,
    description,
    alternates: canonical(url),
    openGraph: {
      title: trail.name,
      description,
      url: url ?? undefined,
    },
    twitter: {
      title: trail.name,
      description,
    },
  };
}

function canonical(url: string | null): Metadata["alternates"] {
  return url ? { canonical: url } : undefined;
}

function hasDirectoryQueryState(params: TrailDirectorySearchParams | undefined) {
  return hasValue(params?.q) || hasValue(params?.region);
}

function hasValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.some((item) => item.trim().length > 0);
  return typeof value === "string" && value.trim().length > 0;
}
