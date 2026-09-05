import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
const progressPanel = fs.readFileSync(path.join(root, "components/ProgressPanel.tsx"), "utf8");
const redlineMap = fs.readFileSync(path.join(root, "components/RedlineMap.tsx"), "utf8");
const trailDetailMap = fs.readFileSync(path.join(root, "components/TrailDetailMap.tsx"), "utf8");
const trailsPage = fs.readFileSync(path.join(root, "app/trails/page.tsx"), "utf8");
const trailPage = fs.readFileSync(path.join(root, "app/trails/[slug]/page.tsx"), "utf8");

describe("M8E accessibility and responsive contracts", () => {
  it("exposes progress values, pressed filter state, and semantic section labels", () => {
    expect(progressPanel).toContain('role="progressbar"');
    expect(progressPanel).toContain("aria-valuenow");
    expect(progressPanel).toContain("aria-valuetext");
    expect(progressPanel).toContain("aria-pressed={filters.completion === completion}");
    expect(progressPanel).toContain('<h2 className="sectionHeading"');
  });

  it("keeps essential map information outside geography and reports map loading", () => {
    expect(redlineMap).toContain("keyboard-accessible segment list");
    expect(redlineMap).toContain('role="status">Loading map…');
    expect(trailDetailMap).toContain('aria-describedby="trail-detail-map-caption"');
    expect(trailDetailMap).toContain("trailDetailMapViewport");
    expect(trailDetailMap).toContain('role="status">Loading map…');
  });

  it("distinguishes demo data from configured public trail data", () => {
    expect(redlineMap).toContain('demoOnly ? "DEMO · NOT FOR NAVIGATION" : "NOT FOR NAVIGATION"');
    expect(trailDetailMap).toContain('demoOnly ? "DEMO · NOT FOR NAVIGATION" : "NOT FOR NAVIGATION"');
    expect(trailsPage).toContain("not a complete challenge inventory");
    expect(trailPage).toContain("simplified sample segments");
  });

  it("uses durable viewport units, touch targets, visible focus, disabled styling, and reduced-motion fallback", () => {
    expect(css).toContain("100dvh");
    expect(css).toContain("58dvh");
    expect(css).toContain("--focus: #8f2e23");
    expect(css).toMatch(/button:disabled\s*\{[^}]*cursor: not-allowed[^}]*opacity:/);
    expect(css).toContain(".maplibregl-ctrl-group button { width: 44px; height: 44px; }");
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*\.progressFill \{ transition: none; \}/);
    expect(css).toMatch(/max-width: 900px[\s\S]*overscroll-behavior: auto/);
  });
});
