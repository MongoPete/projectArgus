import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db import get_db
from app.models import Workflow, WorkflowCreate, WorkflowUpdate

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


def _serialize(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    if "created_at" in doc and hasattr(doc["created_at"], "isoformat"):
        pass
    return doc


@router.get("", response_model=list[Workflow])
async def list_workflows(db: AsyncIOMotorDatabase = Depends(get_db)):
    cursor = db.workflows.find().sort("updated_at", -1)
    out = []
    async for doc in cursor:
        out.append(Workflow(**_serialize(doc)))
    return out


@router.post("", response_model=Workflow)
async def create_workflow(body: WorkflowCreate, db: AsyncIOMotorDatabase = Depends(get_db)):
    now = datetime.now(timezone.utc)
    wid = str(uuid.uuid4())
    doc = {
        "_id": wid,
        **body.model_dump(),
        "created_at": now,
        "updated_at": now,
    }
    await db.workflows.insert_one(doc)
    return Workflow(id=wid, **body.model_dump(), created_at=now, updated_at=now)


@router.get("/{workflow_id}", response_model=Workflow)
async def get_workflow(workflow_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    doc = await db.workflows.find_one({"_id": workflow_id})
    if not doc:
        raise HTTPException(404, "Workflow not found")
    return Workflow(**_serialize(doc))


@router.patch("/{workflow_id}", response_model=Workflow)
async def patch_workflow(
    workflow_id: str, body: WorkflowUpdate, db: AsyncIOMotorDatabase = Depends(get_db)
):
    doc = await db.workflows.find_one({"_id": workflow_id})
    if not doc:
        raise HTTPException(404, "Workflow not found")
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if not updates:
        return Workflow(**_serialize(doc))
    updates["updated_at"] = datetime.now(timezone.utc)
    await db.workflows.update_one({"_id": workflow_id}, {"$set": updates})
    doc = await db.workflows.find_one({"_id": workflow_id})
    return Workflow(**_serialize(doc))


@router.delete("/{workflow_id}")
async def delete_workflow(workflow_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    res = await db.workflows.delete_one({"_id": workflow_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Workflow not found")
    await db.runs.delete_many({"workflow_id": workflow_id})
    await db.findings.delete_many({"workflow_id": workflow_id})
    return {"ok": True}
