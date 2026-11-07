"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RefreshCw, Search, Sparkles } from "lucide-react";
import type { NewsEvent } from "@clementiq/shared-types";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useAccount, useEvents, useIndicators, useRefreshWorld, useSources } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { EmptyState, ErrorState, Skeleton, Spinner } from "@/components/ui/misc";
import { NeedAccount, PageHeader } from "@/components/layout/PageKit";
import { DataSourceStatus, EconomicIndicatorCard, EventImpactSimulator, WorldPulseNewsCard } from "@/components/world/WorldPulse";

function Research() {
  const [q, setQ] = useState("");
  const m = useMutation({ mutationFn: (question: string) => api<{ text: string | null; citations: { title: string; url: string }[]; engine: string; reason?: string }>("/worldpulse/research", { method: "POST", json: { question } }) });
  return (
    <Card>
      <CardHeader><div><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-invest" /> Gemini live research</CardTitle><CardDescription>Uses Google Search grounding when enabled (GEMINI_GROUNDING=true). Citations come from grounding metadata, never from the model’s own text.</CardDescription></div></CardHeader>
      <CardContent className="space-y-3">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim().length > 2) m.mutate(q); }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. What did the Bank of Canada decide most recently?" maxLength={500} />
          <Button type="submit" disabled={m.isPending}>{m.isPending ? <Spinner /> : <Search />} Research</Button>
        </form>
        {m.data && (m.data.text ? <>
          <p className="whitespace-pre-wrap text-sm">{m.data.text}</p>
          <ul className="space-y-0.5 text-xs">{m.data.citations.map((c, i) => <li key={i}>[{i + 1}] <a href={c.url} target="_blank" rel="noopener noreferrer" className="underline">{c.title}</a></li>)}</ul>
        </> : <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">Live research unavailable: {m.data.reason}. WorldPulse still uses the scheduled official-statistics and news retrieval.</p>)}
        {m.error && <ErrorState error={m.error} />}
      </CardContent>
    </Card>
  );
}

