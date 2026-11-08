"""Report data — the single source for PDF and Excel exports.

Every number comes from the same Clement Core functions the dashboard uses (compute_baseline,
compute_runway, resilience_score, apply_shocks, goal_plan, backup_plan, trends, forecast, valuate),
so exported totals match the app. Exporters only format this structure; they hold no business logic.
Each block is labelled actual / calculated / estimate / simulation so readers know what they are seeing.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..auth import JUDGE_ROLES, Principal, authorize_account
from ..config import get_settings
from ..core.analytics import forecast_balance, trends
from ..core.portfolio import STRESS_SCENARIOS, HoldingIn, ScenarioRequest, stress_test, valuate
from ..core.provenance import ENGINE_VERSION
from ..core.recovery import GoalPlanRequest, backup_plan, goal_plan
from ..core.resilience import resilience_score
from ..core.runway import compute_runway
from ..core.shocks import PRESETS, ShockComponent, ShockRequest, apply_shocks
from ..repository import account_profile, get_baseline, monthly_frame, reference_date

ReportType = Literal["financial", "snapshot", "shock", "recovery", "resilience", "timeline", "investments", "judge"]
Period = Literal["last_1", "last_3", "last_6", "last_12", "all", "custom"]

SECTION_LABELS: dict[str, str] = {
    "summary": "Financial summary",
    "income_expenses": "Income and expenses",
    "savings": "Savings",
    "debts": "Debts and loans",
    "resilience": "Financial resilience",
    "cash_flow": "Cash flow",
    "trends": "Charts and trends",
    "scenario": "Scenario results",
    "recovery": "Recovery recommendations",
    "investments": "Investments",
    "judge": "Judge walkthrough",
}

REPORTS: dict[str, dict[str, Any]] = {
    "financial": {"title": "Financial Report", "file": "Financial_Report", "account": True,
                  "sections": ["summary", "income_expenses", "savings", "debts", "cash_flow", "trends", "resilience"]},
    "snapshot": {"title": "Financial Snapshot", "file": "Financial_Snapshot", "account": True,
                 "sections": ["summary", "savings", "debts", "resilience"]},
    "shock": {"title": "Shock Simulation Report", "file": "Shock_Simulation", "account": True,
              "sections": ["summary", "scenario", "recovery"]},
    "recovery": {"title": "Recovery Plan Report", "file": "Recovery_Plan", "account": True,
                 "sections": ["summary", "savings", "scenario", "recovery"]},
    "resilience": {"title": "Financial Resilience Report", "file": "Resilience_Score", "account": True,
                   "sections": ["summary", "resilience", "trends"]},
    "timeline": {"title": "Financial Timeline Report", "file": "Financial_Timeline", "account": True,
                 "sections": ["summary", "cash_flow", "trends"]},
    "investments": {"title": "Investments Report", "file": "Investments", "account": False, "sections": ["investments"]},
    "judge": {"title": "Judge Demo Report", "file": "Judge_Demo", "account": True,
              "sections": ["summary", "scenario", "recovery", "resilience", "judge"], "fixed": True},
}

PERIOD_MONTHS = {"last_1": 1, "last_3": 3, "last_6": 6, "last_12": 12, "all": None}
PERIOD_LABEL = {"last_1": "Last month", "last_3": "Last 3 months", "last_6": "Last 6 months", "last_12": "Last 12 months",
                "all": "All available history", "custom": "Custom range"}
MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
DEFAULT_SHOCK = [ShockComponent(type="job_loss", income_replacement_pct=55, duration_months=6)]


class ReportRequest(BaseModel):
    report: ReportType
    format: Literal["pdf", "xlsx"] = "pdf"
    account_id: int | None = None
    period: Period = "all"
    start: str | None = None   # YYYY-MM (custom)
    end: str | None = None     # YYYY-MM (custom)
    sections: list[str] | None = Field(None, max_length=12)
    shock: ShockRequest | None = None
    goal: GoalPlanRequest | None = None

    @field_validator("sections")
    @classmethod
    def _known(cls, v):
        if v is not None:
            bad = [s for s in v if s not in SECTION_LABELS]
            if bad:
                raise ValueError(f"unknown sections: {bad}")
        return v


def _authorize(req: ReportRequest, p: Principal) -> None:
    meta = REPORTS[req.report]
    if req.report == "judge" and p.role not in JUDGE_ROLES:
        raise HTTPException(403, "Judge Demo reports are only available to authorized judges")
    if meta["account"]:
        if req.account_id is None:
            raise HTTPException(422, "account_id is required for this report")
        authorize_account(p, req.account_id)
    if req.shock is not None and req.shock.account_id != req.account_id:
        raise HTTPException(422, "shock.account_id must match account_id")


def _sections(req: ReportRequest) -> list[str]:
    meta = REPORTS[req.report]
    if meta.get("fixed") or not req.sections:
        return list(meta["sections"])
    return [s for s in req.sections if s in SECTION_LABELS]


def _filter_period(df, req: ReportRequest):
    months = list(df["month"])
    if req.period == "custom":
        if not (req.start and req.end and MONTH.match(req.start) and MONTH.match(req.end)):
            raise HTTPException(422, "Custom range needs start and end as YYYY-MM")
        if req.start > req.end:
            raise HTTPException(422, "Start month must be on or before the end month")
        out = df[(df["month"] >= req.start) & (df["month"] <= req.end)]
        if out.empty:
            raise HTTPException(422, f"No data between {req.start} and {req.end} (data covers {months[0]} to {months[-1]})")
        return out
    n = PERIOD_MONTHS[req.period]
    return df if n is None else df.tail(n)


def _shock(req: ReportRequest) -> ShockRequest:
    if req.shock is not None:
        return req.shock
    return ShockRequest(account_id=req.account_id, components=DEFAULT_SHOCK, mode="judging")


def _shock_name(shock: ShockRequest, effects: list[dict]) -> str:
    comps = [c.model_dump(exclude_none=True) for c in shock.components]
    for pr in PRESETS:
        if [ShockComponent(**c).model_dump(exclude_none=True) for c in pr["components"]] == comps:
            return pr["name"]
    return "Custom: " + " + ".join(e["rule"] for e in effects)


def build_report(db: Session, p: Principal, req: ReportRequest, holdings_loader=None) -> dict[str, Any]:
    _authorize(req, p)
    meta = REPORTS[req.report]
    sections = _sections(req)
    generated = datetime.now(timezone.utc)
    out: dict[str, Any] = {
        "meta": {"report": req.report, "title": meta["title"], "sections": sections, "section_labels": SECTION_LABELS,
                 "generated_at": generated.isoformat(timespec="seconds"), "engine": f"Clement Core {ENGINE_VERSION}",
                 "period": req.period, "period_label": PERIOD_LABEL[req.period], "account_id": req.account_id,
                 "format": req.format},
        "notes": [
            "Typical values (I, S, F, H) are medians over all available months, as defined in the Tangerine challenge; "
            "the buffer B is the average daily balance over the last 6 months.",
            "Monthly tables and period totals use only the months in the selected reporting period.",
            "The buffer is an account balance, not net worth. Other assets and debts are not in the data.",
            "Educational decision support, not financial advice.",
        ],
    }

    if req.report == "investments":
        rows = holdings_loader(p.sub) if holdings_loader else []
        val = valuate(rows)
        stress = stress_test(ScenarioRequest(holdings=rows, scenario_id="bear_market")) if rows else None
        out["investments"] = {"label": "user-entered, demo or hypothetical holdings: not part of the Tangerine data",
                              "valuation": val, "stress": stress, "scenarios": {k: v["name"] for k, v in STRESS_SCENARIOS.items()}}
        out["meta"]["filename_stem"] = f"ClementIQ_{meta['file']}_{generated:%Y-%m}"
        out["meta"]["data_as_of"] = generated.date().isoformat()
        return out

    b = get_baseline(db, req.account_id)
    df = monthly_frame(db, req.account_id)
    period_df = _filter_period(df, req)
    rw = compute_runway(b.B, b.I, b.S)
    out["meta"].update({"data_as_of": b.last_month, "period_start": period_df["month"].iloc[0], "period_end": period_df["month"].iloc[-1],
                        "months_in_period": int(len(period_df)), "reference_date": reference_date().isoformat()})
    stem_ctx = str(req.account_id) if req.report == "judge" else f"{req.account_id}_{b.last_month}"
    out["meta"]["filename_stem"] = f"ClementIQ_{meta['file']}_{stem_ctx}"

    if "summary" in sections:
        out["summary"] = {
            "label": "calculated from actual records (Tangerine judging definitions)",
            "rows": [
                ("Typical monthly income (I)", b.I, "currency", "median(money_in)"),
                ("Typical monthly spending (S)", b.S, "currency", "median(money_out)"),
                ("Fixed costs (F)", b.F, "currency", "median(household_bills + insurance + loan_payments)"),
                ("Household bills (H)", b.H, "currency", "median(household_bills)"),
                ("Savings buffer (B)", b.B, "currency", "mean(avg_daily_balance, last 6 months)"),
                ("Running loan payment (P)", b.P, "currency", "loans.monthly_payment if running at 2025-12-31"),
                ("Typical monthly surplus (I - S)", b.I - b.S, "currency", "I - S"),
                ("Baseline runway (months)", rw.display, "text", "min((B - one_off) / (S - I), 120)"),
            ],
            "months_of_data": b.months_of_data, "first_month": b.first_month, "last_month": b.last_month,
        }

    rows = [{
        "month": r.month, "money_in": float(r.money_in), "money_out": float(r.money_out),
        "household_bills": float(r.household_bills), "insurance": float(r.insurance), "loan_payments": float(r.loan_payments),
        "discretionary": float(r.cash_withdrawals_genuine + r.card_withdrawals + r.transfers_out_other),
        "net": float(r.money_in - r.money_out), "month_end_balance": float(r.month_end_balance),
        "avg_daily_balance": float(r.avg_daily_balance), "days_below_zero": int(r.days_below_zero),
    } for r in period_df.itertuples()]
    totals = {"money_in": sum(x["money_in"] for x in rows), "money_out": sum(x["money_out"] for x in rows)}
    totals["net"] = totals["money_in"] - totals["money_out"]

    if "income_expenses" in sections or "cash_flow" in sections:
        out["monthly"] = {"label": "actual monthly records (monthly_summary.csv)", "rows": rows, "totals": totals}
    if "savings" in sections:
        g = goal_plan(b, req.goal or GoalPlanRequest(account_id=req.account_id))
        out["savings"] = {"label": "calculated", "buffer": b.B, "coverage_months": (b.B / b.S) if b.S > 0 else None,
                          "target": g["target"], "target_basis": g["target_basis"], "gap": g["gap"], "progress_pct": g["progress_pct"],
                          "monthly_contribution": g["recommended_monthly_contribution"], "months_to_goal": g["months_to_goal"],
                          "status": g["status"], "milestones": g["milestones"]}
    if "debts" in sections:
        ref = reference_date()
        loans = []
        for l in db.execute(select(models.Loan).where(models.Loan.account_id == req.account_id)).scalars():
            elapsed = (ref.year - l.loan_start.year) * 12 + (ref.month - l.loan_start.month) if l.loan_start else None
            remaining = max(l.duration_months - elapsed, 0) if elapsed is not None else None
            running = l.status in ("C", "D")
            loans.append({"loan_id": l.loan_id, "start": l.loan_start.isoformat() if l.loan_start else None, "amount": l.amount,
                          "duration_months": l.duration_months, "monthly_payment": l.monthly_payment, "status": l.status_meaning or l.status,
                          "running": running, "months_remaining": remaining if running else 0,
                          "remaining_scheduled": (remaining or 0) * l.monthly_payment if running else 0.0})
        out["debts"] = {"label": "actual loan records (loans.csv); remaining = scheduled payments left, an upper bound", "loans": loans,
                        "standing_orders_total": account_profile(db, req.account_id)["standing_orders_total"]}
    if "resilience" in sections:
        r = resilience_score(b)
        out["resilience"] = {"label": "calculated, educational metric (not a credit score)", "score": r["score"], "band": r["band"],
                             "breakdown": [{"label": c["label"], "weight": c["weight"], "points": c["points"], "max": c["max_points"]} for c in r["breakdown"]],
                             "strengths": r["strengths"], "risks": r["risks"], "improvements": r["improvements"]}
    if "trends" in sections:
        t = trends(period_df if len(period_df) >= 12 else df)
        f = forecast_balance(df)
        out["trends"] = {"label": "calculated from actual records", "category_changes": t.get("category_changes", []),
                         "forecast": f, "forecast_label": "a statistical estimate, not a prediction",
                         "balance_series": [{"month": x["month"], "balance": x["month_end_balance"]} for x in rows]}
        out.setdefault("monthly", {"label": "actual monthly records", "rows": rows, "totals": totals})
    if "scenario" in sections or "recovery" in sections or req.report == "judge":
        shock = _shock(req)
        sim = apply_shocks(b, shock, get_settings().ei_max_weekly_benefit)
        out["scenario"] = {
            "label": "simulation (hypothetical): Judging Mode formulas" if shock.mode == "judging" else "simulation (hypothetical): extended assumptions",
            "name": _shock_name(shock, sim["effects"]), "mode": shock.mode,
            "effects": [{"label": e["label"], "rule": e["rule"]} for e in sim["effects"]],
            "rows": [
                ("Monthly income", sim["baseline"]["income"], sim["scenario"]["income"]),
                ("Monthly spending", sim["baseline"]["spending"], sim["scenario"]["spending"]),
                ("Monthly shortfall", max(sim["baseline"]["gap"], 0), max(sim["scenario"]["gap"], 0)),
                ("Buffer after one-off costs", sim["baseline"]["B"], sim["scenario"]["buffer_left"]),
            ],
            "runway_before": sim["baseline"]["runway"]["display"], "runway_after": sim["scenario"]["runway"]["display"],
            "one_off_costs": sim["scenario"]["one_off_costs"], "verdict": sim["verdict"], "assumptions": sim["assumptions"],
            "warnings": sim["warnings"], "shock_request": shock.model_dump(),
        }
        if "recovery" in sections or req.report == "judge":
            bp = backup_plan(b, shock, get_settings().ei_max_weekly_benefit)
            gp = goal_plan(b, req.goal or GoalPlanRequest(account_id=req.account_id))
            best = bp["best_tier"]
            out["recovery"] = {
                "label": "calculated options (modeled, not guarantees)",
                "actions": [{"action": a["action"], "why": a["why"]} for a in bp["immediate_actions"]],
                "priorities": [{"item": x["item"], "monthly": x["monthly"], "priority": x["priority"]} for x in bp["priority_expenses"]],
                "alternatives": [{"name": a.get("name", ""), "spending_after": a["spending_after"], "gap": a["gap"], "runway": a["runway"]["display"]} for a in bp["alternatives"]],
                "monthly_shortfall": bp["monthly_shortfall"],
                "best": {"cut_pct": best["discretionary_cut_pct"], "runway": best["runway"]["display"], "no_shortfall": best["runway"]["no_shortfall"],
                         "improvement": bp["runway_improvement_months"]},
                "goal": {"target": gp["target"], "gap": gp["gap"], "monthly": gp["recommended_monthly_contribution"], "months_to_goal": gp["months_to_goal"]},
            }
    if req.report == "judge":
        I, S, H, B = b.I, b.S, b.H, b.B
        ref_rows = [("EI 55% (6 months)", compute_runway(B, 0.55 * I, S).display),
                    ("Furnace = 1 × S", compute_runway(B, I, S, S).display),
                    ("EI 55% + bills +15%", compute_runway(B, 0.55 * I, S + 0.15 * H).display)]
        sc = out["scenario"]
        takeaways = [f"Runway changes from {sc['runway_before']} to {sc['runway_after']} under “{sc['name']}”."]
        if sc["verdict"]:
            takeaways.append(sc["verdict"]["text"])
        rec = out["recovery"]
        takeaways.append("Best modeled response: trim discretionary outflows "
                         f"{rec['best']['cut_pct']}% → " + ("the monthly gap closes entirely." if rec["best"]["no_shortfall"] else f"runway {rec['best']['runway']} months."))
        if rec["actions"]:
            takeaways.append(f"Top recommendation: {rec['actions'][0]['action']}")
        out["judge"] = {"steps": ["1. Know the Customer", "2. Choose the Twist", "3. See the New Numbers", "4. Recovery & Recommendations", "Final Judge Summary"],
                        "reference_check": ref_rows, "takeaways": takeaways}
    return out


def holdings_for(db: Session):
    """Loader for the principal's own portfolio (never another user's)."""
    def load(owner: str) -> list[HoldingIn]:
        from ..routers.investments import _holdings_in
        return _holdings_in(db, owner)
    return load
