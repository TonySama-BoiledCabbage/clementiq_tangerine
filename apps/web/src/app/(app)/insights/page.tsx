"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ErrorBar, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Link from "next/link";
import { ArrowRight, ChevronRight, Lightbulb, Snowflake } from "lucide-react";
import { api } from "@/lib/api";
import { pct } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, Skeleton, Spinner } from "@/components/ui/misc";
import { SectionTitle } from "@/components/ui/misc";
import { ChartTooltip, DataTable, SERIES, axisProps, gridProps } from "@/components/finance/chart-kit";
import { EngineBadge } from "@/components/finance/EngineBadge";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/format";
import { useRoleGate } from "@/components/layout/useRoleGate";
import { FLAG_LABEL, type Attention } from "@/components/stress/attention";

/** The headline for the pitch: risk the runway formula alone can't see, and who to call first. */
function AttentionPreview() {
  const q = useQuery({ queryKey: ["needs-attention", null, "top5"], queryFn: () => api<Attention>("/insights/needs-attention?limit=5") });
  const d = q.data;
  if (q.error) return <ErrorState error={q.error} />;
  if (!d) return <Skeleton className="h-56 rounded-2xl shadow-card" />;
  return (
    <Card>
      <CardHeader>
        <div><CardTitle>Biggest finding: risk the formula can&apos;t see</CardTitle>
          <CardDescription>Flags from this month&apos;s payments, loan status and savings, on {d.active_accounts.toLocaleString()} active accounts</CardDescription></div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-[17px] leading-relaxed">
          <span className="tabular font-display text-[34px] font-bold leading-none text-tangerine">{d.counts.green_under_formula}</span>{" "}
          of the {d.total} flagged accounts show <b>no shortfall</b> under the README runway formula, yet are short this month, behind on a loan or holding under one month of savings.
        </p>
        <ul className="divide-y-[0.5px] divide-line overflow-hidden rounded-xl bg-cream">
          {d.items.map((it) => (
            <li key={it.account_id}>
              <Link href={`/judge?account=${it.account_id}`} className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-peach">
                <span className="tabular w-16 font-semibold">#{it.account_id}</span>
                <span className="flex flex-1 flex-wrap gap-1">{it.flags.map((f) => <Badge key={f} tone={f === "thin" ? "warn" : "bad"}>{FLAG_LABEL[f]}</Badge>)}</span>
                <span className="tabular hidden text-[13px] text-ink-2 sm:inline">{money(it.left_after_fixed)} after fixed</span>
                <ChevronRight className="size-4 text-chevron" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-ink-3">{d.use}</p>
          <Link href="/accounts" className="flex min-h-11 items-center gap-1 text-[15px] font-medium text-tangerine">See all {d.total}<ArrowRight className="size-4" aria-hidden /></Link>
        </div>
      </CardContent>
    </Card>
  );
}

interface Insights {
  available: boolean; reason?: string; n_accounts: number; compute_seconds: number; computed_at: string;
  findings: { id: string; title: string; text: string; n: number }[];
  coverage_hist: { bucket: string; accounts: number }[];
  twists: { scenario: string; median_runway: number; pct_under_3m: number; pct_survive_6m: number; pct_no_shortfall: number; n: number }[];
  low_coverage_correlations: { feature: string; label: string; spearman_rho: number | null; n: number }[];
  low_coverage_model: { target: string; positives: number; n: number; cv_auc_mean: number; cv_auc_std: number; standardized_coefficients: { label: string; coef: number }[]; note: string } | null;
  runway_by_fixed_burden: { quintile: string; fixed_burden_range: [number, number]; median_runway_ei55: number; ci95: [number | null, number | null]; pct_survive_6m: number; n: number }[];
  loan_comparison: { group: string; n: number; median_runway_ei55: number; median_coverage: number; pct_survive_6m: number }[];
  default_by_buffer: { quartile: string; n: number; default_rate: number; median_coverage: number }[];
  interventions: { intervention: string; median_gain_months: number; mean_gain_months: number; accounts_newly_surviving_6m: number; n_with_shortfall: number }[];
  regional: { n_districts: number; rho_unemployment_vs_runway: number | null; rho_salary_vs_runway: number | null; note: string };
  limitations: string[]; coverage_under_1m: number; coverage_under_3m: number;
}

function HBar({ data, x, y, name, fmt, height }: { data: Record<string, unknown>[]; x: string; y: string; name: string; fmt: (v: number) => string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(150, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 28 }}>
        <CartesianGrid {...gridProps} horizontal={false} vertical /><XAxis type="number" tickFormatter={fmt} {...axisProps} />
        <YAxis type="category" dataKey={y} width={170} {...axisProps} />
        <Tooltip content={<ChartTooltip fmt={fmt} />} cursor={{ fill: "var(--peach)" }} />
        <Bar dataKey={x} name={name} fill={SERIES.spending} radius={[0, 4, 4, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function InsightsPage() {
  const allowed = useRoleGate("staff");
  const q = useQuery({ queryKey: ["insights"], queryFn: () => api<Insights>("/insights"), staleTime: Infinity, enabled: allowed });
  const snow = useMutation({ mutationFn: () => api<{ available: boolean; text?: string; reason?: string; engine?: string; model?: string }>("/insights/snowflake-review", { method: "POST" }) });
  const d = q.data;
  const fq = d?.runway_by_fixed_burden.map((r) => ({ ...r, err: r.ci95[0] !== null && r.ci95[1] !== null ? [r.median_runway_ei55 - r.ci95[0]!, r.ci95[1]! - r.median_runway_ei55] : [0, 0] })) ?? [];
  if (!allowed) return null;
  return (
    <div className="space-y-6">
      <SectionTitle title="Portfolio Findings" subtitle="Computed live from all accounts in the Tangerine dataset. Associations, not causes — sample sizes shown." />
      <AttentionPreview />
      {q.error && <ErrorState error={q.error} retry={q.refetch} />}
      {q.isLoading && <Skeleton className="h-96" />}
      {d && !d.available && <p className="text-sm text-ink-2">{d.reason}</p>}
      {d?.available && (
        <>
          <p className="text-xs text-ink-3">n = {d.n_accounts.toLocaleString()} accounts · computed in {d.compute_seconds}s · <EngineBadge engine="clement-core" /></p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {d.findings.map((f) => (
              <Card key={f.id} className="p-4"><Lightbulb className="mb-2 size-5 text-tangerine" /><p className="font-semibold leading-snug">{f.title}</p><p className="mt-1 text-sm text-ink-2">{f.text}</p><p className="mt-2 text-[10px] text-ink-3">n = {f.n.toLocaleString()}</p></Card>
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card><CardHeader><div><CardTitle>The judges’ twists across the whole book</CardTitle><CardDescription>Share of accounts reaching 6 months of runway</CardDescription></div></CardHeader>
              <CardContent><HBar data={d.twists.map((t) => ({ ...t, v: t.pct_survive_6m * 100 }))} x="v" y="scenario" name="Survive 6 months" fmt={(v) => `${v.toFixed(0)}%`} />
                <DataTable caption="Twist outcomes" rows={d.twists as unknown as Record<string, unknown>[]} columns={[{ key: "scenario", label: "Scenario" }, { key: "median_runway", label: "Median runway", fmt: (v) => (v as number).toFixed(1) }, { key: "pct_under_3m", label: "< 3 months", fmt: (v) => pct(v as number) }, { key: "pct_survive_6m", label: "≥ 6 months", fmt: (v) => pct(v as number) }, { key: "pct_no_shortfall", label: "No shortfall", fmt: (v) => pct(v as number) }]} /></CardContent></Card>
            <Card><CardHeader><div><CardTitle>Emergency savings coverage</CardTitle><CardDescription>Buffer ÷ typical monthly spending (months)</CardDescription></div></CardHeader>
              <CardContent><ResponsiveContainer width="100%" height={220}><BarChart data={d.coverage_hist} margin={{ top: 8 }}><CartesianGrid {...gridProps} /><XAxis dataKey="bucket" {...axisProps} /><YAxis {...axisProps} width={40} /><Tooltip content={<ChartTooltip fmt={(v) => `${v} accounts`} />} cursor={{ fill: "var(--peach)" }} /><Bar dataKey="accounts" name="Accounts" fill={SERIES.balance} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
                <p className="text-xs text-ink-2">{pct(d.coverage_under_1m)} hold under 1 month of spending; {pct(d.coverage_under_3m)} under 3 months.</p></CardContent></Card>
            <Card><CardHeader><div><CardTitle>Borrowers vs non-borrowers</CardTitle><CardDescription>Share surviving 6 months on EI 55%</CardDescription></div></CardHeader>
              <CardContent><HBar data={d.loan_comparison.map((g) => ({ ...g, v: g.pct_survive_6m * 100, label: `${g.group} (n=${g.n})` }))} x="v" y="label" name="Survive 6 months" fmt={(v) => `${v.toFixed(0)}%`} /></CardContent></Card>
            <Card><CardHeader><div><CardTitle>Loan default rate by buffer quartile</CardTitle><CardDescription>Loan accounts only · buffer measured at end of data (reverse causality possible)</CardDescription></div></CardHeader>
              <CardContent><HBar data={d.default_by_buffer.map((g) => ({ ...g, v: g.default_rate * 100, label: `${g.quartile} (n=${g.n})` }))} x="v" y="label" name="Default rate" fmt={(v) => `${v.toFixed(0)}%`} /></CardContent></Card>
            <Card><CardHeader><div><CardTitle>Runway by fixed-cost burden quintile</CardTitle><CardDescription>Median EI-55% runway with bootstrap 95% CI</CardDescription></div></CardHeader>
              <CardContent><ResponsiveContainer width="100%" height={230}><BarChart data={fq} margin={{ top: 8 }}><CartesianGrid {...gridProps} /><XAxis dataKey="quintile" {...axisProps} /><YAxis {...axisProps} width={36} /><Tooltip content={<ChartTooltip fmt={(v) => `${v.toFixed(1)} months`} />} cursor={{ fill: "var(--peach)" }} />
                <Bar dataKey="median_runway_ei55" name="Median runway" fill={SERIES.fixed} radius={[4, 4, 0, 0]}><ErrorBar dataKey="err" width={6} stroke="var(--ink-2)" /></Bar></BarChart></ResponsiveContainer></CardContent></Card>
            <Card><CardHeader><div><CardTitle>Which intervention helps most?</CardTitle><CardDescription>Median runway gain under a common EI-55% shock (accounts with a shortfall)</CardDescription></div></CardHeader>
              <CardContent><HBar data={d.interventions as unknown as Record<string, unknown>[]} x="median_gain_months" y="intervention" name="Median gain" fmt={(v) => `${v.toFixed(2)} mo`} />
                <ul className="text-xs text-ink-2">{d.interventions.map((i) => <li key={i.intervention}>{i.intervention}: lifts {i.accounts_newly_surviving_6m} accounts over 6 months</li>)}</ul></CardContent></Card>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card><CardHeader><div><CardTitle>What is associated with a thin buffer (&lt; 1 month)?</CardTitle><CardDescription>Spearman correlation with coverage, and a cross-validated logistic model</CardDescription></div></CardHeader>
              <CardContent className="space-y-3">
                <HBar data={d.low_coverage_correlations.map((c) => ({ ...c, rho: c.spearman_rho ?? 0 }))} x="rho" y="label" name="ρ with coverage" fmt={(v) => v.toFixed(2)} />
                {d.low_coverage_model && <p className="text-xs text-ink-2">Model: AUC {d.low_coverage_model.cv_auc_mean.toFixed(2)} ± {d.low_coverage_model.cv_auc_std.toFixed(2)} (5-fold, n={d.low_coverage_model.n}, {d.low_coverage_model.positives} positives). Top standardized coefficients: {d.low_coverage_model.standardized_coefficients.slice(0, 3).map((c) => `${c.label} ${c.coef > 0 ? "+" : ""}${c.coef.toFixed(2)}`).join(" · ")}. {d.low_coverage_model.note}</p>}
              </CardContent></Card>
            <Card><CardHeader><div><CardTitle>Limitations & regional context</CardTitle></div></CardHeader>
              <CardContent className="space-y-2 text-xs text-ink-2">
                <p>Across {d.regional.n_districts} districts: ρ(unemployment, median runway) = {d.regional.rho_unemployment_vs_runway?.toFixed(2) ?? "n/a"}; ρ(average salary, median runway) = {d.regional.rho_salary_vs_runway?.toFixed(2) ?? "n/a"}. {d.regional.note}</p>
                <ul className="list-disc pl-4">{d.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
                <div className="rounded-xl border border-line p-3">
                  <p className="mb-2 flex items-center gap-1 font-semibold text-ink"><Snowflake className="size-4 text-sky-600" /> Independent second opinion (Snowflake Cortex)</p>
                  <Button size="sm" variant="outline" onClick={() => snow.mutate()} disabled={snow.isPending}>{snow.isPending && <Spinner />} Ask Snowflake Cortex</Button>
                  {snow.data && (snow.data.available ? <p className="mt-2 whitespace-pre-wrap text-ink">{snow.data.text} <span className="text-ink-3">({snow.data.model})</span></p> : <p className="mt-2">Not available: {snow.data.reason}</p>)}
                </div>
              </CardContent></Card>
          </div>
        </>
      )}
    </div>
  );
}
