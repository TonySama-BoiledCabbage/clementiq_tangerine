"""Build a slim demo database for hosting: all accounts and monthly summaries, transactions for demo accounts only.

The judging formula, Needs-attention list and Findings read `monthly_summaries`, not `transactions`; the 1M-row
`transactions` table is only read by the paged "Transactions" list on Account details. Everything else, including
`import_runs` (the cache fingerprint), is copied unchanged. The source database is opened read-only.

    python scripts/make_demo_db.py                       # data/processed/clementiq.db -> data/demo/clementiq.db
    python scripts/make_demo_db.py --keep 95678 20176    # which accounts keep their transactions
    DATABASE_URL=sqlite:///<repo>/data/demo/clementiq.db  -> point the API at it

Standard library only, so any Python 3 works.
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DEMO_ACCOUNTS = [95678, 20176, 37897]  # CLAUDE.md §1: short + behind, stable, top of Needs attention
# Runtime logs from the source machine: not part of the dataset, so not shipped.
CLEARED_TABLES = ["audit_logs", "ai_explanations"]


def mb(p: Path) -> float:
    return p.stat().st_size / 1048576


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=Path, default=REPO / "data" / "processed" / "clementiq.db")
    ap.add_argument("--out", type=Path, default=REPO / "data" / "demo" / "clementiq.db")
    ap.add_argument("--keep", type=int, nargs="+", default=DEMO_ACCOUNTS, help="account ids that keep their transactions")
    ap.add_argument("--force", action="store_true", help="overwrite --out if it exists")
    a = ap.parse_args()

    if not a.src.exists():
        print(f"source database not found: {a.src}", file=sys.stderr)
        return 1
    if a.out.exists() and not a.force:
        print(f"{a.out} exists (use --force to overwrite)", file=sys.stderr)
        return 1
    if a.out.resolve() == a.src.resolve():
        print("--out must not be the source database", file=sys.stderr)
        return 1
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.unlink(missing_ok=True)

    # VACUUM INTO gives a consistent, compact copy even while the API holds the source open.
    src = sqlite3.connect(f"file:{a.src.as_posix()}?mode=ro", uri=True)
    src.execute("VACUUM INTO ?", (a.out.as_posix(),))
    before = src.execute("SELECT count(*) FROM transactions").fetchone()[0]
    expect = dict(src.execute(
        f"SELECT account_id, count(*) FROM transactions WHERE account_id IN ({','.join('?' * len(a.keep))}) GROUP BY account_id",
        a.keep).fetchall())
    src.close()

    db = sqlite3.connect(a.out)
    marks = ",".join("?" * len(a.keep))
    db.execute(f"DELETE FROM transactions WHERE account_id NOT IN ({marks})", a.keep)
    for t in CLEARED_TABLES:
        db.execute(f"DELETE FROM {t}")
    db.commit()
    db.execute("VACUUM")

    after = db.execute("SELECT count(*) FROM transactions").fetchone()[0]
    got = dict(db.execute("SELECT account_id, count(*) FROM transactions GROUP BY account_id").fetchall())
    ok = db.execute("PRAGMA integrity_check").fetchone()[0]
    accounts = db.execute("SELECT count(*) FROM accounts").fetchone()[0]
    summaries = db.execute("SELECT count(*) FROM monthly_summaries").fetchone()[0]
    db.close()

    if got != expect or ok != "ok":
        print(f"verification FAILED: kept {got} expected {expect}, integrity={ok}", file=sys.stderr)
        return 2
    print(f"{a.src.name}: {mb(a.src):.1f} MB -> {a.out}: {mb(a.out):.1f} MB")
    print(f"transactions {before:,} -> {after:,} (kept accounts: {', '.join(f'{k}={v}' for k, v in sorted(got.items()))})")
    print(f"accounts {accounts:,}, monthly_summaries {summaries:,} unchanged; integrity_check={ok}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
