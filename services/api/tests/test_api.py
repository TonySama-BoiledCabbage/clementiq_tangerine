"""Integration tests for the main API flows, authorization and validation."""


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["database"]["accounts"] == 3


def test_unauthenticated_rejected(client):
    assert client.get("/api/accounts/1001/summary").status_code == 401
    assert client.post("/api/shocks/simulate", json={}).status_code == 401


def test_bad_access_code(client):
    r = client.post("/api/auth/demo-login", json={"role": "judge", "access_code": "nope"})
    assert r.status_code == 401


def test_customer_isolated_to_own_account(client, customer_1001):
    assert client.get("/api/accounts/1001/summary", headers=customer_1001).status_code == 200
    assert client.get("/api/accounts/1002/summary", headers=customer_1001).status_code == 403
    r = client.post("/api/shocks/simulate", headers=customer_1001,
                    json={"account_id": 1002, "components": [{"type": "job_loss"}]})
    assert r.status_code == 403
    lst = client.get("/api/accounts", headers=customer_1001).json()
    assert [i["account_id"] for i in lst["items"]] == [1001]


def test_admin_only_import(client, judge, customer_1001):
    assert client.post("/api/admin/imports/run", headers=judge).status_code == 403
    assert client.get("/api/admin/imports", headers=judge).status_code == 403
    assert client.get("/api/admin/imports", headers=customer_1001).status_code == 403


def test_obligations(client, judge, customer_1001):
    r = client.get("/api/accounts/1001/obligations", headers=judge)
    assert r.status_code == 200
    d = r.json()
    assert d["status"] in {"covered", "tight", "short", "unknown"}
    assert abs(d["fixed_total"] - sum(x["amount"] for x in d["fixed_payments"])) < 0.01
    if d["balance"] is not None:
        assert abs(d["left_after_fixed"] - (d["balance"] - d["fixed_total"])) < 0.01
    assert len(d["notes"]) == 2
    assert client.get("/api/accounts/1002/obligations", headers=customer_1001).status_code == 403


def test_summary_flow(client, judge):
    r = client.get("/api/accounts/1001/summary", headers=judge)
    assert r.status_code == 200
    j = r.json()
    assert j["judging"]["I"] == 3000 and j["judging"]["S"] == 2500 and j["judging"]["B"] == 5900
    assert j["judging"]["runway"]["display"] == "no shortfall (120+)"
    assert j["engine"] == "clement-core"
    assert "net worth" in j["net_position"]["label"].lower()
    assert all("formula" in c for c in j["calculations"])
    assert "gender" not in str(j["profile"]) and "birth" not in str(j["profile"])


def test_unknown_account_404(client, judge):
    assert client.get("/api/accounts/424242/summary", headers=judge).status_code == 404


def test_simulate_and_validation(client, judge):
    ok = client.post("/api/shocks/simulate", headers=judge, json={
        "account_id": 1001, "components": [{"type": "job_loss", "income_replacement_pct": 55},
                                           {"type": "bill_inflation", "pct": 15}]})
    assert ok.status_code == 200 and ok.json()["scenario"]["runway"]["display"] == "5.9"
    bad = client.post("/api/shocks/simulate", headers=judge, json={"account_id": 1001, "components": [{"type": "meteor"}]})
    assert bad.status_code == 422
    neg = client.post("/api/shocks/simulate", headers=judge, json={
        "account_id": 1001, "components": [{"type": "vehicle_repair", "amount": -5}]})
    assert neg.status_code == 422


def test_plans(client, judge):
    g = client.post("/api/recovery/goal-plan", headers=judge, json={"account_id": 1001}).json()
    assert g["months_to_goal"] == 7
    b = client.post("/api/recovery/backup-plan", headers=judge, json={"account_id": 1001, "preset_id": "ei55_6m"}).json()
    assert abs(b["monthly_shortfall"] - 850) < 1e-6
    assert client.post("/api/recovery/plans", headers=judge, json={"account_id": 1001, "plan_type": "goal",
                                                                   "params": {}, "result": {}}).status_code == 403


def test_judge_verify(client, judge):
    j = client.get("/api/judge/verify/1001", headers=judge).json()
    assert j["all_match"] and [r["reference"] for r in j["rows"]] == ["6.9", "no shortfall (120+)", "5.9"]


def test_ai_chat_fallback(client, judge):
    r = client.post("/api/ai/chat", headers=judge, json={"account_id": 1001,
                    "messages": [{"role": "user", "content": "What happens if I lose my job and get EI?"}]})
    assert r.status_code == 200
    j = r.json()
    assert j["engine"] == "clement-core-template" and "6.9" in j["text"]


