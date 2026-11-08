"use client";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Banknote, CalendarRange, Gauge, Landmark, PiggyBank, Receipt, ShoppingBag, ShoppingCart, Target, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { compactMoney, money, monthLabel, signedMoney } from "@/lib/format";
import { useAccount, useSummary } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { ErrorState, Progress, Skeleton } from "@/components/ui/misc";
import { NeedAccount, PageHeader } from "@/components/layout/PageKit";
import { CalcInfo, FinancialMetricCard } from "@/components/finance/FinancialMetricCard";
import { IncomeExpenseChart } from "@/components/finance/Charts";
import { ChartTooltip, DataTable, Legend, SERIES, axisProps, gridProps } from "@/components/finance/chart-kit";
import { ExportReportButton } from "@/components/reports/ExportReportButton";
import { PlainSummary, SimpleCollapse } from "@/components/ui/comfort";

const CAT_LABELS: Record<string, string> = {
  household_bills: "Household bills", insurance: "Insurance", loan_payments: "Loan payments", bank_fees: "Bank fees",
  cash_withdrawals_genuine: "Cash withdrawals", card_withdrawals: "Card purchases", transfers_out_other: "Other transfers out",
};

interface TxPage { total: number; items: { transaction_id: number; date: string; direction: string; operation: string | null; purpose: string | null; amount: number; signed_amount: number; balance: number | null }[] }

