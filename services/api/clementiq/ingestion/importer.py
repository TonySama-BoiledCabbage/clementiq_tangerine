"""Tangerine CSV ingestion pipeline.

read → validate schema → clean (currency formatting, dates, nulls, duplicates, orphans)
→ load raw tables (COPY on PostgreSQL / Tiger Data, batched INSERT on SQLite)
→ consistency checks → derived tables (account_baselines).

Original values are preserved: cleaning only coerces types and removes rows that cannot be
loaded (null/duplicate keys, orphaned foreign keys). Every action is counted in the import report.
"""
from __future__ import annotations

import hashlib
import logging
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import delete, insert, select, text
from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings
from ..core.insights import runway_vec
from ..core.metrics import Baseline, baselines_vectorized
from ..core.resilience import resilience_score
from ..db import Base, get_engine, session_factory
from .schemas import SCHEMAS, DatasetSchema

log = logging.getLogger("clementiq.import")
_MONEY_RE = re.compile(r"[\s$,]|CAD", re.IGNORECASE)

APP_TABLES_REFERENCING_ACCOUNTS = (
    "alerts", "scenario_results", "shock_scenarios", "recovery_plans", "savings_goals",
    "financial_snapshots", "account_baselines",
)
RAW_DELETE_ORDER = ("transactions", "monthly_summaries", "standing_orders", "loans", "cards",
                    "dispositions", "clients", "accounts", "districts")


def resolve_file(data_dir: Path, filename: str) -> Path | None:
    for cand in (data_dir / filename, data_dir / (filename + ".gz"), data_dir / "raw" / filename,
                 data_dir / "raw" / (filename + ".gz")):
        if cand.exists():
            return cand
    return None


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_money(s: pd.Series) -> tuple[pd.Series, int]:
    raw = s.astype("string")
    neg_paren = raw.str.match(r"^\s*\(.*\)\s*$", na=False)
    cleaned = raw.str.replace(_MONEY_RE, "", regex=True).str.strip("()")
    reformatted = int((cleaned.fillna("") != raw.fillna("")).sum())
    val = pd.to_numeric(cleaned, errors="coerce")
    val = val.where(~neg_paren, -val)
    return val.astype(float), reformatted


def clean_dataset(schema: DatasetSchema, df: pd.DataFrame, known: dict[str, set]) -> tuple[pd.DataFrame, dict[str, Any]]:
    rep: dict[str, Any] = {"rows_read": int(len(df)), "invalid_dates": {}, "nulls": {}, "orphans_dropped": {},
                           "outliers": {}, "money_reformatted": 0, "warnings": []}
    df.columns = [c.strip() for c in df.columns]
    missing = [c for c in schema.columns if c not in df.columns]
    rep["columns_missing"] = missing
    rep["extra_columns"] = [c for c in df.columns if c not in schema.columns]
    if missing:
        raise ValueError(f"{schema.name}: missing required columns {missing}")
    df = df[list(schema.columns)].copy()

    for c in schema.strings:
        df[c] = df[c].astype("string").str.strip()
        df.loc[df[c] == "", c] = pd.NA
    for c in schema.ints + schema.primary_key:
        if c in schema.strings:
            continue
        num = pd.to_numeric(df[c], errors="coerce")
        df[c] = num.round().astype("Int64")
    for c in schema.floats:
        df[c] = pd.to_numeric(df[c], errors="coerce").astype(float)
    for c in schema.money:
        df[c], n = parse_money(df[c])
        rep["money_reformatted"] += n
    for c in schema.dates:
        parsed = pd.to_datetime(df[c], errors="coerce", format="%Y-%m-%d")
        bad = int(parsed.isna().sum() - df[c].isna().sum())
        if bad:
            rep["invalid_dates"][c] = bad
        df[c] = parsed.dt.date
    if schema.name == "monthly_summary":
        ms = pd.to_datetime(df["month"] + "-01", errors="coerce", format="%Y-%m-%d")
        bad = int(ms.isna().sum())
        if bad:
            rep["invalid_dates"]["month"] = bad
        df["month_start"] = ms.dt.date
        df = df[ms.notna()]
        money_cols = [c for c in schema.money]
        df[money_cols] = df[money_cols].fillna(0.0)
        df["days_below_zero"] = df["days_below_zero"].fillna(0)

    for c in df.columns:
        n = int(df[c].isna().sum())
        if n:
            rep["nulls"][c] = n

    before = len(df)
    df = df.dropna(subset=list(schema.primary_key) + list(schema.required))
    rep["null_key_dropped"] = before - len(df)
    before = len(df)
    df = df.drop_duplicates(subset=list(schema.primary_key), keep="first")
    rep["duplicates_dropped"] = before - len(df)

    for col, ref in schema.foreign_keys.items():
        ref_ds, _ = ref.split(".")
        if ref_ds not in known:
            continue
        mask = df[col].notna() & ~df[col].isin(known[ref_ds])
        n = int(mask.sum())
        if n:
            rep["orphans_dropped"][col] = n
            df = df[~mask]

    for c in schema.money:
        x = df[c].dropna()
        if len(x) > 20:
            med = x.median()
            mad = (x - med).abs().median() * 1.4826
            if mad > 0:
                rep["outliers"][c] = int(((x - med).abs() / mad > 10).sum())
    rep["rows_loaded"] = int(len(df))
    return df, rep


