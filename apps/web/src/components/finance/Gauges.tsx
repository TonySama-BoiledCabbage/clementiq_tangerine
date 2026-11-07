"use client";
import type { Runway } from "@clementiq/shared-types";
import { cn } from "@/lib/utils";

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
}

/** Semicircle gauge on a 0–24 month scale; "no shortfall" pins to the end and is stated in text. */
export function FinancialRunwayGauge({ runway, label = "Financial runway", size = 200 }: { runway: Runway; label?: string; size?: number }) {
  const max = 24;
  const v = runway.no_shortfall ? max : Math.min(runway.months, max);
  const a0 = Math.PI;
  const a = a0 + (v / max) * Math.PI;
  const status = runway.no_shortfall ? "good" : runway.months < 3 ? "bad" : runway.months < 6 ? "warn" : "good";
  const statusText = runway.no_shortfall ? "Income covers spending" : runway.months < 3 ? "Under 3 months" : runway.months < 6 ? "3–6 months" : "6+ months";
  const color = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)" }[status];
  return (
    <div className="flex flex-col items-center" role="img" aria-label={`${label}: ${runway.display} ${runway.no_shortfall ? "" : "months"}`}>
      <svg viewBox="0 0 200 115" width={size} height={size * 0.575}>
        <path d={arc(100, 100, 80, Math.PI, 2 * Math.PI)} stroke="var(--peach)" strokeWidth="14" fill="none" strokeLinecap="round" />
        {v > 0 && <path d={arc(100, 100, 80, Math.PI, Math.max(a, Math.PI + 0.02))} stroke={color} strokeWidth="14" fill="none" strokeLinecap="round" />}
        {[3, 6, 12].map((t) => {
          const ta = Math.PI + (t / max) * Math.PI;
          return <line key={t} x1={100 + 66 * Math.cos(ta)} y1={100 + 66 * Math.sin(ta)} x2={100 + 72 * Math.cos(ta)} y2={100 + 72 * Math.sin(ta)} stroke="var(--ink-3)" strokeWidth="1.5" />;
        })}
        <text x="100" y="88" textAnchor="middle" className="fill-[var(--ink)] text-[26px] font-bold">{runway.no_shortfall ? "120+" : runway.display}</text>
        <text x="100" y="106" textAnchor="middle" className="fill-[var(--ink-2)] text-[10px]">{runway.no_shortfall ? "no shortfall" : "months"}</text>
      </svg>
      <p className={cn("mt-1 text-xs font-semibold", status === "bad" ? "text-bad" : status === "warn" ? "text-warn" : "text-good")}>
        {status === "bad" ? "▲ " : status === "warn" ? "● " : "✓ "}{statusText}
      </p>
    </div>
  );
}

export function ResilienceScoreGauge({ score, band, size = 150 }: { score: number; band: string; size?: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? "var(--good)" : score >= 55 ? "var(--tangerine)" : score >= 35 ? "var(--warn)" : "var(--bad)";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`Resilience score ${Math.round(score)} of 100, ${band}`}>
      <svg viewBox="0 0 120 120" width={size} height={size} className="-rotate-90">
        <circle cx="60" cy="60" r={r} stroke="var(--peach)" strokeWidth="11" fill="none" />
        <circle cx="60" cy="60" r={r} stroke={color} strokeWidth="11" fill="none" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <div className="absolute text-center">
        <p className="tabular text-3xl font-extrabold leading-none text-ink">{Math.round(score)}</p>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-2">{band}</p>
      </div>
    </div>
  );
}
