from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from app.db import get_db
from app.models import DashboardSummary

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


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

    return DashboardSummary(
        open_findings=open_findings,
        high_or_critical_findings=high,
        runs_last_7d=runs_7d,
        workflows_active=workflows_n,
        spend_delta_pct_hint=12.4,
        cost_drivers_hint=["data transfer", "backup storage", "compute (peak hours)"],
    )
