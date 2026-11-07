from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..auth import Principal, authorize_account, current_principal
from ..core.portfolio import crypto_scenario
from ..db import get_db
from ..repository import audit, get_baseline
from ..solana import proof
from ..solana.address import is_valid_public_key, looks_like_secret
from ..solana.rpc import SolanaRpcError, transaction_memos, wallet_summary
from ..worldpulse.adapters.markets import CoinGeckoAdapter

router = APIRouter(prefix="/api/solana", tags=["solana"])
Network = Literal["mainnet", "devnet"]


def _check_key(pk: str) -> None:
    if looks_like_secret(pk):
        raise HTTPException(400, "That looks like a private key or seed phrase. Never share it — ClementIQ only needs a public address.")
    if not is_valid_public_key(pk):
        raise HTTPException(422, "invalid Solana public address (expected base58-encoded 32 bytes)")


class Consent(BaseModel):
    public_key: str = Field(max_length=100)
    network: Network = "mainnet"
    consent: bool


@router.post("/connect")
def connect(body: Consent, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    _check_key(body.public_key)
    if not body.consent:
        raise HTTPException(422, "explicit consent is required to analyse a wallet")
    existing = db.execute(select(models.SolanaWallet).where(models.SolanaWallet.owner == p.sub,
                                                            models.SolanaWallet.public_key == body.public_key,
                                                            models.SolanaWallet.network == body.network)).scalars().first()
    if not existing:
        db.add(models.SolanaWallet(owner=p.sub, public_key=body.public_key, network=body.network))
        db.commit()
    audit(db, p.sub, "wallet_connect", body.public_key[:6] + "…", network=body.network)
    return {"connected": True}


@router.delete("/connect/{public_key}")
def disconnect(public_key: str, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    for w in db.execute(select(models.SolanaWallet).where(models.SolanaWallet.owner == p.sub,
                                                          models.SolanaWallet.public_key == public_key)).scalars():
        db.delete(w)
    db.commit()
    return {"disconnected": True}


@router.get("/wallet/{public_key}")
def wallet(public_key: str, network: Network = "mainnet", history: int = Query(20, ge=1, le=100),
           p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    _check_key(public_key)
    consented = db.execute(select(models.SolanaWallet).where(models.SolanaWallet.owner == p.sub,
                                                             models.SolanaWallet.public_key == public_key)).scalars().first()
    if not consented:
        raise HTTPException(403, "connect this wallet (with consent) before analysing it")
    try:
        w = wallet_summary(public_key, network, history)
    except SolanaRpcError as exc:
        raise HTTPException(502, str(exc)) from exc
    price = None
    try:
        q = CoinGeckoAdapter().fetch(["SOL"])
        price = q[0] if q else None
    except Exception:  # noqa: BLE001 - price is optional; show balance without valuation
        price = None
    w["valuation"] = ({"sol_price_cad": price.price, "value_cad": w["sol"] * price.price, "price_source": "CoinGecko",
                       "price_as_of": price.observed_at.isoformat(), "change_24h_pct": price.change_24h_pct}
                      if price and network == "mainnet" else
                      {"note": "Devnet SOL has no market value." if network == "devnet" else "SOL price unavailable; balance shown without valuation."})
    known = [t for t in w["tokens"] if t["symbol"]]
    w["concentration"] = {"distinct_assets": 1 + len(w["tokens"]), "unpriced_tokens": len(w["tokens"]) - len([t for t in known if t["symbol"] in ("USDC", "USDT")]),
                          "note": "Only SOL and stablecoins are valued; other tokens are listed without prices."}
    return w


class CryptoShock(BaseModel):
    value: float = Field(ge=0, le=1e10)
    pct_change: float = Field(ge=-100, le=1000)
    account_id: int | None = None
    top_weight: float | None = Field(None, ge=0, le=1)


@router.post("/scenario")
def crypto_shock(body: CryptoShock, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    buffer = None
    if body.account_id is not None:
        authorize_account(p, body.account_id)
        buffer = get_baseline(db, body.account_id).B
    return crypto_scenario(body.value, body.pct_change, buffer, body.top_weight)


class GoalCreate(BaseModel):
    account_id: int
    name: str = Field(min_length=1, max_length=120)
    target_amount: float = Field(gt=0, le=10_000_000)
    target_date: date | None = None


@router.post("/goals")
def create_goal(body: GoalCreate, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    authorize_account(p, body.account_id)
    salt = proof.new_salt()
    meta = {"name": body.name, "target_amount": round(body.target_amount, 2),
            "target_date": body.target_date.isoformat() if body.target_date else None, "owner": p.sub}
    h = proof.commitment(meta, salt)
    g = models.SavingsGoal(owner=p.sub, account_id=body.account_id, name=body.name, target_amount=body.target_amount,
                           target_date=body.target_date, salt=salt, proof_hash=h)
    db.add(g)
    db.commit()
    return _goal(g)


def _goal(g: models.SavingsGoal) -> dict:
    return {"id": g.id, "name": g.name, "target_amount": g.target_amount,
            "target_date": g.target_date.isoformat() if g.target_date else None, "proof_hash": g.proof_hash,
            "memo": proof.memo_for(g.proof_hash), "devnet_signature": g.devnet_signature, "devnet_verified": g.devnet_verified,
            "explorer_url": f"https://explorer.solana.com/tx/{g.devnet_signature}?cluster=devnet" if g.devnet_signature else None,
            "created_at": g.created_at.isoformat() if g.created_at else None}


@router.get("/goals")
def list_goals(p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    rows = db.execute(select(models.SavingsGoal).where(models.SavingsGoal.owner == p.sub).order_by(models.SavingsGoal.id.desc())).scalars()
    return {"items": [_goal(g) for g in rows]}


class GoalProof(BaseModel):
    goal_id: int
    signature: str | None = Field(None, min_length=40, max_length=120)


@router.post("/devnet/goal-proof")
def goal_proof(body: GoalProof, p: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    """Without signature: returns the memo the user's wallet should sign on Devnet.
    With signature: fetches the Devnet transaction and verifies the memo contains the commitment."""
    g = db.get(models.SavingsGoal, body.goal_id)
    if not g or g.owner != p.sub:
        raise HTTPException(404, "goal not found")
    if not body.signature:
        return {"goal_id": g.id, "memo": proof.memo_for(g.proof_hash), "network": "devnet",
                "privacy": "Only this salted hash goes on-chain. Goal details and salt stay private in ClementIQ.",
                "meaning": "Records when you committed to this goal. It does not prove you hold any savings."}
    try:
        tx = transaction_memos(body.signature, "devnet")
    except SolanaRpcError as exc:
        raise HTTPException(502, str(exc)) from exc
    if not tx["found"]:
        raise HTTPException(404, "transaction not found on devnet yet — try again in a few seconds")
    ok = proof.verify_memo(tx["memos"], g.proof_hash) and tx.get("error") is None
    g.devnet_signature = body.signature
    g.devnet_verified = ok
    db.commit()
    audit(db, p.sub, "goal_proof", f"goal:{g.id}", verified=ok)
    return {**_goal(g), "verification": {"memo_found": ok, "signers": tx.get("signers"), "slot": tx.get("slot")}}
