from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings
from app.db import connection_status, get_db, reconnect, test_connection

router = APIRouter(prefix="/api/settings", tags=["settings"])


# ── Health ──────────────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    return {
        "status": "ok",
        "message": "MDBA demo API is running.",
    }


# ── MongoDB connection ──────────────────────────────────────────────────────

class ConnectionTestRequest(BaseModel):
    uri: str
    db_name: str = "mdba_demo"


@router.get("/connection")
async def get_connection():
    return await connection_status()


@router.post("/connection/test")
async def test_conn(body: ConnectionTestRequest):
    return await test_connection(body.uri, body.db_name)


@router.post("/connection/save")
async def save_conn(body: ConnectionTestRequest):
    try:
        info = await reconnect(body.uri, body.db_name)
    except ConnectionError as exc:
        return {"ok": False, "error": str(exc)}

    from app.main import seed_if_empty
    await seed_if_empty()
    return info


# ── Demo data reset ─────────────────────────────────────────────────────────

@router.post("/reset-demo")
async def reset_demo():
    from app.main import reset_demo_data
    await reset_demo_data()
    return {"ok": True, "message": "Demo data reset. Workflows, findings, and runs re-seeded."}


# ── LLM configuration ──────────────────────────────────────────────────────

class LLMSaveRequest(BaseModel):
    openai_api_key: Optional[str] = None


@router.get("/llm")
async def get_llm():
    key = settings.openai_api_key
    if key:
        masked = key[:7] + "••••••" + key[-4:] if len(key) > 11 else "••••••"
        return {"configured": True, "provider": "OpenAI", "model": "gpt-4o-mini", "key_masked": masked}
    return {"configured": False, "provider": None, "model": None, "key_masked": None}


@router.post("/llm/test")
async def test_llm(body: LLMSaveRequest):
    key = body.openai_api_key
    if not key:
        return {"ok": False, "error": "No API key provided."}
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": "Say OK"}],
                    "max_tokens": 3,
                },
                timeout=10,
            )
            if resp.status_code == 200:
                return {"ok": True, "model": "gpt-4o-mini"}
            data = resp.json()
            return {"ok": False, "error": data.get("error", {}).get("message", resp.text)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@router.post("/llm/save")
async def save_llm(body: LLMSaveRequest):
    settings.openai_api_key = body.openai_api_key or None
    configured = settings.openai_api_key is not None
    return {"ok": True, "configured": configured}