export default function WorldPulsePage() {
  const accountId = useAccount();
  const params = useSearchParams();
  const router = useRouter();
  const [topic, setTopic] = useState(params.get("topic") ?? "");
  const [cls, setCls] = useState("");
  const events = useEvents(topic || undefined, cls || undefined);
  const indicators = useIndicators();
  const sources = useSources();
  const refresh = useRefreshWorld();
  const tab = params.get("tab") ?? (params.get("event") || params.get("magnitude") ? "impact" : "news");
  const eventId = params.get("event");
  const ev = useQuery({ queryKey: ["event", eventId], queryFn: () => api<NewsEvent & { suggested_magnitude: number | null }>(`/worldpulse/events/${eventId}`), enabled: !!eventId });
  const [sim, setSim] = useState<{ topic: string; magnitude: number; event?: NewsEvent | null } | null>(null);
  const simRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ev.data) setSim({ topic: ev.data.topic, magnitude: Number(params.get("magnitude")) || ev.data.suggested_magnitude || (ev.data.topic === "interest_rate" ? 0.25 : 10), event: ev.data });
    else if (!eventId && params.get("topic") && params.get("magnitude")) setSim({ topic: params.get("topic")!, magnitude: Number(params.get("magnitude")) });
  }, [ev.data, eventId, params]);

  const setTab = (v: string) => { const p = new URLSearchParams(params.toString()); p.set("tab", v); router.replace(`/worldpulse?${p}`); };
  const simulate = (e: NewsEvent) => { setSim({ topic: e.topic, magnitude: e.topic === "interest_rate" ? 0.25 : 10, event: e }); setTab("impact"); setTimeout(() => simRef.current?.scrollIntoView({ behavior: "smooth" }), 50); };

  return (
    <div className="space-y-6">
      <PageHeader title="WorldPulse" subtitle="Global economic & geopolitical intelligence → transparent personal impact. Politically neutral: we explain transmission mechanisms, not policy merits."
        right={<Button onClick={() => refresh.mutate()} disabled={refresh.isPending}>{refresh.isPending ? <Spinner /> : <RefreshCw />} Refresh World Intelligence</Button>} />
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
        <span>Most recent successful update: <b className="text-ink">{events.data?.last_successful_update ? dateTime(events.data.last_successful_update) : "never"}</b></span>
        {refresh.data && <Badge tone={refresh.data.status === "success" ? "good" : "bad"}>refresh {refresh.data.status}</Badge>}
        {refresh.error && <Badge tone="bad">{(refresh.error as Error).message}</Badge>}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4"><TabsTrigger value="news">Developments</TabsTrigger><TabsTrigger value="indicators">Indicators</TabsTrigger><TabsTrigger value="impact">Impact simulator</TabsTrigger><TabsTrigger value="research">Research</TabsTrigger></TabsList>

        <TabsContent value="news">
          <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Select aria-label="Topic" className="h-9 w-56 text-xs" value={topic} onChange={(e) => setTopic(e.target.value)}>
                  <option value="">All topics</option>{Object.entries(events.data?.topics ?? {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
                <Select aria-label="Classification" className="h-9 w-48 text-xs" value={cls} onChange={(e) => setCls(e.target.value)}>
                  <option value="">Facts, forecasts & opinions</option><option value="confirmed">Confirmed (official)</option><option value="reported">Reported</option><option value="forecast">Forecasts</option><option value="opinion">Opinion</option>
                </Select>
              </div>
              {events.error && <ErrorState error={events.error} />}
              {events.isLoading && <Skeleton className="h-60" />}
              {events.data && !events.data.items.length && (
                <EmptyState title="No verified developments yet">{events.data.empty_reason}</EmptyState>
              )}
              <div className="grid gap-3 lg:grid-cols-2">{events.data?.items.map((e) => <WorldPulseNewsCard key={e.id} e={e} onSimulate={accountId ? simulate : undefined} />)}</div>
            </div>
            <div className="space-y-4">
              <Card><CardHeader><div><CardTitle>Data sources</CardTitle><CardDescription>Freshness of every provider</CardDescription></div></CardHeader>
                <CardContent>{sources.data ? <DataSourceStatus sources={sources.data.sources} monitoring={sources.data.monitoring} /> : <Skeleton className="h-32" />}</CardContent></Card>
              <Card><CardHeader><div><CardTitle>What-if starters</CardTitle><CardDescription>Hypothetical — not news</CardDescription></div></CardHeader>
                <CardContent className="space-y-1.5">{events.data?.hypothetical_templates.map((h) => (
                  <button key={h.id} disabled={!accountId} onClick={() => { setSim({ topic: h.topic, magnitude: h.magnitude, event: null }); setTab("impact"); }}
                    className="block w-full cursor-pointer rounded-xl border border-dashed border-line px-3 py-2 text-left text-xs hover:border-tangerine disabled:opacity-50">{h.title}</button>
                ))}</CardContent></Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="indicators">
          {indicators.isLoading && <Skeleton className="h-40" />}
          {indicators.data && !indicators.data.items.length && <EmptyState title="No indicators retrieved yet">Press “Refresh World Intelligence” to pull Bank of Canada, Statistics Canada and World Bank data.</EmptyState>}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{indicators.data?.items.map((i) => <EconomicIndicatorCard key={i.id} i={i} />)}</div>
        </TabsContent>

        <TabsContent value="impact">
          <div ref={simRef}>
            {!accountId ? <NeedAccount /> : events.data && <EventImpactSimulator key={JSON.stringify(sim)} accountId={accountId} topics={events.data.topics} initial={sim ?? undefined} />}
          </div>
        </TabsContent>

        <TabsContent value="research"><Research /></TabsContent>
      </Tabs>
    </div>
  );
}
