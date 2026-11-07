"""Emergency-savings goal commitments on Solana Devnet.

Only a salted SHA-256 commitment of the goal metadata is written on-chain (via the SPL Memo program,
signed by the user's own wallet in the browser). The goal details and the salt stay private in the
database, so nothing on the public ledger reveals amounts or identity. The record proves *when a goal
was committed to*, not that the customer owns any savings.
"""
from __future__ import annotations

import hashlib
import json
import secrets
from typing import Any

MEMO_PREFIX = "ClementIQ:goal:v1:"


def commitment(goal: dict[str, Any], salt: str) -> str:
    canonical = json.dumps({k: goal[k] for k in sorted(goal)}, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(f"{salt}|{canonical}".encode()).hexdigest()


def new_salt() -> str:
    return secrets.token_hex(16)


def memo_for(hash_hex: str) -> str:
    return MEMO_PREFIX + hash_hex


def verify_memo(memos: list[str], hash_hex: str) -> bool:
    target = memo_for(hash_hex)
    return any(target in m for m in memos)
