from datetime import datetime, timedelta, timezone

from app.models import (
    AgentType,
    Finding,
    FindingSeverity,
    FindingStatus,
    ReasoningStep,
    RunStatus,
    TraceStep,
    TriggerType,
    WorkflowStep,
)

_NOW = datetime.now(timezone.utc)
_1H = _NOW - timedelta(hours=1)
_3H = _NOW - timedelta(hours=3)
_6H = _NOW - timedelta(hours=6)
_1D = _NOW - timedelta(days=1)
_2D = _NOW - timedelta(days=2)
_3D = _NOW - timedelta(days=3)
_5D = _NOW - timedelta(days=5)


def demo_workflows() -> list[dict]:
    return [
        {
            "id": "wf-cost-query",
            "name": "Cost & query health — production cluster",
            "description": (
                "Hourly spend baseline check and slow query analysis across the primary "
                "production cluster (prod-east-1). Alerts on cost drift >15% and COLLSCAN patterns."
            ),
            "trigger": TriggerType.schedule.value,
            "schedule_cron": "0 * * * *",
            "hitl_writes": True,
            "steps": [
                WorkflowStep(
                    id="s1",
                    agent=AgentType.spend,
                    label="Spend baseline vs 30-day rolling average",
                    config={"baseline_days": 30, "threshold_pct": 15},
                ).model_dump(),
                WorkflowStep(
                    id="s2",
                    agent=AgentType.slow_query,
                    label="Slow query profiler scan",
                    config={"slow_ms": 100, "dedup_hours": 24},
                ).model_dump(),
            ],
            "created_at": _5D,
            "updated_at": _1H,
        },
        {
            "id": "wf-backup-index",
            "name": "Backup & index rationalization — all clusters",
            "description": (
                "Daily review of snapshot frequency vs data change rate, plus unused index detection "
                "across 12 clusters. Human approval required for any index drop."
            ),
            "trigger": TriggerType.schedule.value,
            "schedule_cron": "0 7 * * *",
            "hitl_writes": True,
            "steps": [
                WorkflowStep(
                    id="b1",
                    agent=AgentType.backup,
                    label="Backup cost vs recovery objectives",
                    config={},
                ).model_dump(),
                WorkflowStep(
                    id="b2",
                    agent=AgentType.index_rationalization,
                    label="Unused index scan (30-day window)",
                    config={"unused_days": 30},
                ).model_dump(),
            ],
            "created_at": _3D,
            "updated_at": _6H,
        },
        {
            "id": "wf-security-quality",
            "name": "Security & data quality — fintech tier",
            "description": (
                "Behavioral anomaly detection on Atlas audit logs and statistical outlier checks "
                "on transaction collections. Targets PCI-scoped clusters."
            ),
            "trigger": TriggerType.schedule.value,
            "schedule_cron": "0 */4 * * *",
            "hitl_writes": True,
            "steps": [
                WorkflowStep(
                    id="sq1",
                    agent=AgentType.security,
                    label="Access pattern anomaly detection",
                    config={},
                ).model_dump(),
                WorkflowStep(
                    id="sq2",
                    agent=AgentType.data_quality,
                    label="Transaction outlier detection",
                    config={"lookback_days": 7},
                ).model_dump(),
            ],
            "created_at": _2D,
            "updated_at": _3H,
        },
    ]


