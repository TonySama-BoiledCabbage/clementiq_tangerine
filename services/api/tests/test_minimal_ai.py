"""AI consent, cache scope and zero-cost default flows; no external calls."""
from clementiq.ai import gemini, service

SHOCK = {"account_id": 1001, "components": [{"type": "job_loss", "income_replacement_pct": 55}], "mode": "judging"}

def test_ai_off_and_core_flows_never_call_provider(client, customer_1001, monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Unexpected model call")
    monkeypatch.setattr(gemini, "generate_json", forbidden)
    monkeypatch.setattr(gemini, "chat_with_tools", forbidden)
    client.patch("/api/settings", headers=customer_1001, json={"privacy": {"personalized_ai": False}})
    assert client.post("/api/shocks/simulate", headers=customer_1001, json=SHOCK).status_code == 200
    assert client.post("/api/recovery/backup-plan", headers=customer_1001, json={"account_id": 1001, "shock": SHOCK}).status_code == 200
    explanation = client.post("/api/ai/explain-scenario", headers=customer_1001, json={"request": SHOCK}).json()
    assert explanation["engine"] == "clement-core-template" and "turned off" in explanation["fallback_reason"]
    chat = client.post("/api/ai/chat", headers=customer_1001, json={"account_id": 1001, "messages": [{"role": "user", "content": "How much should I save?"}]}).json()
    assert chat["engine"] == "clement-core-template"
    assert client.post("/api/alerts/generate/1001", headers=customer_1001).status_code == 200
    client.patch("/api/settings", headers=customer_1001, json={"privacy": {"personalized_ai": True}})

def test_ai_cache_consent_and_scope(client, judge, monkeypatch):
    hashes = []
    monkeypatch.setattr(service, "_cached", lambda db, kind, h: hashes.append(h) or {"engine": "clement-gemini", "content": {"summary": "cached"}})
    assert client.post("/api/ai/explain-scenario", headers=judge, json={"request": SHOCK}).json()["cached"]
    other = client.post("/api/auth/demo-login", json={"role": "judge", "access_code": "tangerine-judge", "display_name": "Other"}).json()
    other_headers = {"Authorization": "Bearer " + other["access_token"]}
    client.post("/api/ai/explain-scenario", headers=other_headers, json={"request": SHOCK})
    assert hashes[0] != hashes[1]
    client.patch("/api/settings", headers=judge, json={"privacy": {"personalized_ai": False}})
    result = client.post("/api/ai/explain-scenario", headers=judge, json={"request": SHOCK}).json()
    assert result["engine"] == "clement-core-template" and len(hashes) == 2
    client.patch("/api/settings", headers=judge, json={"privacy": {"personalized_ai": True}})

def test_ai_nested_account_scope(client, customer_1001):
    r = client.post("/api/ai/explain-plan", headers=customer_1001, json={"account_id": 1001, "plan_type": "goal", "goal": {"account_id": 1002}})
    assert r.status_code == 422
