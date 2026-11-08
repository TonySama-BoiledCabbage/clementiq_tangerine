"use client";
import type { Calc } from "@clementiq/shared-types";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/controls";
import { dateTime } from "@/lib/format";

export function CalcInfo({ calc, title }: { calc?: Calc; title: string }) {
  if (!calc) return null;
  return (
    <Dialog>
      <DialogTrigger aria-label={`How ${title} is calculated`} className="cursor-pointer rounded-full p-1 text-ink-3 hover:bg-peach hover:text-tangerine"><Info className="size-3.5" /></DialogTrigger>
      <DialogContent title={title} description="Clement Core calculation — deterministic and reproducible">
        <dl className="space-y-3 text-sm">
          <div><dt className="text-xs font-semibold text-ink-2">Formula</dt><dd><code className="rounded bg-peach px-2 py-1 text-xs">{calc.formula}</code></dd></div>
          <div><dt className="text-xs font-semibold text-ink-2">Output</dt><dd className="tabular">{calc.value?.toLocaleString("en-CA", { maximumFractionDigits: 4 })} {calc.unit}</dd></div>
          <div><dt className="text-xs font-semibold text-ink-2">Inputs</dt><dd><pre className="max-h-40 overflow-auto rounded-lg bg-cream p-2 text-[0.6875rem]">{JSON.stringify(calc.inputs, null, 1)}</pre></dd></div>
          {calc.assumptions.length > 0 && <div><dt className="text-xs font-semibold text-ink-2">Assumptions</dt><dd><ul className="list-disc pl-4 text-xs">{calc.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></dd></div>}
          {calc.warnings.length > 0 && <div><dt className="text-xs font-semibold text-warn">Missing-data warnings</dt><dd className="text-xs">{calc.warnings.join("; ")}</dd></div>}
          <div className="text-[0.6875rem] text-ink-3">Source: {calc.provenance} · engine {calc.engine} · computed {dateTime(calc.computed_at)}</div>
        </dl>
      </DialogContent>
    </Dialog>
  );
}

export function FinancialMetricCard({ label, value, sub, icon: Icon, tone = "orange", calc, footer }: {
  label: string; value: string; sub?: React.ReactNode; icon: React.ElementType; tone?: "orange" | "good" | "bad" | "violet" | "blue";
  calc?: Calc; footer?: React.ReactNode;
}) {
  const tones = {
    orange: "bg-peach text-tangerine", good: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
    bad: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300", violet: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    blue: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  };
  return (
    <Card className="p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between">
        <span className={cn("grid size-10 place-items-center rounded-xl", tones[tone])}><Icon className="size-5" /></span>
        <CalcInfo calc={calc} title={label} />
      </div>
      <p className="mt-3 text-xs font-medium text-ink-2">{label}</p>
      <p className="tabular mt-0.5 text-2xl font-bold tracking-tight text-ink">{value}</p>
      {sub && <div className="mt-1 text-[0.6875rem] text-ink-2">{sub}</div>}
      {footer}
    </Card>
  );
}
