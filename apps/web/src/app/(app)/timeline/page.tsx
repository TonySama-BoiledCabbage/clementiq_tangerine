"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CreditCard, Landmark, PiggyBank, TrendingDown } from "lucide-react";
import { api } from "@/lib/api";
import { useAccount, usePresets, useSimulation, useSummary } from "@/lib/hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { ErrorState, Skeleton } from "@/components/ui/misc";
import { NeedAccount, PageHeader } from "@/components/layout/PageKit";
import { FinancialDigitalTwin } from "@/components/twin/FinancialDigitalTwin";
import { ExportReportButton } from "@/components/reports/ExportReportButton";

interface Timeline { events: { date: string; type: string; title: string; detail?: string; source: string }[] }
const ICON: Record<string, React.ElementType> = { account: PiggyBank, card: CreditCard, loan: Landmark, anomaly: AlertTriangle, overdraft: TrendingDown };
const TONE: Record<string, string> = { account: "bg-green-100 text-green-700", card: "bg-sky-100 text-sky-700", loan: "bg-violet-100 text-violet-700", anomaly: "bg-amber-100 text-amber-800", overdraft: "bg-red-100 text-red-700" };

export default function TimelinePage() {
  const accountId = useAccount();
  const summary = useSummary(accountId);
  const presets = usePresets();
  const [preset, setPreset] = useState("ei55_6m");
  const [types, setTypes] = useState<Set<string>>(new Set(["account", "card", "loan", "anomaly", "overdraft"]));
  const pr = presets.data?.presets.find((p) => p.id === preset);
  const sim = useSimulation({ account_id: accountId, components: pr?.components ?? [], mode: "extended", horizon_months: 18 }, !!accountId && !!pr);
  const tl = useQuery({ queryKey: ["timeline", accountId], queryFn: () => api<Timeline>(`/accounts/${accountId}/timeline`), enabled: !!accountId });
  const events = (tl.data?.events ?? []).filter((e) => types.has(e.type));

  return (
    <div className="space-y-6">
      <PageHeader title="Financial Timeline" subtitle="Your recorded history, then Clement Core’s modeled future under a chosen scenario"
        right={<ExportReportButton report="timeline" accountId={accountId} />} />
      {!accountId && <NeedAccount />}
      {summary.error && <ErrorState error={summary.error} />}
      {accountId && (
        <>
          <Card>
            <CardHeader>
              <div><CardTitle>Financial Digital Twin</CardTitle><CardDescription>Rotate, zoom, hover and click bars. Every bar is a real record or a Clement Core projection (extended mode).</CardDescription></div>
              <Select aria-label="Scenario" className="h-9 w-72 text-xs" value={preset} onChange={(e) => setPreset(e.target.value)}>
                {presets.data?.presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </CardHeader>
            <CardContent>{summary.data ? <FinancialDigitalTwin summary={summary.data} sim={sim.data} /> : <Skeleton className="h-96" />}
              {sim.data && <p className="mt-2 text-[0.6875rem] text-ink-3">Projection assumptions: {sim.data.assumptions.join(" ")}</p>}</CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Events from your records</CardTitle><CardDescription>{events.length} events</CardDescription></div>
              <div className="flex flex-wrap gap-1">{Object.keys(ICON).map((t) => (
                <button key={t} aria-pressed={types.has(t)} onClick={() => { const n = new Set(types); n.has(t) ? n.delete(t) : n.add(t); setTypes(n); }}
                  className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-[0.6875rem] capitalize ${types.has(t) ? "border-tangerine text-tangerine" : "border-line text-ink-3"}`}>{t}</button>
              ))}</div></CardHeader>
            <CardContent>
              {tl.isLoading && <Skeleton className="h-40" />}
              <ol className="relative ml-3 border-l border-line">
                {events.map((e, i) => { const I = ICON[e.type] ?? AlertTriangle; return (
                  <li key={i} className="mb-4 ml-5">
                    <span className={`absolute -left-3 grid size-6 place-items-center rounded-full ${TONE[e.type] ?? "bg-slate-100"}`}><I className="size-3.5" /></span>
                    <p className="text-[0.6875rem] text-ink-3">{e.date}</p><p className="text-sm font-medium">{e.title}</p>
                    <p className="text-[0.6875rem] text-ink-2">{e.detail ? `${e.detail} · ` : ""}{e.source}</p>
                  </li>); })}
              </ol>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
