"""Excel (.xlsx) exporter — formats the report data built in reports/data.py (no business logic here)."""
from __future__ import annotations

import io
from datetime import datetime
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

CURRENCY = '"$"#,##0.00;[Red]-"$"#,##0.00'
PCT = "0.0%"
ORANGE = "FF6B00"
HEAD_FILL = PatternFill("solid", fgColor="FFE3CC")
TITLE_FONT = Font(bold=True, size=14, color="7A2E00")
HEAD_FONT = Font(bold=True, color="3B1A00")
THIN = Side(style="thin", color="E8D5C4")
DANGEROUS = ("=", "+", "-", "@", "\t", "\r")


class Formula(str):
    """A formula written by ClementIQ itself (trusted). Anything else that looks like a formula is escaped."""


def safe(v: Any) -> Any:
    """Prevent spreadsheet formula injection: untrusted text that starts like a formula is stored as literal text."""
    if isinstance(v, str) and not isinstance(v, Formula) and v.startswith(DANGEROUS):
        return "'" + v
    return v


def _title(ws, title: str, subtitle: str) -> int:
    ws["A1"] = title
    ws["A1"].font = TITLE_FONT
    ws["A2"] = subtitle
    ws["A2"].font = Font(italic=True, color="64748B")
    return 4


def _table(ws, row: int, headers: list[str], rows: list[list[Any]], formats: dict[int, str] | None = None,
           filters: bool = True) -> tuple[int, int]:
    """Write a header + rows starting at `row`; returns (first_data_row, last_data_row)."""
    for c, h in enumerate(headers, start=1):
        cell = ws.cell(row=row, column=c, value=h)
        cell.font, cell.fill = HEAD_FONT, HEAD_FILL
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        cell.border = Border(bottom=THIN)
    first = row + 1
    for r_i, r in enumerate(rows):
        for c, v in enumerate(r, start=1):
            cell = ws.cell(row=first + r_i, column=c, value=safe(v))
            if formats and c in formats and (not isinstance(v, str) or isinstance(v, Formula)):
                cell.number_format = formats[c]
    last = first + len(rows) - 1
    if filters and rows:
        ws.auto_filter.ref = f"A{row}:{get_column_letter(len(headers))}{max(last, row)}"
    ws.freeze_panes = ws.cell(row=row + 1, column=1)
    return first, last


def _widths(ws, widths: list[int]) -> None:
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


