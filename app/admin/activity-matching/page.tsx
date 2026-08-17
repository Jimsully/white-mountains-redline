import type { Metadata } from "next";
import demoArtifact from "@/data/generated/activity-matching/demo-activity-matching.json";
import type { ActivityMatchArtifact } from "@/types/activity-matching";
import { loadActivityMatchArtifact } from "@/lib/activity-matching/server-artifact";
import { ActivityMatchingWorkspace } from "@/app/admin/activity-matching/ActivityMatchingWorkspace";

export const metadata: Metadata = {
  title: "Activity Matching Admin | White Mountains Redline",
  robots: { index: false, follow: false },
};

export default function ActivityMatchingPage() {
  const artifact = loadActivityMatchArtifact(demoArtifact as unknown as ActivityMatchArtifact);
  return <ActivityMatchingWorkspace artifact={artifact} />;
}