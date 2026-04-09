"""LangGraph orchestration for MDBA demo runs (deterministic mock + trace)."""

from __future__ import annotations

import random
from datetime import datetime, timezone
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from app.models import AgentType, FindingSeverity, TraceStep


class RunState(TypedDict, total=False):
    workflow_id: str
    workflow_name: str
    run_id: str
    steps: list[dict[str, Any]]
    trace: list[dict[str, Any]]
    findings: list[dict[str, Any]]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _trace_append(trace: list[dict[str, Any]], node: str, message: str, detail: dict | None = None) -> None:
    trace.append(
        {
            "node": node,
            "message": message,
            "detail": detail,
            "at": _now().isoformat(),
        }
    )


# ---------------------------------------------------------------------------
# Finding pools — each agent has multiple possible findings to pick from
# ---------------------------------------------------------------------------

_SPEND_FINDINGS: list[dict[str, Any]] = [
    {
        "title": "Cross-region data transfer spike on prod-east-1",
        "summary": (
            "Data transfer costs increased 34% week-over-week ($4,120 → $5,521). "
            "Three collections drive 89% of the increase: user_events (41%), audit_logs (31%), "
            "session_data (17%). A new analytics pipeline deployed Tuesday performs cross-region reads "
            "that should be routed to a local read replica instead."
        ),
        "severity": FindingSeverity.high.value,
        "estimated_monthly_savings_usd": 1520.0,
        "evidence": {
            "cluster": "prod-east-1",
            "baseline_weekly_avg": 4120,
            "current_week": 5521,
            "delta_pct": 34,
            "top_collections": ["user_events", "audit_logs", "session_data"],
            "likely_cause": "Cross-region analytics pipeline (deployed Apr 2)",
        },
        "recommendations": [
            "Route analytics reads to a local read replica — est. $900/mo saved on transfer fees.",
            "Add TTL index on audit_logs.created_at (90-day retention) — est. $340/mo on storage.",
            "Archive session_data older than 30 days to Online Archive — est. $280/mo.",
        ],
    },
    {
        "title": "Storage tier mismatch — $890/mo on underutilized M50 clusters",
        "summary": (
            "Two clusters (staging-west, internal-tools) are provisioned as M50 but average only 12% CPU "
            "and 8% memory utilization over the last 30 days. Downgrading to M30 would meet current "
            "workload requirements with headroom."
        ),
        "severity": FindingSeverity.medium.value,
        "estimated_monthly_savings_usd": 890.0,
        "evidence": {
            "clusters": ["staging-west", "internal-tools"],
            "current_tier": "M50",
            "recommended_tier": "M30",
            "avg_cpu_pct": 12,
            "avg_mem_pct": 8,
            "period": "Last 30 days",
        },
        "recommendations": [
            "Downgrade staging-west to M30 during the next maintenance window — est. $520/mo.",
            "Downgrade internal-tools to M30 — est. $370/mo.",
            "Set up auto-scaling with a ceiling of M50 to handle traffic spikes without manual intervention.",
        ],
    },
    {
        "title": "Compute spend growing 11% month-over-month — ahead of data growth",
        "summary": (
            "Total compute spend across the estate grew from $18,400 to $20,424 while data volume "
            "only grew 3%. The gap suggests queries are becoming less efficient or workload routing is "
            "suboptimal. The analytics-readonly cluster saw the largest increase (+18%) due to new "
            "aggregation pipelines that don't leverage indexes."
        ),
        "severity": FindingSeverity.medium.value,
        "estimated_monthly_savings_usd": 680.0,
        "evidence": {
            "compute_growth_pct": 11,
            "data_growth_pct": 3,
            "prior_month": 18400,
            "current_month": 20424,
            "largest_increase": {"cluster": "analytics-readonly", "delta_pct": 18},
        },
        "recommendations": [
            "Profile top 10 aggregation pipelines on analytics-readonly — look for missing $match indexes.",
            "Consider dedicated analytics nodes with lower-priority scheduling to reduce compute contention.",
            "Review workload isolation: OLTP and analytics sharing the same cluster penalizes both.",
        ],
    },
]

