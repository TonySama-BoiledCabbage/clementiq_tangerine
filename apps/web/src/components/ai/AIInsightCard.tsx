"use client";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import type { AIResult } from "@clementiq/shared-types";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState, Spinner } from "@/components/ui/misc";
import { EngineBadge } from "@/components/finance/EngineBadge";

interface ScenarioExplanation {
  headline: string; what_happened: string; why_it_matters: string; affected_categories: string[]; what_the_numbers_show: string;
  options: { action: string; rationale: string }[]; confidence: string; uncertainty: string;
}
interface PlanExplanation { summary: string; key_steps: string[]; encouragement: string; caveats: string }

/** On-demand Gemini explanation. Numbers in the text are checked against Clement Core output server-side. */
export function AIInsightCard({ title = "Explain with Clement Gemini", endpoint, body, kind }: {
  title?: string; endpoint: string; body: unknown; kind: "scenario" | "plan";
}) {
  const m = useMutation({ mutationFn: () => api<AIResult<ScenarioExplanation & PlanExplanation> & { explanation?: AIResult<ScenarioExplanation & PlanExplanation> }>(endpoint, { method: "POST", json: body }) });
  const res = m.data?.explanation ?? m.data;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-gradient-to-r from-violet-50 to-peach px-4 py-3 dark:from-violet-950/40">
        <div className="flex items-center gap-2"><Sparkles className="size-4 text-invest" /><p className="text-sm font-semibold">{title}</p></div>
        <Button size="sm" variant="outline" onClick={() => m.mutate()} disabled={m.isPending || !!res}>{m.isPending ? <Spinner /> : null}{res ? "Explanation ready" : "Explain"}</Button>
      </div>
      <div className="space-y-3 p-4 text-sm">
        {m.isError && <ErrorState error={m.error} retry={() => m.mutate()} />}
        {!res && !m.isPending && !m.isError && <p className="text-xs text-ink-2">Get a plain-language explanation of these results. Gemini only sees rounded summaries — never your account ID or personal details.</p>}
        {res && (
          <>
            <div className="flex flex-wrap items-center gap-2"><EngineBadge engine={res.engine} />{res.model && <span className="text-[10px] text-ink-3">{res.model}</span>}
              {res.fallback_reason && <span className="text-[10px] text-ink-3" title={res.fallback_reason}>Gemini unavailable — template used</span>}</div>
            {kind === "scenario" ? (
              <>
                <p className="font-semibold">{res.content.headline}</p>
                <p><b className="text-xs uppercase text-ink-2">What happened</b><br />{res.content.what_happened}</p>
                <p><b className="text-xs uppercase text-ink-2">Why it matters</b><br />{res.content.why_it_matters}</p>
                <p><b className="text-xs uppercase text-ink-2">What the numbers show</b><br />{res.content.what_the_numbers_show}</p>
                {res.content.options?.length > 0 && <ul className="space-y-1.5">{res.content.options.map((o, i) => <li key={i} className="rounded-xl bg-cream p-2"><b>{o.action}</b><span className="block text-xs text-ink-2">{o.rationale}</span></li>)}</ul>}
                <p className="text-xs text-ink-2"><b>Confidence:</b> {res.content.confidence} · {res.content.uncertainty}</p>
              </>
            ) : (
              <>
                <p>{res.content.summary}</p>
                <ol className="list-decimal space-y-1 pl-5">{res.content.key_steps?.map((s, i) => <li key={i}>{s}</li>)}</ol>
                <p className="text-xs text-ink-2">{res.content.encouragement} {res.content.caveats}</p>
              </>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
