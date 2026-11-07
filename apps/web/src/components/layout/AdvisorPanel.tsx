"use client";
import Link from "next/link";
import { ArrowRight, ChevronRight, PanelRightClose, PanelRightOpen, Sparkles } from "lucide-react";
import { useAlerts, useSummary } from "@/lib/hooks";
import { money } from "@/lib/format";
import { useSession } from "@/lib/store";
import { GeminiChatPanel } from "@/components/ai/GeminiChatPanel";
import { SeverityBadge } from "@/components/alerts/SeverityBadge";

/** Persistent right-hand AI Financial Advisor panel (desktop). Next actions are computed by Clement Core. */
export function AdvisorPanel() {
  const accountId = useSession((s) => s.accountId);
  const open = useSession((s) => s.advisorOpen);
  const setOpen = useSession((s) => s.setAdvisorOpen);
  const summary = useSummary(accountId);
  const alerts = useAlerts({ unread: true, limit: 3 });

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label="Open AI advisor" className="sticky top-20 hidden h-10 cursor-pointer items-center gap-1 self-start rounded-l-xl bg-tangerine px-2 text-white xl:flex">
        <PanelRightOpen className="size-4" />
      </button>
    );
  }

  const s = summary.data;
  const actions: { text: string; href: string }[] = [];
  if (s) {
    const rw = s.judging.runway;
    if (!rw.no_shortfall) actions.push({ text: `Close a ${money(s.judging.S - s.judging.I)}/month gap`, href: "/recovery?tab=backup" });
    if ((s.metrics.emergency_fund_progress ?? 1) < 1) actions.push({ text: `Build a ${money(s.metrics.emergency_fund_target_3m)} emergency fund`, href: "/recovery" });
    actions.push({ text: "Test a job loss with EI at 55%", href: "/simulator?preset=ei55_6m" });
    actions.push({ text: "See how world events reach your budget", href: "/worldpulse" });
  }

  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-[340px] shrink-0 flex-col gap-3 overflow-hidden border-l border-line bg-surface p-4 xl:flex" aria-label="AI Financial Advisor">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-tangerine text-white"><Sparkles className="size-4" /></span>
          <div><p className="text-sm font-semibold">AI Financial Advisor</p><p className="text-[10px] text-ink-2">Clement Gemini · grounded in Clement Core</p></div>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Collapse advisor" className="cursor-pointer rounded-lg p-1.5 text-ink-2 hover:bg-peach"><PanelRightClose className="size-4" /></button>
      </div>
      <div className="rounded-2xl peach-gradient p-3 text-xs text-ink">
        {s ? <>Hi! For account <b>#{s.account_id}</b>, the buffer covers <b>{s.judging.runway.display}</b> {s.judging.runway.no_shortfall ? "" : "months"} at typical spending. Here’s what I’d look at next:</>
           : "Select an account to get personalised guidance."}
      </div>
      {actions.length > 0 && (
        <ul className="space-y-1">{actions.slice(0, 3).map((a) => (
          <li key={a.href}><Link href={a.href} className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium hover:bg-peach">{a.text}<ChevronRight className="size-3.5 text-ink-3" /></Link></li>
        ))}</ul>
      )}
      {!!alerts.data?.items.length && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">Recent risk alerts</p>
          {alerts.data.items.map((a) => (
            <Link key={a.id} href={a.simulation_link || "/alerts"} className="block rounded-xl border border-line p-2.5 hover:border-tangerine">
              <div className="flex items-center justify-between gap-2"><p className="line-clamp-1 text-xs font-semibold">{a.title}</p><SeverityBadge s={a.severity} /></div>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-2">{a.explanation || a.relevance}</p>
            </Link>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1"><GeminiChatPanel accountId={accountId} compact /></div>
      <Link href="/advisor" className="flex items-center justify-center gap-1 text-xs font-semibold text-tangerine hover:underline">Open full AI Advisor <ArrowRight className="size-3.5" /></Link>
    </aside>
  );
}
