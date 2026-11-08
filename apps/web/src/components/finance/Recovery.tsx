"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Flag } from "lucide-react";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/misc";

export function EmergencySavingsProgress({ current, target, milestones }: { current: number; target: number; milestones: { pct: number; amount: number; month: number | null; reached: boolean }[] }) {
  const p = target > 0 ? Math.min(Math.max(current, 0) / target, 1) * 100 : 100;
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div><p className="text-xs text-ink-2">Current buffer</p><p className="tabular text-2xl font-bold">{money(current)}</p></div>
        <div className="text-right"><p className="text-xs text-ink-2">Target</p><p className="tabular text-lg font-semibold">{money(target)}</p></div>
      </div>
      <div className="relative">
        <Progress value={p} tone="good" className="h-3" label="Emergency savings progress" />
        {milestones.slice(0, 3).map((m) => <span key={m.pct} className="absolute top-0 h-3 w-0.5 bg-surface" style={{ left: `${m.pct}%` }} aria-hidden />)}
      </div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {milestones.map((m) => (
          <li key={m.pct} className={cn("rounded-xl border p-2 text-center", m.reached ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950" : "border-line")}>
            <Flag className={cn("mx-auto size-4", m.reached ? "text-good" : "text-ink-3")} />
            <p className="text-xs font-semibold">{m.pct}% · {money(m.amount)}</p>
            <p className="text-[0.625rem] text-ink-2">{m.reached ? "Reached ✓" : m.month !== null ? `≈ month ${m.month}` : "needs savings capacity"}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Checklist with local persistence (and optional server persistence via onChange). */
export function RecoveryPlanChecklist({ id, items, onChange }: { id: string; items: { action: string; why: string; source?: string }[]; onChange?: (s: Record<string, boolean>) => void }) {
  const key = `ciq-check-${id}`;
  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try { setDone(JSON.parse(localStorage.getItem(key) || "{}")); } catch { setDone({}); }
  }, [key]);
  const toggle = (a: string) => {
    const next = { ...done, [a]: !done[a] };
    setDone(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable */ }
    onChange?.(next);
  };
  const n = items.filter((i) => done[i.action]).length;
  return (
    <div>
      <p className="mb-2 text-xs text-ink-2">{n} of {items.length} done</p>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.action}>
            <button onClick={() => toggle(i.action)} className="flex w-full cursor-pointer items-start gap-3 rounded-xl border border-line p-3 text-left hover:border-tangerine" aria-pressed={!!done[i.action]}>
              {done[i.action] ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-good" /> : <Circle className="mt-0.5 size-5 shrink-0 text-ink-3" />}
              <span><span className={cn("text-sm font-semibold", done[i.action] && "line-through opacity-60")}>{i.action}</span>
                <span className="block text-xs text-ink-2">{i.why}{i.source && <> · <a className="underline" href={i.source} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>source</a></>}</span></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
