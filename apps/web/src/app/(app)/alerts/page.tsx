"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Check, Mail } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime, money } from "@/lib/format";
import { useAccount, useAlerts, useGenerateAlerts, useMarkAlert } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton, Spinner } from "@/components/ui/misc";
import { PageHeader } from "@/components/layout/PageKit";
import { SeverityBadge } from "@/components/alerts/SeverityBadge";
import { alertLink } from "@/components/alerts/links";
import { useSession } from "@/lib/store";
import { EngineBadge } from "@/components/finance/EngineBadge";

const FILTERS = [["", "All"], ["financial_health", "Financial health"], ["global_events", "Global events"], ["investments", "Investments"], ["crypto", "Cryptocurrency"], ["loan_exposure", "Loan exposure"], ["savings_goals", "Savings goals"]];

export default function AlertsPage() {
  const role = useSession((s) => s.role);
  const accountId = useAccount();
  const [cat, setCat] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const alerts = useAlerts({ category: cat || undefined, unread: unreadOnly ? true : undefined, limit: 100 });
  const mark = useMarkAlert();
  const gen = useGenerateAlerts();
  const history = useQuery({ queryKey: ["alert-history", gen.data], enabled: role === "admin", queryFn: () => api<{ items: { run_at: string; account_id: number; candidates: number; created: number; suppressed: Record<string, number> }[] }>("/alerts/history") });

  return (
    <div className="space-y-6">
      <PageHeader title="Alerts & Notifications" subtitle="Proactive, deterministic alerts — based on recorded data and transparent rules"
        right={accountId ? <Button onClick={() => gen.mutate(accountId)} disabled={gen.isPending}>{gen.isPending ? <Spinner /> : <BellRing />} Check for new alerts</Button> : undefined} />
      {gen.data && <p className="text-xs text-ink-2">Run complete: {gen.data.candidates} candidates → {gen.data.created} new alerts · suppressed {Object.entries(gen.data.suppressed).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}</p>}
      {gen.error && <ErrorState error={gen.error} />}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map(([k, v]) => <button key={k} onClick={() => setCat(k)} aria-pressed={cat === k} className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium ${cat === k ? "border-tangerine bg-peach text-tangerine" : "border-line text-ink-2"}`}>{v}</button>)}
            <label className="ml-auto flex items-center gap-1.5 text-xs"><input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> Unread only</label>
          </div>
          {alerts.isLoading && <Skeleton className="h-40" />}
          {alerts.data && !alerts.data.items.length && <EmptyState icon={BellRing} title="No alerts">Press “Check for new alerts” to run the pipeline for the selected account. The worker also runs it on a schedule for watched accounts.</EmptyState>}
          {alerts.data?.items.map((a) => (
            <Card key={a.id} className={`p-4 ${a.is_read ? "opacity-80" : "border-l-4 border-l-tangerine"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><p className="font-semibold">{a.title}</p><p className="text-[11px] text-ink-2">{a.source} · {a.event_timestamp ? `event ${dateTime(a.event_timestamp)} · ` : ""}created {dateTime(a.created_at)}</p></div>
                <div className="flex items-center gap-1.5"><SeverityBadge s={a.severity} /><Badge>{a.category.replace(/_/g, " ")}</Badge></div>
              </div>
              <p className="mt-2 text-sm">{a.relevance}</p>
              {a.explanation && <div className="mt-2 rounded-xl bg-cream p-2.5 text-xs"><EngineBadge engine={a.explanation_engine ?? "clement-core-template"} /> <span className="ml-1">{a.explanation}</span></div>}
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                <p><span className="text-ink-3">Modeled impact:</span> {typeof a.modeled_impact.monthly_change === "number" ? `${money(a.modeled_impact.monthly_change as number)}/mo` : (a.modeled_impact.runway as string) ?? "—"}{a.modeled_impact.magnitude_basis ? ` (${a.modeled_impact.magnitude_basis})` : ""}</p>
                <p><span className="text-ink-3">Confidence:</span> {a.confidence}</p>
                <p title={JSON.stringify(a.score_breakdown)}><span className="text-ink-3">Relevance score:</span> {a.relevance_score.toFixed(0)}/100</p>
              </div>
              <p className="mt-1 text-xs"><span className="text-ink-3">Suggested:</span> {a.suggested_action}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {a.simulation_link && <Button asChild size="sm" variant="secondary"><Link href={alertLink(a, role)} onClick={() => !a.is_read && mark.mutate({ id: a.id, is_read: true })}>Open simulation</Link></Button>}
                <Button size="sm" variant="ghost" onClick={() => mark.mutate({ id: a.id, is_read: !a.is_read })}><Check /> Mark {a.is_read ? "unread" : "read"}</Button>
                {a.delivered_channels.includes("email") && <span className="flex items-center gap-1 text-[11px] text-ink-3"><Mail className="size-3" /> emailed</span>}
              </div>
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          <Card><CardHeader><div><CardTitle>Alert preferences</CardTitle><CardDescription>You control what, when and how often</CardDescription></div></CardHeader><CardContent><Link href="/settings" className="inline-flex min-h-11 items-center text-sm font-medium text-tangerine">Manage notification preferences</Link></CardContent></Card>
          {role === "admin" && <Card><CardHeader><div><CardTitle>Generation history</CardTitle><CardDescription>Audit trail of every alert run</CardDescription></div></CardHeader>
            <CardContent><ul className="space-y-1 text-[11px]">{history.data?.items.map((h, i) => <li key={i} className="flex justify-between border-t border-line py-1"><span>{dateTime(h.run_at)} · #{h.account_id}</span><span className="text-ink-2">{h.candidates}→{h.created}</span></li>)}</ul>
              {!history.data?.items.length && <p className="text-xs text-ink-3">No runs yet.</p>}</CardContent></Card>}
        </div>
      </div>
    </div>
  );
}
