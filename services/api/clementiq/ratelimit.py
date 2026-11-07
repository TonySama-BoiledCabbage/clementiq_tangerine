"""Simple in-process sliding-window rate limiter (per client IP + path group).

Adequate for a single API container; put a shared limiter (e.g. at the reverse proxy) in front
when scaling horizontally — see infrastructure/nginx/clementiq.conf.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from .config import get_settings


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        s = get_settings()
        path = request.url.path
        if not path.startswith("/api/") or path == "/api/health":
            return await call_next(request)
        group = "ai" if path.startswith("/api/ai/") else "api"
        limit = s.ai_rate_limit_per_minute if group == "ai" else s.rate_limit_per_minute
        ip = request.client.host if request.client else "unknown"
        key = (ip, group)
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= limit:
            return JSONResponse({"detail": "rate limit exceeded"}, status_code=429,
                                headers={"Retry-After": "60"})
        q.append(now)
        return await call_next(request)
