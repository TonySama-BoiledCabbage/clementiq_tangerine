"use client";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesPoint, SimResult } from "@clementiq/shared-types";
import { compactMoney, money, monthLabel } from "@/lib/format";
import { ChartTooltip, DataTable, Legend, SERIES, axisProps, gridProps } from "./chart-kit";

export type Range = "3M" | "6M" | "12M" | "ALL";
export const RANGES: { id: Range; label: string; n: number }[] = [
  { id: "3M", label: "Quarter", n: 3 }, { id: "6M", label: "6 months", n: 6 }, { id: "12M", label: "Year", n: 12 }, { id: "ALL", label: "All", n: 10_000 },
];

export function RangeControl({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="inline-flex rounded-xl bg-peach p-1" role="group" aria-label="Date range">
      {RANGES.map((r) => (
        <button key={r.id} onClick={() => onChange(r.id)} aria-pressed={value === r.id}
          className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-semibold ${value === r.id ? "bg-surface text-tangerine shadow-sm" : "text-ink-2"}`}>{r.label}</button>
      ))}
    </div>
  );
}

function quarterly(rows: SeriesPoint[]) {
  const by = new Map<string, { month: string; money_in: number; money_out: number; fixed: number; n: number }>();
  for (const r of rows) {
    const [y, m] = r.month.split("-").map(Number);
    const key = `${y}-Q${Math.ceil(m / 3)}`;
    const cur = by.get(key) ?? { month: key, money_in: 0, money_out: 0, fixed: 0, n: 0 };
    cur.money_in += r.money_in; cur.money_out += r.money_out; cur.fixed += r.fixed; cur.n += 1;
    by.set(key, cur);
  }
  return [...by.values()];
}

export function IncomeExpenseChart({ series, height = 260, defaultRange = "12M" }: { series: SeriesPoint[]; height?: number; defaultRange?: Range }) {
  const [range, setRange] = useState<Range>(defaultRange);
  const [grain, setGrain] = useState<"month" | "quarter">("month");
  const data = useMemo(() => {
    const n = RANGES.find((r) => r.id === range)!.n;
    const sliced = series.slice(-n);
    return grain === "quarter" ? quarterly(sliced) : sliced;
  }, [series, range, grain]);
  const fmtX = (m: string) => (m.includes("Q") ? m : monthLabel(m));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Legend items={[{ label: "Money in", color: SERIES.income }, { label: "Money out", color: SERIES.spending }, { label: "Fixed costs", color: SERIES.fixed, dashed: true }]} />
        <div className="flex gap-2">
          <select aria-label="Granularity" value={grain} onChange={(e) => setGrain(e.target.value as "month" | "quarter")}
            className="h-8 rounded-lg border border-line bg-surface px-2 text-[11px] font-semibold text-ink-2">
            <option value="month">Monthly</option><option value="quarter">Quarterly totals</option>
          </select>
          <RangeControl value={range} onChange={setRange} />
        </div>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data as Record<string, unknown>[]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="month" tickFormatter={fmtX} {...axisProps} minTickGap={16} />
          <YAxis tickFormatter={compactMoney} {...axisProps} width={64} />
          <Tooltip content={<ChartTooltip labelFmt={fmtX} />} cursor={{ stroke: "var(--ink-3)", strokeDasharray: "3 3" }} />
          <Line type="monotone" dataKey="money_in" name="Money in" stroke={SERIES.income} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />
          <Line type="monotone" dataKey="money_out" name="Money out" stroke={SERIES.spending} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />
          <Line type="monotone" dataKey="fixed" name="Fixed costs" stroke={SERIES.fixed} strokeWidth={2} strokeDasharray="5 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <DataTable caption="Income and spending by period" rows={data as unknown as Record<string, unknown>[]}
        columns={[{ key: "month", label: "Period" }, { key: "money_in", label: "Money in", fmt: (v) => money(v as number) },
                  { key: "money_out", label: "Money out", fmt: (v) => money(v as number) }, { key: "fixed", label: "Fixed", fmt: (v) => money(v as number) }]} />
    </div>
  );
}

export function NetWorthChart({ data, label, height = 220 }: { data: { month: string; balance: number; net_position: number; loan_remaining: number }[]; label: string; height?: number }) {
  const [range, setRange] = useState<Range>("ALL");
  const rows = data.slice(-RANGES.find((r) => r.id === range)!.n);
  const hasLoan = rows.some((r) => r.loan_remaining > 0);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Legend items={[{ label: "Net account position", color: SERIES.balance }, ...(hasLoan ? [{ label: "Month-end balance", color: SERIES.income, dashed: true }] : [])]} />
        <RangeControl value={range} onChange={setRange} />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs><linearGradient id="np" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--series-3)" stopOpacity={0.28} /><stop offset="100%" stopColor="var(--series-3)" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="month" tickFormatter={monthLabel} {...axisProps} minTickGap={20} />
          <YAxis tickFormatter={compactMoney} {...axisProps} width={64} />
          <ReferenceLine y={0} stroke="var(--ink-3)" />
          <Tooltip content={<ChartTooltip labelFmt={monthLabel} />} />
          <Area type="monotone" dataKey="net_position" name="Net account position" stroke={SERIES.balance} strokeWidth={2} fill="url(#np)" />
          {hasLoan && <Line type="monotone" dataKey="balance" name="Month-end balance" stroke={SERIES.income} strokeDasharray="5 4" strokeWidth={2} dot={false} />}
        </AreaChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[11px] text-ink-3">{label}</p>
    </div>
  );
}

export function ScenarioComparisonChart({ sim, height = 260 }: { sim: SimResult; height?: number }) {
  const rows = [{ month: 0, baseline_balance: sim.baseline.B, scenario_balance: sim.scenario.buffer_left }, ...sim.projection];
  return (
    <div>
      <Legend items={[{ label: "Baseline (no shock)", color: SERIES.baseline, dashed: true }, { label: "With shock", color: SERIES.scenario }]} />
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="month" {...axisProps} tickFormatter={(m) => `M${m}`} />
          <YAxis tickFormatter={compactMoney} {...axisProps} width={64} />
          <ReferenceLine y={0} stroke="var(--bad)" strokeDasharray="4 4" label={{ value: "Buffer empty", fill: "var(--ink-2)", fontSize: 10, position: "insideBottomRight" }} />
          {sim.verdict && <ReferenceLine x={sim.verdict.required_months} stroke="var(--ink-3)" strokeDasharray="2 4" label={{ value: `${sim.verdict.required_months}-month shock`, fill: "var(--ink-2)", fontSize: 10, position: "top" }} />}
          <Tooltip content={<ChartTooltip labelFmt={(m) => `Month ${m}`} />} />
          <Line type="monotone" dataKey="baseline_balance" name="Baseline" stroke={SERIES.baseline} strokeDasharray="5 4" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="scenario_balance" name="With shock" stroke={SERIES.scenario} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[11px] text-ink-3">Projection assumes typical (median) months repeat. Illustrative; the runway number above is the authoritative result.</p>
    </div>
  );
}
