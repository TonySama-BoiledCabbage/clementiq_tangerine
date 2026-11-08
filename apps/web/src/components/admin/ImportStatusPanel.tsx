"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, Play, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useSession } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState, Skeleton, Spinner } from "@/components/ui/misc";

interface ImportStatus {
  datasets: { dataset: string; file: string; table: string; rows_in_db: number; last_run: null | { status: string; started_at: string; finished_at: string | null; rows_read: number; rows_loaded: number; error: string | null; report: Record<string, unknown> } }[];
  derived: null | { status: string; rows: number; finished_at: string | null; report: { relationships?: Record<string, number> } };
}

export function ImportStatusPanel() {
  const role = useSession((s) => s.role);
  const q = useQuery({ queryKey: ["imports"], queryFn: () => api<ImportStatus>("/admin/imports"), refetchInterval: 10_000 });
  const run = useMutation({ mutationFn: (force: boolean) => api(`/admin/imports/run?force=${force}`, { method: "POST" }), onSuccess: () => q.refetch() });
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={role !== "admin" || run.isPending} onClick={() => run.mutate(false)}>{run.isPending ? <Spinner /> : <Play />} Run import (skip unchanged)</Button>
        <Button variant="outline" disabled={role !== "admin" || run.isPending} onClick={() => run.mutate(true)}>Force full re-import</Button>
        {role !== "admin" && <span className="text-xs text-ink-3">Admin role required to run imports.</span>}
        {run.isSuccess && <Badge tone="good">import started in background</Badge>}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {q.data?.datasets.map((d) => {
          const r = d.last_run;
          const rep = (r?.report ?? {}) as Record<string, unknown>;
          return (
            <Card key={d.dataset} className="p-4">
              <div className="flex items-center justify-between"><p className="font-semibold">{d.file}</p>
                {!r ? <Badge><Clock /> never</Badge> : r.status === "success" ? <Badge tone="good"><CheckCircle2 /> {rep.skipped ? "unchanged" : "loaded"}</Badge> : r.status === "running" ? <Badge tone="warn"><Spinner /> running</Badge> : <Badge tone="bad"><XCircle /> failed</Badge>}</div>
              <p className="text-[0.6875rem] text-ink-3">→ table <code>{d.table}</code> · {d.rows_in_db.toLocaleString()} rows in DB</p>
              {r && <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[0.6875rem]">
                <dt className="text-ink-2">Rows read</dt><dd className="tabular text-right">{r.rows_read.toLocaleString()}</dd>
                <dt className="text-ink-2">Rows loaded</dt><dd className="tabular text-right">{r.rows_loaded.toLocaleString()}</dd>
                <dt className="text-ink-2">Duplicates dropped</dt><dd className="tabular text-right">{String(rep.duplicates_dropped ?? 0)}</dd>
                <dt className="text-ink-2">Null keys dropped</dt><dd className="tabular text-right">{String(rep.null_key_dropped ?? 0)}</dd>
                <dt className="text-ink-2">Orphans dropped</dt><dd className="tabular text-right">{JSON.stringify(rep.orphans_dropped ?? {})}</dd>
                <dt className="text-ink-2">Invalid dates</dt><dd className="tabular text-right">{JSON.stringify(rep.invalid_dates ?? {})}</dd>
                <dt className="text-ink-2">Currency reformatted</dt><dd className="tabular text-right">{String(rep.money_reformatted ?? 0)}</dd>
                <dt className="text-ink-2">Seconds</dt><dd className="tabular text-right">{String(rep.seconds ?? "—")}</dd>
              </dl>}
              {Array.isArray(rep.consistency) && (rep.consistency as string[]).map((c) => <p key={c} className="mt-1 text-[0.625rem] text-ink-3">✓ {c}</p>)}
              {!!rep.nulls && Object.keys(rep.nulls as object).length > 0 && <p className="mt-1 text-[0.625rem] text-ink-3">Nullable fields: {Object.entries(rep.nulls as Record<string, number>).map(([k, v]) => `${k} (${v})`).join(", ")}</p>}
              {r?.error && <p className="mt-1 text-[0.6875rem] text-bad">{r.error}</p>}
              {r && <p className="mt-1 text-[0.625rem] text-ink-3">{dateTime(r.finished_at ?? r.started_at)}</p>}
            </Card>
          );
        })}
      </div>
      {q.data?.derived && <Card className="p-4 text-sm"><p className="font-semibold">Derived: account_baselines — {q.data.derived.rows.toLocaleString()} rows ({q.data.derived.status})</p>
        <ul className="mt-1 grid gap-x-4 text-xs text-ink-2 sm:grid-cols-2">{Object.entries(q.data.derived.report.relationships ?? {}).map(([k, v]) => <li key={k}>{k.replace(/_/g, " ")}: <b className="text-ink">{v}</b></li>)}</ul></Card>}
    </div>
  );
}
