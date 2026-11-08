import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badge = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold [&_svg]:size-3", {
  variants: {
    tone: {
      orange: "bg-accent-tint text-tangerine",
      good: "bg-good-bg text-good",
      bad: "bg-bad-bg text-bad",
      warn: "bg-warn-bg text-warn",
      violet: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
      neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
      blue: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...p} />;
}
