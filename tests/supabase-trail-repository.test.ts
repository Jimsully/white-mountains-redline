import { describe, expect, it } from "vitest";
import { mapSupabaseSegmentRow, PUBLIC_TRAIL_SEGMENT_FIELDS } from "@/lib/repositories/supabase-trail-repository";

describe("mapSupabaseSegmentRow", () => {
  it("maps the trail_segment_api projection into an application segment", () => {
    const segment = mapSupabaseSegmentRow({
      id: "42",
      slug: "sample-segment",
      segment_name: "Junction to summit",
      miles: "1.75",
      data_status: "verified",
      verification_status: "human_verified",
      trail_id: "7",
      trail_slug: "sample-trail",
      trail_name: "Sample Trail",
      trail_region: "Franconia-Pemigewasset",
      coordinates: [[-71.7, 44.1], [-71.69, 44.11]],
    });

    expect(segment).toMatchObject({
      id: "42",
      slug: "sample-segment",
      trailId: "7",
      trailSlug: "sample-trail",
      trailName: "Sample Trail",
      region: "Franconia-Pemigewasset",
      miles: 1.75,
      completed: false,
      dataStatus: "verified",
      verificationStatus: "human_verified",
      coordinates: [[-71.7, 44.1], [-71.69, 44.11]],
      provenance: {
        provider: "other",
        dataset: "Verified public trail segment projection",
        sourceFeatureIds: [],
        manuallyModified: false,
      },
    });
  });

  it("skips rows with missing or malformed geometry coordinates", () => {
    const baseRow = {
      id: "42",
      slug: "sample-segment",
      segment_name: "Junction to summit",
      miles: 1,
      data_status: "verified" as const,
      verification_status: "human_verified" as const,
      trail_id: "7",
      trail_slug: "sample-trail",
      trail_name: "Sample Trail",
      trail_region: "Franconia-Pemigewasset" as const,
    };

    expect(mapSupabaseSegmentRow({ ...baseRow, coordinates: undefined })).toBeUndefined();
    expect(mapSupabaseSegmentRow({ ...baseRow, coordinates: [[-71.7], [-71.69, 44.11]] })).toBeUndefined();
  });

  it("rejects rows outside the verified and human-reviewed publication gate", () => {
    const baseRow = {
      id: "42",
      slug: "sample-segment",
      segment_name: "Junction to summit",
      miles: 1,
      trail_id: "7",
      trail_slug: "sample-trail",
      trail_name: "Sample Trail",
      trail_region: "Franconia-Pemigewasset" as const,
      coordinates: [[-71.7, 44.1], [-71.69, 44.11]] as [number, number][],
    };

    expect(mapSupabaseSegmentRow({ ...baseRow, data_status: "unverified", verification_status: "human_verified" })).toBeUndefined();
    expect(mapSupabaseSegmentRow({ ...baseRow, data_status: "verified", verification_status: "needs_reconciliation" })).toBeUndefined();
  });

  it("requests only the minimal public projection fields", () => {
    expect(PUBLIC_TRAIL_SEGMENT_FIELDS.split(",")).toEqual([
      "id", "slug", "segment_name", "miles", "data_status", "verification_status",
      "trail_id", "trail_slug", "trail_name", "trail_region", "coordinates",
    ]);
    expect(PUBLIC_TRAIL_SEGMENT_FIELDS).not.toMatch(/provenance|source|review|notes|fingerprint|\*/i);
  });
});
