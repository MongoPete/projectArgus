from __future__ import annotations

import re
from urllib.parse import urlparse

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import settings

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(settings.mongodb_uri)
    return _client


def get_db() -> AsyncIOMotorDatabase:
    return get_client()[settings.mongodb_db]


async def reconnect(uri: str, db_name: str) -> dict:
    """Hot-swap the global Motor client. Returns cluster info on success."""
    global _client
    test_client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=5000)
    try:
        info = await test_client.admin.command("ping")
        build = await test_client.admin.command("buildInfo")
        server_info = {
            "ok": True,
            "cluster_name": _extract_cluster_name(uri),
            "server_version": build.get("version", "unknown"),
            "db_name": db_name,
        }
    except Exception as exc:
        test_client.close()
        raise ConnectionError(str(exc)) from exc

    if _client is not None:
        _client.close()
    _client = test_client
    settings.mongodb_uri = uri
    settings.mongodb_db = db_name
    return server_info


async def test_connection(uri: str, db_name: str) -> dict:
    """Test a connection without swapping the global client."""
    test_client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=5000)
    try:
        await test_client.admin.command("ping")
        build = await test_client.admin.command("buildInfo")
        return {
            "ok": True,
            "cluster_name": _extract_cluster_name(uri),
            "server_version": build.get("version", "unknown"),
            "db_name": db_name,
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    finally:
        test_client.close()


async def connection_status() -> dict:
    """Return current connection status."""
    try:
        client = get_client()
        await client.admin.command("ping")
        build = await client.admin.command("buildInfo")
        return {
            "connected": True,
            "cluster_name": _extract_cluster_name(settings.mongodb_uri),
            "server_version": build.get("version", "unknown"),
            "db_name": settings.mongodb_db,
            "uri_masked": _mask_uri(settings.mongodb_uri),
        }
    except Exception:
        return {
            "connected": False,
            "cluster_name": None,
            "server_version": None,
            "db_name": settings.mongodb_db,
            "uri_masked": _mask_uri(settings.mongodb_uri),
        }


def _extract_cluster_name(uri: str) -> str:
    try:
        parsed = urlparse(uri.replace("mongodb+srv://", "https://").replace("mongodb://", "https://"))
        host = parsed.hostname or ""
        parts = host.split(".")
        return parts[0] if parts else host
    except Exception:
        return "unknown"


def _mask_uri(uri: str) -> str:
    """Replace password in URI with bullets."""
    return re.sub(r"(://[^:]+:)[^@]+(@)", r"\1••••••\2", uri)
