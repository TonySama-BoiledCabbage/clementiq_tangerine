"""Personalised recovery planning: Goal Plan (emergency fund) and Backup Plan (shock response).

All figures are deterministic Clement Core calculations from the customer's own baseline.
Suggested reductions are modeled possibilities, never guaranteed savings, and no plan assumes the
customer qualifies for assistance programs.
"""
from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import BaseModel, Field

from .metrics import DISCRETIONARY_COLS, Baseline
from .provenance import envelope
from .runway import compute_runway
from .shocks import ShockRequest, apply_shocks

CATEGORY_LABELS = {
    "cash_withdrawals_genuine": "Cash withdrawals",
    "card_withdrawals": "Card purchases",
    "transfers_out_other": "Other transfers out",
}


class GoalPlanRequest(BaseModel):
    account_id: int
    target_months: float = Field(3, ge=0.5, le=24)
    target_basis: Literal["spending", "fixed_costs", "custom"] = "spending"
    custom_target: float | None = Field(None, ge=0, le=10_000_000)
    contribution_share_pct: float = Field(50, ge=1, le=100,
        description="share of free monthly cash directed to the goal")
    discretionary_cut_pct: float = Field(0, ge=0, le=60)
    deadline_months: int | None = Field(None, ge=1, le=120)


class BackupPlanRequest(BaseModel):
    account_id: int
    shock: ShockRequest | None = None
    preset_id: str | None = "ei55_6m"


def _reductions(b: Baseline) -> list[dict[str, Any]]:
    out = []
    for col in DISCRETIONARY_COLS:
        med = b.category_medians.get(col, 0.0)
        if med <= 0:
            continue
        out.append({
            "category": col, "label": CATEGORY_LABELS[col], "monthly_median": med,
            "options": [{"cut_pct": p, "monthly_saving": med * p / 100} for p in (5, 10, 15, 25)],
            "basis": f"median({col}) over {b.months_of_data} months",
        })
    return out


def goal_plan(b: Baseline, req: GoalPlanRequest) -> dict[str, Any]:
    if req.target_basis == "custom":
        if req.custom_target is None:
            raise ValueError("custom_target required when target_basis='custom'")
        target = req.custom_target
        basis_desc = "custom amount"
    elif req.target_basis == "fixed_costs":
        target = req.target_months * b.F
        basis_desc = f"{req.target_months:g} × F (fixed costs)"
    else:
        target = req.target_months * b.S
        basis_desc = f"{req.target_months:g} × S (typical spending)"

    current = max(b.B, 0.0)
    gap = max(target - current, 0.0)
    surplus = b.I - b.S
    cut_amount = req.discretionary_cut_pct / 100.0 * b.D
    free_cash = surplus + cut_amount
    share = req.contribution_share_pct / 100.0
    contribution = free_cash * share if free_cash > 0 else 0.0
    assumptions = [
        "Buffer B (6-month average balance) is treated as current emergency savings.",
        f"{req.contribution_share_pct:g}% of free monthly cash (I − S + cuts) is set aside.",
        "Future income and spending are assumed to stay at their typical (median) levels.",
    ]
    required_for_deadline = None
    if req.deadline_months:
        required_for_deadline = gap / req.deadline_months
        if required_for_deadline > contribution:
            needed_free = required_for_deadline / share
            extra = needed_free - max(surplus, 0)
            required_for_deadline = {
                "monthly": gap / req.deadline_months,
                "achievable_with_current_settings": False,
                "additional_monthly_needed": max(extra - cut_amount, 0.0),
                "discretionary_cut_pct_needed": (min(100.0, max(extra, 0) / b.D * 100) if b.D > 0 else None),
            }
        else:
            required_for_deadline = {"monthly": gap / req.deadline_months,
                                     "achievable_with_current_settings": True}

    if gap == 0:
        months_to_goal: int | None = 0
        status = "reached"
    elif contribution <= 0:
        months_to_goal = None
        status = "no_capacity"
    else:
        months_to_goal = math.ceil(gap / contribution)
        status = "on_track" if months_to_goal <= 24 else "long_horizon"

    milestones = []
    for frac in (0.25, 0.5, 0.75, 1.0):
        amt = frac * target
        if current >= amt:
            m: int | None = 0
        elif contribution > 0:
            m = math.ceil((amt - current) / contribution)
        else:
            m = None
        milestones.append({"pct": int(frac * 100), "amount": amt, "month": m, "reached": current >= amt})

    horizon = min(months_to_goal or 24, 120) if months_to_goal != 0 else 12
    trajectory = [{"month": i, "savings": min(current + contribution * i, max(target, current))
                   if contribution > 0 else current, "target": target} for i in range(0, horizon + 1)]

    capacity_hint = None
    if status == "no_capacity":
        need = -surplus if surplus < 0 else 0.0
        capacity_hint = {
            "message": "Spending typically meets or exceeds income, so there is no free cash to save "
                       "without reductions.",
            "monthly_shortfall": need,
            "discretionary_cut_pct_to_break_even": (min(100.0, need / b.D * 100) if b.D > 0 else None),
        }

    payload = {
        "plan_type": "goal",
        "account_id": b.account_id,
        "inputs": req.model_dump(),
        "current_buffer": current,
        "target": target,
        "target_basis": basis_desc,
        "gap": gap,
        "progress_pct": (min(current / target, 1.0) * 100 if target > 0 else 100.0),
        "monthly_surplus": surplus,
        "discretionary_cut_amount": cut_amount,
        "recommended_monthly_contribution": contribution,
        "months_to_goal": months_to_goal,
        "status": status,
        "deadline": required_for_deadline,
        "milestones": milestones,
        "trajectory": trajectory,
        "suggested_reductions": _reductions(b),
        "capacity_hint": capacity_hint,
        "assumptions": assumptions,
        "disclaimer": "Modeled savings are estimates, not guarantees.",
    }
    return envelope(payload, {"baseline": b.judging_dict(), "req": req.model_dump()})


