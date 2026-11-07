"""Authentication & authorization.

Roles
  judge     – read-only access to every account in the synthetic challenge dataset (Judge Demo).
  customer  – access scoped to exactly one account_id.
  admin     – judge rights + data import and operations.

Tokens are short-lived HS256 JWTs issued by POST /api/auth/demo-login against access codes held
in environment variables. No financial endpoint is reachable without a token.
"""
from __future__ import annotations

import hmac
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from .config import get_settings

Role = Literal["judge", "customer", "admin"]
_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Principal:
    sub: str
    role: Role
    account_id: int | None = None

    @property
    def read_only(self) -> bool:
        return self.role == "judge"

    def can_access(self, account_id: int) -> bool:
        if self.role in ("judge", "admin"):
            return True
        return self.account_id == account_id


class LoginRequest(BaseModel):
    role: Role = "judge"
    access_code: str = Field(min_length=1, max_length=200)
    account_id: int | None = None
    display_name: str | None = Field(None, max_length=60)


def _code_ok(given: str, expected: str) -> bool:
    return hmac.compare_digest(given.encode(), expected.encode())


def issue_token(req: LoginRequest) -> dict:
    s = get_settings()
    expected = {"judge": s.judge_access_code, "admin": s.admin_access_code,
                "customer": s.demo_customer_access_code}[req.role]
    if not _code_ok(req.access_code, expected):
        raise HTTPException(401, "invalid access code")
    if req.role == "customer" and req.account_id is None:
        raise HTTPException(422, "customer login requires account_id")
    sub = f"{req.role}:{req.account_id}" if req.role == "customer" else f"{req.role}:{(req.display_name or 'demo').lower()}"
    exp = datetime.now(timezone.utc) + timedelta(minutes=s.jwt_ttl_minutes)
    payload = {"sub": sub, "role": req.role, "acc": req.account_id, "exp": exp, "iss": "clementiq"}
    token = jwt.encode(payload, s.jwt_secret, algorithm="HS256")
    return {"access_token": token, "token_type": "bearer", "role": req.role, "sub": sub,
            "account_id": req.account_id, "expires_at": exp.isoformat()}


def decode(token: str) -> Principal:
    s = get_settings()
    try:
        p = jwt.decode(token, s.jwt_secret, algorithms=["HS256"], issuer="clementiq")
    except jwt.PyJWTError as exc:
        raise HTTPException(401, "invalid or expired token") from exc
    return Principal(sub=p["sub"], role=p["role"], account_id=p.get("acc"))


def current_principal(request: Request,
                      creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> Principal:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(401, "authentication required", headers={"WWW-Authenticate": "Bearer"})
    principal = decode(creds.credentials)
    request.state.principal = principal
    return principal


def require_admin(p: Principal = Depends(current_principal)) -> Principal:
    if p.role != "admin":
        raise HTTPException(403, "admin role required")
    return p


def authorize_account(p: Principal, account_id: int) -> None:
    if not p.can_access(account_id):
        raise HTTPException(403, "not authorized for this account")
