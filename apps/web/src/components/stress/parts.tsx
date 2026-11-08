"use client";
/**
 * Shared building blocks for the account workbench (analysts, judges) and the customer pages.
 * One set of rules for risk, tone and wording, so every screen agrees on what "at risk" means.
 */
import { ReadAloud } from "@/components/ui/reading";
import { useGoalDraft } from "@/lib/hooks";
import { DEFAULT_SHOCK, goalRequest, type ScenarioDraft } from "@/lib/analysis";
import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, CircleAlert, Info, Phone } from "lucide-react";
import type { Judging, Preset, Runway, ShockComponent, SimResult } from "@clementiq/shared-types";
import { api } from "@/lib/api";
import { money, signedMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, Skeleton } from "@/components/ui/misc";

// ── Types ────────────────────────────────────────────────────────────────────────────────────────────
export interface GoalPlan { current_buffer: number; target: number; gap: number; progress_pct: number; monthly_surplus: number; recommended_monthly_contribution: number; months_to_goal: number | null; status: string }
export interface BackupPlan { monthly_shortfall: number; immediate_actions: { action: string; why?: string }[]; discretionary_cut_pct_to_close_gap: number | null; best_tier: { discretionary_cut_pct: number; runway: Runway } | null; runway_improvement_months: number }
export interface Obligations {
  as_of_month: string; balance: number | null; fixed_payments: { label: string; amount: number }[]; fixed_total: number;
  left_after_fixed: number | null; status: "covered" | "tight" | "short" | "unknown"; typical_spending: number;
  loan: { status: string; meaning: string; running: boolean; behind: boolean; monthly_payment: number } | null; notes: string[];
}
export type Mode = "analyst" | "customer";
export type Tone = "good" | "warn" | "bad";

// ── Shocks ───────────────────────────────────────────────────────────────────────────────────────────
/** README twist cards + the Canadian 2026 one we added; always one tap away. */
export const FEATURED = ["ei55_6m", "furnace", "ei55_bills15", "mortgage_renewal"] as const;
export const LABELS: Record<Mode, Record<string, { title: string; sub: string }>> = {
  analyst: {
    ei55_6m: { title: "Laid off", sub: "EI 55% for 6 months" },
    furnace: { title: "Furnace dies", sub: "Repair = 1 month of S" },
    ei55_bills15: { title: "Job loss + bills", sub: "EI 55%, H +15%" },
    mortgage_renewal: { title: "Mortgage renewal", sub: "Loan payment +6%" },
  },
  customer: {
    ei55_6m: { title: "I lose my job", sub: "EI pays about 55% for 6 months" },
    furnace: { title: "A big repair", sub: "Costs about a month of spending" },
    ei55_bills15: { title: "Job loss and higher bills", sub: "EI 55%, household bills +15%" },
    mortgage_renewal: { title: "My mortgage renews", sub: "Payment goes up about 6%" },
  },
};
export const ANALYST_DEFAULT = DEFAULT_SHOCK;
/** A cut bigger than this is not a plan anyone can follow; we say so instead of printing it. */
export const MAX_REALISTIC_CUT = 60;
export const presetMatches = (p: Preset, c: ShockComponent[] | null) => !!c && JSON.stringify(p.components) === JSON.stringify(c);

// ── Formatting and tone ──────────────────────────────────────────────────────────────────────────────
export const TONE_TEXT: Record<Tone, string> = { good: "text-good", warn: "text-warn", bad: "text-bad" };
export const TONE_BOX: Record<Tone, string> = { good: "bg-good-bg text-good", warn: "bg-warn-bg text-warn", bad: "bg-bad-bg text-bad" };
export const TONE_ICON: Record<Tone, React.ElementType> = { good: CheckCircle2, warn: AlertTriangle, bad: CircleAlert };
/** Long horizons read better in years ("about 8½ years" beats "102 months"). */
export function duration(months: number): string {
  if (months < 24) return `${months} months`;
  const y = Math.round((months / 12) * 2) / 2;
  return `${Number.isInteger(y) ? y : `${Math.floor(y)}½`} years`;
}
export const bigRunway = (r: Runway) => (r.no_shortfall ? "120+" : r.display);
export const runwayCaption = (r: Runway) => (r.no_shortfall ? "no monthly shortfall" : r.status === "depleted" ? "savings already used up" : "months of runway");

