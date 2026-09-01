import type { MetadataRoute } from "next";
import { isPublicIndexingEnabled, publicUrl } from "@/lib/seo/site-url";

const privatePaths = ["/admin/", "/account", "/login", "/auth/"];

export default function robots(): MetadataRoute.Robots {
  const indexingEnabled = isPublicIndexingEnabled();
  const sitemap = publicUrl("/sitemap.xml");

  return {
    rules: indexingEnabled
      ? {
          userAgent: "*",
          allow: "/",
          disallow: privatePaths,
        }
      : {
          userAgent: "*",
          disallow: "/",
        },
    sitemap: indexingEnabled && sitemap ? sitemap : undefined,
  };
}
