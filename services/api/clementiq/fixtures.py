"""Judge-twist fixtures computed with an INDEPENDENT, minimal implementation of the README formulas
(plain pandas straight from the CSV files — no Clement Core code). Tests compare Clement Core against
these fixtures, giving a reproducible check that the engine matches the judges' worksheet.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from .config import REPO_ROOT, get_settings
from .ingestion.importer import resolve_file

FIXTURE_PATH = REPO_ROOT / "tests" / "fixtures" / "judge_twists.json"


def readme_runway(B: float, inc: float, spend: float, one_off: float = 0.0) -> str:
    left = B - one_off
    gap = spend - inc
    if left <= 0:
        return "0.0"
    if gap <= 0:
        return "no shortfall (120+)"
    return f"{round(min(left / gap, 120), 1):.1f}"


def select_accounts(ms: pd.DataFrame, n: int) -> list[int]:
    """Deterministic selection: evenly spaced account ids plus edge cases."""
    ids = sorted(ms.account_id.unique())
    step = max(len(ids) // n, 1)
    chosen = set(ids[::step][:n])
    last6 = ms.sort_values("month").groupby("account_id").tail(6).groupby("account_id").avg_daily_balance.mean()
    med = ms.groupby("account_id")[["money_in", "money_out"]].median()
    chosen.add(int(last6.idxmin()))                                  # most negative buffer
    chosen.add(int((med.money_in - med.money_out).idxmax()))         # strongest surplus (no shortfall)
    chosen.add(int((med.money_out - med.money_in).idxmax()))         # largest shortfall
    return sorted(int(x) for x in chosen)


def compute_fixture(ms: pd.DataFrame, loans: pd.DataFrame, acc: int) -> dict:
    d = ms[ms.account_id == acc].sort_values("month")
    I = float(d.money_in.median())
    S = float(d.money_out.median())
    F = float((d.household_bills + d.insurance + d.loan_payments).median())
    H = float(d.household_bills.median())
    B = float(d.tail(6).avg_daily_balance.mean())
    l = loans[loans.account_id == acc]
    P = float(l.monthly_payment.iloc[0]) if len(l) and l.status.iloc[0] in ("C", "D") else 0.0
    return {"account_id": acc, "I": I, "S": S, "F": F, "H": H, "B": B, "P": P,
            "runway_baseline": readme_runway(B, I, S),
            "runway_ei55": readme_runway(B, 0.55 * I, S),
            "runway_furnace": readme_runway(B, I, S, S),
            "runway_ei55_bills15": readme_runway(B, 0.55 * I, S + 0.15 * H)}


def write_fixtures(n: int = 25, path: Path = FIXTURE_PATH) -> Path:
    data_dir = get_settings().data_dir
    ms = pd.read_csv(resolve_file(data_dir, "monthly_summary.csv"))
    loans = pd.read_csv(resolve_file(data_dir, "loans.csv"))
    accs = select_accounts(ms, n)
    fx = [compute_fixture(ms, loans, a) for a in accs]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"source": "Tangerine README formulas, independent pandas implementation",
                                "accounts": fx}, indent=2), encoding="utf-8")
    return path
