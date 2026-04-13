from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.db import get_db
from app.models import FindingStatus, RunStatus
from app.services.flow_run import mock_flow_findings, mock_run_flow

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


class FlowRunStreamRequest(BaseModel):
    """Stream a mock run from the canvas or from a saved flow (by id)."""

    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)
    flow_id: Optional[str] = None


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


@router.post("/run/stream")
async def run_flow_stream(body: FlowRunStreamRequest, db: AsyncIOMotorDatabase = Depends(get_db)):
    """
    NDJSON stream of log entries (one JSON object per line).
    Same generator as POST /run, emitted incrementally so the UI terminal can print live.
    """
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    if body.flow_id:
        doc = await db.flows.find_one({"_id": body.flow_id})
        if not doc:
            raise HTTPException(404, "Flow not found")
        nodes = doc.get("nodes") or []
        edges = doc.get("edges") or []
    else:
        nodes, edges = body.nodes, body.edges

    async def ndjson_chunks():
        for entry in mock_run_flow(nodes, edges):
            line = json.dumps(entry, default=str) + "\n"
            yield line.encode("utf-8")
            kind = entry.get("kind", "text")
            if kind == "heading":
                await asyncio.sleep(1.2)
            elif kind == "state":
                await asyncio.sleep(0.9)
            elif kind == "json":
                await asyncio.sleep(0.6)
            else:
                await asyncio.sleep(0.35)

    return StreamingResponse(ndjson_chunks(), media_type="application/x-ndjson")


@router.post("/run/persist")
async def run_flow_persist(body: FlowRunStreamRequest, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Run a flow and persist the findings + run record (like workflows do)."""
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    flow_name = "Flow run"
    if body.flow_id:
        doc = await db.flows.find_one({"_id": body.flow_id})
        if not doc:
            raise HTTPException(404, "Flow not found")
        nodes = doc.get("nodes") or []
        edges = doc.get("edges") or []
        flow_name = doc.get("name", "Flow run")
    else:
        nodes, edges = body.nodes, body.edges

    run_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    await db.runs.insert_one({
        "_id": run_id,
        "workflow_id": f"flow:{body.flow_id or 'canvas'}",
        "workflow_name": flow_name,
        "status": RunStatus.running.value,
        "started_at": now,
        "completed_at": None,
        "trigger": "manual",
        "trace": [],
        "error": None,
    })

    raw_findings = mock_flow_findings(nodes, edges)
    completed = datetime.now(timezone.utc)

    for f in raw_findings:
        fid = str(uuid.uuid4())
        await db.findings.insert_one({
            "_id": fid,
            "run_id": run_id,
            "workflow_id": f"flow:{body.flow_id or 'canvas'}",
            "agent": f.get("agent", "mdba"),
            "title": f.get("title", "Finding"),
            "summary": f.get("summary", ""),
            "severity": f.get("severity", "medium"),
            "status": FindingStatus.new.value,
            "estimated_monthly_savings_usd": f.get("estimated_monthly_savings_usd"),
            "evidence": f.get("evidence") or {},
            "recommendations": f.get("recommendations") or [],
            "reasoning_trace": f.get("reasoning_trace") or [],
            "created_at": completed,
        })

    log_entries = mock_run_flow(nodes, edges)
    trace = [
        {"node": "flow-runner", "message": e["content"], "at": now.isoformat()}
        for e in log_entries
        if e.get("kind") == "heading"
    ]

    await db.runs.update_one(
        {"_id": run_id},
        {"$set": {
            "status": RunStatus.completed.value,
            "completed_at": completed,
            "trace": trace,
        }},
    )

    return {
        "ok": True,
        "run_id": run_id,
        "findings_count": len(raw_findings),
        "flow_name": flow_name,
    }


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


@router.delete("/{flow_id}")
async def delete_flow(flow_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    res = await db.flows.delete_one({"_id": flow_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Flow not found")
    await db.runs.delete_many({"workflow_id": f"flow:{flow_id}"})
    await db.findings.delete_many({"workflow_id": f"flow:{flow_id}"})
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
