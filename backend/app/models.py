from datetime import datetime
from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class AgentType(str, Enum):
    spend = "spend"
    slow_query = "slow_query"
    backup = "backup"
    index_rationalization = "index_rationalization"
    data_quality = "data_quality"
    security = "security"
    scaling = "scaling"


class TriggerType(str, Enum):
    schedule = "schedule"
    change_stream = "change_stream"
    manual = "manual"


class FindingSeverity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class FindingStatus(str, Enum):
    new = "new"
    acknowledged = "acknowledged"
    approved = "approved"
    dismissed = "dismissed"


class WorkflowStep(BaseModel):
    id: str
    agent: AgentType
    label: str
    config: dict[str, Any] = Field(default_factory=dict)


class WorkflowCreate(BaseModel):
    name: str
    description: str = ""
    trigger: TriggerType = TriggerType.manual
    schedule_cron: Optional[str] = None
    steps: list[WorkflowStep] = Field(default_factory=list)
    hitl_writes: bool = True


class Workflow(WorkflowCreate):
    id: str
    created_at: datetime
    updated_at: datetime


class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    trigger: Optional[TriggerType] = None
    schedule_cron: Optional[str] = None
    steps: Optional[list[WorkflowStep]] = None
    hitl_writes: Optional[bool] = None


class RunStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


class TraceStep(BaseModel):
    node: str
    message: str
    detail: Optional[dict[str, Any]] = None
    at: datetime


class RunRecord(BaseModel):
    id: str
    workflow_id: str
    workflow_name: str
    status: RunStatus
    started_at: datetime
    completed_at: Optional[datetime] = None
    trigger: str
    trace: list[TraceStep] = Field(default_factory=list)
    error: Optional[str] = None


class ReasoningStep(BaseModel):
    role: Literal["agent", "data", "tool", "conclusion"]
    content: str


class Finding(BaseModel):
    id: str
    run_id: str
    workflow_id: str
    agent: AgentType
    title: str
    summary: str
    severity: FindingSeverity
    status: FindingStatus = FindingStatus.new
    estimated_monthly_savings_usd: Optional[float] = None
    evidence: dict[str, Any] = Field(default_factory=dict)
    recommendations: list[str] = Field(default_factory=list)
    reasoning_trace: list[ReasoningStep] = Field(default_factory=list)
    created_at: datetime


class FindingPreview(BaseModel):
    id: str
    title: str
    severity: FindingSeverity
    agent: AgentType
    estimated_monthly_savings_usd: Optional[float] = None
    created_at: datetime


class DashboardSummary(BaseModel):
    open_findings: int
    high_or_critical_findings: int
    runs_last_7d: int
    workflows_active: int
    total_addressable_savings_usd: float
    spend_delta_pct: Optional[float] = None
    cost_drivers: list[str] = Field(default_factory=list)
    top_findings: list[FindingPreview] = Field(default_factory=list)
    clusters_monitored: int = 0


class ChatMessageIn(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessageIn] = Field(..., min_length=1)


class ChatResponse(BaseModel):
    message: str
    workflow: Optional[WorkflowCreate] = None
    tips: list[str] = Field(default_factory=list)
    source: Literal["openai", "heuristic"] = "heuristic"
