"""LangGraph orchestration for MDBA demo runs (deterministic mock + trace)."""

from __future__ import annotations

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


def node_ingest(state: RunState) -> RunState:
    trace = list(state.get("trace") or [])
    _trace_append(trace, "ingest", "Collected Atlas metrics and billing signals (demo).")
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
        agent = step.get("agent")
        if agent == AgentType.spend.value:
            findings.append(
                {
                    "agent": AgentType.spend.value,
                    "title": "Spend deviation vs 30-day baseline",
                    "summary": (
                        "Data transfer is 18% above the rolling baseline; three collections "
                        "account for most of the increase. Review TTL/archival on audit-heavy collections."
                    ),
                    "severity": FindingSeverity.high.value,
                    "estimated_monthly_savings_usd": 420.0,
                    "evidence": {"baseline_delta_pct": 18, "top_collections": ["audit_logs", "user_events", "sessions"]},
                    "recommendations": [
                        "Add TTL on audit_logs.created_at aligned with retention policy.",
                        "Archive cold session documents older than 30 days.",
                    ],
                }
            )
        elif agent == AgentType.slow_query.value:
            findings.append(
                {
                    "agent": AgentType.slow_query.value,
                    "title": "Repeated COLLSCAN on hot path",
                    "summary": (
                        "Orders status + date filter lacks a supporting index; explain shows full collection scan."
                    ),
                    "severity": FindingSeverity.medium.value,
                    "estimated_monthly_savings_usd": 180.0,
                    "evidence": {"collection": "orders", "ms_p95": 842},
                    "recommendations": [
                        "Create compound index { status: 1, created_at: -1 } and re-test with explain.",
                    ],
                }
            )
        elif agent == AgentType.backup.value:
            findings.append(
                {
                    "agent": AgentType.backup.value,
                    "title": "Backup frequency vs change rate",
                    "summary": "Hourly snapshots on a low-churn dataset; daily may meet RPO with lower storage cost.",
                    "severity": FindingSeverity.low.value,
                    "estimated_monthly_savings_usd": 95.0,
                    "evidence": {"daily_churn_pct": 0.3},
                    "recommendations": ["Evaluate daily snapshots + point-in-time recovery requirements."],
                }
            )
        else:
            findings.append(
                {
                    "agent": agent or "unknown",
                    "title": f"Signal check: {step.get('label', agent)}",
                    "summary": "No anomalies detected in demo mode for this agent type.",
                    "severity": FindingSeverity.low.value,
                    "estimated_monthly_savings_usd": None,
                    "evidence": {},
                    "recommendations": ["Tune thresholds or connect live Atlas APIs for production signal."],
                }
            )

    _trace_append(trace, "analyze", f"Produced {len(findings)} finding(s).", {"count": len(findings)})
    return {**state, "trace": trace, "findings": findings}


def node_synthesize(state: RunState) -> RunState:
    trace = list(state.get("trace") or [])
    n = len(state.get("findings") or [])
    _trace_append(
        trace,
        "synthesize",
        "Ranked findings by severity and estimated TCO impact.",
        {"findings": n},
    )
    return {**state, "trace": trace}


def node_deliver(state: RunState) -> RunState:
    trace = list(state.get("trace") or [])
    _trace_append(trace, "deliver", "Published findings to inbox (demo; wire Slack/email in production).")
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
