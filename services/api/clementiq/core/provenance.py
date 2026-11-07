"""Provenance-carrying results.

Every authoritative number Clement Core produces is wrapped in a `Calc` so the UI, the AI
engine and the judges can see the inputs, formula, assumptions, units and data source.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

ENGINE = "clement-core"
ENGINE_VERSION = "1.0.0"


@dataclass
class Calc:
    name: str
    value: float | None
    unit: str
    formula: str
    inputs: dict[str, Any] = field(default_factory=dict)
    assumptions: list[str] = field(default_factory=list)
    provenance: str = "monthly_summary.csv"
    warnings: list[str] = field(default_factory=list)
    display: str | None = None

    def to_dict(self, computed_at: str | None = None) -> dict[str, Any]:
        d = asdict(self)
        d["engine"] = ENGINE
        d["computed_at"] = computed_at or now_iso()
        return d


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stable_hash(obj: Any) -> str:
    """Deterministic hash of validated inputs (used for reproducibility checks and caching)."""
    return hashlib.sha256(json.dumps(obj, sort_keys=True, default=str).encode()).hexdigest()


def envelope(payload: dict[str, Any], inputs: Any) -> dict[str, Any]:
    return {
        "engine": ENGINE,
        "engine_version": ENGINE_VERSION,
        "computed_at": now_iso(),
        "input_hash": stable_hash(inputs),
        **payload,
    }
