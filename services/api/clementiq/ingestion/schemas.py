"""Declarative schemas for the nine Tangerine CSV datasets."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class DatasetSchema:
    name: str
    file: str
    table: str
    primary_key: tuple[str, ...]
    ints: tuple[str, ...] = ()
    floats: tuple[str, ...] = ()
    money: tuple[str, ...] = ()
    dates: tuple[str, ...] = ()
    strings: tuple[str, ...] = ()
    required: tuple[str, ...] = ()
    nullable: tuple[str, ...] = ()
    foreign_keys: dict[str, str] = field(default_factory=dict)  # column -> "dataset.column"

    @property
    def columns(self) -> tuple[str, ...]:
        seen: list[str] = []
        for group in (self.primary_key, self.ints, self.floats, self.money, self.dates, self.strings):
            for c in group:
                if c not in seen:
                    seen.append(c)
        return tuple(seen)


MONEY_SUMMARY = (
    "money_in", "money_out", "cash_deposits", "transfers_in", "pension_in", "interest_in",
    "household_bills", "insurance", "loan_payments", "bank_fees", "cash_withdrawals_genuine",
    "card_withdrawals", "transfers_out_other", "month_end_balance", "min_balance", "avg_daily_balance",
)

SCHEMAS: list[DatasetSchema] = [
    DatasetSchema(
        "districts", "districts.csv", "districts", ("district_id",),
        ints=("inhabitants", "municipalities_under_500", "municipalities_500_1999",
              "municipalities_2000_9999", "municipalities_over_10000", "num_cities",
              "entrepreneurs_per_1000", "crimes_2022", "crimes_2023"),
        floats=("urban_ratio_pct", "unemployment_rate_2022", "unemployment_rate_2023"),
        money=("average_salary",), strings=("district_name", "region"),
        required=("district_name",),
        nullable=("unemployment_rate_2022", "crimes_2022"),  # README: district 69 missing 2022 values
    ),
    DatasetSchema(
        "accounts", "accounts.csv", "accounts", ("account_id",),
        ints=("district_id",), dates=("account_opened",), strings=("frequency",),
        foreign_keys={"district_id": "districts.district_id"},
    ),
    DatasetSchema(
        "clients", "clients.csv", "clients", ("client_id",),
        ints=("district_id",), dates=("birth_date",), strings=("gender",),
        foreign_keys={"district_id": "districts.district_id"},
    ),
    DatasetSchema(
        "dispositions", "dispositions.csv", "dispositions", ("disposition_id",),
        ints=("client_id", "account_id"), strings=("type",), required=("client_id", "account_id"),
        foreign_keys={"client_id": "clients.client_id", "account_id": "accounts.account_id"},
    ),
    DatasetSchema(
        "cards", "cards.csv", "cards", ("card_id",),
        ints=("disposition_id",), dates=("issued",), strings=("card_type",), required=("disposition_id",),
        foreign_keys={"disposition_id": "dispositions.disposition_id"},
    ),
    DatasetSchema(
        "loans", "loans.csv", "loans", ("loan_id",),
        ints=("account_id", "duration_months", "defaulted"), money=("amount", "monthly_payment"),
        dates=("loan_start",), strings=("status", "status_meaning"),
        required=("account_id", "monthly_payment", "status"),
        foreign_keys={"account_id": "accounts.account_id"},
    ),
    DatasetSchema(
        "standing_orders", "standing_orders.csv", "standing_orders", ("order_id",),
        ints=("account_id",), money=("amount",), strings=("to_bank", "to_account", "purpose"),
        required=("account_id",), foreign_keys={"account_id": "accounts.account_id"},
    ),
    DatasetSchema(
        "monthly_summary", "monthly_summary.csv", "monthly_summaries", ("account_id", "month"),
        ints=("days_below_zero",), money=MONEY_SUMMARY, strings=("month",),
        foreign_keys={"account_id": "accounts.account_id"},
    ),
    DatasetSchema(
        "transactions", "transactions.csv", "transactions", ("transaction_id",),
        ints=("account_id",), money=("amount", "signed_amount", "balance"), dates=("date",),
        strings=("direction", "operation", "purpose", "partner_bank", "partner_account"),
        required=("account_id", "date", "amount"),
        foreign_keys={"account_id": "accounts.account_id"},
    ),
]

SCHEMA_BY_NAME = {s.name: s for s in SCHEMAS}
