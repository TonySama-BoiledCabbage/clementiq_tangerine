"""ClementIQ monitoring worker — independently deployable scheduled jobs.

    cd services/api && python ../worker/worker.py         (local)
    docker compose up worker                              (container)

Jobs (intervals in clementiq/jobs.py): WorldPulse refresh, market prices, alert generation.
Uses APScheduler with coalescing and max_instances=1 so restarts or slow providers never cause
overlapping or duplicate processing; job logic itself is idempotent (dedup keys).
"""
from __future__ import annotations

import logging
import os
import signal
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

from apscheduler.schedulers.blocking import BlockingScheduler  # noqa: E402

from clementiq import models  # noqa: E402
from clementiq.db import Base, get_engine, session_factory  # noqa: E402
from clementiq.jobs import JOB_INTERVALS_MIN, JOBS, run_job  # noqa: E402

log = logging.getLogger("clementiq.worker")


def heartbeat() -> None:
    with session_factory()() as db:
        row = db.get(models.DataSourceStatus, "worker_heartbeat") or models.DataSourceStatus(
            source="worker_heartbeat", kind="worker", status="ok")
        now = datetime.now(timezone.utc)
        row.status, row.last_success_at, row.last_attempt_at = "ok", now, now
        db.merge(row)
        db.commit()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    Base.metadata.create_all(get_engine())
    sched = BlockingScheduler(timezone="UTC", job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 300})
    sched.add_job(heartbeat, "interval", minutes=1, id="heartbeat", next_run_time=datetime.now(timezone.utc))
    for name, minutes in JOB_INTERVALS_MIN.items():
        sched.add_job(run_job, "interval", minutes=minutes, args=[name, JOBS[name], "worker"], id=name,
                      next_run_time=datetime.now(timezone.utc) if os.getenv("WORKER_RUN_ON_START", "true") == "true" else None)
    signal.signal(signal.SIGTERM, lambda *_: sched.shutdown(wait=False))
    log.info("worker started with jobs: %s", ", ".join(JOB_INTERVALS_MIN))
    sched.start()


if __name__ == "__main__":
    main()
