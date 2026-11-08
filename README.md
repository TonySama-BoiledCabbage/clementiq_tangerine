# ClementIQ

**Your Daily Dose of Financial Intelligence** · *Smart Guidance. A More Resilient You.*

ClementIQ is a financial resilience engine built for the **Tangerine "Resilience Rewired" track at Sheridan Datathon 2026**. It takes any `account_id` from the challenge data and works out:

1. **Know the customer.** Income, bills, fixed costs, savings buffer and months of runway, using the exact judge definitions.
2. **Take a shock.** Job loss with EI, higher rent or bills, a surprise repair, or several combined. Every size can be adjusted, and results recalculate instantly with no AI call.
3. **Make a plan.** A Goal Plan to build an emergency fund and a Backup Plan for if the shock hits, both from the customer's own numbers.

On top of that, **WorldPulse** connects official economic data and news to transparent, personal "what could this mean for me" scenarios. Investments, Solana and AI explanations each sit in their own clearly separated layer.

> The original challenge brief is preserved in [docs/TANGERINE_CHALLENGE.md](docs/TANGERINE_CHALLENGE.md).

---

## Biggest finding

Computed live on all 4,500 accounts, with method and caveats in [docs/FINDINGS.md](docs/FINDINGS.md):

- **35% of customers would run out of buffer within 6 months** if laid off with EI at 55% (median runway 8.6 months).
- **Borrowers are roughly half as likely to make it.** Only 36% of accounts with a running loan reach 6 months of EI-55% runway, against 70% of accounts with no loan (median 4.8 vs 10.2 months; n = 448 vs 3,818).
- **Loan defaults concentrate in thin-buffer accounts.** The default rate is 23% in the thinnest-buffer quartile versus 5% in the thickest (n = 682). Buffers are measured at the end of the data, so causality could run either way.
- **The best modeled lever is saving one extra month of spending.** It adds a median 2.4 months of runway and lifts 839 accounts over the 6-month line. Cutting discretionary spending by 10% adds a median 1.4 months and lifts 329.

These are associations in observational data, not causal effects.

---

## Two engines

| | **Clement Core** | **Clement Gemini** |
|---|---|---|
| Role | The numerical brain | The explanation and research brain |
| Tech | Python, pandas, NumPy, scikit-learn | Google Gemini API (structured JSON, function calling, optional Search grounding) |
| Does | Metrics, runway, shocks, plans, exposure modeling, portfolio stress, resilience score, anomalies, alert relevance | Explains results, summarises sourced news, answers questions using server-side tools |
| Guarantees | Deterministic. The same inputs always give the same outputs (input hash), and every number carries its formula, inputs, assumptions and provenance | Never computes authoritative numbers. Every `$` figure it writes is checked against Clement Core output, and if one doesn't match, a deterministic template is used instead |
| Without network | Fully works | Falls back to deterministic templates, and the UI shows which engine produced each result |

## Judge definitions (Judging Mode)

These come from `monthly_summary.csv`, exactly as the README defines them:

```
I = median(money_in)        S = median(money_out)        H = median(household_bills)
F = median(household_bills + insurance + loan_payments)
B = mean(avg_daily_balance over the last 6 rows sorted by month)
P = loans.monthly_payment if status ∈ {C, D} (running at 2025-12-31) else 0
runway = 0 if B − one_off ≤ 0 · "no shortfall (120+)" if gap ≤ 0 · else min((B − one_off)/gap, 120)
```

Runway is rounded to 1 decimal for display only; the backend keeps full precision. `GET /api/judge/verify/{account_id}` recomputes the three README twist cards independently and compares them with the simulator. A test also compares the engine against fixtures produced by a separate pandas implementation on the real data.

---

## Quick start (VS Code, Windows / macOS / Linux)

Prerequisites: **Python 3.12+** and **Node 22+**. Docker is optional.

