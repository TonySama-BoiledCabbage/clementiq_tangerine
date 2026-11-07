# ClementIQ monitoring worker — same code base as the API, independently deployable.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app/services/api
COPY services/api/requirements.txt .
RUN pip install -r requirements.txt
COPY services/api/ /app/services/api/
COPY services/worker/ /app/services/worker/
RUN useradd -m clementiq && chown -R clementiq /app
USER clementiq
CMD ["python", "/app/services/worker/worker.py"]
