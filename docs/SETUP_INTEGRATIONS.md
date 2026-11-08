# Setting up the integrations: Gemini, Solana, Snowflake, Tiger Data, Vultr

This guide gets each sponsor integration working and shows how to test it. Do the steps in order: section 0 first, then any of sections 1–5. Each section ends with a **Test it** step.

Commands are written for Windows PowerShell; the macOS/Linux equivalents are in brackets.

---

## 0. One-time setup (do this first)

1. Get the code:
   ```powershell
   git clone -b branch_eman_v2 https://github.com/emanbutt8991-dotcom/clementiq_tangerine.git
   cd clementiq_tangerine
   ```
2. Install the backend:
   ```powershell
   cd services/api
   python -m venv .venv
   .venv\Scripts\pip install -r requirements-dev.txt        # [.venv/bin/pip ...]
   .venv\Scripts\python -m clementiq.cli migrate             # creates the database tables
   .venv\Scripts\python -m clementiq.cli import              # loads the bank CSVs from /data (takes a few minutes)
   cd ../..
   ```
3. Install the frontend: `npm install` (in the repo root).
4. Create your settings file. All keys go in **one file: `.env` in the repo root**.
   ```powershell
   copy .env.example .env        # [cp .env.example .env]
   ```
   `.env` is git-ignored, so keys never go to GitHub. Never paste keys into code files.
5. Start everything: `npm run dev`. Open http://localhost:3000 and sign in with the judge code `tangerine-judge`. Stop with `npm run stop`.
6. **Check status any time:** open http://localhost:8000/api/health. Under `engines` it shows whether Gemini and Snowflake are `enabled`, and under `database` whether you're on `sqlite` or `postgresql`.

> After changing `.env`, always restart: `npm run stop`, then `npm run dev`.

---

## 1. Gemini API (AI explanations, advisor chat, AI avatar)

**What it powers:** "Explain" cards on every page, the AI Financial Advisor chat, alert summaries, WorldPulse research and the AI-illustrated orchard character. Gemini never calculates the money figures; it explains numbers that the app already calculated, and every dollar amount it writes is checked against them.

**Steps**
1. Go to https://aistudio.google.com, sign in, then click **Get API key** → **Create API key**. Copy it.
2. In `.env`:
   ```
   GEMINI_API_KEY=paste-your-key
   GEMINI_MODEL=gemini-flash-latest
   GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
   GEMINI_GROUNDING=false
   ```
   `GEMINI_GROUNDING=true` turns on Google Search for WorldPulse research. Leave it `false` unless you need it, because Google may charge for it.
3. Restart the app.

**Test it**
- http://localhost:8000/api/health shows `"clement_gemini": "enabled"` (it says `fallback-templates` when the key is missing).
- Open **AI Financial Advisor** on Home, pick an account (e.g. 1001) and ask "Why is my runway short?". The answer should be labelled Gemini, not template.
- On the **Financial Dashboard**, click an AI explanation card. It should say it came from Gemini.
- **AI avatar:** go to **My Profile** → upload a photo → **AI-illustrated character**, tick consent and generate. It should stop saying "Not available on this server".
- If something fails, the app quietly falls back to templates. Check the terminal running `npm run dev` for the Gemini error, which is usually a wrong key or a quota limit.

---

## 2. Solana (wallet insights + savings goals on Devnet)

**What it powers:** a read-only wallet view (balance, tokens, history), a crypto crash simulator, and savings-goal commitments recorded on Solana Devnet. The app never holds private keys; your wallet signs.

**Steps**
1. No `.env` key is needed. The public RPC addresses are already in `.env.example`:
   ```
   SOLANA_MAINNET_RPC=https://api.mainnet-beta.solana.com
   SOLANA_DEVNET_RPC=https://api.devnet.solana.com
   ```
   Optional: if the public RPC is slow or rate-limited, use a free Helius or QuickNode RPC URL here instead.
