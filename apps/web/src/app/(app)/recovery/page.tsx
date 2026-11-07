"use client";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Runway, ShockComponent } from "@clementiq/shared-types";
import { api } from "@/lib/api";
import { compactMoney, money } from "@/lib/format";
import { useAccount, usePresets } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { ErrorState, Skeleton } from "@/components/ui/misc";
import { NeedAccount, PageHeader } from "@/components/layout/PageKit";
import { ShockParameterSlider, ShockScenarioSelector } from "@/components/finance/Shock";
import { EmergencySavingsProgress, RecoveryPlanChecklist } from "@/components/finance/Recovery";
import { ChartTooltip, Legend, SERIES, axisProps, gridProps } from "@/components/finance/chart-kit";
import { AIInsightCard } from "@/components/ai/AIInsightCard";
import { FinancialRunwayGauge } from "@/components/finance/Gauges";

interface GoalPlan {
  computed_at: string; current_buffer: number; target: number; target_basis: string; gap: number; progress_pct: number; monthly_surplus: number;
  discretionary_cut_amount: number; recommended_monthly_contribution: number; months_to_goal: number | null; status: string;
  deadline: { monthly: number; achievable_with_current_settings: boolean; additional_monthly_needed?: number; discretionary_cut_pct_needed?: number | null } | null;
  milestones: { pct: number; amount: number; month: number | null; reached: boolean }[]; trajectory: { month: number; savings: number; target: number }[];
  suggested_reductions: { category: string; label: string; monthly_median: number; options: { cut_pct: number; monthly_saving: number }[]; basis: string }[];
  capacity_hint: { message: string; monthly_shortfall: number; discretionary_cut_pct_to_break_even: number | null } | null;
  assumptions: string[]; disclaimer: string;
}
interface Tier { name?: string; discretionary_cut_pct: number | null; monthly_cut: number; spending_after: number; gap: number; runway: Runway }
interface BackupPlan {
  computed_at: string; simulation: { scenario: { income: number; spending: number; one_off_costs: number; runway: Runway }; verdict: { text: string; survives: boolean } | null; assumptions: string[] };
  immediate_actions: { action: string; why: string; source?: string }[]; priority_expenses: { item: string; monthly: number; priority: string; basis: string }[];
  optional_reductions: GoalPlan["suggested_reductions"]; monthly_shortfall: number; discretionary_cut_pct_to_close_gap: number | null;
  emergency_savings_usage: { month: number; draw: number; remaining: number }[]; runway_improvement_months: number; best_tier: Tier; alternatives: Tier[]; disclaimer: string;
}

