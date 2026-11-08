"""PDF and Excel report exports: real files, matching totals, sections, periods, authorization, injection safety."""
import io

import pytest

from openpyxl import load_workbook


def _xlsx(r):
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/vnd.openxmlformats")
    return load_workbook(io.BytesIO(r.content))


def test_pdf_is_a_real_pdf_with_context_filename(client, judge):
    r = client.post("/api/reports/export", headers=judge, json={"report": "financial", "format": "pdf", "account_id": 1001})
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    assert r.headers["content-disposition"] == 'attachment; filename="ClementIQ_Financial_Report_1001_2025-08.pdf"'
    assert "no-store" in r.headers["cache-control"]


def test_xlsx_totals_match_the_app(client, judge):
    summary = client.get("/api/accounts/1001/summary", headers=judge).json()
    wb = _xlsx(client.post("/api/reports/export", headers=judge, json={"report": "financial", "format": "xlsx", "account_id": 1001}))
    assert {"Summary", "Income & Expenses", "Savings & Debt", "Trends"} <= set(wb.sheetnames)
    ws = wb["Summary"]
    values = {ws.cell(row=r, column=1).value: ws.cell(row=r, column=2).value for r in range(1, ws.max_row + 1)}
    assert values["Typical monthly income (I)"] == pytest.approx(summary["judging"]["I"])
    assert values["Savings buffer (B)"] == pytest.approx(summary["judging"]["B"])
    assert values["Baseline runway (months)"] == summary["judging"]["runway"]["display"]
    ie = wb["Income & Expenses"]
    months = [ie.cell(row=r, column=1).value for r in range(5, ie.max_row) if ie.cell(row=r, column=1).value not in (None, "Total")]
    assert len(months) == len(summary["series"])                                   # "all" period → every month
    assert ie.cell(row=5, column=4).value == "=B5-C5"                              # real formula, not text
    assert ie.cell(row=5, column=2).number_format.startswith('"$"')
    assert ie.freeze_panes == "A5" and ie.auto_filter.ref


def test_period_and_sections_are_respected(client, judge):
    wb = _xlsx(client.post("/api/reports/export", headers=judge, json={
        "report": "financial", "format": "xlsx", "account_id": 1001, "period": "last_3", "sections": ["summary", "income_expenses"]}))
    assert wb.sheetnames == ["Summary", "Income & Expenses"]
    ie = wb["Income & Expenses"]
    rows = [ie.cell(row=r, column=1).value for r in range(5, ie.max_row + 1)]
    assert rows.count("Total") == 1 and len([x for x in rows if x not in (None, "Total")]) == 3
    custom = client.post("/api/reports/preview", headers=judge, json={"report": "financial", "account_id": 1001, "period": "custom", "start": "2025-02", "end": "2025-04"}).json()
    assert custom["meta"]["period_start"] == "2025-02" and custom["meta"]["period_end"] == "2025-04" and custom["rows_in_period"] == 3
    bad = client.post("/api/reports/preview", headers=judge, json={"report": "financial", "account_id": 1001, "period": "custom", "start": "2025-05", "end": "2025-02"})
    assert bad.status_code == 422
    none = client.post("/api/reports/preview", headers=judge, json={"report": "financial", "account_id": 1001, "period": "custom", "start": "2019-01", "end": "2019-02"})
    assert none.status_code == 422 and "No data" in none.json()["detail"]


def test_shock_report_uses_the_same_simulation(client, judge):
    shock = {"account_id": 1001, "components": [{"type": "job_loss", "income_replacement_pct": 55}, {"type": "bill_inflation", "pct": 15}], "mode": "judging"}
    sim = client.post("/api/shocks/simulate", headers=judge, json=shock).json()
    wb = _xlsx(client.post("/api/reports/export", headers=judge, json={"report": "shock", "format": "xlsx", "account_id": 1001, "shock": shock}))
    ws = wb["Scenarios"]
    assert ws["C5"].value == pytest.approx(sim["scenario"]["income"]) and ws["D5"].value == "=C5-B5"
    found = [ws.cell(row=r, column=3).value for r in range(1, ws.max_row + 1)]
    assert sim["scenario"]["runway"]["display"] in found and "Recommendations" in wb.sheetnames


def test_judge_report_and_authorization(client, judge, customer_1001):
    r = client.post("/api/reports/export", headers=judge, json={"report": "judge", "format": "pdf", "account_id": 1002})
    assert r.status_code == 200 and 'filename="ClementIQ_Judge_Demo_1002.pdf"' in r.headers["content-disposition"]
    wb = _xlsx(client.post("/api/reports/export", headers=judge, json={"report": "judge", "format": "xlsx", "account_id": 1002}))
    assert "Judge Summary" in wb.sheetnames
    assert client.post("/api/reports/export", headers=customer_1001, json={"report": "judge", "format": "pdf", "account_id": 1001}).status_code == 403
    assert client.post("/api/reports/export", headers=customer_1001, json={"report": "financial", "format": "pdf", "account_id": 1002}).status_code == 403
    assert client.post("/api/reports/export", headers=customer_1001, json={"report": "financial", "format": "pdf", "account_id": 1001}).status_code == 200
    assert client.post("/api/reports/export", json={"report": "financial", "format": "pdf", "account_id": 1001}).status_code == 401
    assert "judge" not in client.get("/api/reports/options", headers=customer_1001).json()["reports"]


def test_formula_injection_is_neutralised(client, customer_1001):
    client.post("/api/investments/holdings", headers=customer_1001, json={
        "symbol": "EVIL", "name": "=HYPERLINK(\"http://x\",\"click\")", "asset_class": "stock", "quantity": 1, "price": 10, "holding_kind": "hypothetical"})
    wb = _xlsx(client.post("/api/reports/export", headers=customer_1001, json={"report": "investments", "format": "xlsx"}))
    ws = wb["Investments"]
    names = [ws.cell(row=r, column=2).value for r in range(1, ws.max_row + 1)]
    evil = next(n for n in names if n and "HYPERLINK" in n)
    assert not evil.startswith("=") and evil.startswith("'")


def test_unknown_section_rejected(client, judge):
    assert client.post("/api/reports/export", headers=judge, json={"report": "financial", "account_id": 1001, "sections": ["passwords"]}).status_code == 422
