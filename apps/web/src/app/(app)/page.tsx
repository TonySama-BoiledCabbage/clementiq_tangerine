"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Gavel, Info, Lock, Move, Sprout } from "lucide-react";
import { DEFAULT_DASHBOARD, homeFeatures, reorderedIds, toggledFavorites } from "@/lib/features";
import { DECORATIVE_GROWTH, growthFromSummary } from "@/lib/growth";
import { DEFAULT_APPEARANCE, useAccount, useComfort, useMe, useSettings, useSummary, useUpdatePrefs } from "@/lib/hooks";
import { useMediaUrl, useProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { OrchardScene } from "@/components/orchard/OrchardScene";
import { FeatureGrid, type Density } from "@/components/home/FeatureCard";
import { HomeTopBar } from "@/components/layout/AppChrome";
import { AccountSearch } from "@/components/layout/CustomerSelector";
import { OrchardCharacter, type CharacterMode } from "@/components/orchard/OrchardCharacter";

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
  const comfort = useComfort();
  const baseAppearance = { ...DEFAULT_APPEARANCE, ...(prefs?.appearance ?? {}) };
  // Simple and Calm modes: fewer distractions (no money bills, coins or motion). The orchard itself stays.
  const appearance = comfort.simple_mode || comfort.calm_mode
    ? { ...baseAppearance, money_trees: false, floating_coins: false, animations: false }
    : baseAppearance;
  // Which figure sits in the orchard: default, the user's photo as a portrait, or their generated character.
  const chosen: CharacterMode = prefs?.avatar?.character
    ?? (prefs?.avatar?.personalized_enabled && profile.data?.avatar ? "generated" : "default");
  // Settings, Appearance can hide the personalised character without deleting it.
  const mode: CharacterMode = appearance.show_personal_character === false ? "default" : chosen;
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
      {/* ── Section 1: Hero (orchard layers behind, all content in normal flow) ── */}
      <OrchardScene appearance={appearance} growth={growth} celebrate={!!celebrate} className="pb-10">
        <HomeTopBar />
        {me.data?.entitlements.account_search && (
          <div className="mx-auto mt-3 max-w-[1500px] px-4 sm:px-8">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-white bg-white p-3 shadow-lg dark:border-white/10 dark:bg-[#241c16]" role="region" aria-label="Judge tools">
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-ink"><Gavel className="size-4 text-tangerine" /> Judge tools</span>
              <AccountSearch className="w-full sm:w-auto sm:flex-1" />
              {me.data.entitlements.judge_demo && (
                <Link href="/judge" className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-tangerine px-4 text-sm font-semibold text-white shadow-sm hover:brightness-105 sm:w-auto">Open Judge Demo</Link>
              )}
            </div>
          </div>
        )}
        <div className="mx-auto grid max-w-[1500px] items-end gap-6 px-4 pt-6 sm:px-8 md:grid-cols-[minmax(0,1fr)_minmax(0,600px)] md:pt-8">
          <OrchardCharacter mode={character.mode} url={character.url} transparent={character.transparent}
            className="order-last h-[230px] sm:h-[300px] md:order-none md:h-[420px] lg:h-[460px]" />
          <section className="rounded-[28px] bg-white/90 p-5 shadow-lg ring-1 ring-white sm:p-7 dark:bg-[#241c16]/90 dark:ring-white/10" aria-labelledby="hero-title">
            <p className="text-base font-semibold text-ink-2">{greeting()}{name ? `, ${name}` : ""} 👋</p>
            <h1 id="hero-title" className="mt-1 text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-[2.5rem]">Your financial future is growing. 🍊</h1>
            <p className="mt-2 text-lg text-ink-2">One smart decision at a time.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {me.data && !me.data.entitlements.account_search && accountId && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold text-slate-800"><Lock className="size-3.5" /> Your account #{accountId}</span>
              )}
              {me.data?.entitlements.account_search && (
                <span className="inline-flex items-center rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold text-slate-800">{accountId ? `Viewing account #${accountId}` : "No account selected: search above"}</span>
              )}
              {appearance.growth_visuals && appearance.orchard_enabled && (
                <button onClick={() => setShowGrowth((v) => !v)} aria-expanded={showGrowth} aria-controls="orchard-explained"
                  className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:border-tangerine">
                  <Sprout className="size-4 text-good" /> {showGrowth ? "Hide orchard explanation" : "How your orchard grows"}
                </button>
              )}
            </div>
          </section>
        </div>
      </OrchardScene>

      {celebrate && (
        <div role="status" className="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-full bg-surface px-5 py-2.5 text-sm font-semibold text-ink shadow-xl ring-1 ring-line">{celebrate}</div>
      )}

      <div className="mx-auto max-w-[1500px] space-y-5 px-3 sm:px-6">
        {/* ── Section 2: Orchard explanation (takes real space; pushes everything below down) ── */}
        {showGrowth && (
          <section id="orchard-explained" aria-label="How your orchard reflects your finances" className="rounded-3xl border border-line bg-surface p-5 shadow-card">
            <h2 className="mb-2 font-bold text-ink">How your orchard grows</h2>
            <ul className="grid gap-2 text-sm text-ink-2 sm:grid-cols-2">
              {growth.captions.map((c) => <li key={c} className="rounded-xl bg-cream p-3">{c}</li>)}
            </ul>
            <p className="mt-2 text-xs text-ink-3">{growth.data ? `Based on account #${accountId}, calculated by Clement Core.` : "Decorative until an account is selected."} Setbacks never make the orchard wilt. You can turn this off in Settings, Appearance.</p>
          </section>
        )}

        {/* ── Section 3: Dashboard controls (own row) ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card" role="toolbar" aria-label="Dashboard layout">
          <div>
            <h2 className="text-lg font-bold text-ink">Choose a focus area</h2>
            <p className="text-xs text-ink-2">{features.length} of your tools · favorites first</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full bg-peach p-1" role="group" aria-label="Layout density">
              {DENSITIES.map((d) => (
                <button key={d.id} aria-pressed={dash.layout_density === d.id} onClick={() => update.mutate({ dashboard: { layout_density: d.id } })}
                  className={cn("min-h-8 cursor-pointer rounded-full px-3 py-1 text-xs font-semibold", dash.layout_density === d.id ? "bg-tangerine text-white" : "text-ink-2 hover:text-ink")}>{d.label}</button>
              ))}
            </div>
            {features.length > 1 && (
              <Button size="sm" variant={arranging ? "default" : "outline"} onClick={() => setArranging((v) => !v)}>
                {arranging ? <><Check /> Done</> : <><Move /> Arrange</>}
              </Button>
            )}
          </div>
        </div>
        {arranging && <p className="flex items-center gap-1.5 text-xs text-ink-2"><Info className="size-3.5" /> Drag cards by their handle (or focus it and use the arrow keys). Favorites always stay at the front.</p>}

        {/* ── Section 4: Feature cards ── */}
        <section aria-label="Your tools">
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
              <p className="max-w-md text-sm text-ink-2">You have hidden every tool. Nothing was deleted: pick the features you want back on your dashboard.</p>
              <Button asChild size="lg"><Link href="/settings?section=dashboard">Choose Your Features</Link></Button>
            </div>
          )}
          {update.isError && <p role="alert" className="mt-3 text-xs text-bad">Couldn’t save that change. Your previous layout was restored. {(update.error as Error).message}</p>}
        </section>
      </div>
    </div>
  );
}
