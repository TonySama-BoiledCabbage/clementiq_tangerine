from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..auth import Principal, authorize_account, current_principal
from ..config import get_settings
from ..core.recovery import BackupPlanRequest, GoalPlanRequest, backup_plan, goal_plan
from ..core.runway import compute_runway
from ..core.shocks import PRESETS, SHOCK_LABELS, ShockComponent, ShockRequest, apply_shocks
from ..db import get_db
from ..repository import audit, get_baseline

router = APIRouter(prefix="/api", tags=["scenarios"])


@router.get("/shocks/presets")
def presets(p: Principal = Depends(current_principal)):
    return {"presets": PRESETS, "types": SHOCK_LABELS}


@router.post("/shocks/simulate")
def simulate(req: ShockRequest, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    authorize_account(p, req.account_id)
    b = get_baseline(db, req.account_id)
    try:
        return apply_shocks(b, req, get_settings().ei_max_weekly_benefit)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


class SaveScenario(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    request: ShockRequest


@router.post("/shocks/scenarios")
def save_scenario(body: SaveScenario, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    authorize_account(p, body.request.account_id)
    b = get_baseline(db, body.request.account_id)
    res = apply_shocks(b, body.request, get_settings().ei_max_weekly_benefit)
    sc = models.SavedScenario(owner=p.sub, account_id=body.request.account_id, name=body.name, spec=body.request.model_dump())
    db.add(sc)
    db.flush()
    db.add(models.ScenarioResult(scenario_id=sc.id, account_id=sc.account_id, input_hash=res["input_hash"], result=res))
    db.commit()
    audit(db, p.sub, "scenario_save", f"scenario:{sc.id}")
    return {"id": sc.id, "name": sc.name, "input_hash": res["input_hash"]}


@router.get("/shocks/scenarios")
def list_scenarios(account_id: int | None = None, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    q = select(models.SavedScenario).where(models.SavedScenario.owner == p.sub)
    if account_id:
        q = q.where(models.SavedScenario.account_id == account_id)
    rows = db.execute(q.order_by(models.SavedScenario.id.desc()).limit(50)).scalars().all()
    out = []
    for s in rows:
        r = db.execute(select(models.ScenarioResult).where(models.ScenarioResult.scenario_id == s.id)).scalars().first()
        out.append({"id": s.id, "name": s.name, "account_id": s.account_id, "spec": s.spec,
                    "created_at": s.created_at.isoformat(),
                    "runway": r.result["scenario"]["runway"]["display"] if r else None})
    return {"items": out}


@router.delete("/shocks/scenarios/{sid}")
def delete_scenario(sid: int, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    s = db.get(models.SavedScenario, sid)
    if not s or s.owner != p.sub:
        raise HTTPException(404, "not found")
    for r in db.execute(select(models.ScenarioResult).where(models.ScenarioResult.scenario_id == sid)).scalars():
        db.delete(r)
    db.delete(s)
    db.commit()
    return {"deleted": sid}


@router.post("/recovery/goal-plan")
def goal(req: GoalPlanRequest, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    authorize_account(p, req.account_id)
    try:
        return goal_plan(get_baseline(db, req.account_id), req)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


def _preset_request(account_id: int, preset_id: str) -> ShockRequest:
    pr = next((x for x in PRESETS if x["id"] == preset_id), None)
    if not pr:
        raise HTTPException(422, f"unknown preset {preset_id}")
    return ShockRequest(account_id=account_id, components=[ShockComponent(**c) for c in pr["components"]],
                        mode="judging" if pr["judging"] else "extended")


@router.post("/recovery/backup-plan")
def backup(req: BackupPlanRequest, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    authorize_account(p, req.account_id)
    shock = req.shock or _preset_request(req.account_id, req.preset_id or "ei55_6m")
    if shock.account_id != req.account_id:
        raise HTTPException(422, "shock.account_id must match account_id")
    return backup_plan(get_baseline(db, req.account_id), shock, get_settings().ei_max_weekly_benefit)


class SavePlan(BaseModel):
    account_id: int
    plan_type: str = Field(pattern="^(goal|backup)$")
    params: dict
    result: dict


@router.post("/recovery/plans")
def save_plan(body: SavePlan, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    authorize_account(p, body.account_id)
    if p.read_only:
        raise HTTPException(403, "judge accounts are read-only; sign in as a customer to save plans")
    pl = models.RecoveryPlan(owner=p.sub, account_id=body.account_id, plan_type=body.plan_type, params=body.params,
                             result=body.result, checklist_state={})
    db.add(pl)
    db.commit()
    return {"id": pl.id}


class Checklist(BaseModel):
    checklist_state: dict[str, bool]


@router.get("/recovery/plans")
def list_plans(account_id: int, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    authorize_account(p, account_id)
    rows = db.execute(select(models.RecoveryPlan).where(models.RecoveryPlan.owner == p.sub,
                                                        models.RecoveryPlan.account_id == account_id)
                      .order_by(models.RecoveryPlan.id.desc()).limit(20)).scalars().all()
    return {"items": [{"id": r.id, "plan_type": r.plan_type, "params": r.params, "checklist_state": r.checklist_state,
                       "created_at": r.created_at.isoformat()} for r in rows]}


@router.patch("/recovery/plans/{pid}")
def update_checklist(pid: int, body: Checklist, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    pl = db.get(models.RecoveryPlan, pid)
    if not pl or pl.owner != p.sub:
        raise HTTPException(404, "not found")
    pl.checklist_state = body.checklist_state
    db.commit()
    return {"id": pid, "checklist_state": pl.checklist_state}


@router.get("/judge/verify/{account_id}")
def judge_verify(account_id: int, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    """Recompute the README twist cards with the reference formulas, independently of the
    simulator code path, and compare. Lets judges confirm the engine matches their worksheet."""
    authorize_account(p, account_id)
    b = get_baseline(db, account_id)
    I, S, H, B = b.I, b.S, b.H, b.B
    ref = {
        "ei55": compute_runway(B, 0.55 * I, S),
        "furnace": compute_runway(B, I, S, S),
        "ei55_bills15": compute_runway(B, 0.55 * I, S + 0.15 * H),
    }
    sim = {pid: apply_shocks(b, _preset_request(account_id, pid))["scenario"]["runway"]
           for pid in ("ei55_6m", "furnace", "ei55_bills15")}
    pairs = [("EI 55% (6 months)", ref["ei55"], sim["ei55_6m"]), ("Furnace = 1 × S", ref["furnace"], sim["furnace"]),
             ("EI 55% + bills +15%", ref["ei55_bills15"], sim["ei55_bills15"])]
    rows = [{"twist": n, "reference": r.display, "engine": s["display"], "match": r.display == s["display"]} for n, r, s in pairs]
    return {"account_id": account_id, "inputs": b.judging_dict(), "rows": rows, "all_match": all(x["match"] for x in rows),
            "formulas": {"I": "median(money_in)", "S": "median(money_out)", "F": "median(household_bills+insurance+loan_payments)",
                         "H": "median(household_bills)", "B": "mean(avg_daily_balance, last 6 months)",
                         "P": "running loan monthly_payment else 0",
                         "runway": "0 if B−one_off ≤ 0; 'no shortfall (120+)' if gap ≤ 0; else min((B−one_off)/gap, 120)"}}