_SLOW_QUERY_FINDINGS: list[dict[str, Any]] = [
    {
        "title": "COLLSCAN on orders collection — 2.4M docs scanned per query",
        "summary": (
            "The query db.orders.find({status: 'pending', created_at: {$gte: ...}}) scans the full "
            "2.4M-document collection. P95 latency is 842ms. This pattern runs ~1,200 times/hour "
            "from the order-fulfillment service. A compound index eliminates the scan entirely."
        ),
        "severity": FindingSeverity.high.value,
        "estimated_monthly_savings_usd": 480.0,
        "evidence": {
            "cluster": "prod-east-1",
            "collection": "orders",
            "document_count": 2_400_000,
            "scan_type": "COLLSCAN",
            "p95_ms": 842,
            "calls_per_hour": 1200,
        },
        "recommendations": [
            "Create compound index: db.orders.createIndex({status: 1, created_at: -1}) — est. 340x improvement.",
            "After indexing, re-profile to confirm p95 drops below 5ms.",
        ],
    },
    {
        "title": "Unoptimized aggregation on page_views — sequential scan 380ms avg",
        "summary": (
            "An aggregation pipeline with $match on user_id + $group by page runs 380ms on average. "
            "The $match stage doesn't use an index because user_id is nested in a sub-document. "
            "Hoisting user_id to a top-level field or adding a sub-document index fixes this."
        ),
        "severity": FindingSeverity.medium.value,
        "estimated_monthly_savings_usd": 340.0,
        "evidence": {
            "cluster": "prod-east-1",
            "collection": "analytics.page_views",
            "pipeline_stages": ["$match", "$group", "$sort", "$limit"],
            "avg_ms": 380,
            "calls_per_hour": 90,
        },
        "recommendations": [
            "Create index on 'metadata.user_id' or hoist user_id to top level.",
            "Add $project before $group to limit fields flowing through the pipeline.",
        ],
    },
    {
        "title": "Regex queries on user_profiles.email causing scan — 620ms P99",
        "summary": (
            "A case-insensitive regex search on email addresses scans the entire user_profiles "
            "collection (1.2M docs). This pattern is called by the admin search UI ~200 times/hour. "
            "An Atlas Search index with keyword analyzer would make this sub-10ms."
        ),
        "severity": FindingSeverity.medium.value,
        "estimated_monthly_savings_usd": 290.0,
        "evidence": {
            "cluster": "prod-east-1",
            "collection": "user_profiles",
            "document_count": 1_200_000,
            "pattern": "/.+@example\\.com$/i",
            "p99_ms": 620,
            "calls_per_hour": 200,
        },
        "recommendations": [
            "Create an Atlas Search index with keyword analyzer on the email field.",
            "Alternatively, store a normalized (lowercased) email_lower field with a standard index.",
        ],
    },
]

_BACKUP_FINDINGS: list[dict[str, Any]] = [
    {
        "title": "Over-snapshotting on 8 low-churn clusters — $1,240/mo excess",
        "summary": (
            "8 of 12 clusters take hourly snapshots but change less than 0.5% of data per day. "
            "Switching to daily snapshots with continuous backup maintains the same RPO while "
            "reducing snapshot storage by 71%."
        ),
        "severity": FindingSeverity.medium.value,
        "estimated_monthly_savings_usd": 1240.0,
        "evidence": {
            "clusters_affected": 8,
            "avg_daily_churn_pct": 0.3,
            "current_interval": "hourly",
            "recommended_interval": "daily + continuous backup",
            "storage_reduction_pct": 71,
        },
        "recommendations": [
            "Switch low-churn clusters to daily snapshots — Atlas continuous backup keeps sub-hour RPO.",
            "Review compliance requirements for the remaining 4 clusters before changing schedule.",
            "Estimated combined savings: $1,240/month ($14,880/year).",
        ],
    },
    {
        "title": "Backup retention exceeds policy — 180 days vs 90-day requirement",
        "summary": (
            "3 clusters retain snapshots for 180 days, but the company's data retention policy "
            "requires only 90 days. The excess 90 days of snapshots consume 340GB across the clusters. "
            "Aligning retention to policy frees storage."
        ),
        "severity": FindingSeverity.low.value,
        "estimated_monthly_savings_usd": 410.0,
        "evidence": {
            "clusters": ["prod-east-1", "prod-west-2", "payments-prod"],
            "current_retention_days": 180,
            "policy_days": 90,
            "excess_storage_gb": 340,
        },
        "recommendations": [
            "Reduce snapshot retention to 90 days on the 3 affected clusters.",
            "Archive older snapshots to S3 if compliance requires cold storage beyond 90 days.",
        ],
    },
]

