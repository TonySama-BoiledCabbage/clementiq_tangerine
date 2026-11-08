from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .. import models
from ..alerts.service import alert_dict, generate_alerts
from ..auth import Principal, authorize_account, current_principal
from ..db import get_db

router = APIRouter(prefix="/api/alerts", tags=["alerts"])
CATEGORIES = ["financial_health", "global_events", "investments", "crypto", "loan_exposure", "savings_goals", "reminders"]


@router.get("")
def list_alerts(category: str | None = None, unread: bool | None = None, account_id: int | None = None,
                limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    A = models.Alert
    q = select(A).where(A.owner == p.sub)
    if category:
        if category not in CATEGORIES:
            raise HTTPException(422, "unknown category")
        q = q.where(A.category == category)
    if unread is not None:
        q = q.where(A.is_read.is_(not unread))
    if account_id is not None:
        q = q.where(A.account_id == account_id)
    total = db.execute(select(func.count()).select_from(q.subquery())).scalar()
    unread_n = db.execute(select(func.count()).select_from(A).where(A.owner == p.sub, A.is_read.is_(False))).scalar()
    rows = db.execute(q.order_by(A.created_at.desc(), A.relevance_score.desc()).limit(limit).offset(offset)).scalars().all()
    return {"total": total, "unread": unread_n, "categories": CATEGORIES, "items": [alert_dict(a) for a in rows]}


class AlertPatch(BaseModel):
    is_read: bool


@router.patch("/{alert_id}")
def patch_alert(alert_id: int, body: AlertPatch, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    a = db.get(models.Alert, alert_id)
    if not a or a.owner != p.sub:
        raise HTTPException(404, "alert not found")
    a.is_read = body.is_read
    db.commit()
    return alert_dict(a)


@router.post("/read-all")
def read_all(p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    db.execute(update(models.Alert).where(models.Alert.owner == p.sub).values(is_read=True))
    db.commit()
    return {"ok": True}


@router.post("/generate/{account_id}")
def generate(account_id: int, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    """Run the deterministic alert pipeline for this user + account (also run by the worker)."""
    authorize_account(p, account_id)
    pref = db.get(models.UserPreference, p.sub)
    data = dict(pref.data) if pref else {}
    watched = set(data.get("watched_accounts", []))
    if account_id not in watched:
        data["watched_accounts"] = sorted(watched | {account_id})[-50:]
        if pref:
            pref.data = data
        else:
            db.add(models.UserPreference(owner=p.sub, data=data))
        db.commit()
    return generate_alerts(db, p.sub, account_id)


@router.get("/history")
def history(p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    rows = db.execute(select(models.AlertGenerationLog).where(models.AlertGenerationLog.owner == p.sub)
                      .order_by(models.AlertGenerationLog.id.desc()).limit(30)).scalars().all()
    return {"items": [{"run_at": r.run_at.isoformat(), "account_id": r.account_id, "candidates": r.candidates,
                       "created": r.created, "suppressed": r.suppressed} for r in rows]}
