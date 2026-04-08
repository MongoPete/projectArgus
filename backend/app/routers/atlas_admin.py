"""Optional live Atlas Admin API check (requires service account OAuth credentials)."""

import asyncio

from fastapi import APIRouter

from app.config import settings
from app.services import atlas_admin

router = APIRouter(prefix="/api/atlas", tags=["atlas-admin"])


@router.get("/status")
async def atlas_status():
    """
    Returns whether Atlas OAuth is configured and, if so, attempts a read-only
    `GET /api/atlas/v2/groups` as a connectivity smoke test.
    """
    cid = settings.atlas_client_id
    csec = settings.atlas_client_secret
    if not cid or not csec:
        return {
            "configured": False,
            "message": "Set ATLAS_CLIENT_ID and ATLAS_CLIENT_SECRET (Atlas service account) to enable live Admin API.",
        }

    def _call():
        return atlas_admin.list_groups(cid, csec)

    try:
        result = await asyncio.to_thread(_call)
        return {
            "configured": True,
            "ok": result.get("ok", False),
            "status": result.get("status"),
            "data": result.get("data"),
        }
    except Exception as e:
        return {"configured": True, "ok": False, "error": str(e)}
