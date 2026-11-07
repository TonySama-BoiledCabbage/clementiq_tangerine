"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAccount, useResilience } from "@/lib/hooks";
import { monthLabel } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, Progress, Skeleton } from "@/components/ui/misc";
import { NeedAccount, PageHeader } from "@/components/layout/PageKit";
import { ResilienceScoreGauge } from "@/components/finance/Gauges";
import { ChartTooltip, SERIES, axisProps, gridProps } from "@/components/finance/chart-kit";

const fmtVal = (v: number | null, unit: string) => v === null ? "n/a" : unit === "ratio" ? `${(v * 100).toFixed(0)}%` : unit === "months" ? `${v.toFixed(1)} mo` : unit === "days" ? `${v} days` : v.toFixed(2);

export default function ResiliencePage() {
  const accountId = useAccount();
  const { data: r, isLoading, error } = useResilience(accountId);
  return (
    <div className="space-y-6">
      <PageHeader title="Financial Resilience Score" subtitle="An explainable, project-defined educational metric (0–100) — not a credit score or a Tangerine risk rating" />
      {!accountId && <NeedAccount />}
      {error && <ErrorState error={error} />}
      {isLoading && <Skeleton className="h-80" />}
      {r && (
        <>
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <Card className="flex flex-col items-center justify-center gap-2 p-6">
              <ResilienceScoreGauge score={r.score} band={r.band} size={180} />
              {r.percentile !== undefined && <p className="text-xs text-ink-2">Higher than {r.percentile.toFixed(0)}% of accounts in the dataset</p>}
            </Card>
            <Card>
              <CardHeader><div><CardTitle>Score breakdown</CardTitle><CardDescription>Weights are fixed and documented; each input is normalised to 0–1</CardDescription></div></CardHeader>
              <CardContent className="space-y-3">
                {r.breakdown.map((b) => (
                  <div key={b.key}>
                    <div className="flex items-center justify-between text-sm"><span>{b.label} <span className="text-[11px] text-ink-3">· weight {(b.weight * 100).toFixed(0)}% · {fmtVal(b.value, b.unit)}</span></span><span className="tabular font-semibold">{b.points.toFixed(1)} / {b.max_points.toFixed(0)}</span></div>
                    <Progress value={b.score * 100} label={b.label} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card><CardHeader><div><CardTitle>Main strengths</CardTitle></div></CardHeader><CardContent>{r.strengths.length ? <ul className="space-y-1 text-sm">{r.strengths.map((s) => <li key={s} className="text-good">✓ <span className="text-ink">{s}</span></li>)}</ul> : <p className="text-xs text-ink-2">No component scores above 70% yet.</p>}</CardContent></Card>
            <Card><CardHeader><div><CardTitle>Main risks</CardTitle></div></CardHeader><CardContent>{r.risks.length ? <ul className="space-y-1 text-sm">{r.risks.map((s) => <li key={s} className="text-bad">▲ <span className="text-ink">{s}</span></li>)}</ul> : <p className="text-xs text-ink-2">No component below 50%.</p>}</CardContent></Card>
            <Card><CardHeader><div><CardTitle>Actions that could improve it</CardTitle></div></CardHeader><CardContent><ul className="space-y-2 text-sm">{r.improvements.map((i) => <li key={i.component}><b>{i.component}</b> <span className="text-xs text-ink-3">(up to +{i.potential_points.toFixed(0)} pts)</span><span className="block text-xs text-ink-2">{i.action}</span></li>)}</ul></CardContent></Card>
          </div>
          {r.history && r.history.length > 1 && (
            <Card><CardHeader><div><CardTitle>Historical changes</CardTitle><CardDescription>Score recomputed on expanding windows of this account’s own history</CardDescription></div></CardHeader>
              <CardContent><ResponsiveContainer width="100%" height={220}><LineChart data={r.history} margin={{ top: 8, right: 8 }}><CartesianGrid {...gridProps} /><XAxis dataKey="month" tickFormatter={monthLabel} {...axisProps} /><YAxis domain={[0, 100]} {...axisProps} width={32} />
                <Tooltip content={<ChartTooltip fmt={(v) => v.toFixed(1)} labelFmt={monthLabel} />} /><Line dataKey="score" name="Score" stroke={SERIES.spending} strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></CardContent></Card>
          )}
          <Card><CardContent className="space-y-1 pt-5 text-xs text-ink-2"><p><b>Disclaimer:</b> {r.disclaimer}</p>{r.warnings.map((w) => <p key={w} className="text-warn">⚠ {w}</p>)}
            <p>Liquidity and shock absorption both use the buffer; shock absorption also captures income dependence, so it carries a lower weight. Loan burden is already inside fixed costs and is not counted twice.</p></CardContent></Card>
        </>
      )}
    </div>
  );
}