_INDEX_FINDINGS: list[dict[str, Any]] = [
    {
        "title": "23 unused indexes across 12 clusters — 47GB storage",
        "summary": (
            "Index scan found 23 indexes with zero operations in 30 days. Combined storage: 47GB. "
            "Top offenders are on legacy_reports and import_staging — collections no longer queried "
            "by any active application service."
        ),
        "severity": FindingSeverity.medium.value,
        "estimated_monthly_savings_usd": 630.0,
        "evidence": {
            "unused_count": 23,
            "storage_gb": 47,
            "window_days": 30,
            "top_collections": ["legacy_reports", "import_staging", "migration_cache"],
        },
        "recommendations": [
            "Drop 18 confirmed-unused indexes on legacy collections (human approval required).",
            "Hold 5 indexes on import_staging — next ETL run is scheduled for Apr 15.",
            "Net storage savings: 47GB ≈ $630/month.",
        ],
    },
    {
        "title": "Duplicate compound indexes on transactions — redundant coverage",
        "summary": (
            "Two indexes on the transactions collection overlap: {user_id: 1, created_at: -1} "
            "and {user_id: 1, created_at: -1, status: 1}. The latter is a superset and covers "
            "all queries the former handles. Removing the shorter index saves 12GB."
        ),
        "severity": FindingSeverity.low.value,
        "estimated_monthly_savings_usd": 180.0,
        "evidence": {
            "collection": "transactions",
            "redundant_index": "{user_id: 1, created_at: -1}",
            "superset_index": "{user_id: 1, created_at: -1, status: 1}",
            "storage_gb": 12,
        },
        "recommendations": [
            "Drop the shorter index after verifying no hint() directives reference it.",
            "Monitor query plans for 48 hours post-drop to confirm no regressions.",
        ],
    },
]

_SECURITY_FINDINGS: list[dict[str, Any]] = [
    {
        "title": "Unusual read volume from new IP range on payments cluster",
        "summary": (
            "Atlas audit logs show 14,000 reads from 203.0.113.0/24 in 6 hours — a range not seen "
            "in 90 days. All reads target transactions and customer_profiles using svc-analytics (read-only). "
            "Verify if this is a known analytics vendor or potential unauthorized access."
        ),
        "severity": FindingSeverity.high.value,
        "estimated_monthly_savings_usd": None,
        "evidence": {
            "cluster": "payments-prod",
            "ip_range": "203.0.113.0/24",
            "read_count_6h": 14000,
            "target_collections": ["transactions", "customer_profiles"],
            "user": "svc-analytics",
            "role": "readOnly",
        },
        "recommendations": [
            "Verify if 203.0.113.0/24 belongs to a known analytics vendor or partner.",
            "If unrecognized, rotate svc-analytics credentials and restrict IP access list.",
            "Review Atlas network peering and VPC configuration for the payments project.",
        ],
    },
    {
        "title": "Database user with unused admin privileges — svc-migration",
        "summary": (
            "The svc-migration user has atlasAdmin role but hasn't authenticated in 67 days. "
            "This account was likely created for a one-time migration and should be downgraded "
            "or removed per least-privilege principles."
        ),
        "severity": FindingSeverity.medium.value,
        "estimated_monthly_savings_usd": None,
        "evidence": {
            "user": "svc-migration",
            "role": "atlasAdmin",
            "last_auth_days_ago": 67,
            "cluster": "prod-east-1",
        },
        "recommendations": [
            "Remove or downgrade svc-migration to readOnly if still needed.",
            "Implement a 30-day idle-user review policy for all admin-level accounts.",
        ],
    },
]

