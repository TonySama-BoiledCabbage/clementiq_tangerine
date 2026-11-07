import pandas as pd
import pytest
from sqlalchemy import select, text

from clementiq.ingestion.importer import clean_dataset, parse_money
from clementiq.ingestion.schemas import SCHEMA_BY_NAME


def test_parse_money_handles_currency_formatting():
    vals, n = parse_money(pd.Series(["$1,234.50", "(200)", "CAD 10", "15.25", None]))
    assert vals.tolist()[:4] == [1234.5, -200.0, 10.0, 15.25]
    assert pd.isna(vals.iloc[4])
    assert n == 3


def test_schema_validation_rejects_missing_columns():
    df = pd.DataFrame({"account_id": ["1"], "district_id": ["1"]})
    with pytest.raises(ValueError, match="missing required columns"):
        clean_dataset(SCHEMA_BY_NAME["accounts"], df, {})


def test_clean_counts_invalid_dates_and_duplicates():
    df = pd.DataFrame({"account_id": ["1", "1", "2"], "district_id": ["1", "1", "1"],
                       "frequency": ["m", "m", "m"], "account_opened": ["bad", "2023-01-01", "2023-01-02"]})
    out, rep = clean_dataset(SCHEMA_BY_NAME["accounts"], df, {"districts": {1}})
    assert rep["invalid_dates"]["account_opened"] == 1
    assert rep["duplicates_dropped"] == 1
    assert len(out) == 2


def test_orphans_dropped():
    df = pd.DataFrame({"disposition_id": ["1", "2"], "client_id": ["5", "999"], "account_id": ["7", "7"], "type": ["owner", "owner"]})
    out, rep = clean_dataset(SCHEMA_BY_NAME["dispositions"], df, {"clients": {5}, "accounts": {7}})
    assert rep["orphans_dropped"] == {"client_id": 1}
    assert out.disposition_id.tolist() == [1]


def test_full_import_report(imported):
    ds = imported["datasets"]
    assert all(v["status"] == "loaded" for v in ds.values()), ds
    assert ds["accounts"]["rows"] == 3          # duplicate 1003 removed
    assert ds["dispositions"]["rows"] == 4      # orphan client removed
    assert ds["transactions"]["rows"] == 3      # orphan account removed
    assert imported["derived"]["account_baselines"] == 3


def test_relationships(imported):
    rel = imported["derived"]["relationships"]
    assert rel["accounts_with_multiple_clients"] == 1     # 1001 has owner + authorized user
    assert rel["accounts_with_loan"] == 2


def test_raw_values_preserved(imported):
    from clementiq.db import session_factory
    from clementiq import models
    with session_factory()() as db:
        loan = db.execute(select(models.Loan).where(models.Loan.loan_id == 31)).scalar_one()
        assert loan.amount == 7200.0 and loan.status == "C"
        tx = db.get(models.Transaction, 52)
        assert tx.partner_account == "0123"  # leading zero kept: read as text
        n = db.execute(text("SELECT COUNT(*) FROM monthly_summaries WHERE account_id=1001")).scalar()
        assert n == 8
