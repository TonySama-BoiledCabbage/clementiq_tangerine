"""Data-access helpers shared by routers, the AI tool layer and the worker."""
from __future__ import annotations

from datetime import date
from functools import lru_cache
from typing import Any

import pandas as pd
from fastapi import HTTPException
from sqlalchemy import String, case, func, select, text
from sqlalchemy.orm import Session

from . import models
from .config import get_settings
from .core.metrics import Baseline, LoanRecord, compute_baseline


def reference_date() -> date:
    return date.fromisoformat(get_settings().reference_date)


def monthly_frame(db: Session, account_id: int) -> pd.DataFrame:
    rows = db.execute(
        select(models.MonthlySummary).where(models.MonthlySummary.account_id == account_id)
        .order_by(models.MonthlySummary.month)
    ).scalars().all()
    if not rows:
        return pd.DataFrame()
    cols = [c.name for c in models.MonthlySummary.__table__.columns]
    return pd.DataFrame([{c: getattr(r, c) for c in cols} for r in rows])


def loan_records(db: Session, account_id: int) -> list[LoanRecord]:
    loans = db.execute(select(models.Loan).where(models.Loan.account_id == account_id)).scalars().all()
    return [LoanRecord(l.loan_id, l.status, l.monthly_payment, l.loan_start, l.duration_months, l.amount)
            for l in loans]


def require_account(db: Session, account_id: int) -> models.Account:
    acc = db.get(models.Account, account_id)
    if acc is None:
        raise HTTPException(404, f"account_id {account_id} not found")
    return acc


def get_baseline(db: Session, account_id: int) -> Baseline:
    require_account(db, account_id)
    df = monthly_frame(db, account_id)
    if df.empty:
        raise HTTPException(422, f"account_id {account_id} has no monthly_summary rows")
    return compute_baseline(account_id, df, loan_records(db, account_id), reference_date(),
                            get_settings().buffer_window_months)


def account_profile(db: Session, account_id: int) -> dict[str, Any]:
    acc = require_account(db, account_id)
    district = db.get(models.District, acc.district_id) if acc.district_id else None
    disp = db.execute(select(models.Disposition).where(models.Disposition.account_id == account_id)).scalars().all()
    cards = db.execute(select(models.Card).where(models.Card.disposition_id.in_([d.disposition_id for d in disp]))).scalars().all() if disp else []
    so = db.execute(select(models.StandingOrder).where(models.StandingOrder.account_id == account_id)).scalars().all()
    return {
        "account_id": acc.account_id,
        "frequency": acc.frequency,
        "account_opened": acc.account_opened.isoformat() if acc.account_opened else None,
        "district": {"district_id": district.district_id, "name": district.district_name, "region": district.region,
                     "average_salary": district.average_salary,
                     "unemployment_rate_2023": district.unemployment_rate_2023} if district else None,
        # Client demographics are intentionally not exposed; only relationship roles.
        "holders": [{"disposition_id": d.disposition_id, "role": d.type} for d in disp],
        "cards": [{"card_type": c.card_type, "issued": c.issued.isoformat() if c.issued else None} for c in cards],
        "standing_orders": [{"purpose": o.purpose or "other", "amount": o.amount, "to_bank": o.to_bank} for o in so],
        "standing_orders_total": sum(o.amount for o in so),
    }


def list_accounts(db: Session, q: str | None, limit: int, offset: int, sort: str = "account_id") -> dict[str, Any]:
    B = models.AccountBaseline
    stmt = select(models.Account.account_id, models.Account.district_id, B.income_I, B.spending_S, B.buffer_B,
                  B.resilience_score, B.runway_ei55, B.months_of_data).join(B, B.account_id == models.Account.account_id, isouter=True)
    count = select(func.count()).select_from(models.Account)
    if q:
        stmt = stmt.where(text("CAST(accounts.account_id AS TEXT) LIKE :q")).params(q=f"{q}%")
        count = count.where(text("CAST(accounts.account_id AS TEXT) LIKE :q")).params(q=f"{q}%")
    order = {"account_id": models.Account.account_id, "score": B.resilience_score.desc(),
             "score_asc": B.resilience_score, "buffer": B.buffer_B.desc()}.get(sort, models.Account.account_id)
    rows = db.execute(stmt.order_by(order).limit(limit).offset(offset)).all()
    return {"total": db.execute(count).scalar() or 0, "limit": limit, "offset": offset,
            "items": [dict(r._mapping) for r in rows]}


def search_accounts(db: Session, q: str, limit: int, offset: int) -> dict[str, Any]:
    """Search the whole authorized dataset by account_id: exact match first, then prefix, then
    substring matches. Paginated; returns the true total so the UI can offer "load more"."""
    B = models.AccountBaseline
    idtext = func.cast(models.Account.account_id, String)
    cols = (models.Account.account_id, B.income_I, B.spending_S, B.buffer_B, B.resilience_score, B.runway_ei55, B.months_of_data)
    stmt = select(*cols).join(B, B.account_id == models.Account.account_id, isouter=True)
    count = select(func.count()).select_from(models.Account)
    exact_id = int(q) if q.isdigit() and len(q) <= 9 else None
    if q:
        cond = idtext.like(f"%{q}%")
        stmt, count = stmt.where(cond), count.where(cond)
        rank = case((models.Account.account_id == (exact_id if exact_id is not None else -1), 0),
                    (idtext.like(f"{q}%"), 1), else_=2)
        stmt = stmt.order_by(rank, models.Account.account_id)
    else:
        stmt = stmt.order_by(models.Account.account_id)
    rows = db.execute(stmt.limit(limit).offset(offset)).all()
    items = []
    for r in rows:
        d = dict(r._mapping)
        aid = str(d["account_id"])
        d["match"] = "exact" if q and aid == q else "prefix" if q and aid.startswith(q) else "contains" if q else "all"
        items.append(d)
    exact_exists = exact_id is not None and db.get(models.Account, exact_id) is not None
    return {"query": q, "total": db.execute(count).scalar() or 0, "limit": limit, "offset": offset,
            "exact_match": exact_exists, "items": items}


def get_prefs(db: Session, owner: str) -> dict[str, Any]:
    from .prefs import DEFAULT_PREFS, merge_prefs
    row = db.get(models.UserPreference, owner)
    return merge_prefs(DEFAULT_PREFS, row.data if row else {})


def ai_allowed(db: Session, owner: str) -> bool:
    """False when the user turned off personalized AI guidance (no customer data goes to Gemini)."""
    return bool(get_prefs(db, owner)["privacy"].get("personalized_ai", True))


def audit(db: Session, actor: str, action: str, resource: str | None = None, **detail: Any) -> None:
    db.add(models.AuditLog(actor=actor, action=action, resource=resource, detail=detail))
    db.commit()
