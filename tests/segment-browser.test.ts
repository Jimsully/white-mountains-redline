import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cameraDurationForReducedMotion, getSegmentBounds } from "@/lib/map/segment-bounds";

const root = process.cwd();
const segmentBrowserSource = fs.readFileSync(path.join(root, "components/SegmentBrowser.tsx"), "utf8");
const redlineAppSource = fs.readFileSync(path.join(root, "app/redline/RedlineApp.tsx"), "utf8");
const redlineMapSource = fs.readFileSync(path.join(root, "components/RedlineMap.tsx"), "utf8");
const progressPanelSource = fs.readFileSync(path.join(root, "components/ProgressPanel.tsx"), "utf8");

describe("segment bounds helper", () => {
  it("computes west south east north for a normal two-point line", () => {
    expect(getSegmentBounds([[-71.2, 44.1], [-71.1, 44.2]])).toEqual([-71.2, 44.1, -71.1, 44.2]);
  });

  it("returns the same bounds for reversed orientation", () => {
    expect(getSegmentBounds([[-71.1, 44.2], [-71.2, 44.1]])).toEqual([-71.2, 44.1, -71.1, 44.2]);
  });

  it("includes all points from a multi-point line", () => {
    expect(getSegmentBounds([[-71.3, 44.3], [-71.1, 44.0], [-71.2, 44.4]])).toEqual([-71.3, 44.0, -71.1, 44.4]);
  });

  it("pads duplicate or single-location coordinates into non-collapsed bounds", () => {
    expect(getSegmentBounds([[-71.2, 44.1], [-71.2, 44.1]])).toEqual([-71.2005, 44.0995, -71.1995, 44.1005]);
  });

  it("returns undefined for empty, malformed, or non-finite coordinates", () => {
    expect(getSegmentBounds([])).toBeUndefined();
    expect(getSegmentBounds([[1] as never])).toBeUndefined();
    expect(getSegmentBounds([[Number.NaN, 44]])).toBeUndefined();
    expect(getSegmentBounds([[-71, Number.POSITIVE_INFINITY]])).toBeUndefined();
  });

  it("uses immediate camera duration for reduced motion", () => {
    expect(cameraDurationForReducedMotion(true)).toBe(0);
    expect(cameraDurationForReducedMotion(false)).toBe(500);
  });
});

describe("M7C selection source contracts", () => {
  it("SegmentBrowser is controlled by selectedId and does not own selected state", () => {
    expect(segmentBrowserSource).toContain("selectedId?: string");
    expect(segmentBrowserSource).toContain("selectionOrigin: SelectionOrigin");
    expect(segmentBrowserSource).not.toMatch(/useState<.*selected|setSelectedId|const \[selected/i);
    expect(segmentBrowserSource).toContain("aria-current={selected ? \"true\" : undefined}");
  });

  it("browser rows are buttons that select by list origin and show completed/open state", () => {
    expect(segmentBrowserSource).toContain("<button");
    expect(segmentBrowserSource).toContain("onClick={() => onSelect(segment.id, \"list\")}");
    expect(segmentBrowserSource).toContain("segment.completed ? \"Completed\" : \"Open\"");
  });

  it("RedlineApp owns the single selected id and shares visibleSegments with map and browser", () => {
    expect(redlineAppSource.match(/useState\(initialSegments\[0\]\?\.id\)/g)?.length).toBe(1);
    expect(redlineAppSource).toContain("const visibleSegments = useMemo(() => filterTrailSegments(segments, filters)");
    expect(redlineAppSource).toContain("visibleSegments={visibleSegments}");
    expect(redlineAppSource).toContain("<RedlineMap segments={visibleSegments}");
  });

  it("list selection requests map focus while map selection only updates map origin", () => {
    expect(redlineAppSource).toContain("if (origin === \"list\") setFocusRequest");
    expect(redlineMapSource).toContain("onSelect(id, \"map\")");
    expect(redlineMapSource).toContain("focusRequest");
    expect(redlineMapSource).toContain("map.fitBounds");
  });

  it("map selection scrolls the selected row into the browser without page-level scroll coupling", () => {
    expect(segmentBrowserSource).toContain("selectionOrigin !== \"map\"");
    expect(segmentBrowserSource).toContain("row.scrollIntoView({ block: \"nearest\"");
    expect(segmentBrowserSource).not.toMatch(/IntersectionObserver|onScroll/);
  });

  it("ProgressPanel integrates SegmentBrowser before the selected detail without owning selection", () => {
    expect(progressPanelSource).toContain("<SegmentBrowser");
    expect(progressPanelSource).toContain("selectedId={selectedId}");
    expect(progressPanelSource).toContain("onSelect={onSelectSegment}");
    expect(progressPanelSource).not.toMatch(/useState\(.*selected/i);
  });
});