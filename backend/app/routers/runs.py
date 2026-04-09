import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db import get_db
from app.models import AgentType, Finding, FindingSeverity, FindingStatus, RunRecord, RunStatus
from app.orchestrator.graph import execute_workflow_run

router = APIRouter(prefix="/api/runs", tags=["runs"])


def _serialize(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc


@router.get("", response_model=list[RunRecord])
async def list_runs(db: AsyncIOMotorDatabase = Depends(get_db)):
    cursor = db.runs.find().sort("started_at", -1).limit(100)
    out = []
    async for doc in cursor:
        out.append(RunRecord(**_serialize(doc)))
    return out


@router.get("/{run_id}", response_model=RunRecord)
async def get_run(run_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    doc = await db.runs.find_one({"_id": run_id})
    if not doc:
        raise HTTPException(404, "Run not found")
    return RunRecord(**_serialize(doc))


@router.post("/workflow/{workflow_id}", response_model=RunRecord)
async def run_workflow(workflow_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    wf = await db.workflows.find_one({"_id": workflow_id})
    if not wf:
        raise HTTPException(404, "Workflow not found")

    run_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    name = wf.get("name", "Workflow")
    steps = wf.get("steps") or []

    await db.runs.insert_one(
        {
            "_id": run_id,
            "workflow_id": workflow_id,
            "workflow_name": name,
            "status": RunStatus.running.value,
            "started_at": now,
            "completed_at": None,
            "trigger": wf.get("trigger", "manual"),
            "trace": [],
            "error": None,
        }
    )

    try:
        trace, raw_findings = execute_workflow_run(
            run_id=run_id,
            workflow_id=workflow_id,
            workflow_name=name,
            steps=steps,
        )
        completed = datetime.now(timezone.utc)

        for f in raw_findings:
            fid = str(uuid.uuid4())
            await db.findings.insert_one(
                {
                    "_id": fid,
                    "run_id": run_id,
                    "workflow_id": workflow_id,
                    "agent": f.get("agent", AgentType.spend.value),
                    "title": f.get("title", "Finding"),
                    "summary": f.get("summary", ""),
                    "severity": f.get("severity", FindingSeverity.medium.value),
                    "status": FindingStatus.new.value,
                    "estimated_monthly_savings_usd": f.get("estimated_monthly_savings_usd"),
                    "evidence": f.get("evidence") or {},
                    "recommendations": f.get("recommendations") or [],
                    "reasoning_trace": f.get("reasoning_trace") or [],
                    "created_at": completed,
                }
            )

        await db.runs.update_one(
            {"_id": run_id},
            {
                "$set": {
                    "status": RunStatus.completed.value,
                    "completed_at": completed,
                    "trace": [t.model_dump() for t in trace],
                }
            },
        )
    except Exception as e:  # noqa: BLE001
        await db.runs.update_one(
            {"_id": run_id},
            {
                "$set": {
                    "status": RunStatus.failed.value,
                    "completed_at": datetime.now(timezone.utc),
                    "error": str(e),
                }
            },
        )

    doc = await db.runs.find_one({"_id": run_id})
    return RunRecord(**_serialize(doc))
