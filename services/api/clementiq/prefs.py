"""User preference schema (alerts, quiet hours, interests, outbound channels)."""
from __future__ import annotations

import copy
from typing import Any, Literal

from pydantic import BaseModel, Field

DEFAULT_PREFS: dict[str, Any] = {
    "alerts": {
        "enabled": True,
        "categories": {"financial_health": True, "global_events": True, "investments": True,
                       "crypto": True, "loan_exposure": True, "savings_goals": True},
        "min_severity": "low",
        "relevance_threshold": 40,
        "runway_threshold_months": 3,
        "max_per_day": 5,
        "quiet_hours": {"enabled": False, "start": "22:00", "end": "07:00", "timezone": "America/Toronto"},
    },
    "channels": {"in_app": True, "email": {"opt_in": False, "address": None},
                 "browser_push": {"opt_in": False}},
    "interests": ["inflation", "interest_rate", "energy", "employment"],
    "allocation_overrides": {},
    "display": {"reduced_motion": False, "enable_3d": True, "currency": "CAD"},
    "privacy": {"personalized_ai": True},
    "watched_accounts": [],
}


class QuietHours(BaseModel):
    enabled: bool = False
    start: str = Field("22:00", pattern=r"^\d{2}:\d{2}$")
    end: str = Field("07:00", pattern=r"^\d{2}:\d{2}$")
    timezone: str = "America/Toronto"


class AlertPrefs(BaseModel):
    enabled: bool | None = None
    categories: dict[str, bool] | None = None
    min_severity: Literal["low", "medium", "high"] | None = None
    relevance_threshold: float | None = Field(None, ge=0, le=100)
    runway_threshold_months: float | None = Field(None, ge=0, le=120)
    max_per_day: int | None = Field(None, ge=0, le=50)
    quiet_hours: QuietHours | None = None


class PrivacyPrefs(BaseModel):
    personalized_ai: bool | None = None


class PrefsPatch(BaseModel):
    privacy: PrivacyPrefs | None = None
    alerts: AlertPrefs | None = None
    channels: dict[str, Any] | None = None
    interests: list[str] | None = Field(None, max_length=20)
    allocation_overrides: dict[str, float] | None = None
    display: dict[str, Any] | None = None
    watched_accounts: list[int] | None = Field(None, max_length=50)


def merge_prefs(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(base)
    for k, v in (patch or {}).items():
        if v is None:
            continue
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = merge_prefs(out[k], v)
        else:
            out[k] = v
    return out
