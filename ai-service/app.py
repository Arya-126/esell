"""
FastAPI entrypoint for the ReWear AI assistant microservice.

Exposes POST /chat and GET /health. Only ever called server-to-server by the
ReWear Node proxy (routes/ai.js), which forwards the end user's JWT in the
Authorization header. Per-session conversation history is kept in-process so the
assistant remembers earlier turns ("the jacket I mentioned").
"""
from __future__ import annotations

from collections import defaultdict, deque

from fastapi import FastAPI, Header, Request
from pydantic import BaseModel, Field

from config import get_settings
from graph import run_turn

app = FastAPI(title="ReWear AI Assistant", version="1.0.0")

# session_id -> recent (role, text) turns. Bounded so memory can't grow forever.
_SESSIONS: dict[str, deque] = defaultdict(lambda: deque(maxlen=8))
MAX_MESSAGE_LEN = 1000


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    sessionId: str = Field("anon", max_length=80)
    productId: str | None = Field(None, max_length=80)  # set when viewing a product page


class ChatResponse(BaseModel):
    reply: str
    route: str
    products: list[dict] = []
    attempts: int = 0
    blocked: bool = False


def _history(session_id: str) -> str:
    turns = _SESSIONS.get(session_id)
    if not turns:
        return ""
    return "\n".join(f"{role}: {text}" for role, text in turns)


@app.get("/")
def root() -> dict:
    return {
        "service": "ReWear AI Assistant",
        "status": "running",
        "note": "This is an API used by the ReWear chat widget, not a website. "
                "Open the ReWear site (http://localhost:3000) to use the assistant.",
        "endpoints": {"health": "GET /health", "chat": "POST /chat", "docs": "GET /docs"},
    }


@app.get("/health")
def health() -> dict:
    s = get_settings()
    return {
        "ok": True,
        "llm": "gemini" if s.gemini_enabled else "heuristic",
        "embeddings": s.embeddings_provider,
        "qdrant": "cloud" if s.qdrant_url else "in-memory",
    }


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest, request: Request, authorization: str | None = Header(default=None)) -> ChatResponse:
    message = req.message.strip()[:MAX_MESSAGE_LEN]
    token = authorization[7:] if authorization and authorization.lower().startswith("bearer ") else None

    result = run_turn(
        message=message,
        history=_history(req.sessionId),
        token=token,
        product_id=req.productId,
    )

    turns = _SESSIONS[req.sessionId]
    turns.append(("user", message))
    turns.append(("assistant", result["reply"]))

    return ChatResponse(**result)
