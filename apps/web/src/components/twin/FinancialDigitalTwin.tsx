"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SimResult, Summary } from "@clementiq/shared-types";
import { compactMoney, money } from "@/lib/format";
import { usePrefersReducedMotion, useSettings } from "@/lib/hooks";
import { Slider } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/misc";
import { ChartTooltip, DataTable, Legend, SERIES, axisProps, gridProps } from "@/components/finance/chart-kit";
import type { TwinPoint } from "./TwinScene";

const TwinScene = dynamic(() => import("./TwinScene"), { ssr: false, loading: () => <Skeleton className="h-full w-full" /> });

export function buildTwin(summary: Summary, sim: SimResult | undefined, historyMonths = 18): TwinPoint[] {
  const hist = summary.series.slice(-historyMonths).map((r) => ({ label: r.month, balance: r.month_end_balance, income: r.money_in, spending: r.money_out, kind: "history" as const }));
  if (!sim) return hist;
  const proj = sim.projection.slice(0, 18).map((p) => ({ label: `+${p.month}m`, balance: p.scenario_balance, income: p.scenario_income, spending: p.scenario_spending, kind: "shock" as const }));
  return [...hist, ...proj];
}

export function FinancialDigitalTwin({ summary, sim }: { summary: Summary; sim?: SimResult }) {
  const reduced = usePrefersReducedMotion();
  const settings = useSettings();
  const [webgl, setWebgl] = useState(true);
  const [view, setView] = useState<"3d" | "2d">("3d");
  const points = useMemo(() => buildTwin(summary, sim), [summary, sim]);
  const [sel, setSel] = useState(points.length - 1);
  useEffect(() => setSel(points.length - 1), [points.length]);
  useEffect(() => {
    try { const c = document.createElement("canvas"); setWebgl(!!(c.getContext("webgl2") || c.getContext("webgl"))); } catch { setWebgl(false); }
  }, []);
  const allow3d = webgl && !reduced && (settings.data?.preferences.display.enable_3d ?? true);
  const show3d = allow3d && view === "3d";
  const target = summary.metrics.emergency_fund_target_3m;
  const p = points[sel];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Legend items={[{ label: "Actual balance", color: "#16a34a" }, { label: "Shock projection", color: "#ff6b00" }, { label: "Income", color: SERIES.income }, { label: "Spending", color: SERIES.spending }]} />
        <div className="flex gap-1 rounded-xl bg-peach p-1 text-[0.6875rem] font-semibold">
          {(["3d", "2d"] as const).map((v) => <button key={v} disabled={v === "3d" && !allow3d} onClick={() => setView(v)} aria-pressed={view === v} className={`cursor-pointer rounded-lg px-2 py-1 ${view === v ? "bg-surface text-tangerine" : "text-ink-2"} disabled:opacity-40`}>{v.toUpperCase()}</button>)}
        </div>
      </div>
      {!allow3d && <p className="text-[0.6875rem] text-ink-3">3D is off ({!webgl ? "WebGL unavailable" : reduced ? "reduced motion preferred" : "disabled in Settings"}) — showing the 2D view.</p>}
      <div className="h-[380px] w-full overflow-hidden rounded-2xl border border-line bg-cream">
        {show3d ? <TwinScene points={points} target={target} selected={sel} onSelect={setSel} /> : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid {...gridProps} /><XAxis dataKey="label" {...axisProps} minTickGap={16} /><YAxis tickFormatter={compactMoney} {...axisProps} width={64} />
              <ReferenceLine y={0} stroke="var(--bad)" strokeDasharray="4 4" /><ReferenceLine y={target} stroke="var(--good)" strokeDasharray="4 4" />
              <Tooltip content={<ChartTooltip />} />
              <Line dataKey="balance" name="Balance" stroke={SERIES.balance} strokeWidth={2} dot={false} />
              <Line dataKey="income" name="Income" stroke={SERIES.income} strokeWidth={1.5} dot={false} />
              <Line dataKey="spending" name="Spending" stroke={SERIES.spending} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <div>
        <label className="text-xs font-medium text-ink-2">Move through the timeline</label>
        <Slider value={[sel]} min={0} max={Math.max(points.length - 1, 0)} step={1} onValueChange={([v]) => setSel(v)} aria-label="Timeline position" />
        {p && <p className="text-xs" aria-live="polite"><b>{p.label}</b> ({p.kind === "history" ? "actual record" : "Clement Core projection"}): balance {money(p.balance)}, income {money(p.income)}, spending {money(p.spending)}</p>}
      </div>
      <DataTable caption="Digital twin data" rows={points as unknown as Record<string, unknown>[]} columns={[{ key: "label", label: "Month" }, { key: "kind", label: "Type" }, { key: "balance", label: "Balance", fmt: (v) => money(v as number) }, { key: "income", label: "Income", fmt: (v) => money(v as number) }, { key: "spending", label: "Spending", fmt: (v) => money(v as number) }]} />
    </div>
  );
}
