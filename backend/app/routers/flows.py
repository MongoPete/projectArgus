from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.db import get_db
from app.services.flow_run import mock_run_flow

router = APIRouter(prefix="/api/flows", tags=["flows"])


class FlowCreate(BaseModel):
    name: str
    description: str = ""
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)


class FlowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    nodes: Optional[list[dict[str, Any]]] = None
    edges: Optional[list[dict[str, Any]]] = None


class Flow(FlowCreate):
    id: str
    created_at: datetime
    updated_at: datetime


class FlowRunRequest(BaseModel):
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)


class FlowRunLogEntry(BaseModel):
    kind: str
    content: str


class FlowRunResponse(BaseModel):
    status: str
    entries: list[FlowRunLogEntry]


def _serialize(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc


@router.get("", response_model=list[Flow])
async def list_flows(db: AsyncIOMotorDatabase = Depends(get_db)):
    cursor = db.flows.find().sort("updated_at", -1).limit(100)
    out = []
    async for doc in cursor:
        out.append(Flow(**_serialize(doc)))
    return out


@router.post("", response_model=Flow)
async def create_flow(body: FlowCreate, db: AsyncIOMotorDatabase = Depends(get_db)):
    now = datetime.now(timezone.utc)
    fid = str(uuid.uuid4())
    doc = {
        "_id": fid,
        **body.model_dump(),
        "created_at": now,
        "updated_at": now,
    }
    await db.flows.insert_one(doc)
    return Flow(id=fid, **body.model_dump(), created_at=now, updated_at=now)


@router.post("/run", response_model=FlowRunResponse)
async def run_flow_inline(body: FlowRunRequest):
    raw = mock_run_flow(body.nodes, body.edges)
    return FlowRunResponse(
        status="completed",
        entries=[FlowRunLogEntry(kind=e["kind"], content=e["content"]) for e in raw],
    )


@router.get("/{flow_id}", response_model=Flow)
async def get_flow(flow_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    doc = await db.flows.find_one({"_id": flow_id})
    if not doc:
        raise HTTPException(404, "Flow not found")
    return Flow(**_serialize(doc))


@router.patch("/{flow_id}", response_model=Flow)
async def patch_flow(flow_id: str, body: FlowUpdate, db: AsyncIOMotorDatabase = Depends(get_db)):
    doc = await db.flows.find_one({"_id": flow_id})
    if not doc:
        raise HTTPException(404, "Flow not found")
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if not updates:
        return Flow(**_serialize(doc))
    updates["updated_at"] = datetime.now(timezone.utc)
    await db.flows.update_one({"_id": flow_id}, {"$set": updates})
    doc = await db.flows.find_one({"_id": flow_id})
    return Flow(**_serialize(doc))


@router.delete("/{flow_id}")
async def delete_flow(flow_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    res = await db.flows.delete_one({"_id": flow_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Flow not found")
    return {"ok": True}


@router.post("/{flow_id}/run", response_model=FlowRunResponse)
async def run_saved_flow(flow_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    doc = await db.flows.find_one({"_id": flow_id})
    if not doc:
        raise HTTPException(404, "Flow not found")
    nodes = doc.get("nodes") or []
    edges = doc.get("edges") or []
    raw = mock_run_flow(nodes, edges)
    return FlowRunResponse(
        status="completed",
        entries=[FlowRunLogEntry(kind=e["kind"], content=e["content"]) for e in raw],
    )
