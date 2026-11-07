import * as React from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-xl bg-peach", className)} {...p} />;
}

export function Progress({ value, className, tone = "orange", label }: { value: number; className?: string; tone?: "orange" | "good" | "violet"; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const bar = tone === "good" ? "bg-good" : tone === "violet" ? "bg-invest" : "brand-gradient";
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-peach", className)} role="progressbar"
         aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, children, action }: { icon?: React.ElementType; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line p-8 text-center">
      <div className="rounded-full bg-peach p-3 text-tangerine"><Icon className="size-5" /></div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {children && <div className="max-w-md text-xs text-ink-2">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1"><p className="font-semibold">Something went wrong</p><p className="text-xs">{msg}</p></div>
      {retry && <button onClick={retry} className="cursor-pointer text-xs font-semibold underline">Retry</button>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin", className)} aria-hidden />;
}

export function SectionTitle({ title, subtitle, right }: { title: string; subtitle?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
