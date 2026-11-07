"""Read-only Solana JSON-RPC client (getBalance, getTokenAccountsByOwner, getSignaturesForAddress,
getTransaction). No signing ever happens server-side; ClementIQ never holds keys."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

from ..config import get_settings

LAMPORTS_PER_SOL = 1_000_000_000
TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
KNOWN_MINTS = {
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": "BONK",
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": "JUP",
}


class SolanaRpcError(RuntimeError):
    pass


def rpc_url(network: str) -> str:
    s = get_settings()
    if network == "mainnet":
        return s.solana_mainnet_rpc
    if network == "devnet":
        return s.solana_devnet_rpc
    raise ValueError("network must be mainnet or devnet")


def call(network: str, method: str, params: list[Any]) -> Any:
    try:
        r = httpx.post(rpc_url(network), json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
                       timeout=get_settings().http_timeout_s)
    except httpx.HTTPError as exc:
        raise SolanaRpcError(f"RPC network error: {exc.__class__.__name__}") from exc
    if r.status_code != 200:
        raise SolanaRpcError(f"RPC HTTP {r.status_code}")
    data = r.json()
    if "error" in data:
        raise SolanaRpcError(f"RPC error: {data['error'].get('message')}")
    return data["result"]


def wallet_summary(public_key: str, network: str = "mainnet", history: int = 20) -> dict[str, Any]:
    bal = call(network, "getBalance", [public_key, {"commitment": "confirmed"}])
    lamports = bal["value"] if isinstance(bal, dict) else bal
    tokens = []
    for program in (TOKEN_PROGRAM, TOKEN_2022_PROGRAM):
        try:
            res = call(network, "getTokenAccountsByOwner", [public_key, {"programId": program}, {"encoding": "jsonParsed"}])
        except SolanaRpcError:
            continue
        for acc in res.get("value", []):
            info = acc["account"]["data"]["parsed"]["info"]
            amt = info["tokenAmount"]
            ui = float(amt.get("uiAmount") or 0)
            if ui <= 0:
                continue
            tokens.append({"mint": info["mint"], "symbol": KNOWN_MINTS.get(info["mint"]), "amount": ui,
                           "decimals": amt.get("decimals"), "program": "token-2022" if program == TOKEN_2022_PROGRAM else "spl-token"})
    sigs = call(network, "getSignaturesForAddress", [public_key, {"limit": history}])
    txs = [{"signature": s["signature"], "slot": s["slot"], "error": s.get("err") is not None,
            "block_time": datetime.fromtimestamp(s["blockTime"], tz=timezone.utc).isoformat() if s.get("blockTime") else None,
            "memo": s.get("memo")} for s in sigs]
    return {"public_key": public_key, "network": network, "sol": lamports / LAMPORTS_PER_SOL, "lamports": lamports,
            "tokens": tokens, "transactions": txs, "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "source": f"Solana JSON-RPC ({network})"}


def transaction_memos(signature: str, network: str = "devnet") -> dict[str, Any]:
    tx = call(network, "getTransaction", [signature, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0,
                                                      "commitment": "confirmed"}])
    if tx is None:
        return {"found": False, "memos": []}
    memos = []
    for ix in tx["transaction"]["message"]["instructions"]:
        if ix.get("programId") == MEMO_PROGRAM or ix.get("program") == "spl-memo":
            parsed = ix.get("parsed")
            memos.append(parsed if isinstance(parsed, str) else str(parsed))
    for line in (tx.get("meta") or {}).get("logMessages") or []:
        if "Memo (len" in line:
            memos.append(line.split(": ", 1)[-1].strip('"'))
    signers = [k["pubkey"] for k in tx["transaction"]["message"]["accountKeys"] if k.get("signer")]
    return {"found": True, "memos": memos, "signers": signers, "slot": tx.get("slot"),
            "block_time": tx.get("blockTime"), "error": (tx.get("meta") or {}).get("err")}
