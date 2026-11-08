"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/store";
import { homeFor } from "@/components/layout/nav";
import { SectionTitle } from "@/components/ui/misc";
import { OperationsStatus } from "@/components/admin/OperationsStatus";
import { ImportStatusPanel } from "@/components/admin/ImportStatusPanel";

/** Admin-only. The API enforces this too (GET /admin/imports requires the admin role); this just avoids a dead page. */
export default function AdminPage() {
  const role = useSession((s) => s.role);
  const router = useRouter();
  useEffect(() => { if (role && role !== "admin" && role !== "judge") router.replace(homeFor(role)); }, [role, router]);
  if (role !== "admin" && role !== "judge") return <p className="text-sm text-ink-2">Data import is available to administrators only.</p>;
  return (
    <div className="space-y-6">
      <SectionTitle title={role === "admin" ? "Data & operations" : "Dataset status"} subtitle="Ingestion status of the nine Tangerine challenge datasets. Raw records are preserved; analytics live in derived tables." />
      <ImportStatusPanel />
      <OperationsStatus />
    </div>
  );
}
