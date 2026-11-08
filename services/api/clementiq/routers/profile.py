"""Profile photo and personalised orchard avatar.

- Photos are uploaded as raw image bytes (Content-Type image/png|jpeg|webp), validated and
  re-encoded (EXIF stripped) before storage. Only the owner can read them.
- Avatar generation sends the photo to the Gemini image model ONLY after the user has given explicit
  consent (recorded with a timestamp). Failures never change existing state, and the app keeps showing
  the default orchard character.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .. import models
from ..ai import gemini
from ..auth import Principal, current_principal
from ..config import get_settings
from ..db import get_db
from ..media import ImageRejected, clean_image, key_out_green
from ..prefs import merge_prefs
from ..repository import audit, get_prefs

router = APIRouter(prefix="/api/profile", tags=["profile"])
KINDS = ("photo", "avatar")


def _media(db: Session, owner: str, kind: str) -> models.UserMedia | None:
    return db.execute(select(models.UserMedia).where(models.UserMedia.owner == owner, models.UserMedia.kind == kind)).scalars().first()


def _store(db: Session, owner: str, kind: str, img, source: str) -> models.UserMedia:
    row = _media(db, owner, kind) or models.UserMedia(owner=owner, kind=kind)
    row.mime, row.data, row.width, row.height, row.sha256, row.source = img.mime, img.data, img.width, img.height, img.sha256, source
    row.created_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()
    return row


def _set_prefs(db: Session, owner: str, patch: dict) -> None:
    row = db.get(models.UserPreference, owner)
    data = merge_prefs(row.data if row else {}, patch)
    if row:
        row.data = data
        row.updated_at = datetime.now(timezone.utc)
    else:
        db.add(models.UserPreference(owner=owner, data=data))
    db.commit()


def _display_name(p: Principal) -> str:
    role, _, rest = p.sub.partition(":")
    if p.role == "customer":
        return f"Customer {p.account_id}"
    return rest.replace("-", " ").title() if rest and rest != "demo" else role.title()


@router.get("")
def profile(p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    s = get_settings()
    meta = {}
    for kind in KINDS:
        m = _media(db, p.sub, kind)
        meta[kind] = None if not m else {"updated_at": m.created_at.isoformat() if m.created_at else None,
                                         "width": m.width, "height": m.height, "source": m.source, "version": m.sha256[:12],
                                         "transparent": m.mime == "image/png"}
    return {"sub": p.sub, "role": p.role, "account_id": p.account_id, "display_name": _display_name(p),
            "photo": meta["photo"], "avatar": meta["avatar"], "avatar_prefs": get_prefs(db, p.sub)["avatar"],
            "avatar_generation_available": s.gemini_enabled, "image_model": s.gemini_image_model if s.gemini_enabled else None,
            "max_upload_mb": s.max_upload_bytes // (1024 * 1024)}


@router.put("/photo")
async def upload_photo(request: Request, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    s = get_settings()
    ctype = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if ctype not in ("image/png", "image/jpeg", "image/webp"):
        raise HTTPException(415, "Upload a PNG, JPEG or WebP image")
    declared = int(request.headers.get("content-length") or 0)
    if declared > s.max_upload_bytes:
        raise HTTPException(413, f"Image is larger than {s.max_upload_bytes // (1024 * 1024)} MB")
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > s.max_upload_bytes:
            raise HTTPException(413, f"Image is larger than {s.max_upload_bytes // (1024 * 1024)} MB")
    try:
        img = clean_image(bytes(raw), s.max_upload_bytes, max_side=768)
    except ImageRejected as exc:
        raise HTTPException(422, str(exc)) from exc
    _store(db, p.sub, "photo", img, "upload")
    audit(db, p.sub, "profile_photo_upload", None, bytes=len(img.data))
    return {"ok": True, "width": img.width, "height": img.height, "version": img.sha256[:12],
            "avatar_outdated": _media(db, p.sub, "avatar") is not None}


@router.get("/{kind}")
def get_media(kind: str, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if kind not in KINDS:
        raise HTTPException(404, "not found")
    m = _media(db, p.sub, kind)
    if not m:
        raise HTTPException(404, f"no {kind}")
    return Response(m.data, media_type=m.mime, headers={"Cache-Control": "private, max-age=300", "ETag": m.sha256[:16],
                                                       "X-Content-Type-Options": "nosniff"})


@router.delete("/{kind}")
def delete_media(kind: str, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    if kind not in KINDS and kind != "all":
        raise HTTPException(404, "not found")
    kinds = KINDS if kind == "all" else (kind,)
    db.execute(delete(models.UserMedia).where(models.UserMedia.owner == p.sub, models.UserMedia.kind.in_(kinds)))
    db.commit()
    # Never leave the orchard pointing at an image that no longer exists.
    current = get_prefs(db, p.sub)["avatar"].get("character", "default")
    if ("avatar" in kinds and current == "generated") or ("photo" in kinds and current == "photo"):
        _set_prefs(db, p.sub, {"avatar": {"character": "default", "personalized_enabled": False}})
    elif "avatar" in kinds:
        _set_prefs(db, p.sub, {"avatar": {"personalized_enabled": False}})
    audit(db, p.sub, "profile_media_delete", None, kinds=list(kinds))
    return {"deleted": list(kinds)}


class Consent(BaseModel):
    consent: bool


@router.post("/avatar/consent")
def avatar_consent(body: Consent, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    patch = {"avatar": {"generation_consent": body.consent,
                        "consent_at": datetime.now(timezone.utc).isoformat() if body.consent else None}}
    if not body.consent:
        patch["avatar"]["personalized_enabled"] = False
        if get_prefs(db, p.sub)["avatar"].get("character") == "generated":
            patch["avatar"]["character"] = "default"
    _set_prefs(db, p.sub, patch)
    audit(db, p.sub, "avatar_consent", None, consent=body.consent)
    return {"avatar_prefs": get_prefs(db, p.sub)["avatar"]}


@router.post("/avatar/generate")
def generate_avatar(p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    prefs = get_prefs(db, p.sub)
    if not prefs["avatar"].get("generation_consent"):
        raise HTTPException(403, "Consent is required before your photo is sent to the image-generation service")
    photo = _media(db, p.sub, "photo")
    if not photo:
        raise HTTPException(422, "Upload a profile photo first")
    s = get_settings()
    audit(db, p.sub, "avatar_generate_start", None, model=s.gemini_image_model)
    try:
        raw, mime, model = gemini.generate_avatar(photo.data, photo.mime)
        clean_image(raw, max_bytes=20 * 1024 * 1024, max_side=768)   # validate the model output first
        # Key out the green screen on the ORIGINAL pixels (before any lossy re-encode) so edges stay clean;
        # the result is a transparent cut-out that sits in the orchard as its own layer.
        keyed = key_out_green(raw)
        img = (clean_image(keyed, max_bytes=20 * 1024 * 1024, max_side=768, keep_alpha=True) if keyed
               else clean_image(raw, max_bytes=20 * 1024 * 1024, max_side=768))
    except gemini.GeminiUnavailable as exc:
        audit(db, p.sub, "avatar_generate_failed", None, reason=str(exc)[:200])
        raise HTTPException(503, f"Avatar generation is unavailable right now: {str(exc)[:160]}. "
                                 "Your dashboard keeps the default orchard character.") from exc
    except ImageRejected as exc:
        raise HTTPException(502, "The image service returned an unusable image; please try again.") from exc
    _store(db, p.sub, "avatar", img, f"gemini:{model}")
    _set_prefs(db, p.sub, {"avatar": {"personalized_enabled": True, "character": "generated"}})
    audit(db, p.sub, "avatar_generate_ok", None, model=model, transparent=img.mime == "image/png")
    return {"ok": True, "version": img.sha256[:12], "width": img.width, "height": img.height,
            "transparent": img.mime == "image/png"}