def _records(df: pd.DataFrame) -> list[dict[str, Any]]:
    obj = df.astype(object).where(pd.notna(df), None)
    return obj.to_dict("records")


def bulk_load(session: Session, table_name: str, df: pd.DataFrame, chunk: int = 50_000) -> None:
    table = Base.metadata.tables[table_name]
    s = get_settings()
    if not s.is_sqlite and session.bind.dialect.name == "postgresql":
        cols = list(df.columns)
        raw = session.connection().connection.driver_connection
        obj = df.astype(object).where(pd.notna(df), None)
        with raw.cursor() as cur:
            with cur.copy(f"COPY {table_name} ({', '.join(cols)}) FROM STDIN") as cp:
                for row in obj.itertuples(index=False, name=None):
                    cp.write_row(row)
        return
    for i in range(0, len(df), chunk):
        session.execute(insert(table), _records(df.iloc[i:i + chunk]))


def consistency_checks(name: str, df: pd.DataFrame) -> list[str]:
    w: list[str] = []
    if name == "monthly_summary":
        ins = df[["cash_deposits", "transfers_in", "pension_in", "interest_in"]].sum(axis=1)
        outs = df[["household_bills", "insurance", "loan_payments", "bank_fees", "cash_withdrawals_genuine",
                   "card_withdrawals", "transfers_out_other"]].sum(axis=1)
        bad_in = int(((ins - df.money_in).abs() > 0.05).sum())
        bad_out = int(((outs - df.money_out).abs() > 0.05).sum())
        w.append(f"money_in components mismatch rows: {bad_in}; money_out components mismatch rows: {bad_out}")
    if name == "loans":
        amt = (df.duration_months * df.monthly_payment - df.amount).abs()
        w.append(f"loans where amount != duration × payment (>$1): {int((amt > 1).sum())}")
        start = pd.to_datetime(df.loan_start)
        end = start + pd.to_timedelta(df.duration_months.astype(float) * 30.4375, unit="D")
        ref = pd.Timestamp(get_settings().reference_date)
        running = df.status.isin(["C", "D"])
        mismatch = int((running != (end > ref)).sum())
        w.append(f"loans whose status disagrees with start+duration vs {ref.date()}: {mismatch}")
    return w


def relationship_summary(session: Session) -> dict[str, Any]:
    q = lambda sql: session.execute(text(sql)).scalar()  # noqa: E731
    return {
        "accounts_with_multiple_clients": q("SELECT COUNT(*) FROM (SELECT account_id FROM dispositions GROUP BY account_id HAVING COUNT(*) > 1) t"),
        "clients_with_multiple_accounts": q("SELECT COUNT(*) FROM (SELECT client_id FROM dispositions GROUP BY client_id HAVING COUNT(*) > 1) t"),
        "accounts_without_owner": q("SELECT COUNT(*) FROM accounts a WHERE NOT EXISTS (SELECT 1 FROM dispositions d WHERE d.account_id=a.account_id AND d.type='owner')"),
        "accounts_without_monthly_summary": q("SELECT COUNT(*) FROM accounts a WHERE NOT EXISTS (SELECT 1 FROM monthly_summaries m WHERE m.account_id=a.account_id)"),
        "accounts_with_loan": q("SELECT COUNT(DISTINCT account_id) FROM loans"),
    }


def compute_derived(session: Session) -> int:
    eng = session.bind
    ms = pd.read_sql("SELECT * FROM monthly_summaries", eng)
    loans = pd.read_sql("SELECT account_id, status, monthly_payment FROM loans", eng)
    if ms.empty:
        return 0
    f = baselines_vectorized(ms, loans)
    f["runway_ei55"] = runway_vec(f.B, 0.55 * f.I, f.S)
    now = datetime.now(timezone.utc)
    rows = []
    for acc, r in f.iterrows():
        b = Baseline(account_id=int(acc), I=r.I, S=r.S, F=r.F, H=r.H, B=r.B, P=r.P, D=r.D,
                     months_of_data=int(r.months), first_month=r.first_month, last_month=r.last_month,
                     buffer_months=[], income_cv=None if pd.isna(r.income_cv) else float(r.income_cv),
                     spending_cv=None if pd.isna(r.spending_cv) else float(r.spending_cv),
                     days_below_zero_12m=int(r.dbz12), category_medians={})
        sc = resilience_score(b)["score"]
        rows.append({
            "account_id": int(acc), "income_I": float(r.I), "spending_S": float(r.S), "fixed_costs_F": float(r.F),
            "household_bills_H": float(r.H), "buffer_B": float(r.B), "loan_payment_P": float(r.P),
            "months_of_data": int(r.months), "first_month": r.first_month, "last_month": r.last_month,
            "income_cv": b.income_cv, "spending_cv": b.spending_cv, "discretionary_D": float(r.D),
            "days_below_zero_12m": int(r.dbz12), "resilience_score": float(sc),
            "runway_ei55": None if r.runway_ei55 >= 120 else float(r.runway_ei55), "computed_at": now,
        })
    session.execute(delete(models.AccountBaseline))
    session.execute(insert(models.AccountBaseline), rows)
    return len(rows)


