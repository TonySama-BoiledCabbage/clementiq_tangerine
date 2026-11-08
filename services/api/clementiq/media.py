"""Safe handling of user images (profile photos and generated avatars).

Every image is decoded with Pillow, checked (format, dimensions, pixel bomb), orientation-fixed,
downscaled and RE-ENCODED. Re-encoding drops EXIF/GPS metadata and any non-image payload, so we
never store or serve the uploaded bytes as-is.
"""
from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

ALLOWED_FORMATS = {"PNG", "JPEG", "WEBP"}
MAX_PIXELS = 40_000_000           # decompression-bomb guard (~6300 × 6300)
MIN_SIDE = 64
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class ImageRejected(ValueError):
    pass


@dataclass(frozen=True)
class CleanImage:
    data: bytes
    mime: str
    width: int
    height: int
    sha256: str


def sniff_ok(raw: bytes) -> bool:
    """Cheap magic-byte check before handing bytes to the decoder."""
    return raw.startswith(b"\x89PNG\r\n\x1a\n") or raw.startswith(b"\xff\xd8\xff") or (raw[:4] == b"RIFF" and raw[8:12] == b"WEBP")


def key_out_green(raw: bytes) -> bytes | None:
    """Turn a flat green-screen background into transparency (generated avatars are drawn on #00FF00).
    Returns PNG bytes, or None if the image does not have a usable green background."""
    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    px = img.load()
    w, h = img.size
    border = [px[x, y] for x in range(0, w, max(w // 40, 1)) for y in (0, h - 1)] +              [px[x, y] for y in range(0, h, max(h // 40, 1)) for x in (0, w - 1)]
    greenish = [p for p in border if p[1] > 150 and p[1] > p[0] * 1.4 and p[1] > p[2] * 1.4]
    if len(greenish) < len(border) * 0.6:
        return None
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            dominance = g - max(r, b)
            if dominance > 70:
                px[x, y] = (r, g, b, 0)
            elif dominance > 25:  # soft edge + spill suppression
                alpha = int(255 * (70 - dominance) / 45)
                px[x, y] = (r, min(g, max(r, b) + 10), b, alpha)
    out = io.BytesIO()
    img.save(out, "PNG", optimize=True)
    return out.getvalue()


def clean_image(raw: bytes, max_bytes: int, max_side: int = 768, keep_alpha: bool = False) -> CleanImage:
    if not raw:
        raise ImageRejected("empty upload")
    if len(raw) > max_bytes:
        raise ImageRejected(f"image is larger than {max_bytes // (1024 * 1024)} MB")
    if not sniff_ok(raw):
        raise ImageRejected("only PNG, JPEG or WebP images are accepted")
    try:
        with Image.open(io.BytesIO(raw)) as probe:
            fmt = probe.format
            probe.verify()
        img = Image.open(io.BytesIO(raw))
        img.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, SyntaxError) as exc:
        raise ImageRejected("the file is not a valid image") from exc
    if fmt not in ALLOWED_FORMATS:
        raise ImageRejected("only PNG, JPEG or WebP images are accepted")
    if min(img.size) < MIN_SIDE:
        raise ImageRejected(f"image must be at least {MIN_SIDE}×{MIN_SIDE} pixels")
    img = ImageOps.exif_transpose(img)
    img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    if keep_alpha and img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        img.save(out, "PNG", optimize=True)
        mime = "image/png"
    else:
        img = img.convert("RGB")
        img.save(out, "JPEG", quality=88, optimize=True)  # no exif= argument → metadata dropped
        mime = "image/jpeg"
    data = out.getvalue()
    return CleanImage(data, mime, img.width, img.height, hashlib.sha256(data).hexdigest())
