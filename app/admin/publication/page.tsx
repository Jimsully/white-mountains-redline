import type { Metadata } from "next";
import demoArtifact from "@/data/generated/publication/demo-verified-network.json";
import type { VerifiedNetworkArtifact } from "@/types/publication";
import { loadPublicationArtifact } from "@/lib/publication/server-artifact";
import { PublicationWorkspace } from "@/app/admin/publication/PublicationWorkspace";

export const metadata: Metadata = {
  title: "Publication Admin | White Mountains Redline",
  robots: { index: false, follow: false },
};

export default function PublicationPage() {
  const artifact = loadPublicationArtifact(demoArtifact as unknown as VerifiedNetworkArtifact);
  return <PublicationWorkspace artifact={artifact} />;
}
