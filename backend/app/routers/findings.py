from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.db import get_db
from app.models import Finding, FindingStatus

router = APIRouter(prefix="/api/findings", tags=["findings"])


def _serialize(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc


class StatusBody(BaseModel):
    status: FindingStatus


@router.get("", response_model=list[Finding])
async def list_findings(db: AsyncIOMotorDatabase = Depends(get_db)):
    cursor = db.findings.find().sort("created_at", -1).limit(200)
    out = []
    async for doc in cursor:
        out.append(Finding(**_serialize(doc)))
    return out


@router.patch("/{finding_id}/status", response_model=Finding)
async def update_status(
    finding_id: str, body: StatusBody, db: AsyncIOMotorDatabase = Depends(get_db)
):
    res = await db.findings.update_one({"_id": finding_id}, {"$set": {"status": body.status.value}})
    if res.matched_count == 0:
        raise HTTPException(404, "Finding not found")
    doc = await db.findings.find_one({"_id": finding_id})
    return Finding(**_serialize(doc))
