import type { Metadata } from "next";
import { loadDefaultPublicationArtifact, loadPublicationArtifact } from "@/lib/publication/server-artifact";
import { PublicationWorkspace } from "@/app/admin/publication/PublicationWorkspace";

export const metadata: Metadata = {
  title: "Publication Admin | White Mountains Redline",
  robots: { index: false, follow: false },
};

export default function PublicationPage() {
  const artifact = process.env.PUBLICATION_ARTIFACT_PATH ? loadPublicationArtifact(loadDefaultPublicationArtifact()) : loadDefaultPublicationArtifact();
  return <PublicationWorkspace artifact={artifact} />;
}
