# Architecture & data flow

```
        Browser (Next.js 16, App Router)
           │  same-origin /api/* (Next rewrite → FastAPI; nginx in production)
           ▼
   ┌──────────────────── FastAPI (services/api/clementiq) ────────────────────┐
   │ auth.py (JWT roles: judge / customer / admin) · ratelimit.py · audit log  │
   │                                                                           │
   │ routers/ ──► repository.py ──► SQLAlchemy ──► SQLite (dev) / Tiger Data   │
   │    │                                                                      │
   │    ├─► core/   CLEMENT CORE (deterministic)                               │
   │    │     metrics · runway · shocks · recovery · resilience · exposure     │
   │    │     portfolio · analytics (anomalies, trends, forecast) · insights   │
   │    │                                                                      │
   │    ├─► ai/     CLEMENT GEMINI (explanations only)                         │
   │    │     sanitize → gemini (structured JSON / function calling /          │
   │    │     grounding) → schema validation → $-figure verification →        │
   │    │     template fallback · tools.py (audited tool layer) · snowflake.py │
   │    │                                                                      │
   │    ├─► worldpulse/ adapters (BoC, StatCan, World Bank, GDELT, NewsAPI,    │
   │    │     CoinGecko, Stooq, Alpha Vantage) → dedup → classify → store      │
   │    ├─► alerts/  candidates → relevance score → prefs → dedup → deliver    │
   │    └─► solana/  address validation · read-only RPC · goal commitments     │
   └───────────────────────────────────────────────────────────────────────────┘
           ▲
   services/worker (APScheduler) runs the same jobs on a schedule → job_runs
```

## Request examples

**Shock simulation (no AI involved):** `POST /api/shocks/simulate` → `authorize_account` → `get_baseline` (monthly rows + loans → `compute_baseline`) → `apply_shocks` → JSON containing the input hash, baseline vs scenario, effects, verdict, projection and assumptions.

**Event → personal impact:** WorldPulse stores an official CPI release as a `confirmed` NewsEvent. `POST /api/worldpulse/impact {topic: inflation, magnitude: 3.1, level: medium}` → `event_impact` applies channel pass-through (CPI × 0.8 on S) → additional spending, new surplus, and runway for the low, medium and high levels. With `explain: true`, Clement Gemini receives only the rounded results and the sanitised source text.

**Chat:** `POST /api/ai/chat` → Gemini function calling with `TOOL_DECLARATIONS` → each call goes through `ToolExecutor` (pydantic validation, account authorization, audit row) → final text → dollar-figure check against tool results → citations from `get_verified_news`. If Gemini is unavailable, `fallback_chat` routes intents to the same tools.

## Key design decisions

| Decision | Why |
|---|---|
| Numbers only from Clement Core; AI never calculates | Reproducibility and judge verification. The LLM cannot invent balances |
| Every AI `$` figure is checked against Core output | Defence in depth against hallucinated numbers; failures fall back to templates |
| Judging Mode vs Extended Mode | Judges get the README formulas exactly; Extended Mode adds clearly labelled realism (EI cap, post-EI income, allocations) |
| Estimated category allocation, always labelled | The dataset has no grocery or fuel categories, so we never present estimates as transactions |
| Pass-through tables per channel | A commodity price change is never applied one-for-one to household spending |
| Official statistics become `confirmed` events | Prefers primary sources; news is `reported`, `forecast` or `opinion` |
| Coordinates only from the World Bank API | No invented map positions |
| Idempotent dedup keys plus a UNIQUE constraint | Re-running the worker never duplicates alerts |
| SQLite in development, Tiger Data in production, behind one ORM | Zero-setup laptops; hypertables and continuous aggregates where it matters |
| Raw tables kept separate from derived tables | Original records are preserved; analytics can be recomputed |

## Database

There are 30 tables (see `services/api/clementiq/models.py` and the Alembic migration `0001`):

- **Raw:** districts, accounts, clients, dispositions, cards, loans, standing_orders, transactions, monthly_summaries.
- **Derived:** account_baselines, financial_snapshots, import_runs.
- **App:** shock_scenarios, scenario_results, recovery_plans, economic_indicators, economic_observations, news_events, market_prices, portfolio_holdings, savings_goals, solana_wallets, alerts, alert_generation_log, ai_explanations, audit_logs, user_preferences, data_source_status, country_geo, job_runs.

On Tiger Data, `database/timescale/001_hypertables.sql` converts transactions, monthly_summaries, economic_observations and market_prices into hypertables. It also creates the `txn_daily` continuous aggregate and the hierarchical `txn_monthly` aggregate, with refresh and compression policies.
