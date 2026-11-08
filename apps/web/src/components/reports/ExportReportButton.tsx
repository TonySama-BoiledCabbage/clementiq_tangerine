"use client";
/** Download Report: format, reporting period, sections, preview, then a real PDF/XLSX download.
 *  Files are generated on the server from the same Clement Core data as the screen. */
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Download, Eye, FileSpreadsheet, FileText } from "lucide-react";
import type { ShockRequest } from "@clementiq/shared-types";
import { ApiError, api } from "@/lib/api";
import { money } from "@/lib/format";
import { useSession } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/controls";
import { Label, Select } from "@/components/ui/input";
import { ErrorState, Spinner } from "@/components/ui/misc";

export type ReportType = "financial" | "snapshot" | "shock" | "recovery" | "resilience" | "timeline" | "investments" | "judge";
interface Options { reports: Record<string, { title: string; sections: string[]; fixed: boolean; needs_account: boolean }>; sections: Record<string, string>; periods: Record<string, string> }
interface Preview { filename: string; meta: { title: string; period_label: string; period_start?: string; period_end?: string; data_as_of?: string; account_id: number | null };
  highlights: { label: string; value: number | string; kind: string }[]; sections: { id: string; label: string }[]; rows_in_period: number }

const SELECTABLE = ["summary", "income_expenses", "savings", "debts", "resilience", "cash_flow", "trends", "scenario", "recovery"];

async function download(body: unknown): Promise<string> {
  const { token } = useSession.getState();
  let res: Response;
  try {
    res = await fetch("/api/reports/export", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "Cannot reach the ClementIQ API. Check that the backend is running.");
  }
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try { detail = (await res.json()).detail; } catch { /* not JSON */ }
    throw new ApiError(res.status, typeof detail === "string" ? detail : "The report could not be created.");
  }
  const cd = res.headers.get("content-disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? "ClementIQ_Report";
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);   // nothing is kept after the download
  return name;
}

