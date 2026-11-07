# Sponsor integration evidence checklist

Status as of 2026-11-07. ✅ = implemented and verified locally · 🟡 = implemented, needs credentials or deployment to verify · ⬜ = not done. No prize is assumed; this records what exists.

| Prize | What ClementIQ does | Evidence (code) | Status |
|---|---|---|---|
| **Tangerine Resilience Rewired** | Any account → I/S/F/H/B/P, runway; combinable, sizeable shocks; Goal and Backup plans; discovery dashboard | `clementiq/core/*`, `/judge`, `/insights`, `tests/test_core.py`, `tests/test_judge_fixtures.py` (engine = independent README implementation on real data) | ✅ |
| **Best Use of Gemini API** | Structured JSON output with validated schemas; function calling over 10 audited tools; optional Google Search grounding with metadata citations; dollar-figure verification; prompt-injection sanitising; outage fallback | `clementiq/ai/gemini.py`, `ai/service.py`, `ai/tools.py`, `ai/sanitize.py`, `tests/test_ai_alerts_solana.py` | 🟡 code and fallback tested; set `GEMINI_API_KEY` to verify live |
| **Best Use of Tiger Data** | Hypertables (transactions, monthly summaries, indicators, prices); `txn_daily` continuous aggregate plus hierarchical `txn_monthly`; refresh and compression policies; COPY ingestion; measured benchmark command | `database/timescale/001_hypertables.sql`, `clementiq/benchmark.py`, `ingestion/importer.py::bulk_load` | 🟡 run `cli timescale` + `cli benchmark` on Tiger Cloud; **no speedup claimed until measured** |
| **Best Use of Vultr** | Dockerfiles for api, worker and web; Compose; nginx TLS reverse proxy with rate limits; health checks; deployment runbook | `docker-compose.yml`, `*/Dockerfile`, `infrastructure/nginx/`, `docs/DEPLOYMENT.md` | 🟡 deploy to a Vultr instance and record the URL |
| **Best Use of Solana** | Wallet Adapter; consent-gated read-only RPC (balance, SPL/Token-2022 tokens, history); crypto shock simulator; **Devnet goal commitment**: salted SHA-256 via SPL Memo, signed by the user's wallet, verified server-side with `getTransaction`; explorer link; no keys stored | `apps/web/src/components/invest/SolanaApp.tsx`, `clementiq/solana/*`, `routers/solana.py` | 🟡 unit-tested; Devnet signing needs a browser wallet |
| **Best Use of Snowflake API** | Cortex REST `inference:complete` adapter giving an independent narrative of the computed Insights findings (one clearly labelled feature) | `clementiq/ai/snowflake.py`, `/insights` "Ask Snowflake Cortex" | 🟡 needs `SNOWFLAKE_ACCOUNT_URL` + `SNOWFLAKE_PAT` |
| **Best Use of Entire** | See [ENTIRE.md](ENTIRE.md) | — | ⬜ the Entire CLI was not installed in the build environment; no usage is claimed |
| **GoDaddy Registry domain** | Environment-driven public URLs; DNS and HTTPS runbook | `docs/DEPLOYMENT.md §3` | ⬜ no domain registered |
| **Data Visualization & Storytelling** | Validated colour-blind-safe palette (light and dark); table views for charts; 3D digital twin and globe with 2D fallbacks; data-driven findings | `globals.css` (series tokens), `components/finance/chart-kit.tsx`, `/timeline`, `/map`, `/insights` | ✅ |

## Verified locally on 2026-11-07
- 68 backend tests passing (`pytest -q`), including the real-data judge fixtures.
- Frontend typecheck, vitest and the `next build` production build pass.
- Live retrieval succeeded from the Bank of Canada Valet API (150 observations), Statistics Canada WDS (50), the World Bank (269 observations plus 15 country geolocations) and CoinGecko. Five official "confirmed" events were generated, along with alerts for a real account. GDELT returned 429 and then TLS timeouts from the build network; this was recorded as a source error and nothing was fabricated.