def test_explain_scenario_fallback(client, judge):
    r = client.post("/api/ai/explain-scenario", headers=judge, json={"request": {
        "account_id": 1002, "components": [{"type": "job_loss", "income_replacement_pct": 0}]}})
    assert r.status_code == 200 and r.json()["engine"] == "clement-core-template"


def test_worldpulse_impact_and_empty_news(client, judge):
    ev = client.get("/api/worldpulse/events", headers=judge).json()
    assert ev["total"] == 0 and "never invents" in ev["empty_reason"]
    r = client.post("/api/worldpulse/impact", headers=judge, json={"account_id": 1001, "topic": "energy", "magnitude": 15})
    assert r.status_code == 200 and r.json()["label"].startswith("HYPOTHETICAL")


def test_alerts_generation_idempotent(client, customer_1001):
    first = client.post("/api/alerts/generate/1001", headers=customer_1001).json()
    second = client.post("/api/alerts/generate/1001", headers=customer_1001).json()
    assert second["created"] == 0
    assert second["suppressed"]["duplicate"] >= first["created"]
    lst = client.get("/api/alerts", headers=customer_1001).json()
    assert lst["total"] == first["created"]
    if lst["items"]:
        aid = lst["items"][0]["id"]
        assert client.patch(f"/api/alerts/{aid}", headers=customer_1001, json={"is_read": True}).json()["is_read"]


def test_settings_roundtrip(client, customer_1001):
    r = client.patch("/api/settings", headers=customer_1001, json={"alerts": {"max_per_day": 2, "quiet_hours":
                     {"enabled": True, "start": "21:00", "end": "08:00"}}})
    p = r.json()["preferences"]["alerts"]
    assert p["max_per_day"] == 2 and p["quiet_hours"]["enabled"] and p["categories"]["crypto"] is True
    assert client.patch("/api/settings", headers=customer_1001, json={"alerts": {"max_per_day": 999}}).status_code == 422


def test_solana_rejects_secrets_and_requires_consent(client, judge):
    r = client.get("/api/solana/wallet/" + "1" * 32, headers=judge)
    assert r.status_code == 403
    r = client.post("/api/solana/connect", headers=judge, json={"public_key": " ".join(["abandon"] * 12), "consent": True})
    assert r.status_code == 400
    r = client.post("/api/solana/connect", headers=judge, json={"public_key": "1" * 32, "consent": False})
    assert r.status_code == 422


def test_goal_proof_flow_without_network(client, customer_1001):
    g = client.post("/api/solana/goals", headers=customer_1001, json={"account_id": 1001, "name": "EF", "target_amount": 7500}).json()
    r = client.post("/api/solana/devnet/goal-proof", headers=customer_1001, json={"goal_id": g["id"]}).json()
    assert r["memo"].startswith("ClementIQ:goal:v1:") and "7500" not in r["memo"]


def test_investments_portfolio_scenario(client, customer_1001):
    assert client.post("/api/investments/holdings", headers=customer_1001, json={
        "symbol": "TEST", "asset_class": "stock", "quantity": 10, "price": 50, "holding_kind": "hypothetical"}).status_code == 200
    pf = client.get("/api/investments/portfolio", headers=customer_1001).json()
    assert pf["total_value"] == 500 and "no investment holdings" in pf["notice"]
    sc = client.post("/api/investments/scenario", headers=customer_1001, json={"scenario_id": "equity_correction"}).json()
    assert sc["modeled_value"] == 450


def test_insights(client, judge):
    j = client.get("/api/insights", headers=judge).json()
    assert j["available"] and j["n_accounts"] == 3 and j["findings"]


def test_needs_attention(client, judge, customer_1001):
    assert client.get("/api/insights/needs-attention", headers=customer_1001).status_code == 403
    assert client.get("/api/insights", headers=customer_1001).status_code == 403
    d = client.get("/api/insights/needs-attention", headers=judge).json()
    assert d["total"] == len(d["items"]) <= d["active_accounts"]
    sev = {"short": 0, "behind": 1, "thin": 2}
    keys = [(min(sev[f] for f in it["flags"]), it["left_after_fixed"]) for it in d["items"]]
    assert keys == sorted(keys)
    for it in d["items"]:
        assert it["flags"]
        if "short" in it["flags"]:
            assert it["left_after_fixed"] < 0
        if "thin" in it["flags"]:
            assert it["B"] < it["S"]
    assert "not credit decisions" in d["use"]
    t = client.get("/api/insights/needs-attention?flag=thin", headers=judge).json()
    assert t["matching"] == d["counts"]["thin"] and all("thin" in it["flags"] for it in t["items"])
    assert client.get("/api/insights/needs-attention?flag=bogus", headers=judge).status_code == 422


def test_mortgage_renewal_preset(client, judge):
    ids = [p["id"] for p in client.get("/api/shocks/presets", headers=judge).json()["presets"]]
    assert "mortgage_renewal" in ids