export function ExportReportButton({ report, accountId, shock, goal, label = "Download Report", className }: {
  report: ReportType; accountId?: number | null; shock?: ShockRequest | Record<string, unknown> | null; goal?: Record<string, unknown> | null; label?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<"pdf" | "xlsx">("pdf");
  const [period, setPeriod] = useState("all");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [sections, setSections] = useState<string[] | null>(null);
  const opts = useQuery({ queryKey: ["report-options"], queryFn: () => api<Options>("/reports/options"), enabled: open, staleTime: Infinity });
  const def = opts.data?.reports[report];
  useEffect(() => { if (def && sections === null) setSections(def.sections); }, [def, sections]);
  const needsAccount = def?.needs_account ?? report !== "investments";
  const body = {
    report, format, account_id: accountId ?? null, period,
    start: period === "custom" ? start : null, end: period === "custom" ? end : null,
    sections: def?.fixed ? null : sections, shock: shock ?? null, goal: goal ?? null,
  };
  const preview = useMutation({ mutationFn: () => api<Preview>("/reports/preview", { method: "POST", json: body }) });
  const dl = useMutation({ mutationFn: () => download(body) });
  useEffect(() => { preview.reset(); dl.reset(); }, [format, period, start, end, JSON.stringify(sections)]); // eslint-disable-line react-hooks/exhaustive-deps

  const disabled = (needsAccount && !accountId) || (period === "custom" && (!start || !end)) || (sections !== null && sections.length === 0 && !def?.fixed);
  const toggle = (id: string) => setSections((s) => (s ?? []).includes(id) ? (s ?? []).filter((x) => x !== id) : [...(s ?? []), id]);
  const choices = report === "investments" ? ["investments"] : report === "judge" ? (def?.sections ?? []) : SELECTABLE;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={className} disabled={needsAccount && !accountId} title={needsAccount && !accountId ? "Choose an account first" : undefined}>
          <Download /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent title={`Download ${def?.title ?? "report"}`} description={accountId ? `Account #${accountId} · generated from the same data as this page` : "Generated from the same data as this page"} className="max-w-xl">
        {!opts.data ? <div className="flex items-center gap-2 text-sm text-ink-2"><Spinner /> Loading options…</div> : (
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink">File format</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="File format">
                {([["pdf", "PDF", "Printable report", FileText], ["xlsx", "Excel (.xlsx)", "Workbook with formulas", FileSpreadsheet]] as const).map(([id, name, desc, Icon]) => (
                  <button key={id} type="button" role="radio" aria-checked={format === id} onClick={() => setFormat(id)}
                    className={cn("flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3 text-left", format === id ? "border-tangerine bg-peach" : "border-line hover:border-tangerine/50")}>
                    <Icon className="size-6 text-tangerine" /><span><span className="block text-sm font-semibold text-ink">{name}</span><span className="block text-xs text-ink-2">{desc}</span></span>
                  </button>
                ))}
              </div>
            </fieldset>

            {report !== "investments" && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-3"><Label htmlFor="rp-period">Reporting period</Label>
                  <Select id="rp-period" value={period} onChange={(e) => setPeriod(e.target.value)}>
                    {Object.entries(opts.data.periods).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select></div>
                {period === "custom" && <>
                  <div><Label htmlFor="rp-start">From (month)</Label><input id="rp-start" type="month" value={start} onChange={(e) => setStart(e.target.value)} className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm" /></div>
                  <div><Label htmlFor="rp-end">To (month)</Label><input id="rp-end" type="month" value={end} onChange={(e) => setEnd(e.target.value)} className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm" /></div>
                </>}
              </div>
            )}

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink">Include</legend>
              {def?.fixed && <p className="mb-2 text-xs text-ink-2">The Judge Demo report always follows the five-step walkthrough.</p>}
              <div className="grid gap-1.5 sm:grid-cols-2">
                {choices.map((id) => (
                  <label key={id} className={cn("flex min-h-9 items-center gap-2 rounded-xl border border-line px-3 py-1.5 text-sm", def?.fixed && "opacity-70")}>
                    <input type="checkbox" checked={def?.fixed ? true : (sections ?? []).includes(id)} disabled={def?.fixed} onChange={() => toggle(id)} />
                    {opts.data!.sections[id] ?? id}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => preview.mutate()} disabled={disabled || preview.isPending}>{preview.isPending ? <Spinner /> : <Eye />} Preview contents</Button>
              <Button onClick={() => dl.mutate()} disabled={disabled || dl.isPending}>{dl.isPending ? <><Spinner /> Preparing {format.toUpperCase()}…</> : <><Download /> Download {format === "pdf" ? "PDF" : "Excel"}</>}</Button>
            </div>
            {disabled && needsAccount && !accountId && <p className="text-xs text-warn">Choose an account first.</p>}

            {preview.data && (
              <div className="space-y-2 rounded-2xl border border-line bg-cream p-4 text-sm" role="status">
                <p className="font-semibold text-ink">{preview.data.filename}</p>
                <p className="text-xs text-ink-2">{preview.data.meta.period_label}{preview.data.meta.period_start ? ` · ${preview.data.meta.period_start} to ${preview.data.meta.period_end} (${preview.data.rows_in_period} months)` : ""}{preview.data.meta.data_as_of ? ` · data as of ${preview.data.meta.data_as_of}` : ""}</p>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {preview.data.highlights.map((h) => <li key={h.label} className="flex justify-between gap-2 text-xs"><span className="text-ink-2">{h.label}</span><b className="tabular text-ink">{h.kind === "currency" ? money(h.value as number, true) : String(h.value)}</b></li>)}
                </ul>
                <p className="text-xs text-ink-2">Sections: {preview.data.sections.map((s) => s.label).join(", ")}</p>
              </div>
            )}
            {(preview.error || dl.error) && <ErrorState error={preview.error ?? dl.error} retry={() => (dl.error ? dl.mutate() : preview.mutate())} />}
            {dl.isSuccess && <p role="status" className="flex items-center gap-1.5 text-sm font-semibold text-good"><CheckCircle2 className="size-4" /> Downloaded {dl.data}</p>}
            <p className="text-[0.6875rem] text-ink-3">Created on request and sent straight to your browser: no copies are stored and there are no public links. Values are labelled actual, calculated, estimate or simulation inside the file.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
