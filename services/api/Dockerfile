# ClementIQ API (FastAPI + Clement Core + Clement Gemini)
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app/services/api
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY services/api/requirements.txt .
RUN pip install -r requirements.txt
COPY services/api/ /app/services/api/
COPY services/worker/ /app/services/worker/
COPY database/ /app/database/
RUN useradd -m clementiq && chown -R clementiq /app
USER clementiq
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fs http://localhost:8000/api/health || exit 1
CMD ["uvicorn", "clementiq.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers"]
