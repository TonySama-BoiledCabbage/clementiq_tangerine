"""Official statistics adapters: Bank of Canada Valet, Statistics Canada WDS, World Bank API."""
from __future__ import annotations

from datetime import date
from typing import Any

from .base import IndicatorSeries, Observation, client


class BankOfCanadaAdapter:
    """Bank of Canada Valet API — https://www.bankofcanada.ca/valet/docs"""

    name = "bank_of_canada"
    BASE = "https://www.bankofcanada.ca/valet/observations/{series}/json?recent={n}"
    SERIES: list[dict[str, Any]] = [
        {"code": "V39079", "name": "Target for the overnight rate", "topic": "interest_rate", "unit": "%", "n": 40},
        {"code": "FXUSDCAD", "name": "USD/CAD exchange rate", "topic": "fx", "unit": "CAD per USD", "n": 60},
        {"code": "M.BCPI", "name": "BoC commodity price index (total)", "topic": "energy", "unit": "index", "n": 25},
        {"code": "M.ENER", "name": "BoC commodity price index — energy", "topic": "energy", "unit": "index", "n": 25},
    ]

    def fetch(self) -> list[IndicatorSeries]:
        out = []
        errors = []
        with client() as c:
            for s in self.SERIES:
                try:
                    r = c.get(self.BASE.format(series=s["code"], n=s["n"]))
                    r.raise_for_status()
                    data = r.json()
                    obs = []
                    for o in data.get("observations", []):
                        v = (o.get(s["code"]) or {}).get("v")
                        if v not in (None, ""):
                            obs.append(Observation(date.fromisoformat(o["d"]), float(v)))
                    out.append(IndicatorSeries(self.name, s["code"], s["name"], s["topic"], s["unit"],
                                               f"https://www.bankofcanada.ca/valet/observations/{s['code']}/json",
                                               observations=obs))
                except Exception as exc:  # noqa: BLE001 - one series failing must not stop the rest
                    errors.append(f"{s['code']}: {exc.__class__.__name__}")
        if not out and errors:
            raise RuntimeError("; ".join(errors))
        return out


class StatCanAdapter:
    """Statistics Canada Web Data Service — getDataFromVectorsAndLatestNPeriods."""

    name = "statistics_canada"
    URL = "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods"
    VECTORS = [
        {"id": 41690973, "name": "CPI, all-items (2002=100), Canada", "topic": "inflation", "unit": "index",
         "table": "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000401"},
        {"id": 2062815, "name": "Unemployment rate, Canada, 15+ (SA)", "topic": "employment", "unit": "%",
         "table": "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1410028701"},
    ]

    def fetch(self) -> list[IndicatorSeries]:
        body = [{"vectorId": v["id"], "latestN": 25} for v in self.VECTORS]
        with client() as c:
            r = c.post(self.URL, json=body)
            r.raise_for_status()
            data = r.json()
        out = []
        meta = {v["id"]: v for v in self.VECTORS}
        for item in data:
            if item.get("status") != "SUCCESS":
                continue
            obj = item["object"]
            v = meta.get(int(obj["vectorId"]))
            if not v:
                continue
            obs = [Observation(date.fromisoformat(p["refPer"][:10]), float(p["value"]))
                   for p in obj.get("vectorDataPoint", []) if p.get("value") is not None]
            out.append(IndicatorSeries(self.name, f"v{v['id']}", v["name"], v["topic"], v["unit"], v["table"],
                                       observations=obs))
        return out


class WorldBankAdapter:
    """World Bank Indicators API v2 — annual indicators for major economies + country geo."""

    name = "world_bank"
    COUNTRIES = "CAN;USA;MEX;GBR;DEU;FRA;CHN;JPN;IND;BRA;SAU;KOR;AUS;ZAF;NGA"
    INDICATORS = [
        {"code": "FP.CPI.TOTL.ZG", "name": "Inflation, consumer prices (annual %)", "topic": "inflation", "unit": "%"},
        {"code": "NY.GDP.MKTP.KD.ZG", "name": "GDP growth (annual %)", "topic": "policy", "unit": "%"},
        {"code": "SL.UEM.TOTL.ZS", "name": "Unemployment (% of labour force, ILO)", "topic": "employment", "unit": "%"},
    ]

    def fetch(self) -> list[IndicatorSeries]:
        out = []
        with client() as c:
            for ind in self.INDICATORS:
                r = c.get(f"https://api.worldbank.org/v2/country/{self.COUNTRIES}/indicator/{ind['code']}",
                          params={"format": "json", "per_page": 500, "mrv": 6})
                r.raise_for_status()
                payload = r.json()
                if not isinstance(payload, list) or len(payload) < 2 or payload[1] is None:
                    continue
                by_country: dict[str, list[Observation]] = {}
                for row in payload[1]:
                    if row.get("value") is None:
                        continue
                    by_country.setdefault(row["countryiso3code"], []).append(
                        Observation(date(int(row["date"]), 12, 31), float(row["value"])))
                for iso3, obs in by_country.items():
                    out.append(IndicatorSeries(self.name, ind["code"], ind["name"], ind["topic"], ind["unit"],
                                               f"https://data.worldbank.org/indicator/{ind['code']}?locations={iso3[:2]}",
                                               country=iso3, observations=sorted(obs, key=lambda o: o.observed_at)))
        return out

    def countries(self) -> list[dict[str, Any]]:
        with client() as c:
            r = c.get(f"https://api.worldbank.org/v2/country/{self.COUNTRIES}", params={"format": "json", "per_page": 100})
            r.raise_for_status()
            payload = r.json()
        rows = []
        for c_ in payload[1] or []:
            try:
                lat, lon = float(c_["latitude"]), float(c_["longitude"])
            except (TypeError, ValueError):
                lat = lon = None
            rows.append({"iso3": c_["id"], "iso2": c_["iso2Code"], "name": c_["name"], "capital": c_.get("capitalCity"),
                         "latitude": lat, "longitude": lon, "region": (c_.get("region") or {}).get("value")})
        return rows
