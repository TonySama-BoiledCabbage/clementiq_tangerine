"""Dashboard preferences, per-user isolation, profile photo validation, avatar consent & failure handling."""
import io

import pytest
from PIL import Image


def _login(client, role, code, account_id=None, name=None):
    r = client.post("/api/auth/demo-login", json={"role": role, "access_code": code, "account_id": account_id, "display_name": name})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def alice(client):
    return _login(client, "judge", "tangerine-judge", name="alice")


@pytest.fixture(scope="module")
def bob(client):
    return _login(client, "judge", "tangerine-judge", name="bob")


def _png(w=200, h=200, color=(255, 140, 0)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, "PNG")
    return buf.getvalue()


def _jpeg_with_exif() -> bytes:
    img = Image.new("RGB", (300, 200), (10, 120, 200))
    exif = Image.Exif()
    exif[0x010F] = "SecretCameraMaker"  # Make
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif.tobytes())
    return buf.getvalue()


# ---- dashboard preferences ------------------------------------------------------------
def test_dashboard_defaults_and_persistence(client, alice):
    prefs = client.get("/api/settings", headers=alice).json()["preferences"]
    assert prefs["dashboard"] == {"layout_density": "balanced", "features": {}, "favorites": [], "order": []}
    assert prefs["appearance"]["orchard_enabled"] is True
    r = client.patch("/api/settings", headers=alice, json={"dashboard": {
        "layout_density": "compact", "features": {"worldPulse": True, "shockSimulator": False},
        "favorites": ["aiAdvisor"], "order": ["aiAdvisor", "worldPulse", "financialDashboard"]}})
    assert r.status_code == 200
    d = client.get("/api/settings", headers=alice).json()["preferences"]["dashboard"]  # survives a fresh read
    assert d["layout_density"] == "compact" and d["features"] == {"worldPulse": True, "shockSimulator": False}
    assert d["favorites"] == ["aiAdvisor"] and d["order"][0] == "aiAdvisor"
    # toggling one feature keeps the others (deep merge), turning a feature back on restores it
    client.patch("/api/settings", headers=alice, json={"dashboard": {"features": {"shockSimulator": True}}})
    d = client.get("/api/settings", headers=alice).json()["preferences"]["dashboard"]
    assert d["features"] == {"worldPulse": True, "shockSimulator": True}


def test_preferences_survive_new_login_and_are_isolated(client, alice, bob):
    client.patch("/api/settings", headers=alice, json={"appearance": {"money_trees": False, "theme": "dark"}})
    alice2 = _login(client, "judge", "tangerine-judge", name="alice")       # sign in again
    assert client.get("/api/settings", headers=alice2).json()["preferences"]["appearance"]["money_trees"] is False
    bob_prefs = client.get("/api/settings", headers=bob).json()["preferences"]
    assert bob_prefs["appearance"]["money_trees"] is True and bob_prefs["dashboard"]["layout_density"] == "balanced"


def test_dashboard_validation(client, alice):
    assert client.patch("/api/settings", headers=alice, json={"dashboard": {"layout_density": "huge"}}).status_code == 422
    assert client.patch("/api/settings", headers=alice, json={"dashboard": {"features": {"bad id!": True}}}).status_code == 422
    assert client.patch("/api/settings", headers=alice, json={"appearance": {"theme": "neon"}}).status_code == 422


def test_hiding_features_does_not_touch_data(client, alice):
    client.patch("/api/settings", headers=alice, json={"dashboard": {"features": {"financialDashboard": False}}})
    assert client.get("/api/accounts/1001/summary", headers=alice).status_code == 200


# ---- profile photo --------------------------------------------------------------------
def test_photo_upload_validation(client, alice):
    put = lambda data, ctype: client.put("/api/profile/photo", headers={**alice, "Content-Type": ctype}, content=data)
    assert put(_png(), "image/gif").status_code == 415
    assert put(b"\x89PNG\r\n\x1a\nnot really an image", "image/png").status_code == 422
    assert put(_png(20, 20), "image/png").status_code == 422                     # too small
    assert put(b"\x89PNG\r\n\x1a\n" + b"0" * (6 * 1024 * 1024), "image/png").status_code == 413
    r = put(_jpeg_with_exif(), "image/jpeg")
    assert r.status_code == 200, r.text
    got = client.get("/api/profile/photo", headers=alice)
    assert got.status_code == 200 and got.headers["content-type"] == "image/jpeg"
    assert b"SecretCameraMaker" not in got.content                                 # metadata stripped
    assert client.get("/api/profile", headers=alice).json()["photo"]["width"] == 300


