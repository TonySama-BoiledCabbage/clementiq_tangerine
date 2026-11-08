"""Per-user preference schema (one JSON document per authenticated subject in user_preferences).

Sections: alerts, channels, interests, display, dashboard (feature visibility, favorites, order,
density), appearance (theme, orchard visuals), avatar (photo-generation consent), privacy (AI use).
Hiding a dashboard feature only changes visibility here; it never deletes data or stops services.
"""
from __future__ import annotations

import copy
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, StringConstraints

DEFAULT_PREFS: dict[str, Any] = {
    "alerts": {
        "enabled": True,
        "categories": {"financial_health": True, "global_events": True, "investments": True,
                       "crypto": True, "loan_exposure": True, "savings_goals": True, "reminders": True},
        "ai_explanations": True,
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
    "watched_accounts": [],
    # {} means "use each feature's registry default"; an explicit true/false always wins.
    "dashboard": {"layout_density": "balanced", "features": {}, "favorites": [], "order": []},
    "appearance": {"theme": "system", "orchard_enabled": True, "money_trees": True, "floating_coins": True,
                   "animations": True, "animation_intensity": "medium", "orchard_style": "illustrated",
                   "growth_visuals": True, "show_personal_character": True},
    # Accessibility & Comfort (all opt-in; the OS reduce-motion setting is always respected too)
    "accessibility": {"text_size": "default", "high_contrast": False, "simple_mode": False, "chart_tables": False,
                      "read_aloud": False, "read_amounts": False, "enhanced_focus": False, "calm_mode": False},
    # character: which figure sits in the orchard — the default illustration, the user's own photo
    # as a framed portrait (no AI), or a consented AI-generated character.
    "avatar": {"generation_consent": False, "consent_at": None, "personalized_enabled": False, "character": "default"},
    "privacy": {"personalized_ai": True, "optional_ai_insights": True, "mask_balances": False},
}

FEATURE_ID = r"^[a-zA-Z][a-zA-Z0-9_]{1,40}$"


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
    ai_explanations: bool | None = None


class DashboardPrefs(BaseModel):
    layout_density: Literal["minimal", "balanced", "compact"] | None = None
    features: dict[Annotated[str, StringConstraints(pattern=FEATURE_ID)], bool] | None = Field(None, max_length=60)
    favorites: list[Annotated[str, StringConstraints(pattern=FEATURE_ID)]] | None = Field(None, max_length=60)
    order: list[Annotated[str, StringConstraints(pattern=FEATURE_ID)]] | None = Field(None, max_length=60)


class AppearancePrefs(BaseModel):
    theme: Literal["light", "dark", "system"] | None = None
    orchard_enabled: bool | None = None
    money_trees: bool | None = None
    floating_coins: bool | None = None
    animations: bool | None = None
    animation_intensity: Literal["low", "medium", "high"] | None = None
    orchard_style: Literal["illustrated", "photo"] | None = None
    growth_visuals: bool | None = None
    show_personal_character: bool | None = None


class AccessibilityPrefs(BaseModel):
    text_size: Literal["default", "large", "x-large"] | None = None
    high_contrast: bool | None = None
    simple_mode: bool | None = None
    chart_tables: bool | None = None
    read_aloud: bool | None = None
    read_amounts: bool | None = None
    enhanced_focus: bool | None = None
    calm_mode: bool | None = None


class AvatarPrefs(BaseModel):
    personalized_enabled: bool | None = None
    character: Literal["default", "photo", "generated"] | None = None
    # consent is changed only through /api/profile/avatar/consent (records a timestamp)


class PrivacyPrefs(BaseModel):
    personalized_ai: bool | None = None
    optional_ai_insights: bool | None = None
    mask_balances: bool | None = None


class PrefsPatch(BaseModel):
    alerts: AlertPrefs | None = None
    channels: dict[str, Any] | None = None
    interests: list[str] | None = Field(None, max_length=20)
    allocation_overrides: dict[str, float] | None = None
    display: dict[str, Any] | None = None
    watched_accounts: list[int] | None = Field(None, max_length=50)
    dashboard: DashboardPrefs | None = None
    appearance: AppearancePrefs | None = None
    avatar: AvatarPrefs | None = None
    privacy: PrivacyPrefs | None = None
    accessibility: AccessibilityPrefs | None = None


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
