"""Clement Core: Tangerine reference metrics, runway, shocks, plans, exposure, portfolio, score."""
from datetime import date

import pandas as pd
import pytest

from clementiq.core.exposure import ImpactRequest, event_impact
from clementiq.core.metrics import LoanRecord, baselines_vectorized, compute_baseline
from clementiq.core.portfolio import HoldingIn, ScenarioRequest, stress_test, valuate
from clementiq.core.recovery import GoalPlanRequest, backup_plan, goal_plan
from clementiq.core.resilience import WEIGHTS, resilience_score
from clementiq.core.runway import compute_runway
from clementiq.core.shocks import ShockComponent, ShockRequest, apply_shocks


@pytest.fixture(scope="module")
def ms(data_dir):
    return pd.read_csv(data_dir / "monthly_summary.csv")


@pytest.fixture(scope="module")
def b1001(ms):
    return compute_baseline(1001, ms[ms.account_id == 1001], [LoanRecord(31, "C", 300.0, date(2025, 1, 1), 24, 7200.0)])


@pytest.fixture(scope="module")
def b1002(ms):
    return compute_baseline(1002, ms[ms.account_id == 1002], [LoanRecord(32, "A", 100.0, date(2023, 1, 1), 12, 1200.0)])


# ---- metrics -------------------------------------------------------------------------
def test_income_spending_fixed_bills(b1001):
    assert b1001.I == 3000
    assert b1001.S == 2500          # median ignores the 4000 spike
    assert b1001.F == 1400          # 1000 + 100 + 300
    assert b1001.H == 1000


def test_buffer_last_six_sorted(b1001):
    assert b1001.B == pytest.approx((5400 + 5600 + 5800 + 6000 + 6200 + 6400) / 6)
    assert b1001.buffer_months == ["2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08"]


def test_duplicate_month_removed_with_warning(b1001):
    assert b1001.months_of_data == 8
    assert any("duplicate" in w for w in b1001.warnings)


def test_buffer_order_independent(ms):
    shuffled = ms[ms.account_id == 1001].sample(frac=1, random_state=3)
    assert compute_baseline(1001, shuffled).B == pytest.approx(5900)


def test_fewer_than_six_months(ms):
    b = compute_baseline(1003, ms[ms.account_id == 1003])
    assert b.B == -300
    assert any("only 4 months" in w for w in b.warnings)


def test_loan_handling(b1001, b1002):
    assert b1001.P == 300.0          # status C running
    assert b1002.P == 0.0            # status A finished
    assert compute_baseline(9, pd.DataFrame({"month": ["2025-01"], "money_in": [1], "money_out": [1], "household_bills": [0],
                                             "insurance": [0], "loan_payments": [0], "avg_daily_balance": [1],
                                             "days_below_zero": [0], "cash_withdrawals_genuine": [0],
                                             "card_withdrawals": [0], "transfers_out_other": [0]}),
                            [LoanRecord(1, "D", 55.0)]).P == 55.0


def test_vectorized_matches_per_account(ms, b1001, b1002):
    loans = pd.DataFrame({"account_id": [1001, 1002], "status": ["C", "A"], "monthly_payment": [300.0, 100.0]})
    v = baselines_vectorized(ms.drop_duplicates(["account_id", "month"], keep="last"), loans)
    for b in (b1001, b1002):
        row = v.loc[b.account_id]
        for k in ("I", "S", "F", "H", "B", "P", "D"):
            assert row[k] == pytest.approx(getattr(b, k)), k


# ---- runway --------------------------------------------------------------------------
def test_runway_zero_and_negative_buffer():
    assert compute_runway(0, 100, 200).months == 0
    assert compute_runway(-50, 100, 200).status == "depleted"
    assert compute_runway(1000, 100, 200, one_off_costs=1000).months == 0   # buffer_left == 0


def test_runway_no_shortfall():
    r = compute_runway(1000, 300, 300)
    assert r.no_shortfall and r.display == "no shortfall (120+)"


def test_runway_cap():
    r = compute_runway(1_000_000, 0, 10)
    assert r.months == 120 and r.capped and r.raw_months == 100_000


def test_runway_rounding_presentation_only():
    r = compute_runway(5900, 1650, 2500)
    assert r.months == pytest.approx(5900 / 850)
    assert r.display == "6.9"


# ---- shocks --------------------------------------------------------------------------
def _sim(b, comps, mode="judging", **kw):
    return apply_shocks(b, ShockRequest(account_id=b.account_id, components=[ShockComponent(**c) for c in comps], mode=mode, **kw))


def test_single_shock_ei55(b1001):
    r = _sim(b1001, [{"type": "job_loss", "income_replacement_pct": 55, "duration_months": 6}])
    assert r["scenario"]["income"] == pytest.approx(1650)
    assert r["scenario"]["runway"]["display"] == "6.9"
    assert r["verdict"]["survives"] is True


def test_furnace_one_month_of_spending(b1001):
    r = _sim(b1001, [{"type": "emergency_expense", "months_of_spending": 1}])
    assert r["scenario"]["one_off_costs"] == 2500
    assert r["scenario"]["buffer_left"] == pytest.approx(3400)
    assert r["scenario"]["runway"]["no_shortfall"]


def test_combined_ei_and_bills(b1001):
    r = _sim(b1001, [{"type": "job_loss", "income_replacement_pct": 55}, {"type": "bill_inflation", "pct": 15}])
    assert r["scenario"]["spending"] == pytest.approx(2650)
    assert r["scenario"]["runway"]["display"] == "5.9"


