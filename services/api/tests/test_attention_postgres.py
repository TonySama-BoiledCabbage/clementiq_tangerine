"""Mixed-case baseline columns must be quoted on PostgreSQL."""
from sqlalchemy.dialects import postgresql


def test_attention_uses_portable_baseline_select(client, judge, monkeypatch):
    from clementiq.routers import insights
    statements = []
    original = insights.pd.read_sql

    def capture(statement, engine):
        statements.append(statement)
        return original(statement, engine)

    monkeypatch.setattr(insights, "_attention_cache", {})
    monkeypatch.setattr(insights.pd, "read_sql", capture)
    response = client.get("/api/insights/needs-attention?limit=25", headers=judge)
    assert response.status_code == 200
    sql = str(statements[0].compile(dialect=postgresql.dialect()))
    for name in ("income_I", "spending_S", "buffer_B", "loan_payment_P"):
        assert f'account_baselines."{name}"' in sql
