"""Deterministic alert relevance scoring (0–100).

Factors (max points):
  exposure share      25  share of typical spending flowing through affected channels
  impact size         25  modeled monthly impact relative to typical spending (5% = full)
  recency             15  exp(−age_days / 7)
  source reliability  15  official 1.0, major outlet 0.8, other 0.5
  vulnerability       10  shorter runway → higher relevance
  stated interests     5  topic is in the user's chosen interests
  investment exposure  5  user portfolio holds asset classes linked to the topic

Political affiliation is never inferred or used. Gemini only explains the score, never sets it.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

WEIGHTS = {"exposure": 25, "impact": 25, "recency": 15, "reliability": 15, "vulnerability": 10,
           "interest": 5, "investment": 5}


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def vulnerability(runway_months: float, no_shortfall: bool) -> float:
    if no_shortfall:
        return 0.1
    if runway_months < 3:
        return 1.0
    if runway_months < 6:
        return 0.7
    if runway_months < 12:
        return 0.4
    return 0.1


def score_event(*, spending: float, exposed_baseline: float, monthly_impact: float,
                published_at: datetime | None, reliability: float, runway_months: float,
                no_shortfall: bool, topic: str, interests: list[str],
                investment_match: bool, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    if published_at is not None and published_at.tzinfo is None:
        published_at = published_at.replace(tzinfo=timezone.utc)
    age_days = max((now - published_at).total_seconds() / 86400, 0) if published_at else 30.0
    parts = {
        "exposure": _clamp((exposed_baseline / spending) / 0.5) if spending > 0 else 0.0,
        "impact": _clamp((abs(monthly_impact) / spending) / 0.05) if spending > 0 else 0.0,
        "recency": math.exp(-age_days / 7),
        "reliability": _clamp(reliability),
        "vulnerability": vulnerability(runway_months, no_shortfall),
        "interest": 1.0 if topic in interests else 0.0,
        "investment": 1.0 if investment_match else 0.0,
    }
    breakdown = {k: round(parts[k] * WEIGHTS[k], 2) for k in WEIGHTS}
    total = round(sum(breakdown.values()), 2)
    return {"score": total, "breakdown": breakdown, "age_days": round(age_days, 2)}


def severity_for(score: float) -> str:
    return "high" if score >= 75 else "medium" if score >= 55 else "low"


SEVERITY_RANK = {"low": 0, "medium": 1, "high": 2}