2. Install the **Phantom** browser extension (https://phantom.app) and create a wallet.
3. In Phantom: **Settings → Developer Settings → Testnet mode ON → choose Solana Devnet**.
4. The Solana page is hidden by default. In the app: **Settings → Customize Dashboard → turn on "Solana Portfolio"**. It now appears on Home.

**Test it**
- **Wallet view:** open **Solana Portfolio**, set the network to **Devnet**, click **Select Wallet** (or paste any public address), tick the consent box, then click **Analyse wallet**. You should see the balance and recent transactions.
- **Crash simulator:** enter hypothetical crypto holdings and a price change. Runway updates instantly.
- **Goal on-chain (the main demo):**
  1. In "Commit to a savings goal on Solana Devnet", type a goal name and click **Create goal**.
  2. Click **Request 0.2 devnet SOL** for free test fees. If it fails, use https://faucet.solana.com.
  3. Click **Sign & record on Devnet** and approve in Phantom.
  4. The goal should show **On-chain verified**. Click **View on Solana Explorer** to see the transaction.
- Only a salted hash goes on-chain; the goal details stay private.

---

## 3. Snowflake API (Cortex second opinion on Insights)

**What it powers:** an **Ask Snowflake Cortex** button on the Insights page that gives an independent written review of the findings.

**Steps**
1. Sign up for the student trial (120 days) at https://signup.snowflake.com. Choose a cloud region that supports Cortex, for example AWS US West (Oregon) or AWS US East.
2. Find your **account URL**: in Snowsight, click your name (bottom left) → **Account** → copy the account URL. It looks like `https://abc12345.us-east-1.snowflakecomputing.com` or `https://myorg-myaccount.snowflakecomputing.com`.
3. Create a **programmatic access token (PAT)**: your name → **Settings → Authentication → Programmatic access tokens → Generate new token**. Copy it now; it is shown only once.
   - If PAT creation complains about a network policy, run this in a worksheet as ACCOUNTADMIN (trial accounts only):
     ```sql
     CREATE NETWORK POLICY allow_all ALLOWED_IP_LIST = ('0.0.0.0/0');
     ALTER USER <your_user> SET NETWORK_POLICY = allow_all;
     ```
4. Make sure your user can use Cortex (run in a worksheet as ACCOUNTADMIN):
   ```sql
   GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE PUBLIC;
   ```
5. In `.env`:
   ```
   SNOWFLAKE_ACCOUNT_URL=https://your-account.snowflakecomputing.com
   SNOWFLAKE_PAT=paste-your-token
   SNOWFLAKE_MODEL=mistral-large2
   ```
   If your region doesn't have `mistral-large2`, try `llama3.1-70b` or `claude-3-5-sonnet`.
6. Restart the app.

**Test it**
- http://localhost:8000/api/health shows `"snowflake": "enabled"`.
- Open **Insights** → click **Ask Snowflake Cortex**. A short review should appear, labelled Snowflake Cortex with the model name.
- An error message means:
  - **HTTP 401:** the token is wrong or expired.
  - **HTTP 400/404 mentioning the model:** your region doesn't have that model; change `SNOWFLAKE_MODEL`.
  - **network error:** the account URL is wrong.

---

## 4. Tiger Data (TimescaleDB database)

**What it powers:** replaces the local SQLite file with Tiger Cloud (PostgreSQL + TimescaleDB). Adds time-series tables, pre-computed daily and monthly summaries, compression, and a speed benchmark.

**Steps**
1. Sign up at https://console.cloud.timescale.com and create a service (the free tier is fine). Download or copy the connection details.
2. The connection string looks like `postgres://tsdbadmin:PASSWORD@HOST:PORT/tsdb?sslmode=require`. **Change the start to `postgresql+psycopg://`** and put it in `.env`:
   ```
   DATABASE_URL=postgresql+psycopg://tsdbadmin:PASSWORD@HOST:PORT/tsdb?sslmode=require
   ```
3. Load the database (from `services/api`):
   ```powershell
   .venv\Scripts\python -m clementiq.cli migrate      # tables
   .venv\Scripts\python -m clementiq.cli import       # loads all CSVs with fast COPY (several minutes)
   .venv\Scripts\python -m clementiq.cli timescale    # hypertables, continuous aggregates, compression
   .venv\Scripts\python -m clementiq.cli benchmark    # measures query speed
   ```
4. Restart the app.

**Test it**
- http://localhost:8000/api/health shows `"dialect": "postgresql"` and an `accounts` count above 0.
- Open the app and check any account's dashboard. It should show the same numbers as before.
- The benchmark writes real timings to `docs/benchmarks/tiger_data_benchmark.json`, comparing raw queries against the continuous aggregates. **Only quote these measured numbers in the submission.**
- To switch back to local SQLite, delete or comment out the `DATABASE_URL` line and restart.

---

## 5. Vultr (hosting the app online)

**What it powers:** a public URL for the demo. The repo already has Docker files, an nginx proxy and a background worker.

**Before you start:** the server clones the code from GitHub, so the latest code must be pushed to the branch you clone.

**Steps**
1. Sign up at https://www.vultr.com and claim the hackathon credits.
2. **Deploy → Cloud Compute**: Ubuntu 24.04, **at least 2 vCPU / 4 GB RAM** (the frontend build needs the memory). Add your SSH key. Note the server's IP address.
3. Firewall: allow ports 22, 80 and 443.
4. SSH in (`ssh root@SERVER_IP`) and run:
   ```bash
   curl -fsSL https://get.docker.com | sh
   git clone -b branch_eman_v2 https://github.com/emanbutt8991-dotcom/clementiq_tangerine.git
   cd clementiq_tangerine
   cp .env.example .env && nano .env
   ```
5. In the server's `.env`, set at least:
   ```
   CLEMENTIQ_ENV=production
   JWT_SECRET=<run: openssl rand -hex 32>
   JUDGE_ACCESS_CODE=<new secret code>
   DEMO_CUSTOMER_ACCESS_CODE=<new secret code>
   ADMIN_ACCESS_CODE=<new secret code>
   DATABASE_URL=<your Tiger Data string from section 4>
   GEMINI_API_KEY=<key>
   PUBLIC_WEB_URL=http://SERVER_IP
   CORS_ORIGINS=http://SERVER_IP
   NEXT_PUBLIC_SHOW_DEMO_CODES=false
   ```
   Production refuses to start with the default `JWT_SECRET`, and the default access codes must be changed.
6. First start over plain HTTP (there's no HTTPS certificate yet):
   ```bash
   cp infrastructure/nginx/clementiq.http-only.conf infrastructure/nginx/active.conf
   ```
   Edit `docker-compose.yml`: in the `proxy` service, change the volume line to
   `- ./infrastructure/nginx/active.conf:/etc/nginx/conf.d/default.conf:ro`
7. Build and start:
   ```bash
   docker compose --profile setup run --rm migrate    # skip if Tiger Data was already loaded in section 4
   docker compose up -d --build api worker web proxy
   ```

**Test it**
- `curl http://SERVER_IP/api/health` returns `"status": "ok"`.
- Open `http://SERVER_IP` in a browser and sign in with your new judge code.
- `docker compose logs -f api` shows backend logs if something fails.
- Optional HTTPS and custom domain (GoDaddy Registry): see `docs/DEPLOYMENT.md` section 3.

---

## Quick troubleshooting

| Problem | Fix |
|---|---|
| Changes to `.env` do nothing | Restart: `npm run stop`, then `npm run dev`. Make sure `.env` is in the repo root, not in `services/api`. |
| Port already in use | Run `npm run stop`, or close the other terminal running the app. |
| "Invalid access code" | Use the codes in your `.env` (default judge code: `tangerine-judge`). |
| Health shows `fallback-templates` | The Gemini key is missing or empty in `.env`. |
| Solana airdrop fails | The Devnet faucet is rate-limited. Use https://faucet.solana.com or wait a minute. |
| Tiger Data import is slow | It is normal for `transactions` (about 1 million rows) to take several minutes. |

**Never commit `.env` or paste API keys into chat, code, issues or screenshots.**
