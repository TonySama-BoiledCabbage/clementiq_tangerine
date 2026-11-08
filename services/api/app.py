"""Vercel FastAPI entrypoint; reuse the existing application."""
import os

if os.environ.get("VERCEL"):
    os.environ.setdefault("CLEMENTIQ_ENV", "production")

from clementiq.main import app
