"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, CircleAlert, XCircle } from "lucide-react";
import type { Judging, Preset, Runway, ShockComponent, SimResult } from "@clementiq/shared-types";
import { api } from "@/lib/api";
import { money, signedMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAccount, usePresets, useSummary } from "@/lib/hooks";
import { useSession } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, Skeleton, Spinner } from "@/components/ui/misc";
import { CustomerSelector } from "@/components/layout/CustomerSelector";
import { ShockScenarioSelector } from "@/components/finance/Shock";
import { AIInsightCard } from "@/components/ai/AIInsightCard";

interface Verify { inputs: Record<string, number>; rows: { twist: string; reference: string; engine: string; match: boolean }[]; all_match: boolean; formulas: Record<string, string> }
interface GoalPlan { current_buffer: number; target: number; gap: number; progress_pct: number; monthly_surplus: number; recommended_monthly_contribution: number; months_to_goal: number | null; status: string }
interface BackupPlan { monthly_shortfall: number; immediate_actions: { action: string; why?: string }[]; best_tier: { discretionary_cut_pct: number; runway: Runway } | null; runway_improvement_months: number }

/** The three README twist cards, always one click away. */
const FEATURED = ["ei55_6m", "furnace", "ei55_bills15"] as const;
const FEATURED_LABEL: Record<string, { title: string; sub: string }> = {
  ei55_6m: { title: "Laid off", sub: "EI pays 55% for 6 months" },
  furnace: { title: "Furnace dies", sub: "Repair = 1 month of spending" },
  ei55_bills15: { title: "Job loss + bills up", sub: "EI 55% and household bills +15%" },
};
const DEFAULT_SHOCK: ShockComponent[] = [{ type: "job_loss", income_replacement_pct: 55, duration_months: 6 }];

type Tone = "good" | "warn" | "bad";
function runwayTone(r: Runway, judging?: Judging): Tone {
  if (r.status === "depleted") return "bad";
  if (r.no_shortfall) return judging && judging.S === 0 ? "warn" : "good";
  return r.months < 3 ? "bad" : r.months < 6 ? "warn" : "good";
}
const TONE_TEXT: Record<Tone, string> = { good: "text-good", warn: "text-warn", bad: "text-bad" };
const TONE_BOX: Record<Tone, string> = { good: "bg-good-bg text-good", warn: "bg-warn-bg text-warn", bad: "bg-bad-bg text-bad" };
const bigRunway = (r: Runway) => (r.no_shortfall ? "120+" : r.display);
const runwayCaption = (r: Runway) => (r.no_shortfall ? "no monthly shortfall" : r.status === "depleted" ? "buffer already used up" : "months of runway");

/** Data-quality cases a judge may pick; flagged up front so "120+" or "0" is never misread. */
function edgeCases(j: Judging): { tone: Tone; text: string }[] {
  const out: { tone: Tone; text: string }[] = [];
  if (j.S === 0) out.push({ tone: "warn", text: "No typical monthly spending (S = 0): the account is mostly inactive, so “no shortfall” reflects inactivity, not safety." });
  if (j.I === 0) out.push({ tone: "warn", text: "No typical monthly income (I = 0): income shocks change nothing; only spending and one-off shocks move the runway." });
  if (j.B <= 0) out.push({ tone: "bad", text: "Buffer is zero or negative (B ≤ 0): runway is 0 under any shock. The plan starts from rebuilding a buffer." });
  return out;
}

