"use client";
import Link from "next/link";
import { AIInsightCard } from "@/components/ai/AIInsightCard";
import { goalRequest } from "@/lib/analysis";
import { Glossary } from "@/components/ui/reading";
import { useAccount, useSummary, useGoalDraft } from "@/lib/hooks";
import { ErrorState, Skeleton } from "@/components/ui/misc";
import { useRoleGate } from "@/components/layout/useRoleGate";
import { Disclosure, GoalCard, TypicalMonth, riskOf, useAccountExtras } from "@/components/stress/parts";

/** Customer Plan: build a safety net with Tangerine Goals + the Automatic Savings Program. */
export default function PlanPage() {
  const allowed = useRoleGate("customer");
  const accountId = useAccount();
  const s = useSummary(accountId);
  const { draft } = useGoalDraft(accountId);
  const { goal, obl } = useAccountExtras(accountId);
  if (!allowed) return null;
  const j = s.data?.judging;
  const risk = riskOf(j, obl.data);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="large-title">Plan</h1>
        <p className="mt-1 text-[15px] text-ink-3">Build an emergency fund using your current goal and account history.</p>
      </div>
      {s.error && <ErrorState error={s.error} />}
      <Link href="/recovery?tab=goal" className="inline-flex min-h-11 items-center rounded-full bg-cream px-4 text-sm font-medium text-ink">Adjust goal settings</Link>
      {goal.error && <ErrorState error={goal.error} />}
      <GoalCard g={goal.data} j={j} mode="customer" risk={risk} />
      {j ? <Disclosure title="Your typical month"><TypicalMonth j={j} mode="customer" /><p className="mt-2 text-[12px] text-ink-3">Typical = the middle value of your past months, so one unusual month doesn&apos;t skew it.</p></Disclosure>
        : <Skeleton className="h-12 rounded-2xl shadow-card" />}
      <Disclosure title="Explain this plan"><AIInsightCard key={JSON.stringify(draft)} endpoint="/ai/explain-plan" kind="plan" body={{ account_id: accountId, plan_type: "goal", goal: goalRequest(draft) }} /></Disclosure>
      <Glossary />
    </div>
  );
}
