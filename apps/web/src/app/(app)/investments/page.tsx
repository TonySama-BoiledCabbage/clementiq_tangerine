"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Database, RefreshCw, Sparkles } from "lucide-react";
import type { Holding, HoldingForm } from "@clementiq/shared-types";
import { api } from "@/lib/api";
import { money, pct, signedMoney, timeAgo } from "@/lib/format";
import { useAccount, useSummary } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { EmptyState, ErrorState, Skeleton, Spinner } from "@/components/ui/misc";
import { PageHeader } from "@/components/layout/PageKit";
import { AddHoldingForm, InvestmentHoldingCard, PortfolioAllocationChart } from "@/components/invest/Investments";
import { ShockParameterSlider } from "@/components/finance/Shock";
import { ChartTooltip, SERIES, axisProps } from "@/components/finance/chart-kit";
import { ExportReportButton } from "@/components/reports/ExportReportButton";

interface Portfolio {
  holdings: Holding[]; total_value: number; total_gain: number | null; allocation: { asset_class: string; value: number; weight: number }[];
  concentration: { hhi: number; effective_holdings: number | null; top_holding: string | null; top_weight: number | null; flag: string };
  missing_prices: string[]; holding_kinds: string[]; price_history: Record<string, { t: string; price: number }[]>;
  related_events: { id: number; headline: string; topic: string; source: string; published_at: string | null; channels: { asset: string; channel: string }[] }[];
  scenarios: Record<string, string>; notice: string;
}
interface Stress { scenario: string; initial_value: number; modeled_value: number; change: number; change_pct: number | null; rows: { symbol: string; initial: number; shock_pct: number; modeled: number; change: number }[]; label: string;
  broader_position: { liquid_buffer: number; investments_after_shock: number; note: string; runway_liquid_only?: { display: string }; runway_with_investments?: { display: string } } | null }

