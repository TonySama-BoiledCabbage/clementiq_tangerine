from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from .. import models
from ..auth import RESTRICTED_FEATURES, LoginRequest, Principal, current_principal, entitled, issue_token, require_admin, require_judge
from ..config import get_settings
from ..core.provenance import ENGINE_VERSION
from ..db import get_db
from ..jobs import JOBS, monitoring_status, run_job
from ..prefs import PrefsPatch, merge_prefs
from ..repository import audit, get_prefs
from ..worldpulse.service import source_statuses

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health")
def health(db: Session = Depends(get_db)):
    s = get_settings()
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
        accounts = db.execute(select(func.count()).select_from(models.Account)).scalar()
    except Exception:  # noqa: BLE001
        db_ok, accounts = False, None
    return {"status": "ok" if db_ok else "degraded", "time": datetime.now(timezone.utc).isoformat(),
            "database": {"ok": db_ok, "dialect": "sqlite" if s.is_sqlite else "postgresql", "accounts": accounts},
            "engines": {"clement_core": ENGINE_VERSION, "clement_gemini": "enabled" if s.gemini_enabled else "fallback-templates",
                        "snowflake": "enabled" if s.snowflake_enabled else "disabled"},
            "environment": s.environment}


@router.post("/auth/demo-login")
def demo_login(req: LoginRequest, db: Session = Depends(get_db)):
    tok = issue_token(req)
    audit(db, tok["sub"], "login", None, role=req.role)
    return tok


@router.get("/auth/me")
def me(p: Principal = Depends(current_principal)):
    """Server-verified identity and entitlements (role decoded from the signed token)."""
    return {"sub": p.sub, "role": p.role, "account_id": p.account_id, "read_only": p.read_only,
            "entitlements": {"judge_demo": entitled(p, "judgeDemo"), "account_search": p.role in ("judge", "admin"),
                             "data_import_view": entitled(p, "dataImport"), "data_import_run": p.role == "admin"},
            "features_allowed": [f for f in RESTRICTED_FEATURES if entitled(p, f)]}


@router.get("/settings")
def get_settings_route(p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    s = get_settings()
    return {"preferences": _visible_prefs(get_prefs(db, p.sub), p),
            "integrations": {"gemini": s.gemini_enabled, "gemini_model": s.gemini_model, "gemini_grounding": s.gemini_grounding,
                             "snowflake": s.snowflake_enabled, "news_api": bool(s.news_api_key),
                             "alpha_vantage": bool(s.alpha_vantage_key), "email": bool(s.smtp_host),
                             "worldpulse_live": s.worldpulse_live, "database": "sqlite" if s.is_sqlite else "postgresql"}}


def _visible_prefs(prefs: dict, p: Principal) -> dict:
    """Defence in depth: restricted features are never reported as enabled for non-entitled users."""
    dash = prefs.get("dashboard", {})
    for fid in RESTRICTED_FEATURES:
        if not entitled(p, fid):
            dash.get("features", {}).pop(fid, None)
            dash["favorites"] = [x for x in dash.get("favorites", []) if x != fid]
    return prefs


def _check_entitlements(patch: PrefsPatch, p: Principal) -> None:
    d = patch.dashboard
    if not d:
        return
    wanted = {k for k, v in (d.features or {}).items() if v} | set(d.favorites or [])
    blocked = sorted(f for f in wanted if not entitled(p, f))
    if blocked:
        raise HTTPException(403, f"Not available for your role: {', '.join(blocked)}")


def _check_avatar_choice(patch: PrefsPatch, p: Principal, db: Session) -> None:
    choice = patch.avatar.character if patch.avatar else None
    if choice in ("photo", "generated"):
        kind = "photo" if choice == "photo" else "avatar"
        exists = db.execute(select(models.UserMedia.id).where(models.UserMedia.owner == p.sub, models.UserMedia.kind == kind)).first()
        if not exists:
            raise HTTPException(422, "Upload a profile photo first" if choice == "photo" else "Generate your orchard character first")


@router.patch("/settings")
def patch_settings(patch: PrefsPatch, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    _check_entitlements(patch, p)
    _check_avatar_choice(patch, p, db)
    row = db.get(models.UserPreference, p.sub)
    current = row.data if row else {}
    merged = merge_prefs(current, patch.model_dump(exclude_none=True, mode="json"))
    if row is None:
        db.add(models.UserPreference(owner=p.sub, data=merged))
    else:
        row.data = merged
        row.updated_at = datetime.now(timezone.utc)
    db.commit()
    audit(db, p.sub, "settings_update", None, keys=list(patch.model_dump(exclude_none=True)))
    return {"preferences": _visible_prefs(get_prefs(db, p.sub), p)}


@router.get("/system/sources")
def sources(p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return {"sources": source_statuses(db), "monitoring": monitoring_status(db)}


@router.get("/admin/imports")
def import_status(p: Principal = Depends(require_judge), db: Session = Depends(get_db)):
    from ..ingestion.schemas import SCHEMAS
    out = []
    for sch in SCHEMAS:
        run = db.execute(select(models.ImportRun).where(models.ImportRun.dataset == sch.name)
                         .order_by(models.ImportRun.id.desc())).scalars().first()
        count = db.execute(text(f"SELECT COUNT(*) FROM {sch.table}")).scalar()
        out.append({"dataset": sch.name, "file": sch.file, "table": sch.table, "rows_in_db": count,
                    "last_run": None if not run else {
                        "status": run.status, "started_at": run.started_at.isoformat() if run.started_at else None,
                        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
                        "rows_read": run.rows_read, "rows_loaded": run.rows_loaded, "report": run.report, "error": run.error}})
    d = db.execute(select(models.ImportRun).where(models.ImportRun.dataset.like("derived:%"))
                   .order_by(models.ImportRun.id.desc())).scalars().first()
    return {"datasets": out, "derived": None if not d else {"status": d.status, "rows": d.rows_loaded, "report": d.report,
                                                            "finished_at": d.finished_at.isoformat() if d.finished_at else None}}


@router.post("/admin/imports/run")
def run_import_route(bg: BackgroundTasks, force: bool = False, p: Principal = Depends(require_admin),
                     db: Session = Depends(get_db)):
    from ..ingestion.importer import run_import
    audit(db, p.sub, "import_start", None, force=force)
    bg.add_task(run_import, None, None, force)
    return {"started": True, "force": force}


@router.post("/admin/jobs/{name}")
def run_job_route(name: str, p: Principal = Depends(require_admin)):
    if name not in JOBS:
        from fastapi import HTTPException
        raise HTTPException(404, "unknown job")
    return run_job(name, JOBS[name], runner="api")


@router.get("/admin/audit")
def audit_log(limit: int = 100, p: Principal = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.execute(select(models.AuditLog).order_by(models.AuditLog.id.desc()).limit(min(limit, 500))).scalars().all()
    return {"items": [{"at": r.at.isoformat(), "actor": r.actor, "action": r.action, "resource": r.resource,
                       "detail": r.detail} for r in rows]}
