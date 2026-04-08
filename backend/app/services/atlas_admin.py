"""
Optional Atlas Admin API v2 client (OAuth client credentials).
Ported from Eugene Kang's PoC — credentials must come from environment only.
"""

from __future__ import annotations

import base64
from typing import Any, Optional

import httpx


def get_access_token(client_id: str, client_secret: str) -> str:
    creds = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    with httpx.Client(timeout=20.0) as client:
        resp = client.post(
            "https://cloud.mongodb.com/api/oauth/token",
            headers={
                "Authorization": f"Basic {creds}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data="grant_type=client_credentials",
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


def atlas_request(
    method: str,
    path: str,
    *,
    access_token: str,
    body: Optional[dict] = None,
) -> dict[str, Any]:
    """Call Atlas Admin API v2. path must start with /api/atlas/v2/"""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.atlas.2023-01-01+json",
        "Content-Type": "application/json",
    }
    url = f"https://cloud.mongodb.com{path}"
    with httpx.Client(timeout=45.0) as client:
        kwargs: dict = {"headers": headers}
        if body and method.upper() in ("POST", "PUT", "PATCH"):
            kwargs["json"] = body
        resp = client.request(method.upper(), url, **kwargs)
        try:
            data = resp.json()
        except Exception:
            data = {"raw": resp.text}
        return {"status": resp.status_code, "ok": resp.is_success, "data": data}


def list_groups(client_id: str, client_secret: str) -> dict[str, Any]:
    """Smoke test: list Atlas projects (groups)."""
    token = get_access_token(client_id, client_secret)
    return atlas_request("GET", "/api/atlas/v2/groups", access_token=token)
