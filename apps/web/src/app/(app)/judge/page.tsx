"use client";
/**
 * Judge Demo — a strictly sequential walkthrough: 1 Customer → 2 Twist → 3 Results → 4 Recovery → Final.
 * One column, DOM order = visual order = keyboard/screen-reader order (no CSS reordering).
 * Access requires the server-verified judge/admin role; the API enforces the same rule.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Gavel, Lock, RotateCcw, Search, Shuffle, XCircle } from "lucide-react";
import type { Preset, ShockComponent, SimResult } from "@clementiq/shared-types";
import { api } from "@/lib/api";
import { money, signedMoney } from "@/lib/format";
import { useAccount, useMe, usePresets, useSummary } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/misc";
import { AccountSearch } from "@/components/layout/CustomerSelector";
import { FinancialImpactSummary, ShockScenarioSelector } from "@/components/finance/Shock";
import { ScenarioComparisonChart } from "@/components/finance/Charts";
import { AIInsightCard } from "@/components/ai/AIInsightCard";
import { ExportReportButton } from "@/components/reports/ExportReportButton";
import { ReadAloud } from "@/components/ui/comfort";

const STEPS = [
  { id: "step-1", n: "1", label: "Customer" },
  { id: "step-2", n: "2", label: "Twist" },
  { id: "step-3", n: "3", label: "Results" },
  { id: "step-4", n: "4", label: "Recovery" },
  { id: "final", n: "★", label: "Final Summary" },
] as const;

const DEFAULT_TWIST: ShockComponent[] = [{ type: "job_loss", income_replacement_pct: 55, duration_months: 6 }];

interface Verify { rows: { twist: string; reference: string; engine: string; match: boolean }[]; all_match: boolean; formulas: Record<string, string> }
interface Goal { target: number; gap: number; current_buffer: number; recommended_monthly_contribution: number; months_to_goal: number | null; status: string }
interface Backup {
  monthly_shortfall: number; immediate_actions: { action: string; why: string }[];
  priority_expenses: { item: string; monthly: number; priority: string }[];
  best_tier: { discretionary_cut_pct: number; runway: { display: string; no_shortfall: boolean } }; runway_improvement_months: number;
  alternatives: { name?: string; spending_after: number; gap: number; runway: { display: string } }[];
  discretionary_cut_pct_to_close_gap: number | null;
}

function StepCard({ id, n, title, subtitle, children, tone = "default" }: { id: string; n: string; title: string; subtitle?: string; children: React.ReactNode; tone?: "default" | "final" }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} tabIndex={-1}
      className={cn("scroll-mt-40 rounded-3xl border-2 bg-surface p-5 shadow-card focus:outline-none sm:p-7",
        tone === "final" ? "border-tangerine bg-gradient-to-br from-[var(--peach)] to-[var(--surface)]" : "border-line")}>
      <header className="mb-5 flex items-start gap-4">
        <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl text-xl font-extrabold", tone === "final" ? "bg-tangerine text-white" : "bg-peach text-tangerine")} aria-hidden>{n}</span>
        <div>
          <h2 id={`${id}-title`} className="text-xl font-bold text-ink"><span className="sr-only">{tone === "final" ? "Final" : `Step ${n}:`} </span>{title}</h2>
          {subtitle && <p className="text-sm text-ink-2">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-cream p-3">
      <dt className="text-xs font-medium text-ink-2">{label}</dt>
      <dd className="tabular text-lg font-bold text-ink">{value}</dd>
      {sub && <dd className="text-[0.6875rem] text-ink-3">{sub}</dd>}
    </div>
  );
}

function sameComponents(a: ShockComponent[], b: ShockComponent[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function useActiveStep() {
  const [active, setActive] = useState<string>("step-1");
  useEffect(() => {
    const els = STEPS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const obs = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: "-35% 0px -55% 0px" });
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, []);
  return active;
}

function goTo(id: string, focusSelector?: string) {
  const el = document.getElementById(id);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => {
    const target = focusSelector ? el?.querySelector<HTMLElement>(focusSelector) : el;
    target?.focus({ preventScroll: true });
  }, 400);
}

export default function JudgePage() {
  const me = useMe();
  if (me.isLoading) return <Skeleton className="h-96" />;
  if (!me.data?.entitlements.judge_demo) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border-2 border-line bg-surface p-8 text-center shadow-card" role="alert">
        <Lock className="mx-auto mb-3 size-8 text-ink-3" />
        <h1 className="text-xl font-bold text-ink">Judge Demo is only available to judges</h1>
        <p className="mt-2 text-sm text-ink-2">Your account doesn’t have access to this tool. Sign in with judge access to use the demonstration walkthrough.</p>
        <Button asChild className="mt-5"><Link href="/">Back to Home</Link></Button>
      </div>
    );
  }
  return <JudgeWalkthrough />;
}

function JudgeWalkthrough() {
  const accountId = useAccount();
  const s = useSummary(accountId);
  const presets = usePresets();
  const [components, setComponents] = useState<ShockComponent[]>(DEFAULT_TWIST);
  const active = useActiveStep();
  const shock = useMemo(() => ({ account_id: accountId, components, mode: "judging" as const }), [accountId, components]);
  const ready = accountId != null;
  const sim = useQuery({ queryKey: ["judge-sim", shock], queryFn: () => api<SimResult>("/shocks/simulate", { method: "POST", json: shock }), enabled: ready });
  const goal = useQuery({ queryKey: ["judge-goal", accountId], queryFn: () => api<Goal>("/recovery/goal-plan", { method: "POST", json: { account_id: accountId } }), enabled: ready });
  const backup = useQuery({ queryKey: ["judge-backup", shock], queryFn: () => api<Backup>("/recovery/backup-plan", { method: "POST", json: { account_id: accountId, shock } }), enabled: ready });
  const verify = useQuery({ queryKey: ["verify", accountId], queryFn: () => api<Verify>(`/judge/verify/${accountId}`), enabled: ready });

  const presetName = presets.data?.presets.find((p: Preset) => sameComponents(p.components, components))?.name
    ?? `Custom twist: ${sim.data?.effects.map((e) => e.rule).join(" + ") ?? "…"}`;
  const j = s.data?.judging;
  const sc = sim.data?.scenario;
  const verdict = sim.data?.verdict;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink"><Gavel className="size-6 text-tangerine" /> Judge Demo</h1>
        <p className="text-sm text-ink-2">Follow the steps in order. Every number comes from Clement Core using the Tangerine README formulas, and it all works without AI, news or blockchain.</p>
      </div>

      <nav aria-label="Demo progress" className="sticky top-16 z-20 -mx-1 rounded-2xl border border-line bg-surface/95 p-2 shadow-sm backdrop-blur">
        <ol className="flex flex-wrap items-center gap-1">
          {STEPS.map((st, i) => (
            <li key={st.id} className="flex items-center gap-1">
              <button onClick={() => goTo(st.id)} aria-current={active === st.id ? "step" : undefined}
                className={cn("inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition",
                  active === st.id ? "bg-tangerine text-white shadow-sm" : "text-ink-2 hover:bg-peach hover:text-ink")}>
                <span className={cn("grid size-5 place-items-center rounded-full text-[0.6875rem]", active === st.id ? "bg-white/25" : "bg-peach text-tangerine")}>{st.n}</span>{st.label}
              </button>
              {i < STEPS.length - 1 && <span className="text-ink-3" aria-hidden>→</span>}
            </li>
          ))}
        </ol>
      </nav>

      {/* STEP 1 */}
      <StepCard id="step-1" n="1" title="Know the Customer" subtitle="Search any account in the challenge dataset, then read its baseline.">
        <AccountSearch />
        {!ready && <p className="mt-4 rounded-2xl bg-peach p-4 text-sm text-ink">Start by searching for an account ID above (for example 20111).</p>}
        {s.error && <div className="mt-4"><ErrorState error={s.error} retry={s.refetch} /></div>}
        {ready && !j && !s.error && <Skeleton className="mt-4 h-40" />}
        {j && (
          <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Monthly income (I)" value={money(j.I)} sub="median money in" />
            <Tile label="Monthly spending (S)" value={money(j.S)} sub="median money out" />
            <Tile label="Fixed costs (F)" value={money(j.F)} sub="bills + insurance + loans" />
            <Tile label="Household bills (H)" value={money(j.H)} sub="median household bills" />
            <Tile label="Savings buffer (B)" value={money(j.B)} sub="avg balance, last 6 months" />
            <Tile label="Loan payment (P)" value={money(j.P)} sub={s.data?.loan?.running ? "running loan" : "no running loan"} />
            <Tile label="Monthly surplus" value={signedMoney(j.I - j.S)} sub="I − S" />
            <Tile label="Baseline runway" value={j.runway.no_shortfall ? "No shortfall" : `${j.runway.display} months`} sub="before any shock" />
          </dl>
        )}
      </StepCard>

      {/* STEP 2 */}
      <StepCard id="step-2" n="2" title="Choose the Twist" subtitle="Pick a twist card or adjust the sliders. Judging Mode applies only the README transformations.">
        {presets.data ? (
          <ShockScenarioSelector components={components} onChange={setComponents} types={presets.data.types} presets={presets.data.presets}
            onPreset={(p) => setComponents(p.components)} mode="judging" sValue={j?.S} />
        ) : <Skeleton className="h-48" />}
        {sim.data && (
          <div className="mt-5 rounded-2xl border border-line bg-cream p-4">
            <p className="text-sm font-semibold text-ink">Chosen assumptions: {presetName}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-2">
              {sim.data.effects.map((e, i) => <li key={i}><b className="text-ink">{e.label}:</b> {e.rule}</li>)}
              {sim.data.assumptions.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </div>
        )}
      </StepCard>

      {/* STEP 3 */}
      <StepCard id="step-3" n="3" title="See the New Numbers" subtitle="Baseline versus after the twist, in plain language, a table and a chart.">
        {!ready ? <p className="text-sm text-ink-2">Choose an account in Step 1 first.</p> : sim.error ? <ErrorState error={sim.error} /> : !sim.data || !sc || !j ? <Skeleton className="h-72" /> : (
          <div className="space-y-6">
            <p className="rounded-2xl bg-peach p-4 text-[0.9375rem] leading-relaxed text-ink" role="status">
              After this twist, monthly income goes from <b>{money(sim.data.baseline.income)}</b> to <b>{money(sc.income)}</b> and spending from <b>{money(sim.data.baseline.spending)}</b> to <b>{money(sc.spending)}</b>
              {sc.one_off_costs > 0 && <>, with a one-off cost of <b>{money(sc.one_off_costs)}</b> taken from the buffer</>}.{" "}
              {sc.gap > 0 ? <>That leaves a monthly shortfall of <b>{money(sc.gap)}</b>, so the buffer of <b>{money(sc.buffer_left)}</b> lasts <b>{sc.runway.display} months</b> (it was {sim.data.baseline.runway.display}).</>
                : <>Income still covers spending, so there is <b>no monthly shortfall</b>.</>}
              {verdict && <> {verdict.text}</>}
            </p>
            <FinancialImpactSummary sim={sim.data} />
            <div><p className="mb-2 font-semibold text-ink">Buffer over time</p><ScenarioComparisonChart sim={sim.data} /></div>
            {verify.data && (
              <div className="rounded-2xl border border-line p-4">
                <p className="mb-2 flex items-center gap-2 font-semibold text-ink">Reference check: the README twist cards recomputed independently
                  {verify.data.all_match ? <Badge tone="good"><CheckCircle2 /> all match</Badge> : <Badge tone="bad"><XCircle /> mismatch</Badge>}</p>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-ink-2"><th className="py-1 font-medium">Twist</th><th className="text-right font-medium">Reference</th><th className="text-right font-medium">Engine</th></tr></thead>
                  <tbody>{verify.data.rows.map((r) => <tr key={r.twist} className="border-t border-line"><td className="py-1.5">{r.twist}</td><td className="tabular text-right">{r.reference}</td><td className="tabular text-right font-semibold">{r.engine} {r.match ? "✓" : "✗"}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </StepCard>

      {/* STEP 4 */}
      <StepCard id="step-4" n="4" title="Recovery & Recommendations" subtitle="Based on this customer’s own numbers under the twist you chose.">
        {!ready ? <p className="text-sm text-ink-2">Choose an account in Step 1 first.</p> : !backup.data || !goal.data || !s.data ? <Skeleton className="h-64" /> : (
          <div className="space-y-6">
            <p className="text-sm text-ink-2">Why these recommendations: under this twist the shortfall is <b className="text-ink">{money(backup.data.monthly_shortfall)}/month</b>. Discretionary outflows are the only spending not committed to bills or loans, so trimming them is modeled first. These are modeled options, not guarantees.</p>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <p className="mb-2 font-semibold text-ink">Backup Plan: what to do if the twist hits</p>
                <ol className="list-decimal space-y-2 pl-5 text-sm">
                  {backup.data.immediate_actions.map((a) => <li key={a.action}><b className="text-ink">{a.action}</b><span className="block text-xs text-ink-2">{a.why}</span></li>)}
                </ol>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="mb-2 font-semibold text-ink">Options compared (runway in months)</p>
                  <table className="w-full text-sm">
                    <tbody>{backup.data.alternatives.map((t) => (
                      <tr key={t.name} className="border-t border-line"><td className="py-1.5 text-ink-2">{t.name}</td><td className="tabular text-right font-semibold">{t.runway.display}</td></tr>
                    ))}</tbody>
                  </table>
                  <p className="mt-1 text-xs text-ink-2">{backup.data.best_tier.runway.no_shortfall
                    ? <>The best modeled option closes the monthly gap entirely (no shortfall).</>
                    : <>Best modeled option adds <b>{backup.data.runway_improvement_months.toFixed(1)}</b> months.</>}{backup.data.discretionary_cut_pct_to_close_gap !== null && backup.data.monthly_shortfall > 0 && ` A ${Math.min(backup.data.discretionary_cut_pct_to_close_gap, 100).toFixed(0)}% discretionary trim would close the gap.`}</p>
                </div>
                <div>
                  <p className="mb-1 font-semibold text-ink">Priority expenses to keep current</p>
                  <ul className="text-sm">{backup.data.priority_expenses.map((p) => <li key={p.item} className="flex justify-between border-t border-line py-1"><span className="text-ink-2">{p.item} <Badge>{p.priority}</Badge></span><span className="tabular font-semibold">{money(p.monthly)}</span></li>)}</ul>
                </div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-line bg-cream p-4 text-sm">
                <p className="mb-1 font-semibold text-ink">Goal Plan: build a 3-month emergency fund</p>
                <p className="text-ink-2">Target <b className="text-ink">{money(goal.data.target)}</b> · gap <b className="text-ink">{money(goal.data.gap)}</b> · save <b className="text-ink">{money(goal.data.recommended_monthly_contribution)}/month</b> → {goal.data.months_to_goal === null ? "spending reductions are needed before saving can start" : goal.data.months_to_goal === 0 ? "already reached" : `about ${goal.data.months_to_goal} months`}.</p>
              </div>
              <div className="rounded-2xl border border-line bg-cream p-4 text-sm">
                <p className="mb-1 font-semibold text-ink">Resilience score (educational, not a credit score)</p>
                <p className="text-ink-2"><b className="text-ink">{Math.round(s.data.resilience.score)}/100 · {s.data.resilience.band}</b>. Main risks: {s.data.resilience.risks.join(", ") || "none flagged"}.</p>
              </div>
            </div>
            <AIInsightCard title="Explain these results (optional)" endpoint="/ai/explain-scenario" kind="scenario" key={JSON.stringify(shock)} body={{ request: shock }} />
          </div>
        )}
      </StepCard>

      {/* FINAL */}
      <StepCard id="final" n="★" title="Judge Demo Summary" subtitle="Everything from steps 1 to 4 on one card." tone="final">
        {!ready || !j || !sc || !sim.data || !backup.data ? <p className="text-sm text-ink-2">Complete steps 1 and 2 to see the summary.</p> : (
          <div className="space-y-5">
            <dl className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-line bg-surface p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-3">Customer & twist</dt>
                <dd className="mt-1 text-sm text-ink">Account <b>#{accountId}</b> · {presetName}</dd>
              </div>
              <div className="rounded-2xl border border-line bg-surface p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-3">Resilience</dt>
                <dd className="mt-1 text-sm text-ink">Score <b>{Math.round(s.data!.resilience.score)}/100</b> ({s.data!.resilience.band})</dd>
              </div>
              <div className="rounded-2xl border border-line bg-surface p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-3">Before the twist</dt>
                <dd className="mt-1 text-sm text-ink">Income {money(j.I)} · spending {money(j.S)} · buffer {money(j.B)} · runway <b>{j.runway.display}</b></dd>
              </div>
              <div className="rounded-2xl border border-line bg-surface p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-3">After the twist</dt>
                <dd className="mt-1 text-sm text-ink">Income {money(sc.income)} · spending {money(sc.spending)}{sc.one_off_costs > 0 ? ` · one-off ${money(sc.one_off_costs)}` : ""} · runway <b>{sc.runway.display}</b></dd>
              </div>
            </dl>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-ink">Key takeaways</p>
                <ReadAloud text={`Account ${accountId}. ${presetName}. Runway changes from ${j.runway.display} to ${sc.runway.display}. ${verdict?.text ?? ""} Top recommendation: ${backup.data.immediate_actions[0]?.action ?? ""}`} label="Read summary" /></div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">
                <li>Runway changes from {j.runway.display} to {sc.runway.display} {sc.runway.no_shortfall ? "" : "months"}{verdict ? `, and ${verdict.survives ? "the customer makes it" : "the customer falls short"} over the ${verdict.required_months}-month twist` : ""}.</li>
                <li>{sc.gap > 0 ? `The new monthly shortfall is ${money(sc.gap)}.` : "Income still covers spending after the twist."}</li>
                <li>Best modeled response: trim discretionary outflows {backup.data.best_tier.discretionary_cut_pct}% → {backup.data.best_tier.runway.no_shortfall
                  ? "the monthly gap closes entirely (no shortfall)" : `runway ${backup.data.best_tier.runway.display} months (+${backup.data.runway_improvement_months.toFixed(1)})`}.</li>
                <li>Top recommendation: {backup.data.immediate_actions[0]?.action}</li>
              </ul>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button onClick={() => goTo("step-2", "button")}><Shuffle /> Try Another Scenario</Button>
              <Button variant="outline" onClick={() => goTo("step-1", "input[role=combobox]")}><Search /> Choose Another Account</Button>
              <Button variant="ghost" onClick={() => { setComponents(DEFAULT_TWIST); window.scrollTo({ top: 0, behavior: "smooth" }); }}><RotateCcw /> Restart Demo</Button>
              <ExportReportButton report="judge" accountId={accountId} shock={shock} label="Download Report" />
            </div>
          </div>
        )}
      </StepCard>
    </div>
  );
}