function Transactions({ accountId }: { accountId: number }) {
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState("");
  const limit = 15;
  const q = useQuery({
    queryKey: ["tx", accountId, page, dir],
    queryFn: () => api<TxPage>(`/accounts/${accountId}/transactions?limit=${limit}&offset=${page * limit}${dir ? `&direction=${dir}` : ""}`),
    placeholderData: keepPreviousData,
  });
  const pages = Math.ceil((q.data?.total ?? 0) / limit);
  return (
    <Card>
      <CardHeader>
        <div><CardTitle>Transactions</CardTitle><CardDescription>{q.data?.total.toLocaleString() ?? "…"} records from transactions.csv</CardDescription></div>
        <Select aria-label="Direction filter" className="h-8 w-36 text-xs" value={dir} onChange={(e) => { setDir(e.target.value); setPage(0); }}>
          <option value="">All</option><option value="credit">Money in</option><option value="debit">Money out</option>
        </Select>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-xs text-ink-2"><th className="py-1.5 font-medium">Date</th><th className="font-medium">Operation</th><th className="font-medium">Purpose</th><th className="text-right font-medium">Amount</th><th className="text-right font-medium">Balance</th></tr></thead>
            <tbody>
              {q.data?.items.map((t) => (
                <tr key={t.transaction_id} className="border-t border-line">
                  <td className="tabular py-1.5 text-xs">{t.date}</td><td className="text-xs">{t.operation}</td><td className="text-xs text-ink-2">{t.purpose ?? "—"}</td>
                  <td className={`tabular text-right text-xs font-semibold ${t.signed_amount >= 0 ? "text-good" : "text-ink"}`}>{signedMoney(t.signed_amount)}</td>
                  <td className="tabular text-right text-xs text-ink-2">{money(t.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-ink-2">Page {page + 1} of {Math.max(pages, 1)}</span>
          <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const accountId = useAccount();
  const { data: s, isLoading, error, refetch } = useSummary(accountId);
  const calc = (n: string) => s?.calculations.find((c) => c.name === n);

  const cats = s ? Object.entries(CAT_LABELS).map(([k, label]) => ({ label, value: s.metrics.category_medians[k] ?? 0 })).filter((c) => c.value > 0).sort((a, b) => b.value - a.value) : [];
  const forecastRows = s?.forecast.available ? [
    ...s.series.slice(-12).map((r) => ({ month: r.month, actual: r.month_end_balance })),
    ...(s.forecast.points ?? []).map((p) => ({ month: p.month, forecast: p.forecast, band: [p.lower, p.upper] as [number, number] })),
  ] : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Financial Dashboard" subtitle="Know the customer: income, bills, fixed costs, buffer and runway" computedAt={s?.computed_at}
        right={<ExportReportButton report="financial" accountId={accountId} />} />
      {!accountId && <NeedAccount />}
      {error && <ErrorState error={error} retry={refetch} />}
      {isLoading && <Skeleton className="h-96" />}
      {s && (
        <>
          <PlainSummary summary={s} />
          {s.warnings.length > 0 && <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200"><AlertTriangle className="size-4 shrink-0" />{s.warnings.join(" · ")}</div>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            <FinancialMetricCard label="Income (I)" value={money(s.judging.I)} icon={Banknote} tone="good" calc={calc("income_I")} />
            <FinancialMetricCard label="Spending (S)" value={money(s.judging.S)} icon={ShoppingCart} calc={calc("spending_S")} />
            <FinancialMetricCard label="Fixed costs (F)" value={money(s.judging.F)} icon={Receipt} tone="violet" calc={calc("fixed_costs_F")} sub="Bills + insurance + loan payments" />
            <FinancialMetricCard label="Household bills (H)" value={money(s.judging.H)} icon={Receipt} tone="blue" calc={calc("household_bills_H")} />
            <FinancialMetricCard label="Discretionary (D)" value={money(s.metrics.discretionary)} icon={ShoppingBag} calc={calc("discretionary_D")} sub="Unlabelled cash, card & transfers" />
            <FinancialMetricCard label="Savings buffer (B)" value={money(s.judging.B)} icon={PiggyBank} tone="blue" calc={calc("buffer_B")} sub={`Avg of ${s.judging.buffer_months.join(", ")}`} />
            <FinancialMetricCard label="Monthly loan payment (P)" value={money(s.judging.P)} icon={Landmark} tone="violet" calc={calc("loan_payment_P")} sub={s.loan ? `${s.loan.running ? "Running" : "Finished"} · ${money(s.loan.amount)} total` : "No loan"} />
            <FinancialMetricCard label="Typical monthly surplus" value={signedMoney(s.metrics.monthly_surplus)} icon={s.metrics.monthly_surplus >= 0 ? TrendingUp : TrendingDown} tone={s.metrics.monthly_surplus >= 0 ? "good" : "bad"} calc={calc("monthly_surplus")} sub={`Average cash flow ${signedMoney(s.metrics.avg_monthly_cash_flow)}/mo`} />
            <FinancialMetricCard label="Financial runway" value={s.judging.runway.no_shortfall ? "No shortfall" : `${s.judging.runway.display} mo`} icon={Gauge} tone={s.judging.runway.no_shortfall || s.judging.runway.months >= 6 ? "good" : "bad"} sub={s.judging.runway.formula} />
            <FinancialMetricCard label="Emergency fund target" value={money(s.metrics.emergency_fund_target_3m)} icon={Target} sub="3 × typical spending"
              footer={<Progress className="mt-2" tone="good" value={(s.metrics.emergency_fund_progress ?? 0) * 100} label="Emergency fund progress" />} />
          </div>

          <SimpleCollapse title="charts, trends and transactions">
          <Card>
            <CardHeader><div><CardTitle>Income vs spending</CardTitle><CardDescription>{s.metrics.months_of_data} months · {s.metrics.first_month} → {s.metrics.last_month}</CardDescription></div><CalendarRange className="size-4 text-ink-3" /></CardHeader>
            <CardContent><IncomeExpenseChart series={s.series} /></CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><div><CardTitle>Where typical money goes</CardTitle><CardDescription>Median per month by labelled category</CardDescription></div></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(160, cats.length * 38)}>
                  <BarChart data={cats} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={6}>
                    <CartesianGrid {...gridProps} horizontal={false} vertical />
                    <XAxis type="number" tickFormatter={compactMoney} {...axisProps} />
                    <YAxis type="category" dataKey="label" width={130} {...axisProps} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--peach)" }} />
                    <Bar dataKey="value" name="Median / month" fill={SERIES.spending} radius={[0, 4, 4, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-[0.6875rem] text-ink-3">Medians are computed per category, so they need not add up to S.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><div><CardTitle>Balance trend & projection</CardTitle><CardDescription>{s.forecast.method ?? "Not enough history"}</CardDescription></div><Badge tone="warn">Statistical projection</Badge></CardHeader>
              <CardContent>
                {s.forecast.available ? <>
                  <Legend items={[{ label: "Month-end balance", color: SERIES.balance }, { label: "Projection (±95%)", color: SERIES.fixed, dashed: true }]} />
                  <ResponsiveContainer width="100%" height={230}>
                    <ComposedChart data={forecastRows} margin={{ top: 8, right: 8 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="month" tickFormatter={monthLabel} {...axisProps} minTickGap={16} />
                      <YAxis tickFormatter={compactMoney} {...axisProps} width={64} />
                      <Tooltip content={<ChartTooltip labelFmt={monthLabel} />} />
                      <Area dataKey="band" name="95% band" stroke="none" fill="var(--series-2)" fillOpacity={0.12} />
                      <Line dataKey="actual" name="Balance" stroke={SERIES.balance} strokeWidth={2} dot={false} />
                      <Line dataKey="forecast" name="Projection" stroke={SERIES.fixed} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <p className="text-[0.6875rem] text-ink-3">{s.forecast.label}</p>
                </> : <p className="text-sm text-ink-2">Not enough history for a projection.</p>}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><div><CardTitle>Financial risk indicators</CardTitle><CardDescription>Detected from this account’s own history (robust z-scores)</CardDescription></div></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-cream p-2"><p className="tabular text-lg font-bold">{s.metrics.days_below_zero_12m}</p><p className="text-[0.625rem] text-ink-2">overdraft days (12m)</p></div>
                  <div className="rounded-xl bg-cream p-2"><p className="tabular text-lg font-bold">{s.metrics.income_cv?.toFixed(2) ?? "—"}</p><p className="text-[0.625rem] text-ink-2">income variability (CV)</p></div>
                  <div className="rounded-xl bg-cream p-2"><p className="tabular text-lg font-bold">{s.metrics.spending_cv?.toFixed(2) ?? "—"}</p><p className="text-[0.625rem] text-ink-2">spending variability (CV)</p></div>
                </div>
                <p className="text-xs font-semibold text-ink-2">Expenses changing most (last 6 vs prior 6 months)</p>
                <ul className="space-y-1">{s.trends.category_changes.slice(0, 4).map((c) => (
                  <li key={c.category} className="flex justify-between text-xs"><span>{CAT_LABELS[c.category] ?? c.category}</span>
                    <span className="tabular font-semibold">{signedMoney(c.change)}/mo {c.change_pct !== null && <span className="text-ink-3">({c.change_pct > 0 ? "+" : ""}{c.change_pct.toFixed(0)}%)</span>}</span></li>
                ))}</ul>
                <p className="text-xs font-semibold text-ink-2">Unusual months</p>
                {s.anomalies.length ? <ul className="space-y-1">{s.anomalies.slice(-5).reverse().map((a, i) => (
                  <li key={i} className="flex justify-between text-xs"><span><AlertTriangle className="mr-1 inline size-3 text-warn" />{a.month} · {CAT_LABELS[a.category] ?? a.category.replace(/_/g, " ")}</span><span className="tabular">{money(a.value)} vs {money(a.typical)}</span></li>
                ))}</ul> : <p className="text-xs text-ink-2">No unusual months detected.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><div><CardTitle>How each number is calculated</CardTitle><CardDescription>Tangerine README definitions — tap ⓘ for inputs & provenance</CardDescription></div></CardHeader>
              <CardContent>
                <ul className="divide-y divide-line">{s.calculations.map((c) => (
                  <li key={c.name} className="flex items-center justify-between gap-2 py-2 text-xs">
                    <span className="min-w-0"><b className="text-ink">{c.name}</b><code className="ml-2 text-ink-2">{c.formula}</code></span>
                    <span className="flex items-center gap-1"><span className="tabular font-semibold">{money(c.value)}</span><CalcInfo calc={c} title={c.name} /></span>
                  </li>
                ))}</ul>
                <p className="mt-2 text-[0.6875rem] text-ink-3">Net worth is not shown: average balances are not a complete net worth, and other assets and debts are not in the data.</p>
              </CardContent>
            </Card>
          </div>

          <Transactions accountId={s.account_id} />
          <DataTable caption="Monthly summary" rows={s.series as unknown as Record<string, unknown>[]} columns={[
            { key: "month", label: "Month" }, { key: "money_in", label: "In", fmt: (v) => money(v as number) }, { key: "money_out", label: "Out", fmt: (v) => money(v as number) },
            { key: "household_bills", label: "Bills", fmt: (v) => money(v as number) }, { key: "avg_daily_balance", label: "Avg balance", fmt: (v) => money(v as number) }]} />
          </SimpleCollapse>
        </>
      )}
    </div>
  );
}
