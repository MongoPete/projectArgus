"""NLP assistant: OpenAI + LangChain when configured; rich heuristic fallback for demos."""

from __future__ import annotations

import asyncio
import re
import uuid
from typing import Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from pydantic import BaseModel, Field

from app.config import settings
from app.services import agent_skills
from app.models import (
    AgentType,
    ChatMessageIn,
    ChatRequest,
    ChatResponse,
    TriggerType,
    WorkflowCreate,
    WorkflowStep,
)

AGENT_LABELS: dict[AgentType, str] = {
    AgentType.spend: "Spend & billing intelligence",
    AgentType.slow_query: "Slow query & index hints",
    AgentType.backup: "Backup cost & retention",
    AgentType.index_rationalization: "Index rationalization",
    AgentType.data_quality: "Data quality signals",
    AgentType.security: "Security behavior watch",
    AgentType.scaling: "Capacity & scaling patterns",
}

STRUCT_SYSTEM = """You are **MDBA Atlas Advisor**, a conversational product assistant for MongoDB Atlas operators.
You help customers design **proactive monitoring workflows** made of **agents** (analysis steps), not run destructive changes.
All index drops, creates, and cluster changes stay **human-in-the-loop (HITL)**.

Available agent keys (use these exact strings in step_agents):
- spend — Atlas spend / invoice anomalies vs baseline, cost drivers
- slow_query — profiler / slow operations, explain-style guidance
- backup — backup frequency vs churn, retention cost
- index_rationalization — unused / redundant index hints (recommend only; never auto-drop)
- data_quality — anomalies, outliers on configured fields
- security — audit / access pattern anomalies (conceptual in demo)
- scaling — recurring CPU/connection spikes, right-sizing hints

Triggers: manual | schedule | change_stream. If schedule, suggest schedule_cron (e.g. hourly: "0 * * * *").

When the user asks to **build**, **set up**, **add**, **monitor**, **watch**, or **help with** Atlas cost/performance/security,
produce a concrete workflow: non-empty step_agents, a short name, description, trigger, and schedule_cron if scheduled.
Otherwise answer helpfully with empty step_agents and optional tips.

Keep reply concise (2–5 short paragraphs max). No generic SQL; MongoDB/Atlas context only."""


class _LLMWorkflowParts(BaseModel):
    reply: str = Field(..., description="Answer for the user in plain language (markdown ok).")
    tips: list[str] = Field(default_factory=list, description="Short follow-up suggestions.")
    name: Optional[str] = Field(default=None, description="Workflow title if building a workflow.")
    description: Optional[str] = Field(default=None)
    trigger: str = Field(default="manual", description="manual | schedule | change_stream")
    schedule_cron: Optional[str] = Field(default=None)
    step_agents: list[str] = Field(default_factory=list, description="Agent keys to include in order.")


def _parse_agents(agent_keys: list[str]) -> list[AgentType]:
    out: list[AgentType] = []
    for raw in agent_keys:
        key = raw.strip().lower().replace(" ", "_")
        try:
            out.append(AgentType(key))
        except ValueError:
            for at in AgentType:
                if at.value == key or key in at.value:
                    out.append(at)
                    break
    # dedupe preserve order
    seen = set()
    uniq: list[AgentType] = []
    for a in out:
        if a not in seen:
            seen.add(a)
            uniq.append(a)
    return uniq


def _build_workflow(
    *,
    name: Optional[str],
    description: Optional[str],
    trigger_str: str,
    schedule_cron: Optional[str],
    agents: list[AgentType],
) -> Optional[WorkflowCreate]:
    if not agents:
        return None
    try:
        trigger = TriggerType(trigger_str)
    except ValueError:
        trigger = TriggerType.manual
    cron = schedule_cron if trigger == TriggerType.schedule else None
    steps = [
        WorkflowStep(
            id=str(uuid.uuid4()),
            agent=ag,
            label=AGENT_LABELS.get(ag, ag.value.replace("_", " ").title()),
            config={},
        )
        for ag in agents
    ]
    return WorkflowCreate(
        name=name or "Assistant workflow",
        description=description or "Created from Atlas Advisor chat.",
        trigger=trigger,
        schedule_cron=cron,
        steps=steps,
        hitl_writes=True,
    )


