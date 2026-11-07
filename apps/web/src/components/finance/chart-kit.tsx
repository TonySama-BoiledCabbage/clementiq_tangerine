"use client";
/** Shared chart pieces. Series colors follow the ENTITY (validated palette in globals.css), never rank. */
import { money } from "@/lib/format";

export const SERIES = {
  income: "var(--series-4)",
  spending: "var(--series-1)",
  fixed: "var(--series-2)",
  balance: "var(--series-3)",
  scenario: "var(--series-1)",
  baseline: "var(--series-4)",
  invest: "var(--series-2)",
} as const;

export const axisProps = {
  tick: { fill: "var(--ink-2)", fontSize: 11 },
  axisLine: false,
  tickLine: false,
} as const;

export const gridProps = { stroke: "var(--grid)", strokeDasharray: "3 3", vertical: false } as const;

interface TipEntry { dataKey?: unknown; name?: unknown; value?: unknown; color?: string }
export function ChartTooltip({ active, payload, label, fmt = (v: number) => money(v), labelFmt }: {
  active?: boolean; payload?: readonly TipEntry[]; label?: unknown; fmt?: (v: number) => string; labelFmt?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-ink">{labelFmt ? labelFmt(String(label)) : String(label ?? "")}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center justify-between gap-4 text-ink-2">
          <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full" style={{ background: p.color }} />{String(p.name ?? "")}</span>
          <span className="tabular font-semibold text-ink">{typeof p.value === "number" ? fmt(p.value) : String(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: i.dashed ? "transparent" : i.color, borderTop: i.dashed ? `2px dashed ${i.color}` : undefined }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Accessible table view of any chart's data. */
export function DataTable({ rows, columns, caption }: { rows: Record<string, unknown>[]; columns: { key: string; label: string; fmt?: (v: unknown) => string }[]; caption: string }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-ink-2 hover:text-tangerine">View as table</summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-line">
        <table className="w-full text-left">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-peach"><tr>{columns.map((c) => <th key={c.key} className="px-2 py-1.5 font-semibold">{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">{columns.map((c) => <td key={c.key} className="tabular px-2 py-1">{c.fmt ? c.fmt(r[c.key]) : String(r[c.key] ?? "—")}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
