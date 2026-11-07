"""Financial runway — exact Tangerine README formula.

    buffer_left = B - one_off_costs
    gap         = spending_after_shock - income_after_shock
    if buffer_left <= 0:  runway = 0
    elif gap <= 0:        runway = "no shortfall (120+)"
    else:                 runway = min(buffer_left / gap, 120)

Runway is rounded to 1 decimal for display only.
"""
from __future__ import annotations

from dataclasses import dataclass

RUNWAY_CAP = 120.0


@dataclass(frozen=True)
class Runway:
    months: float          # numeric value used for comparisons (cap when no shortfall)
    raw_months: float | None  # unrounded, uncapped value (None when no shortfall / zero buffer)
    no_shortfall: bool
    capped: bool
    buffer_left: float
    gap: float
    status: str            # "depleted" | "no_shortfall" | "capped" | "finite"

    @property
    def display(self) -> str:
        if self.no_shortfall:
            return "no shortfall (120+)"
        return f"{round(self.months, 1):.1f}"

    def to_dict(self) -> dict:
        return {
            "months": round(self.months, 1),
            "months_precise": self.months,
            "raw_months": self.raw_months,
            "no_shortfall": self.no_shortfall,
            "capped": self.capped,
            "buffer_left": self.buffer_left,
            "gap": self.gap,
            "status": self.status,
            "display": self.display,
            "formula": "min((B - one_off_costs) / (spending_after - income_after), 120)",
        }


def compute_runway(buffer: float, income_after: float, spending_after: float,
                   one_off_costs: float = 0.0, cap: float = RUNWAY_CAP) -> Runway:
    buffer_left = float(buffer) - float(one_off_costs)
    gap = float(spending_after) - float(income_after)
    if buffer_left <= 0:
        return Runway(0.0, None, False, False, buffer_left, gap, "depleted")
    if gap <= 0:
        return Runway(cap, None, True, True, buffer_left, gap, "no_shortfall")
    raw = buffer_left / gap
    if raw >= cap:
        return Runway(cap, raw, False, True, buffer_left, gap, "capped")
    return Runway(raw, raw, False, False, buffer_left, gap, "finite")
