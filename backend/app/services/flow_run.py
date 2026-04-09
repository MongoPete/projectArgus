"""Mock flow-runner: ordered tool steps with rich, realistic Atlas / MongoDB / Slack output (demo)."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any


def _node_y(node: dict[str, Any]) -> float:
    pos = node.get("position") or {}
    return float(pos.get("y", 0))


def order_nodes(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not nodes:
        return []
    if not edges:
        return sorted(nodes, key=_node_y)
    by_id = {n["id"]: n for n in nodes}
    targets = {e["target"] for e in edges}
    roots = [n for n in nodes if n["id"] not in targets]
    if not roots:
        return sorted(nodes, key=_node_y)
    start = min(roots, key=_node_y)
    adj: dict[str, str] = {}
    for e in edges:
        adj[e["source"]] = e["target"]
    out: list[dict[str, Any]] = []
    cur: str | None = start["id"]
    seen: set[str] = set()
    while cur and cur not in seen:
        seen.add(cur)
        if cur in by_id:
            out.append(by_id[cur])
        cur = adj.get(cur)
    for n in sorted(nodes, key=_node_y):
        if n["id"] not in seen:
            out.append(n)
    return out


def _extract_org_id(prompt: str) -> str | None:
    m = re.search(r"org[:\s]+([a-f0-9]{24})", prompt, re.I)
    if m:
        return m.group(1)
    m = re.search(r"\b([a-f0-9]{24})\b", prompt)
    return m.group(1) if m else None


def mock_run_flow(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return list of log entries: {kind, content}."""
    ordered = order_nodes(nodes, edges)
    entries: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc)
    prior_snippet = ""
    total_steps = len(ordered)

    entries.append({
        "kind": "heading",
        "content": f"MDBA Flow Runner v1.0",
    })
    entries.append({
        "kind": "text",
        "content": f"flow-runner · {now.strftime('%Y-%m-%d %H:%M:%S')} UTC",
    })
    entries.append({
        "kind": "text",
        "content": f"Pipeline: {total_steps} step(s) · edges: {len(edges)}",
    })
    entries.append({
        "kind": "text",
        "content": "Demo execution — no live Atlas calls. Logs simulate the runner.\n",
    })

    for i, node in enumerate(ordered):
        data = node.get("data") or {}
        tool = str(data.get("tool", "unknown"))
        label = str(data.get("label", node.get("id", "step")))
        nid = str(node.get("id", ""))
        prompt = str(data.get("prompt", "")).strip()
        use_memory = bool(data.get("include_prior_memory"))

        entries.append({
            "kind": "state",
            "content": json.dumps({
                "node_id": nid,
                "step": i + 1,
                "label": label,
                "tool": tool,
                "phase": "start",
                "memory_on": use_memory,
            }, indent=2),
        })

        entries.append({"kind": "heading", "content": f"Step {i + 1}/{total_steps}: {label} ({tool})"})

        if use_memory and prior_snippet:
            entries.append({
                "kind": "text",
                "content": "Memory: prior step output attached as context.",
            })
            truncated = prior_snippet[:500] + ("…" if len(prior_snippet) > 500 else "")
            entries.append({"kind": "code", "content": truncated})
        elif use_memory and not prior_snippet:
            entries.append({"kind": "text", "content": "Memory toggle on, but no prior output yet."})

        low = prompt.lower()

        if tool == "atlas_api":
            org = _extract_org_id(prompt) or "5f32de177f39cd00a6fb1071"

            if "invoice" in low and ("fromdate" in low.replace(" ", "") or "previous" in low or "month" in low):
                entries.append({"kind": "text", "content": (
                    "Reasoning: The prompt asks for previous month invoices with a date boundary. "
                    "I'll use the Atlas Admin API v2 invoices endpoint with fromDate set to the first "
                    "of last month. This bounds the response window and avoids pulling the full history."
                )})
                entries.append({"kind": "text", "content": "→ Constructing API request..."})
                entries.append({"kind": "code", "content": (
                    f"GET https://cloud.mongodb.com/api/atlas/v2/orgs/{org}/invoices\n"
                    f"  ?fromDate=2026-03-01T00:00:00Z\n"
                    f"  &toDate=2026-03-31T23:59:59Z\n"
                    f"Authorization: Bearer <atlas_oauth_token>"
                )})
                entries.append({"kind": "text", "content": "← Response 200 OK (2 invoices)"})
                body = {
                    "totalCount": 2,
                    "results": [
                        {
                            "id": "inv_66a1b2c3d4e5f6789",
                            "orgId": org,
                            "periodStartDate": "2026-03-01T00:00:00Z",
                            "periodEndDate": "2026-03-15T23:59:59Z",
                            "subtotalCents": 2_847_320,
                            "totalAmountCents": 2_847_320,
                            "lineItems": [
                                {"clusterName": "prod-east-1", "sku": "CLUSTER_COMPUTE", "totalPriceCents": 1_420_000},
                                {"clusterName": "prod-east-1", "sku": "DATA_TRANSFER", "totalPriceCents": 521_400},
                                {"clusterName": "prod-east-1", "sku": "BACKUP_STORAGE", "totalPriceCents": 348_720},
                                {"clusterName": "analytics-readonly", "sku": "CLUSTER_COMPUTE", "totalPriceCents": 557_200},
                            ],
                        },
                        {
                            "id": "inv_77b2c3d4e5f67890a",
                            "orgId": org,
                            "periodStartDate": "2026-03-16T00:00:00Z",
                            "periodEndDate": "2026-03-31T23:59:59Z",
                            "subtotalCents": 3_102_080,
                            "totalAmountCents": 3_102_080,
                            "lineItems": [
                                {"clusterName": "prod-east-1", "sku": "CLUSTER_COMPUTE", "totalPriceCents": 1_420_000},
                                {"clusterName": "prod-east-1", "sku": "DATA_TRANSFER", "totalPriceCents": 698_200},
                                {"clusterName": "prod-east-1", "sku": "BACKUP_STORAGE", "totalPriceCents": 412_880},
                                {"clusterName": "analytics-readonly", "sku": "CLUSTER_COMPUTE", "totalPriceCents": 571_000},
                            ],
                        },
                    ],
                }
                entries.append({"kind": "json", "content": json.dumps(body, indent=2)})
                entries.append({"kind": "text", "content": (
                    "Analysis: Total backup cost across both periods: "
                    f"${(348_720 + 412_880) / 100:,.2f}. "
                    f"Data transfer increased from $5,214.00 to $6,982.00 (+33.9%)."
                )})
                prior_snippet = json.dumps({
                    "invoice_count": 2,
                    "total_backup_cost_cents": 761_600,
                    "total_data_transfer_cents": 1_219_600,
                    "data_transfer_delta_pct": 33.9,
                    "clusters": ["prod-east-1", "analytics-readonly"],
                })

            elif "line item" in low or "detail" in low or "summarize" in low:
                entries.append({"kind": "text", "content": (
                    "Reasoning: The prompt asks for invoice line item details and per-cluster breakdown. "
                    "I'll iterate over each invoice ID from the prior step and call the "
                    "invoice details endpoint. Then I'll summarize total backup cost by cluster."
                )})
                entries.append({"kind": "code", "content": (
                    f"GET https://cloud.mongodb.com/api/atlas/v2/orgs/{org}/invoices/inv_66a1b2c3d4e5f6789\n"
                    f"Authorization: Bearer <atlas_oauth_token>"
                )})
                entries.append({"kind": "text", "content": "← Response 200 OK"})
                detail = {
                    "id": "inv_66a1b2c3d4e5f6789",
                    "lineItems": [
                        {"clusterName": "prod-east-1", "sku": "BACKUP_CONTINUOUS", "quantity": 720, "unitPriceDollars": 0.0025, "totalPriceCents": 180_000},
                        {"clusterName": "prod-east-1", "sku": "BACKUP_SNAPSHOT_STORAGE", "quantity": 1240, "unitPriceDollars": 0.0020, "totalPriceCents": 248_000},
                        {"clusterName": "staging-west", "sku": "BACKUP_CONTINUOUS", "quantity": 720, "unitPriceDollars": 0.0015, "totalPriceCents": 108_000},
                        {"clusterName": "staging-west", "sku": "BACKUP_SNAPSHOT_STORAGE", "quantity": 890, "unitPriceDollars": 0.0015, "totalPriceCents": 133_500},
                    ],
                }
                entries.append({"kind": "json", "content": json.dumps(detail, indent=2)})
                entries.append({"kind": "text", "content": (
                    "Summary: prod-east-1 backup: $4,280.00/period. staging-west: $2,415.00/period. "
                    "Combined backup spend: $6,695.00. This is 22% of total invoice."
                )})
                prior_snippet = json.dumps({
                    "backup_by_cluster": {
                        "prod-east-1": {"cents": 428_000, "period": "2026-03-01 to 2026-03-15"},
                        "staging-west": {"cents": 241_500, "period": "2026-03-01 to 2026-03-15"},
                    },
                    "total_backup_cents": 669_500,
                    "pct_of_total": 22,
                })

            else:
                entries.append({"kind": "text", "content": (
                    "Reasoning: Interpreting operator prompt against Atlas Admin API schema. "
                    "Mapping intent to the most relevant v2 endpoint."
                )})
                entries.append({"kind": "code", "content": (
                    f"GET https://cloud.mongodb.com/api/atlas/v2/orgs/{org}/invoices\n"
                    f"Authorization: Bearer <atlas_oauth_token>"
                )})
                entries.append({"kind": "text", "content": "← Response 200 OK"})
                body = {
                    "totalCount": 1,
                    "results": [{"id": "inv_demo", "totalAmountCents": 4_712_000}],
                }
                entries.append({"kind": "json", "content": json.dumps(body, indent=2)})
                prior_snippet = json.dumps(body)

        elif tool == "mongodb":
            entries.append({"kind": "text", "content": (
                "Reasoning: Interpreting operator prompt and tool schema (mock). "
                "Querying system.profile for slow operations and $collStats for collection-level metrics."
            )})
            entries.append({"kind": "text", "content": "→ Executing against prod-east-1..."})
            entries.append({"kind": "code", "content": (
                "db.system.profile.find({ millis: { $gt: 100 } }).limit(5)\n"
                "  .sort({ ts: -1 })"
            )})
            entries.append({"kind": "text", "content": "← 2 documents returned"})
            profile_results = {
                "ok": 1,
                "n": 2,
                "sample": [
                    {
                        "op": "query",
                        "ns": "app.orders",
                        "millis": 842,
                        "planSummary": "COLLSCAN",
                        "keysExamined": 0,
                        "docsExamined": 2_400_000,
                        "nreturned": 47,
                        "query": {"status": "pending", "created_at": {"$gte": "2026-03-01"}},
                    },
                    {
                        "op": "command",
                        "ns": "app.analytics.page_views",
                        "millis": 380,
                        "planSummary": "COLLSCAN",
                        "keysExamined": 0,
                        "docsExamined": 890_000,
                        "nreturned": 1,
                        "command": {"aggregate": "page_views", "pipeline": ["$match", "$group", "$sort"]},
                    },
                ],
            }
            entries.append({"kind": "json", "content": json.dumps(profile_results, indent=2)})

            entries.append({"kind": "text", "content": "\n→ Running explain on hot query pattern..."})
            entries.append({"kind": "code", "content": (
                "db.orders.find({status:'pending', created_at:{$gte:ISODate()}})\n"
                "  .explain('executionStats')"
            )})
            explain_result = {
                "queryPlanner": {
                    "winningPlan": {
                        "stage": "COLLSCAN",
                        "filter": {"$and": [{"status": {"$eq": "pending"}}, {"created_at": {"$gte": "2026-03-01"}}]},
                        "direction": "forward",
                    },
                },
                "executionStats": {
                    "totalDocsExamined": 2_400_000,
                    "totalKeysExamined": 0,
                    "executionTimeMillis": 842,
                    "nReturned": 47,
                },
                "recommendation": "Create compound index: {status: 1, created_at: -1}",
            }
            entries.append({"kind": "json", "content": json.dumps(explain_result, indent=2)})

            entries.append({"kind": "text", "content": (
                "Analysis: COLLSCAN on orders (2.4M docs) at 842ms. "
                "This query runs ~1,200x/hour. A compound index would reduce to <5ms. "
                "Estimated savings: reduced IOPS and latency-related autoscaling overhead."
            )})
            prior_snippet = json.dumps({
                "slow_queries": 2,
                "worst_ms": 842,
                "worst_collection": "orders",
                "scan_type": "COLLSCAN",
                "docs_examined": 2_400_000,
                "recommended_index": "{status: 1, created_at: -1}",
            })

        elif tool == "mdba":
            entries.append({"kind": "text", "content": (
                "Reasoning: MDBA internal reasoning engine activated. Correlating signals from prior "
                "steps with policy templates and historical baselines."
            )})
            if "delta" in low or "subtract" in low or "compare" in low:
                entries.append({"kind": "text", "content": (
                    "→ Computing month-over-month delta from invoice data..."
                )})
                delta_result = {
                    "analysis": "month_over_month_comparison",
                    "prior_period_backup_cents": 548_200,
                    "current_period_backup_cents": 669_500,
                    "delta_cents": 121_300,
                    "delta_pct": 22.1,
                    "threshold_usd": 1000,
                    "exceeds_threshold": True,
                    "confidence": 0.91,
                    "contributing_factors": [
                        "New hourly snapshots enabled on staging-west (was daily)",
                        "prod-east-1 data volume grew 18% (new analytics pipeline)",
                        "3 clusters added continuous backup without removing legacy snapshots",
                    ],
                }
                entries.append({"kind": "json", "content": json.dumps(delta_result, indent=2)})
                entries.append({"kind": "text", "content": (
                    f"Result: Backup costs increased by $1,213.00 (+22.1%). "
                    f"Exceeds the $1,000 threshold. 3 contributing factors identified."
                )})
                prior_snippet = json.dumps({
                    "delta_cents": 121_300,
                    "exceeds_threshold": True,
                    "factors": 3,
                })
            else:
                entries.append({"kind": "text", "content": (
                    "→ Correlating prior signals with policy templates..."
                )})
                correlation = {
                    "analysis_type": "signal_correlation",
                    "signals_evaluated": 4,
                    "anomalies_detected": 2,
                    "policy_violations": 1,
                    "recommendations_generated": 3,
                    "confidence": 0.87,
                }
                entries.append({"kind": "json", "content": json.dumps(correlation, indent=2)})
                entries.append({"kind": "text", "content": (
                    "Result: 2 anomalies detected, 1 policy violation. "
                    "3 actionable recommendations generated with confidence 0.87."
                )})
                prior_snippet = json.dumps(correlation)

        elif tool == "slack":
            if "notification" in low or "alert" in low or "send" in low:
                entries.append({"kind": "text", "content": (
                    "Reasoning: The prompt has a conditional — only send if the delta exceeds the threshold. "
                    "Checking prior step output for threshold status."
                )})
                entries.append({"kind": "text", "content": "→ Evaluating condition: delta > $1,000 (USD basis)"})
                entries.append({"kind": "text", "content": "  Condition met: delta_cents = 121,300 ($1,213.00)"})
                entries.append({"kind": "text", "content": "\n→ Composing Slack message..."})
                entries.append({"kind": "code", "content": (
                    "POST https://slack.com/api/chat.postMessage\n"
                    "Authorization: Bearer xoxb-****\n"
                    "Content-Type: application/json"
                )})
                slack_payload = {
                    "channel": "#atlas-cost-alerts",
                    "blocks": [
                        {
                            "type": "header",
                            "text": {"type": "plain_text", "text": "⚠️ Backup Cost Alert — MDBA"},
                        },
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": (
                                    "*Backup costs increased $1,213/mo (+22.1%)*\n"
                                    "• staging-west: new hourly snapshots (was daily)\n"
                                    "• prod-east-1: data volume up 18%\n"
                                    "• 3 clusters have duplicate snapshot configs"
                                ),
                            },
                        },
                        {
                            "type": "actions",
                            "elements": [
                                {"type": "button", "text": {"type": "plain_text", "text": "Review in MDBA"}, "url": "https://mdba.example.com/findings"},
                            ],
                        },
                    ],
                }
                entries.append({"kind": "json", "content": json.dumps(slack_payload, indent=2)})
                entries.append({"kind": "text", "content": "← Response 200 OK (demo — not actually sent)"})
                slack_response = {"ok": True, "channel": "C0ATLAS01", "ts": "1712412345.000200", "message": {"text": "Backup Cost Alert"}}
                entries.append({"kind": "json", "content": json.dumps(slack_response, indent=2)})
                prior_snippet = "slack_notification_sent"
            else:
                entries.append({"kind": "text", "content": "Reasoning: Composing Slack notification from prior context."})
                entries.append({"kind": "code", "content": "POST https://slack.com/api/chat.postMessage (demo — not sent)"})
                entries.append({"kind": "json", "content": json.dumps({"ok": True, "channel": "C0123456", "ts": "1712412345.000200"}, indent=2)})
                prior_snippet = "slack_message_sent"

        elif tool == "email":
            entries.append({"kind": "text", "content": "Reasoning: Formatting email notification with findings summary."})
            entries.append({"kind": "code", "content": (
                "SMTP → ses.us-east-1.amazonaws.com:587 (demo — not sent)\n"
                "From: mdba-alerts@mongodb.com\n"
                "To: dba-team@acmecorp.com\n"
                "Subject: [MDBA] Backup cost alert — $1,213/mo increase detected"
            )})
            entries.append({"kind": "json", "content": json.dumps({
                "status": "queued",
                "messageId": "msg_demo_001",
                "recipients": 3,
            }, indent=2)})
            prior_snippet = "email_queued"

        else:
            entries.append({"kind": "text", "content": f"Reasoning: Tool `{tool}` — executing with default handler."})
            entries.append({"kind": "json", "content": json.dumps({"status": "ok", "tool": tool}, indent=2)})
            prior_snippet = "{}"

        step_summary = f"Mock {tool} step finished; prior_snippet length={len(prior_snippet)} chars."
        entries.append({
            "kind": "state",
            "content": json.dumps({
                "node_id": nid,
                "step": i + 1,
                "label": label,
                "tool": tool,
                "phase": "completed",
                "summary": step_summary,
            }, indent=2),
        })

    entries.append({"kind": "heading", "content": "Pipeline complete"})
    entries.append({"kind": "text", "content": f"Executed {len(ordered)} step(s) successfully."})
    entries.append({"kind": "text", "content": "All outputs are simulated — connect live Atlas APIs for production use."})
    return entries


