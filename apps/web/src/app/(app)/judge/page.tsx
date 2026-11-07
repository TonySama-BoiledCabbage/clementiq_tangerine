"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Gavel, XCircle } from "lucide-react";
import type { ShockComponent, SimResult } from "@clementiq/shared-types";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { useAccount, usePresets, useSummary } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, Skeleton } from "@/components/ui/misc";
import { NeedAccount, PageHeader } from "@/components/layout/PageKit";
import { FinancialImpactSummary, ShockScenarioSelector } from "@/components/finance/Shock";
import { AIInsightCard } from "@/components/ai/AIInsightCard";

interface Verify { inputs: Record<string, number>; rows: { twist: string; reference: string; engine: string; match: boolean }[]; all_match: boolean; formulas: Record<string, string> }

/** Live judging flow: account → baseline → shock (twist card) → runway → Goal Plan → Backup Plan → explanation. */
export default function JudgePage() {
  const accountId = useAccount();
  const s = useSummary(accountId);
  const presets = usePresets();
  const [components, setComponents] = useState<ShockComponent[]>([{ type: "job_loss", income_replacement_pct: 55, duration_months: 6 }]);
  const shock = useMemo(() => ({ account_id: accountId, components, mode: "judging" }), [accountId, components]);
  const sim = useQuery({ queryKey: ["judge-sim", shock], queryFn: () => api<SimResult>("/shocks/simulate", { method: "POST", json: shock }), enabled: !!accountId });
  const goal = useQuery({ queryKey: ["judge-goal", accountId], queryFn: () => api<{ target: number; gap: number; recommended_monthly_contribution: number; months_to_goal: number | null; status: string }>("/recovery/goal-plan", { method: "POST", json: { account_id: accountId } }), enabled: !!accountId });
  const backup = useQuery({ queryKey: ["judge-backup", shock], queryFn: () => api<{ monthly_shortfall: number; immediate_actions: { action: string }[]; best_tier: { discretionary_cut_pct: number; runway: { display: string } }; runway_improvement_months: number }>("/recovery/backup-plan", { method: "POST", json: { account_id: accountId, shock } }), enabled: !!accountId });
  const verify = useQuery({ queryKey: ["verify", accountId], queryFn: () => api<Verify>(`/judge/verify/${accountId}`), enabled: !!accountId });

  return (
    <div className="space-y-6">
      <PageHeader title="Judge Demo" subtitle={<><Gavel className="mr-1 inline size-4" /> Pick any account_id, read a twist card, and watch the numbers and plans update. Works without Gemini, news or blockchain.</>} />
      {!accountId && <NeedAccount />}
      {s.error && <ErrorState error={s.error} />}
      {accountId && (
        <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
          <div className="space-y-4">
            <Card><CardHeader><div><CardTitle>1 · Know the customer</CardTitle><CardDescription>Account #{accountId} · README definitions</CardDescription></div></CardHeader>
              <CardContent>{s.data ? <dl className="grid grid-cols-2 gap-2 text-sm">
                {(["I", "S", "F", "H", "B", "P"] as const).map((k) => <div key={k} className="rounded-xl bg-cream p-2"><dt className="text-[11px] text-ink-2">{({ I: "Income", S: "Spending", F: "Fixed costs", H: "Household bills", B: "Buffer", P: "Loan payment" })[k]} ({k})</dt><dd className="tabular font-bold">{money(s.data!.judging[k], true)}</dd></div>)}
                <div className="col-span-2 rounded-xl bg-peach p-2"><dt className="text-[11px] text-ink-2">Baseline runway</dt><dd className="tabular text-lg font-bold">{s.data.judging.runway.display}</dd></div>
              </dl> : <Skeleton className="h-40" />}</CardContent></Card>
            <Card><CardHeader><div><CardTitle>2 · Twist card</CardTitle><CardDescription>Judging Mode — no extra assumptions</CardDescription></div></CardHeader>
              <CardContent>{presets.data && <ShockScenarioSelector components={components} onChange={setComponents} types={presets.data.types} presets={presets.data.presets} onPreset={(p) => setComponents(p.components)} mode="judging" sValue={s.data?.judging.S} />}</CardContent></Card>
            <Card><CardHeader><div><CardTitle>Reference check</CardTitle><CardDescription>README twists recomputed independently</CardDescription></div>{verify.data && (verify.data.all_match ? <Badge tone="good"><CheckCircle2 /> all match</Badge> : <Badge tone="bad"><XCircle /> mismatch</Badge>)}</CardHeader>
              <CardContent><table className="w-full text-xs"><thead><tr className="text-left text-ink-2"><th className="py-1 font-medium">Twist</th><th className="text-right font-medium">Reference</th><th className="text-right font-medium">Engine</th></tr></thead>
                <tbody>{verify.data?.rows.map((r) => <tr key={r.twist} className="border-t border-line"><td className="py-1.5">{r.twist}</td><td className="tabular text-right">{r.reference}</td><td className="tabular text-right font-semibold">{r.engine} {r.match ? "✓" : "✗"}</td></tr>)}</tbody></table>
                <p className="mt-2 text-[10px] text-ink-3">Runway: {verify.data?.formulas.runway}</p></CardContent></Card>
          </div>
          <div className="space-y-4">
            <Card><CardHeader><div><CardTitle>3 · New numbers</CardTitle></div></CardHeader><CardContent>{sim.data ? <FinancialImpactSummary sim={sim.data} /> : sim.error ? <ErrorState error={sim.error} /> : <Skeleton className="h-64" />}</CardContent></Card>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardHeader><div><CardTitle>4 · Goal Plan</CardTitle><CardDescription>3-month emergency fund</CardDescription></div></CardHeader>
                <CardContent className="text-sm">{goal.data ? <ul className="space-y-1">
                  <li>Target <b>{money(goal.data.target)}</b> · gap <b>{money(goal.data.gap)}</b></li>
                  <li>Save <b>{money(goal.data.recommended_monthly_contribution)}</b>/month</li>
                  <li>Time to goal: <b>{goal.data.months_to_goal === null ? "needs spending reductions first" : goal.data.months_to_goal === 0 ? "already reached" : `${goal.data.months_to_goal} months`}</b></li>
                </ul> : <Skeleton className="h-20" />}</CardContent></Card>
              <Card><CardHeader><div><CardTitle>5 · Backup Plan</CardTitle><CardDescription>If this twist hits</CardDescription></div></CardHeader>
                <CardContent className="text-sm">{backup.data ? <>
                  <p>Shortfall <b>{money(backup.data.monthly_shortfall)}</b>/mo. Best option (trim discretionary {backup.data.best_tier.discretionary_cut_pct}%): runway <b>{backup.data.best_tier.runway.display}</b> (+{backup.data.runway_improvement_months.toFixed(1)} mo).</p>
                  <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-xs">{backup.data.immediate_actions.slice(0, 4).map((a) => <li key={a.action}>{a.action}</li>)}</ol>
                </> : <Skeleton className="h-20" />}</CardContent></Card>
            </div>
            <AIInsightCard title="6 · Explain the new numbers" endpoint="/ai/explain-scenario" kind="scenario" key={JSON.stringify(shock)} body={{ request: shock }} />
          </div>
        </div>
      )}
    </div>
  );
}
