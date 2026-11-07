"""Minimise and sanitise everything sent to an external LLM.

* Financial context is reduced to rounded aggregates — no account IDs, client IDs, birth dates,
  gender, district names or raw transactions ever leave the server.
* Retrieved news/web text is UNTRUSTED: HTML and control characters are stripped, length is
  capped, instruction-like phrases are flagged, and the text is wrapped in delimiters that the
  system prompt tells the model to treat purely as data.
"""
from __future__ import annotations

import html
import re
from typing import Any

_TAG = re.compile(r"<[^>]+>")
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_WS = re.compile(r"\s+")
_INJECTION = re.compile(
    r"(ignore (all|any|previous|the above)|disregard (all|previous)|system prompt|you are now|"
    r"act as|new instructions|developer mode|<\s*/?\s*untrusted|BEGIN SOURCE|END SOURCE)", re.I)


def clean_untrusted(text: str | None, max_len: int = 600) -> tuple[str, bool]:
    if not text:
        return "", False
    t = html.unescape(_TAG.sub(" ", text))
    t = _CTRL.sub(" ", t)
    t = _WS.sub(" ", t).strip()
    flagged = bool(_INJECTION.search(t))
    if flagged:
        t = _INJECTION.sub("[removed]", t)
    return t[:max_len], flagged


def wrap_sources(sources: list[dict[str, Any]]) -> tuple[str, list[str]]:
    """Render sources as delimited data blocks. Returns (text, ids_flagged_for_injection)."""
    blocks, flagged = [], []
    for s in sources:
        title, f1 = clean_untrusted(s.get("headline") or s.get("title"), 300)
        body, f2 = clean_untrusted(s.get("summary") or s.get("body"), 600)
        if f1 or f2:
            flagged.append(str(s.get("id")))
        blocks.append(
            f"BEGIN SOURCE id={s.get('id')}\n"
            f"publisher: {clean_untrusted(s.get('source_name'), 120)[0]}\n"
            f"published: {s.get('published_at')}\n"
            f"type: {s.get('source_type', 'news')}\n"
            f"title: {title}\n"
            f"text: {body}\n"
            f"END SOURCE")
    return "\n\n".join(blocks), flagged


def r(x: float | None, nd: int = 0) -> float | None:
    if x is None:
        return None
    return round(float(x), nd)


def financial_context(b, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    """The only customer data ever passed to Gemini: rounded aggregates computed by Clement Core."""
    ctx = {
        "typical_monthly_income": r(b.I), "typical_monthly_spending": r(b.S),
        "typical_fixed_costs": r(b.F), "typical_household_bills": r(b.H),
        "savings_buffer": r(b.B), "running_loan_payment": r(b.P),
        "typical_discretionary_outflows": r(b.D), "monthly_surplus": r(b.I - b.S),
        "months_of_history": b.months_of_data, "currency": "CAD",
    }
    if extra:
        ctx.update(extra)
    return ctx
