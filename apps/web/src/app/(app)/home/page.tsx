"use client";
import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { useAccount, useSummary } from "@/lib/hooks";
import { ErrorState, Skeleton } from "@/components/ui/misc";
import { useRoleGate } from "@/components/layout/useRoleGate";
import { GoalCard, NowCard, Note, edgeCases, ei55Runway, riskOf, useAccountExtras } from "@/components/stress/parts";

/**
 * Customer Home: "am I OK this month?" first.
 * Stable → one calm line (details folded). At risk → the payments and the loan, expanded.
 * Then the safety net, then a nudge to try "What if" when savings are fragile.
 */
export default function HomePage() {
  const allowed = useRoleGate("customer");
  const accountId = useAccount();
  const s = useSummary(accountId);
  const { goal, obl } = useAccountExtras(accountId);
  if (!allowed) return null;
  const j = s.data?.judging;
  const risk = riskOf(j, obl.data);
  const ei = j ? ei55Runway(j) : null;
  const fragile = !!j && j.S > 0 && ei != null && ei < 6;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="large-title">Home</h1>
        <p className="mt-1 text-[15px] text-ink-3">Here&apos;s where your money stands this month.</p>
      </div>
      {s.error && <ErrorState error={s.error} />}
      {obl.data ? <NowCard o={obl.data} j={j} risk={risk} mode="customer" compact />
        : obl.error ? <ErrorState error={obl.error} /> : <Skeleton className="h-40 rounded-2xl shadow-card" />}
      {goal.error && <ErrorState error={goal.error} />}
      <GoalCard g={goal.data} j={j} mode="customer" risk={risk} summary />
      {fragile && (
        <Link href="/what-if?scenario=ei55_6m" className="flex items-center gap-4 rounded-2xl shadow-card bg-surface p-5 active:bg-press">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warn-bg text-warn"><ShieldAlert className="size-5" aria-hidden /></span>
          <span className="flex-1 text-[15px] leading-relaxed">
            <b className="block">If you lost your job, your savings would last about {ei!.toFixed(ei! < 1 ? 1 : 0)} month{ei! >= 1.5 ? "s" : ""}.</b>
            <span className="text-ink-3">See what would happen and what to do first.</span>
          </span>
          <ArrowRight className="size-5 shrink-0 text-tangerine" aria-hidden />
        </Link>
      )}
      {j && edgeCases(j, "customer").map((e) => <Note key={e.text} tone={e.tone}>{e.text}</Note>)}
      <p className="px-1 text-[12px] leading-relaxed text-ink-3">Educational guidance from your own account history, not financial advice.</p>
    </div>
  );
}