_DATA_QUALITY_FINDINGS: list[dict[str, Any]] = [
    {
        "title": "Transaction amount outliers — 47 records exceed 3-sigma threshold",
        "summary": (
            "47 documents inserted in 24 hours have transaction_amount values exceeding 3 standard "
            "deviations from the 30-day mean ($312). Largest: $94,200 (ord_8f2a9c). This could "
            "indicate a pricing bug in enterprise checkout or legitimate large orders."
        ),
        "severity": FindingSeverity.medium.value,
        "estimated_monthly_savings_usd": None,
        "evidence": {
            "collection": "transactions",
            "outlier_count": 47,
            "mean_30d": 312,
            "std_dev": 890,
            "max_outlier": 94200,
            "detection": "z-score > 3",
        },
        "recommendations": [
            "Review the 47 flagged transactions — cross-reference with enterprise checkout deploy.",
            "Add application-level validation for transaction_amount > $10,000.",
            "Consider schema validation: { transaction_amount: { $lte: 50000 } }.",
        ],
    },
    {
        "title": "Missing required fields in 2.1% of customer_profiles documents",
        "summary": (
            "Schema analysis found 4,218 documents (2.1%) in customer_profiles missing the "
            "email_verified field. These correlate with a bulk import on Mar 28. The application "
            "treats missing email_verified as false, causing 4K+ users to be flagged for re-verification."
        ),
        "severity": FindingSeverity.low.value,
        "estimated_monthly_savings_usd": None,
        "evidence": {
            "collection": "customer_profiles",
            "missing_field": "email_verified",
            "affected_docs": 4218,
            "total_docs": 198_400,
            "pct": 2.1,
            "likely_cause": "Bulk import Mar 28",
        },
        "recommendations": [
            "Backfill email_verified: false on the 4,218 affected documents.",
            "Add schema validation to require email_verified on insert.",
            "Update the import pipeline to include all required fields.",
        ],
    },
]

_SCALING_FINDINGS: list[dict[str, Any]] = [
    {
        "title": "prod-east-1 storage projected to hit limit in 23 days",
        "summary": (
            "At the current growth rate (2.8GB/day), prod-east-1 will reach its 500GB storage "
            "limit in approximately 23 days. Current usage: 436GB. Either increase the tier, "
            "enable auto-scaling, or archive stale data to stay within limits."
        ),
        "severity": FindingSeverity.high.value,
        "estimated_monthly_savings_usd": None,
        "evidence": {
            "cluster": "prod-east-1",
            "current_storage_gb": 436,
            "limit_gb": 500,
            "daily_growth_gb": 2.8,
            "days_until_full": 23,
        },
        "recommendations": [
            "Enable storage auto-scaling to prevent a hard stop at 500GB.",
            "Archive or TTL data older than the retention window to slow growth.",
            "Consider moving to M60 if sustained growth continues.",
        ],
    },
]

_FINDING_POOLS: dict[str, list[dict[str, Any]]] = {
    AgentType.spend.value: _SPEND_FINDINGS,
    AgentType.slow_query.value: _SLOW_QUERY_FINDINGS,
    AgentType.backup.value: _BACKUP_FINDINGS,
    AgentType.index_rationalization.value: _INDEX_FINDINGS,
    AgentType.security.value: _SECURITY_FINDINGS,
    AgentType.data_quality.value: _DATA_QUALITY_FINDINGS,
    AgentType.scaling.value: _SCALING_FINDINGS,
}


