"""Clement Core vs judge-twist fixtures derived from the README formulas on the REAL dataset.

Regenerate fixtures with:  python -m clementiq.cli fixtures
Skipped automatically when the challenge data or fixture file is absent.
"""
import json
from datetime import date

import pandas as pd
import pytest

from clementiq.config import REPO_ROOT
from clementiq.core.metrics import LoanRecord, compute_baseline
from clementiq.core.shocks import PRESETS, ShockComponent, ShockRequest, apply_shocks
from clementiq.fixtures import FIXTURE_PATH
from clementiq.ingestion.importer import resolve_file

DATA = REPO_ROOT / "data"
MS = resolve_file(DATA, "monthly_summary.csv")

pytestmark = pytest.mark.skipif(not (FIXTURE_PATH.exists() and MS), reason="real data / fixtures not present")


@pytest.fixture(scope="module")
def frames():
    return pd.read_csv(MS), pd.read_csv(resolve_file(DATA, "loans.csv"), parse_dates=["loan_start"])


def _preset(pid, acc):
    p = next(x for x in PRESETS if x["id"] == pid)
    return ShockRequest(account_id=acc, components=[ShockComponent(**c) for c in p["components"]])


def test_engine_matches_fixtures(frames):
    ms, loans = frames
    fx = json.loads(FIXTURE_PATH.read_text())["accounts"]
    assert len(fx) >= 20
    for f in fx:
        acc = f["account_id"]
        l = loans[loans.account_id == acc]
        recs = [LoanRecord(int(r.loan_id), r.status, float(r.monthly_payment), r.loan_start.date(), int(r.duration_months), float(r.amount))
                for r in l.itertuples()]
        b = compute_baseline(acc, ms[ms.account_id == acc], recs, date(2025, 12, 31))
        for k in ("I", "S", "F", "H", "B", "P"):
            assert getattr(b, k) == pytest.approx(f[k], abs=1e-6), (acc, k)
        assert apply_shocks(b, _preset("ei55_6m", acc))["scenario"]["runway"]["display"] == f["runway_ei55"], acc
        assert apply_shocks(b, _preset("furnace", acc))["scenario"]["runway"]["display"] == f["runway_furnace"], acc
        assert apply_shocks(b, _preset("ei55_bills15", acc))["scenario"]["runway"]["display"] == f["runway_ei55_bills15"], acc
