"""PDF exporter — formats the report data built in reports/data.py (no business logic here).

Printable, mostly-white pages with ClementIQ orange accents, a branded header, page numbers
("Page X of Y"), tables, simple charts (always accompanied by a table or text), insights and notes.
Document title/author/subject metadata is set; full PDF/UA tagging is not supported by ReportLab.
"""
from __future__ import annotations

import io
from typing import Any

from reportlab.graphics.charts.barcharts import HorizontalBarChart
from reportlab.graphics.charts.legends import Legend
from reportlab.graphics.charts.linecharts import HorizontalLineChart
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ORANGE = colors.HexColor("#FF6B00")
PEACH = colors.HexColor("#FFF0E5")
INK = colors.HexColor("#111827")
INK2 = colors.HexColor("#475569")
LINE = colors.HexColor("#E8D5C4")
BLUE = colors.HexColor("#2A78D6")
VIOLET = colors.HexColor("#7C3AED")

ss = getSampleStyleSheet()
H1 = ParagraphStyle("h1", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=20, textColor=INK, alignment=TA_LEFT, spaceAfter=4)
H2 = ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=13, textColor=colors.HexColor("#7A2E00"), spaceBefore=12, spaceAfter=6, keepWithNext=1)
BODY = ParagraphStyle("body", parent=ss["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13, textColor=INK)
SMALL = ParagraphStyle("small", parent=BODY, fontSize=8, leading=10.5, textColor=INK2)
LABEL = ParagraphStyle("label", parent=SMALL, fontName="Helvetica-Oblique")


def money(v: float | None) -> str:
    if v is None:
        return "—"
    return f"-${abs(v):,.2f}" if v < 0 else f"${v:,.2f}"


def esc(s: Any) -> str:
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class NumberedCanvas(rl_canvas.Canvas):
    """Two-pass canvas so every page can show 'Page X of Y' plus the branded header and footer."""

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self._saved: list[dict] = []
        self.report_title = ""

    def showPage(self):
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state)
            self._decorate(total)
            super().showPage()
        super().save()

    def _decorate(self, total: int):
        w, h = LETTER
        self.setFillColor(ORANGE)
        self.rect(0, h - 0.32 * inch, w, 0.32 * inch, fill=1, stroke=0)
        self.setFillColor(colors.white)
        self.setFont("Helvetica-Bold", 10)
        self.drawString(0.6 * inch, h - 0.22 * inch, "ClementIQ  ·  AI Financial Resilience")
        self.setFont("Helvetica", 8.5)
        self.drawRightString(w - 0.6 * inch, h - 0.22 * inch, self.report_title)
        self.setStrokeColor(LINE)
        self.line(0.6 * inch, 0.55 * inch, w - 0.6 * inch, 0.55 * inch)
        self.setFillColor(INK2)
        self.setFont("Helvetica", 7.5)
        self.drawString(0.6 * inch, 0.38 * inch, "Educational decision support, not financial advice. Confidential: contains financial information.")
        self.drawRightString(w - 0.6 * inch, 0.38 * inch, f"Page {self._pageNumber} of {total}")


def table(rows: list[list[Any]], widths: list[float], header: bool = True, align_right_from: int = 1, align_right_to: int = -1) -> Table:
    data = [[Paragraph(esc(c), SMALL if i else BODY) if isinstance(c, str) and len(c) > 40 else c for c in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("FONT", (0, 0), (-1, -1), "Helvetica", 8.8),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("ALIGN", (align_right_from, 0), (align_right_to, -1), "RIGHT"),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), PEACH), ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8.8)]
    t.setStyle(TableStyle(style))
    return t