def _generate_reasoning(agent: str, finding: dict[str, Any]) -> list[dict[str, str]]:
    """Build a plausible agent reasoning trace based on the finding data."""
    title = finding.get("title", "")
    evidence = finding.get("evidence", {})
    savings = finding.get("estimated_monthly_savings_usd")
    recs = finding.get("recommendations", [])
    steps: list[dict[str, str]] = []

    agent_labels = {
        "spend": "Spend Baseline Agent",
        "slow_query": "Query Performance Agent",
        "backup": "Backup Rationalization Agent",
        "index_rationalization": "Index Health Agent",
        "security": "Security Anomaly Agent",
        "data_quality": "Data Quality Agent",
        "scaling": "Capacity Planning Agent",
    }
    label = agent_labels.get(agent, f"{agent} Agent")
    steps.append({"role": "agent", "content": f"{label} activated. Collecting signals from Atlas APIs and cluster telemetry."})

    # Data retrieval based on agent type
    if agent == "spend":
        steps.append({"role": "tool", "content": "GET /api/atlas/v2/orgs/{orgId}/invoices?fromDate=2026-03-01"})
        steps.append({"role": "data", "content": f'{{"cluster": "{evidence.get("cluster", "prod-east-1")}", "billing_data": "retrieved"}}'})
        steps.append({"role": "agent", "content": f"Comparing current period against 30-day rolling baseline. Detected: {title.lower()}."})
    elif agent == "slow_query":
        col = evidence.get("collection", "orders")
        steps.append({"role": "tool", "content": f"db.system.profile.find({{millis: {{$gt: 100}}}}).sort({{ts: -1}})"})
        steps.append({"role": "data", "content": f'{{"collection": "{col}", "profiler_hits": "found"}}'})
        steps.append({"role": "agent", "content": f"Profiler analysis on {col}: {title.lower()}."})
        steps.append({"role": "tool", "content": f"db.{col}.find({{...}}).explain('executionStats')"})
    elif agent == "backup":
        steps.append({"role": "tool", "content": "GET /api/atlas/v2/groups/{groupId}/clusters/*/backup/schedule"})
        steps.append({"role": "agent", "content": "Cross-referencing snapshot frequency with oplog-derived data change rates."})
    elif agent == "index_rationalization":
        steps.append({"role": "tool", "content": "db.getCollectionNames().forEach(c => db[c].aggregate([{$indexStats: {}}]))"})
        steps.append({"role": "data", "content": f'{{"unused_indexes": {evidence.get("unused_count", evidence.get("storage_gb", "?"))}}}'})
    elif agent == "security":
        steps.append({"role": "tool", "content": "GET /api/atlas/v2/groups/{groupId}/dbAccessHistory/clusters/{cluster}"})
        steps.append({"role": "agent", "content": "Scanning access logs for behavioral anomalies \u2014 new IPs, off-hours activity, privilege escalation."})
    elif agent == "data_quality":
        steps.append({"role": "tool", "content": f'db.{evidence.get("collection", "data")}.aggregate([{{$group: {{_id: null, mean: {{$avg: "$field"}}, stddev: {{$stdDevPop: "$field"}}}}}}])'})
        steps.append({"role": "agent", "content": "Computing statistical baselines and checking for outliers beyond configured thresholds."})
    elif agent == "scaling":
        steps.append({"role": "tool", "content": "GET /api/atlas/v2/groups/{groupId}/processes/{host}/measurements"})
        steps.append({"role": "agent", "content": "Projecting storage and compute utilization trends against current tier limits."})

    # Analysis
    ev_keys = list(evidence.keys())[:3]
    if ev_keys:
        ev_summary = ", ".join(f"{k}={evidence[k]}" for k in ev_keys if not isinstance(evidence[k], (list, dict)))
        if ev_summary:
            steps.append({"role": "data", "content": f"Key signals: {ev_summary}"})
    steps.append({"role": "agent", "content": f"Analysis complete. Finding: {title}."})

    # Conclusion with savings
    if savings:
        steps.append({"role": "conclusion", "content": f"Estimated addressable savings: ${savings:,.0f}/month (${savings * 12:,.0f}/year). {recs[0] if recs else ''}"})
    else:
        steps.append({"role": "conclusion", "content": f"Risk/compliance finding \u2014 no direct cost savings. {recs[0] if recs else 'Recommend manual review.'}"})

    return steps


def _pick_finding(agent: str) -> dict[str, Any]:
    pool = _FINDING_POOLS.get(agent)
    if not pool:
        return {
            "agent": agent,
            "title": f"Signal check: {agent}",
            "summary": "No anomalies detected in demo mode for this agent type.",
            "severity": FindingSeverity.low.value,
            "estimated_monthly_savings_usd": None,
            "evidence": {},
            "recommendations": ["Tune thresholds or connect live Atlas APIs for production signal."],
            "reasoning_trace": [
                {"role": "agent", "content": f"Agent '{agent}' executed in demo mode. No live Atlas data available."},
                {"role": "conclusion", "content": "No anomalies detected. Connect live APIs for production signals."},
            ],
        }
    picked = random.choice(pool)
    result = {"agent": agent, **picked}
    result["reasoning_trace"] = _generate_reasoning(agent, result)
    return result


