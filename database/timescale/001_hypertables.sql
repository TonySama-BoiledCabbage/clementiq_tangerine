-- ClementIQ on Tiger Data (TimescaleDB). Run AFTER `alembic upgrade head` and the CSV import:
--   python -m clementiq.cli timescale
-- Idempotent where TimescaleDB allows it. Each statement ends with ";" + newline.

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Transactions: 1.06M rows partitioned by date. Unique keys on hypertables must include the time column.
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_pkey;
ALTER TABLE transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (transaction_id, date);
SELECT create_hypertable('transactions', by_range('date', INTERVAL '3 months'), migrate_data => true, if_not_exists => true);

-- Monthly summaries partitioned by month_start.
ALTER TABLE monthly_summaries DROP CONSTRAINT IF EXISTS monthly_summaries_pkey;
ALTER TABLE monthly_summaries ADD CONSTRAINT monthly_summaries_pkey PRIMARY KEY (account_id, month, month_start);
SELECT create_hypertable('monthly_summaries', by_range('month_start', INTERVAL '1 year'), migrate_data => true, if_not_exists => true);

-- Economic indicators and market prices are native time series.
SELECT create_hypertable('economic_observations', by_range('observed_at', INTERVAL '1 year'), migrate_data => true, if_not_exists => true);
SELECT create_hypertable('market_prices', by_range('observed_at', INTERVAL '7 days'), migrate_data => true, if_not_exists => true);

-- Continuous aggregate: daily cash flow per account, maintained incrementally.
CREATE MATERIALIZED VIEW IF NOT EXISTS txn_daily
WITH (timescaledb.continuous) AS
SELECT account_id,
       time_bucket(INTERVAL '1 day', date) AS day,
       sum(CASE WHEN signed_amount > 0 THEN signed_amount ELSE 0 END) AS money_in,
       sum(CASE WHEN signed_amount < 0 THEN -signed_amount ELSE 0 END) AS money_out,
       count(*) AS txn_count
FROM transactions
GROUP BY account_id, day
WITH NO DATA;

-- Hierarchical continuous aggregate: monthly cash flow per account built on txn_daily.
CREATE MATERIALIZED VIEW IF NOT EXISTS txn_monthly
WITH (timescaledb.continuous) AS
SELECT account_id,
       time_bucket(INTERVAL '1 month', day) AS month,
       sum(money_in) AS money_in,
       sum(money_out) AS money_out,
       sum(txn_count) AS txn_count
FROM txn_daily
GROUP BY account_id, month
WITH NO DATA;

CALL refresh_continuous_aggregate('txn_daily', NULL, NULL);
CALL refresh_continuous_aggregate('txn_monthly', NULL, NULL);

SELECT add_continuous_aggregate_policy('txn_daily', start_offset => INTERVAL '3 years', end_offset => INTERVAL '1 day', schedule_interval => INTERVAL '1 hour', if_not_exists => true);
SELECT add_continuous_aggregate_policy('txn_monthly', start_offset => INTERVAL '3 years', end_offset => INTERVAL '1 month', schedule_interval => INTERVAL '6 hours', if_not_exists => true);

-- Compression for historical transaction chunks (segment by account for per-account scans).
ALTER TABLE transactions SET (timescaledb.compress, timescaledb.compress_segmentby = 'account_id', timescaledb.compress_orderby = 'date');
SELECT add_compression_policy('transactions', INTERVAL '1 year', if_not_exists => true);