function GoalTab({ accountId }: { accountId: number }) {
  const [p, setP] = useState({ target_months: 3, target_basis: "spending", contribution_share_pct: 50, discretionary_cut_pct: 0, deadline_months: 0 });
  const body = { account_id: accountId, ...p, deadline_months: p.deadline_months || null };
  const q = useQuery({ queryKey: ["goal", body], queryFn: () => api<GoalPlan>("/recovery/goal-plan", { method: "POST", json: body }), placeholderData: keepPreviousData });
  const g = q.data;
  return (
    <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
      <Card>
        <CardHeader><div><CardTitle>Goal settings</CardTitle><CardDescription>Emergency savings target</CardDescription></div></CardHeader>
        <CardContent className="space-y-4">
          <div><Label htmlFor="basis">Target basis</Label>
            <Select id="basis" value={p.target_basis} onChange={(e) => setP({ ...p, target_basis: e.target.value })}>
              <option value="spending">Months of typical spending (S)</option><option value="fixed_costs">Months of fixed costs (F)</option>
            </Select></div>
          <ShockParameterSlider label="Target size" unit="months" value={p.target_months} min={1} max={12} onChange={(v) => setP({ ...p, target_months: v })} />
          <ShockParameterSlider label="Share of free cash saved" unit="%" value={p.contribution_share_pct} min={5} max={100} step={5} onChange={(v) => setP({ ...p, contribution_share_pct: v })} />
          <ShockParameterSlider label="Trim discretionary spending" unit="%" value={p.discretionary_cut_pct} min={0} max={50} onChange={(v) => setP({ ...p, discretionary_cut_pct: v })} />
          <ShockParameterSlider label="Deadline (0 = none)" unit="months" value={p.deadline_months} min={0} max={60} onChange={(v) => setP({ ...p, deadline_months: v })} />
        </CardContent>
      </Card>
      <div className="space-y-4">
        {q.error && <ErrorState error={q.error} />}
        {!g ? <Skeleton className="h-80" /> : (
          <>
            <Card>
              <CardHeader><div><CardTitle>Goal Plan</CardTitle><CardDescription>{g.target_basis}</CardDescription></div>
                <Badge tone={g.status === "reached" ? "good" : g.status === "no_capacity" ? "bad" : "orange"}>{g.status.replace("_", " ")}</Badge></CardHeader>
              <CardContent className="space-y-4">
                <EmergencySavingsProgress current={g.current_buffer} target={g.target} milestones={g.milestones} />
                <div className="grid gap-3 sm:grid-cols-4">
                  {[["Remaining gap", money(g.gap)], ["Monthly surplus", money(g.monthly_surplus)], ["Recommended / month", money(g.recommended_monthly_contribution)],
                    ["Time to goal", g.months_to_goal === null ? "—" : g.months_to_goal === 0 ? "Reached" : `${g.months_to_goal} months`]].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-cream p-3"><p className="text-[11px] text-ink-2">{k}</p><p className="tabular text-lg font-bold">{v}</p></div>
                  ))}
                </div>
                {g.deadline && <p className={`rounded-xl p-3 text-xs ${g.deadline.achievable_with_current_settings ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>
                  Deadline needs {money(g.deadline.monthly)}/month. {g.deadline.achievable_with_current_settings ? "✓ Achievable with these settings." : `▲ Needs about ${money(g.deadline.additional_monthly_needed)} more per month${g.deadline.discretionary_cut_pct_needed != null ? ` (≈ ${g.deadline.discretionary_cut_pct_needed.toFixed(0)}% discretionary trim)` : ""}.`}</p>}
                {g.capacity_hint && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">{g.capacity_hint.message} Shortfall {money(g.capacity_hint.monthly_shortfall)}/mo{g.capacity_hint.discretionary_cut_pct_to_break_even != null && ` — a ${g.capacity_hint.discretionary_cut_pct_to_break_even.toFixed(0)}% discretionary trim would break even`}.</p>}
                {g.trajectory.length > 1 && (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={g.trajectory} margin={{ top: 8, right: 8 }}>
                      <CartesianGrid {...gridProps} /><XAxis dataKey="month" tickFormatter={(m) => `M${m}`} {...axisProps} /><YAxis tickFormatter={compactMoney} {...axisProps} width={64} />
                      <Tooltip content={<ChartTooltip labelFmt={(m) => `Month ${m}`} />} />
                      <ReferenceLine y={g.target} stroke={SERIES.fixed} strokeDasharray="5 4" label={{ value: "Target", fill: "var(--ink-2)", fontSize: 10, position: "insideTopLeft" }} />
                      <Line dataKey="savings" name="Projected savings" stroke={SERIES.balance} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><div><CardTitle>Suggested expense reductions</CardTitle><CardDescription>Modeled savings, not guarantees</CardDescription></div></CardHeader>
                <CardContent className="space-y-3">
                  {g.suggested_reductions.length ? g.suggested_reductions.map((r) => (
                    <div key={r.category}><p className="text-sm font-semibold">{r.label} <span className="text-xs font-normal text-ink-2">· typical {money(r.monthly_median)}/mo</span></p>
                      <div className="mt-1 flex flex-wrap gap-1.5">{r.options.map((o) => <Badge key={o.cut_pct} tone="orange">−{o.cut_pct}% → {money(o.monthly_saving)}/mo</Badge>)}</div></div>
                  )) : <p className="text-xs text-ink-2">No discretionary outflows found to trim.</p>}
                  <ul className="pt-2 text-[11px] text-ink-3">{g.assumptions.map((a) => <li key={a}>• {a}</li>)}</ul>
                </CardContent>
              </Card>
              <AIInsightCard title="Explain this Goal Plan" endpoint="/ai/explain-plan" kind="plan" key={JSON.stringify(body)}
                body={{ account_id: accountId, plan_type: "goal", goal: body }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BackupTab({ accountId }: { accountId: number }) {
  const presets = usePresets();
  const [components, setComponents] = useState<ShockComponent[]>([{ type: "job_loss", income_replacement_pct: 55, duration_months: 6 }]);
  const shock = useMemo(() => ({ account_id: accountId, components, mode: "judging" as const }), [accountId, components]);
  const q = useQuery({ queryKey: ["backup", shock], queryFn: () => api<BackupPlan>("/recovery/backup-plan", { method: "POST", json: { account_id: accountId, shock } }), placeholderData: keepPreviousData });
  const b = q.data;
  const tiers = b?.alternatives.map((a) => ({ name: a.name ?? "", runway: a.runway.months_precise, display: a.runway.display })) ?? [];
  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader><div><CardTitle>If the shock hits…</CardTitle><CardDescription>Judging-mode shock</CardDescription></div></CardHeader>
        <CardContent>{presets.data ? <ShockScenarioSelector components={components} onChange={setComponents} types={presets.data.types} presets={presets.data.presets} onPreset={(p) => setComponents(p.components)} mode="judging" /> : <Skeleton className="h-60" />}</CardContent>
      </Card>
      <div className="space-y-4">
        {q.error && <ErrorState error={q.error} />}
        {!b ? <Skeleton className="h-80" /> : (
          <>
            <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
              <Card className="flex flex-col items-center justify-center p-4">
                <FinancialRunwayGauge runway={b.simulation.scenario.runway} label="Runway under shock" />
                {b.simulation.verdict && <p className={`mt-2 text-center text-xs font-semibold ${b.simulation.verdict.survives ? "text-good" : "text-bad"}`}>{b.simulation.verdict.text}</p>}
                <p className="mt-2 text-center text-xs text-ink-2">Shortfall {money(b.monthly_shortfall)}/mo · best modeled option adds <b>{b.runway_improvement_months.toFixed(1)}</b> months</p>
              </Card>
              <Card>
                <CardHeader><div><CardTitle>Immediate actions</CardTitle><CardDescription>Your Backup Plan checklist</CardDescription></div></CardHeader>
                <CardContent><RecoveryPlanChecklist id={`backup-${accountId}`} items={b.immediate_actions} /></CardContent>
              </Card>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><div><CardTitle>Alternative scenarios</CardTitle><CardDescription>Runway under each response (months, capped at 120)</CardDescription></div></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={tiers} layout="vertical" margin={{ left: 8, right: 24 }}>
                      <CartesianGrid {...gridProps} horizontal={false} vertical /><XAxis type="number" {...axisProps} domain={[0, (max: number) => Math.min(Math.ceil(max * 1.1), 120)]} />
                      <YAxis type="category" dataKey="name" width={150} {...axisProps} />
                      <Tooltip content={<ChartTooltip fmt={(v) => `${v.toFixed(1)} months`} />} cursor={{ fill: "var(--peach)" }} />
                      <Bar dataKey="runway" name="Runway" fill={SERIES.balance} radius={[0, 4, 4, 0]} barSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                  {b.discretionary_cut_pct_to_close_gap !== null && <p className="text-xs text-ink-2">A {Math.min(b.discretionary_cut_pct_to_close_gap, 100).toFixed(0)}% discretionary trim would close the monthly gap entirely.</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><div><CardTitle>Emergency savings usage</CardTitle><CardDescription>Monthly draw and remaining buffer</CardDescription></div></CardHeader>
                <CardContent>
                  <Legend items={[{ label: "Remaining buffer", color: SERIES.balance }]} />
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={b.emergency_savings_usage} margin={{ top: 8, right: 8 }}>
                      <CartesianGrid {...gridProps} /><XAxis dataKey="month" tickFormatter={(m) => `M${m}`} {...axisProps} /><YAxis tickFormatter={compactMoney} {...axisProps} width={64} />
                      <ReferenceLine y={0} stroke="var(--bad)" strokeDasharray="4 4" />
                      <Tooltip content={<ChartTooltip labelFmt={(m) => `Month ${m}`} />} />
                      <Line dataKey="remaining" name="Remaining" stroke={SERIES.balance} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><div><CardTitle>Priority expenses & obligations</CardTitle><CardDescription>Keep these current first</CardDescription></div></CardHeader>
                <CardContent><ul className="divide-y divide-line">{b.priority_expenses.map((p) => (
                  <li key={p.item} className="flex items-center justify-between py-2 text-sm"><span>{p.item} <Badge tone={p.priority === "essential" ? "bad" : p.priority === "contractual" ? "violet" : "neutral"}>{p.priority}</Badge><span className="block text-[11px] text-ink-3">{p.basis}</span></span><span className="tabular font-semibold">{money(p.monthly)}</span></li>
                ))}</ul>
                <p className="mt-2 text-[11px] text-ink-3">{b.disclaimer}</p></CardContent>
              </Card>
              <AIInsightCard title="Explain this Backup Plan" endpoint="/ai/explain-plan" kind="plan" key={JSON.stringify(shock)} body={{ account_id: accountId, plan_type: "backup", shock }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function RecoveryPage() {
  const accountId = useAccount();
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") === "backup" ? "backup" : "goal";
  return (
    <div className="space-y-6">
      <PageHeader title="Personalized Recovery Plans" subtitle="A Goal Plan to build your emergency fund, and a Backup Plan for if the shock hits — both from your own numbers" />
      {!accountId ? <NeedAccount /> : (
        <Tabs value={tab} onValueChange={(v) => { const p = new URLSearchParams(params.toString()); p.set("tab", v); router.replace(`/recovery?${p}`); }}>
          <TabsList className="mb-4"><TabsTrigger value="goal">Goal Plan</TabsTrigger><TabsTrigger value="backup">Backup Plan</TabsTrigger></TabsList>
          <TabsContent value="goal"><GoalTab accountId={accountId} /></TabsContent>
          <TabsContent value="backup"><BackupTab accountId={accountId} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}