def test_photo_is_private(client, alice, bob):
    client.put("/api/profile/photo", headers={**alice, "Content-Type": "image/png"}, content=_png())
    assert client.get("/api/profile/photo", headers=bob).status_code == 404
    assert client.get("/api/profile/photo").status_code == 401


# ---- avatar ---------------------------------------------------------------------------
def test_avatar_requires_consent_and_photo(client, bob):
    assert client.post("/api/profile/avatar/generate", headers=bob).status_code == 403   # no consent
    client.post("/api/profile/avatar/consent", headers=bob, json={"consent": True})
    assert client.post("/api/profile/avatar/generate", headers=bob).status_code == 422   # no photo yet


def test_avatar_failure_keeps_default(client, alice):
    client.put("/api/profile/photo", headers={**alice, "Content-Type": "image/png"}, content=_png())
    client.post("/api/profile/avatar/consent", headers=alice, json={"consent": True})
    r = client.post("/api/profile/avatar/generate", headers=alice)                       # no GEMINI_API_KEY in tests
    assert r.status_code == 503 and "default orchard character" in r.json()["detail"]
    assert client.get("/api/profile/avatar", headers=alice).status_code == 404
    assert client.get("/api/settings", headers=alice).json()["preferences"]["avatar"]["personalized_enabled"] is False
    assert client.get("/api/accounts/1001/summary", headers=alice).status_code == 200    # dashboard unaffected


def test_avatar_success_regenerate_and_delete(client, alice, monkeypatch):
    from clementiq.ai import gemini
    monkeypatch.setattr(gemini, "generate_avatar", lambda data, mime: (_png(512, 512, (250, 200, 150)), "image/png", "test-model"))
    client.post("/api/profile/avatar/consent", headers=alice, json={"consent": True})
    assert client.post("/api/profile/avatar/generate", headers=alice).status_code == 200
    assert client.get("/api/profile/avatar", headers=alice).status_code == 200
    assert client.get("/api/settings", headers=alice).json()["preferences"]["avatar"]["personalized_enabled"] is True
    assert client.get("/api/profile", headers=alice).json()["avatar"]["source"] == "gemini:test-model"
    # withdrawing consent disables the personalised character; deleting removes the assets
    client.post("/api/profile/avatar/consent", headers=alice, json={"consent": False})
    assert client.get("/api/settings", headers=alice).json()["preferences"]["avatar"]["personalized_enabled"] is False
    assert client.delete("/api/profile/all", headers=alice).json()["deleted"] == ["photo", "avatar"]
    assert client.get("/api/profile/avatar", headers=alice).status_code == 404


# ---- privacy & notifications ----------------------------------------------------------
def test_personalized_ai_off_uses_templates(client, bob):
    client.patch("/api/settings", headers=bob, json={"privacy": {"personalized_ai": False}})
    r = client.post("/api/ai/explain-scenario", headers=bob, json={"request": {"account_id": 1001, "components": [{"type": "job_loss"}]}})
    assert r.json()["engine"] == "clement-core-template" and "turned off" in r.json()["fallback_reason"]
    chat = client.post("/api/ai/chat", headers=bob, json={"account_id": 1001, "messages": [{"role": "user", "content": "How resilient am I?"}]})
    assert "turned off" in chat.json()["fallback_reason"]


def test_shock_reminder_category(client, bob):
    r = client.post("/api/alerts/generate/1002", headers=bob).json()
    items = client.get("/api/alerts?category=reminders", headers=bob).json()["items"]
    assert any("resilience check-up" in a["title"] for a in items) and r["created"] >= 1
    client.patch("/api/settings", headers=bob, json={"alerts": {"categories": {"reminders": False}}})
    client.post("/api/shocks/scenarios", headers=bob, json={"name": "check", "request": {"account_id": 1001, "components": [{"type": "job_loss"}]}})
    client.post("/api/alerts/generate/1001", headers=bob)
    assert not [a for a in client.get("/api/alerts?category=reminders", headers=bob).json()["items"] if a["account_id"] == 1001]
