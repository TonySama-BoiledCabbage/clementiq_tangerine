import runpy
from pathlib import Path
from types import SimpleNamespace

import pytest


@pytest.mark.parametrize("result,failed", [
    ({"datasets": {"accounts": {"status": "loaded"}}, "derived": {"account_baselines": 4500}}, False),
    ({"datasets": {"accounts": {"status": "failed"}}}, True),
    ({"datasets": {}, "derived": {"error": "invalid input"}}, True),
])
def test_deployment_requires_successful_import(monkeypatch, result, failed):
    from clementiq import config, cli
    from clementiq.ingestion import importer
    monkeypatch.setattr(config, "get_settings", lambda: SimpleNamespace(is_sqlite=False))
    monkeypatch.setattr(cli, "cmd_migrate", lambda _: None)
    monkeypatch.setattr(importer, "run_import", lambda: result)
    path = Path(__file__).resolve().parents[3] / "scripts" / "vercel_prepare.py"
    if failed:
        with pytest.raises(SystemExit, match="Database import failed"):
            runpy.run_path(str(path), run_name="__main__")
    else:
        runpy.run_path(str(path), run_name="__main__")
