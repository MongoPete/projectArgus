from datetime import datetime, timezone

from app.models import (
    AgentType,
    Finding,
    FindingSeverity,
    FindingStatus,
    TriggerType,
    WorkflowStep,
)


def demo_workflows() -> list[dict]:
    now = datetime.now(timezone.utc)
    return [
        {
            "id": "wf-spend-slow",
            "name": "Proactive cost & query pressure",
            "description": "Baseline spend anomalies and slow query explain review.",
            "trigger": TriggerType.schedule.value,
            "schedule_cron": "0 * * * *",
            "hitl_writes": True,
            "steps": [
                WorkflowStep(
                    id="s1",
                    agent=AgentType.spend,
                    label="Spend baseline check",
                    config={"baseline_days": 30, "threshold_pct": 15},
                ).model_dump(),
                WorkflowStep(
                    id="s2",
                    agent=AgentType.slow_query,
                    label="Slow query intelligence",
                    config={"slow_ms": 100, "dedup_hours": 24},
                ).model_dump(),
            ],
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": "wf-backup",
            "name": "Backup & retention sanity",
            "description": "Compare backup frequency to data churn and compliance hints.",
            "trigger": TriggerType.manual.value,
            "schedule_cron": None,
            "hitl_writes": True,
            "steps": [
                WorkflowStep(
                    id="b1",
                    agent=AgentType.backup,
                    label="Backup cost intelligence",
                    config={},
                ).model_dump(),
            ],
            "created_at": now,
            "updated_at": now,
        },
    ]


def demo_findings() -> list[dict]:
    now = datetime.now(timezone.utc)
    return [
        Finding(
            id="fd-demo-1",
            run_id="run-seed-1",
            workflow_id="wf-spend-slow",
            agent=AgentType.spend,
            title="Demo: transfer spend uptick",
            summary="Illustrative finding from seed data. Run a workflow to generate live findings.",
            severity=FindingSeverity.medium,
            status=FindingStatus.new,
            estimated_monthly_savings_usd=250.0,
            evidence={"note": "seed"},
            recommendations=["Connect Atlas Admin API for invoice attribution."],
            created_at=now,
        ).model_dump(),
    ]
