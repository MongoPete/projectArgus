from fastapi import APIRouter

from app.models import ChatRequest, ChatResponse
from app.services.chat import run_chat

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    """Conversational assistant to design MDBA workflows; returns optional ready-to-save workflow body."""
    return await run_chat(req)