def line_chart(series: list[tuple[str, list[float], Any]], labels: list[str], title: str) -> Drawing:
    d = Drawing(6.9 * inch, 2.2 * inch)
    d.add(String(0, 2.08 * inch, title, fontName="Helvetica-Bold", fontSize=9, fillColor=INK))
    ch = HorizontalLineChart()
    ch.x, ch.y, ch.width, ch.height = 50, 30, 6.9 * inch - 70, 2.2 * inch - 70
    ch.data = [s[1] for s in series]
    ch.categoryAxis.categoryNames = [l if i % max(len(labels) // 8, 1) == 0 else "" for i, l in enumerate(labels)]
    ch.categoryAxis.labels.fontSize = 6.5
    ch.categoryAxis.labels.angle = 0
    ch.valueAxis.labels.fontSize = 6.5
    ch.valueAxis.labelTextFormat = lambda v: f"${v / 1000:,.0f}k" if abs(v) >= 1000 else f"${v:,.0f}"
    ch.valueAxis.gridStrokeColor = LINE
    ch.valueAxis.visibleGrid = True
    for i, s in enumerate(series):
        ch.lines[i].strokeColor = s[2]
        ch.lines[i].strokeWidth = 1.6
        if i == 1:
            ch.lines[i].strokeDashArray = (4, 2)   # second series dashed: identity not by colour alone
    d.add(ch)
    lg = Legend()
    lg.x, lg.y = 6.9 * inch - 210, 2.08 * inch
    lg.colorNamePairs = [(s[2], s[0] + (" (dashed)" if i == 1 else "")) for i, s in enumerate(series)]
    lg.fontSize, lg.columnMaximum, lg.alignment = 7, 1, "right"
    lg.dx, lg.dy, lg.deltax = 8, 4, 90
    d.add(lg)
    return d


def bar_chart(items: list[tuple[str, float]], title: str, maxv: float) -> Drawing:
    h = 0.32 * inch * len(items) + 0.85 * inch
    d = Drawing(6.9 * inch, h)
    d.add(String(0, h - 12, title, fontName="Helvetica-Bold", fontSize=9, fillColor=INK))
    ch = HorizontalBarChart()
    ch.x, ch.y, ch.width, ch.height = 150, 26, 6.9 * inch - 190, h - 50
    ch.data = [[v for _, v in items]]
    ch.categoryAxis.categoryNames = [n for n, _ in items]
    ch.categoryAxis.labels.fontSize = 7.5
    ch.valueAxis.valueMin, ch.valueAxis.valueMax = 0, maxv
    ch.valueAxis.labels.fontSize = 7
    ch.bars[0].fillColor = ORANGE
    ch.bars[0].strokeColor = None
    ch.barLabelFormat = "%.1f"
    ch.barLabels.fontSize = 7
    ch.barLabels.nudge = 10
    d.add(ch)
    return d


def build_pdf(data: dict[str, Any]) -> bytes:
    m = data["meta"]
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=LETTER, leftMargin=0.6 * inch, rightMargin=0.6 * inch, topMargin=0.6 * inch, bottomMargin=0.75 * inch,
                            title=f"ClementIQ {m['title']}", author="ClementIQ", subject=f"{m['title']} · {m['period_label']}",
                            creator="ClementIQ (Clement Core)")
    W = doc.width
    s: list[Any] = []
    s.append(Paragraph(esc(m["title"]), H1))
    who = f"Account <b>#{m['account_id']}</b> · " if m.get("account_id") else ""
    rng = f" ({m['period_start']} to {m['period_end']}, {m['months_in_period']} months)" if m.get("period_start") else ""
    s.append(Paragraph(f"{who}Reporting period: <b>{esc(m['period_label'])}</b>{rng}<br/>Data as of {esc(m.get('data_as_of'))} · "
                       f"generated {esc(m['generated_at'])} · {esc(m['engine'])}", SMALL))
    s.append(Spacer(1, 8))

    if "judge" in data:
        s.append(Paragraph("Walkthrough: " + " → ".join(esc(x) for x in data["judge"]["steps"]), BODY))

    if "summary" in data:
        sm = data["summary"]
        s.append(Paragraph(("1. Know the Customer" if "judge" in data else "Financial summary"), H2))
        s.append(Paragraph(f"Values are {esc(sm['label'])}, using {sm['months_of_data']} months of records ({sm['first_month']} to {sm['last_month']}).", LABEL))
        rows = [["Indicator", "Value", "How it is calculated"]] + [[l, money(v) if k == "currency" else str(v), how] for l, v, k, how in sm["rows"]]
        s.append(table(rows, [2.3 * inch, 1.2 * inch, W - 3.5 * inch], align_right_from=1, align_right_to=1))

    if "monthly" in data and ("income_expenses" in m["sections"] or "cash_flow" in m["sections"]):
        mo = data["monthly"]
        t = mo["totals"]
        s.append(Paragraph("Income, expenses and cash flow", H2))
        s.append(Paragraph(f"In this period money in totalled <b>{money(t['money_in'])}</b> and money out <b>{money(t['money_out'])}</b>, "
                           f"a net cash flow of <b>{money(t['net'])}</b>. ({esc(mo['label'])})", BODY))
        rws = mo["rows"]
        if len(rws) >= 2:
            s.append(line_chart([("Money in", [r["money_in"] for r in rws], BLUE), ("Money out", [r["money_out"] for r in rws], ORANGE)],
                                [r["month"] for r in rws], "Money in vs money out by month"))
        rows = [["Month", "Money in", "Money out", "Net", "Bills", "Loans", "Discretionary"]] + [
            [r["month"], money(r["money_in"]), money(r["money_out"]), money(r["net"]), money(r["household_bills"]), money(r["loan_payments"]), money(r["discretionary"])] for r in rws]
        rows.append(["Total", money(t["money_in"]), money(t["money_out"]), money(t["net"]), "", "", ""])
        tb = table(rows, [0.8 * inch] + [(W - 0.8 * inch) / 6] * 6)
        tb.setStyle(TableStyle([("FONT", (0, -1), (-1, -1), "Helvetica-Bold", 8.8)]))
        s.append(tb)

    if "savings" in data:
        sv = data["savings"]
        s.append(Paragraph("Savings and emergency fund", H2))
        if sv["months_to_goal"] == 0:
            plan = "The target is already reached."
        elif sv["months_to_goal"] is None:
            plan = "Typical spending currently uses all income, so spending reductions are needed before saving can start."
        else:
            plan = f"Saving <b>{money(sv['monthly_contribution'])}</b> a month reaches it in about {sv['months_to_goal']} months."
        s.append(Paragraph(f"The savings buffer is <b>{money(sv['buffer'])}</b>"
                           + (f", about <b>{sv['coverage_months']:.1f} months</b> of typical spending" if sv["coverage_months"] is not None else "")
                           + f". The 3-month target is <b>{money(sv['target'])}</b> ({esc(sv['target_basis'])}); the gap is <b>{money(sv['gap'])}</b>. "
                           f"{plan} ({esc(sv['label'])})", BODY))

    if "debts" in data:
        dt = data["debts"]
        s.append(Paragraph("Debts and loans", H2))
        if dt["loans"]:
            rows = [["Loan", "Start", "Amount", "Monthly", "Status", "Months left", "Remaining scheduled"]] + [
                [str(l["loan_id"]), l["start"] or "—", money(l["amount"]), money(l["monthly_payment"]), l["status"], str(l["months_remaining"]), money(l["remaining_scheduled"])] for l in dt["loans"]]
            s.append(table(rows, [0.7 * inch, 0.85 * inch, 0.95 * inch, 0.85 * inch, 1.5 * inch, 0.8 * inch, W - 5.65 * inch], align_right_from=2))
        else:
            s.append(Paragraph("No loans on record for this account.", BODY))
        s.append(Paragraph(esc(dt["label"]), LABEL))

    if "scenario" in data:
        sc = data["scenario"]
        s.append(Paragraph(("2. The Twist and 3. The New Numbers" if "judge" in data else "Scenario results"), H2))
        s.append(Paragraph(f"Scenario: <b>{esc(sc['name'])}</b> — {esc(sc['label'])}.", BODY))
        s.append(Paragraph("Assumptions: " + "; ".join(esc(f"{e['label']}: {e['rule']}") for e in sc["effects"]) + ". " + " ".join(esc(a) for a in sc["assumptions"]), SMALL))
        rows = [["Measure", "Baseline", "After the twist", "Difference"]] + [[l, money(a), money(b), money(b - a)] for l, a, b in sc["rows"]]
        rows.append(["Runway (months)", sc["runway_before"], sc["runway_after"], ""])
        s.append(table(rows, [2.4 * inch, 1.5 * inch, 1.5 * inch, W - 5.4 * inch]))
        if sc["verdict"]:
            s.append(Spacer(1, 4))
            s.append(Paragraph(f"<b>{esc(sc['verdict']['text'])}</b>", BODY))

    if "recovery" in data:
        rc = data["recovery"]
        s.append(Paragraph(("4. Recovery & Recommendations" if "judge" in data else "Recovery recommendations"), H2))
        s.append(Paragraph(f"Under this scenario the monthly shortfall is <b>{money(rc['monthly_shortfall'])}</b>. Discretionary outflows are the only "
                           f"spending not committed to bills or loans, so trimming them is modeled first. ({esc(rc['label'])})", BODY))
        for i, a in enumerate(rc["actions"], start=1):
            s.append(Paragraph(f"<b>{i}. {esc(a['action'])}</b> <font color='#475569'>{esc(a['why'])}</font>", BODY))
        rows = [["Option", "Spending after", "Monthly gap", "Runway"]] + [[a["name"], money(a["spending_after"]), money(a["gap"]), a["runway"]] for a in rc["alternatives"]]
        s.append(Spacer(1, 4))
        s.append(table(rows, [2.6 * inch, 1.4 * inch, 1.4 * inch, W - 5.4 * inch]))
        g = rc["goal"]
        s.append(Paragraph(f"Goal Plan: target {money(g['target'])}, gap {money(g['gap'])}, suggested saving {money(g['monthly'])}/month.", SMALL))

    if "resilience" in data:
        rs = data["resilience"]
        s.append(Paragraph("Financial resilience", H2))
        s.append(Paragraph(f"Resilience score <b>{rs['score']:.0f}/100 ({esc(rs['band'])})</b>. Strengths: {esc(', '.join(rs['strengths']) or 'none above 70%')}. "
                           f"Main risks: {esc(', '.join(rs['risks']) or 'none flagged')}. ({esc(rs['label'])})", BODY))
        s.append(bar_chart([(c["label"], c["points"]) for c in rs["breakdown"]], "Points earned per component", max(c["max"] for c in rs["breakdown"])))
        rows = [["Component", "Weight", "Points", "Max"]] + [[c["label"], f"{c['weight']:.0%}", f"{c['points']:.1f}", f"{c['max']:.0f}"] for c in rs["breakdown"]]
        s.append(table(rows, [3.2 * inch, 1.1 * inch, 1.1 * inch, W - 5.4 * inch]))

    if "trends" in data:
        tr = data["trends"]
        s.append(Paragraph("Charts and trends", H2))
        bs = tr["balance_series"]
        if len(bs) >= 2:
            s.append(line_chart([("Month-end balance", [x["balance"] for x in bs], VIOLET)], [x["month"] for x in bs], "Month-end balance (actual)"))
        if tr["category_changes"]:
            rows = [["Spending category", "Prior 6m avg", "Recent 6m avg", "Change"]] + [
                [c["category"].replace("_", " "), money(c["prior_6m"]), money(c["recent_6m"]), money(c["change"])] for c in tr["category_changes"]]
            s.append(table(rows, [2.6 * inch, 1.4 * inch, 1.4 * inch, W - 5.4 * inch]))
        f = tr["forecast"]
        if f.get("available"):
            last = f["points"][-1]
            s.append(Paragraph(f"Projection ({esc(tr['forecast_label'])}): month-end balance around {money(last['forecast'])} by {last['month']} "
                               f"(95% range {money(last['lower'])} to {money(last['upper'])}).", SMALL))

    if "judge" in data:
        jd = data["judge"]
        s.append(Paragraph("Final Judge Summary", H2))
        rows = [["README twist card", "Runway (reference formula)"]] + [list(x) for x in jd["reference_check"]]
        s.append(table(rows, [4.4 * inch, W - 4.4 * inch]))
        s.append(Spacer(1, 4))
        s.append(KeepTogether([Paragraph("<b>Key takeaways</b>", BODY)] + [Paragraph("• " + esc(t), BODY) for t in jd["takeaways"]]))

    if "investments" in data:
        inv = data["investments"]
        v = inv["valuation"]
        s.append(Paragraph("Investments", H2))
        s.append(Paragraph(f"Portfolio value <b>{money(v['total_value'])}</b> ({esc(inv['label'])}). Concentration: {esc(v['concentration']['flag'])}.", BODY))
        if v["holdings"]:
            rows = [["Symbol", "Class", "Kind", "Quantity", "Price", "Value"]] + [
                [h["symbol"], h["asset_class"], h["holding_kind"], f"{h['quantity']:g}", money(h["price"]), money(h["value"])] for h in v["holdings"]]
            s.append(table(rows, [1 * inch, 1 * inch, 1.1 * inch, 1 * inch, 1.3 * inch, W - 5.4 * inch], align_right_from=3))
        else:
            s.append(Paragraph("No holdings saved.", BODY))
        if inv["stress"]:
            st = inv["stress"]
            s.append(Paragraph(f"Stress test (hypothetical) — {esc(st['scenario'])}: {money(st['initial_value'])} → {money(st['modeled_value'])}.", SMALL))

    s.append(Paragraph("Notes and data limitations", H2))
    for n in data.get("notes", []):
        s.append(Paragraph("• " + esc(n), SMALL))
    s.append(Paragraph("Labels: <i>actual</i> = recorded data; <i>calculated</i> = Clement Core formulas on actual data; "
                       "<i>estimate</i> = statistical projection; <i>simulation</i> = hypothetical scenario.", SMALL))

    def make_canvas(*a, **kw):
        c = NumberedCanvas(*a, **kw)
        c.report_title = f"{m['title']}" + (f" · #{m['account_id']}" if m.get("account_id") else "")
        return c

    doc.build(s, canvasmaker=make_canvas)
    return buf.getvalue()
