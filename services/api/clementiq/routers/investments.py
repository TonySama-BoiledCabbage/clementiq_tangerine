from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..auth import Principal, current_principal
from ..core.exposure import INVESTMENT_CHANNELS
from ..core.portfolio import DEMO_PORTFOLIO, STRESS_SCENARIOS, HoldingIn, ScenarioRequest, stress_test, valuate
from ..db import get_db
from ..repository import audit

router = APIRouter(prefix="/api/investments", tags=["investments"])


def _latest_price(db: Session, symbol: str) -> models.MarketPrice | None:
    return db.execute(select(models.MarketPrice).where(models.MarketPrice.symbol == symbol.upper())
                      .order_by(models.MarketPrice.observed_at.desc())).scalars().first()


def _holdings_in(db: Session, owner: str) -> list[HoldingIn]:
    out = []
    for h in db.execute(select(models.PortfolioHolding).where(models.PortfolioHolding.owner == owner)
                         .order_by(models.PortfolioHolding.id)).scalars():
        mp = _latest_price(db, h.symbol)
        price, src, asof = (mp.price, mp.provider, mp.observed_at.isoformat()) if mp else (h.manual_price, "manual" if h.manual_price is not None else None, None)
        out.append(HoldingIn(symbol=h.symbol, name=h.name, asset_class=h.asset_class, sector=h.sector, quantity=h.quantity,
                             cost_basis=h.cost_basis, price=price, price_source=src, price_as_of=asof, holding_kind=h.holding_kind))
    return out


@router.get("/portfolio")
def portfolio(p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    rows = db.execute(select(models.PortfolioHolding).where(models.PortfolioHolding.owner == p.sub)
                      .order_by(models.PortfolioHolding.id)).scalars().all()
    hs = _holdings_in(db, p.sub)
    val = valuate(hs)
    for r, row in zip(val["holdings"], rows):
        r["id"] = row.id
    history = {}
    for h in hs:
        pts = db.execute(select(models.MarketPrice).where(models.MarketPrice.symbol == h.symbol.upper())
                         .order_by(models.MarketPrice.observed_at)).scalars().all()
        if pts:
            history[h.symbol] = [{"t": x.observed_at.isoformat(), "price": x.price} for x in pts[-200:]]
    events = db.execute(select(models.NewsEvent).where(models.NewsEvent.topic.in_(list(INVESTMENT_CHANNELS)))
                        .order_by(models.NewsEvent.published_at.desc()).limit(8)).scalars().all()
    held_classes = {h.asset_class for h in hs}
    rel = [{"id": e.id, "headline": e.headline, "topic": e.topic, "source": e.source_name,
            "published_at": e.published_at.isoformat() if e.published_at else None,
            "channels": [c for c in INVESTMENT_CHANNELS.get(e.topic, []) if c["asset"] in held_classes
                         or (c["asset"] == "equity" and held_classes & {"stock", "etf", "mutual_fund"})]} for e in events]
    return {**val, "price_history": history, "related_events": [r for r in rel if r["channels"]],
            "scenarios": {k: v["name"] for k, v in STRESS_SCENARIOS.items()},
            "notice": "The Tangerine dataset contains no investment holdings. Holdings here are entered by you, "
                      "connected, or clearly labelled demonstration data."}


class HoldingCreate(HoldingIn):
    pass


@router.post("/holdings")
def add_holding(h: HoldingCreate, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if h.holding_kind == "connected":
        raise HTTPException(422, "connected holdings are created by wallet connection, not manually")
    row = models.PortfolioHolding(owner=p.sub, symbol=h.symbol.upper(), name=h.name or h.symbol.upper(), asset_class=h.asset_class,
                                  sector=h.sector, quantity=h.quantity, cost_basis=h.cost_basis, manual_price=h.price,
                                  holding_kind=h.holding_kind)
    db.add(row)
    db.commit()
    audit(db, p.sub, "holding_add", h.symbol)
    return {"id": row.id}


@router.delete("/holdings/{hid}")
def delete_holding(hid: int, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    row = db.get(models.PortfolioHolding, hid)
    if not row or row.owner != p.sub:
        raise HTTPException(404, "not found")
    db.delete(row)
    db.commit()
    return {"deleted": hid}


@router.post("/demo")
def load_demo(p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    """Load a clearly labelled demonstration portfolio (holding_kind='demo')."""
    for old in db.execute(select(models.PortfolioHolding).where(models.PortfolioHolding.owner == p.sub,
                                                                models.PortfolioHolding.holding_kind == "demo")).scalars():
        db.delete(old)
    for d in DEMO_PORTFOLIO:
        db.add(models.PortfolioHolding(owner=p.sub, symbol=d["symbol"], name=d["name"], asset_class=d["asset_class"],
                                       sector=d.get("sector"), quantity=d["quantity"], manual_price=d.get("price"),
                                       holding_kind="demo"))
    db.commit()
    from ..jobs import JOBS, run_job
    run_job("market_refresh", JOBS["market_refresh"], runner="api")
    return {"loaded": len(DEMO_PORTFOLIO)}


class InvScenario(BaseModel):
    scenario_id: str | None = "bear_market"
    custom_shocks: dict[str, float] | None = None
    sell_to_cover: bool = False
    account_buffer: float | None = None
    account_monthly_gap: float | None = None
    holdings: list[HoldingIn] | None = None


@router.post("/scenario")
def scenario(body: InvScenario, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    hs = body.holdings if body.holdings is not None else _holdings_in(db, p.sub)
    if not hs:
        raise HTTPException(422, "no holdings — add holdings or load the demo portfolio")
    try:
        return stress_test(ScenarioRequest(holdings=hs, **body.model_dump(exclude={"holdings"})))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/refresh-prices")
def refresh_prices(p: Principal = Depends(current_principal)):
    from ..jobs import JOBS, run_job
    return run_job("market_refresh", JOBS["market_refresh"], runner="api")
