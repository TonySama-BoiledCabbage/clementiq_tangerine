"""Optional Snowflake Cortex adapter (Cortex REST API, /api/v2/cortex/inference:complete).

Used for ONE clearly labelled feature: an independent "second-opinion" narrative of the Insights
dashboard findings (structured economic analysis). Gemini remains the primary AI engine.
Enabled only when SNOWFLAKE_ACCOUNT_URL and SNOWFLAKE_PAT are set.
"""
from __future__ import annotations

import json
from typing import Any

import httpx

from ..config import get_settings


class SnowflakeUnavailable(RuntimeError):
    pass


def cortex_complete(prompt: str, max_tokens: int = 600) -> dict[str, Any]:
    s = get_settings()
    if not s.snowflake_enabled:
        raise SnowflakeUnavailable("Snowflake not configured (SNOWFLAKE_ACCOUNT_URL, SNOWFLAKE_PAT)")
    url = s.snowflake_account_url.rstrip("/") + "/api/v2/cortex/inference:complete"
    body = {"model": s.snowflake_model, "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens, "temperature": 0.2, "stream": False}
    headers = {"Authorization": f"Bearer {s.snowflake_pat}", "Content-Type": "application/json",
               "Accept": "application/json", "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN"}
    try:
        r = httpx.post(url, json=body, headers=headers, timeout=45)
    except httpx.HTTPError as exc:
        raise SnowflakeUnavailable(f"network error: {exc.__class__.__name__}") from exc
    if r.status_code != 200:
        raise SnowflakeUnavailable(f"Cortex HTTP {r.status_code}: {r.text[:200]}")
    text = _extract(r.text)
    return {"text": text, "engine": "snowflake-cortex", "model": s.snowflake_model}


def _extract(raw: str) -> str:
    """Cortex may return a JSON body or server-sent-event lines; handle both."""
    try:
        data = json.loads(raw)
        ch = data.get("choices", [{}])[0]
        return ch.get("message", {}).get("content") or ch.get("messages") or ""
    except json.JSONDecodeError:
        out = []
        for line in raw.splitlines():
            if line.startswith("data:"):
                try:
                    d = json.loads(line[5:].strip())
                    out.append(d["choices"][0].get("delta", {}).get("content", ""))
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue
        return "".join(out)


def insights_second_opinion(findings: list[dict[str, Any]]) -> dict[str, Any]:
    prompt = ("You are reviewing statistical findings from an anonymized bank dataset about household "
              "financial resilience. Using ONLY the JSON below, write a 120-word neutral analysis: what the "
              "findings suggest, which are associations rather than causes, and one question for further "
              "research. Do not add numbers that are not in the JSON.\n" + json.dumps(findings, default=str))
    return cortex_complete(prompt)
