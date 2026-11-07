"""Measured query benchmark: raw transactions vs Tiger Data continuous aggregates.

Runs each query `repeats` times and reports min/median wall-clock milliseconds plus row counts, so
any claimed improvement is backed by numbers measured on the actual deployment. Nothing is
hard-coded; results are written to docs/benchmarks/tiger_data_benchmark.json by the CLI.
"""
from __future__ import annotations

import statistics
import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text

from .config import get_settings
from .db import get_engine

QUERIES = {
    "book_monthly_cashflow": {
        "raw": """SELECT account_id, date_trunc('month', date) AS m,
                         sum(CASE WHEN signed_amount>0 THEN signed_amount ELSE 0 END) AS money_in,
                         sum(CASE WHEN signed_amount<0 THEN -signed_amount ELSE 0 END) AS money_out
                  FROM transactions GROUP BY account_id, m""",
        "cagg": "SELECT account_id, month, money_in, money_out FROM txn_monthly",
        "description": "Monthly money in/out for every account (all 1.06M transactions)",
    },
    "one_account_daily_2y": {
        "raw": """SELECT date AS day, sum(CASE WHEN signed_amount>0 THEN signed_amount ELSE 0 END),
                         sum(CASE WHEN signed_amount<0 THEN -signed_amount ELSE 0 END)
                  FROM transactions WHERE account_id = :acc AND date >= '2024-01-01' GROUP BY day""",
        "cagg": "SELECT day, money_in, money_out FROM txn_daily WHERE account_id = :acc AND day >= '2024-01-01'",
        "description": "Daily cash flow for one account over two years",
    },
    "book_total_2025": {
        "raw": "SELECT sum(amount) FROM transactions WHERE date >= '2025-01-01' AND date < '2026-01-01'",
        "cagg": "SELECT sum(money_in + money_out) FROM txn_daily WHERE day >= '2025-01-01' AND day < '2026-01-01'",
        "description": "Total 2025 flow across the book",
    },
}


def _time(conn, sql: str, params: dict, repeats: int) -> dict[str, Any]:
    times, rows = [], 0
    for _ in range(repeats):
        t0 = time.perf_counter()
        rows = len(conn.execute(text(sql), params).fetchall())
        times.append((time.perf_counter() - t0) * 1000)
    return {"min_ms": round(min(times), 2), "median_ms": round(statistics.median(times), 2), "rows": rows, "runs": repeats}


def run_benchmark(repeats: int = 5) -> dict[str, Any]:
    s = get_settings()
    if s.is_sqlite:
        raise SystemExit("benchmark requires Tiger Data / PostgreSQL (set DATABASE_URL)")
    eng = get_engine()
    out: dict[str, Any] = {"measured_at": datetime.now(timezone.utc).isoformat(), "repeats": repeats, "queries": {}}
    with eng.connect() as conn:
        out["timescaledb_version"] = conn.execute(text("SELECT extversion FROM pg_extension WHERE extname='timescaledb'")).scalar()
        out["transactions_rows"] = conn.execute(text("SELECT count(*) FROM transactions")).scalar()
        try:
            out["transactions_chunks"] = conn.execute(text("SELECT count(*) FROM timescaledb_information.chunks WHERE hypertable_name='transactions'")).scalar()
        except Exception:  # noqa: BLE001
            out["transactions_chunks"] = None
        acc = conn.execute(text("SELECT account_id FROM transactions GROUP BY account_id ORDER BY count(*) DESC LIMIT 1")).scalar()
        for name, q in QUERIES.items():
            params = {"acc": acc}
            raw = _time(conn, q["raw"], params, repeats)
            cagg = _time(conn, q["cagg"], params, repeats)
            out["queries"][name] = {"description": q["description"], "raw": raw, "continuous_aggregate": cagg,
                                    "speedup_median": round(raw["median_ms"] / cagg["median_ms"], 2) if cagg["median_ms"] else None}
    return out