// ── Risk (same rules as GET /api/insights/needs-attention) ───────────────────────────────────────────
export interface Risk { unknown: boolean; thinBuffer: boolean; loanBehind: boolean; pastDefault: boolean; shortThisMonth: boolean }
export function riskOf(j: Judging | undefined, o: Obligations | undefined): Risk {
  return {
    unknown: !j || !o || o.status === "unknown",
    thinBuffer: !!j && j.S > 0 && j.B < j.S,
    loanBehind: !!o?.loan?.behind,
    pastDefault: o?.loan?.status === "B",
    shortThisMonth: o?.status === "short",
  };
}
export const anyRisk = (r: Risk) => r.unknown || r.thinBuffer || r.loanBehind || r.shortThisMonth;
/** Runway under EI 55% from the judge inputs, for the "fragile" nudge (null = no shortfall). */
export function ei55Runway(j: Judging): number | null {
  const gap = j.S - 0.55 * j.I;
  if (j.B <= 0) return 0;
  return gap <= 0 ? null : Math.min(j.B / gap, 120);
}
export function runwayTone(r: Runway, j: Judging | undefined, risk: Risk): Tone {
  if (r.status === "depleted") return "bad";
  if (risk.shortThisMonth || risk.loanBehind) return "bad";
  if (risk.unknown || risk.thinBuffer) return "warn";
  if (r.no_shortfall) return (j && j.S === 0) || anyRisk(risk) ? "warn" : "good";
  return r.months < 3 ? "bad" : r.months < 6 ? "warn" : "good";
}
export function edgeCases(j: Judging, mode: Mode): { tone: Tone; text: string }[] {
  const out: { tone: Tone; text: string }[] = [];
  if (j.S === 0) out.push({ tone: "warn", text: mode === "customer" ? "We see almost no spending from this account, so it may not be where your day-to-day money goes." : "No typical monthly spending (S = 0): the account is mostly inactive, so “no shortfall” reflects inactivity, not safety." });
  if (j.I === 0) out.push({ tone: "warn", text: mode === "customer" ? "No regular income arrives in this account." : "No typical monthly income (I = 0): income shocks change nothing; only spending and one-off shocks move the runway." });
  if (j.B <= 0) out.push({ tone: "bad", text: mode === "customer" ? "There are no savings in this account right now." : "Buffer is zero or negative (B ≤ 0): runway is 0 under any shock. The plan starts from rebuilding a buffer." });
  return out;
}
/** Backup steps, made followable: lender first when a loan is behind, no impossible cuts. */
export function backupSteps(b: BackupPlan, risk: Risk, mode: Mode): string[] {
  const cut = b.discretionary_cut_pct_to_close_gap;
  const tooBig = cut != null && cut > MAX_REALISTIC_CUT;
  const callLender = risk.loanBehind || risk.shortThisMonth;
  let rest = b.immediate_actions.map((a) => a.action)
    .filter((t) => !(tooBig && /cut closes it|trim discretionary/i.test(t)))
    .filter((t) => !(callLender && /lender/i.test(t)));
  const first: string[] = [];
  if (callLender) first.push(risk.loanBehind
    ? (mode === "customer" ? "Call your lender before the next payment date — your loan is already behind, and lenders have more options before a missed payment than after." : "Contact the lender now: loan status D (running, in arrears).")
    : (mode === "customer" ? "Call your lender before the next payment date to ask about moving or splitting it." : "Contact the lender: fixed payments exceed the balance this month."));
  if (tooBig) first.push(mode === "customer"
    ? "Cutting back alone can't cover a gap this size — ask about a payment deferral and check what EI will pay."
    : `Discretionary trimming cannot close this gap (needs ${Math.round(cut!)}%): lead with a deferral and EI.`);
  rest = rest.filter((t) => !first.includes(t));
  return [...first, ...rest].slice(0, 3);
}

