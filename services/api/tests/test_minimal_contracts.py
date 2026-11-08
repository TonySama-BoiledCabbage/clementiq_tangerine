"""Permissions and full-dataset search carried into the minimal product."""
def test_minimal_role_contract(client, judge, admin, customer_1001):
    for headers, staff in ((judge, True), (admin, True), (customer_1001, False)):
        me = client.get("/api/auth/me", headers=headers).json()
        assert me["entitlements"]["account_search"] == staff
        assert client.get("/api/accounts/search?q=1001", headers=headers).status_code == (200 if staff else 403)
        assert client.get("/api/judge/verify/1001", headers=headers).status_code == (200 if staff else 403)
        assert client.get("/api/admin/imports", headers=headers).status_code == (200 if staff else 403)
    own = client.get("/api/accounts?q=9999", headers=customer_1001).json()
    assert [r["account_id"] for r in own["items"]] == [1001]


def test_minimal_search_and_named_identity(client, judge):
    result = client.get("/api/accounts/search?q=1001&limit=1", headers=judge).json()
    assert result["exact_match"] and result["items"][0]["account_id"] == 1001
    contains = client.get("/api/accounts/search?q=01", headers=judge).json()
    assert any(r["account_id"] == 1001 for r in contains["items"])
    a = client.post("/api/auth/demo-login", json={"role": "judge", "access_code": "tangerine-judge", "display_name": "One"}).json()
    b = client.post("/api/auth/demo-login", json={"role": "judge", "access_code": "tangerine-judge", "display_name": "Two"}).json()
    assert a["sub"] != b["sub"]


def test_customer_cannot_watch_other_accounts(client, customer_1001):
    assert client.patch("/api/settings", headers=customer_1001, json={"watched_accounts": [1002]}).status_code == 403
    assert client.patch("/api/settings", headers=customer_1001, json={"watched_accounts": [1001]}).status_code == 200


def test_portfolio_ai_remains_staff_only(client, customer_1001):
    assert client.post("/api/insights/snowflake-review", headers=customer_1001).status_code == 403
