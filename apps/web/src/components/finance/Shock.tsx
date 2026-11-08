"use client";
import { Plus, Trash2 } from "lucide-react";
import type { Preset, ShockComponent, ShockType, SimResult } from "@clementiq/shared-types";
import { money, signedMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/controls";
import { FinancialRunwayGauge } from "./Gauges";
import { useComfort } from "@/lib/hooks";
import { calmVerdict } from "@/components/ui/comfort";

export const SHOCK_DEFAULTS: Record<ShockType, ShockComponent> = {
  job_loss: { type: "job_loss", income_replacement_pct: 55, duration_months: 6 },
  income_reduction: { type: "income_reduction", pct: 20 },
  reduced_hours: { type: "reduced_hours", pct: 20 },
  rent_increase: { type: "rent_increase", pct: 10 },
  bill_inflation: { type: "bill_inflation", pct: 15 },
  emergency_expense: { type: "emergency_expense", amount: 2000 },
  vehicle_repair: { type: "vehicle_repair", amount: 1500 },
  transport_cost: { type: "transport_cost", amount: 150 },
  grocery_cost: { type: "grocery_cost", amount: 120 },
  loan_payment_increase: { type: "loan_payment_increase", pct: 10 },
  spending_inflation: { type: "spending_inflation", pct: 3 },
};

export function ShockParameterSlider({ label, value, min, max, step = 1, unit, onChange, hint }: {
  label: string; value: number; min: number; max: number; step?: number; unit: "%" | "$" | "months" | "× S" | "/day" | "pts"; onChange: (v: number) => void; hint?: string;
}) {
  const shown = unit === "$" ? money(value) : unit === "%" ? `${value}%` : `${value} ${unit}`;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-ink-2">{label}</label>
        <input type="number" value={value} min={min} max={max} step={step} aria-label={`${label} value`}
          onChange={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v)) onChange(Math.max(min, Math.min(max, v))); }}
          className="tabular h-7 w-24 rounded-lg border border-line bg-surface px-2 text-right text-xs" />
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} aria-label={label} />
      <p className="text-[0.625rem] text-ink-3">{shown}{hint ? ` · ${hint}` : ""}</p>
    </div>
  );
}

