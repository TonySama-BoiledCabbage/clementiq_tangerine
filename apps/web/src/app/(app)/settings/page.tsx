"use client";
import { CheckCircle2, CircleSlash } from "lucide-react";
import { useSaveSettings, useSettings, useSources } from "@/lib/hooks";
import { useSession } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/misc";
import { PageHeader } from "@/components/layout/PageKit";
import { AlertPreferences } from "@/components/alerts/AlertPreferences";
import { DataSourceStatus } from "@/components/world/WorldPulse";

const INTEGRATION_LABEL: Record<string, string> = {
  gemini: "Google Gemini API", gemini_grounding: "Gemini Google Search grounding", snowflake: "Snowflake Cortex (optional)", news_api: "NewsAPI.org (optional)",
  alpha_vantage: "Alpha Vantage (optional)", email: "SMTP email delivery", worldpulse_live: "Live WorldPulse retrieval",
};

export default function SettingsPage() {
  const s = useSettings();
  const save = useSaveSettings();
  const sources = useSources();
  const { sub, role } = useSession();
  const d = s.data?.preferences.display;
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle={`Signed in as ${sub} (${role})`} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader><div><CardTitle>Alerts & notifications</CardTitle><CardDescription>Opt-in channels, quiet hours, frequency limits, unsubscribe</CardDescription></div></CardHeader><CardContent><AlertPreferences /></CardContent></Card>
        <div className="space-y-6">
          <Card><CardHeader><div><CardTitle>Display & accessibility</CardTitle></div></CardHeader>
            <CardContent className="space-y-3">
              {!d ? <Skeleton className="h-16" /> : <>
                <label className="flex items-center justify-between text-sm">Enable 3D visualisations<Switch checked={d.enable_3d} onCheckedChange={(v) => save.mutate({ display: { ...d, enable_3d: v } })} /></label>
                <label className="flex items-center justify-between text-sm">Reduced motion<Switch checked={d.reduced_motion} onCheckedChange={(v) => save.mutate({ display: { ...d, reduced_motion: v } })} /></label>
                <p className="text-[11px] text-ink-3">Your OS “reduce motion” setting is always respected; every 3D view has a 2D equivalent.</p>
              </>}
            </CardContent></Card>
          <Card><CardHeader><div><CardTitle>Integrations</CardTitle><CardDescription>Configured server-side via environment variables — keys never reach the browser</CardDescription></div></CardHeader>
            <CardContent><ul className="space-y-1.5 text-sm">{s.data && Object.entries(s.data.integrations).filter(([k]) => k in INTEGRATION_LABEL).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between">{INTEGRATION_LABEL[k]}{v ? <span className="flex items-center gap-1 text-xs text-good"><CheckCircle2 className="size-3.5" /> enabled</span> : <span className="flex items-center gap-1 text-xs text-ink-3"><CircleSlash className="size-3.5" /> not configured</span>}</li>
            ))}
            {s.data && <li className="flex items-center justify-between">Database<span className="text-xs text-ink-2">{String(s.data.integrations.database)}{s.data.integrations.gemini_model ? ` · Gemini ${s.data.integrations.gemini_model}` : ""}</span></li>}</ul></CardContent></Card>
          <Card><CardHeader><div><CardTitle>Data source status</CardTitle></div></CardHeader><CardContent>{sources.data ? <DataSourceStatus sources={sources.data.sources} monitoring={sources.data.monitoring} /> : <Skeleton className="h-24" />}</CardContent></Card>
        </div>
      </div>
    </div>
  );
}