```bash
# 1. Backend
cd services/api
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt        # macOS/Linux: .venv/bin/pip
cp ../../.env.example ../../.env                          # optional: add GEMINI_API_KEY

# 2. Data: decompress transactions (kept gzipped because GitHub caps files at 100 MB)
#    The importer also reads .csv.gz directly, so this step is optional.
python -c "import gzip,shutil;shutil.copyfileobj(gzip.open('../../data/transactions.csv.gz','rb'),open('../../data/transactions.csv','wb'))"

# 3. Migrate and import all nine CSVs (about 2–3 min on SQLite; transactions take most of it)
.venv/Scripts/python -m clementiq.cli migrate
.venv/Scripts/python -m clementiq.cli import

# 4. Frontend dependencies (repo root)
cd ../..
npm install
```

Once setup is done, **one command starts everything** (from the repo root):

```bash
npm run dev        # backend :8000 + frontend :3000 → open http://localhost:3000   (Ctrl+C stops both)
npm run dev:all    # same, plus the background monitoring worker
npm run stop       # frees ports 8000/3000 if an earlier run was left behind
```

If a port is already in use, `npm run dev` says so and tells you to run `npm run stop`. To run the pieces separately instead, use `npm run dev:web`, or start the API on its own with `.venv/Scripts/python -m uvicorn clementiq.main:app --reload --port 8000` from `services/api`.

Sign in at http://localhost:3000/login. The development access codes, which you should change in `.env`, are: judge `tangerine-judge`, customer `tangerine-customer` (plus an `account_id`), and admin `tangerine-admin`.

VS Code tasks (**Terminal → Run Task**) cover all of the above: *ClementIQ: start all* (the same as `npm run dev`), *API: run*, *Web: dev*, *Worker: run*, *Data: import CSVs* and *Tests: backend*.

### Tests

```bash
cd services/api && .venv/Scripts/python -m pytest -q        # 68 tests
npm --workspace apps/web run test                           # vitest
npm --workspace apps/web run typecheck && npm run build:web
python -m clementiq.cli fixtures                            # regenerate judge fixtures from the real data
```

### Docker / production