// ── Data ─────────────────────────────────────────────────────────────────────────────────────────────
export function useShock(accountId: number | null, components: ShockComponent[] | null, options?: ScenarioDraft) {
  const mode = options?.mode ?? "judging";
  const horizon = options?.horizon_months ?? 24;
  const cut = mode === "extended" ? options?.discretionary_cut_pct ?? 0 : 0;
  const shock = useMemo(() => (accountId && components && components.length ? { account_id: accountId, components, mode, horizon_months: horizon, discretionary_cut_pct: cut } : null), [accountId, components, mode, horizon, cut]);
  const sim = useQuery({ queryKey: ["sim", shock], queryFn: () => api<SimResult>("/shocks/simulate", { method: "POST", json: shock }), enabled: !!shock });
  const backup = useQuery({ queryKey: ["backup", shock], queryFn: () => api<BackupPlan>("/recovery/backup-plan", { method: "POST", json: { account_id: accountId, shock } }), enabled: !!shock });
  return { shock, sim, backup };
}
export function useAccountExtras(accountId: number | null) {
  const { draft } = useGoalDraft(accountId);
  const body = goalRequest(draft);
  const goal = useQuery({ queryKey: ["goal", body], queryFn: () => api<GoalPlan>("/recovery/goal-plan", { method: "POST", json: body }), enabled: !!accountId });
  const obl = useQuery({ queryKey: ["obligations", accountId], queryFn: () => api<Obligations>(`/accounts/${accountId}/obligations`), enabled: !!accountId });
  return { goal, obl };
}

