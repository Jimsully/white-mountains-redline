import demoArtifact from "@/data/generated/reconciliation/demo-reconciliation.json";
import { ReconciliationWorkspace } from "@/app/admin/reconciliation/ReconciliationWorkspace";
import { loadReconciliationArtifact } from "@/lib/reconciliation/server-artifact";
import type { ReconciliationArtifact } from "@/types/reconciliation";

export const metadata = {
  title: "Source Reconciliation Workspace",
  robots: { index: false, follow: false },
};

export default function AdminReconciliationPage() {
  return <ReconciliationWorkspace artifact={loadReconciliationArtifact(demoArtifact as unknown as ReconciliationArtifact)} />;
}