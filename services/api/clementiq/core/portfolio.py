"""Portfolio analytics and stress testing (Clement Core).

The Tangerine dataset contains NO investment holdings. Portfolios here are user-entered,
wallet-connected, demonstration, or hypothetical, and every holding carries that label.
Volatile assets are kept separate from the liquid emergency buffer B unless the user explicitly
models selling them.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from .provenance import envelope
from .runway import compute_runway

AssetClass = Literal["stock", "etf", "bond", "mutual_fund", "cash", "crypto"]
HoldingKind = Literal["user", "connected", "demo", "hypothetical"]


class HoldingIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    name: str = Field("", max_length=120)
    asset_class: AssetClass
    sector: str | None = None
    quantity: float = Field(gt=0, le=1e12)
    cost_basis: float | None = Field(None, ge=0)
    price: float | None = Field(None, ge=0, description="per-unit price; from market data or manual")
    price_source: str | None = None
    price_as_of: str | None = None
    holding_kind: HoldingKind = "hypothetical"


# Illustrative stress scenarios — hypothetical shocks, not forecasts.
STRESS_SCENARIOS: dict[str, dict[str, Any]] = {
    "equity_correction": {"name": "Equity correction", "shocks": {"stock": -10, "etf": -10, "mutual_fund": -8, "bond": 1, "crypto": -20, "cash": 0}},
    "bear_market": {"name": "Bear market", "shocks": {"stock": -30, "etf": -25, "mutual_fund": -22, "bond": 3, "crypto": -50, "cash": 0}},
    "rate_shock": {"name": "Rates +1.5 pp", "shocks": {"stock": -8, "etf": -7, "mutual_fund": -6, "bond": -9, "crypto": -15, "cash": 0}},
    "crypto_winter": {"name": "Crypto winter", "shocks": {"stock": -3, "etf": -3, "mutual_fund": -2, "bond": 0, "crypto": -65, "cash": 0}},
    "stagflation": {"name": "Stagflation", "shocks": {"stock": -15, "etf": -14, "mutual_fund": -12, "bond": -6, "crypto": -30, "cash": -4}},
}


class ScenarioRequest(BaseModel):
    holdings: list[HoldingIn] = Field(max_length=200)
    scenario_id: str | None = "bear_market"
    custom_shocks: dict[str, float] | None = None  # asset_class -> % change
    sell_to_cover: bool = False
    account_buffer: float | None = None
    account_monthly_gap: float | None = None


def valuate(holdings: list[HoldingIn]) -> dict[str, Any]:
    rows = []
    total = 0.0
    missing = []
    for h in holdings:
        if h.price is None:
            missing.append(h.symbol)
            value = None
        else:
            value = h.quantity * h.price
            total += value
        gain = (value - h.cost_basis) if (value is not None and h.cost_basis is not None) else None
        rows.append({**h.model_dump(), "value": value, "gain": gain,
                     "gain_pct": (gain / h.cost_basis * 100) if gain is not None and h.cost_basis else None})
    by_class: dict[str, float] = {}
    by_sector: dict[str, float] = {}
    for r in rows:
        if r["value"] is None:
            continue
        by_class[r["asset_class"]] = by_class.get(r["asset_class"], 0) + r["value"]
        sec = r["sector"] or r["asset_class"]
        by_sector[sec] = by_sector.get(sec, 0) + r["value"]
    for r in rows:
        r["weight"] = (r["value"] / total) if (r["value"] is not None and total > 0) else None
    weights = [r["weight"] for r in rows if r["weight"]]
    hhi = sum(w * w for w in weights)
    top = max(rows, key=lambda r: r["weight"] or 0) if rows else None
    cost = sum(h.cost_basis for h in holdings if h.cost_basis is not None and h.price is not None)
    kinds = sorted({h.holding_kind for h in holdings})
    return {
        "holdings": rows,
        "total_value": total,
        "total_cost_basis": cost or None,
        "total_gain": (total - cost) if cost else None,
        "allocation": [{"asset_class": k, "value": v, "weight": v / total if total else 0} for k, v in by_class.items()],
        "sectors": [{"sector": k, "value": v, "weight": v / total if total else 0} for k, v in by_sector.items()],
        "concentration": {
            "hhi": hhi,
            "effective_holdings": (1 / hhi) if hhi > 0 else None,
            "top_holding": top["symbol"] if top else None,
            "top_weight": top["weight"] if top else None,
            "flag": "concentrated" if (top and (top["weight"] or 0) > 0.4) or hhi > 0.25 else "diversified",
        },
        "missing_prices": missing,
        "holding_kinds": kinds,
    }


def stress_test(req: ScenarioRequest) -> dict[str, Any]:
    val = valuate(req.holdings)
    if req.custom_shocks is not None:
        shocks = req.custom_shocks
        name = "Custom scenario"
    else:
        if req.scenario_id not in STRESS_SCENARIOS:
            raise ValueError("unknown scenario_id")
        shocks = STRESS_SCENARIOS[req.scenario_id]["shocks"]
        name = STRESS_SCENARIOS[req.scenario_id]["name"]
    rows = []
    modeled_total = 0.0
    for r in val["holdings"]:
        if r["value"] is None:
            continue
        pct = float(shocks.get(r["asset_class"], 0.0))
        nv = r["value"] * (1 + pct / 100)
        modeled_total += nv
        rows.append({"symbol": r["symbol"], "asset_class": r["asset_class"], "initial": r["value"],
                     "shock_pct": pct, "modeled": nv, "change": nv - r["value"]})
    change = modeled_total - val["total_value"]
    broader = None
    if req.account_buffer is not None:
        gap = req.account_monthly_gap or 0.0
        liquid_only = compute_runway(req.account_buffer, 0.0, gap) if gap > 0 else None
        broader = {
            "liquid_buffer": req.account_buffer,
            "investments_after_shock": modeled_total,
            "sell_to_cover": req.sell_to_cover,
            "note": "Investments are kept separate from the emergency buffer unless you choose to model selling them.",
        }
        if gap > 0:
            broader["runway_liquid_only"] = liquid_only.to_dict()
            if req.sell_to_cover:
                broader["runway_with_investments"] = compute_runway(
                    req.account_buffer + modeled_total, 0.0, gap).to_dict()
    payload = {
        "scenario": name,
        "shocks": shocks,
        "initial_value": val["total_value"],
        "modeled_value": modeled_total,
        "change": change,
        "change_pct": (change / val["total_value"] * 100) if val["total_value"] else None,
        "rows": rows,
        "concentration": val["concentration"],
        "broader_position": broader,
        "label": "HYPOTHETICAL — illustrative price shocks, not predictions. No trades are executed.",
    }
    return envelope(payload, req.model_dump())


def crypto_scenario(value: float, pct_change: float, buffer: float | None = None,
                    concentration_top_weight: float | None = None) -> dict[str, Any]:
    modeled = value * (1 + pct_change / 100)
    out = {"initial_value": value, "scenario_pct": pct_change, "modeled_value": modeled,
           "gain_loss": modeled - value, "top_weight": concentration_top_weight}
    if buffer is not None:
        out["relative_to_buffer"] = ((modeled - value) / buffer) if buffer > 0 else None
        out["note"] = "Crypto value is not counted in the liquid emergency buffer."
    return envelope(out, {"v": value, "p": pct_change, "b": buffer})


DEMO_PORTFOLIO: list[dict[str, Any]] = [
    {"symbol": "XIC.TO", "name": "iShares Core S&P/TSX Capped Composite ETF", "asset_class": "etf", "sector": "Canadian equity", "quantity": 120},
    {"symbol": "VFV.TO", "name": "Vanguard S&P 500 Index ETF", "asset_class": "etf", "sector": "US equity", "quantity": 40},
    {"symbol": "XBB.TO", "name": "iShares Core Canadian Universe Bond ETF", "asset_class": "bond", "sector": "Bonds", "quantity": 80},
    {"symbol": "RY.TO", "name": "Royal Bank of Canada", "asset_class": "stock", "sector": "Financials", "quantity": 10},
    {"symbol": "ENB.TO", "name": "Enbridge Inc.", "asset_class": "stock", "sector": "Energy", "quantity": 25},
    {"symbol": "SOL", "name": "Solana", "asset_class": "crypto", "sector": "Crypto", "quantity": 4},
    {"symbol": "CASH", "name": "High-interest savings", "asset_class": "cash", "sector": "Cash", "quantity": 1500, "price": 1.0},
]
