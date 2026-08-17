import artifact from "@/data/generated/reconciliation/demo-reconciliation.json";
import { ReconciliationWorkspace } from "@/app/admin/reconciliation/ReconciliationWorkspace";
import type { ReconciliationArtifact } from "@/types/reconciliation";

export const metadata = {
  title: "Source Reconciliation Workspace",
  robots: { index: false, follow: false },
};

export default function AdminReconciliationPage() {
  return <ReconciliationWorkspace artifact={artifact as unknown as ReconciliationArtifact} />;
}

