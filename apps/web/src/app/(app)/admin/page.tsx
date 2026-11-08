"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/store";
import { homeFor } from "@/components/layout/nav";
import { SectionTitle } from "@/components/ui/misc";
import { ImportStatusPanel } from "@/components/admin/ImportStatusPanel";

/** Admin-only. The API enforces this too (GET /admin/imports requires the admin role); this just avoids a dead page. */
export default function AdminPage() {
  const role = useSession((s) => s.role);
  const router = useRouter();
  useEffect(() => { if (role && role !== "admin") router.replace(homeFor(role)); }, [role, router]);
  if (role !== "admin") return <p className="text-sm text-ink-2">Data import is available to administrators only.</p>;
  return (
    <div className="space-y-6">
      <SectionTitle title="Data Import" subtitle="Ingestion status of the nine Tangerine challenge datasets. Raw records are preserved; analytics live in derived tables." />
      <ImportStatusPanel />
    </div>
  );
}
