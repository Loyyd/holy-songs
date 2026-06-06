import pytest
from fastapi import HTTPException

import backend.main as main


def test_write_access_allows_when_no_admin_token(monkeypatch):
    monkeypatch.setattr(main, "ADMIN_TOKEN", "")

    assert main.require_write_access() is None


def test_write_access_requires_token_when_configured(monkeypatch):
    monkeypatch.setattr(main, "ADMIN_TOKEN", "secret")

    with pytest.raises(HTTPException) as error:
        main.require_write_access()

    assert error.value.status_code == 401


def test_write_access_rejects_invalid_token(monkeypatch):
    monkeypatch.setattr(main, "ADMIN_TOKEN", "secret")

    with pytest.raises(HTTPException) as error:
        main.require_write_access(authorization="Bearer wrong")

    assert error.value.status_code == 403


def test_write_access_accepts_bearer_token(monkeypatch):
    monkeypatch.setattr(main, "ADMIN_TOKEN", "secret")

    assert main.require_write_access(authorization="Bearer secret") is None
