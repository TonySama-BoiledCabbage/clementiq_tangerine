"""Judge-only access, judge account search, avatar character choice and green-screen cut-out."""
import io

from PIL import Image

from clementiq.media import key_out_green


def _png(w=200, h=200, color=(255, 140, 0)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, "PNG")
    return buf.getvalue()


def _login(client, role, code, account_id=None, name=None):
    r = client.post("/api/auth/demo-login", json={"role": role, "access_code": code, "account_id": account_id, "display_name": name})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ---- role-based access -----------------------------------------------------------------
def test_me_reports_server_verified_entitlements(client, judge, customer_1001):
    j = client.get("/api/auth/me", headers=judge).json()
    c = client.get("/api/auth/me", headers=customer_1001).json()
    assert j["entitlements"]["judge_demo"] and j["entitlements"]["account_search"] and "judgeDemo" in j["features_allowed"]
    assert not c["entitlements"]["judge_demo"] and not c["entitlements"]["account_search"] and c["features_allowed"] == []


def test_customer_blocked_from_judge_endpoints(client, customer_1001):
    assert client.get("/api/judge/verify/1001", headers=customer_1001).status_code == 403   # even for own account
    assert client.get("/api/accounts/search?q=1", headers=customer_1001).status_code == 403
    assert client.get("/api/admin/imports", headers=customer_1001).status_code == 403


def test_customer_cannot_enable_judge_demo(client, customer_1001):
    r = client.patch("/api/settings", headers=customer_1001, json={"dashboard": {"features": {"judgeDemo": True}}})
    assert r.status_code == 403 and "judgeDemo" in r.json()["detail"]
    assert client.patch("/api/settings", headers=customer_1001, json={"dashboard": {"favorites": ["judgeDemo"]}}).status_code == 403
    assert client.patch("/api/settings", headers=customer_1001, json={"dashboard": {"features": {"judgeDemo": False}}}).status_code == 200
    prefs = client.get("/api/settings", headers=customer_1001).json()["preferences"]["dashboard"]
    assert "judgeDemo" not in prefs["features"]


def test_judge_can_use_judge_tools(client, judge):
    assert client.get("/api/judge/verify/1001", headers=judge).status_code == 200
    assert client.get("/api/admin/imports", headers=judge).status_code == 200
    assert client.patch("/api/settings", headers=judge, json={"dashboard": {"features": {"judgeDemo": True}}}).status_code == 200


# ---- judge account search ---------------------------------------------------------------
def test_search_exact_partial_and_ranking(client, judge):
    r = client.get("/api/accounts/search?q=1002", headers=judge).json()
    assert r["exact_match"] and r["items"][0]["account_id"] == 1002 and r["items"][0]["match"] == "exact"
    contains = client.get("/api/accounts/search?q=00", headers=judge).json()      # substring, not just prefix
    assert contains["total"] == 3 and [i["account_id"] for i in contains["items"]] == [1001, 1002, 1003]
    mid = client.get("/api/accounts/search?q=02", headers=judge).json()           # matches inside the id
    assert [i["account_id"] for i in mid["items"]] == [1002] and mid["items"][0]["match"] == "contains"


def test_search_pagination_empty_and_bad_input(client, judge):
    page = client.get("/api/accounts/search?q=&limit=1&offset=1", headers=judge).json()
    assert page["total"] == 3 and len(page["items"]) == 1 and page["items"][0]["account_id"] == 1002
    none = client.get("/api/accounts/search?q=99999", headers=judge).json()
    assert none["total"] == 0 and not none["exact_match"] and none["items"] == []
    bad = client.get("/api/accounts/search?q=abc", headers=judge).json()
    assert bad["total"] == 0 and "digits" in bad["message"]


# ---- avatar character choice -------------------------------------------------------------
def test_photo_character_mode(client):
    h = _login(client, "judge", "tangerine-judge", name="zara")
    assert client.patch("/api/settings", headers=h, json={"avatar": {"character": "photo"}}).status_code == 422     # no photo yet
    assert client.patch("/api/settings", headers=h, json={"avatar": {"character": "generated"}}).status_code == 422 # no avatar yet
    client.put("/api/profile/photo", headers={**h, "Content-Type": "image/png"}, content=_png())
    assert client.patch("/api/settings", headers=h, json={"avatar": {"character": "photo"}}).status_code == 200
    assert client.get("/api/settings", headers=h).json()["preferences"]["avatar"]["character"] == "photo"
    client.delete("/api/profile/photo", headers=h)                                       # removing the photo resets the orchard
    assert client.get("/api/settings", headers=h).json()["preferences"]["avatar"]["character"] == "default"


def test_generated_character_is_transparent_and_selected(client, monkeypatch):
    from clementiq.ai import gemini
    h = _login(client, "judge", "tangerine-judge", name="yuki")
    img = Image.new("RGB", (300, 300), (0, 255, 0))
    for x in range(100, 200):
        for y in range(80, 240):
            img.putpixel((x, y), (230, 150, 110))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    monkeypatch.setattr(gemini, "generate_avatar", lambda data, mime: (buf.getvalue(), "image/png", "test-model"))
    client.put("/api/profile/photo", headers={**h, "Content-Type": "image/png"}, content=_png())
    client.post("/api/profile/avatar/consent", headers=h, json={"consent": True})
    r = client.post("/api/profile/avatar/generate", headers=h).json()
    assert r["ok"] and r["transparent"]
    assert client.get("/api/settings", headers=h).json()["preferences"]["avatar"]["character"] == "generated"
    got = Image.open(io.BytesIO(client.get("/api/profile/avatar", headers=h).content))
    assert got.mode == "RGBA" and got.getpixel((5, 5))[3] == 0 and got.getpixel((150, 160))[3] == 255
    client.post("/api/profile/avatar/consent", headers=h, json={"consent": False})       # withdrawing consent → default
    assert client.get("/api/settings", headers=h).json()["preferences"]["avatar"]["character"] == "default"


def test_key_out_green_requires_green_background():
    buf = io.BytesIO()
    Image.new("RGB", (100, 100), (250, 200, 160)).save(buf, "PNG")
    assert key_out_green(buf.getvalue()) is None
