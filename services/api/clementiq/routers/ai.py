from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..ai import gemini
from ..ai.sanitize import financial_context
from ..ai.service import explain_plan, explain_scenario
from ..ai.tools import TOOL_DECLARATIONS, ToolExecutor, fallback_chat
from ..auth import Principal, authorize_account, current_principal
from ..config import get_settings
from ..core.recovery import GoalPlanRequest, backup_plan, goal_plan
from ..core.shocks import ShockRequest, apply_shocks
from ..db import get_db
from ..repository import ai_allowed, audit, get_baseline
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/ai", tags=["ai"])


class ChatMessage(BaseModel):
    role: Literal["user", "model"]
    content: str = Field(min_length=1, max_length=4000)


class ChatBody(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=30)
    account_id: int | None = None


@router.get("/status")
def status(p: Principal = Depends(current_principal)):
    s = get_settings()
    return {"gemini": s.gemini_enabled, "model": s.gemini_model if s.gemini_enabled else None,
            "grounding": s.gemini_grounding, "fallback": "clement-core-template",
            "tools": [t["name"] for t in TOOL_DECLARATIONS]}


@router.post("/chat")
def chat(body: ChatBody, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if body.account_id is not None:
        authorize_account(p, body.account_id)
    acc = body.account_id if body.account_id is not None else p.account_id
    ex = ToolExecutor(db, p, acc)
    settings = get_settings()
    msgs = [m.model_dump() for m in body.messages[-settings.ai_chat_messages:]]
    if sum(len(m["content"]) for m in msgs) > settings.ai_max_prompt_chars:
        raise HTTPException(422, "Conversation exceeds the configured input budget; start a shorter conversation")
    if acc is not None:
        msgs[0] = {**msgs[0], "content": f"(Context: the user is viewing account_id {acc}.)\n" + msgs[0]["content"]}
    audit(db, p.sub, "ai_chat", f"account:{acc}", turns=len(msgs))
    try:
        if not ai_allowed(db, p.sub):
            raise gemini.GeminiUnavailable("Personalized AI guidance is turned off in Settings → Privacy & AI")
        res = gemini.chat_with_tools(msgs, TOOL_DECLARATIONS, ex, max_rounds=settings.ai_tool_rounds)
        allowed = gemini.collect_numbers(ex.facts)
        res["number_check"] = gemini.verify_numbers(res["text"], allowed)
        if not res["number_check"]["ok"]:
            res = {**fallback_chat(body.messages[-1].content, ex), "usage": res.get("usage", {}), "fallback_reason": "AI output contained unverified amounts"}
    except gemini.GeminiUnavailable as exc:
        res = fallback_chat(body.messages[-1].content, ex)
        res["fallback_reason"] = str(exc)[:200]
    res["citations"] = [{"headline": c["headline"], "publisher": c["publisher"], "published": c["published"], "url": c["url"]}
                        for c in ex.citations]
    return res


class ExplainScenarioBody(BaseModel):
    request: ShockRequest


@router.post("/explain-scenario")
def explain(body: ExplainScenarioBody, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    authorize_account(p, body.request.account_id)
    b = get_baseline(db, body.request.account_id)
    try:
        sim = apply_shocks(b, body.request, get_settings().ei_max_weekly_benefit)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"simulation_hash": sim["input_hash"], **explain_scenario(db, sim, financial_context(b), allow_ai=ai_allowed(db, p.sub), cache_scope=p.sub)}


class ExplainPlanBody(BaseModel):
    account_id: int
    plan_type: Literal["goal", "backup"]
    goal: GoalPlanRequest | None = None
    shock: ShockRequest | None = None


@router.post("/explain-plan")
def explain_plan_route(body: ExplainPlanBody, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    authorize_account(p, body.account_id)
    b = get_baseline(db, body.account_id)
    if body.goal is not None and body.goal.account_id != body.account_id:
        raise HTTPException(422, "goal.account_id must match account_id")
    if body.shock is not None and body.shock.account_id != body.account_id:
        raise HTTPException(422, "shock.account_id must match account_id")
    if body.plan_type == "goal":
        plan = goal_plan(b, body.goal or GoalPlanRequest(account_id=body.account_id))
    else:
        if not body.shock:
            raise HTTPException(422, "shock required for backup plan explanation")
        plan = backup_plan(b, body.shock, get_settings().ei_max_weekly_benefit)
    return explain_plan(db, plan, financial_context(b), allow_ai=ai_allowed(db, p.sub), cache_scope=p.sub)