_TOOL_FINDINGS: dict[str, list[dict[str, Any]]] = {
    "atlas_api": [
        {
            "title": "Backup costs increased 22% month-over-month",
            "summary": "Invoice analysis shows backup storage costs rose from $5,482 to $6,695 — driven by new hourly snapshots on staging-west and 18% data growth on prod-east-1.",
            "severity": "high",
            "estimated_monthly_savings_usd": 1213.0,
            "reasoning_trace": [
                {"role": "tool", "content": "GET /api/atlas/v2/orgs/{orgId}/invoices?fromDate=2026-03-01"},
                {"role": "data", "content": '{"period_1_backup_cents": 548200, "period_2_backup_cents": 669500}'},
                {"role": "agent", "content": "Backup costs increased from $5,482 to $6,695 (+22.1%). Three contributing factors: new hourly snapshots on staging-west, 18% data growth on prod-east-1, duplicate snapshot configs on 3 clusters."},
                {"role": "conclusion", "content": "Addressable savings: $1,213/mo by right-sizing snapshot intervals and removing duplicate configs."},
            ],
        },
        {
            "title": "Data transfer spike from cross-region analytics pipeline",
            "summary": "Outbound data transfer from prod-east-1 to eu-west-1 increased 34% this week. Correlates with new analytics pipeline performing cross-region reads.",
            "severity": "medium",
            "estimated_monthly_savings_usd": 900.0,
            "reasoning_trace": [
                {"role": "tool", "content": "GET /api/atlas/v2/orgs/{orgId}/invoices — line items by SKU"},
                {"role": "data", "content": '{"data_transfer_prior": 4120, "data_transfer_current": 5521, "delta_pct": 34}'},
                {"role": "agent", "content": "Cross-region reads from us-east-1 to eu-west-1 are the primary driver. Routing to a local read replica would eliminate the transfer fees."},
                {"role": "conclusion", "content": "Route analytics reads to local replica — est. $900/mo savings."},
            ],
        },
    ],
    "mongodb": [
        {
            "title": "COLLSCAN detected on high-frequency query pattern",
            "summary": "system.profile shows a query on the orders collection scanning 2.4M documents per call at 842ms P95. A compound index would reduce this to <5ms.",
            "severity": "high",
            "estimated_monthly_savings_usd": 480.0,
            "reasoning_trace": [
                {"role": "tool", "content": "db.system.profile.find({millis: {$gt: 100}}).sort({ts: -1})"},
                {"role": "data", "content": '{"collection": "orders", "scanType": "COLLSCAN", "docsExamined": 2400000, "p95_ms": 842}'},
                {"role": "agent", "content": "Full collection scan on orders — 1,200 calls/hour from order-fulfillment service. Compound index {status: 1, created_at: -1} is the fix."},
                {"role": "conclusion", "content": "Index creation saves $480/mo in reduced IOPS and autoscaling pressure."},
            ],
        },
    ],
    "mdba": [
        {
            "title": "Cost anomaly: compute growing faster than data volume",
            "summary": "Compute spend grew 11% month-over-month while data volume grew only 3%. Inefficient queries on the analytics cluster are the likely cause.",
            "severity": "medium",
            "estimated_monthly_savings_usd": 680.0,
            "reasoning_trace": [
                {"role": "agent", "content": "Correlating compute metrics with data growth rates across the estate."},
                {"role": "data", "content": '{"compute_growth_pct": 11, "data_growth_pct": 3, "gap": "8% unexplained"}'},
                {"role": "agent", "content": "The analytics-readonly cluster saw +18% compute growth due to new aggregation pipelines that don't leverage indexes."},
                {"role": "conclusion", "content": "Profile top 10 aggregation pipelines and add missing indexes. Est. savings: $680/mo."},
            ],
        },
    ],
}


def mock_flow_findings(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Generate simulated findings from a flow's tool nodes."""
    import random
    ordered = order_nodes(nodes, edges)
    findings: list[dict[str, Any]] = []
    for node in ordered:
        data = node.get("data") or {}
        tool = str(data.get("tool", "unknown"))
        pool = _TOOL_FINDINGS.get(tool)
        if not pool:
            continue
        picked = random.choice(pool)
        findings.append({
            "agent": tool,
            **picked,
            "evidence": {"tool": tool, "node_label": data.get("label", ""), "simulated": True},
            "recommendations": [
                f"Review the {tool} step output above for detailed analysis.",
                "Connect live Atlas APIs to replace simulated data with real cluster signals.",
            ],
        })
    return findings