function Step({ n, title, desc, right, children, className }: { n: number; title: string; desc?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-[2px] bg-ink text-[11px] font-semibold text-white">{n}</span>
          <div><CardTitle>{title}</CardTitle>{desc && <CardDescription>{desc}</CardDescription>}</div>
        </div>
        {right}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Disclosure({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-md border border-line bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {title}<ChevronDown className="size-4 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-line px-5 py-4">{children}</div>
    </details>
  );
}

/** Live judging flow on one screen: account → customer → twist card → new numbers → Goal Plan → Backup Plan. */
export default function StressTestPage() {
  const accountId = useAccount();
  const recent = useSession((s) => s.recentAccounts);
  const setAccount = useSession((s) => s.setAccount);
  const router = useRouter();
  const openAccount = (id: number) => { setAccount(id); router.replace(`/judge?account=${id}`); };
  const s = useSummary(accountId);
  const presets = usePresets();
  const [components, setComponents] = useState<ShockComponent[]>(DEFAULT_SHOCK);
  const shock = useMemo(() => ({ account_id: accountId, components, mode: "judging" }), [accountId, components]);
  const sim = useQuery({ queryKey: ["judge-sim", shock], queryFn: () => api<SimResult>("/shocks/simulate", { method: "POST", json: shock }), enabled: !!accountId, placeholderData: (prev) => prev });
  const goal = useQuery({ queryKey: ["judge-goal", accountId], queryFn: () => api<GoalPlan>("/recovery/goal-plan", { method: "POST", json: { account_id: accountId } }), enabled: !!accountId });
  const backup = useQuery({ queryKey: ["judge-backup", shock], queryFn: () => api<BackupPlan>("/recovery/backup-plan", { method: "POST", json: { account_id: accountId, shock } }), enabled: !!accountId, placeholderData: (prev) => prev });
  const verify = useQuery({ queryKey: ["verify", accountId], queryFn: () => api<Verify>(`/judge/verify/${accountId}`), enabled: !!accountId });

  const featured = (presets.data?.presets ?? []).filter((p) => (FEATURED as readonly string[]).includes(p.id));
  const others = (presets.data?.presets ?? []).filter((p) => p.judging && !(FEATURED as readonly string[]).includes(p.id));
  const activeId = featured.find((p) => JSON.stringify(p.components) === JSON.stringify(components))?.id;
  const j = s.data?.judging;

  return (
    <div className="space-y-6">
      {/* 0 · Account */}
      <section className="flex flex-col gap-4 rounded-md border border-line bg-surface p-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[32px] font-semibold leading-[1.2] tracking-[0.02em]">Stress Test</h1>
          <p className="mt-1 text-sm text-ink-2">Enter any account, pick a twist card, read the new runway and the plan.</p>
        </div>
        <div className="flex flex-col gap-2 lg:items-end">
          <CustomerSelector autoFocus />
          {recent.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
              Recent
              {recent.map((id) => (
                <button key={id} onClick={() => openAccount(id)} aria-current={id === accountId ? "true" : undefined}
                  className={cn("min-h-8 cursor-pointer rounded-full border px-3 font-medium tabular", id === accountId ? "border-ink bg-ink text-white" : "border-line-strong text-ink hover:bg-peach")}>
                  {id}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {!accountId && (
        <div className="rounded-md border border-dashed border-line-strong bg-surface p-10 text-center">
          <p className="text-lg font-semibold">Choose a customer to begin</p>
          <p className="mt-1 text-sm text-ink-2">Type an <code>account_id</code> above and press Enter, or use shuffle for a random one.</p>
        </div>
      )}
      {s.error && <ErrorState error={s.error} />}

      {accountId && (
        <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
          {/* LEFT: inputs */}
          <div className="space-y-6">
            <Step n={1} title="Know the customer" desc={`Account #${accountId} · README definitions`}>
              {j ? (
                <div className="space-y-3">
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    {(["I", "S", "F", "H", "B", "P"] as const).map((k) => (
                      <div key={k} className="rounded-md bg-cream p-2.5">
                        <dt className="text-[11px] text-ink-2">{({ I: "Income", S: "Spending", F: "Fixed costs", H: "Household bills", B: "Buffer", P: "Loan payment" })[k]} <span className="text-ink-3">({k})</span></dt>
                        <dd className="tabular text-base font-semibold">{money(j[k], true)}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex items-baseline justify-between rounded-md border border-line p-3">
                    <span className="text-xs text-ink-2">Runway today</span>
                    <span className={cn("tabular text-lg font-semibold", TONE_TEXT[runwayTone(j.runway, j)])}>{bigRunway(j.runway)} <span className="text-xs font-normal text-ink-2">{runwayCaption(j.runway)}</span></span>
                  </div>
                  {edgeCases(j).map((e) => (
                    <p key={e.text} role="note" className={cn("flex gap-2 rounded-md p-2.5 text-xs leading-relaxed", TONE_BOX[e.tone])}>
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{e.text}
                    </p>
                  ))}
                </div>
              ) : <Skeleton className="h-48" />}
            </Step>

            <Step n={2} title="Twist card" desc="Judging Mode · README formulas only">
              <div className="space-y-4">
                <div className="grid gap-2" role="group" aria-label="README twist cards">
                  {featured.map((p: Preset) => (
                    <button key={p.id} onClick={() => setComponents(p.components)} aria-pressed={activeId === p.id}
                      className={cn("flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-md border px-4 text-left transition-colors",
                        activeId === p.id ? "border-ink bg-ink text-white" : "border-line-strong bg-surface hover:bg-peach")}>
                      <span><span className="block text-sm font-semibold">{FEATURED_LABEL[p.id]?.title ?? p.name}</span>
                        <span className={cn("block text-xs", activeId === p.id ? "text-white/80" : "text-ink-2")}>{FEATURED_LABEL[p.id]?.sub}</span></span>
                      {activeId === p.id ? <CheckCircle2 className="size-5 shrink-0" aria-hidden /> : <ArrowRight className="size-4 shrink-0 text-ink-3" aria-hidden />}
                    </button>
                  ))}
                  {!presets.data && <Skeleton className="h-44" />}
                </div>
                {presets.data && (
                  <div className="border-t border-line pt-4">
                    <p className="mb-3 text-xs font-semibold text-ink-2">Adjust the size, or combine shocks</p>
                    <ShockScenarioSelector components={components} onChange={setComponents} types={presets.data.types} presets={others}
                      onPreset={(p) => setComponents(p.components)} mode="judging" sValue={j?.S} presetsLabel="More twist cards" />
                  </div>
                )}
              </div>
            </Step>
          </div>

          {/* RIGHT: outputs */}
          <div className="space-y-6">
            <Step n={3} title="New numbers" desc="Runway = (B − one-off costs) ÷ monthly shortfall"
              right={<div className="flex items-center gap-2">{sim.isFetching && <Spinner />}{verify.data && (verify.data.all_match
                ? <Badge tone="good"><CheckCircle2 aria-hidden /> matches README check</Badge> : <Badge tone="bad"><XCircle aria-hidden /> check mismatch</Badge>)}</div>}>
              {sim.error && <ErrorState error={sim.error} />}
              {!sim.data && !sim.error && <Skeleton className="h-64" />}
              {sim.data && (() => {
                const before = sim.data.baseline.runway, after = sim.data.scenario.runway;
                const tone = runwayTone(after, j);
                return (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">Before</p>
                        <p className="tabular text-[32px] font-semibold leading-tight text-ink-2">{bigRunway(before)}</p>
                        <p className="text-xs text-ink-3">{runwayCaption(before)}</p>
                      </div>
                      <ArrowRight className="mb-6 size-6 text-ink-3" aria-hidden />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">With this twist</p>
                        <p className={cn("display-num", TONE_TEXT[tone])}>{bigRunway(after)}</p>
                        <p className="text-xs text-ink-2">{runwayCaption(after)}</p>
                      </div>
                    </div>
                    {sim.data.verdict && (
                      <p className={cn("flex items-start gap-2 rounded-md p-3 text-sm font-semibold", sim.data.verdict.survives ? TONE_BOX.good : TONE_BOX.bad)}>
                        {sim.data.verdict.survives ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
                        <span>{after.no_shortfall
                          ? (j && j.S === 0 ? "No shortfall — but only because this account shows almost no spending (see note in step 1)." : "Yes — income still covers spending, so the buffer is never drawn down.")
                          : sim.data.verdict.text}
                          {!sim.data.verdict.survives && sim.data.verdict.shortfall_over_period > 0 && <span className="block text-xs font-normal">Extra money needed to last the full period: {money(sim.data.verdict.shortfall_over_period)}</span>}</span>
                      </p>
                    )}
                    <table className="w-full text-sm">
                      <caption className="sr-only">Monthly figures before and after the twist</caption>
                      <thead><tr className="text-left text-xs text-ink-2"><th className="py-1.5 font-medium">Per month</th><th className="py-1.5 text-right font-medium">Before</th><th className="py-1.5 text-right font-medium">After</th><th className="py-1.5 text-right font-medium">Change</th></tr></thead>
                      <tbody>
                        {[
                          { k: "Income", b: sim.data.baseline.income, a: sim.data.scenario.income },
                          { k: "Spending", b: sim.data.baseline.spending, a: sim.data.scenario.spending },
                          { k: "Shortfall (gap)", b: Math.max(sim.data.baseline.gap, 0), a: Math.max(sim.data.scenario.gap, 0) },
                          { k: "Buffer after one-off costs", b: sim.data.baseline.B, a: sim.data.scenario.buffer_left },
                        ].map((r) => (
                          <tr key={r.k} className="border-t border-line">
                            <td className="py-2 text-ink-2">{r.k}</td>
                            <td className="tabular py-2 text-right">{money(r.b)}</td>
                            <td className="tabular py-2 text-right font-semibold">{money(r.a)}</td>
                            <td className="tabular py-2 text-right text-xs text-ink-2">{signedMoney(r.a - r.b)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <ul className="flex flex-wrap gap-1.5">
                      {sim.data.effects.map((e, i) => <li key={i}><Badge tone="neutral">{e.label}: {e.rule}</Badge></li>)}
                    </ul>
                  </div>
                );
              })()}
            </Step>

            <div className="grid gap-6 lg:grid-cols-2">
              <Step n={4} title="Goal Plan" desc="For the customer: build a 3-month safety net">
                {goal.data && goal.data.target <= 0 ? (
                  <p className="text-sm leading-relaxed">This account shows no typical monthly spending, so a “3 months of spending” safety net can&apos;t be sized from its data. Confirm where the customer&apos;s day-to-day spending happens before setting a target.</p>
                ) : goal.data ? (
                  <div className="space-y-3 text-sm leading-relaxed">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-cream" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(goal.data.progress_pct, 100))} aria-label="Safety net progress">
                      <div className="h-full bg-ink" style={{ width: `${Math.min(Math.max(goal.data.progress_pct, 0), 100)}%` }} />
                    </div>
                    <p>You have <b>{money(goal.data.current_buffer)}</b> set aside — <span className="marker font-semibold">{Math.round(Math.min(Math.max(goal.data.progress_pct, 0), 100))}%</span> of a {money(goal.data.target)} safety net (3 months of your typical spending).</p>
                    {goal.data.months_to_goal === 0 ? (
                      <p>You&apos;ve already reached it. Keep it topped up and leave it in a separate savings account.</p>
                    ) : goal.data.months_to_goal === null ? (
                      <p>Right now your spending uses all of your income, so there is nothing left to save. Start with the steps in the Backup Plan to free up cash first.</p>
                    ) : (
                      <p>Move <span className="marker font-semibold">{money(goal.data.recommended_monthly_contribution)} a month</span> into savings automatically and you&apos;ll get there in about <b>{goal.data.months_to_goal} months</b>.</p>
                    )}
                  </div>
                ) : goal.error ? <ErrorState error={goal.error} /> : <Skeleton className="h-28" />}
              </Step>

              <Step n={5} title="Backup Plan" desc="For the customer: if this twist happens">
                {backup.data ? (
                  <div className="space-y-3 text-sm leading-relaxed">
                    {backup.data.monthly_shortfall > 0
                      ? <p>You&apos;d be short about <span className="marker font-semibold">{money(backup.data.monthly_shortfall)} a month</span>. Do these first:</p>
                      : <p>Your income would still cover your spending. Keep these in mind:</p>}
                    <ol className="list-decimal space-y-1.5 pl-5">
                      {backup.data.immediate_actions.slice(0, 3).map((a) => <li key={a.action}>{a.action}</li>)}
                    </ol>
                    {backup.data.best_tier && backup.data.runway_improvement_months > 0 && (
                      <p className="rounded-md bg-cream p-2.5 text-xs">{backup.data.best_tier.runway.no_shortfall
                        ? <>Trimming flexible spending by {backup.data.best_tier.discretionary_cut_pct}% would close the monthly gap completely.</>
                        : <>Trimming flexible spending by {backup.data.best_tier.discretionary_cut_pct}% stretches your runway to <b>{bigRunway(backup.data.best_tier.runway)} months</b> (+{backup.data.runway_improvement_months.toFixed(1)}).</>}</p>
                    )}
                  </div>
                ) : backup.error ? <ErrorState error={backup.error} /> : <Skeleton className="h-28" />}
              </Step>
            </div>

            <Disclosure title="How these numbers are calculated">
              <table className="w-full text-xs">
                <caption className="sr-only">README twist cards recomputed independently</caption>
                <thead><tr className="text-left text-ink-2"><th className="py-1 font-medium">README twist</th><th className="text-right font-medium">Reference</th><th className="text-right font-medium">Engine</th><th className="text-right font-medium">Match</th></tr></thead>
                <tbody>{verify.data?.rows.map((r) => (
                  <tr key={r.twist} className="border-t border-line"><td className="py-1.5">{r.twist}</td><td className="tabular text-right">{r.reference}</td><td className="tabular text-right font-semibold">{r.engine}</td>
                    <td className="text-right">{r.match ? <span className="text-good">Yes</span> : <span className="text-bad">No</span>}</td></tr>
                ))}</tbody>
              </table>
              {verify.data && (
                <dl className="mt-3 grid gap-1 text-[11px] text-ink-2 sm:grid-cols-2">
                  {Object.entries(verify.data.formulas).map(([k, v]) => <div key={k}><dt className="inline font-semibold text-ink">{k}</dt> <dd className="inline">= {v}</dd></div>)}
                </dl>
              )}
            </Disclosure>
            <Disclosure title="Explain in plain language">
              <AIInsightCard title="Explanation" endpoint="/ai/explain-scenario" kind="scenario" key={JSON.stringify(shock)} body={{ request: shock }} />
            </Disclosure>
          </div>
        </div>
      )}
    </div>
  );
}
