import fs from "node:fs";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { DEMO_PUBLICATION_ARTIFACT_PATH } from "@/lib/publication/paths";
import { PRIVATE_PUBLICATION_ARTIFACT_PRODUCTION_ERROR, loadPublicationArtifact } from "@/lib/publication/server-artifact";

const EXPECTED_DEMO_PUBLICATION_ROUTES = [
  "/trails",
  "/trails/*",
  "/admin/publication",
  "/sitemap.xml",
] as const;

describe("Vercel output tracing", () => {
  it("includes the canonical demo publication artifact for runtime routes that load demo trails", () => {
    const includes = nextConfig.outputFileTracingIncludes;

    expect(includes).toBeDefined();
    expect(Object.keys(includes ?? {}).sort()).toEqual([...EXPECTED_DEMO_PUBLICATION_ROUTES].sort());

    for (const route of EXPECTED_DEMO_PUBLICATION_ROUTES) {
      expect(includes?.[route]).toEqual([DEMO_PUBLICATION_ARTIFACT_PATH]);
    }

    expect(fs.existsSync(DEMO_PUBLICATION_ARTIFACT_PATH)).toBe(true);
  });

  it("does not include private or local publication artifact globs in traced runtime output", () => {
    const includes = Object.values(nextConfig.outputFileTracingIncludes ?? {}).flat();

    expect(includes).toEqual(expect.arrayContaining([DEMO_PUBLICATION_ARTIFACT_PATH]));
    expect(includes).not.toContain("data/generated/publication/*.json");
    expect(includes).not.toContain("data/generated/publication/verified-network.local.*.json");
    expect(includes.every((include) => !include.includes("local") && !include.includes("private"))).toBe(true);
  });

  it("keeps production private publication artifact safeguards intact", () => {
    expect(() => loadPublicationArtifact({} as never, {
      NODE_ENV: "production",
      PUBLICATION_ARTIFACT_PATH: "data/generated/publication/verified-network.local.test.json",
    } as NodeJS.ProcessEnv)).toThrow(PRIVATE_PUBLICATION_ARTIFACT_PRODUCTION_ERROR);
  });
});
