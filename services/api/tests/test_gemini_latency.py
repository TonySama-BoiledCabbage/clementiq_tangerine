"""Gemini transport and multi-round latency limits; no paid API calls."""
import httpx
import pytest

from clementiq.ai import gemini
from clementiq.config import Settings, get_settings


def test_fast_default_and_timeout_fallback(monkeypatch):
    assert Settings(_env_file=None).gemini_model == "gemini-3.5-flash-lite"
    monkeypatch.setattr(get_settings(), "gemini_api_key", "test-key")
    attempts = []

    def timeout(*args, **kwargs):
        attempts.append(kwargs["timeout"])
        raise httpx.ReadTimeout("provider stalled")

    monkeypatch.setattr(gemini.httpx, "post", timeout)
    with pytest.raises(gemini.GeminiUnavailable, match="standard explanation"):
        gemini._post({}, timeout_s=2)
    assert len(attempts) == 1  # No automatic retry or extra paid request.
    assert attempts[0].connect == attempts[0].read == 2


@pytest.mark.parametrize("first_round_s", [12, 30])
def test_chat_rounds_share_one_budget(monkeypatch, first_round_s):
    settings = get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(settings, "gemini_timeout_s", 30)
    clock, waits, executed = [100.0], [], []
    monkeypatch.setattr(gemini, "monotonic", lambda: clock[0])

    def post(*args, **kwargs):
        waits.append(kwargs["timeout"].read)
        clock[0] += first_round_s
        parts = ([{"functionCall": {"name": "get_fact", "args": {}}}]
                 if len(waits) == 1 else [{"text": "Verified result."}])
        return httpx.Response(200, json={"candidates": [{"content": {"parts": parts}}]})

    def execute(name, args):
        executed.append(name)
        clock[0] += 3
        return {"value": 1}

    monkeypatch.setattr(gemini.httpx, "post", post)
    if first_round_s == 30:
        with pytest.raises(gemini.GeminiUnavailable, match="time budget"):
            gemini.chat_with_tools([], [], execute)
        assert waits == [30] and executed == []
    else:
        result = gemini.chat_with_tools([], [], execute)
        assert result["text"] == "Verified result."
        assert waits == [30, 15] and executed == ["get_fact"]


def test_empty_chat_uses_fallback_instead_of_blank_answer(monkeypatch):
    monkeypatch.setattr(gemini, "_post", lambda *a, **kw: {"candidates": [{"content": {"parts": []}}]})
    with pytest.raises(gemini.GeminiUnavailable, match="no answer"):
        gemini.chat_with_tools([], [], lambda *a: {})