```bash
cp .env.example .env    # set DATABASE_URL (Tiger Data), JWT_SECRET, access codes, GEMINI_API_KEY
docker compose --profile setup run --rm migrate             # migrate + import + Tiger Data hypertables
docker compose up -d --build api worker web proxy
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Vultr, HTTPS and the custom domain.

---

## The ClementIQ Orchard (Home)

Home is a feature launcher, not a crowded dashboard. A golden-hour tangerine orchard (illustrated in layered SVG) greets you, and below it sit only the tools **you** chose, as pastel cards. Opening a card enters a focused workspace with a **Back to Home** button. There is no permanent sidebar.

- **Customize My Dashboard** (Settings): every tool has its own ON/OFF switch, with search, categories (switch a whole category at once), favorites (pinned first), drag-and-drop order, Minimal / Balanced / Compact density, a live preview, and **Enable All**, **Hide Optional Features** and **Restore Default Layout**. Changes save automatically to your account (`user_preferences`), so they persist across refreshes, sign-ins and devices, and each person keeps their own. Hiding a tool never deletes data or stops background jobs.
- **New users** start with Financial Dashboard, Shock Simulator, Recovery Plans and AI Financial Advisor (judges also get Judge Demo).
- **The orchard reflects real progress** (optional): tangerines show emergency-fund progress, golden tangerines appear at 3, 6 and 9 months saved, the canopy follows the resilience score, and positive cash flow warms the light. It never wilts on setbacks.
- **Profile photo and orchard avatar**: upload a photo (validated, re-encoded, metadata stripped, private to you). With explicit consent, Gemini's image model can turn it into a stylised character who replaces the default one in the orchard. If generation fails, the default character stays.
- **Appearance**: light, dark or system theme; orchard, money trees, floating coins and animations on/off; animation intensity; reduced motion. A photorealistic orchard is used if you add your own image at `apps/web/public/orchard/photo.jpg`.
- **Privacy & AI**: turning off personalized AI guidance means nothing about you is sent to Gemini; template explanations are used instead.

## Features at a glance

| Area | Where | Notes |
|---|---|---|
| Overview and Financial Dashboard | `/`, `/dashboard` | Metric cards with formula and provenance dialogs, quarter, 6-month and year ranges, monthly or quarterly granularity, net account position (explicitly *not* net worth), anomalies, trend projection, paginated transactions |
| Shock Simulator | `/simulator` | 11 shock types, freely combined; Judging versus Extended mode (EI weekly cap, post-EI income, estimated allocations); presets from the twist cards; saved scenarios; balance projection |
| Recovery Plans | `/recovery` | Goal Plan (target, gap, contribution, milestones, deadline check, reductions) and Backup Plan (actions checklist, priority expenses, alternatives, savings drawdown) |
| WorldPulse | `/worldpulse` | Bank of Canada Valet, Statistics Canada WDS, World Bank, GDELT and optional NewsAPI. Official data releases become *confirmed* events; news is classified as reported, forecast or opinion. Low/medium/high pass-through impact simulator, and Gemini research with Search grounding |
| Global Event Map | `/map` | 3D globe (React Three Fiber) with a 2D fallback. Coordinates come only from the World Bank country API |
| Investments | `/investments` | User, hypothetical or labelled demo holdings; Stooq, CoinGecko and optional Alpha Vantage prices with timestamps; allocation, concentration, stress tests, optional "sell to cover" |
| Solana | `/solana` | Wallet Adapter; read-only RPC analysis after explicit consent; crypto shock simulator; **Devnet goal commitment**, where a salted SHA-256 hash is written via the SPL Memo program from the user's own wallet and verified server-side |
| AI Advisor | right panel and `/advisor` | Gemini function calling over 10 audited, authorized tools; answers labelled `[record]`, `[calculated]`, `[retrieved]`, `[interpretation]` or `[hypothetical]`; citations |
| Resilience Score | `/resilience` | Explainable 0–100 score with six weighted components, percentile and history; demographics are never used |
| Timeline and Digital Twin | `/timeline` | 3D balance bars (history plus shock projection), timeline scrubber, hover and click, 2D fallback |
| Alerts | bell and `/alerts` | Deterministic relevance score (seven factors), idempotent dedup keys, preferences, quiet hours, daily caps, opt-in email and browser notifications, generation audit log |
| Insights | `/insights` | Data-science findings with n, bootstrap CIs, cross-validated AUC and limitations; optional Snowflake Cortex second opinion |
| Judge Demo | `/judge` | Account, baseline, twist, new runway, Goal Plan, Backup Plan and explanation on one screen, with a reference check |
| Data Import | `/admin` | Per-dataset ingestion report: rows, duplicates, orphans, invalid dates, currency fixes, consistency checks |

## Repository layout

```
apps/web/              Next.js 16 App Router · Tailwind 4 · shadcn-style UI · Recharts · TanStack Query · Zustand · RHF+Zod · R3F
packages/shared-types/ Shared TypeScript types + Zod schemas
services/api/          FastAPI · SQLAlchemy · Alembic · Clement Core (clementiq/core) · Clement Gemini (clementiq/ai)
services/worker/       APScheduler monitoring worker (WorldPulse, markets, alerts)
database/              Tiger Data hypertables & continuous aggregates, migration notes
data/                  The nine Tangerine CSVs (transactions gzipped), data/processed for local SQLite
docs/                  Architecture, deployment, demo script, findings, sponsors, sources, Entire
infrastructure/        nginx reverse proxy
tests/fixtures/        Judge-twist fixtures derived from the README formulas
```

## Responsible use

ClementIQ is educational decision support, not financial advice. It never executes trades or moves money, never asks for seed phrases, and sends only rounded aggregates to external AI (no account IDs or demographics). Retrieved news is treated as untrusted data and sanitised against prompt injection. WorldPulse explains economic transmission mechanisms without political judgment. The resilience score is not a credit score or a Tangerine rating, and the branding is original and not affiliated with Tangerine Bank.

## Credits and sources

- **PKDD'99 Discovery Challenge Financial dataset** (real anonymized bank data), CTU Prague Relational Dataset Repository: https://relational.fel.cvut.cz/dataset/Financial
- Statistics Canada, Bank of Canada, Government of Canada (EI), the World Bank, GDELT and CoinGecko. The full list is in [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).
