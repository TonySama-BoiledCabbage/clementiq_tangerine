"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Banknote, Landmark, PiggyBank, ShoppingCart, TrendingUp, Zap } from "lucide-react";
import type { SimResult } from "@clementiq/shared-types";
import { api } from "@/lib/api";
import { money, pct, timeAgo } from "@/lib/format";
import { useAccount, useEvents, useSummary } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, Progress, Skeleton } from "@/components/ui/misc";
import { NeedAccount, PageHeader } from "@/components/layout/PageKit";
import { FinancialMetricCard } from "@/components/finance/FinancialMetricCard";
import { NetWorthChart } from "@/components/finance/Charts";
import { FinancialRunwayGauge, ResilienceScoreGauge } from "@/components/finance/Gauges";
import { EngineBadge } from "@/components/finance/EngineBadge";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function OverviewPage() {
  const accountId = useAccount();
  const { data: s, isLoading, error, refetch } = useSummary(accountId);
  const events = useEvents();
  const shock = useQuery({
    queryKey: ["overview-shock", accountId],
    queryFn: () => api<SimResult>("/shocks/simulate", { method: "POST", json: { account_id: accountId, components: [{ type: "job_loss", income_replacement_pct: 55, duration_months: 6 }] } }),
    enabled: accountId != null,
  });
  const goal = useQuery({
    queryKey: ["overview-goal", accountId],
    queryFn: () => api<{ target: number; current_buffer: number; progress_pct: number; months_to_goal: number | null; recommended_monthly_contribution: number }>("/recovery/goal-plan", { method: "POST", json: { account_id: accountId } }),
    enabled: accountId != null,
  });
  const portfolio = useQuery({ queryKey: ["portfolio"], queryFn: () => api<{ total_value: number; holdings: unknown[]; holding_kinds: string[]; allocation: { asset_class: string; weight: number }[] }>("/investments/portfolio") });

  const calc = (n: string) => s?.calculations.find((c) => c.name === n);

  return (
    <div className="space-y-6">
      <PageHeader title={accountId ? `${greeting()} 👋` : "Welcome to ClementIQ"}
        subtitle={accountId ? <>Here’s the financial picture for account <b>#{accountId}</b>{s && <> · data through {s.data_as_of}</>}</> : "Your Daily Dose of Financial Intelligence"}
        computedAt={s?.computed_at} />
      {!accountId && <NeedAccount />}
      {error && <ErrorState error={error} retry={refetch} />}
      {accountId && isLoading && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}</div>}
      {s && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FinancialMetricCard label="Monthly income (I)" value={money(s.judging.I)} icon={Banknote} tone="good" calc={calc("income_I")} sub="Typical month · median of money in" />
            <FinancialMetricCard label="Monthly expenses (S)" value={money(s.judging.S)} icon={ShoppingCart} tone="orange" calc={calc("spending_S")}
              sub={<>Fixed costs {money(s.judging.F)} · bills {money(s.judging.H)}</>} />
            <FinancialMetricCard label="Savings buffer (B)" value={money(s.judging.B)} icon={PiggyBank} tone="blue" calc={calc("buffer_B")}
              sub={<>{s.metrics.coverage_months !== null ? `${s.metrics.coverage_months.toFixed(1)} months of spending` : "—"} · last 6 months avg</>} />
            <FinancialMetricCard label="Outstanding loans" value={s.loan?.running ? money(s.judging.P) + "/mo" : "None running"} icon={Landmark} tone="violet" calc={calc("loan_payment_P")}
              sub={s.loan ? <>Loan #{s.loan.loan_id} · status {s.loan.status} · {money(s.loan.amount)} over {s.loan.duration_months} mo</> : "No loan on record"} />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader><div><CardTitle>Net account position</CardTitle><CardDescription>Balance minus remaining scheduled loan payments</CardDescription></div><EngineBadge engine="clement-core" /></CardHeader>
              <CardContent><NetWorthChart data={s.net_position.series} label={s.net_position.label} /></CardContent>
            </Card>
            <Card>
              <CardHeader><div><CardTitle>Financial resilience</CardTitle><CardDescription>Project-defined, educational 0–100 score</CardDescription></div></CardHeader>
              <CardContent className="flex flex-col items-center gap-3">
                <ResilienceScoreGauge score={s.resilience.score} band={s.resilience.band} />
                <div className="w-full space-y-1.5">
                  {s.resilience.breakdown.slice(0, 4).map((b) => (
                    <div key={b.key}><div className="flex justify-between text-[11px]"><span className="text-ink-2">{b.label}</span><span className="tabular font-semibold">{b.points.toFixed(0)}/{b.max_points.toFixed(0)}</span></div><Progress value={b.score * 100} label={b.label} /></div>
                  ))}
                </div>
                <Button asChild variant="link" size="sm"><Link href="/resilience">Full breakdown <ArrowRight /></Link></Button>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader><div><CardTitle className="flex items-center gap-2"><Zap className="size-4 text-tangerine" /> Shock simulator preview</CardTitle><CardDescription>Laid off · EI pays 55% for 6 months</CardDescription></div></CardHeader>
              <CardContent>
                {shock.data ? <>
                  <FinancialRunwayGauge runway={shock.data.scenario.runway} size={180} />
                  {shock.data.verdict && <p className={`mt-2 text-center text-xs font-semibold ${shock.data.verdict.survives ? "text-good" : "text-bad"}`}>{shock.data.verdict.survives ? "✓ Makes it" : "▲ Falls short"} · gap {money(shock.data.scenario.gap)}/mo</p>}
                </> : <Skeleton className="h-32" />}
                <Button asChild variant="secondary" size="sm" className="mt-3 w-full"><Link href="/simulator">Open simulator</Link></Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><div><CardTitle>Recovery plan progress</CardTitle><CardDescription>Goal: 3 months of typical spending</CardDescription></div></CardHeader>
              <CardContent className="space-y-3">
                {goal.data ? <>
                  <div className="flex items-end justify-between"><p className="tabular text-2xl font-bold">{goal.data.progress_pct.toFixed(0)}%</p><p className="text-xs text-ink-2">{money(goal.data.current_buffer)} of {money(goal.data.target)}</p></div>
                  <Progress value={goal.data.progress_pct} tone="good" label="Emergency fund progress" />
                  <p className="text-xs text-ink-2">{goal.data.months_to_goal === 0 ? "Target already reached — consider a 6-month goal." : goal.data.months_to_goal ? <>Save <b>{money(goal.data.recommended_monthly_contribution)}</b>/month → about <b>{goal.data.months_to_goal}</b> months.</> : "Spending uses all income — the Goal Plan shows which reductions create room."}</p>
                </> : <Skeleton className="h-24" />}
                <Button asChild variant="secondary" size="sm" className="w-full"><Link href="/recovery">See Goal & Backup plans</Link></Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><div><CardTitle className="flex items-center gap-2"><TrendingUp className="size-4 text-invest" /> Investment portfolio</CardTitle><CardDescription>Separate from your emergency buffer</CardDescription></div></CardHeader>
              <CardContent className="space-y-2">
                {portfolio.data && portfolio.data.holdings.length > 0 ? <>
                  <p className="tabular text-2xl font-bold">{money(portfolio.data.total_value)}</p>
                  <div className="flex flex-wrap gap-1">{portfolio.data.holding_kinds.map((k) => <Badge key={k} tone={k === "demo" ? "warn" : "violet"}>{k} holdings</Badge>)}</div>
                  <p className="text-xs text-ink-2">{portfolio.data.allocation.map((a) => `${a.asset_class} ${pct(a.weight)}`).join(" · ")}</p>
                </> : <p className="text-xs text-ink-2">The Tangerine data contains no investments. Add your own holdings or load a clearly labelled demo portfolio.</p>}
                <Button asChild variant="secondary" size="sm" className="w-full"><Link href="/investments">Open investments</Link></Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><div><CardTitle>WorldPulse</CardTitle><CardDescription>Verified developments that could reach your budget</CardDescription></div>
              <Button asChild variant="link" size="sm"><Link href="/worldpulse">All developments <ArrowRight /></Link></Button></CardHeader>
            <CardContent>
              {events.data?.items.length ? (
                <ul className="divide-y divide-line">{events.data.items.slice(0, 4).map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{e.headline}</p><p className="text-[11px] text-ink-2">{e.source_name} · {timeAgo(e.published_at)} · {e.topic_label}</p></div>
                    <Button asChild size="sm" variant="outline"><Link href={`/worldpulse?event=${e.id}&topic=${e.topic}`}>Simulate impact</Link></Button>
                  </li>
                ))}</ul>
              ) : <p className="text-xs text-ink-2">{events.data?.empty_reason ?? "Loading…"} <Link className="font-semibold text-tangerine" href="/worldpulse">Open WorldPulse</Link></p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
