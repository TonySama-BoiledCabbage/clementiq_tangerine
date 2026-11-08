"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Trash2 } from "lucide-react";
import { HoldingFormSchema, type Holding, type HoldingForm } from "@clementiq/shared-types";
import { money, pct, signedMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { ChartTooltip, SERIES, axisProps, gridProps } from "@/components/finance/chart-kit";

const KIND_TONE = { user: "violet", connected: "blue", demo: "warn", hypothetical: "neutral" } as const;

export function PortfolioAllocationChart({ allocation }: { allocation: { asset_class: string; value: number; weight: number }[] }) {
  const rows = [...allocation].sort((a, b) => b.weight - a.weight).map((a) => ({ ...a, pct: a.weight * 100 }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, rows.length * 36)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 24 }}>
        <CartesianGrid {...gridProps} horizontal={false} vertical />
        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} {...axisProps} />
        <YAxis type="category" dataKey="asset_class" width={90} {...axisProps} />
        <Tooltip content={<ChartTooltip fmt={(v) => `${v.toFixed(1)}%`} />} cursor={{ fill: "var(--peach)" }} />
        <Bar dataKey="pct" name="Weight" fill={SERIES.invest} radius={[0, 4, 4, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function InvestmentHoldingCard({ h, onDelete }: { h: Holding; onDelete?: () => void }) {
  return (
    <Card className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5"><p className="font-semibold">{h.symbol}</p><Badge tone={KIND_TONE[h.holding_kind]}>{h.holding_kind}</Badge><Badge>{h.asset_class}</Badge></div>
        <p className="truncate text-xs text-ink-2">{h.name} · {h.quantity.toLocaleString()} units</p>
        <p className="text-[0.625rem] text-ink-3">{h.price !== null ? `${money(h.price, true)} · ${h.price_source ?? "manual"}${h.price_as_of ? ` · ${h.price_as_of.slice(0, 16).replace("T", " ")}` : ""}` : "Price unavailable — not valued"}</p>
      </div>
      <div className="flex items-center gap-2 text-right">
        <div><p className="tabular font-semibold">{money(h.value)}</p>
          {h.gain !== null && <p className={`tabular text-[0.6875rem] ${h.gain >= 0 ? "text-good" : "text-bad"}`}>{signedMoney(h.gain)} ({h.gain_pct?.toFixed(1)}%)</p>}
          {h.weight !== null && <p className="text-[0.625rem] text-ink-3">{pct(h.weight, 1)} of portfolio</p>}</div>
        {onDelete && <button onClick={onDelete} aria-label={`Remove ${h.symbol}`} className="cursor-pointer rounded-lg p-1.5 text-ink-3 hover:bg-peach hover:text-bad"><Trash2 className="size-4" /></button>}
      </div>
    </Card>
  );
}

export function AddHoldingForm({ onSubmit, pending }: { onSubmit: (v: HoldingForm) => void; pending: boolean }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<HoldingForm>({
    resolver: zodResolver(HoldingFormSchema), defaultValues: { asset_class: "etf", holding_kind: "hypothetical" },
  });
  return (
    <form onSubmit={handleSubmit((v) => { onSubmit(v); reset({ asset_class: v.asset_class, holding_kind: v.holding_kind }); })} className="grid gap-3 sm:grid-cols-2" noValidate>
      <div><Label htmlFor="sym">Symbol</Label><Input id="sym" placeholder="e.g. XIC.TO, AAPL, SOL" {...register("symbol")} />{errors.symbol && <p className="text-[0.6875rem] text-bad">{errors.symbol.message}</p>}</div>
      <div><Label htmlFor="cls">Asset class</Label><Select id="cls" {...register("asset_class")}>{["stock", "etf", "bond", "mutual_fund", "cash", "crypto"].map((c) => <option key={c} value={c}>{c}</option>)}</Select></div>
      <div><Label htmlFor="qty">Quantity</Label><Input id="qty" type="number" step="any" {...register("quantity", { valueAsNumber: true })} />{errors.quantity && <p className="text-[0.6875rem] text-bad">Enter a positive quantity</p>}</div>
      <div><Label htmlFor="px">Price (optional, if no market data)</Label><Input id="px" type="number" step="any" {...register("price", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })} /></div>
      <div><Label htmlFor="cb">Cost basis total (optional)</Label><Input id="cb" type="number" step="any" {...register("cost_basis", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })} /></div>
      <div><Label htmlFor="kind">This holding is…</Label><Select id="kind" {...register("holding_kind")}><option value="hypothetical">Hypothetical (what-if)</option><option value="user">Real — entered by me</option></Select></div>
      <div className="sm:col-span-2"><Button type="submit" disabled={pending} className="w-full">Add holding</Button></div>
    </form>
  );
}
