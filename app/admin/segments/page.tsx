import demoArtifact from "@/data/generated/segments/demo-segment-construction.json";
import { SegmentConstructionWorkspace } from "@/app/admin/segments/SegmentConstructionWorkspace";
import { loadSegmentConstructionArtifact } from "@/lib/segment-construction/server-artifact";
import type { SegmentConstructionArtifact } from "@/types/segment-construction";

export const metadata = {
  title: "Segment Construction Workspace",
  robots: { index: false, follow: false },
};

export default function AdminSegmentsPage() {
  return <SegmentConstructionWorkspace artifact={loadSegmentConstructionArtifact(demoArtifact as unknown as SegmentConstructionArtifact)} />;
}