def build_xlsx(data: dict[str, Any]) -> bytes:
    m = data["meta"]
    wb = Workbook()
    ws = wb.active
    ws.title = "Summary"
    sub = (f"Account #{m['account_id']} · " if m.get("account_id") else "") + \
          f"{m['period_label']}" + (f" ({m.get('period_start')} to {m.get('period_end')})" if m.get("period_start") else "") + \
          f" · data as of {m.get('data_as_of')} · generated {m['generated_at']} · {m['engine']}"
    row = _title(ws, f"ClementIQ — {m['title']}", sub)

    if "summary" in data:
        s = data["summary"]
        ws.cell(row=row, column=1, value=f"Key indicators ({s['label']})").font = Font(bold=True)
        rows = [[label, value, how] for label, value, kind, how in s["rows"]]
        first, last = _table(ws, row + 1, ["Indicator", "Value", "How it is calculated"], rows, filters=False)
        for i, (_, _, kind, _) in enumerate(s["rows"]):
            if kind == "currency":
                ws.cell(row=first + i, column=2).number_format = CURRENCY
        row = last + 2
    if "monthly" in data:
        t = data["monthly"]["totals"]
        ws.cell(row=row, column=1, value="Totals for the reporting period (actual)").font = Font(bold=True)
        first, last = _table(ws, row + 1, ["Measure", "Amount"],
                             [["Money in", t["money_in"]], ["Money out", t["money_out"]], ["Net cash flow", t["net"]]],
                             {2: CURRENCY}, filters=False)
        row = last + 2
    ws.cell(row=row, column=1, value="Notes").font = Font(bold=True)
    for i, n in enumerate(data.get("notes", []), start=1):
        ws.cell(row=row + i, column=1, value=safe(n))
    ws.freeze_panes = None
    _widths(ws, [42, 18, 60])

    if "monthly" in data:
        mws = wb.create_sheet("Income & Expenses")
        r0 = _title(mws, "Income & Expenses (actual)", data["monthly"]["label"])
        rows_in = data["monthly"]["rows"]
        rows = []
        for i, x in enumerate(rows_in):
            rr = r0 + 1 + i
            rows.append([datetime.strptime(x["month"] + "-01", "%Y-%m-%d"), x["money_in"], x["money_out"], Formula(f"=B{rr}-C{rr}"),
                         x["household_bills"], x["insurance"], x["loan_payments"], x["discretionary"]])
        first, last = _table(mws, r0, ["Month", "Money in", "Money out", "Net cash flow", "Household bills", "Insurance",
                                       "Loan payments", "Discretionary"], rows,
                             {1: "yyyy-mm", 2: CURRENCY, 3: CURRENCY, 4: CURRENCY, 5: CURRENCY, 6: CURRENCY, 7: CURRENCY, 8: CURRENCY})
        if rows:
            tr = last + 1
            mws.cell(row=tr, column=1, value="Total").font = Font(bold=True)
            for col in range(2, 9):
                L = get_column_letter(col)
                c = mws.cell(row=tr, column=col, value=f"=SUM({L}{first}:{L}{last})")
                c.number_format, c.font = CURRENCY, Font(bold=True)
        _widths(mws, [12, 15, 15, 15, 16, 13, 15, 15])

    if "savings" in data or "debts" in data:
        sws = wb.create_sheet("Savings & Debt")
        r = _title(sws, "Savings & Debt", "Savings: calculated · Loans: actual records")
        if "savings" in data:
            sv = data["savings"]
            first, last = _table(sws, r, ["Measure", "Value"], [
                ["Savings buffer (B)", sv["buffer"]], ["Coverage (months of typical spending)", sv["coverage_months"]],
                [f"Emergency fund target ({sv['target_basis']})", sv["target"]], ["Remaining gap", sv["gap"]],
                ["Progress", (sv["progress_pct"] or 0) / 100], ["Suggested monthly saving", sv["monthly_contribution"]],
                ["Months to goal", sv["months_to_goal"] if sv["months_to_goal"] is not None else "needs spending reductions first"],
            ], filters=False)
            for rr, fmt in ((first, CURRENCY), (first + 1, "0.0"), (first + 2, CURRENCY), (first + 3, CURRENCY), (first + 4, PCT), (first + 5, CURRENCY)):
                sws.cell(row=rr, column=2).number_format = fmt
            r = last + 2
        if "debts" in data:
            loans = data["debts"]["loans"]
            sws.cell(row=r, column=1, value="Loans").font = Font(bold=True)
            rows = [[l["loan_id"], datetime.fromisoformat(l["start"]) if l["start"] else None, l["amount"], l["duration_months"],
                     l["monthly_payment"], l["status"], "yes" if l["running"] else "no", l["months_remaining"], l["remaining_scheduled"]] for l in loans]
            if rows:
                _table(sws, r + 1, ["Loan", "Start", "Amount", "Months", "Monthly payment", "Status", "Running", "Months left", "Remaining scheduled"],
                       rows, {2: "yyyy-mm-dd", 3: CURRENCY, 5: CURRENCY, 9: CURRENCY})
            else:
                sws.cell(row=r + 1, column=1, value="No loans on record.")
        _widths(sws, [40, 18, 14, 9, 16, 22, 9, 11, 18])

    if "trends" in data or "resilience" in data:
        tws = wb.create_sheet("Trends")
        r = _title(tws, "Trends & Resilience", "Calculated from actual records; projections are estimates")
        if "resilience" in data:
            rs = data["resilience"]
            tws.cell(row=r, column=1, value=f"Resilience score: {rs['score']:.1f}/100 ({rs['band']}). {rs['label']}").font = Font(bold=True)
            first, last = _table(tws, r + 1, ["Component", "Weight", "Points", "Max points"],
                                 [[c["label"], c["weight"], c["points"], c["max"]] for c in rs["breakdown"]], {2: PCT, 3: "0.0", 4: "0"}, filters=False)
            r = last + 2
        if "trends" in data:
            tr = data["trends"]
            tws.cell(row=r, column=1, value="Spending categories: last 6 vs prior 6 months").font = Font(bold=True)
            first, last = _table(tws, r + 1, ["Category", "Prior 6m avg", "Recent 6m avg", "Change"],
                                 [[c["category"].replace("_", " "), c["prior_6m"], c["recent_6m"], c["change"]] for c in tr["category_changes"]],
                                 {2: CURRENCY, 3: CURRENCY, 4: CURRENCY}, filters=False)
            r = last + 2
            tws.cell(row=r, column=1, value="Month-end balance (chart source data, actual)").font = Font(bold=True)
            first, last = _table(tws, r + 1, ["Month", "Balance"], [[datetime.strptime(x["month"] + "-01", "%Y-%m-%d"), x["balance"]] for x in tr["balance_series"]],
                                 {1: "yyyy-mm", 2: CURRENCY}, filters=False)
            r = last + 2
            f = tr["forecast"]
            if f.get("available"):
                tws.cell(row=r, column=1, value=f"Projection — {tr['forecast_label']}").font = Font(bold=True)
                _table(tws, r + 1, ["Month", "Projected balance", "Lower (95%)", "Upper (95%)"],
                       [[pt["month"], pt["forecast"], pt["lower"], pt["upper"]] for pt in f["points"]], {2: CURRENCY, 3: CURRENCY, 4: CURRENCY}, filters=False)
        tws.freeze_panes = None
        _widths(tws, [36, 16, 16, 16])

    if "scenario" in data:
        sc = data["scenario"]
        cws = wb.create_sheet("Scenarios")
        r = _title(cws, f"Scenario: {sc['name']}", sc["label"])
        rows = []
        for i, (label, before, after) in enumerate(sc["rows"]):
            rr = r + 1 + i
            rows.append([label, before, after, Formula(f"=C{rr}-B{rr}")])
        first, last = _table(cws, r, ["Measure", "Baseline", "After the twist", "Difference"], rows, {2: CURRENCY, 3: CURRENCY, 4: CURRENCY}, filters=False)
        cws.cell(row=last + 1, column=1, value="Runway (months)")
        cws.cell(row=last + 1, column=2, value=sc["runway_before"])
        cws.cell(row=last + 1, column=3, value=sc["runway_after"])
        rr = last + 3
        cws.cell(row=rr, column=1, value="Assumptions").font = Font(bold=True)
        for i, e in enumerate([f"{e['label']}: {e['rule']}" for e in sc["effects"]] + sc["assumptions"] + sc["warnings"], start=1):
            cws.cell(row=rr + i, column=1, value=safe(e))
        if sc["verdict"]:
            cws.cell(row=rr + len(sc["effects"]) + len(sc["assumptions"]) + len(sc["warnings"]) + 2, column=1, value=safe(sc["verdict"]["text"])).font = Font(bold=True)
        cws.freeze_panes = None
        _widths(cws, [44, 16, 16, 16])

    if "recovery" in data:
        rc = data["recovery"]
        rws = wb.create_sheet("Recommendations")
        r = _title(rws, "Recovery & Recommendations", rc["label"])
        first, last = _table(rws, r, ["#", "Recommended action", "Why"], [[i + 1, a["action"], a["why"]] for i, a in enumerate(rc["actions"])])
        r = last + 2
        rws.cell(row=r, column=1, value="Options compared").font = Font(bold=True)
        first, last = _table(rws, r + 1, ["Option", "Spending after", "Monthly gap", "Runway (months)"],
                             [[a["name"], a["spending_after"], a["gap"], a["runway"]] for a in rc["alternatives"]], {2: CURRENCY, 3: CURRENCY}, filters=False)
        r = last + 2
        rws.cell(row=r, column=1, value="Priority expenses").font = Font(bold=True)
        first, last = _table(rws, r + 1, ["Expense", "Monthly", "Priority"], [[p["item"], p["monthly"], p["priority"]] for p in rc["priorities"]], {2: CURRENCY}, filters=False)
        r = last + 2
        g = rc["goal"]
        rws.cell(row=r, column=1, value="Goal plan (3-month emergency fund)").font = Font(bold=True)
        _table(rws, r + 1, ["Measure", "Value"], [["Target", g["target"]], ["Gap", g["gap"]], ["Suggested monthly saving", g["monthly"]],
                                                  ["Months to goal", g["months_to_goal"] if g["months_to_goal"] is not None else "needs reductions first"]],
               {2: CURRENCY}, filters=False)
        rws.freeze_panes = None
        _widths(rws, [36, 60, 70, 16])

    if "judge" in data:
        jws = wb.create_sheet("Judge Summary")
        r = _title(jws, "Judge Demo: Final Summary", " → ".join(data["judge"]["steps"]))
        first, last = _table(jws, r, ["README twist card", "Runway (reference formula)"], [list(x) for x in data["judge"]["reference_check"]], filters=False)
        r = last + 2
        jws.cell(row=r, column=1, value="Key takeaways").font = Font(bold=True)
        for i, t in enumerate(data["judge"]["takeaways"], start=1):
            jws.cell(row=r + i, column=1, value=safe(t))
        jws.freeze_panes = None
        _widths(jws, [70, 26])

    if "investments" in data:
        inv = data["investments"]
        iws = wb.create_sheet("Investments")
        r = _title(iws, "Investments", inv["label"])
        h = inv["valuation"]["holdings"]
        first, last = _table(iws, r, ["Symbol", "Name", "Asset class", "Kind", "Quantity", "Price", "Value", "Weight", "Price source"],
                             [[x["symbol"], x["name"], x["asset_class"], x["holding_kind"], x["quantity"], x["price"], x["value"], x["weight"], x["price_source"]] for x in h],
                             {6: CURRENCY, 7: CURRENCY, 8: PCT})
        if h:
            iws.cell(row=last + 1, column=6, value="Total").font = Font(bold=True)
            c = iws.cell(row=last + 1, column=7, value=f"=SUM(G{first}:G{last})")
            c.number_format, c.font = CURRENCY, Font(bold=True)
        st = inv["stress"]
        if st:
            rr = last + 3
            iws.cell(row=rr, column=1, value=f"Stress test (hypothetical): {st['scenario']}").font = Font(bold=True)
            _table(iws, rr + 1, ["Symbol", "Initial", "Shock %", "Modeled", "Change"],
                   [[x["symbol"], x["initial"], x["shock_pct"] / 100, x["modeled"], x["change"]] for x in st["rows"]], {2: CURRENCY, 3: PCT, 4: CURRENCY, 5: CURRENCY}, filters=False)
        _widths(iws, [12, 36, 12, 13, 12, 14, 16, 10, 16])

    wb.properties.title = f"ClementIQ {m['title']}"
    wb.properties.creator = "ClementIQ"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
