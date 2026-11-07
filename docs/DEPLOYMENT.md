# Deployment: Vultr + Tiger Data + custom domain

## 1. Tiger Data (database)

1. Create a service at https://console.cloud.timescale.com (Tiger Cloud). Copy the connection string.
2. Set it in `.env`:
   `DATABASE_URL=postgresql+psycopg://tsdbadmin:<pw>@<host>:<port>/tsdb?sslmode=require`
3. From a machine with the repo and data:
   ```bash
   cd services/api
   python -m clementiq.cli migrate      # Alembic schema
   python -m clementiq.cli import       # nine CSVs via PostgreSQL COPY
   python -m clementiq.cli timescale    # hypertables + continuous aggregates + policies
   python -m clementiq.cli benchmark    # measured timings → docs/benchmarks/tiger_data_benchmark.json
   ```
   The benchmark compares raw `transactions` aggregation against the `txn_daily` and `txn_monthly` continuous aggregates. **Report only the numbers it writes.** No performance figure is claimed until the benchmark has been run on the deployed service.

For a self-hosted alternative, run `docker compose --profile local-db up -d db` (the TimescaleDB image) and point `DATABASE_URL` at `db:5432`.

## 2. Vultr (application hosting)

1. Create a Vultr Cloud Compute instance: Ubuntu 24.04, at least 2 vCPU and 4 GB RAM (the Next.js build needs memory). Add your SSH key.
2. Firewall: allow 22, 80 and 443.
3. On the server:
   ```bash
   curl -fsSL https://get.docker.com | sh
   git clone https://github.com/emanbutt8991-dotcom/clementiq_tangerine.git && cd clementiq_tangerine
   cp .env.example .env && nano .env       # CLEMENTIQ_ENV=production, DATABASE_URL, JWT_SECRET (openssl rand -hex 32),
                                           # new access codes, GEMINI_API_KEY, PUBLIC_WEB_URL, CORS_ORIGINS
   cp infrastructure/nginx/clementiq.http-only.conf infrastructure/nginx/active.conf
   ```
4. First boot over HTTP, before certificates exist. Point the proxy volume at the http-only config by setting `- ./infrastructure/nginx/active.conf:/etc/nginx/conf.d/default.conf:ro` in `docker-compose.yml`, then:
   ```bash
   docker compose --profile setup run --rm migrate   # only if the DB was not already loaded
   docker compose up -d --build api worker web proxy
   curl http://<server-ip>/api/health
   ```
5. The worker container runs scheduled WorldPulse, market and alert jobs. The UI shows "Continuous monitoring is running" when its heartbeat is fresh.

Logging is production-safe: tokens and API keys are redacted by the API log filter, and secrets live only in `.env` (git-ignored).

## 3. Custom domain (e.g. GoDaddy Registry)

ClementIQ does **not** assume any domain is registered. Once you own one, for example a `clementiq` name:

1. In the registrar's DNS settings, add an `A` record for `@` and an `A` record for `www`, both pointing to the Vultr IPv4. Add an `AAAA` record if you use IPv6.
2. Set `PUBLIC_WEB_URL=https://yourdomain` and `CORS_ORIGINS=https://yourdomain` in `.env`.
3. Issue certificates with certbot webroot:
   ```bash
   docker run --rm -v clementiq_certbot-www:/var/www/certbot -v $(pwd)/infrastructure/certs-le:/etc/letsencrypt \
     certbot/certbot certonly --webroot -w /var/www/certbot -d yourdomain -d www.yourdomain --agree-tos -m you@example.com
   cp infrastructure/certs-le/live/yourdomain/{fullchain,privkey}.pem infrastructure/certs/
   ```
4. Switch the proxy back to `infrastructure/nginx/clementiq.conf` (TLS, HSTS, rate limits) and run `docker compose up -d proxy`.
5. Renew certificates every 60–90 days by re-running the certbot command and restarting the proxy (cron is fine).

## 4. Development vs production

| Setting | Development | Production |
|---|---|---|
| `CLEMENTIQ_ENV` | development | production (refuses to start with the default `JWT_SECRET`) |
| Database | SQLite file in `data/processed` | Tiger Data / PostgreSQL |
| Schema | auto `create_all` on SQLite | `alembic upgrade head` (`cli migrate`) |
| Access codes | defaults in `.env.example` | unique secrets |
| `NEXT_PUBLIC_SHOW_DEMO_CODES` | true | false |
| TLS | none | nginx and Let's Encrypt |
