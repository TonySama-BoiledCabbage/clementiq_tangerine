"""ClementIQ command line.

    python -m clementiq.cli migrate              # alembic upgrade head
    python -m clementiq.cli import [--force] [--only loans,accounts] [--skip transactions]
    python -m clementiq.cli timescale            # hypertables + continuous aggregates (Tiger Data)
    python -m clementiq.cli benchmark            # measured query timings (Tiger Data vs raw)
    python -m clementiq.cli refresh              # one WorldPulse refresh
    python -m clementiq.cli fixtures             # regenerate judge-twist fixtures from the formulas
"""
from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from .config import REPO_ROOT, get_settings


def cmd_migrate(_: argparse.Namespace) -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    cfg.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    command.upgrade(cfg, "head")
    print("database migrated to head")


def cmd_import(a: argparse.Namespace) -> None:
    from .ingestion.importer import run_import

    res = run_import(Path(a.data_dir) if a.data_dir else None,
                     only=a.only.split(",") if a.only else None, force=a.force,
                     skip=a.skip.split(",") if a.skip else None)
    print(json.dumps(res, indent=2, default=str))


def cmd_timescale(_: argparse.Namespace) -> None:
    from sqlalchemy import text

    from .db import get_engine

    s = get_settings()
    if s.is_sqlite:
        raise SystemExit("timescale setup requires a PostgreSQL / Tiger Data DATABASE_URL")
    sql = (REPO_ROOT / "database" / "timescale" / "001_hypertables.sql").read_text(encoding="utf-8")
    with get_engine().connect() as conn:
        conn = conn.execution_options(isolation_level="AUTOCOMMIT")
        body = "\n".join(line for line in sql.splitlines() if not line.strip().startswith("--"))
        for stmt in [x.strip() for x in body.split(";\n") if x.strip()]:
            print("->", stmt.splitlines()[0][:90])
            conn.execute(text(stmt))
    print("timescale objects created")


def cmd_benchmark(a: argparse.Namespace) -> None:
    from .benchmark import run_benchmark

    res = run_benchmark(repeats=a.repeats)
    out = REPO_ROOT / "docs" / "benchmarks" / "tiger_data_benchmark.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(res, indent=2), encoding="utf-8")
    print(json.dumps(res, indent=2))
    print(f"saved to {out}")


def cmd_refresh(_: argparse.Namespace) -> None:
    from .jobs import JOBS, run_job

    print(json.dumps(run_job("worldpulse_refresh", JOBS["worldpulse_refresh"], runner="cli"), indent=2, default=str))


def cmd_fixtures(a: argparse.Namespace) -> None:
    from .fixtures import write_fixtures

    path = write_fixtures(n=a.n)
    print(f"wrote {path}")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    p = argparse.ArgumentParser(prog="clementiq")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("migrate").set_defaults(fn=cmd_migrate)
    imp = sub.add_parser("import")
    imp.add_argument("--data-dir")
    imp.add_argument("--only")
    imp.add_argument("--skip")
    imp.add_argument("--force", action="store_true")
    imp.set_defaults(fn=cmd_import)
    sub.add_parser("timescale").set_defaults(fn=cmd_timescale)
    b = sub.add_parser("benchmark")
    b.add_argument("--repeats", type=int, default=5)
    b.set_defaults(fn=cmd_benchmark)
    sub.add_parser("refresh").set_defaults(fn=cmd_refresh)
    f = sub.add_parser("fixtures")
    f.add_argument("--n", type=int, default=25)
    f.set_defaults(fn=cmd_fixtures)
    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
