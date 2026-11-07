"""Market data adapters: CoinGecko (crypto, no key), Stooq (equities/ETFs, no key), Alpha Vantage (optional)."""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from ...config import get_settings
from .base import Quote, client

COINGECKO_IDS = {"SOL": "solana", "BTC": "bitcoin", "ETH": "ethereum", "USDC": "usd-coin", "BONK": "bonk", "JUP": "jupiter-exchange-solana"}


class CoinGeckoAdapter:
    name = "coingecko"
    URL = "https://api.coingecko.com/api/v3/simple/price"

    def fetch(self, symbols: list[str] | None = None) -> list[Quote]:
        syms = [s for s in (symbols or list(COINGECKO_IDS)) if s in COINGECKO_IDS]
        ids = ",".join(COINGECKO_IDS[s] for s in syms)
        with client() as c:
            r = c.get(self.URL, params={"ids": ids, "vs_currencies": "cad", "include_24hr_change": "true",
                                        "include_last_updated_at": "true"})
            r.raise_for_status()
            data = r.json()
        out = []
        for s in syms:
            d = data.get(COINGECKO_IDS[s])
            if not d or "cad" not in d:
                continue
            ts = datetime.fromtimestamp(d.get("last_updated_at", datetime.now().timestamp()), tz=timezone.utc)
            out.append(Quote(s, float(d["cad"]), "CAD", ts, self.name, d.get("cad_24h_change")))
        return out


def _stooq_symbol(sym: str) -> str:
    """US tickers map to `<sym>.us`; other suffixes (e.g. TSX `.to`) are passed through and simply
    return no quote if Stooq lacks coverage — the holding then shows 'price unavailable'."""
    s = sym.lower()
    return s if "." in s else f"{s}.us"


class StooqAdapter:
    name = "stooq"
    URL = "https://stooq.com/q/l/"

    def fetch(self, symbols: list[str]) -> list[Quote]:
        out = []
        with client() as c:
            for sym in symbols:
                r = c.get(self.URL, params={"s": _stooq_symbol(sym), "f": "sd2t2ohlcv", "h": "", "e": "csv"})
                if r.status_code != 200:
                    continue
                rows = list(csv.DictReader(io.StringIO(r.text)))
                if not rows or rows[0].get("Close") in (None, "", "N/D"):
                    continue
                row = rows[0]
                try:
                    ts = datetime.fromisoformat(f"{row['Date']}T{row['Time']}").replace(tzinfo=timezone.utc)
                    out.append(Quote(sym.upper(), float(row["Close"]), "USD" if not sym.upper().endswith(".TO") else "CAD",
                                     ts, self.name))
                except (KeyError, ValueError):
                    continue
        return out


class AlphaVantageAdapter:
    name = "alpha_vantage"
    URL = "https://www.alphavantage.co/query"

    def fetch(self, symbols: list[str]) -> list[Quote]:
        key = get_settings().alpha_vantage_key
        if not key:
            raise RuntimeError("ALPHA_VANTAGE_KEY not configured")
        out = []
        with client() as c:
            for sym in symbols[:5]:  # free tier is heavily rate limited
                r = c.get(self.URL, params={"function": "GLOBAL_QUOTE", "symbol": sym, "apikey": key})
                q = r.json().get("Global Quote") or {}
                if not q.get("05. price"):
                    continue
                pct = q.get("10. change percent", "").rstrip("%")
                out.append(Quote(sym.upper(), float(q["05. price"]), "CAD" if sym.upper().endswith(".TO") else "USD",
                                 datetime.fromisoformat(q["07. latest trading day"]).replace(tzinfo=timezone.utc),
                                 self.name, float(pct) if pct else None))
        return out