def demo_runs() -> list[dict]:
    """Pre-seed run history so the app looks lived-in."""
    return [
        {
            "id": "run-001",
            "workflow_id": "wf-cost-query",
            "workflow_name": "Cost & query health — production cluster",
            "status": RunStatus.completed.value,
            "started_at": _1H,
            "completed_at": _1H + timedelta(seconds=14),
            "trigger": "schedule",
            "trace": [
                TraceStep(node="ingest", message="Collected Atlas billing API invoices and cluster metrics for prod-east-1.", at=_1H).model_dump(),
                TraceStep(node="analyze", message="Running spend baseline (30d) and slow query profiler scan.", at=_1H + timedelta(seconds=3)).model_dump(),
                TraceStep(node="analyze", message="Produced 3 findings — 1 high severity, 2 medium.", at=_1H + timedelta(seconds=8)).model_dump(),
                TraceStep(node="synthesize", message="Ranked findings by estimated monthly impact: $2,340 total addressable.", at=_1H + timedelta(seconds=10)).model_dump(),
                TraceStep(node="deliver", message="Published to findings inbox. Slack notification queued.", at=_1H + timedelta(seconds=14)).model_dump(),
            ],
            "error": None,
        },
        {
            "id": "run-002",
            "workflow_id": "wf-backup-index",
            "workflow_name": "Backup & index rationalization — all clusters",
            "status": RunStatus.completed.value,
            "started_at": _6H,
            "completed_at": _6H + timedelta(seconds=22),
            "trigger": "schedule",
            "trace": [
                TraceStep(node="ingest", message="Pulled backup policies and $indexStats across 12 clusters.", at=_6H).model_dump(),
                TraceStep(node="analyze", message="Scanned 847 indexes; identified 23 unused in 30-day window.", at=_6H + timedelta(seconds=10)).model_dump(),
                TraceStep(node="analyze", message="Produced 2 findings — backup savings + index cleanup.", at=_6H + timedelta(seconds=16)).model_dump(),
                TraceStep(node="synthesize", message="Combined savings estimate: $1,870/month across all clusters.", at=_6H + timedelta(seconds=19)).model_dump(),
                TraceStep(node="deliver", message="Published to findings inbox. Index drops require human approval.", at=_6H + timedelta(seconds=22)).model_dump(),
            ],
            "error": None,
        },
        {
            "id": "run-003",
            "workflow_id": "wf-security-quality",
            "workflow_name": "Security & data quality — fintech tier",
            "status": RunStatus.completed.value,
            "started_at": _3H,
            "completed_at": _3H + timedelta(seconds=11),
            "trigger": "schedule",
            "trace": [
                TraceStep(node="ingest", message="Fetched Atlas audit logs and transaction collection stats.", at=_3H).model_dump(),
                TraceStep(node="analyze", message="Detected unusual read pattern from new IP range on payments cluster.", at=_3H + timedelta(seconds=5)).model_dump(),
                TraceStep(node="analyze", message="Produced 1 finding — high severity (security).", at=_3H + timedelta(seconds=8)).model_dump(),
                TraceStep(node="synthesize", message="Security finding flagged for immediate review.", at=_3H + timedelta(seconds=9)).model_dump(),
                TraceStep(node="deliver", message="Published to inbox. Security alert sent to #atlas-security Slack channel.", at=_3H + timedelta(seconds=11)).model_dump(),
            ],
            "error": None,
        },
        {
            "id": "run-004",
            "workflow_id": "wf-cost-query",
            "workflow_name": "Cost & query health — production cluster",
            "status": RunStatus.completed.value,
            "started_at": _1D,
            "completed_at": _1D + timedelta(seconds=12),
            "trigger": "schedule",
            "trace": [
                TraceStep(node="ingest", message="Collected Atlas billing and profiler data.", at=_1D).model_dump(),
                TraceStep(node="analyze", message="Spend within baseline tolerance. 1 new slow query pattern detected.", at=_1D + timedelta(seconds=6)).model_dump(),
                TraceStep(node="synthesize", message="1 medium-severity finding.", at=_1D + timedelta(seconds=9)).model_dump(),
                TraceStep(node="deliver", message="Published to inbox.", at=_1D + timedelta(seconds=12)).model_dump(),
            ],
            "error": None,
        },
    ]


