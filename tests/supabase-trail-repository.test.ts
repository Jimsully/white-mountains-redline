import { describe, expect, it } from "vitest";
import { mapSupabaseSegmentRow } from "@/lib/repositories/supabase-trail-repository";

describe("mapSupabaseSegmentRow", () => {
  it("maps the trail_segment_api projection into an application segment", () => {
    const segment = mapSupabaseSegmentRow({
      id: "42",
      slug: "sample-segment",
      segment_key: "sample-segment",
      segment_name: "Junction to summit",
      miles: "1.75",
      data_status: "unverified",
      verification_status: "needs_reconciliation",
      source_label: "USFS",
      source_ref: "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublishWithDataStatus_01/MapServer/0",
      source_feature_ids: ["123"],
      geometry_manually_modified: true,
      reviewed_at: "2026-08-16T00:00:00.000Z",
      provenance: { provider: "USFS", dataset: "USFS fixture", notes: "projection test" },
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
      dataStatus: "unverified",
      verificationStatus: "needs_reconciliation",
      coordinates: [[-71.7, 44.1], [-71.69, 44.11]],
      provenance: {
        provider: "USFS",
        dataset: "USFS fixture",
        sourceFeatureIds: ["123"],
        manuallyModified: true,
      },
    });
  });

  it("skips rows with missing or malformed geometry coordinates", () => {
    const baseRow = {
      id: "42",
      slug: "sample-segment",
      segment_key: "sample-segment",
      segment_name: "Junction to summit",
      miles: 1,
      data_status: "unverified" as const,
      verification_status: "needs_reconciliation" as const,
      trail_id: "7",
      trail_slug: "sample-trail",
      trail_name: "Sample Trail",
      trail_region: "Franconia-Pemigewasset" as const,
    };

    expect(mapSupabaseSegmentRow({ ...baseRow, coordinates: undefined })).toBeUndefined();
    expect(mapSupabaseSegmentRow({ ...baseRow, coordinates: [[-71.7], [-71.69, 44.11]] })).toBeUndefined();
  });
});
