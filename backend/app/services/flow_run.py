"""Mock flow-runner: ordered tool steps with plausible Atlas / Slack log lines (demo)."""

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

    entries.append(
        {
            "kind": "heading",
            "content": f"flow-runner · {now.strftime('%Y-%m-%d %H:%M:%S')} UTC",
        }
    )
    entries.append({"kind": "text", "content": "Demo execution — no live Atlas calls. Logs simulate the runner."})

    for i, node in enumerate(ordered):
        data = node.get("data") or {}
        tool = str(data.get("tool", "unknown"))
        label = str(data.get("label", node.get("id", "step")))
        prompt = str(data.get("prompt", "")).strip()
        use_memory = bool(data.get("include_prior_memory"))

        entries.append({"kind": "heading", "content": f"Step {i + 1}: {label} ({tool})"})

        if use_memory and prior_snippet:
            entries.append(
                {
                    "kind": "text",
                    "content": "Prior step output (memory on): attached as context to this prompt.",
                }
            )
            entries.append({"kind": "code", "content": prior_snippet[:400] + ("…" if len(prior_snippet) > 400 else "")})
        elif use_memory and not prior_snippet:
            entries.append({"kind": "text", "content": "Memory toggle on, but no prior output yet."})

        low = prompt.lower()
        if "invoice" in low and "fromdate" in low.replace(" ", ""):
            reasoning = (
                "Reasoning: Invoice list endpoints require a bounded window. Using UTC month boundary for "
                "`fromDate` based on prompt intent (previous month start)."
            )
        elif "invoice" in low:
            reasoning = (
                "Reasoning: Without an explicit date window, Atlas may return a large slice. "
                "Consider adding `fromDate` (demo hint)."
            )
        else:
            reasoning = "Reasoning: Interpreting operator prompt and tool schema (mock)."

        entries.append({"kind": "text", "content": reasoning})

        if tool == "atlas_api":
            org = _extract_org_id(prompt) or "{org_id}"
            from_date = "2024-03-01T00:00:00Z" if "previous" in prompt.lower() or "month" in prompt.lower() else "2024-04-01T00:00:00Z"
            path = f"GET /atlas/v2/orgs/{org}/invoices?fromDate={from_date}"
            entries.append({"kind": "code", "content": path})
            body = {
                "status": 200,
                "results": [
                    {"id": "inv_demo_1", "periodEnd": "2024-03-31T23:59:59Z", "totalAmountCents": 128_400_00},
                    {"id": "inv_demo_2", "periodEnd": "2024-03-15T12:00:00Z", "totalAmountCents": 92_050_00},
                ],
            }
            entries.append({"kind": "json", "content": json.dumps(body, indent=2)})
            prior_snippet = json.dumps(body)

        elif tool == "mongodb":
            entries.append({"kind": "code", "content": "db.system.profile.find({ millis: { $gt: 100 } }).limit(5)"})
            entries.append(
                {
                    "kind": "json",
                    "content": json.dumps({"ok": 1, "n": 2, "sample": [{"op": "query", "millis": 842}]}, indent=2),
                }
            )
            prior_snippet = '{"profiler_rows": 2}'

        elif tool == "mdba":
            entries.append(
                {
                    "kind": "text",
                    "content": "MDBA internal: correlating prior signals with policy templates (mock).",
                }
            )
            entries.append({"kind": "json", "content": json.dumps({"delta_cents": 1100_00, "confidence": 0.82}, indent=2)})
            prior_snippet = '{"delta_cents": 110000}'

        elif tool == "slack":
            entries.append(
                {
                    "kind": "code",
                    "content": "POST https://slack.com/api/chat.postMessage (demo — not sent)",
                }
            )
            entries.append(
                {
                    "kind": "json",
                    "content": json.dumps({"ok": True, "channel": "C0123456", "ts": "1712412345.000200"}, indent=2),
                }
            )
            prior_snippet = "slack_message_sent"

        elif tool == "email":
            entries.append({"kind": "code", "content": "SMTP / SES send (demo — not sent)"})
            entries.append({"kind": "text", "content": "To: operators@example.com · Subject: MDBA flow alert (mock)"})
            prior_snippet = "email_queued"

        else:
            entries.append({"kind": "text", "content": f"Unknown tool `{tool}` — placeholder success."})
            prior_snippet = "{}"

    entries.append({"kind": "heading", "content": "Completed"})
    entries.append({"kind": "text", "content": f"Executed {len(ordered)} step(s)."})
    return entries
