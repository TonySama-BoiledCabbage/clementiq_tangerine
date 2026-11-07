"""ClementAI chat tools — server-side, validated, authorized and audited.

Gemini can only reach data through these functions. Each call checks the caller's permission for
the requested account, validates arguments with pydantic, and writes an audit record.
"""
from __future__ import annotations

import re
from typing import Any, Callable

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..auth import Principal
from ..core.exposure import TOPIC_CHANNELS, ImpactRequest, event_impact
from ..core.recovery import GoalPlanRequest, backup_plan, goal_plan
from ..core.resilience import resilience_score
from ..core.runway import compute_runway
from ..core.shocks import ShockComponent, ShockRequest, apply_shocks
from ..repository import audit, get_baseline
from .sanitize import financial_context


class AccountArg(BaseModel):
    account_id: int


class ShockArgs(BaseModel):
    account_id: int
    income_replacement_pct: float | None = Field(None, ge=0, le=100)
    duration_months: int | None = Field(None, ge=1, le=60)
    household_bills_increase_pct: float | None = Field(None, ge=0, le=300)
    one_off_cost: float | None = Field(None, ge=0, le=1_000_000)
    one_off_months_of_spending: float | None = Field(None, ge=0, le=24)


class PlanArgs(BaseModel):
    account_id: int
    plan_type: str = Field(pattern="^(goal|backup)$")


class NewsArgs(BaseModel):
    topic: str | None = None
    limit: int = Field(5, ge=1, le=10)


class ExposureArgs(BaseModel):
    account_id: int
    topic: str
    magnitude: float = Field(ge=-100, le=500)
    level: str = Field("medium", pattern="^(low|medium|high)$")


class WalletArgs(BaseModel):
    public_key: str


def _acct(o: dict) -> dict:
    return {"type": "OBJECT", "properties": {"account_id": {"type": "INTEGER"}, **o}, "required": ["account_id"]}


TOOL_DECLARATIONS: list[dict[str, Any]] = [
    {"name": "get_financial_summary", "description": "Typical monthly income, spending, fixed costs, household bills, buffer and loan payment for an account (Clement Core).", "parameters": _acct({})},
    {"name": "get_runway", "description": "Baseline months of runway for an account.", "parameters": _acct({})},
    {"name": "run_shock_simulation", "description": "Run a judging-mode shock: income replacement % (EI=55, job loss=0), household bills increase %, one-off cost $ or months of spending.",
     "parameters": _acct({"income_replacement_pct": {"type": "NUMBER"}, "duration_months": {"type": "INTEGER"},
                          "household_bills_increase_pct": {"type": "NUMBER"}, "one_off_cost": {"type": "NUMBER"},
                          "one_off_months_of_spending": {"type": "NUMBER"}})},
    {"name": "get_recovery_plan", "description": "Goal plan (3-month emergency fund) or backup plan (EI 55% shock).",
     "parameters": _acct({"plan_type": {"type": "STRING", "enum": ["goal", "backup"]}})},
    {"name": "get_verified_news", "description": "Recent retrieved WorldPulse news and official indicator updates, with source and date.",
     "parameters": {"type": "OBJECT", "properties": {"topic": {"type": "STRING"}, "limit": {"type": "INTEGER"}}}},
    {"name": "get_exposure_analysis", "description": "Model how an economic development (topic + magnitude %, or pp for interest_rate) could change the customer's monthly finances.",
     "parameters": _acct({"topic": {"type": "STRING", "enum": list(TOPIC_CHANNELS)}, "magnitude": {"type": "NUMBER"},
                          "level": {"type": "STRING", "enum": ["low", "medium", "high"]}})},
    {"name": "get_portfolio_summary", "description": "The user's hypothetical/demo/connected investment holdings and allocation.",
     "parameters": {"type": "OBJECT", "properties": {"note": {"type": "STRING"}}}},
    {"name": "get_solana_wallet", "description": "Read-only summary of a Solana wallet the user has explicitly connected.",
     "parameters": {"type": "OBJECT", "properties": {"public_key": {"type": "STRING"}}, "required": ["public_key"]}},
    {"name": "explain_resilience_score", "description": "Resilience score breakdown for an account.", "parameters": _acct({})},
    {"name": "get_alerts", "description": "The user's recent alerts with relevance explanations.", "parameters": _acct({})},
]


