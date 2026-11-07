"""Global event → personal financial impact engine (Clement Core).

Translates an economic development (e.g. "energy prices +12%", "policy rate +0.50 pp") into
hypothetical changes to the customer's monthly finances using explicit, configurable pass-through
assumptions. A commodity price change is NEVER applied one-for-one to household spending.

Every channel states its baseline, whether that baseline is an estimate, the pass-through used,
and the resulting monthly change. Low / medium / high scenarios are always available.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, Callable, Literal

from pydantic import BaseModel, Field

from .allocation import ALLOCATION_SOURCE, ESTIMATED_ALLOCATION
from .metrics import Baseline
from .provenance import envelope
from .runway import compute_runway

Level = Literal["low", "medium", "high"]

TOPICS = [
    "energy", "inflation", "interest_rate", "employment", "tariffs", "supply_chain", "fx",
    "housing", "food", "market_volatility", "crypto_regulation", "geopolitical", "regulation", "policy",
]

TOPIC_LABELS = {
    "energy": "Oil & energy prices", "inflation": "Inflation / consumer prices",
    "interest_rate": "Central bank interest rates", "employment": "Employment conditions",
    "tariffs": "Trade tariffs & restrictions", "supply_chain": "Supply-chain disruption",
    "fx": "Currency exchange rates", "housing": "Housing & rent", "food": "Food prices",
    "market_volatility": "Market volatility", "crypto_regulation": "Crypto regulation",
    "geopolitical": "Geopolitical disruption", "regulation": "Financial regulation",
    "policy": "Government economic policy",
}


@dataclass(frozen=True)
class Channel:
    key: str
    label: str
    kind: Literal["spending", "income"]
    baseline: Callable[[Baseline], float]
    estimate: bool
    passthrough: dict[str, float]
    explanation: str
    unit: Literal["pct", "pp"] = "pct"


def _alloc(cat: str) -> Callable[[Baseline], float]:
    return lambda b: ESTIMATED_ALLOCATION[cat] * b.D


CHANNELS: dict[str, Channel] = {
    "transportation": Channel(
        "transportation", "Transportation (fuel, transit)", "spending", _alloc("transportation"), True,
        {"low": 0.10, "medium": 0.15, "high": 0.25},
        "Fuel is roughly a third of household transport spending and retail fuel prices move by only "
        "part of a crude-oil change, so a fraction of the energy-price change is passed through."),
    "household_bills": Channel(
        "household_bills", "Household bills (rent & utilities)", "spending", lambda b: b.H, False,
        {"low": 0.05, "medium": 0.10, "high": 0.20},
        "Labelled household bills mix rent and utilities; only the utilities share responds to energy "
        "prices, and regulated rates adjust with a lag."),
    "food": Channel(
        "food", "Groceries & food", "spending", _alloc("food"), True,
        {"low": 0.5, "medium": 0.8, "high": 1.0},
        "A retail food-price index change is passed through largely intact; household substitution "
        "lowers the effective increase in the low case."),
    "general_prices": Channel(
        "general_prices", "Overall spending", "spending", lambda b: b.S, False,
        {"low": 0.6, "medium": 0.8, "high": 1.0},
        "CPI measures an average basket; an individual household's basket may rise less or more."),
    "imported_goods": Channel(
        "imported_goods", "Imported goods", "spending",
        lambda b: (ESTIMATED_ALLOCATION["food"] + ESTIMATED_ALLOCATION["clothing"] +
                   ESTIMATED_ALLOCATION["household_operations"] + ESTIMATED_ALLOCATION["recreation"]) * b.D * 0.30,
        True, {"low": 0.2, "medium": 0.5, "high": 0.8},
        "About 30% of goods spending is assumed to be imported; retailers pass on part of a tariff or "
        "currency-driven cost increase."),
    "rent": Channel(
        "rent", "Rent", "spending", lambda b: b.H, False,
        {"low": 0.5, "medium": 0.75, "high": 1.0},
        "A market rent change reaches a household only at lease renewal; the low case reflects partial "
        "exposure during the year."),
    "loan_payments": Channel(
        "loan_payments", "Loan payments", "spending", lambda b: b.P, False,
        {"low": 0.0, "medium": 0.5, "high": 1.0},
        "The dataset does not say whether loans are fixed or variable rate. Low = fixed (no change), "
        "medium = half the remaining balance reprices, high = fully variable.", unit="pp"),
    "savings_interest": Channel(
        "savings_interest", "Interest earned on savings", "income", lambda b: max(b.B, 0.0), False,
        {"low": 0.25, "medium": 0.5, "high": 0.75},
        "Deposit rates typically move by only part of a policy-rate change.", unit="pp"),
}

TOPIC_CHANNELS: dict[str, list[str]] = {
    "energy": ["transportation", "household_bills"],
    "inflation": ["general_prices"],
    "food": ["food"],
    "interest_rate": ["loan_payments", "savings_interest"],
    "tariffs": ["imported_goods"],
    "supply_chain": ["imported_goods", "food"],
    "fx": ["imported_goods"],
    "housing": ["rent"],
    "geopolitical": ["transportation", "imported_goods"],
    "employment": [],
    "market_volatility": [],
    "crypto_regulation": [],
    "regulation": [],
    "policy": ["general_prices"],
}

# Investment exposure channels: qualitative transmission paths only — never return predictions.
INVESTMENT_CHANNELS: dict[str, list[dict[str, str]]] = {
    "interest_rate": [
        {"asset": "bond", "channel": "Bond prices tend to move opposite to yields; longer duration = more sensitive."},
        {"asset": "equity", "channel": "Higher borrowing costs can affect rate-sensitive sectors such as real estate and utilities."}],
    "energy": [
        {"asset": "equity", "channel": "Energy producers' revenues are linked to prices; energy-intensive industries face cost changes."}],
    "tariffs": [
        {"asset": "equity", "channel": "Internationally dependent manufacturers and retailers may see cost or demand changes."}],
    "supply_chain": [{"asset": "equity", "channel": "Firms with concentrated supplier networks may face delays and cost pressure."}],
    "fx": [{"asset": "equity", "channel": "Exporters and firms with foreign revenue are affected by currency translation."}],
    "market_volatility": [{"asset": "equity", "channel": "Broad price swings affect diversified equity holdings."},
                          {"asset": "crypto", "channel": "Digital assets have historically shown larger swings than equities."}],
    "crypto_regulation": [{"asset": "crypto", "channel": "Rules on exchanges, stablecoins or custody can change access and liquidity."}],
    "inflation": [{"asset": "bond", "channel": "Inflation erodes the real value of fixed coupons."},
                  {"asset": "cash", "channel": "Cash loses purchasing power when inflation exceeds deposit rates."}],
    "employment": [{"asset": "equity", "channel": "Weaker employment can signal slower consumer demand."}],
}


class ImpactRequest(BaseModel):
    account_id: int
    topic: str
    magnitude: float = Field(..., ge=-100, le=500,
        description="% change in the underlying price/index, or percentage-point change for rates")
    level: Level = "medium"
    event_id: int | None = None
    event_title: str | None = None
    passthrough_overrides: dict[str, float] | None = None


def _remaining_loan_balance(b: Baseline, reference: date) -> float:
    """Upper-bound estimate: remaining scheduled payments × monthly payment (no interest split in data)."""
    if not b.loan or not b.loan.get("running") or not b.loan.get("loan_start"):
        return 0.0
    start = date.fromisoformat(b.loan["loan_start"])
    elapsed = (reference.year - start.year) * 12 + (reference.month - start.month)
    remaining = max(int(b.loan["duration_months"]) - elapsed, 0)
    return remaining * float(b.loan["monthly_payment"])


def event_impact(b: Baseline, req: ImpactRequest, reference: date = date(2025, 12, 31)) -> dict[str, Any]:
    if req.topic not in TOPIC_CHANNELS:
        raise ValueError(f"unknown topic {req.topic}")
    channels = TOPIC_CHANNELS[req.topic]
    rows = []
    add_spend = 0.0
    add_income = 0.0
    assumptions = []
    limitations = []
    for key in channels:
        ch = CHANNELS[key]
        pt = (req.passthrough_overrides or {}).get(key, ch.passthrough[req.level])
        base = ch.baseline(b)
        if ch.unit == "pp":
            if key == "loan_payments":
                bal = _remaining_loan_balance(b, reference)
                delta = bal * (req.magnitude / 100.0) / 12.0 * pt
                base_desc = f"remaining loan balance ≈ ${bal:,.0f} (upper bound: remaining payments × P)"
            else:
                delta = base * (req.magnitude / 100.0) / 12.0 * pt
                base_desc = f"buffer ${base:,.0f}"
            effective = None
        else:
            effective = req.magnitude * pt
            delta = base * effective / 100.0
            base_desc = f"${base:,.2f}/month"
        if ch.kind == "income":
            add_income += delta
        else:
            add_spend += delta
        if ch.estimate:
            limitations.append(f"{ch.label}: baseline is an ESTIMATED allocation of discretionary outflows "
                               f"({ALLOCATION_SOURCE}), not actual transaction history.")
        assumptions.append(f"{ch.label}: pass-through {pt:g} ({req.level}). {ch.explanation}")
        rows.append({
            "channel": key, "label": ch.label, "kind": ch.kind, "baseline_monthly": base,
            "baseline_description": base_desc, "is_estimate": ch.estimate, "passthrough": pt,
            "effective_change_pct": effective, "monthly_change": delta,
        })
    if not channels:
        limitations.append("This topic has no direct household-spending channel in Clement Core. "
                           "Use the Shock Simulator (e.g. job loss) or the investment view to explore it.")

    base_rw = compute_runway(b.B, b.I, b.S)
    new_income = b.I + add_income
    new_spending = b.S + add_spend
    new_rw = compute_runway(b.B, new_income, new_spending)

    scenarios = _level_table(b, req, reference)

    payload = {
        "account_id": b.account_id,
        "topic": req.topic,
        "topic_label": TOPIC_LABELS.get(req.topic, req.topic),
        "event_id": req.event_id,
        "event_title": req.event_title,
        "magnitude": req.magnitude,
        "magnitude_unit": "pp" if req.topic == "interest_rate" else "%",
        "level": req.level,
        "channels": rows,
        "additional_monthly_spending": add_spend,
        "additional_monthly_income": add_income,
        "baseline": {"income": b.I, "spending": b.S, "surplus": b.I - b.S, "runway": base_rw.to_dict()},
        "scenario": {"income": new_income, "spending": new_spending, "surplus": new_income - new_spending,
                     "runway": new_rw.to_dict()},
        "runway_change": new_rw.months - base_rw.months,
        "levels": scenarios,
        "investment_channels": INVESTMENT_CHANNELS.get(req.topic, []),
        "assumptions": assumptions,
        "limitations": limitations,
        "label": "HYPOTHETICAL SCENARIO — modeled with explicit assumptions; not a forecast.",
    }
    return envelope(payload, {"b": b.judging_dict(), "req": req.model_dump()})


def _level_table(b: Baseline, req: ImpactRequest, reference: date) -> dict[str, Any]:
    out = {}
    for lvl in ("low", "medium", "high"):
        spend = 0.0
        inc = 0.0
        for key in TOPIC_CHANNELS[req.topic]:
            ch = CHANNELS[key]
            pt = ch.passthrough[lvl]
            if ch.unit == "pp":
                base = _remaining_loan_balance(b, reference) if key == "loan_payments" else ch.baseline(b)
                d = base * (req.magnitude / 100.0) / 12.0 * pt
            else:
                d = ch.baseline(b) * req.magnitude * pt / 100.0
            if ch.kind == "income":
                inc += d
            else:
                spend += d
        rw = compute_runway(b.B, b.I + inc, b.S + spend)
        out[lvl] = {"additional_monthly_spending": spend, "additional_monthly_income": inc,
                    "surplus": b.I + inc - b.S - spend, "runway": rw.to_dict()}
    return out
