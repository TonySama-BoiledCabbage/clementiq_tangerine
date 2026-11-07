"""Tangerine challenge reference metrics (docs/TANGERINE_CHALLENGE.md, "How judges calculate").

    I = median(money_in)
    F = median(household_bills + insurance + loan_payments)
    S = median(money_out)
    B = mean(avg_daily_balance over the account's last 6 rows, sorted by month)
    H = median(household_bills)
    P = loans.monthly_payment if the loan is still running at the end of 2025, else 0

All values are computed at full float precision; rounding happens only at presentation.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Iterable, Sequence

import numpy as np
import pandas as pd

from .provenance import Calc, now_iso

RUNNING_STATUSES = {"C", "D"}  # C = running OK, D = running, client in debt
DISCRETIONARY_COLS = ("cash_withdrawals_genuine", "card_withdrawals", "transfers_out_other")
FIXED_COLS = ("household_bills", "insurance", "loan_payments")
SUMMARY_COLS = (
    "money_in", "money_out", "cash_deposits", "transfers_in", "pension_in", "interest_in",
    "household_bills", "insurance", "loan_payments", "bank_fees", "cash_withdrawals_genuine",
    "card_withdrawals", "transfers_out_other", "month_end_balance", "min_balance",
    "avg_daily_balance", "days_below_zero",
)


@dataclass(frozen=True)
class LoanRecord:
    loan_id: int
    status: str
    monthly_payment: float
    loan_start: date | None = None
    duration_months: int | None = None
    amount: float | None = None


@dataclass
class Baseline:
    account_id: int
    I: float
    S: float
    F: float
    H: float
    B: float
    P: float
    D: float  # median discretionary (cash + card withdrawals + unlabelled transfers out)
    months_of_data: int
    first_month: str
    last_month: str
    buffer_months: list[str]
    income_cv: float | None
    spending_cv: float | None
    days_below_zero_12m: int
    category_medians: dict[str, float]
    warnings: list[str] = field(default_factory=list)
    loan: dict[str, Any] | None = None

    def judging_dict(self) -> dict[str, float]:
        return {"I": self.I, "S": self.S, "F": self.F, "H": self.H, "B": self.B, "P": self.P}


def loan_is_running(loan: LoanRecord, reference: date) -> bool:
    """README: running at the end of 2025. Status C/D is authoritative; in the supplied data it
    agrees exactly with loan_start + duration_months > 2025-12-31 (verified at import)."""
    return loan.status in RUNNING_STATUSES


def active_loan_payment(loans: Iterable[LoanRecord], reference: date) -> float:
    return float(sum(l.monthly_payment for l in loans if loan_is_running(l, reference)))


def _cv(x: np.ndarray) -> float | None:
    if len(x) < 3:
        return None
    m = float(np.mean(x))
    return float(np.std(x, ddof=1) / m) if m > 0 else None


def compute_baseline(
    account_id: int,
    monthly: pd.DataFrame,
    loans: Sequence[LoanRecord] = (),
    reference: date = date(2025, 12, 31),
    buffer_window: int = 6,
) -> Baseline:
    """Compute I, S, F, H, B, P for one account from its monthly_summary rows."""
    if monthly is None or monthly.empty:
        raise ValueError(f"account {account_id} has no monthly_summary rows")
    df = monthly.copy()
    df["month"] = df["month"].astype(str)
    dupes = int(df.duplicated("month").sum())
    df = df.drop_duplicates("month", keep="last").sort_values("month").reset_index(drop=True)
    warnings: list[str] = []
    if dupes:
        warnings.append(f"{dupes} duplicate month rows removed (last kept)")
    for c in SUMMARY_COLS:
        if c in df.columns:
            nulls = int(df[c].isna().sum())
            if nulls:
                warnings.append(f"{nulls} missing values in {c} treated as 0")
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)

    fixed = df["household_bills"] + df["insurance"] + df["loan_payments"]
    discretionary = sum(df[c] for c in DISCRETIONARY_COLS)
    last = df.tail(buffer_window)
    if len(df) < buffer_window:
        warnings.append(f"only {len(df)} months available; buffer uses all of them")

    loan_list = list(loans)
    P = active_loan_payment(loan_list, reference)
    loan_info = None
    if loan_list:
        l0 = loan_list[0]
        loan_info = {
            "loan_id": l0.loan_id, "status": l0.status, "monthly_payment": l0.monthly_payment,
            "running": loan_is_running(l0, reference), "amount": l0.amount,
            "duration_months": l0.duration_months,
            "loan_start": l0.loan_start.isoformat() if l0.loan_start else None,
        }

    tail12 = df.tail(12)
    cat = {c: float(np.median(df[c])) for c in SUMMARY_COLS if c in df.columns and c not in (
        "month_end_balance", "min_balance", "avg_daily_balance", "days_below_zero")}

    return Baseline(
        account_id=account_id,
        I=float(np.median(df["money_in"])),
        S=float(np.median(df["money_out"])),
        F=float(np.median(fixed)),
        H=float(np.median(df["household_bills"])),
        B=float(np.mean(last["avg_daily_balance"])),
        P=P,
        D=float(np.median(discretionary)),
        months_of_data=len(df),
        first_month=df["month"].iloc[0],
        last_month=df["month"].iloc[-1],
        buffer_months=list(last["month"]),
        income_cv=_cv(df["money_in"].to_numpy()),
        spending_cv=_cv(df["money_out"].to_numpy()),
        days_below_zero_12m=int(tail12["days_below_zero"].sum()),
        category_medians=cat,
        warnings=warnings,
        loan=loan_info,
    )


def baseline_calcs(b: Baseline) -> list[dict[str, Any]]:
    ts = now_iso()
    n = b.months_of_data
    span = f"{b.first_month}..{b.last_month} ({n} months)"
    items = [
        Calc("income_I", b.I, "CAD/month", "median(money_in)", {"months": span}),
        Calc("spending_S", b.S, "CAD/month", "median(money_out)", {"months": span}),
        Calc("fixed_costs_F", b.F, "CAD/month",
             "median(household_bills + insurance + loan_payments)", {"months": span},
             ["Shown for context; not used in judging runway (README)."]),
        Calc("household_bills_H", b.H, "CAD/month", "median(household_bills)", {"months": span},
             ["Rent and utility shocks scale this value."]),
        Calc("buffer_B", b.B, "CAD", "mean(avg_daily_balance over last 6 months)",
             {"months": b.buffer_months},
             ["Average account balance is a liquidity proxy, not net worth."],
             warnings=[w for w in b.warnings if "buffer" in w]),
        Calc("loan_payment_P", b.P, "CAD/month",
             "loans.monthly_payment if status in {C, D} (running at 2025-12-31) else 0",
             {"loan": b.loan}, provenance="loans.csv"),
        Calc("discretionary_D", b.D, "CAD/month",
             "median(cash_withdrawals_genuine + card_withdrawals + transfers_out_other)",
             {"months": span},
             ["ClementIQ definition: outflows not labelled as bills, insurance, loans or fees."]),
        Calc("monthly_surplus", b.I - b.S, "CAD/month", "I - S", {"I": b.I, "S": b.S}),
    ]
    return [c.to_dict(ts) for c in items]


def baselines_vectorized(ms: pd.DataFrame, loans: pd.DataFrame, buffer_window: int = 6) -> pd.DataFrame:
    """Same definitions as compute_baseline, applied to every account at once (used for the
    derived account_baselines table and the Insights dashboard). Tested for equality."""
    ms = ms.sort_values(["account_id", "month"])
    ms = ms.assign(
        fixed=ms.household_bills + ms.insurance + ms.loan_payments,
        disc=sum(ms[c] for c in DISCRETIONARY_COLS),
    )
    g = ms.groupby("account_id")
    out = pd.DataFrame({
        "I": g.money_in.median(),
        "S": g.money_out.median(),
        "F": g.fixed.median(),
        "H": g.household_bills.median(),
        "D": g.disc.median(),
        "B": g.tail(buffer_window).groupby("account_id").avg_daily_balance.mean(),
        "months": g.size(),
        "first_month": g.month.first(),
        "last_month": g.month.last(),
        "income_cv": g.money_in.std() / g.money_in.mean().replace(0, np.nan),
        "spending_cv": g.money_out.std() / g.money_out.mean().replace(0, np.nan),
        "dbz12": g.tail(12).groupby("account_id").days_below_zero.sum(),
    })
    run = loans[loans.status.isin(RUNNING_STATUSES)].groupby("account_id").monthly_payment.sum()
    out["P"] = run.reindex(out.index).fillna(0.0)
    return out
