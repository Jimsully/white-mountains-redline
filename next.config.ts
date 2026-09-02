import type { NextConfig } from "next";
import { DEMO_PUBLICATION_ARTIFACT_PATH } from "./lib/publication/paths";

const DEMO_PUBLICATION_RUNTIME_ROUTES = [
  "/trails",
  "/trails/*",
  "/admin/publication",
  "/sitemap.xml",
] as const;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  outputFileTracingIncludes: Object.fromEntries(
    DEMO_PUBLICATION_RUNTIME_ROUTES.map((route) => [route, [DEMO_PUBLICATION_ARTIFACT_PATH]]),
  ),
};

export default nextConfig;
