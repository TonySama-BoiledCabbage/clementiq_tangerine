"use client";
import { UserSearch } from "lucide-react";
import { dateTime } from "@/lib/format";
import { EmptyState, SectionTitle } from "@/components/ui/misc";
import { CustomerSelector } from "./CustomerSelector";

export function PageHeader({ title, subtitle, computedAt, right }: { title: string; subtitle?: React.ReactNode; computedAt?: string; right?: React.ReactNode }) {
  return (
    <SectionTitle title={title}
      subtitle={<>{subtitle}{computedAt && <span className="block text-[11px] text-ink-3">Last updated {dateTime(computedAt)} · Clement Core</span>}</>}
      right={<div className="flex flex-wrap items-center gap-2">{right}<CustomerSelector /></div>} />
  );
}

export function NeedAccount() {
  return (
    <EmptyState icon={UserSearch} title="Choose a customer to begin">
      Enter any <code>account_id</code> from the Tangerine dataset in the selector above (or press shuffle for a random one).
      <div className="mt-4 flex justify-center"><CustomerSelector /></div>
    </EmptyState>
  );
}
