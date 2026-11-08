"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Gavel, Info, Lock, Move, Sprout } from "lucide-react";
import { DEFAULT_DASHBOARD, homeFeatures, reorderedIds, toggledFavorites } from "@/lib/features";
import { DECORATIVE_GROWTH, growthFromSummary } from "@/lib/growth";
import { DEFAULT_APPEARANCE, useAccount, useMe, useSettings, useSummary, useUpdatePrefs } from "@/lib/hooks";
import { useMediaUrl, useProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { OrchardScene } from "@/components/orchard/OrchardScene";
import { FeatureGrid, type Density } from "@/components/home/FeatureCard";
import { HomeTopBar } from "@/components/layout/AppChrome";
import { AccountSearch } from "@/components/layout/CustomerSelector";
import type { CharacterMode } from "@/components/orchard/OrchardCharacter";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const DENSITIES: { id: Density; label: string }[] = [{ id: "minimal", label: "Minimal" }, { id: "balanced", label: "Balanced" }, { id: "compact", label: "Compact" }];

/** Celebrates when the emergency-fund milestone (25/50/75/100%) rises since the last visit. */
function useMilestoneCelebration(accountId: number | null, milestone: number, hasData: boolean) {
  const [celebrate, setCelebrate] = useState<string | null>(null);
  useEffect(() => {
    if (!accountId || !hasData) return;
    const key = `ciq-milestone-${accountId}`;
    let prev: number | null = null;
    try { const v = localStorage.getItem(key); prev = v === null ? null : Number(v); localStorage.setItem(key, String(milestone)); } catch { /* storage unavailable */ }
    if (prev !== null && milestone > prev && milestone > 0) {
      setCelebrate(milestone >= 4 ? "Emergency fund goal reached — a golden tangerine is growing! 🎉" : `Milestone reached: ${milestone * 25}% of your emergency fund 🎉`);
      const t = setTimeout(() => setCelebrate(null), 5000);
      return () => clearTimeout(t);
    }
  }, [accountId, milestone, hasData]);
  return celebrate;
}

export default function HomePage() {
  const me = useMe();
  const role = me.data?.role ?? null;   // server-verified role
  const accountId = useAccount();
  const settings = useSettings();
  const update = useUpdatePrefs();
  const profile = useProfile();
  const summary = useSummary(accountId);
  const [arranging, setArranging] = useState(false);
  const [showGrowth, setShowGrowth] = useState(false);

  const prefs = settings.data?.preferences;
  const dash = prefs?.dashboard ?? DEFAULT_DASHBOARD;
  const appearance = { ...DEFAULT_APPEARANCE, ...(prefs?.appearance ?? {}) };
  // Which figure sits in the orchard: default, the user's photo as a portrait, or their generated character.
  const mode: CharacterMode = prefs?.avatar?.character
    ?? (prefs?.avatar?.personalized_enabled && profile.data?.avatar ? "generated" : "default");
  const photoUrl = useMediaUrl("photo", mode === "photo" ? profile.data?.photo?.version : null);
  const avatarUrl = useMediaUrl("avatar", mode === "generated" ? profile.data?.avatar?.version : null);
  const character = { mode, url: mode === "photo" ? photoUrl : mode === "generated" ? avatarUrl : null,
                      transparent: !!profile.data?.avatar?.transparent };
  const growth = useMemo(() => (appearance.growth_visuals ? growthFromSummary(summary.data) : DECORATIVE_GROWTH),
    [appearance.growth_visuals, summary.data]);
  const celebrate = useMilestoneCelebration(accountId, growth.milestone, growth.data && appearance.growth_visuals);
  const features = homeFeatures(dash, role);
  const name = profile.data?.display_name;

  return (
    <div className="pb-16">
      <OrchardScene appearance={appearance} growth={growth} character={character} celebrate={!!celebrate} className="h-[700px] sm:h-[600px] lg:h-[580px]">
        <HomeTopBar />
        {me.data?.entitlements.account_search && (
          <div className="relative z-20 mx-auto mt-3 max-w-[1500px] px-4 sm:px-8">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-white bg-white/95 p-3 shadow-lg dark:border-white/10 dark:bg-[#241c16]/95" role="region" aria-label="Judge tools">
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-ink"><Gavel className="size-4 text-tangerine" /> Judge tools</span>
              <AccountSearch className="w-full sm:w-auto sm:flex-1" />
              {me.data.entitlements.judge_demo && (
                <Link href="/judge" className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-tangerine px-4 text-sm font-semibold text-white shadow-sm hover:brightness-105 sm:w-auto">Open Judge Demo</Link>
              )}
            </div>
          </div>
        )}
        <div className="relative mx-auto flex max-w-[1500px] justify-end px-4 pt-5 sm:px-8 md:pt-6">
          <section className="glass w-full max-w-xl rounded-[28px] p-5 shadow-lg sm:p-7 md:w-[52%]" aria-labelledby="hero-title">
            <p className="text-base font-semibold text-ink-2">{greeting()}{name ? `, ${name}` : ""} 👋</p>
            <h1 id="hero-title" className="mt-1 text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-[40px]">Your financial future is growing. 🍊</h1>
            <p className="mt-2 text-lg text-ink-2">One smart decision at a time.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {me.data && !me.data.entitlements.account_search && accountId && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm"><Lock className="size-3.5" /> Your account #{accountId}</span>
              )}
              {me.data?.entitlements.account_search && accountId && <span className="inline-flex items-center rounded-full bg-white/80 px-3 py-2 text-xs font-semibold text-slate-800">Viewing account #{accountId}</span>}
              {appearance.growth_visuals && (
                <button onClick={() => setShowGrowth((v) => !v)} aria-expanded={showGrowth}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white/70 px-3 py-2 text-xs font-semibold text-ink hover:bg-white dark:bg-white/10">
                  <Sprout className="size-4 text-good" /> How your orchard grows
                </button>
              )}
            </div>
            {showGrowth && (
              <ul className="mt-3 space-y-1 rounded-2xl bg-white/70 p-3 text-xs text-ink-2 dark:bg-white/5">
                {growth.captions.map((c) => <li key={c}>{c}</li>)}
                {growth.data && <li className="pt-1 text-[11px] text-ink-3">Based on account #{accountId} (Clement Core). Setbacks never make the orchard wilt.</li>}
              </ul>
            )}
          </section>
        </div>
      </OrchardScene>

      {celebrate && (
        <div role="status" className="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-full bg-surface px-5 py-2.5 text-sm font-semibold text-ink shadow-xl ring-1 ring-line">{celebrate}</div>
      )}

      <div className="relative z-10 mx-auto -mt-24 max-w-[1500px] px-3 sm:px-6">
        <div className="glass rounded-[32px] p-4 shadow-xl ring-1 ring-white/60 sm:p-6 dark:ring-white/5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-ink">Choose a focus area</h2>
              <p className="text-xs text-ink-2">{features.length} of your tools · favorites first</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full bg-white/70 p-1 dark:bg-white/5" role="group" aria-label="Layout density">
                {DENSITIES.map((d) => (
                  <button key={d.id} aria-pressed={dash.layout_density === d.id} onClick={() => update.mutate({ dashboard: { layout_density: d.id } })}
                    className={cn("cursor-pointer rounded-full px-3 py-1 text-xs font-semibold", dash.layout_density === d.id ? "bg-tangerine text-white" : "text-ink-2")}>{d.label}</button>
                ))}
              </div>
              {features.length > 1 && (
                <Button size="sm" variant={arranging ? "default" : "outline"} onClick={() => setArranging((v) => !v)}>
                  {arranging ? <><Check /> Done</> : <><Move /> Arrange</>}
                </Button>
              )}
            </div>
          </div>
          {arranging && <p className="mb-3 flex items-center gap-1.5 text-xs text-ink-2"><Info className="size-3.5" /> Drag cards by their handle (or focus it and use the arrow keys). Favorites always stay at the front.</p>}

          {settings.isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-56 rounded-3xl" />)}</div>
          ) : features.length ? (
            <FeatureGrid features={features} density={dash.layout_density} favorites={dash.favorites} arranging={arranging}
              onToggleFavorite={(id) => update.mutate({ dashboard: { favorites: toggledFavorites(dash.favorites, id) } })}
              onReorder={(ids) => update.mutate({ dashboard: { order: reorderedIds(ids, dash, role) } })} />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-3xl peach-gradient px-6 py-14 text-center">
              <span className="text-5xl" aria-hidden>🍊</span>
              <p className="text-xl font-bold text-ink">Your financial garden is ready to grow. 🍊</p>
              <p className="max-w-md text-sm text-ink-2">You’ve hidden every tool. Nothing was deleted — pick the features you want back on your dashboard.</p>
              <Button asChild size="lg"><Link href="/settings?section=dashboard">Choose Your Features</Link></Button>
            </div>
          )}
          {update.isError && <p className="mt-3 text-xs text-bad">Couldn’t save that change — your previous layout was restored. {(update.error as Error).message}</p>}
        </div>
      </div>
    </div>
  );
}
