"""Discovery analytics across all accounts (Insights dashboard).

Every number is computed from the imported data at run time — nothing is pre-written.
Findings are associations in observational data, not causal effects; each carries its sample size
and limitations. Demographic attributes (gender, birth date) are deliberately not used.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from .metrics import baselines_vectorized
from .provenance import envelope

CAP = 120.0
RNG_SEED = 20261107


def json_safe(obj: Any) -> Any:
    """Replace NaN/inf (undefined statistics, e.g. correlations on constant input) with None."""
    if isinstance(obj, float):
        return obj if np.isfinite(obj) else None
    if isinstance(obj, (np.floating,)):
        return float(obj) if np.isfinite(obj) else None
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, dict):
        return {k: json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [json_safe(v) for v in obj]
    return obj


def runway_vec(B, inc, spend, one_off=0.0) -> np.ndarray:
    B = np.asarray(B, float)
    left = B - one_off
    gap = np.asarray(spend, float) - np.asarray(inc, float)
    with np.errstate(divide="ignore", invalid="ignore"):
        r = np.where(left <= 0, 0.0, np.where(gap <= 0, CAP, np.minimum(left / gap, CAP)))
    return r


def _boot_median_ci(x: np.ndarray, n: int = 1000) -> tuple[float, float]:
    rng = np.random.default_rng(RNG_SEED)
    if len(x) < 5:
        return (float("nan"), float("nan"))
    meds = np.median(rng.choice(x, size=(n, len(x)), replace=True), axis=1)
    return float(np.percentile(meds, 2.5)), float(np.percentile(meds, 97.5))


def build_features(ms: pd.DataFrame, loans: pd.DataFrame, accounts: pd.DataFrame,
                   districts: pd.DataFrame) -> pd.DataFrame:
    f = baselines_vectorized(ms, loans)
    f["coverage"] = np.where(f.S > 0, f.B / f.S, np.nan)
    f["fixed_burden"] = np.where(f.I > 0, f.F / f.I, np.nan)
    f["bills_share"] = np.where(f.S > 0, f.H / f.S, np.nan)
    f["disc_share"] = np.where(f.S > 0, f.D / f.S, np.nan)
    f["loan_burden"] = np.where(f.I > 0, f.P / f.I, np.nan)
    f["surplus_ratio"] = np.where(f.I > 0, (f.I - f.S) / f.I, np.nan)
    f["runway_base"] = runway_vec(f.B, f.I, f.S)
    f["runway_ei55"] = runway_vec(f.B, 0.55 * f.I, f.S)
    f["runway_combo"] = runway_vec(f.B, 0.55 * f.I, f.S + 0.15 * f.H)
    f["runway_furnace"] = runway_vec(f.B, f.I, f.S, f.S)
    st = loans.set_index("account_id")[["status", "defaulted"]]
    f = f.join(st, how="left")
    f["has_loan"] = f.status.notna()
    f["running_loan"] = f.status.isin(["C", "D"])
    acc = accounts.set_index("account_id")[["district_id"]]
    f = f.join(acc, how="left")
    d = districts.set_index("district_id")[["average_salary", "unemployment_rate_2023", "urban_ratio_pct"]]
    f = f.join(d, on="district_id", how="left")
    return f


def run_insights(f: pd.DataFrame) -> dict[str, Any]:
    n = int(len(f))
    findings: list[dict[str, Any]] = []

    # 1. Buffer coverage distribution
    cov = f.coverage.dropna()
    under1 = float((cov < 1).mean())
    under3 = float((cov < 3).mean())
    hist_edges = [0, 0.5, 1, 2, 3, 6, 12, np.inf]
    labels = ["<0.5", "0.5–1", "1–2", "2–3", "3–6", "6–12", "12+"]
    counts = pd.cut(cov.clip(lower=0), hist_edges, labels=labels, right=False).value_counts().reindex(labels)
    coverage_hist = [{"bucket": k, "accounts": int(v)} for k, v in counts.items()]

    # 2. Judge twists across the whole book
    surv6 = float((f.runway_ei55 >= 6).mean())
    twist = []
    for key, label in (("runway_ei55", "Job loss, EI 55%"), ("runway_combo", "EI 55% + bills +15%"),
                       ("runway_furnace", "Furnace = 1 month of spending")):
        r = f[key]
        twist.append({"scenario": label, "median_runway": float(r.median()),
                      "pct_under_3m": float((r < 3).mean()), "pct_survive_6m": float((r >= 6).mean()),
                      "pct_no_shortfall": float((r >= CAP).mean()), "n": n})

    # 3. Characteristics associated with low coverage (<1 month)
    feats = ["fixed_burden", "bills_share", "disc_share", "loan_burden", "income_cv", "spending_cv", "dbz12", "I"]
    feat_labels = {"fixed_burden": "Fixed costs / income", "bills_share": "Household bills / spending",
                   "disc_share": "Discretionary / spending", "loan_burden": "Loan payment / income",
                   "income_cv": "Income volatility (CV)", "spending_cv": "Spending volatility (CV)",
                   "dbz12": "Overdraft days (12m)", "I": "Typical income"}
    sub = f[feats + ["coverage"]].replace([np.inf, -np.inf], np.nan).dropna()
    corr = sub[feats].corrwith(sub.coverage, method="spearman")
    correlations = [{"feature": k, "label": feat_labels[k], "spearman_rho": float(v), "n": int(len(sub))}
                    for k, v in corr.sort_values().items()]
    y = (sub.coverage < 1).astype(int)
    model_info = None
    if y.nunique() == 2 and len(sub) > 100:
        pipe = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))
        auc = cross_val_score(pipe, sub[feats], y, cv=5, scoring="roc_auc")
        pipe.fit(sub[feats], y)
        coefs = pipe.named_steps["logisticregression"].coef_[0]
        model_info = {
            "target": "coverage < 1 month", "positives": int(y.sum()), "n": int(len(sub)),
            "cv_auc_mean": float(auc.mean()), "cv_auc_std": float(auc.std()),
            "standardized_coefficients": sorted(
                [{"feature": k, "label": feat_labels[k], "coef": float(c)} for k, c in zip(feats, coefs)],
                key=lambda d: -abs(d["coef"])),
            "note": "Logistic regression, standardized features, 5-fold CV. Associations only.",
        }

    # 4. Runway by fixed-cost burden quintile
    fb = f[["fixed_burden", "runway_ei55", "coverage"]].replace([np.inf, -np.inf], np.nan).dropna()
    fb["quintile"] = pd.qcut(fb.fixed_burden.rank(method="first"), 5, labels=["Q1 (lowest)", "Q2", "Q3", "Q4", "Q5 (highest)"])
    by_q = []
    for q, g in fb.groupby("quintile", observed=True):
        lo, hi = _boot_median_ci(g.runway_ei55.to_numpy())
        by_q.append({"quintile": str(q), "fixed_burden_range": [float(g.fixed_burden.min()), float(g.fixed_burden.max())],
                     "median_runway_ei55": float(g.runway_ei55.median()), "ci95": [lo, hi],
                     "pct_survive_6m": float((g.runway_ei55 >= 6).mean()), "n": int(len(g))})

    # 5. Loans and resilience
    loan_cmp = []
    for lbl, mask in (("Running loan", f.running_loan), ("Finished loan", f.has_loan & ~f.running_loan),
                      ("No loan", ~f.has_loan)):
        g = f[mask]
        if len(g):
            loan_cmp.append({"group": lbl, "n": int(len(g)), "median_runway_ei55": float(g.runway_ei55.median()),
                             "median_coverage": float(g.coverage.median()),
                             "pct_survive_6m": float((g.runway_ei55 >= 6).mean())})
    lf = f[f.has_loan].copy()
    default_by_buffer = []
    if len(lf) >= 20:
        lf["buffer_quartile"] = pd.qcut(lf.coverage.rank(method="first"), 4, labels=["Q1 (thinnest)", "Q2", "Q3", "Q4 (thickest)"])
        for q, g in lf.groupby("buffer_quartile", observed=True):
            default_by_buffer.append({"quartile": str(q), "n": int(len(g)),
                                      "default_rate": float(g.defaulted.mean()),
                                      "median_coverage": float(g.coverage.median())})

    # 6. Which intervention helps most under the common EI-55% scenario?
    inc = 0.55 * f.I
    base = f.runway_ei55.to_numpy()
    interventions = {
        "Cut discretionary outflows 10%": runway_vec(f.B, inc, f.S - 0.10 * f.D),
        "Cut household bills 10%": runway_vec(f.B, inc, f.S - 0.10 * f.H),
        "Add $1,000 to buffer": runway_vec(f.B + 1000, inc, f.S),
        "Save one extra month of spending": runway_vec(f.B + f.S, inc, f.S),
    }
    finite = base < CAP
    inter_rows = []
    for name, r in interventions.items():
        gain = (r - base)[finite]
        flipped = float(((base < 6) & (r >= 6)).sum())
        inter_rows.append({"intervention": name, "median_gain_months": float(np.median(gain)) if len(gain) else 0.0,
                           "mean_gain_months": float(np.mean(gain)) if len(gain) else 0.0,
                           "accounts_newly_surviving_6m": int(flipped), "n_with_shortfall": int(finite.sum())})
    inter_rows.sort(key=lambda r: -r["median_gain_months"])

    # 7. Regional context (ecological, district level)
    reg = f.groupby("district_id").agg(runway=("runway_ei55", "median"), unemp=("unemployment_rate_2023", "first"),
                                       salary=("average_salary", "first"), n=("I", "size")).dropna()
    regional = {"n_districts": int(len(reg)),
                "rho_unemployment_vs_runway": float(reg.runway.corr(reg.unemp, method="spearman")) if len(reg) > 5 else None,
                "rho_salary_vs_runway": float(reg.runway.corr(reg.salary, method="spearman")) if len(reg) > 5 else None,
                "note": "Districts are the bank's original branch districts in the Czech Republic (PKDD'99 data; "
                        "money converted to CAD by the organizers), so this is not a statement about Canadian regions. "
                        "District-level (ecological) association; does not describe individuals."}

    # Headline findings — titles AND directions are derived from the computed values, never pre-written.
    fail6 = 1 - surv6
    findings.append({"id": "survive6", "title": f"{fail6:.0%} of customers would run out of buffer within 6 months on EI",
                     "value": fail6, "text": f"With income at EI 55%, {fail6:.0%} of {n:,} accounts have under 6 months of "
                     f"runway (median {twist[0]['median_runway']:.1f} months). {under3:.0%} hold under 3 months of typical "
                     f"spending; {under1:.0%} hold under 1 month.", "n": n})
    run_g = next((g for g in loan_cmp if g["group"] == "Running loan"), None)
    none_g = next((g for g in loan_cmp if g["group"] == "No loan"), None)
    if run_g and none_g:
        worse = run_g["pct_survive_6m"] < none_g["pct_survive_6m"]
        findings.append({"id": "loans", "title": (f"Borrowers are {'less' if worse else 'more'} likely to survive a 6-month layoff"),
                         "text": f"{run_g['pct_survive_6m']:.0%} of accounts with a running loan reach 6 months of EI-55% runway "
                                 f"vs {none_g['pct_survive_6m']:.0%} with no loan (median {run_g['median_runway_ei55']:.1f} vs "
                                 f"{none_g['median_runway_ei55']:.1f} months; n={run_g['n']} vs {none_g['n']}). Association only.",
                         "n": run_g["n"] + none_g["n"]})
    if default_by_buffer:
        lo, hi = default_by_buffer[0], default_by_buffer[-1]
        direction = "concentrate in" if lo["default_rate"] > hi["default_rate"] else "are not concentrated in"
        findings.append({"id": "default_buffer", "title": f"Loan defaults {direction} thin-buffer accounts",
                         "text": f"Default rate is {lo['default_rate']:.0%} in the thinnest-buffer quartile vs "
                                 f"{hi['default_rate']:.0%} in the thickest (n={len(lf)} loan accounts). Buffers are measured at "
                                 "the end of the data, so a default may have caused the thin buffer, not the reverse.",
                         "n": int(len(lf))})
    if model_info:
        top = model_info["standardized_coefficients"][0]
        findings.append({"id": "predictor", "title": f"Strongest signal of a thin buffer: {top['label'].lower()}",
                         "text": f"In a cross-validated logistic model (AUC {model_info['cv_auc_mean']:.2f}, n={model_info['n']}, "
                                 f"{model_info['positives']} accounts under 1 month of coverage), {top['label'].lower()} has the "
                                 f"largest standardized coefficient ({top['coef']:+.2f}). Predictive, not causal.",
                         "n": model_info["n"]})
    if by_q:
        q1, q5 = by_q[0], by_q[-1]
        longer = q5["median_runway_ei55"] > q1["median_runway_ei55"]
        findings.append({"id": "fixed_burden",
                         "title": f"Higher fixed-cost share goes with {'longer' if longer else 'shorter'} runway",
                         "text": f"Median EI-55% runway is {q1['median_runway_ei55']:.1f} months in the lowest fixed-cost/income "
                                 f"quintile vs {q5['median_runway_ei55']:.1f} in the highest (n≈{q1['n']} each)."
                                 + (" Counter-intuitive: many low-share accounts have no labelled bills at all (F = 0), so their "
                                    "spending is unlabelled cash outflow." if longer else ""),
                         "n": int(sum(q['n'] for q in by_q))})
    if inter_rows:
        best = inter_rows[0]
        findings.append({"id": "intervention", "title": f"Best modeled lever: {best['intervention'].lower()}",
                         "text": f"Under a common EI-55% shock, '{best['intervention']}' adds a median "
                                 f"{best['median_gain_months']:.2f} months of runway and lifts "
                                 f"{best['accounts_newly_surviving_6m']} accounts over the 6-month line "
                                 f"(n={best['n_with_shortfall']} accounts with a shortfall).",
                         "n": best["n_with_shortfall"]})

    payload = {
        "n_accounts": n,
        "findings": findings,
        "coverage_hist": coverage_hist,
        "coverage_under_1m": under1,
        "coverage_under_3m": under3,
        "twists": twist,
        "low_coverage_correlations": correlations,
        "low_coverage_model": model_info,
        "runway_by_fixed_burden": by_q,
        "loan_comparison": loan_cmp,
        "default_by_buffer": default_by_buffer,
        "interventions": inter_rows,
        "regional": regional,
        "limitations": [
            "Observational data: associations are not causal effects.",
            "Buffer B is an average balance in one bank account; customers may hold savings elsewhere.",
            "Loan status and buffers are measured at the end of the data window (possible reverse causality).",
            "Demographic attributes are intentionally excluded from all analyses.",
        ],
    }
    return envelope(json_safe(payload), {"n": n})
