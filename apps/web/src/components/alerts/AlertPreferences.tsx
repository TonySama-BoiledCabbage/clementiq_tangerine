"use client";
import { useEffect, useState } from "react";
import { useSaveSettings, useSettings, type SettingsResponse } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { Skeleton, Spinner } from "@/components/ui/misc";
import { ShockParameterSlider } from "@/components/finance/Shock";

const CAT_LABEL: Record<string, string> = { financial_health: "Financial health", global_events: "Global events", investments: "Investments", crypto: "Cryptocurrency", loan_exposure: "Loan exposure", savings_goals: "Savings goals" };
const INTERESTS = ["inflation", "interest_rate", "energy", "employment", "tariffs", "housing", "fx", "food", "market_volatility", "crypto_regulation"];

export function AlertPreferences() {
  const s = useSettings();
  const save = useSaveSettings();
  const [p, setP] = useState<SettingsResponse["preferences"] | null>(null);
  useEffect(() => { if (s.data) setP(s.data.preferences); }, [s.data]);
  if (!p) return <Skeleton className="h-64" />;
  const a = p.alerts;
  const setA = (patch: Partial<typeof a>) => setP({ ...p, alerts: { ...a, ...patch } });

  const requestPush = async (on: boolean) => {
    if (on && typeof Notification !== "undefined" && Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
    }
    setP({ ...p, channels: { ...p.channels, browser_push: { opt_in: on } } });
  };

  return (
    <div className="space-y-5">
      <label className="flex items-center justify-between gap-3 text-sm font-semibold">Alerts enabled <Switch checked={a.enabled} onCheckedChange={(v) => setA({ enabled: v })} /></label>
      <div><p className="mb-2 text-xs font-semibold text-ink-2">Categories</p>
        <div className="grid gap-2 sm:grid-cols-2">{Object.keys(CAT_LABEL).map((k) => (
          <label key={k} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm">{CAT_LABEL[k]}<Switch checked={a.categories[k] ?? true} onCheckedChange={(v) => setA({ categories: { ...a.categories, [k]: v } })} /></label>
        ))}</div></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="sev">Minimum severity</Label><Select id="sev" value={a.min_severity} onChange={(e) => setA({ min_severity: e.target.value as "low" | "medium" | "high" })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></Select></div>
        <ShockParameterSlider label="Max alerts per day" unit="/day" value={a.max_per_day} min={0} max={20} onChange={(v) => setA({ max_per_day: v })} hint="frequency limit" />
        <ShockParameterSlider label="Relevance threshold" unit="pts" value={a.relevance_threshold} min={0} max={100} onChange={(v) => setA({ relevance_threshold: v })} hint="0–100 deterministic score" />
        <ShockParameterSlider label="Runway alert threshold" unit="months" value={a.runway_threshold_months} min={0} max={24} onChange={(v) => setA({ runway_threshold_months: v })} />
      </div>
      <div className="rounded-2xl border border-line p-3">
        <label className="flex items-center justify-between text-sm font-semibold">Quiet hours (outbound only)<Switch checked={a.quiet_hours.enabled} onCheckedChange={(v) => setA({ quiet_hours: { ...a.quiet_hours, enabled: v } })} /></label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div><Label htmlFor="qs">From</Label><Input id="qs" type="time" value={a.quiet_hours.start} onChange={(e) => setA({ quiet_hours: { ...a.quiet_hours, start: e.target.value } })} /></div>
          <div><Label htmlFor="qe">To</Label><Input id="qe" type="time" value={a.quiet_hours.end} onChange={(e) => setA({ quiet_hours: { ...a.quiet_hours, end: e.target.value } })} /></div>
        </div>
      </div>
      <div className="rounded-2xl border border-line p-3 space-y-3">
        <p className="text-sm font-semibold">Outbound channels <span className="text-xs font-normal text-ink-2">(opt-in · in-app is always on)</span></p>
        <label className="flex items-center justify-between text-sm">Email alerts<Switch checked={p.channels.email.opt_in} onCheckedChange={(v) => setP({ ...p, channels: { ...p.channels, email: { ...p.channels.email, opt_in: v } } })} /></label>
        {p.channels.email.opt_in && <Input type="email" placeholder="you@example.com" value={p.channels.email.address ?? ""} onChange={(e) => setP({ ...p, channels: { ...p.channels, email: { ...p.channels.email, address: e.target.value } } })} />}
        <label className="flex items-center justify-between text-sm">Browser notifications<Switch checked={p.channels.browser_push.opt_in} onCheckedChange={requestPush} /></label>
        <p className="text-[0.6875rem] text-ink-3">Email is sent only when SMTP is configured on the server. Turn either switch off at any time to unsubscribe.</p>
      </div>
      <div><p className="mb-2 text-xs font-semibold text-ink-2">Topics I care about (raises relevance)</p>
        <div className="flex flex-wrap gap-1.5">{INTERESTS.map((t) => { const on = p.interests.includes(t); return (
          <button key={t} aria-pressed={on} onClick={() => setP({ ...p, interests: on ? p.interests.filter((x) => x !== t) : [...p.interests, t] })}
            className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${on ? "border-tangerine bg-peach text-tangerine" : "border-line text-ink-2"}`}>{t.replace(/_/g, " ")}</button>); })}</div>
        <p className="mt-1 text-[0.6875rem] text-ink-3">Political views are never inferred or used for targeting.</p></div>
      <Button onClick={() => save.mutate({ alerts: p.alerts, channels: p.channels, interests: p.interests })} disabled={save.isPending}>{save.isPending && <Spinner />} Save preferences</Button>
      {save.isSuccess && <span className="ml-2 text-xs text-good">Saved ✓</span>}
      {save.error && <p className="text-xs text-bad">{(save.error as Error).message}</p>}
    </div>
  );
}
