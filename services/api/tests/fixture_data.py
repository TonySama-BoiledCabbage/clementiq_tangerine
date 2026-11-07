"""Tiny deterministic TEST-ONLY dataset in the Tangerine CSV format.

Used to unit/integration-test ingestion and calculations with hand-checkable numbers. These rows are
synthetic test fixtures and are never loaded into the application database.
"""
from __future__ import annotations

from pathlib import Path

MS_HEADER = ("account_id,month,money_in,money_out,cash_deposits,transfers_in,pension_in,interest_in,household_bills,"
             "insurance,loan_payments,bank_fees,cash_withdrawals_genuine,card_withdrawals,transfers_out_other,"
             "month_end_balance,min_balance,avg_daily_balance,days_below_zero")


def _ms_row(acc, month, mi, mo, hb, ins, lp, fees, cash, card, other, bal, adb, dbz=0):
    return (f"{acc},{month},{mi},{mo},{mi},0,0,0,{hb},{ins},{lp},{fees},{cash},{card},{other},"
            f"{bal},{min(bal, adb)},{adb},{dbz}")


def write_dataset(d: Path) -> Path:
    d.mkdir(parents=True, exist_ok=True)
    (d / "districts.csv").write_text(
        "district_id,district_name,region,inhabitants,municipalities_under_500,municipalities_500_1999,"
        "municipalities_2000_9999,municipalities_over_10000,num_cities,urban_ratio_pct,average_salary,"
        "unemployment_rate_2022,unemployment_rate_2023,entrepreneurs_per_1000,crimes_2022,crimes_2023\n"
        "1,Alpha,North,1000,0,0,0,1,1,100.0,5000.0,1.0,1.2,100,50,60\n"
        "2,Beta,South,2000,5,2,1,0,2,50.0,4000.0,,2.5,90,,40\n", encoding="utf-8")
    (d / "accounts.csv").write_text(
        "account_id,district_id,frequency,account_opened\n"
        "1001,1,monthly statement,2023-01-15\n"
        "1002,2,weekly statement,2023-02-01\n"
        "1003,1,monthly statement,not-a-date\n"
        "1003,1,monthly statement,2023-03-01\n", encoding="utf-8")  # duplicate PK row + invalid date
    (d / "clients.csv").write_text(
        "client_id,gender,birth_date,district_id\n"
        "1,F,1980-01-01,1\n2,M,1975-05-05,2\n3,F,1990-09-09,1\n4,M,1999-12-12,2\n", encoding="utf-8")
    (d / "dispositions.csv").write_text(
        "disposition_id,client_id,account_id,type\n"
        "11,1,1001,owner\n12,2,1001,authorized user\n13,3,1002,owner\n14,4,1003,owner\n"
        "15,999,1003,owner\n", encoding="utf-8")  # orphan client 999
    (d / "cards.csv").write_text("card_id,disposition_id,card_type,issued\n21,11,classic,2023-06-01\n", encoding="utf-8")
    (d / "loans.csv").write_text(
        "loan_id,account_id,loan_start,amount,duration_months,monthly_payment,status,status_meaning,defaulted\n"
        "31,1001,2025-01-01,\"$7,200.00\",24,300.0,C,\"running, OK so far\",0\n"
        "32,1002,2023-01-01,1200.0,12,100.0,A,\"finished, repaid\",0\n", encoding="utf-8")
    (d / "standing_orders.csv").write_text(
        "order_id,account_id,to_bank,to_account,amount,purpose\n41,1001,AB,123,300.0,loan payment\n"
        "42,1002,CD,456,1000.0,household bills\n", encoding="utf-8")
    rows = [MS_HEADER]
    # 1001: 8 months. money_in 3000 each; money_out 2500 except one 4000 spike; buffer rows designed.
    adb_1001 = [5000, 5200, 5400, 5600, 5800, 6000, 6200, 6400]
    for i, adb in enumerate(adb_1001):
        out = 4000 if i == 3 else 2500
        rows.append(_ms_row(1001, f"2025-{i + 1:02d}", 3000, out, 1000, 100, 300, 10, out - 1410, 0, 0, adb, adb))
    rows.append(_ms_row(1001, "2025-08", 3000, 2500, 1000, 100, 300, 10, 1090, 0, 0, 6400, 6400))  # duplicate month
    # 1002: shortfall account. money_in 2000, money_out 2600, buffer 1200 average.
    for i in range(7):
        rows.append(_ms_row(1002, f"2025-{i + 1:02d}", 2000, 2600, 1000, 0, 0, 0, 1600, 0, 0, 1200, 1200))
    # 1003: only 4 months, negative buffer.
    for i in range(4):
        rows.append(_ms_row(1003, f"2025-{i + 1:02d}", 1000, 900, 0, 0, 0, 0, 900, 0, 0, -300, -300, 5))
    (d / "monthly_summary.csv").write_text("\n".join(rows) + "\n", encoding="utf-8")
    (d / "transactions.csv").write_text(
        "transaction_id,account_id,date,direction,operation,purpose,amount,signed_amount,balance,partner_bank,partner_account\n"
        "51,1001,2025-01-02,credit (money in),cash deposit,,3000.0,3000.0,3000.0,,\n"
        "52,1001,2025-01-05,debit (money out),transfer out to another bank,household bills,1000.0,-1000.0,2000.0,AB,0123\n"
        "53,1002,2025-01-03,credit (money in),cash deposit,,2000.0,2000.0,2000.0,,\n"
        "54,4242,2025-01-03,credit (money in),cash deposit,,5.0,5.0,5.0,,\n", encoding="utf-8")  # orphan account
    return d