# ---------------------------------------------------------------------------
# Pipeline nodes
# ---------------------------------------------------------------------------

def node_ingest(state: RunState) -> RunState:
    trace = list(state.get("trace") or [])
    steps = state.get("steps") or []
    agents = [s.get("agent", "unknown") for s in steps]
    _trace_append(
        trace,
        "ingest",
        f"Collected Atlas billing, metrics, and profiler data for {len(agents)} agent(s): {', '.join(agents)}.",
        {"agents": agents},
    )
    return {**state, "trace": trace}


def node_analyze(state: RunState) -> RunState:
    trace = list(state.get("trace") or [])
    steps = state.get("steps") or []
    _trace_append(
        trace,
        "analyze",
        f"Running analysis across {len(steps)} configured agent step(s).",
        {"agents": [s.get("agent") for s in steps]},
    )

    findings: list[dict[str, Any]] = []
    for step in steps:
        agent = step.get("agent", "unknown")
        finding = _pick_finding(agent)
        findings.append(finding)
        _trace_append(
            trace,
            "analyze",
            f"[{agent}] {finding['title']} — severity: {finding['severity']}"
            + (f", est. ${finding['estimated_monthly_savings_usd']:.0f}/mo" if finding.get("estimated_monthly_savings_usd") else ""),
            {"agent": agent, "severity": finding["severity"]},
        )

    _trace_append(trace, "analyze", f"Produced {len(findings)} finding(s).", {"count": len(findings)})
    return {**state, "trace": trace, "findings": findings}


def node_synthesize(state: RunState) -> RunState:
    trace = list(state.get("trace") or [])
    findings = state.get("findings") or []
    total_savings = sum(f.get("estimated_monthly_savings_usd") or 0 for f in findings)
    high_count = sum(1 for f in findings if f.get("severity") in ("high", "critical"))
    _trace_append(
        trace,
        "synthesize",
        f"Ranked {len(findings)} findings by severity and TCO impact. "
        f"Total addressable: ${total_savings:,.0f}/mo. {high_count} high/critical.",
        {"total_savings_usd": total_savings, "high_count": high_count},
    )
    return {**state, "trace": trace}


def node_deliver(state: RunState) -> RunState:
    trace = list(state.get("trace") or [])
    n = len(state.get("findings") or [])
    _trace_append(
        trace,
        "deliver",
        f"Published {n} finding(s) to inbox. Human approval required for any write operations.",
    )
    return {**state, "trace": trace}


def build_graph():
    g = StateGraph(RunState)
    g.add_node("ingest", node_ingest)
    g.add_node("analyze", node_analyze)
    g.add_node("synthesize", node_synthesize)
    g.add_node("deliver", node_deliver)
    g.set_entry_point("ingest")
    g.add_edge("ingest", "analyze")
    g.add_edge("analyze", "synthesize")
    g.add_edge("synthesize", "deliver")
    g.add_edge("deliver", END)
    return g.compile()


_compiled = None


def get_compiled_graph():
    global _compiled
    if _compiled is None:
        _compiled = build_graph()
    return _compiled


def _trace_dicts_to_models(rows: list[dict[str, Any]]) -> list[TraceStep]:
    out: list[TraceStep] = []
    for r in rows:
        at = r.get("at")
        if isinstance(at, str):
            parsed = datetime.fromisoformat(at.replace("Z", "+00:00"))
        else:
            parsed = _now()
        out.append(
            TraceStep(
                node=r["node"],
                message=r["message"],
                detail=r.get("detail"),
                at=parsed,
            )
        )
    return out


def execute_workflow_run(
    *,
    run_id: str,
    workflow_id: str,
    workflow_name: str,
    steps: list[dict[str, Any]],
) -> tuple[list[TraceStep], list[dict[str, Any]]]:
    graph = get_compiled_graph()
    initial: RunState = {
        "run_id": run_id,
        "workflow_id": workflow_id,
        "workflow_name": workflow_name,
        "steps": steps,
        "trace": [],
        "findings": [],
    }
    final = graph.invoke(initial)
    raw_trace = final.get("trace") or []
    return _trace_dicts_to_models(raw_trace), final.get("findings") or []