def _heuristic(req: ChatRequest) -> ChatResponse:
    last = req.messages[-1].content.strip()
    low = last.lower()

    agents: list[AgentType] = []
    if re.search(
        r"\b(spend|cost|bill|invoice|budget|tc[o]?|money|transfer|storage fee|atlas bill)\b", low
    ):
        agents.append(AgentType.spend)
    if re.search(
        r"\b(slow\s*quer|profiler|collscan|explain|latency|index|performance|ops?)\b", low
    ):
        agents.append(AgentType.slow_query)
    if re.search(r"\b(backup|snapshot|retention|pitr)\b", low):
        agents.append(AgentType.backup)
    if re.search(r"\b(index|unused index|redundant|drop index|rational)\b", low):
        agents.append(AgentType.index_rationalization)
    if re.search(r"\b(data quality|outlier|anomal|schema drift)\b", low):
        agents.append(AgentType.data_quality)
    if re.search(r"\b(security|audit|exfil|breach|login anomaly)\b", low):
        agents.append(AgentType.security)
    if re.search(r"\b(scale|cpu spike|connection spike|capacity|autoscale)\b", low):
        agents.append(AgentType.scaling)

    trigger = TriggerType.manual
    cron: Optional[str] = None
    if re.search(r"\b(hourly|every hour)\b", low):
        trigger = TriggerType.schedule
        cron = "0 * * * *"
    elif re.search(r"\b(daily|once a day|every day)\b", low):
        trigger = TriggerType.schedule
        cron = "0 7 * * *"
    elif re.search(r"\b(change stream|on insert|real[\s-]*time|event)\b", low):
        trigger = TriggerType.change_stream

    if agents:
        if "spend" in low and "slow" in low and AgentType.slow_query not in agents:
            agents.insert(1, AgentType.slow_query)
        seen: set[AgentType] = set()
        uniq: list[AgentType] = []
        for a in agents:
            if a not in seen:
                seen.add(a)
                uniq.append(a)
        agents = uniq
        wf = _build_workflow(
            name="Chat: " + (last[:48] + "…" if len(last) > 48 else last),
            description="Draft from Atlas Advisor (heuristic). Refine in Workflows.",
            trigger_str=trigger.value,
            schedule_cron=cron,
            agents=agents,
        )
        msg = (
            "Here’s a **draft workflow** based on what you described. "
            "Review the steps, then click **Create workflow** in the UI (or save from the Workflows page). "
            "This demo uses mock analysis; in production we’d wire Atlas Admin API, profiler, and your thresholds.\n\n"
            f"I included: **{', '.join(a.value for a in agents)}**."
        )
        return ChatResponse(
            message=msg,
            workflow=wf,
            tips=[
                "Say “add backup checks” or “run hourly” to refine.",
                "Ask how HITL works before any write operations.",
            ],
            source="heuristic",
        )

    return ChatResponse(
        message=(
            "I’m your **Atlas Advisor** — I help you **design proactive workflows** (spend, slow queries, backups, "
            "indexes, data quality, security, scaling). Everything destructive stays **human-approved**.\n\n"
            "Try something like: *“Monitor Atlas spend and alert if we’re above baseline”* or "
            "*“Hourly check for slow queries and suggest indexes.”*"
        ),
        workflow=None,
        tips=[
            "Monitor spend + slow queries together",
            "Daily backup cost sanity check",
            "Watch for unusual audit / export behavior",
        ],
        source="heuristic",
    )


def _last_user_text(messages: list[ChatMessageIn]) -> str:
    for m in reversed(messages):
        if m.role == "user":
            return m.content.strip()
    return ""


def _to_lc_messages(messages: list[ChatMessageIn]) -> list:
    out = []
    for m in messages[-24:]:
        if m.role == "user":
            out.append(HumanMessage(content=m.content))
        elif m.role == "assistant":
            out.append(AIMessage(content=m.content))
        elif m.role == "system":
            out.append(SystemMessage(content=m.content))
    return out


async def run_chat(req: ChatRequest) -> ChatResponse:
    if settings.openai_api_key:
        try:
            from langchain_openai import ChatOpenAI

            last_user = _last_user_text(req.messages)
            skills_block = ""
            if last_user and agent_skills.skill_count() > 0:
                skills_block = agent_skills.build_skills_injection_for_prompt(last_user)
            system_with_skills = STRUCT_SYSTEM + skills_block

            llm = ChatOpenAI(
                model="gpt-4o-mini",
                temperature=0.15,
                api_key=settings.openai_api_key,
            )
            structured = llm.with_structured_output(_LLMWorkflowParts)
            prompt = ChatPromptTemplate.from_messages(
                [
                    ("system", system_with_skills),
                    MessagesPlaceholder("history"),
                ]
            )
            chain = prompt | structured

            def _invoke():
                return chain.invoke({"history": _to_lc_messages(req.messages)})

            data: _LLMWorkflowParts = await asyncio.to_thread(_invoke)
            agents = _parse_agents(data.step_agents)
            wf = _build_workflow(
                name=data.name,
                description=data.description,
                trigger_str=data.trigger,
                schedule_cron=data.schedule_cron,
                agents=agents,
            )
            return ChatResponse(
                message=data.reply.strip(),
                workflow=wf,
                tips=data.tips,
                source="openai",
            )
        except Exception:
            pass

    return _heuristic(req)