// ── Layout primitives ────────────────────────────────────────────────────────────────────────────────
export function Section({ n, title, desc, right, children, className }: { n?: number; title: string; desc?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-start gap-3">
          {n != null && <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-tangerine text-[12px] font-semibold text-white">{n}</span>}
          <div><CardTitle>{title}</CardTitle>{desc && <CardDescription>{desc}</CardDescription>}</div>
        </div>
        {right}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
export function Disclosure({ title, children, defaultOpen = false, badge }: { title: string; children: React.ReactNode; defaultOpen?: boolean; badge?: React.ReactNode }) {
  return (
    <details className="group rounded-2xl shadow-card bg-surface" open={defaultOpen}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-5 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2"><span>{title}</span>{badge}</span><ChevronDown className="size-4 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}
export function Note({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const Icon = TONE_ICON[tone];
  return <p role="note" className={cn("flex gap-2 rounded-xl p-3 text-[13px] leading-relaxed", TONE_BOX[tone])}><Icon className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{children}</span></p>;
}
export function Row({ label, value, strong }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 py-2">
      <dt className="text-[15px] text-ink-2">{label}</dt>
      <dd className={cn("tabular text-[15px]", strong ? "font-semibold text-ink" : "text-ink")}>{value}</dd>
    </div>
  );
}

// ── Shock picker (segmented control) ─────────────────────────────────────────────────────────────────
export function ShockPicker({ presets, components, onPick, mode, allowNone }: { presets: Preset[]; components: ShockComponent[] | null; onPick: (c: ShockComponent[] | null) => void; mode: Mode; allowNone?: boolean }) {
  const featured = FEATURED.map((id) => presets.find((p) => p.id === id)).filter((p): p is Preset => !!p);
  return (
    <div role="group" aria-label={mode === "customer" ? "What-if scenarios" : "Twist cards"}
      className={cn("grid gap-1 rounded-xl bg-field p-1", mode === "customer" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-4")}>
      {featured.map((p) => {
        const on = presetMatches(p, components);
        return (
          <button key={p.id} onClick={() => onPick(on && allowNone ? null : p.components)} aria-pressed={on}
            className={cn("min-h-14 cursor-pointer rounded-[11px] px-3 py-2 text-left transition active:scale-[0.99]",
              on ? "bg-surface shadow-[0_3px_8px_rgb(0_0_0/0.12),0_3px_1px_rgb(0_0_0/0.04)]" : "hover:bg-white/60")}>
            <span className={cn("flex items-center gap-1.5 text-[15px] font-semibold", on ? "text-tangerine" : "text-ink")}>
              <CheckCircle2 className={cn("size-4 shrink-0", !on && "hidden")} aria-hidden /><span>{LABELS[mode][p.id]?.title ?? p.name}</span>
            </span>
            <span className="block text-[12px] text-ink-3">{LABELS[mode][p.id]?.sub}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Cards ────────────────────────────────────────────────────────────────────────────────────────────
/** This month's fixed payments vs the balance, plus the loan status. `compact` = one line when nothing is wrong. */
export function NowCard({ o, j, risk, mode, compact = false, bare = false }: { o: Obligations; j?: Judging; risk: Risk; mode: Mode; compact?: boolean; bare?: boolean }) {
  const tone: Tone = o.status === "short" ? "bad" : o.status === "tight" ? "warn" : o.status === "covered" ? "good" : "warn";
  const gapToB = j && o.balance != null && j.B > 0 && Math.abs(o.balance - j.B) / j.B > 0.25;
  const headline = o.balance == null ? "No balance on record for this account."
    : o.status === "short" ? (mode === "customer"
      ? <>Your known fixed payments (<b>{money(o.fixed_total)}</b>) are more than the latest recorded balance (<b>{money(o.balance)}</b>). You&apos;re short about <span className="marker font-semibold">{money(-(o.left_after_fixed ?? 0))}</span>.</>
      : <>Fixed payments {money(o.fixed_total)} exceed the month-end balance {money(o.balance)} by {money(-(o.left_after_fixed ?? 0))}.</>)
    : o.status === "tight" ? (mode === "customer"
      ? <>The recorded balance covers known fixed payments, but only <span className="marker font-semibold">{money(o.left_after_fixed)}</span> is left for everything else this month.</>
      : <>Covered, but only {money(o.left_after_fixed)} remains after fixed payments (under half a month of spending).</>)
    : (mode === "customer"
      ? <>Based on the latest recorded balance: <b>{money(o.left_after_fixed)}</b> left after your fixed payments.</>
      : <>Covered: {money(o.left_after_fixed)} remains after fixed payments.</>);
  const Icon = TONE_ICON[tone];
  const details = (
    <>
      <dl className="divide-y divide-line">
        {o.fixed_payments.map((f) => <Row key={f.label} label={f.label} value={money(f.amount)} />)}
        <Row label={mode === "customer" ? "Fixed payments in total" : "Fixed total"} value={money(o.fixed_total)} strong />
        <Row label={mode === "customer" ? "In your account (end of month)" : "Month-end balance"} value={money(o.balance)} strong />
      </dl>
      {gapToB && j && <p className="flex gap-1.5 text-[12px] leading-relaxed text-ink-3"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />{mode === "customer"
        ? <>Your balance at the end of the month ({money(o.balance)}) is different from your usual balance ({money(j.B)}), the six-month average the runway uses.</>
        : <>Month-end balance {money(o.balance)} vs B {money(j.B)} (mean daily balance, last 6 months): the runway uses B, so a single month-end can look safer or worse than it is.</>}</p>}
      <p className="flex gap-1.5 text-[12px] leading-relaxed text-ink-3"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />{o.notes.join(" ")}</p>
    </>
  );
  const body = (
      <div className="space-y-3">
        <ReadAloud text={`Latest record: ${o.as_of_month}. Fixed payments ${money(o.fixed_total)}. Month-end balance ${money(o.balance)}. Remaining after fixed payments ${money(o.left_after_fixed)}. ${risk.loanBehind ? "The loan record shows overdue payments." : ""} Check current balances and due dates; these are historical records.`} />
        <p className={cn("flex gap-2.5 rounded-xl p-3.5 text-[15px] leading-relaxed", TONE_BOX[tone])}><Icon key={`i-${tone}`} className="mt-0.5 size-5 shrink-0" aria-hidden /><span key={`h-${o.status}`} className="text-ink">{headline}</span></p>
        {risk.loanBehind && (
          <p className="flex gap-2.5 rounded-xl bg-bad-bg p-3.5 text-[15px] leading-relaxed text-ink"><Phone className="mt-0.5 size-5 shrink-0 text-bad" aria-hidden />
            {mode === "customer" ? <span><b>Your loan is behind on payments.</b> Check the current payment status and contact your lender to discuss available options.</span> : <span><b>Loan status D</b> — running, client in arrears ({money(o.loan?.monthly_payment)}/mo).</span>}</p>
        )}
        {risk.pastDefault && <Note tone="warn">{mode === "customer" ? "A previous loan on this account was not fully repaid." : "Loan status B — finished, not repaid (past default)."}</Note>}
        {risk.thinBuffer && j && <Note tone="warn">{mode === "customer" ? <>You have less than one month of spending saved ({money(j.B)} vs about {money(j.S)} a month).</> : <>Buffer covers {(j.B / j.S).toFixed(1)} months of spending.</>}</Note>}
        {compact
          ? <details className="group"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-[15px] font-medium text-tangerine [&::-webkit-details-marker]:hidden">See this month&apos;s payments<ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /></summary><div className="space-y-3 pt-1">{details}</div></details>
          : details}
      </div>
  );
  if (bare) return <div className="space-y-2"><p className="text-[13px] text-ink-3">Latest month on record: {o.as_of_month}</p>{body}</div>;
  return <Section title={mode === "customer" ? "Right now" : "Fixed payments vs balance"} desc={`Latest month on record: ${o.as_of_month}`}>{body}</Section>;
}

/** Safety-net plan. Customer copy points at the Tangerine products it would use (Goals + Automatic Savings Program). */
export function GoalCard({ g, j, mode, n, risk, summary = false }: { g?: GoalPlan; j?: Judging; mode: Mode; n?: number; risk: Risk; summary?: boolean }) {
  const stabilise = risk.shortThisMonth || risk.loanBehind;
  const speech = g ? `Your savings target is ${money(g.target)}. Current buffer: ${money(g.current_buffer)}. Suggested monthly contribution: ${money(g.recommended_monthly_contribution)}. ${stabilise ? "The payment risk needs attention before adding savings commitments." : "The estimate uses your recorded account history."}` : "";
  return <Section n={n} title={mode === "customer" ? (summary ? "Your safety net" : "Build your safety net") : "Goal Plan"}
    desc={summary ? undefined : "Current target and contribution estimate"}
    right={<div className="flex flex-wrap items-center gap-2">{g && <ReadAloud text={speech} />}{summary && <Link href="/plan" className="flex min-h-11 items-center gap-1 text-sm font-medium text-tangerine">Plan<ArrowRight className="size-4" aria-hidden /></Link>}</div>}>
    {!g || !j ? <Skeleton className="h-28" /> : g.target <= 0 ? <p className="text-[15px] leading-relaxed">There is not enough spending history to size this target.</p> : <div className="space-y-3 text-[15px] leading-relaxed">
      <div className="flex flex-wrap justify-between gap-2 text-sm text-ink-2"><span>{money(g.current_buffer)} saved</span><span>Goal {money(g.target)}</span></div>
      <div className="h-2 rounded-full bg-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(Math.max(g.progress_pct, 0), 100))} aria-label="Safety net progress"><div className="h-full rounded-full bg-tangerine" style={{ width: `${Math.min(Math.max(g.progress_pct, 0), 100)}%` }} /></div>
      {stabilise && <Note tone="bad">The recorded payment shortfall or overdue loan needs attention before adding a savings commitment. This target does not resolve that risk.</Note>}
      {g.months_to_goal === 0 ? <p>Your current buffer covers this target. Keep checking your payment commitments and changes in income.</p>
        : g.recommended_monthly_contribution <= 0 ? <p>The recorded typical month leaves no surplus for this target. Review the income and spending assumptions before choosing a contribution.</p>
        : <p>Suggested contribution: <b>{money(g.recommended_monthly_contribution)} a month</b>. At this rate, the target could be reached in about <b>{g.months_to_goal != null ? duration(g.months_to_goal) : "an unknown period"}</b>, if the assumptions hold.</p>}
      {!summary && <p className="text-xs text-ink-2">This is a plan estimate. No bank goal is created and no money is transferred.</p>}
    </div>}
  </Section>;
}

export function ResultView({ sim, j, risk, mode }: { sim: SimResult; j?: Judging; risk: Risk; mode: Mode }) {
  const before = sim.baseline.runway, after = sim.scenario.runway;
  const tone = runwayTone(after, j, risk);
  const v = sim.verdict;
  return (
    <div className="space-y-5">
      <ReadAloud text={`Under this scenario, monthly income is ${money(sim.scenario.income)}, spending is ${money(sim.scenario.spending)}, and runway is ${after.display} months. ${anyRisk(risk) ? "Existing payment or savings risks still need attention." : ""} This is a simulation, not a prediction.`} />
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div>
          <p className="text-[13px] font-semibold text-ink-3">{mode === "customer" ? "Recorded baseline" : "Before"}</p>
          <p className="tabular font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-ink-3">{mode === "customer" && before.no_shortfall ? "No monthly gap" : bigRunway(before)}</p>
          <p className="text-[12px] text-ink-3">{mode === "customer" && before.no_shortfall ? "income covers spending" : runwayCaption(before)}</p>
        </div>
        <ArrowRight className="mb-6 size-6 text-ink-3" aria-hidden />
        <div>
          <p className="text-[13px] font-semibold text-ink-3">{mode === "customer" ? "If it happens" : "With this twist"}</p>
          <p className={cn("display-num", TONE_TEXT[tone])}>{bigRunway(after)}</p>
          <p className="text-[13px] text-ink-2">{runwayCaption(after)}</p>
        </div>
      </div>
      {v && (
        <Note key={`${after.no_shortfall}-${v.survives}`} tone={tone}>
          <b>{after.no_shortfall
            ? (j && j.S === 0 ? "No shortfall — but only because this account shows almost no spending." : anyRisk(risk) ? "Income would still cover spending in a typical month — but this month's payments are already tight." : "Yes — income still covers spending, so savings aren't drawn down.")
            : mode === "customer" ? (v.survives ? `Yes — your savings would last about ${after.display} months, longer than the ${v.required_months}-month period.` : `No — your savings would run out after about ${after.display} months, ${(v.required_months - after.months).toFixed(1)} months short.`) : v.text}</b>
          {!after.no_shortfall && !v.survives && v.shortfall_over_period > 0 && <span className="block font-normal">{mode === "customer" ? "To get through the whole period you'd need about " : "Extra money needed to last the full period: "}{money(v.shortfall_over_period)}{mode === "customer" ? " more." : ""}</span>}
        </Note>
      )}
      <table className="w-full text-[15px]">
        <caption className="sr-only">Monthly figures before and after</caption>
        <thead><tr className="text-left text-[13px] text-ink-3"><th className="py-1.5 font-medium">Per month</th><th className="py-1.5 text-right font-medium">{mode === "customer" ? "Today" : "Before"}</th><th className="py-1.5 text-right font-medium">After</th><th className="hidden py-1.5 text-right font-medium sm:table-cell">Change</th></tr></thead>
        <tbody>
          {[
            { k: mode === "customer" ? "Money in" : "Income", b: sim.baseline.income, a: sim.scenario.income },
            { k: mode === "customer" ? "Money out" : "Spending", b: sim.baseline.spending, a: sim.scenario.spending },
            { k: mode === "customer" ? "Short each month" : "Shortfall (gap)", b: Math.max(sim.baseline.gap, 0), a: Math.max(sim.scenario.gap, 0) },
            { k: mode === "customer" ? "Savings after one-off costs" : "Buffer after one-off costs", b: sim.baseline.B, a: sim.scenario.buffer_left },
          ].map((r) => (
            <tr key={r.k} className="border-t border-line">
              <td className="py-2.5 pr-2 text-ink-2">{r.k}</td>
              <td className="tabular py-2.5 pl-2 text-right whitespace-nowrap">{money(r.b)}</td>
              <td className="tabular py-2.5 pl-3 text-right font-semibold whitespace-nowrap">{money(r.a)}</td>
              <td className="tabular hidden py-2.5 pl-3 text-right text-[13px] whitespace-nowrap text-ink-3 sm:table-cell">{signedMoney(r.a - r.b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {mode === "analyst" && <ul className="flex flex-wrap gap-1.5">{sim.effects.map((e, i) => <li key={i}><Badge tone="neutral">{e.label}: {e.rule}</Badge></li>)}</ul>}
      {sim.warnings.length > 0 && <div className="space-y-1.5">{sim.warnings.map((w) => <Note key={w} tone="warn">{w}</Note>)}</div>}
    </div>
  );
}

export function BackupView({ b, risk, mode }: { b: BackupPlan; risk: Risk; mode: Mode }) {
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      <ReadAloud text={`Monthly shortfall under this scenario: ${money(b.monthly_shortfall)}. ${backupSteps(b, risk, mode).join(" ")}`} />
      {b.monthly_shortfall > 0
        ? <p>{mode === "customer" ? "You'd" : "Customer would"} be short about <span className="marker font-semibold">{money(b.monthly_shortfall)} a month</span>.</p>
        : <p>Income would still cover spending.</p>}
      <ol className="space-y-2">
        {backupSteps(b, risk, mode).map((a, i) => (
          <li key={a} className="flex gap-3 rounded-xl bg-cream p-3"><span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-[12px] font-semibold text-white">{i + 1}</span><span>{a}</span></li>
        ))}
      </ol>
      {b.best_tier && b.runway_improvement_months > 0 && b.best_tier.discretionary_cut_pct <= MAX_REALISTIC_CUT && (
        <p className="text-[13px] text-ink-2">{b.best_tier.runway.no_shortfall
          ? <>Trimming flexible spending by {b.best_tier.discretionary_cut_pct}% would close the monthly gap.</>
          : <>Trimming flexible spending by {b.best_tier.discretionary_cut_pct}% stretches savings to <b>{bigRunway(b.best_tier.runway)} months</b> (+{b.runway_improvement_months.toFixed(1)}).</>}</p>
      )}
    </div>
  );
}

/** Typical month, as grouped-list rows. */
export function TypicalMonth({ j, mode }: { j: Judging; mode: Mode }) {
  return (
    <dl className="divide-y divide-line">
      {(["I", "S", "F", "H", "B", "P"] as const).map((k) => (
        <Row key={k} value={money(j[k])} label={mode === "customer"
          ? ({ I: "Money in", S: "Money out", F: "Bills, insurance and loan", H: "Household bills", B: "Savings in this account", P: "Loan payment" })[k]
          : <>{({ I: "Income", S: "Spending", F: "Fixed costs", H: "Household bills", B: "Buffer", P: "Loan payment" })[k]} <span className="text-ink-3">({k})</span></>} />
      ))}
    </dl>
  );
}

export function LoadError({ error }: { error: unknown }) { return <ErrorState error={error} />; }