export default function InvestmentsPage() {
  const accountId = useAccount();
  const summary = useSummary(accountId);
  const qc = useQueryClient();
  const pf = useQuery({ queryKey: ["portfolio"], queryFn: () => api<Portfolio>("/investments/portfolio") });
  const inval = () => qc.invalidateQueries({ queryKey: ["portfolio"] });
  const add = useMutation({ mutationFn: (v: HoldingForm) => api("/investments/holdings", { method: "POST", json: v }), onSuccess: inval });
  const del = useMutation({ mutationFn: (id: number) => api(`/investments/holdings/${id}`, { method: "DELETE" }), onSuccess: inval });
  const demo = useMutation({ mutationFn: () => api("/investments/demo", { method: "POST" }), onSuccess: inval });
  const prices = useMutation({ mutationFn: () => api("/investments/refresh-prices", { method: "POST" }), onSuccess: inval });
  const [scenario, setScenario] = useState("bear_market");
  const [custom, setCustom] = useState(false);
  const [shocks, setShocks] = useState<Record<string, number>>({ stock: -20, etf: -18, bond: 2, mutual_fund: -15, crypto: -40, cash: 0 });
  const [sell, setSell] = useState(false);
  const s = summary.data;
  const stressBody = { scenario_id: custom ? null : scenario, custom_shocks: custom ? shocks : null, sell_to_cover: sell,
                       account_buffer: s?.judging.B ?? null, account_monthly_gap: s ? Math.max(s.judging.S - 0.55 * s.judging.I, 0) : null };
  const stress = useQuery({ queryKey: ["stress", stressBody, pf.data?.total_value], queryFn: () => api<Stress>("/investments/scenario", { method: "POST", json: stressBody }), enabled: !!pf.data?.holdings.length });
  const p = pf.data;
  const firstSeries = p && Object.entries(p.price_history).find(([, v]) => v.length > 1);

  return (
    <div className="space-y-6">
      <PageHeader title="Investments & Stocks" subtitle="Portfolio exposure and stress tests — kept separate from your emergency buffer"
        right={<><Button variant="outline" onClick={() => prices.mutate()} disabled={prices.isPending}>{prices.isPending ? <Spinner /> : <RefreshCw />} Refresh prices</Button>
          <Button variant="secondary" onClick={() => demo.mutate()} disabled={demo.isPending}><Database /> Load demo portfolio</Button>
          <ExportReportButton report="investments" /></>} />
      <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">{p?.notice ?? "The Tangerine dataset contains no investment holdings."} No trades are ever executed; scenarios are hypothetical, not predictions.</p>
      {pf.error && <ErrorState error={pf.error} />}
      {pf.isLoading && <Skeleton className="h-64" />}
      {p && (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="p-4"><p className="text-xs text-ink-2">Portfolio value</p><p className="tabular text-2xl font-bold">{money(p.total_value)}</p><div className="mt-1 flex flex-wrap gap-1">{p.holding_kinds.map((k) => <Badge key={k} tone={k === "demo" ? "warn" : "violet"}>{k}</Badge>)}</div></Card>
              <Card className="p-4"><p className="text-xs text-ink-2">Gain / loss</p><p className={`tabular text-2xl font-bold ${(p.total_gain ?? 0) >= 0 ? "text-good" : "text-bad"}`}>{p.total_gain !== null ? signedMoney(p.total_gain) : "—"}</p><p className="text-[0.6875rem] text-ink-3">where cost basis is known</p></Card>
              <Card className="p-4"><p className="text-xs text-ink-2">Concentration</p><p className="text-2xl font-bold capitalize">{p.concentration.flag}</p><p className="text-[0.6875rem] text-ink-3">Top {p.concentration.top_holding ?? "—"} {pct(p.concentration.top_weight)} · HHI {p.concentration.hhi.toFixed(2)}</p></Card>
            </div>
            {!p.holdings.length ? <EmptyState title="No holdings yet">Add a holding on the right, or load the clearly labelled demo portfolio.</EmptyState> : <>
              <Card><CardHeader><div><CardTitle>Asset allocation</CardTitle></div></CardHeader><CardContent><PortfolioAllocationChart allocation={p.allocation} />
                {p.missing_prices.length > 0 && <p className="text-[0.6875rem] text-warn">No price for {p.missing_prices.join(", ")} — excluded from value (never estimated).</p>}</CardContent></Card>
              {firstSeries && <Card><CardHeader><div><CardTitle>Price history · {firstSeries[0]}</CardTitle><CardDescription>Stored market observations ({firstSeries[1].length})</CardDescription></div></CardHeader>
                <CardContent><ResponsiveContainer width="100%" height={180}><LineChart data={firstSeries[1]}><XAxis dataKey="t" tickFormatter={(t) => t.slice(5, 10)} {...axisProps} /><YAxis domain={["auto", "auto"]} {...axisProps} width={60} /><Tooltip content={<ChartTooltip fmt={(v) => money(v, true)} labelFmt={(l) => l.slice(0, 16)} />} /><Line dataKey="price" name="Price" stroke={SERIES.invest} dot={false} strokeWidth={2} /></LineChart></ResponsiveContainer></CardContent></Card>}
              <div className="space-y-2">{p.holdings.map((h) => <InvestmentHoldingCard key={h.id} h={h} onDelete={() => h.id && del.mutate(h.id)} />)}</div>
            </>}
          </div>
          <div className="space-y-4">
            <Card><CardHeader><div><CardTitle>Add a holding</CardTitle><CardDescription>Manual or hypothetical</CardDescription></div></CardHeader><CardContent><AddHoldingForm onSubmit={(v) => add.mutate(v)} pending={add.isPending} />{add.error && <p className="mt-2 text-xs text-bad">{(add.error as Error).message}</p>}</CardContent></Card>
            {p.holdings.length > 0 && (
              <Card><CardHeader><div><CardTitle>Portfolio stress test</CardTitle><CardDescription>Hypothetical price shocks</CardDescription></div></CardHeader>
                <CardContent className="space-y-3">
                  <label className="flex items-center gap-2 text-xs font-semibold"><Switch checked={custom} onCheckedChange={setCustom} /> Custom shocks</label>
                  {!custom ? <Select value={scenario} onChange={(e) => setScenario(e.target.value)}>{Object.entries(p.scenarios).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                    : Object.keys(shocks).map((k) => <ShockParameterSlider key={k} label={k} unit="%" value={shocks[k]} min={-90} max={50} onChange={(v) => setShocks({ ...shocks, [k]: v })} />)}
                  <label className="flex items-center gap-2 text-xs"><Switch checked={sell} onCheckedChange={setSell} /> Model selling investments to cover an EI-55% shortfall</label>
                  {stress.data && <>
                    <div className="rounded-xl bg-cream p-3"><p className="text-xs text-ink-2">{stress.data.scenario}</p><p className="tabular text-xl font-bold">{money(stress.data.initial_value)} → {money(stress.data.modeled_value)}</p><p className={`tabular text-sm ${stress.data.change >= 0 ? "text-good" : "text-bad"}`}>{signedMoney(stress.data.change)} ({stress.data.change_pct?.toFixed(1)}%)</p></div>
                    <ul className="space-y-0.5 text-xs">{stress.data.rows.map((r) => <li key={r.symbol} className="flex justify-between"><span>{r.symbol} <span className="text-ink-3">{r.shock_pct}%</span></span><span className="tabular">{signedMoney(r.change)}</span></li>)}</ul>
                    {stress.data.broader_position && <div className="rounded-xl border border-line p-2.5 text-xs">
                      <p>Liquid buffer {money(stress.data.broader_position.liquid_buffer)} · EI-55% runway <b>{stress.data.broader_position.runway_liquid_only?.display ?? "no shortfall"}</b></p>
                      {stress.data.broader_position.runway_with_investments && <p>If investments were sold: <b>{stress.data.broader_position.runway_with_investments.display}</b> months</p>}
                      <p className="text-ink-3">{stress.data.broader_position.note}</p></div>}
                    <p className="text-[0.625rem] text-ink-3">{stress.data.label}</p>
                  </>}
                </CardContent></Card>
            )}
            <Card><CardHeader><div><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-invest" /> Related global developments</CardTitle><CardDescription>Possible transmission channels — not predictions</CardDescription></div></CardHeader>
              <CardContent>{p.related_events.length ? <ul className="space-y-2">{p.related_events.map((e) => (
                <li key={e.id} className="text-xs"><p className="font-semibold">{e.headline}</p><p className="text-ink-3">{e.source} · {timeAgo(e.published_at)}</p>{e.channels.map((c) => <p key={c.channel} className="text-ink-2">• {c.asset}: {c.channel}</p>)}</li>
              ))}</ul> : <p className="text-xs text-ink-2">No retrieved developments match your holdings yet.</p>}</CardContent></Card>
          </div>
        </div>
      )}
    </div>
  );
}
