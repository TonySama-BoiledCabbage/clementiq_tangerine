"""Financial report exports (PDF and Excel).

Reports are generated in memory per request and streamed back with `Cache-Control: no-store` —
no temporary files on disk and no public URLs. Every export requires authentication, the same
per-account authorization as the rest of the API, and is audited. Judge reports need the judge role.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..auth import Principal, current_principal
from ..db import get_db
from ..reports.data import REPORTS, SECTION_LABELS, ReportRequest, build_report, holdings_for
from ..reports.pdf import build_pdf
from ..reports.xlsx import build_xlsx
from ..repository import audit

router = APIRouter(prefix="/api/reports", tags=["reports"])
MEDIA = {"pdf": "application/pdf", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}


@router.get("/options")
def options(p: Principal = Depends(current_principal)):
    return {"reports": {k: {"title": v["title"], "sections": v["sections"], "fixed": bool(v.get("fixed")), "needs_account": v["account"]}
                        for k, v in REPORTS.items() if k != "judge" or p.role in ("judge", "admin")},
            "sections": SECTION_LABELS,
            "periods": {"last_1": "Last month", "last_3": "Last 3 months", "last_6": "Last 6 months", "last_12": "Last 12 months",
                        "all": "All available history", "custom": "Custom range"}}


@router.post("/preview")
def preview(req: ReportRequest, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    """What the file will contain — the same data object the exporters use."""
    data = build_report(db, p, req, holdings_for(db))
    m = data["meta"]
    highlights = []
    if "summary" in data:
        highlights += [{"label": l, "value": v, "kind": k} for l, v, k, _ in data["summary"]["rows"][:6]]
    if "monthly" in data:
        t = data["monthly"]["totals"]
        highlights += [{"label": "Period money in", "value": t["money_in"], "kind": "currency"},
                       {"label": "Period money out", "value": t["money_out"], "kind": "currency"}]
    if "scenario" in data:
        highlights.append({"label": f"Runway after “{data['scenario']['name']}”", "value": data["scenario"]["runway_after"], "kind": "text"})
    if "investments" in data:
        highlights.append({"label": "Portfolio value", "value": data["investments"]["valuation"]["total_value"], "kind": "currency"})
    return {"meta": m, "filename": f"{m['filename_stem']}.{req.format}", "highlights": highlights,
            "sections": [{"id": s, "label": SECTION_LABELS[s]} for s in m["sections"]],
            "rows_in_period": len(data.get("monthly", {}).get("rows", []))}


@router.post("/export")
def export(req: ReportRequest, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    data = build_report(db, p, req, holdings_for(db))
    body = build_pdf(data) if req.format == "pdf" else build_xlsx(data)
    filename = f"{data['meta']['filename_stem']}.{req.format}"
    audit(db, p.sub, "report_export", f"account:{req.account_id}", report=req.report, format=req.format,
          period=req.period, sections=data["meta"]["sections"], bytes=len(body))
    return Response(body, media_type=MEDIA[req.format], headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff",
        "Access-Control-Expose-Headers": "Content-Disposition",
    })