def run_import(data_dir: Path | None = None, only: list[str] | None = None, force: bool = False,
               skip: list[str] | None = None) -> dict[str, Any]:
    s = get_settings()
    data_dir = Path(data_dir or s.data_dir)
    eng = get_engine()
    Base.metadata.create_all(eng)
    SessionLocal = session_factory()
    summary: dict[str, Any] = {"data_dir": str(data_dir), "datasets": {}}
    known: dict[str, set] = {}

    with SessionLocal() as session:
        if force:
            for t in APP_TABLES_REFERENCING_ACCOUNTS + RAW_DELETE_ORDER:
                session.execute(delete(Base.metadata.tables[t]))
            session.commit()

        for schema in SCHEMAS:
            if (only and schema.name not in only) or (skip and schema.name in skip):
                # keep FK knowledge from the database for partial imports
                tbl = Base.metadata.tables[schema.table]
                pkcol = schema.primary_key[0]
                known[schema.name] = set(session.execute(select(tbl.c[pkcol])).scalars())
                continue
            path = resolve_file(data_dir, schema.file)
            run = models.ImportRun(dataset=schema.name, status="running")
            session.add(run)
            session.commit()
            t0 = time.perf_counter()
            try:
                if path is None:
                    raise FileNotFoundError(f"{schema.file} not found in {data_dir}")
                digest = sha256_file(path)
                tbl = Base.metadata.tables[schema.table]
                existing = session.execute(text(f"SELECT COUNT(*) FROM {schema.table}")).scalar()
                prev = session.execute(
                    select(models.ImportRun).where(models.ImportRun.dataset == schema.name,
                                                   models.ImportRun.status == "success")
                    .order_by(models.ImportRun.id.desc())).scalars().first()
                if existing and prev and prev.report.get("file_sha256") == digest and not force:
                    pkcol = schema.primary_key[0]
                    known[schema.name] = set(session.execute(select(tbl.c[pkcol])).scalars())
                    run.status = "success"
                    run.rows_read = prev.rows_read
                    run.rows_loaded = existing
                    run.report = {**prev.report, "skipped": "unchanged file already loaded"}
                    run.finished_at = datetime.now(timezone.utc)
                    session.commit()
                    summary["datasets"][schema.name] = {"status": "skipped (unchanged)", "rows": existing}
                    continue
                df = pd.read_csv(path, dtype=str, keep_default_na=True)
                df, rep = clean_dataset(schema, df, known)
                rep["file"] = path.name
                rep["file_sha256"] = digest
                rep["consistency"] = consistency_checks(schema.name, df)
                if existing:
                    for t in APP_TABLES_REFERENCING_ACCOUNTS if schema.name == "accounts" else ():
                        session.execute(delete(Base.metadata.tables[t]))
                    session.execute(delete(tbl))
                bulk_load(session, schema.table, df)
                session.commit()
                known[schema.name] = set(df[schema.primary_key[0]].dropna().astype(int).tolist()) \
                    if schema.name != "monthly_summary" else set()
                rep["seconds"] = round(time.perf_counter() - t0, 2)
                run.status = "success"
                run.rows_read = rep["rows_read"]
                run.rows_loaded = rep["rows_loaded"]
                run.report = rep
                summary["datasets"][schema.name] = {"status": "loaded", "rows": rep["rows_loaded"],
                                                    "seconds": rep["seconds"]}
                log.info("imported %s: %s rows in %ss", schema.name, rep["rows_loaded"], rep["seconds"])
            except Exception as exc:  # noqa: BLE001 - report every failure to the admin UI
                session.rollback()
                run = session.merge(run)
                run.status = "failed"
                run.error = str(exc)[:2000]
                summary["datasets"][schema.name] = {"status": "failed", "error": str(exc)}
                log.exception("import failed for %s", schema.name)
            run.finished_at = datetime.now(timezone.utc)
            session.commit()

        drun = models.ImportRun(dataset="derived:account_baselines", status="running")
        session.add(drun)
        session.commit()
        try:
            n = compute_derived(session)
            drun.status = "success"
            drun.rows_loaded = n
            drun.report = {"relationships": relationship_summary(session)}
            summary["derived"] = {"account_baselines": n, "relationships": drun.report["relationships"]}
        except Exception as exc:  # noqa: BLE001
            session.rollback()
            drun = session.merge(drun)
            drun.status = "failed"
            drun.error = str(exc)[:2000]
            summary["derived"] = {"error": str(exc)}
        drun.finished_at = datetime.now(timezone.utc)
        session.commit()
    return summary
