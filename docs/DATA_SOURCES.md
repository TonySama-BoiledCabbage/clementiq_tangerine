# Data sources

## Challenge data
- PKDD'99 Discovery Challenge Financial dataset (anonymized bank data), CTU Prague Relational Dataset Repository: https://relational.fel.cvut.cz/dataset/Financial. Supplied by Tangerine as nine CSVs in `data/`, with money in CAD.

## Official statistics (WorldPulse, no key needed)
- Bank of Canada Valet API: https://www.bankofcanada.ca/valet/docs. Series: `V39079` (target for the overnight rate), `FXUSDCAD`, `M.BCPI`, `M.ENER` (commodity price index, total and energy).
- Statistics Canada Web Data Service: https://www.statcan.gc.ca/en/developers/wds. Vectors: `v41690973` (CPI all-items, Table 18-10-0004-01, https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000401) and `v2062815` (unemployment rate, LFS Table 14-10-0287-01, https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1410028701).
- World Bank Indicators API: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392. Indicators `FP.CPI.TOTL.ZG`, `NY.GDP.MKTP.KD.ZG` and `SL.UEM.TOTL.ZS`, plus the country API (capital-city latitude and longitude used for map markers).

## News
- GDELT DOC 2.0 API (headline metadata only): https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
- NewsAPI.org (optional, `NEWS_API_KEY`): https://newsapi.org/docs

## Markets
- CoinGecko simple price API (crypto, CAD): https://docs.coingecko.com/
- Stooq quotes (equities and ETFs, best effort): https://stooq.com/
- Alpha Vantage (optional, `ALPHA_VANTAGE_KEY`): https://www.alphavantage.co/documentation/
- Solana JSON-RPC (mainnet and devnet): https://solana.com/docs/rpc

## Shock and assumption sizing
- Employment Insurance regular benefits (55% of average insurable earnings, weekly maximum): https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit.html. Extended Mode uses a $695/week maximum (2025 maximum insurable earnings of $65,700), configurable via `EI_MAX_WEEKLY_BENEFIT`.
- Household spending shares used for **labelled estimated** category allocation: Statistics Canada Table 11-10-0222-01, https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1110022201 (rounded approximations of non-shelter consumption shares).
- CMHC average rents, Table 34-10-0133-01: https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3410013301 (reference for sizing rent shocks).
- Average weekly earnings, Table 14-10-0223-01: https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1410022301
