"""Solana public-key validation (base58, 32 bytes). Private keys / seed phrases are rejected outright."""
from __future__ import annotations

import base58

_B58 = set("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")


def is_valid_public_key(value: str) -> bool:
    if not isinstance(value, str) or not (32 <= len(value) <= 44) or not set(value) <= _B58:
        return False
    try:
        return len(base58.b58decode(value)) == 32
    except ValueError:
        return False


def looks_like_secret(value: str) -> bool:
    """Heuristic guard: 64-byte base58 secret keys, JSON byte arrays or 12/24-word phrases."""
    v = (value or "").strip()
    if v.startswith("[") and v.count(",") >= 31:
        return True
    words = v.split()
    if len(words) in (12, 15, 18, 21, 24) and all(w.isalpha() and w.islower() for w in words):
        return True
    if set(v) <= _B58 and 80 <= len(v) <= 90:
        try:
            return len(base58.b58decode(v)) == 64
        except ValueError:
            return False
    return False