def demo_findings() -> list[dict]:
    R = ReasoningStep
    return [
        Finding(
            id="fd-spend-transfer",
            run_id="run-001",
            workflow_id="wf-cost-query",
            agent=AgentType.spend,
            title="Data transfer costs up 34% week-over-week",
            summary=(
                "Data transfer on prod-east-1 increased from $4,120 to $5,521 this week. "
                "Three collections account for 89% of the increase: user_events (41%), "
                "audit_logs (31%), and session_data (17%). The spike correlates with a new "
                "analytics pipeline deployed Tuesday that performs cross-region reads."
            ),
            severity=FindingSeverity.high,
            status=FindingStatus.new,
            estimated_monthly_savings_usd=1520.0,
            evidence={
                "cluster": "prod-east-1",
                "period": "Apr 1\u20137, 2026",
                "baseline_weekly_avg": 4120,
                "current_week": 5521,
                "delta_pct": 34,
                "top_collections": [
                    {"name": "user_events", "pct_of_increase": 41, "size_gb": 248},
                    {"name": "audit_logs", "pct_of_increase": 31, "size_gb": 187},
                    {"name": "session_data", "pct_of_increase": 17, "size_gb": 92},
                ],
                "likely_cause": "Cross-region analytics pipeline (deployed Apr 2)",
            },
            recommendations=[
                "Add TTL index on audit_logs.created_at (90-day retention) \u2014 est. $340/mo savings on storage alone.",
                "Archive session_data older than 30 days to Online Archive \u2014 est. $280/mo.",
                "Route analytics reads to a local read replica to eliminate cross-region transfer fees \u2014 est. $900/mo.",
            ],
            reasoning_trace=[
                R(role="agent", content="Starting spend analysis for prod-east-1. Pulling Atlas Billing API invoices for the current and prior 30-day windows."),
                R(role="tool", content="GET /api/atlas/v2/orgs/{orgId}/invoices?fromDate=2026-03-01"),
                R(role="data", content='{"totalCount": 4, "results": [{"periodEnd": "2026-03-31", "subtotalCents": 2847320}, {"periodEnd": "2026-04-07", "subtotalCents": 3102080}]}'),
                R(role="agent", content="Baseline weekly average for data transfer: $4,120. This week: $5,521. That's a 34% increase \u2014 above the 15% threshold configured for this workflow."),
                R(role="agent", content="Drilling into line items to identify which collections are driving the increase. Querying $collStats for data transfer attribution."),
                R(role="tool", content="db.runCommand({collStats: 'user_events', scale: 1073741824})"),
                R(role="data", content='{"storageSize": 248, "dataTransferBytes": {"outbound": 14200000000}}'),
                R(role="agent", content="user_events accounts for 41% of the transfer increase. It's a 248GB collection with high outbound read traffic. audit_logs is 31% (187GB), session_data is 17% (92GB). Together they explain 89% of the spike."),
                R(role="agent", content="Cross-referencing with Atlas deployment history: a new analytics pipeline was deployed on Apr 2. This pipeline runs cross-region reads from us-east-1 to eu-west-1 against these three collections."),
                R(role="conclusion", content="Savings estimate: $900/mo by routing reads to a local replica, $340/mo with TTL on audit_logs, $280/mo by archiving old sessions. Total addressable: $1,520/mo."),
            ],
            created_at=_1H,
        ).model_dump(),

        Finding(
            id="fd-slow-aggregation",
            run_id="run-001",
            workflow_id="wf-cost-query",
            agent=AgentType.slow_query,
            title="Unoptimized aggregation on analytics.page_views \u2014 sequential scan",
            summary=(
                "Aggregation pipeline with $match on user_id + $group by page runs 380ms on average. "
                "The $match stage doesn't use an index because user_id is in a sub-document. "
                "Restructuring the pipeline or adding a covered index would help."
            ),
            severity=FindingSeverity.medium,
            status=FindingStatus.new,
            estimated_monthly_savings_usd=340.0,
            evidence={
                "cluster": "prod-east-1",
                "collection": "analytics.page_views",
                "pipeline_stages": ["$match", "$group", "$sort", "$limit"],
                "avg_ms": 380,
                "calls_per_hour": 90,
            },
            recommendations=[
                "Hoist user_id to a top-level field or create an index on 'metadata.user_id'.",
                "Add $project before $group to limit fields flowing through the pipeline.",
            ],
            reasoning_trace=[
                R(role="agent", content="Continuing slow query analysis. Found an aggregation pipeline on analytics.page_views averaging 380ms."),
                R(role="tool", content='db.page_views.aggregate([{$match: {"metadata.user_id": "..."}}, {$group: {_id: "$page", count: {$sum: 1}}}, {$sort: {count: -1}}, {$limit: 20}]).explain()'),
                R(role="data", content='{"stages": [{"$cursor": {"queryPlanner": {"winningPlan": {"stage": "COLLSCAN"}}}}], "executionStats": {"totalDocsExamined": 890000}}'),
                R(role="agent", content="The $match on metadata.user_id can't use an index because user_id is nested inside a sub-document. MongoDB needs either a direct index on 'metadata.user_id' or the field hoisted to the top level."),
                R(role="agent", content="Additionally, the pipeline passes all document fields through $group when only 'page' is needed. Adding $project before $group would reduce memory pressure."),
                R(role="conclusion", content="Fix: create index on 'metadata.user_id' + add $project stage. Estimated improvement: 380ms \u2192 ~15ms. Savings: $340/mo from reduced compute at 90 calls/hour."),
            ],
            created_at=_1H,
        ).model_dump(),

        Finding(
            id="fd-backup-oversnapshot",
            run_id="run-002",
            workflow_id="wf-backup-index",
            agent=AgentType.backup,
            title="Over-snapshotting on 8 low-churn clusters \u2014 $1,240/mo in excess backup storage",
            summary=(
                "8 of 12 clusters take hourly snapshots but change less than 0.5% of data per day. "
                "Switching to daily snapshots with continuous backup (point-in-time recovery) "
                "would maintain the same RPO while reducing snapshot storage by 71%."
            ),
            severity=FindingSeverity.medium,
            status=FindingStatus.new,
            estimated_monthly_savings_usd=1240.0,
            evidence={
                "clusters_affected": 8,
                "clusters_total": 12,
                "avg_daily_churn_pct": 0.3,
                "current_snapshot_interval": "hourly",
                "recommended_interval": "daily + continuous backup",
                "storage_reduction_pct": 71,
                "example_clusters": ["staging-west", "analytics-readonly", "internal-tools", "docs-prod"],
            },
            recommendations=[
                "Switch low-churn clusters to daily snapshots \u2014 Atlas continuous backup keeps sub-hour RPO.",
                "Review compliance requirements for the 4 remaining clusters before changing schedule.",
                "Estimated combined savings: $1,240/month ($14,880/year).",
            ],
            reasoning_trace=[
                R(role="agent", content="Analyzing backup configuration across all 12 monitored clusters. Pulling snapshot policies and data change rates."),
                R(role="tool", content="GET /api/atlas/v2/groups/{groupId}/clusters/{clusterName}/backup/schedule (x12 clusters)"),
                R(role="data", content='{"policies": [{"id": "...", "frequencyInterval": 1, "frequencyType": "hourly", "retentionUnit": "days", "retentionValue": 7}]}'),
                R(role="agent", content="All 12 clusters have hourly snapshot policies. Now checking actual data change rates using oplog analysis."),
                R(role="tool", content="db.oplog.rs.find().sort({ts: -1}).limit(1000) \u2014 sampled across each cluster"),
                R(role="data", content='{"staging-west": {"daily_churn_pct": 0.1}, "analytics-readonly": {"daily_churn_pct": 0.05}, "internal-tools": {"daily_churn_pct": 0.2}, "docs-prod": {"daily_churn_pct": 0.15}, ...}'),
                R(role="agent", content="8 of 12 clusters show daily churn below 0.5%. At this rate, hourly snapshots are redundant \u2014 each snapshot is nearly identical to the previous one. Atlas continuous backup (oplog-based) already provides sub-hour RPO."),
                R(role="agent", content="Calculating storage impact: hourly = 24 snapshots/day \u00d7 7 days retention = 168 snapshot copies. Daily = 7 copies. That's a 71% reduction in snapshot storage."),
                R(role="agent", content="At current Atlas backup pricing ($0.20/GB/month), the 8 clusters store ~6,200GB of redundant snapshots."),
                R(role="conclusion", content="Switching 8 clusters to daily snapshots saves $1,240/mo ($14,880/year). RPO is maintained by continuous backup. The 4 high-churn clusters (prod-east-1, payments-prod, etc.) should stay on hourly."),
            ],
            created_at=_6H,
        ).model_dump(),

        Finding(
            id="fd-unused-indexes",
            run_id="run-002",
            workflow_id="wf-backup-index",
            agent=AgentType.index_rationalization,
            title="23 unused indexes across 12 clusters \u2014 consuming 47GB storage",
            summary=(
                "Index scan across all clusters found 23 indexes with zero operations in the last 30 days. "
                "Combined storage: 47GB. Top offenders are on the 'legacy_reports' and 'import_staging' "
                "collections that are no longer actively queried."
            ),
            severity=FindingSeverity.medium,
            status=FindingStatus.new,
            estimated_monthly_savings_usd=630.0,
            evidence={
                "unused_index_count": 23,
                "total_storage_gb": 47,
                "window_days": 30,
                "top_collections": ["legacy_reports", "import_staging", "migration_cache"],
                "clusters_affected": ["prod-east-1", "prod-west-2", "analytics-readonly"],
            },
            recommendations=[
                "Drop 18 confirmed-unused indexes on legacy collections (human approval required).",
                "Hold 5 indexes on import_staging \u2014 next ETL run is scheduled for Apr 15.",
                "Net storage savings: 47GB \u2248 $630/month at current tier pricing.",
            ],
            reasoning_trace=[
                R(role="agent", content="Running $indexStats across all collections on 12 clusters to identify indexes with zero operations."),
                R(role="tool", content="db.getCollectionNames().forEach(c => db[c].aggregate([{$indexStats: {}}])) \u2014 across 12 clusters"),
                R(role="data", content='{"total_indexes_scanned": 347, "unused_30d": 23, "total_storage_bytes": 50465865728}'),
                R(role="agent", content="Found 23 indexes with accesses.ops = 0 in the 30-day window. Let me check which collections they belong to and whether any have upcoming scheduled jobs."),
                R(role="agent", content="Top unused indexes: legacy_reports has 9 unused indexes (18GB), import_staging has 5 (12GB), migration_cache has 4 (8GB). The rest are scattered across smaller collections."),
                R(role="tool", content="Checking Atlas scheduled triggers and cron jobs for any references to these collections..."),
                R(role="data", content='{"import_staging": {"next_etl_run": "2026-04-15", "cron": "0 3 15 * *"}, "legacy_reports": {"last_access": "2026-01-12"}, "migration_cache": {"last_access": "2025-11-30"}}'),
                R(role="agent", content="import_staging has a monthly ETL job scheduled for Apr 15 \u2014 those 5 indexes should be held. legacy_reports hasn't been accessed since January. migration_cache since November 2025."),
                R(role="agent", content="Storage cost: 47GB at $13.40/GB/month (current tier blended rate) = $630/month. Safe to drop 18 indexes; hold 5 for import_staging."),
                R(role="conclusion", content="18 indexes safe to drop (human approval required). 5 held for upcoming ETL. Net savings: $630/month ($7,560/year). No query regressions expected \u2014 these collections have zero active read traffic."),
            ],
            created_at=_6H,
        ).model_dump(),

        Finding(
            id="fd-security-ip",
            run_id="run-003",
            workflow_id="wf-security-quality",
            agent=AgentType.security,
            title="Unusual read volume from new IP range on payments cluster",
            summary=(
                "Atlas audit logs show 14,000 read operations from IP range 203.0.113.0/24 "
                "over the past 6 hours \u2014 a range not seen in the previous 90 days. "
                "All reads target the 'transactions' and 'customer_profiles' collections. "
                "Credentials used: svc-analytics (read-only)."
            ),
            severity=FindingSeverity.high,
            status=FindingStatus.new,
            estimated_monthly_savings_usd=None,
            evidence={
                "cluster": "payments-prod",
                "ip_range": "203.0.113.0/24",
                "read_count_6h": 14000,
                "previous_90d_seen": False,
                "target_collections": ["transactions", "customer_profiles"],
                "user": "svc-analytics",
                "role": "readOnly",
            },
            recommendations=[
                "Verify if the 203.0.113.0/24 range belongs to a known analytics vendor or partner.",
                "If unrecognized, rotate svc-analytics credentials and restrict IP access list.",
                "Review Atlas network peering and VPC configuration for the payments project.",
            ],
            reasoning_trace=[
                R(role="agent", content="Analyzing Atlas audit logs for payments-prod. Looking for behavioral anomalies \u2014 new IPs, unusual access patterns, off-hours activity."),
                R(role="tool", content="GET /api/atlas/v2/groups/{groupId}/dbAccessHistory/clusters/payments-prod?start=2026-04-08T00:00:00Z"),
                R(role="data", content='{"accessLogs": [{"ipAddress": "203.0.113.42", "username": "svc-analytics", "authResult": true, "timestamp": "2026-04-08T14:22:31Z"}, ...14000 entries]}'),
                R(role="agent", content="Detected 14,000 read operations from IP range 203.0.113.0/24 in the last 6 hours. Checking if this range has been seen before."),
                R(role="tool", content="Searching 90-day access log history for 203.0.113.0/24..."),
                R(role="data", content='{"matches": 0, "window": "90 days", "note": "First appearance of this IP range"}'),
                R(role="agent", content="This IP range has never accessed this cluster before. All 14,000 operations are reads targeting 'transactions' and 'customer_profiles' \u2014 both PCI-scoped collections."),
                R(role="agent", content="The credentials used are 'svc-analytics' with readOnly role. While the access is read-only (no data mutation risk), the volume and targeting of sensitive collections is concerning."),
                R(role="agent", content="Checking Atlas IP access list: 203.0.113.0/24 is whitelisted with comment 'Added by admin@acme.com on Apr 7'. This may be intentional but warrants verification."),
                R(role="conclusion", content="High-severity security alert. New IP range accessing PCI-scoped data for the first time. No financial savings \u2014 this is a risk/compliance finding. Recommend immediate verification with the admin who whitelisted the range."),
            ],
            created_at=_3H,
        ).model_dump(),

    ]
