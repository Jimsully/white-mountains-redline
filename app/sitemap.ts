import type { MetadataRoute } from "next";
import { createTrailRepositoryRuntime } from "@/lib/repositories";
import { isPublicIndexingEnabled, publicUrl } from "@/lib/seo/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isPublicIndexingEnabled()) return [];

  const urls: MetadataRoute.Sitemap = [];
  const homeUrl = publicUrl("/");
  const trailsUrl = publicUrl("/trails");

  if (homeUrl) urls.push({ url: homeUrl });
  if (trailsUrl) urls.push({ url: trailsUrl });

  const runtime = createTrailRepositoryRuntime();
  if (runtime.mode !== "supabase") return urls;

  const trails = await runtime.repository.listTrails();
  for (const trail of trails) {
    const url = publicUrl(`/trails/${trail.trailSlug}`);
    if (url) urls.push({ url });
  }

  return urls;
}
