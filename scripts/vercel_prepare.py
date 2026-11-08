"""Prepare the dedicated persistent database before a Vercel deployment."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "api"))

from clementiq.config import get_settings
from clementiq.cli import cmd_migrate
from clementiq.ingestion.importer import run_import

if __name__ == "__main__":
    if get_settings().is_sqlite:
        raise SystemExit("Set the dedicated PostgreSQL DATABASE_URL before deploying the API")
    cmd_migrate(None)
    result = run_import()
    if any(item.get("status") == "failed" for item in result["datasets"].values()) or "error" in result.get("derived", {}):
        raise SystemExit("Database import failed; deployment stopped. Check import logs.")
    print("ClementIQ persistent database prepared")
