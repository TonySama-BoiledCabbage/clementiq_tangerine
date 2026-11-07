"use client";
import { SectionTitle } from "@/components/ui/misc";
import { ImportStatusPanel } from "@/components/admin/ImportStatusPanel";

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <SectionTitle title="Data Import" subtitle="Ingestion status of the nine Tangerine challenge datasets. Raw records are preserved; analytics live in derived tables." />
      <ImportStatusPanel />
    </div>
  );
}