def backup_plan(b: Baseline, shock: ShockRequest, ei_weekly_max: float = 695.0) -> dict[str, Any]:
    sim = apply_shocks(b, shock, ei_weekly_max)
    sc = sim["scenario"]
    income_after, spending_after, one_off = sc["income"], sc["spending"], sc["one_off_costs"]
    gap = spending_after - income_after
    med = b.category_medians

    priority = [
        {"item": "Household bills (rent, utilities)", "monthly": b.H, "priority": "essential",
         "basis": "median(household_bills)"},
        {"item": "Insurance", "monthly": med.get("insurance", 0.0), "priority": "essential",
         "basis": "median(insurance)"},
        {"item": "Loan payment", "monthly": b.P, "priority": "contractual",
         "basis": "loans.csv monthly_payment (running loan)" if b.P else "no running loan"},
        {"item": "Bank fees", "monthly": med.get("bank_fees", 0.0), "priority": "reducible",
         "basis": "median(bank_fees)"},
    ]
    priority = [p for p in priority if p["monthly"] > 0]

    tiers = []
    for pct in (0, 10, 25, 40):
        cut = pct / 100 * b.D
        rw = compute_runway(b.B, income_after, spending_after - cut, one_off)
        tiers.append({"discretionary_cut_pct": pct, "monthly_cut": cut,
                      "spending_after": spending_after - cut, "gap": gap - cut, "runway": rw.to_dict()})
    essentials = b.F + med.get("bank_fees", 0.0)
    ess_rw = compute_runway(b.B, income_after, essentials, one_off)
    alternatives = [
        {"name": "Shock, no changes", **tiers[0]},
        {"name": "Trim discretionary 10%", **tiers[1]},
        {"name": "Trim discretionary 25%", **tiers[2]},
        {"name": "Trim discretionary 40%", **tiers[3]},
        {"name": "Essentials only (extreme; F + fees)", "spending_after": essentials,
         "gap": essentials - income_after, "runway": ess_rw.to_dict(), "discretionary_cut_pct": None,
         "monthly_cut": spending_after - essentials},
    ]
    best = max(tiers, key=lambda t: t["runway"]["months_precise"])
    improvement = best["runway"]["months_precise"] - tiers[0]["runway"]["months_precise"]

    buffer_left = b.B - one_off
    usage = []
    bal = buffer_left
    for m in range(1, 13):
        draw = max(gap, 0.0)
        bal -= draw
        usage.append({"month": m, "draw": draw, "remaining": bal})

    cut_to_close = (gap / b.D * 100) if (gap > 0 and b.D > 0) else (0.0 if gap <= 0 else None)

    has_job_loss = any(e["type"] == "job_loss" for e in sim["effects"])
    actions = []
    if one_off > 0:
        actions.append({"action": f"Set aside ${one_off:,.0f} for the one-off cost before other spending.",
                        "why": "One-off costs come straight out of the buffer."})
    if has_job_loss:
        actions.append({"action": "Apply for Employment Insurance as soon as you stop working.",
                        "why": "canada.ca advises applying promptly; delays beyond 4 weeks can reduce benefits. "
                               "Eligibility is not assumed by ClementIQ.",
                        "source": "https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit.html"})
    if gap > 0:
        actions.append({"action": f"Cover the ${gap:,.0f}/month shortfall: trim discretionary outflows "
                                  f"first (a {min(cut_to_close or 100, 100):.0f}% cut closes it)."
                        if cut_to_close is not None else
                        f"Cover the ${gap:,.0f}/month shortfall from the buffer.",
                        "why": "Discretionary outflows are the only category not committed to bills or loans."})
    if b.P > 0:
        actions.append({"action": "Contact your lender early to ask what options exist if payments become hard.",
                        "why": f"Loan payment of ${b.P:,.0f}/month is contractual. Relief is not guaranteed."})
    actions.append({"action": "Keep essential bills and insurance current.",
                    "why": "Missed essentials create penalty interest (seen in this dataset's bank fees)."})

    payload = {
        "plan_type": "backup",
        "account_id": b.account_id,
        "simulation": {k: sim[k] for k in ("baseline", "scenario", "deltas", "effects", "verdict",
                                           "assumptions", "warnings")},
        "immediate_actions": actions,
        "priority_expenses": priority,
        "optional_reductions": _reductions(b),
        "monthly_shortfall": gap,
        "discretionary_cut_pct_to_close_gap": cut_to_close,
        "emergency_savings_usage": usage,
        "runway_improvement_months": improvement,
        "best_tier": best,
        "alternatives": alternatives,
        "disclaimer": "Modeled outcomes; reductions are options, not guarantees. No assistance program "
                      "eligibility is assumed.",
    }
    return envelope(payload, {"baseline": b.judging_dict(), "shock": shock.model_dump()})
