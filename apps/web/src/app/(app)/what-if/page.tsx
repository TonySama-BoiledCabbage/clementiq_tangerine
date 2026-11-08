"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import type { ShockComponent } from "@clementiq/shared-types";
import { useAccount, usePresets, useSummary } from "@/lib/hooks";
import { ErrorState, Skeleton } from "@/components/ui/misc";
import { useRoleGate } from "@/components/layout/useRoleGate";
import { ShockScenarioSelector } from "@/components/finance/Shock";
import { BackupView, ResultView, Section, ShockPicker, riskOf, useAccountExtras, useShock } from "@/components/stress/parts";

/** Customer What if: pick something that could happen → how long the money lasts → what to do first. */
export default function WhatIfPage() {
  const allowed = useRoleGate("customer");
  const accountId = useAccount();
  const params = useSearchParams();
  const s = useSummary(accountId);
  const presets = usePresets();
  const [picked, setPicked] = useState<ShockComponent[] | null | undefined>(undefined);
  const fromUrl = presets.data?.presets.find((p) => p.id === params.get("scenario"))?.components ?? null;
  const components = picked === undefined ? fromUrl : picked;
  const { shock, sim, backup } = useShock(accountId, components);
  const { obl } = useAccountExtras(accountId);
  if (!allowed) return null;
  const j = s.data?.judging;
  const risk = riskOf(j, obl.data);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="large-title">What if</h1>
        <p className="mt-1 text-[15px] text-ink-3">Pick something that could happen. We&apos;ll show how long your savings would last and what to do first.</p>
      </div>
      {s.error && <ErrorState error={s.error} />}
      <section aria-label="Scenarios" className="space-y-3">
        {presets.data ? <ShockPicker presets={presets.data.presets} components={components} onPick={setPicked} mode="customer" allowNone /> : <Skeleton className="h-32 rounded-2xl shadow-card" />}
        {presets.data && components && components.length > 0 && (
          <details className="group rounded-2xl shadow-card bg-surface px-5">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-1 text-[15px] font-medium text-tangerine [&::-webkit-details-marker]:hidden">Change the details<ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /></summary>
            <div className="pb-5"><ShockScenarioSelector components={components} onChange={setPicked} types={presets.data.types} presets={[]} onPreset={(p) => setPicked(p.components)} mode="judging" sValue={j?.S} /></div>
          </details>
        )}
      </section>
      {!shock && <p className="rounded-2xl shadow-card bg-surface p-6 text-center text-[15px] text-ink-3">Choose a scenario above to see the result.</p>}
      {shock && (
        <Section title="How long your money would last">
          {sim.error ? <ErrorState error={sim.error} /> : !sim.data ? <Skeleton className="h-56" /> : <ResultView sim={sim.data} j={j} risk={risk} mode="customer" />}
        </Section>
      )}
      {shock && (
        <Section title="If it happens, do this first">
          {backup.error ? <ErrorState error={backup.error} /> : !backup.data ? <Skeleton className="h-28" /> : <BackupView b={backup.data} risk={risk} mode="customer" />}
        </Section>
      )}
    </div>
  );
}
