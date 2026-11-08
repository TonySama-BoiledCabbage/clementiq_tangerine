"""Recompute every number quoted in docs/TRUMP_CARDS.md from the live database.

Run from services/api (Windows: .venv\\Scripts\\python ..\\..\\scripts\\trump_card_facts.py).
Takes about 30 s; the engine check walks all accounts.
"""
import os
import sys
from collections import Counter

sys.path.insert(0, os.getcwd())
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from clementiq.auth import Principal  # noqa: E402
from clementiq.db import session_factory  # noqa: E402
from clementiq.main import app  # noqa: E402
from clementiq.routers.scenarios import judge_verify  # noqa: E402

c = TestClient(app)
login = c.post("/api/auth/demo-login", json={"role": "judge", "access_code": "tangerine-judge"})
J = {"Authorization": "Bearer " + login.json()["access_token"]}
EI55 = [{"type": "job_loss", "income_replacement_pct": 55, "duration_months": 6}]

print("== Card A/B: needs attention ==")
na = c.get("/api/insights/needs-attention?limit=500", headers=J).json()
items = na["items"]
print(f"flagged {na['total']} of {na['active_accounts']} active ({na['share']:.1%}); counts {na['counts']}")
nogap = [i for i in items if i["I"] >= i["S"] and i["B"] > 0]
green = [i for i in items if i["B"] > 0 and (i["S"] <= i["I"] or i["B"] >= 120 * (i["S"] - i["I"]))]
print(f"formula max 120-month runway: {len(green)} (of which no monthly gap at all: {len(nogap)}); flags {dict(Counter(f for i in green for f in i['flags']))}")
gs = [i for i in green if "short" in i["flags"]]
print(f"  of those, short this month: {len(gs)}, combined gap ${-sum(i['left_after_fixed'] for i in gs):,.0f}")
print(f"all short accounts, combined gap ${-sum(i['left_after_fixed'] for i in items if 'short' in i['flags']):,.0f}")

print("== Demo accounts ==")
for a in (95678, 20176, 37897, 21786):
    j = c.get(f"/api/accounts/{a}/summary", headers=J).json()["judging"]
    o = c.get(f"/api/accounts/{a}/obligations", headers=J).json()
    s = c.post("/api/shocks/simulate", headers=J, json={"account_id": a, "mode": "judging", "components": EI55}).json()
    print(f"{a}: runway today {j['runway']['display']} | B ${j['B']:,.0f} | month-end ${o['balance']:,.0f} | "
          f"fixed ${o['fixed_total']:,.0f} -> {o['status']} ({o['left_after_fixed']:,.0f}) | loan {(o['loan'] or {}).get('status')} | "
          f"EI-55 runway {s['scenario']['runway']['display']}")

print("== Card I: flags vs loan default (correlation only) ==")
import pandas as pd  # noqa: E402
eng = session_factory()().get_bind()
base = pd.read_sql("select account_id, spending_S, last_month from account_baselines", eng)
loans = pd.read_sql("select account_id, defaulted from loans", eng).drop_duplicates("account_id").set_index("account_id")
newest = pd.to_datetime(base["last_month"]).max()
act = base[(base.spending_S > 0) & (pd.to_datetime(base.last_month) >= newest - pd.DateOffset(months=5))]
st = {i["account_id"] for i in items if {"short", "thin"} & set(i["flags"])}  # "behind" excluded: it is a default status itself
la = act[act.account_id.isin(loans.index)].assign(defaulted=lambda d: d.account_id.map(loans["defaulted"]).astype(bool),
                                                  flagged=lambda d: d.account_id.isin(st))
for k, g in la.groupby("flagged"):
    print(f"{'short or thin' if k else 'other'} loan holders: {g.defaulted.mean():.1%} defaulted ({int(g.defaulted.sum())}/{len(g)})")

print("== Card C: engine vs README formulas ==")
db = session_factory()()
ids = [r[0] for r in db.execute(text("select account_id from account_baselines")).fetchall()]
p = Principal(sub="judge", role="judge")
checks = bad = 0
for a in ids:
    rows = judge_verify(a, p, db)["rows"]
    checks += len(rows)
    bad += sum(not r["match"] for r in rows)
print(f"{len(ids)} accounts, {checks} checks, {bad} mismatches")
