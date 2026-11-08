"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSources, useSettings } from "@/lib/hooks";
import { useSession } from "@/lib/store";
import { ErrorState, Skeleton } from "@/components/ui/misc";
import { DataSourceStatus } from "@/components/world/WorldPulse";

export function OperationsStatus() {
  const role = useSession((s) => s.role);
  const sources = useSources();
  const settings = useSettings();
  const [auditOpen, setAuditOpen] = useState(false);
  const audit = useQuery({ queryKey: ["admin-audit"], queryFn: () => api<{ items: { at: string; actor: string; action: string; resource: string | null }[] }>("/admin/audit?limit=30"), enabled: role === "admin" && auditOpen });
  return <div className="space-y-4">
    <section className="space-y-3 rounded-2xl bg-surface p-5"><h2 className="text-lg font-semibold">Sources & background jobs</h2>{sources.error ? <ErrorState error={sources.error} /> : sources.data ? <DataSourceStatus {...sources.data} /> : <Skeleton className="h-24" />}
      <ul className="space-y-2 text-sm">{Object.entries(sources.data?.monitoring.jobs ?? {}).map(([name, job]) => <li key={name} className="flex flex-wrap justify-between gap-2"><span>{name.replaceAll("_", " ")}</span><span className="text-ink-2">{job.last_status ?? "Not run"} · {job.last_success ?? "No successful run recorded"}</span></li>)}</ul>
    </section>
    <details className="rounded-2xl bg-surface px-5"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Configured integrations</summary><ul className="space-y-2 pb-5 text-sm">{Object.entries(settings.data?.integrations ?? {}).map(([name, value]) => <li key={name} className="flex flex-wrap justify-between gap-2"><span>{name.replaceAll("_", " ")}</span><span className="text-ink-2">{typeof value === "boolean" ? value ? "Configured" : "Not configured" : value}</span></li>)}</ul></details>
    {role === "admin" && <details onToggle={(e) => setAuditOpen(e.currentTarget.open)} className="rounded-2xl bg-surface px-5"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Recent audit records</summary>{audit.error && <ErrorState error={audit.error} />}<ul className="space-y-2 pb-5 text-xs">{audit.data?.items.map((item, i) => <li key={i} className="break-words">{item.at} · {item.actor} · {item.action} · {item.resource ?? "—"}</li>)}</ul></details>}
  </div>;
}