/** Editable list of combined shocks with type-specific sliders. */
export function ShockScenarioSelector({ components, onChange, types, presets, onPreset, mode, sValue }: {
  components: ShockComponent[]; onChange: (c: ShockComponent[]) => void; types: Record<string, string>; presets: Preset[];
  onPreset: (p: Preset) => void; mode: "judging" | "extended"; sValue?: number;
}) {
  const upd = (i: number, patch: Partial<ShockComponent>) => onChange(components.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => onChange(components.filter((_, j) => j !== i));
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold text-ink-2">Scenario presets</p>
        <div className="flex flex-wrap gap-1.5">
          {presets.filter((p) => mode === "extended" || p.judging).map((p) => (
            <button key={p.id} onClick={() => onPreset(p)} className="cursor-pointer rounded-full border border-line px-3 py-1 text-[0.6875rem] font-medium hover:border-tangerine hover:text-tangerine">{p.name}</button>
          ))}
        </div>
      </div>
      {components.map((c, i) => (
        <div key={i} className="rounded-2xl border border-line bg-cream p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <select value={c.type} aria-label="Shock type" onChange={(e) => upd(i, { ...SHOCK_DEFAULTS[e.target.value as ShockType], type: e.target.value as ShockType } as ShockComponent)}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-xs font-semibold">
              {Object.entries(types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button onClick={() => remove(i)} disabled={components.length === 1} aria-label="Remove shock" className="cursor-pointer rounded-lg p-1.5 text-ink-3 hover:bg-peach hover:text-bad disabled:opacity-30"><Trash2 className="size-4" /></button>
          </div>
          <div className="space-y-3">
            {c.type === "job_loss" && <>
              <ShockParameterSlider label="Income still received (EI = 55%)" unit="%" value={c.income_replacement_pct ?? 0} min={0} max={100} onChange={(v) => upd(i, { income_replacement_pct: v })} />
              <ShockParameterSlider label="Duration" unit="months" value={c.duration_months ?? 6} min={1} max={24} onChange={(v) => upd(i, { duration_months: v })} hint="survival test length" />
            </>}
            {["income_reduction", "reduced_hours", "bill_inflation", "spending_inflation"].includes(c.type) &&
              <ShockParameterSlider label={c.type === "bill_inflation" ? "Household bills increase (× H)" : c.type === "spending_inflation" ? "Price increase (× S)" : "Income reduction"} unit="%" value={c.pct ?? 0} min={0} max={100} onChange={(v) => upd(i, { pct: v })} />}
            {["rent_increase", "loan_payment_increase"].includes(c.type) && (
              c.amount !== undefined
                ? <ShockParameterSlider label="Monthly increase" unit="$" value={c.amount} min={0} max={5000} step={25} onChange={(v) => upd(i, { amount: v })} />
                : <ShockParameterSlider label={c.type === "rent_increase" ? "Increase (× H)" : "Increase (× P)"} unit="%" value={c.pct ?? 0} min={0} max={100} onChange={(v) => upd(i, { pct: v })} />
            )}
            {["rent_increase", "loan_payment_increase"].includes(c.type) && (
              <button className="cursor-pointer text-[0.6875rem] font-semibold text-tangerine" onClick={() => upd(i, c.amount !== undefined ? { amount: undefined, pct: 10 } : { pct: undefined, amount: 200 })}>
                Switch to {c.amount !== undefined ? "percentage" : "$ amount"}
              </button>
            )}
            {["transport_cost", "grocery_cost"].includes(c.type) && (
              mode === "extended" && c.pct !== undefined
                ? <ShockParameterSlider label="Price increase (on estimated category)" unit="%" value={c.pct} min={0} max={100} onChange={(v) => upd(i, { pct: v })} hint="ESTIMATED allocation" />
                : <ShockParameterSlider label="Extra per month" unit="$" value={c.amount ?? 0} min={0} max={2000} step={10} onChange={(v) => upd(i, { amount: v })} />
            )}
            {["transport_cost", "grocery_cost"].includes(c.type) && mode === "extended" && (
              <button className="cursor-pointer text-[0.6875rem] font-semibold text-tangerine" onClick={() => upd(i, c.pct !== undefined ? { pct: undefined, amount: 100 } : { amount: undefined, pct: 10 })}>
                Switch to {c.pct !== undefined ? "$ amount" : "% of estimated spending"}
              </button>
            )}
            {["emergency_expense", "vehicle_repair"].includes(c.type) && (
              c.months_of_spending !== undefined
                ? <ShockParameterSlider label="One-off cost" unit="× S" value={c.months_of_spending} min={0} max={6} step={0.25} onChange={(v) => upd(i, { months_of_spending: v })} hint={sValue ? `= ${money(c.months_of_spending * sValue)}` : undefined} />
                : <ShockParameterSlider label="One-off cost" unit="$" value={c.amount ?? 0} min={0} max={30000} step={100} onChange={(v) => upd(i, { amount: v })} />
            )}
            {["emergency_expense", "vehicle_repair"].includes(c.type) && (
              <button className="cursor-pointer text-[0.6875rem] font-semibold text-tangerine" onClick={() => upd(i, c.months_of_spending !== undefined ? { months_of_spending: undefined, amount: 2000 } : { amount: undefined, months_of_spending: 1 })}>
                Express as {c.months_of_spending !== undefined ? "$ amount" : "months of typical spending"}
              </button>
            )}
          </div>
        </div>
      ))}
      {components.length < 12 && (
        <button onClick={() => onChange([...components, SHOCK_DEFAULTS.bill_inflation])} className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line py-2.5 text-xs font-semibold text-ink-2 hover:border-tangerine hover:text-tangerine">
          <Plus className="size-4" /> Combine another shock
        </button>
      )}
    </div>
  );
}

export function FinancialImpactSummary({ sim }: { sim: SimResult }) {
  const comfort = useComfort();
  const rows = [
    { k: "Monthly income", b: sim.baseline.income, s: sim.scenario.income },
    { k: "Monthly spending", b: sim.baseline.spending, s: sim.scenario.spending },
    { k: "Monthly shortfall (gap)", b: Math.max(sim.baseline.gap, 0), s: Math.max(sim.scenario.gap, 0) },
    { k: "Buffer after one-off costs", b: sim.baseline.B, s: sim.scenario.buffer_left },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line p-3 text-center"><p className="text-xs font-semibold text-ink-2">Baseline</p><FinancialRunwayGauge runway={sim.baseline.runway} size={170} /></div>
        <div className="rounded-2xl border border-tangerine/40 bg-peach/40 p-3 text-center"><p className="text-xs font-semibold text-tangerine">With shock</p><FinancialRunwayGauge runway={sim.scenario.runway} size={170} /></div>
      </div>
      {sim.verdict && (
        <div className={cn("rounded-2xl p-3 text-sm font-semibold", sim.verdict.survives ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200")}>
          {sim.verdict.survives ? "✓ " : "▲ "}{calmVerdict(sim.verdict.text, sim.verdict.survives, comfort.calm_mode)}
          {!sim.verdict.survives && sim.verdict.shortfall_over_period > 0 && <span className="block text-xs font-normal">Additional funds needed to last the full period: {money(sim.verdict.shortfall_over_period)}</span>}
        </div>
      )}
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-ink-2"><th className="py-1 font-medium">Metric</th><th className="py-1 text-right font-medium">Baseline</th><th className="py-1 text-right font-medium">Shock</th><th className="py-1 text-right font-medium">Change</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} className="border-t border-line">
              <td className="py-1.5 text-ink-2">{r.k}</td>
              <td className="tabular py-1.5 text-right">{money(r.b)}</td>
              <td className="tabular py-1.5 text-right font-semibold">{money(r.s)}</td>
              <td className="tabular py-1.5 text-right text-xs">{signedMoney(r.s - r.b)}</td>
            </tr>
          ))}
          <tr className="border-t border-line"><td className="py-1.5 text-ink-2">Runway (months)</td><td className="tabular py-1.5 text-right">{sim.baseline.runway.display}</td><td className="tabular py-1.5 text-right font-semibold">{sim.scenario.runway.display}</td><td className="tabular py-1.5 text-right text-xs">{sim.deltas.runway_change > 0 ? "+" : ""}{sim.deltas.runway_change.toFixed(1)}</td></tr>
        </tbody>
      </table>
      <div className="space-y-1">
        {sim.effects.map((e, i) => <p key={i} className="text-xs text-ink-2"><Badge tone="orange">{e.label}</Badge> {e.rule}</p>)}
      </div>
    </div>
  );
}
