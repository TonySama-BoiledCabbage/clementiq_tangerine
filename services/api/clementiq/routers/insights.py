from __future__ import annotations

import threading
import time
from typing import Any

import pandas as pd
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models
from ..ai.snowflake import SnowflakeUnavailable, insights_second_opinion
from ..auth import Principal, current_principal
from ..core.insights import build_features, run_insights
from ..db import get_db

router = APIRouter(prefix="/api/insights", tags=["insights"])
_cache: dict[str, Any] = {}
_lock = threading.Lock()


def _fingerprint(db: Session) -> str:
    last = db.execute(select(func.max(models.ImportRun.id)).where(models.ImportRun.status == "success")).scalar()
    return str(last)


def compute(db: Session) -> dict[str, Any]:
    fp = _fingerprint(db)
    with _lock:
        if _cache.get("fp") == fp:
            return _cache["data"]
        t0 = time.perf_counter()
        eng = db.get_bind()
        ms = pd.read_sql("SELECT * FROM monthly_summaries", eng)
        loans = pd.read_sql("SELECT * FROM loans", eng)
        accounts = pd.read_sql("SELECT * FROM accounts", eng)
        districts = pd.read_sql("SELECT * FROM districts", eng)
        if ms.empty:
            return {"available": False, "reason": "No data imported yet."}
        data = run_insights(build_features(ms, loans, accounts, districts))
        data["compute_seconds"] = round(time.perf_counter() - t0, 2)
        data["available"] = True
        _cache.update(fp=fp, data=data)
        return data


@router.get("")
def insights(p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return compute(db)


@router.post("/snowflake-review")
def snowflake_review(p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    """Optional: independent narrative of the computed findings via Snowflake Cortex."""
    data = compute(db)
    if not data.get("available"):
        return {"available": False, "reason": data.get("reason")}
    try:
        return {"available": True, **insights_second_opinion(data["findings"])}
    except SnowflakeUnavailable as exc:
        return {"available": False, "engine": "snowflake-cortex", "reason": str(exc)}
