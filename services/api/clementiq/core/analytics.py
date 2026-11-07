"""Historical trend analysis, anomaly detection and short-horizon forecasting (Clement Core)."""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

ANOMALY_COLS = ("money_out", "household_bills", "cash_withdrawals_genuine", "bank_fees")


def robust_z(series: pd.Series) -> pd.Series:
    med = series.median()
    mad = (series - med).abs().median()
    scale = 1.4826 * mad
    if scale == 0:
        return pd.Series(np.zeros(len(series)), index=series.index)
    return (series - med) / scale


def detect_anomalies(monthly: pd.DataFrame, threshold: float = 3.5, recent: int | None = None) -> list[dict[str, Any]]:
    """Months where a spending category is unusually high versus the account's own history
    (robust z-score using median and MAD). Deterministic."""
    df = monthly.sort_values("month").reset_index(drop=True)
    out = []
    for col in ANOMALY_COLS:
        if col not in df or df[col].sum() == 0:
            continue
        z = robust_z(df[col])
        med = float(df[col].median())
        for i in np.where(z > threshold)[0]:
            row = df.iloc[int(i)]
            out.append({"month": row["month"], "category": col, "value": float(row[col]),
                        "typical": med, "robust_z": float(z.iloc[int(i)]),
                        "excess": float(row[col]) - med})
    out.sort(key=lambda x: x["month"])
    if recent:
        months = set(df["month"].tail(recent))
        out = [a for a in out if a["month"] in months]
    return out


def trends(monthly: pd.DataFrame) -> dict[str, Any]:
    df = monthly.sort_values("month").reset_index(drop=True)
    res = {}
    for col in ("money_in", "money_out", "household_bills", "avg_daily_balance"):
        y = df[col].to_numpy(dtype=float)
        if len(y) < 6:
            continue
        x = np.arange(len(y)).reshape(-1, 1)
        m = LinearRegression().fit(x, y)
        res[col] = {"slope_per_month": float(m.coef_[0]),
                    "recent_6m_mean": float(y[-6:].mean()), "prior_6m_mean": float(y[-12:-6].mean()) if len(y) >= 12 else None}
    # Category change: last 6 months vs previous 6 months
    changes = []
    if len(df) >= 12:
        for col in ("household_bills", "insurance", "loan_payments", "cash_withdrawals_genuine",
                    "card_withdrawals", "transfers_out_other", "bank_fees"):
            a, b = df[col].iloc[-12:-6].mean(), df[col].iloc[-6:].mean()
            changes.append({"category": col, "prior_6m": float(a), "recent_6m": float(b),
                            "change": float(b - a), "change_pct": float((b - a) / a * 100) if a > 0 else None})
        changes.sort(key=lambda c: -c["change"])
    res["category_changes"] = changes
    return res


def forecast_balance(monthly: pd.DataFrame, months_ahead: int = 6, window: int = 18) -> dict[str, Any]:
    """Linear trend on month-end balance over the recent window with a ±1.96σ residual band.
    Illustrative only — labelled as a statistical projection, not a prediction of the future."""
    df = monthly.sort_values("month").tail(window).reset_index(drop=True)
    y = df["month_end_balance"].to_numpy(dtype=float)
    if len(y) < 6:
        return {"available": False, "reason": "fewer than 6 months of history"}
    x = np.arange(len(y)).reshape(-1, 1)
    model = LinearRegression().fit(x, y)
    resid = y - model.predict(x)
    sigma = float(np.std(resid, ddof=1))
    last = pd.Period(df["month"].iloc[-1], "M")
    pts = []
    for k in range(1, months_ahead + 1):
        pred = float(model.predict(np.array([[len(y) - 1 + k]]))[0])
        pts.append({"month": str(last + k), "forecast": pred,
                    "lower": pred - 1.96 * sigma * np.sqrt(1 + k / len(y)),
                    "upper": pred + 1.96 * sigma * np.sqrt(1 + k / len(y))})
    return {"available": True, "method": f"OLS linear trend on last {len(y)} month-end balances",
            "slope_per_month": float(model.coef_[0]), "residual_sigma": sigma, "points": pts,
            "label": "Statistical projection from past balances; not a guarantee."}
