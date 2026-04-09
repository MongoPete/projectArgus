from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from app.db import get_db
from app.models import DashboardSummary, FindingPreview

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _serialize(doc: dict) -> dict:
    d = dict(doc)
    if "_id" in d:
        d["id"] = str(d.pop("_id"))
    return d


@router.get("/summary", response_model=DashboardSummary)
async def summary(db=Depends(get_db)):
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    open_findings = await db.findings.count_documents({"status": {"$in": ["new", "acknowledged"]}})
    high = await db.findings.count_documents(
        {"severity": {"$in": ["high", "critical"]}, "status": {"$ne": "dismissed"}}
    )
    runs_7d = await db.runs.count_documents({"started_at": {"$gte": week_ago}})
    workflows_n = await db.workflows.count_documents({})

    savings_pipeline = [
        {"$match": {"status": {"$in": ["new", "acknowledged"]}, "estimated_monthly_savings_usd": {"$ne": None}}},
        {"$group": {"_id": None, "total": {"$sum": "$estimated_monthly_savings_usd"}}},
    ]
    agg = await db.findings.aggregate(savings_pipeline).to_list(1)
    total_savings = agg[0]["total"] if agg else 0.0

    cost_drivers: list[str] = []
    driver_pipeline = [
        {"$match": {"status": {"$in": ["new", "acknowledged"]}, "estimated_monthly_savings_usd": {"$gt": 0}}},
        {"$group": {"_id": "$agent", "total": {"$sum": "$estimated_monthly_savings_usd"}}},
        {"$sort": {"total": -1}},
        {"$limit": 5},
    ]
    async for doc in db.findings.aggregate(driver_pipeline):
        agent_label = str(doc["_id"]).replace("_", " ").title()
        cost_drivers.append(f"{agent_label} (${doc['total']:,.0f}/mo)")

    top_cursor = db.findings.find(
        {"status": {"$in": ["new", "acknowledged"]}}
    ).sort([("severity", -1), ("estimated_monthly_savings_usd", -1)]).limit(5)
    top_findings: list[FindingPreview] = []
    async for doc in top_cursor:
        d = _serialize(doc)
        top_findings.append(FindingPreview(
            id=d["id"],
            title=d["title"],
            severity=d["severity"],
            agent=d["agent"],
            estimated_monthly_savings_usd=d.get("estimated_monthly_savings_usd"),
            created_at=d["created_at"],
        ))

    return DashboardSummary(
        open_findings=open_findings,
        high_or_critical_findings=high,
        runs_last_7d=runs_7d,
        workflows_active=workflows_n,
        total_addressable_savings_usd=total_savings,
        spend_delta_pct=34.0,
        cost_drivers=cost_drivers,
        top_findings=top_findings,
        clusters_monitored=12,
    )
