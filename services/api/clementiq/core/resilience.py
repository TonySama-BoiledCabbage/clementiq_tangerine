"""ClementIQ Financial Resilience Score (0–100).

A project-defined, educational metric — NOT a credit score and NOT a Tangerine risk rating.
Only financial behaviour is used; protected characteristics (gender, age, location) are never inputs.

Components (each normalised to 0..1, then weighted):
  liquidity        30%  months of typical spending covered by buffer: clamp(B / S / 6)
  cash_flow        20%  surplus ratio (I − S)/I mapped from [−20%, +20%] to [0, 1]
  shock_absorption 15%  runway under the README job-loss twist (EI 55%): clamp(runway / 6)
  fixed_burden     15%  1 − clamp((F/I − 0.20) / 0.50)   (F/I ≤ 20% scores 1, ≥ 70% scores 0)
  stability        10%  1 − clamp(CV(money_in))
  overdraft        10%  1 − clamp(days_below_zero in last 12 months / 30)

Double-counting note: liquidity and shock_absorption both use B. Shock absorption also depends on
I and S, so it captures *income dependence* that liquidity alone misses; its weight is kept lower.
Loan burden is already inside F (loan_payments), so it is not added separately.
Missing data: a component with undefined inputs (e.g. I = 0) gets 0 and a warning, never a guess.
"""
from __future__ import annotations

from typing import Any

from .metrics import Baseline
from .provenance import envelope
from .runway import compute_runway

WEIGHTS = {
    "liquidity": 0.30,
    "cash_flow": 0.20,
    "shock_absorption": 0.15,
    "fixed_burden": 0.15,
    "stability": 0.10,
    "overdraft": 0.10,
}
assert abs(sum(WEIGHTS.values()) - 1) < 1e-9

LABELS = {
    "liquidity": "Emergency savings coverage",
    "cash_flow": "Monthly cash flow",
    "shock_absorption": "Job-loss shock absorption",
    "fixed_burden": "Fixed-cost burden",
    "stability": "Income stability",
    "overdraft": "Overdraft history",
}

IMPROVE = {
    "liquidity": "Grow the emergency buffer toward 6 months of typical spending (see Goal Plan).",
    "cash_flow": "Widen the gap between income and spending; review discretionary outflows.",
    "shock_absorption": "A larger buffer or lower spending extends runway under a job loss.",
    "fixed_burden": "Fixed costs take a large share of income; review bills and loan terms.",
    "stability": "Income varies a lot month to month; a larger buffer offsets volatility.",
    "overdraft": "Avoid negative balances, which bring penalty interest.",
}


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def resilience_score(b: Baseline) -> dict[str, Any]:
    warnings: list[str] = []
    comps: dict[str, dict[str, Any]] = {}

    if b.S > 0:
        cov = b.B / b.S
        comps["liquidity"] = {"value": cov, "unit": "months", "score": _clamp(cov / 6)}
    else:
        comps["liquidity"] = {"value": None, "unit": "months", "score": 1.0 if b.B > 0 else 0.0}

    if b.I > 0:
        r = (b.I - b.S) / b.I
        comps["cash_flow"] = {"value": r, "unit": "ratio", "score": _clamp((r + 0.2) / 0.4)}
        fb = b.F / b.I
        comps["fixed_burden"] = {"value": fb, "unit": "ratio", "score": 1 - _clamp((fb - 0.2) / 0.5)}
    else:
        warnings.append("Typical income is 0 — cash-flow and fixed-burden components score 0.")
        comps["cash_flow"] = {"value": None, "unit": "ratio", "score": 0.0}
        comps["fixed_burden"] = {"value": None, "unit": "ratio", "score": 0.0}

    rw = compute_runway(b.B, 0.55 * b.I, b.S)
    comps["shock_absorption"] = {"value": rw.months, "unit": "months", "display": rw.display,
                                 "score": _clamp(rw.months / 6)}

    if b.income_cv is None:
        warnings.append("Not enough months to measure income stability; component scored 0.5.")
        comps["stability"] = {"value": None, "unit": "cv", "score": 0.5}
    else:
        comps["stability"] = {"value": b.income_cv, "unit": "cv", "score": 1 - _clamp(b.income_cv)}

    comps["overdraft"] = {"value": b.days_below_zero_12m, "unit": "days",
                          "score": 1 - _clamp(b.days_below_zero_12m / 30)}

    total = 0.0
    breakdown = []
    for k, w in WEIGHTS.items():
        c = comps[k]
        pts = c["score"] * w * 100
        total += pts
        breakdown.append({"key": k, "label": LABELS[k], "weight": w, "points": pts,
                          "max_points": w * 100, **c})
    ranked = sorted(breakdown, key=lambda x: x["score"])
    band = ("strong" if total >= 75 else "moderate" if total >= 55 else "fragile" if total >= 35 else "at risk")

    payload = {
        "account_id": b.account_id,
        "score": total,
        "band": band,
        "breakdown": breakdown,
        "strengths": [x["label"] for x in sorted(breakdown, key=lambda x: -x["score"]) if x["score"] >= 0.7][:3],
        "risks": [x["label"] for x in ranked if x["score"] < 0.5][:3],
        "improvements": [{"component": x["label"], "action": IMPROVE[x["key"]],
                          "potential_points": x["max_points"] - x["points"]} for x in ranked[:3]
                         if x["score"] < 0.9],
        "weights": WEIGHTS,
        "warnings": warnings,
        "disclaimer": "Educational resilience metric defined by ClementIQ. Not a credit score or a "
                      "Tangerine risk rating. Demographic attributes are never used.",
    }
    return envelope(payload, b.judging_dict())


def score_history(monthly, loans, step: int = 3) -> list[dict[str, Any]]:
    """Score recomputed on expanding windows of the account's own history (every `step` months)."""
    from .metrics import compute_baseline

    df = monthly.sort_values("month").reset_index(drop=True)
    out = []
    for end in range(min(12, len(df)), len(df) + 1, step):
        part = df.iloc[:end]
        b = compute_baseline(int(df.account_id.iloc[0]) if "account_id" in df else 0, part, loans)
        out.append({"month": part["month"].iloc[-1], "score": resilience_score(b)["score"]})
    if out and out[-1]["month"] != df["month"].iloc[-1]:
        b = compute_baseline(0, df, loans)
        out.append({"month": df["month"].iloc[-1], "score": resilience_score(b)["score"]})
    return out