class ToolExecutor:
    def __init__(self, db: Session, principal: Principal, default_account: int | None):
        self.db = db
        self.p = principal
        self.default_account = default_account
        self.facts: list[Any] = []
        self.citations: list[dict[str, Any]] = []

    def _account(self, args: dict) -> int:
        acc = args.get("account_id") or self.default_account
        if acc is None:
            raise PermissionError("account_id required — ask the user which account")
        acc = int(acc)
        if not self.p.can_access(acc):
            raise PermissionError("not authorized for this account")
        return acc

    def __call__(self, name: str, args: dict[str, Any]) -> dict[str, Any]:
        fn: Callable | None = getattr(self, f"t_{name}", None)
        if fn is None:
            return {"error": f"unknown tool {name}"}
        try:
            res = fn(args)
            audit(self.db, self.p.sub, "ai_tool_call", name, args=args, ok=True)
            self.facts.append(res)
            return res
        except (ValidationError, PermissionError, ValueError) as exc:
            audit(self.db, self.p.sub, "ai_tool_call", name, args=args, ok=False, error=str(exc)[:200])
            return {"error": str(exc)[:300]}
        except Exception as exc:  # noqa: BLE001 - surface HTTPException detail etc.
            detail = getattr(exc, "detail", str(exc))
            audit(self.db, self.p.sub, "ai_tool_call", name, args=args, ok=False, error=str(detail)[:200])
            return {"error": str(detail)[:300]}

    # --- tools -------------------------------------------------------------------
    def t_get_financial_summary(self, args):
        acc = self._account(args)
        b = get_baseline(self.db, acc)
        return {"basis": "calculated (Clement Core, judging definitions)", **financial_context(b),
                "buffer_months_used": b.buffer_months}

    def t_get_runway(self, args):
        acc = self._account(args)
        b = get_baseline(self.db, acc)
        rw = compute_runway(b.B, b.I, b.S)
        return {"basis": "calculated", "runway": rw.display, "monthly_gap": b.S - b.I}

    def t_run_shock_simulation(self, args):
        a = ShockArgs(**{**args, "account_id": self._account(args)})
        comps = []
        if a.income_replacement_pct is not None:
            comps.append(ShockComponent(type="job_loss", income_replacement_pct=a.income_replacement_pct,
                                        duration_months=a.duration_months))
        if a.household_bills_increase_pct:
            comps.append(ShockComponent(type="bill_inflation", pct=a.household_bills_increase_pct))
        if a.one_off_cost:
            comps.append(ShockComponent(type="emergency_expense", amount=a.one_off_cost))
        if a.one_off_months_of_spending:
            comps.append(ShockComponent(type="emergency_expense", months_of_spending=a.one_off_months_of_spending))
        if not comps:
            raise ValueError("no shock parameters given — ask the user what shock to model")
        b = get_baseline(self.db, a.account_id)
        sim = apply_shocks(b, ShockRequest(account_id=a.account_id, components=comps))
        return {"basis": "calculated + hypothetical scenario", "baseline_runway": sim["baseline"]["runway"]["display"],
                "scenario_income": round(sim["scenario"]["income"], 2), "scenario_spending": round(sim["scenario"]["spending"], 2),
                "one_off_costs": round(sim["scenario"]["one_off_costs"], 2),
                "monthly_gap": round(sim["scenario"]["gap"], 2), "scenario_runway": sim["scenario"]["runway"]["display"],
                "verdict": sim["verdict"], "effects": [e["rule"] for e in sim["effects"]]}

    def t_get_recovery_plan(self, args):
        a = PlanArgs(**{**args, "account_id": self._account(args)})
        b = get_baseline(self.db, a.account_id)
        if a.plan_type == "goal":
            p = goal_plan(b, GoalPlanRequest(account_id=a.account_id))
            return {"basis": "calculated", "target": round(p["target"], 2), "gap": round(p["gap"], 2),
                    "monthly_contribution": round(p["recommended_monthly_contribution"], 2),
                    "months_to_goal": p["months_to_goal"], "status": p["status"]}
        p = backup_plan(b, ShockRequest(account_id=a.account_id,
                                        components=[ShockComponent(type="job_loss", income_replacement_pct=55, duration_months=6)]))
        return {"basis": "calculated (EI 55% for 6 months)", "monthly_shortfall": round(p["monthly_shortfall"], 2),
                "runway_no_action": p["alternatives"][0]["runway"]["display"],
                "best_option": p["best_tier"]["discretionary_cut_pct"], "best_runway": p["best_tier"]["runway"]["display"],
                "actions": [x["action"] for x in p["immediate_actions"]]}

    def t_get_verified_news(self, args):
        a = NewsArgs(**args)
        q = select(models.NewsEvent).order_by(models.NewsEvent.published_at.desc()).limit(a.limit)
        if a.topic:
            q = q.where(models.NewsEvent.topic == a.topic)
        rows = self.db.execute(q).scalars().all()
        items = [{"id": r.id, "headline": r.headline, "publisher": r.source_name, "source_type": r.source_type,
                  "published": r.published_at.isoformat() if r.published_at else None, "url": r.url,
                  "topic": r.topic, "classification": r.classification} for r in rows]
        self.citations.extend(items)
        return {"basis": "retrieved", "count": len(items), "items": items,
                "note": None if items else "No retrieved news stored. Do not invent any."}

    def t_get_exposure_analysis(self, args):
        a = ExposureArgs(**{**args, "account_id": self._account(args)})
        b = get_baseline(self.db, a.account_id)
        r = event_impact(b, ImpactRequest(account_id=a.account_id, topic=a.topic, magnitude=a.magnitude, level=a.level))
        return {"basis": "hypothetical scenario (calculated)", "topic": r["topic_label"],
                "additional_monthly_spending": round(r["additional_monthly_spending"], 2),
                "additional_monthly_income": round(r["additional_monthly_income"], 2),
                "new_surplus": round(r["scenario"]["surplus"], 2), "runway_before": r["baseline"]["runway"]["display"],
                "runway_after": r["scenario"]["runway"]["display"], "limitations": r["limitations"][:2]}

    def t_get_portfolio_summary(self, args):
        rows = self.db.execute(select(models.PortfolioHolding).where(models.PortfolioHolding.owner == self.p.sub)).scalars().all()
        return {"basis": "user-provided / demo holdings", "holdings": [
            {"symbol": h.symbol, "asset_class": h.asset_class, "quantity": h.quantity, "kind": h.holding_kind} for h in rows],
            "note": None if rows else "No portfolio saved. The Tangerine data contains no investments."}

    def t_get_solana_wallet(self, args):
        a = WalletArgs(**args)
        ok = self.db.execute(select(models.SolanaWallet).where(models.SolanaWallet.owner == self.p.sub,
                                                               models.SolanaWallet.public_key == a.public_key)).scalars().first()
        if not ok:
            raise PermissionError("wallet not connected by this user; ask them to connect it first")
        from ..solana.rpc import wallet_summary
        return {"basis": "retrieved (Solana RPC, read-only)", **wallet_summary(a.public_key, ok.network, history=5)}

    def t_explain_resilience_score(self, args):
        acc = self._account(args)
        r = resilience_score(get_baseline(self.db, acc))
        return {"basis": "calculated", "score": round(r["score"], 1), "band": r["band"],
                "components": [{"label": c["label"], "points": round(c["points"], 1), "max": c["max_points"]} for c in r["breakdown"]],
                "risks": r["risks"], "strengths": r["strengths"]}

    def t_get_alerts(self, args):
        acc = self._account(args)
        rows = self.db.execute(select(models.Alert).where(models.Alert.owner == self.p.sub, models.Alert.account_id == acc)
                               .order_by(models.Alert.created_at.desc()).limit(5)).scalars().all()
        return {"basis": "stored alerts", "alerts": [{"title": a.title, "severity": a.severity, "relevance": a.relevance,
                                                      "source": a.source} for a in rows]}


