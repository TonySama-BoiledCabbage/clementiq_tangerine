"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gavel, Save, FlaskConical } from "lucide-react";
import type { Preset, ShockComponent } from "@clementiq/shared-types";
import { ShockRequestSchema } from "@clementiq/shared-types";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { useAccount, usePresets, useSimulation, useSummary } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { ErrorState, Skeleton, Spinner } from "@/components/ui/misc";
import { NeedAccount, PageHeader } from "@/components/layout/PageKit";
import { FinancialImpactSummary, ShockParameterSlider, ShockScenarioSelector } from "@/components/finance/Shock";
import { ScenarioComparisonChart } from "@/components/finance/Charts";
import { AIInsightCard } from "@/components/ai/AIInsightCard";
import { EngineBadge } from "@/components/finance/EngineBadge";
import { ExportReportButton } from "@/components/reports/ExportReportButton";

function useDebounced<T>(v: T, ms = 150) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export default function SimulatorPage() {
  const accountId = useAccount();
  const params = useSearchParams();
  const presets = usePresets();
  const summary = useSummary(accountId);
  const qc = useQueryClient();
  const [components, setComponents] = useState<ShockComponent[]>([{ type: "job_loss", income_replacement_pct: 55, duration_months: 6 }]);
  const [mode, setMode] = useState<"judging" | "extended">("judging");
  const [cut, setCut] = useState(0);
  const [horizon, setHorizon] = useState(24);
  const [name, setName] = useState("");

  useEffect(() => {
    const pid = params.get("preset");
    const p = presets.data?.presets.find((x) => x.id === pid);
    if (p) { setComponents(p.components); setMode(p.judging ? "judging" : "extended"); }
  }, [params, presets.data]);

  const req = useMemo(() => ({ account_id: accountId ?? 0, components, mode, horizon_months: horizon, discretionary_cut_pct: mode === "extended" ? cut : 0 }), [accountId, components, mode, horizon, cut]);
  const valid = ShockRequestSchema.safeParse(req).success && accountId != null;
  const debounced = useDebounced(req);
  const sim = useSimulation(debounced, valid);

  const saved = useQuery({ queryKey: ["scenarios", accountId], queryFn: () => api<{ items: { id: number; name: string; runway: string; spec: { components: ShockComponent[]; mode: "judging" | "extended" } }[] }>(`/shocks/scenarios?account_id=${accountId}`), enabled: accountId != null });
  const save = useMutation({
    mutationFn: () => api("/shocks/scenarios", { method: "POST", json: { name: name || "My scenario", request: req } }),
    onSuccess: () => { setName(""); qc.invalidateQueries({ queryKey: ["scenarios"] }); },
  });

  const applyPreset = (p: Preset) => { setComponents(p.components); setMode(p.judging ? "judging" : "extended"); };

  return (
    <div className="space-y-6">
      <PageHeader title="Advanced Financial Shock Simulator" subtitle="Apply one or more shocks and watch runway recalculate instantly — no AI call needed" computedAt={sim.data?.computed_at}
        right={<ExportReportButton report="shock" accountId={accountId} shock={valid ? req : null} />} />
      {!accountId && <NeedAccount />}
      {accountId && (
        <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div><CardTitle>Scenario</CardTitle><CardDescription>Combine up to 12 shocks</CardDescription></div>
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <Switch checked={mode === "judging"} onCheckedChange={(v) => setMode(v ? "judging" : "extended")} aria-label="Judging mode" />
                  {mode === "judging" ? <span className="flex items-center gap-1 text-tangerine"><Gavel className="size-3.5" /> Judging Mode</span> : <span className="flex items-center gap-1 text-invest"><FlaskConical className="size-3.5" /> Extended</span>}
                </label>
              </CardHeader>
              <CardContent>
                <p className="mb-3 rounded-xl bg-cream p-2 text-[0.6875rem] text-ink-2">
                  {mode === "judging" ? "Judging Mode uses only the Tangerine README formulas: income × multiplier, spending + % × H, one-off costs from B. No extra assumptions."
                    : "Extended mode adds labelled assumptions: EI weekly maximum, income ending after EI, estimated category allocations and optional spending cuts."}
                </p>
                {presets.data ? (
                  <ShockScenarioSelector components={components} onChange={setComponents} types={presets.data.types} presets={presets.data.presets}
                    onPreset={applyPreset} mode={mode} sValue={summary.data?.judging.S} />
                ) : <Skeleton className="h-64" />}
                {mode === "extended" && (
                  <div className="mt-4 space-y-3 border-t border-line pt-4">
                    <ShockParameterSlider label="Behavioural response: trim discretionary" unit="%" value={cut} min={0} max={60} onChange={setCut} />
                    <ShockParameterSlider label="Projection horizon" unit="months" value={horizon} min={6} max={60} onChange={setHorizon} />
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><div><CardTitle>Saved scenarios</CardTitle><CardDescription>Compare alternatives</CardDescription></div></CardHeader>
              <CardContent className="space-y-2">
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
                  <Input placeholder="Scenario name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
                  <Button type="submit" variant="secondary" disabled={!valid || save.isPending}><Save /> Save</Button>
                </form>
                {save.isError && <p className="text-xs text-bad">{(save.error as Error).message}</p>}
                <ul className="divide-y divide-line">{saved.data?.items.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2 text-xs">
                    <button className="cursor-pointer text-left font-semibold hover:text-tangerine" onClick={() => { setComponents(s.spec.components); setMode(s.spec.mode); }}>{s.name}</button>
                    <span className="flex items-center gap-2"><span className="text-ink-2">runway {s.runway}</span>
                      <button aria-label={`Delete ${s.name}`} className="cursor-pointer text-ink-3 hover:text-bad" onClick={async () => { await api(`/shocks/scenarios/${s.id}`, { method: "DELETE" }); qc.invalidateQueries({ queryKey: ["scenarios"] }); }}>✕</button></span>
                  </li>
                ))}</ul>
                {!saved.data?.items.length && <p className="text-xs text-ink-3">No saved scenarios yet.</p>}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {sim.error && <ErrorState error={sim.error} />}
            {!sim.data && !sim.error && <Skeleton className="h-96" />}
            {sim.data && (
              <>
                <Card>
                  <CardHeader>
                    <div><CardTitle>Impact</CardTitle><CardDescription>Account #{sim.data.account_id} · input hash {sim.data.input_hash.slice(0, 10)}…</CardDescription></div>
                    <div className="flex items-center gap-2">{sim.isFetching && <Spinner />}<EngineBadge engine={sim.data.engine} /><Badge tone={sim.data.mode === "judging" ? "orange" : "violet"}>{sim.data.mode}</Badge></div>
                  </CardHeader>
                  <CardContent><FinancialImpactSummary sim={sim.data} /></CardContent>
                </Card>
                <Card>
                  <CardHeader><div><CardTitle>Buffer over time</CardTitle><CardDescription>{sim.data.depletion_month ? `Buffer runs out in month ${sim.data.depletion_month}` : "Buffer lasts the whole projection"}</CardDescription></div></CardHeader>
                  <CardContent><ScenarioComparisonChart sim={sim.data} /></CardContent>
                </Card>
                {sim.data.behavioural_cut && (
                  <Card><CardContent className="pt-5 text-sm">With a {cut}% discretionary trim (−{money(sim.data.behavioural_cut.cut_amount)}/mo), runway becomes <b>{sim.data.behavioural_cut.runway.display}</b> months.</CardContent></Card>
                )}
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader><div><CardTitle>Assumptions & warnings</CardTitle></div></CardHeader>
                    <CardContent className="space-y-1.5 text-xs text-ink-2">
                      {sim.data.assumptions.map((a) => <p key={a}>• {a}</p>)}
                      {sim.data.warnings.map((w) => <p key={w} className="text-warn">⚠ {w}</p>)}
                      <p className="pt-2"><Link href={`/recovery?tab=backup`} className="font-semibold text-tangerine">Build a Backup Plan for this shock →</Link></p>
                    </CardContent>
                  </Card>
                  <AIInsightCard endpoint="/ai/explain-scenario" body={{ request: debounced }} kind="scenario" key={sim.data.input_hash} />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