def test_shortfall_account(b1002):
    r = _sim(b1002, [{"type": "vehicle_repair", "amount": 200}])
    assert r["baseline"]["runway"]["display"] == "2.0"
    assert r["scenario"]["runway"]["display"] == "1.7"


def test_judging_mode_rejects_estimated_allocation(b1001):
    with pytest.raises(ValueError):
        _sim(b1001, [{"type": "transport_cost", "pct": 10}])
    r = _sim(b1001, [{"type": "transport_cost", "pct": 10}], mode="extended")
    assert any("ESTIMATE" in a for a in r["assumptions"])


def test_extended_mode_ei_cap(b1001):
    r = _sim(b1001, [{"type": "job_loss", "income_replacement_pct": 55, "duration_months": 6}], mode="extended")
    cap = 695 * 52 / 12
    assert r["scenario"]["income"] == pytest.approx(min(1650, cap))
    assert r["projection"][6]["scenario_income"] == 0  # EI exhausted after month 6


def test_shock_determinism(b1001):
    a = _sim(b1001, [{"type": "job_loss", "income_replacement_pct": 55}])
    b = _sim(b1001, [{"type": "job_loss", "income_replacement_pct": 55}])
    assert a["input_hash"] == b["input_hash"] and a["scenario"] == b["scenario"]


def test_shock_validation():
    with pytest.raises(ValueError):
        ShockComponent(type="bill_inflation")


# ---- recovery ------------------------------------------------------------------------
def test_goal_plan(b1001):
    p = goal_plan(b1001, GoalPlanRequest(account_id=1001, target_months=3))
    assert p["target"] == 7500
    assert p["gap"] == pytest.approx(1600)
    assert p["recommended_monthly_contribution"] == pytest.approx(250)   # 50% of 500 surplus
    assert p["months_to_goal"] == 7
    assert p["milestones"][-1]["month"] == 7


def test_goal_plan_reached_and_no_capacity(b1001, b1002):
    assert goal_plan(b1001, GoalPlanRequest(account_id=1001, target_months=1))["status"] == "reached"
    p = goal_plan(b1002, GoalPlanRequest(account_id=1002))
    assert p["status"] == "no_capacity" and p["months_to_goal"] is None
    assert p["capacity_hint"]["monthly_shortfall"] == 600


def test_backup_plan(b1001):
    p = backup_plan(b1001, ShockRequest(account_id=1001, components=[ShockComponent(type="job_loss", income_replacement_pct=55)]))
    assert p["monthly_shortfall"] == pytest.approx(850)
    tiers = [a["runway"]["months_precise"] for a in p["alternatives"][:4]]
    assert tiers == sorted(tiers)            # deeper cuts never shorten runway
    assert p["runway_improvement_months"] >= 0
    assert any("Employment Insurance" in a["action"] for a in p["immediate_actions"])


# ---- exposure ------------------------------------------------------------------------
def test_energy_never_one_to_one(b1001):
    r = event_impact(b1001, ImpactRequest(account_id=1001, topic="energy", magnitude=20, level="high"))
    transport = next(c for c in r["channels"] if c["channel"] == "transportation")
    assert transport["effective_change_pct"] < 20
    assert transport["is_estimate"] is True
    assert r["limitations"]


def test_interest_rate_fixed_case_zero(b1001):
    low = event_impact(b1001, ImpactRequest(account_id=1001, topic="interest_rate", magnitude=1.0, level="low"))
    loan = next(c for c in low["channels"] if c["channel"] == "loan_payments")
    assert loan["monthly_change"] == 0
    assert low["levels"]["high"]["additional_monthly_spending"] > 0


def test_levels_monotonic(b1001):
    r = event_impact(b1001, ImpactRequest(account_id=1001, topic="inflation", magnitude=3))
    lv = r["levels"]
    assert lv["low"]["additional_monthly_spending"] < lv["medium"]["additional_monthly_spending"] < lv["high"]["additional_monthly_spending"]


# ---- portfolio -----------------------------------------------------------------------
def test_portfolio_stress():
    hs = [HoldingIn(symbol="AAA", asset_class="stock", quantity=10, price=100, cost_basis=800),
          HoldingIn(symbol="SOL", asset_class="crypto", quantity=1, price=1000)]
    v = valuate(hs)
    assert v["total_value"] == 2000
    assert v["concentration"]["hhi"] == pytest.approx(0.5)
    r = stress_test(ScenarioRequest(holdings=hs, scenario_id="bear_market", account_buffer=5000, account_monthly_gap=500))
    assert r["modeled_value"] == pytest.approx(1000 * 0.7 + 1000 * 0.5)
    assert r["broader_position"]["runway_liquid_only"]["display"] == "10.0"
    assert "runway_with_investments" not in r["broader_position"]


def test_missing_price_not_fabricated():
    v = valuate([HoldingIn(symbol="ZZZ", asset_class="stock", quantity=5)])
    assert v["total_value"] == 0 and v["missing_prices"] == ["ZZZ"]


# ---- resilience ----------------------------------------------------------------------
def test_resilience_score(b1001, b1002):
    assert sum(WEIGHTS.values()) == pytest.approx(1)
    s1, s2 = resilience_score(b1001), resilience_score(b1002)
    assert 0 <= s2["score"] < s1["score"] <= 100
    assert len(s1["breakdown"]) == 6
    assert "credit score" in s1["disclaimer"]
