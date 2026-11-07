"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MapPin, RefreshCw } from "lucide-react";
import type { NewsEvent } from "@clementiq/shared-types";
import { api } from "@/lib/api";
import { date } from "@/lib/format";
import { useRefreshWorld, useSettings } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton, Spinner } from "@/components/ui/misc";
import { PageHeader } from "@/components/layout/PageKit";
import { GlobalEventsMap } from "@/components/world/GlobalEventsMap";

interface MapMarker {
  iso3: string; name: string; capital: string | null; lat: number; lon: number; region: string | null; event_count: number;
  events: NewsEvent[]; topics: string[];
  indicators: { name: string; topic: string; unit: string; latest: { date: string; value: number }; source: string; source_url: string }[];
}

export default function MapPage() {
  const q = useQuery({ queryKey: ["map"], queryFn: () => api<{ markers: MapMarker[]; coordinate_source: string; note: string }>("/worldpulse/map") });
  const settings = useSettings();
  const refresh = useRefreshWorld();
  const [sel, setSel] = useState<string | null>(null);
  const markers = q.data?.markers ?? [];
  const m = markers.find((x) => x.iso3 === sel);
  return (
    <div className="space-y-6">
      <PageHeader title="Global Event Map" subtitle="Where verified developments were reported or measured. Select a country to explore."
        right={<Button variant="outline" onClick={() => refresh.mutate(undefined, { onSuccess: () => q.refetch() })} disabled={refresh.isPending}>{refresh.isPending ? <Spinner /> : <RefreshCw />} Refresh</Button>} />
      {q.error && <ErrorState error={q.error} retry={q.refetch} />}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden p-2">
          {q.isLoading ? <Skeleton className="h-[420px]" /> : markers.length ? (
            <GlobalEventsMap markers={markers.map((x) => ({ iso3: x.iso3, name: x.name, lat: x.lat, lon: x.lon, count: x.event_count, hasIndicators: x.indicators.length > 0 }))}
              selected={sel} onSelect={setSel} prefer3d={settings.data?.preferences.display.enable_3d ?? true} />
          ) : <div className="p-6"><EmptyState icon={MapPin} title="No located developments yet">Markers appear after WorldPulse retrieves data. Coordinates come only from the World Bank country API — never invented.</EmptyState></div>}
          <p className="px-3 pb-2 pt-1 text-[11px] text-ink-3">{q.data?.coordinate_source} · {q.data?.note} · <span className="text-tangerine">●</span> events <span className="text-invest">●</span> indicators only</p>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>{m ? `${m.name}` : "Select a country"}</CardTitle><CardDescription>{m ? `${m.region ?? ""} · capital ${m.capital ?? "—"}` : "Click a marker on the globe or choose below"}</CardDescription></div></CardHeader>
          <CardContent className="space-y-3">
            {!m && <div className="flex flex-wrap gap-1.5">{markers.map((x) => <button key={x.iso3} onClick={() => setSel(x.iso3)} className="cursor-pointer rounded-full border border-line px-2.5 py-1 text-xs hover:border-tangerine">{x.name} ({x.event_count})</button>)}</div>}
            {m && <>
              {m.indicators.length > 0 && <div><p className="mb-1 text-xs font-semibold text-ink-2">Latest indicators</p><ul className="space-y-1">{m.indicators.map((i) => (
                <li key={i.name} className="flex justify-between gap-2 text-xs"><a href={i.source_url} target="_blank" rel="noopener noreferrer" className="hover:text-tangerine">{i.name}</a><span className="tabular font-semibold">{i.latest.value.toLocaleString("en-CA", { maximumFractionDigits: 2 })} {i.unit} <span className="font-normal text-ink-3">({i.latest.date.slice(0, 4)})</span></span></li>
              ))}</ul></div>}
              <div><p className="mb-1 text-xs font-semibold text-ink-2">Developments ({m.event_count})</p>
                <ul className="max-h-96 space-y-2 overflow-y-auto">{m.events.map((e) => (
                  <li key={e.id} className="rounded-xl border border-line p-2.5">
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold hover:text-tangerine">{e.headline}</a>
                    <p className="text-[10px] text-ink-2">{e.source_name} · {date(e.published_at)} · {e.location_basis}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1"><Badge tone="orange">{e.topic_label}</Badge>{e.exposure_categories.slice(0, 3).map((c) => <Badge key={c}>{c.replace(/_/g, " ")}</Badge>)}</div>
                    <Button asChild size="sm" variant="secondary" className="mt-2"><Link href={`/worldpulse?event=${e.id}&topic=${e.topic}`}>Simulate scenario</Link></Button>
                  </li>
                ))}</ul>
                {!m.events.length && <p className="text-xs text-ink-3">No news events for this country — indicators only.</p>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSel(null)}>← All countries</Button>
            </>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
