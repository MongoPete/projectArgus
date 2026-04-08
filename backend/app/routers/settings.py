from fastapi import APIRouter

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "message": "MDBA demo API. Connect Atlas Admin API and cluster URIs via env in production.",
    }