# ---------------------------------------------------------------- fallback router ------
_PCT = re.compile(r"(\d+(?:\.\d+)?)\s*%")
_MONTHS = re.compile(r"(\d+)\s*months?")


def fallback_chat(question: str, ex: ToolExecutor) -> dict[str, Any]:
    """Deterministic intent router used when Gemini is unavailable. Same tools, template answers."""
    q = question.lower()
    used = []

    def call(name, args):
        used.append(name)
        return ex(name, args)

    acc = ex.default_account
    if acc is None and any(w in q for w in ("my ", "i ", "am i", "should i")):
        return {"text": "Which account should I look at? Select one in the customer selector first.",
                "tool_calls": [], "engine": "clement-core-template", "clarification": True}

    if any(w in q for w in ("lose my job", "laid off", "job loss", "ei ")):
        pct = 55.0 if "ei" in q or "55" in q else 0.0
        m = _MONTHS.search(q)
        r = call("run_shock_simulation", {"account_id": acc, "income_replacement_pct": pct,
                                          "duration_months": int(m.group(1)) if m else None})
        if "error" in r:
            text = r["error"]
        else:
            text = (f"[hypothetical] With income at {pct:g}% of usual, monthly income would be ${r['scenario_income']:,.0f} "
                    f"against spending of ${r['scenario_spending']:,.0f}. [calculated] Runway: {r['scenario_runway']} months "
                    f"(baseline {r['baseline_runway']}).")
            if r.get("verdict"):
                text += " " + r["verdict"]["text"]
    elif any(w in q for w in ("fuel", "gas price", "oil", "energy")):
        p = _PCT.search(q)
        r = call("get_exposure_analysis", {"account_id": acc, "topic": "energy", "magnitude": float(p.group(1)) if p else 10.0})
        text = r.get("error") or (f"[hypothetical] A {float(p.group(1)) if p else 10:g}% energy-price rise, medium pass-through, "
                                  f"could add about ${r['additional_monthly_spending']:,.0f}/month. [calculated] Runway "
                                  f"{r['runway_before']} → {r['runway_after']} months. {' '.join(r['limitations'])}")
    elif any(w in q for w in ("interest rate", "rate hike", "rate increase", "borrowing")):
        r = call("get_exposure_analysis", {"account_id": acc, "topic": "interest_rate", "magnitude": 0.5})
        text = r.get("error") or (f"[hypothetical] A 0.5 pp rate rise (medium: half the loan reprices) changes loan costs by "
                                  f"about ${r['additional_monthly_spending']:,.0f}/month and savings interest by "
                                  f"${r['additional_monthly_income']:,.0f}/month. Runway {r['runway_before']} → {r['runway_after']}.")
    elif any(w in q for w in ("save", "emergency fund", "goal")):
        r = call("get_recovery_plan", {"account_id": acc, "plan_type": "goal"})
        text = r.get("error") or (f"[calculated] A 3-month emergency fund target is ${r['target']:,.0f}; the gap is ${r['gap']:,.0f}. "
                                  + (f"Saving ${r['monthly_contribution']:,.0f}/month reaches it in about {r['months_to_goal']} months."
                                     if r["months_to_goal"] else "Spending uses all income today, so reductions come first."))
    elif any(w in q for w in ("resilien", "score")):
        r = call("explain_resilience_score", {"account_id": acc})
        text = r.get("error") or (f"[calculated] Resilience score {r['score']}/100 ({r['band']}). Main risks: "
                                  f"{', '.join(r['risks']) or 'none flagged'}. Strengths: {', '.join(r['strengths']) or '—'}.")
    elif any(w in q for w in ("news", "watch", "economic", "world")):
        r = call("get_verified_news", {"limit": 5})
        if r["items"]:
            text = "[retrieved] Recent developments:\n" + "\n".join(
                f"• {i['headline']} — {i['publisher']}, {(i['published'] or '')[:10]}" for i in r["items"])
        else:
            text = "No verified news has been retrieved yet. Use 'Refresh World Intelligence' on WorldPulse."
    elif any(w in q for w in ("alert",)):
        r = call("get_alerts", {"account_id": acc})
        text = r.get("error") or ("\n".join(f"• {a['title']} ({a['severity']}): {a['relevance']}" for a in r["alerts"])
                                  or "No alerts yet.")
    else:
        r = call("get_financial_summary", {"account_id": acc})
        rw = call("get_runway", {"account_id": acc})
        text = r.get("error") or (f"[calculated] Typical income ${r['typical_monthly_income']:,.0f}/month, spending "
                                  f"${r['typical_monthly_spending']:,.0f}/month, buffer ${r['savings_buffer']:,.0f}. "
                                  f"Runway: {rw.get('runway')} months.")
    return {"text": text, "tool_calls": [{"name": n} for n in used], "engine": "clement-core-template"}
