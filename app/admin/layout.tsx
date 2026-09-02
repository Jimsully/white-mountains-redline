import { notFound } from "next/navigation";
import { isAdminToolsRuntimeAvailable } from "@/lib/admin/runtime";

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!isAdminToolsRuntimeAvailable()) {
    notFound();
  }

  return children;
}
