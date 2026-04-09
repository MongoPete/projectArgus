export type AgentType =
  | "spend"
  | "slow_query"
  | "backup"
  | "index_rationalization"
  | "data_quality"
  | "security"
  | "scaling";

export type TriggerType = "schedule" | "change_stream" | "manual";

export type FindingSeverity = "low" | "medium" | "high" | "critical";
export type FindingStatus = "new" | "acknowledged" | "approved" | "dismissed";
export type RunStatus = "pending" | "running" | "completed" | "failed";

export interface WorkflowStep {
  id: string;
  agent: AgentType;
  label: string;
  config: Record<string, unknown>;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  trigger: TriggerType;
  schedule_cron: string | null;
  steps: WorkflowStep[];
  hitl_writes: boolean;
  created_at: string;
  updated_at: string;
}

export interface TraceStep {
  node: string;
  message: string;
  detail?: Record<string, unknown> | null;
  at: string;
}

export interface RunRecord {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: RunStatus;
  started_at: string;
  completed_at: string | null;
  trigger: string;
  trace: TraceStep[];
  error: string | null;
}

export interface ReasoningStep {
  role: "agent" | "data" | "tool" | "conclusion";
  content: string;
}

export interface Finding {
  id: string;
  run_id: string;
  workflow_id: string;
  agent: AgentType;
  title: string;
  summary: string;
  severity: FindingSeverity;
  status: FindingStatus;
  estimated_monthly_savings_usd: number | null;
  evidence: Record<string, unknown>;
  recommendations: string[];
  reasoning_trace: ReasoningStep[];
  created_at: string;
}

export interface FindingPreview {
  id: string;
  title: string;
  severity: FindingSeverity;
  agent: AgentType;
  estimated_monthly_savings_usd: number | null;
  created_at: string;
}

export interface DashboardSummary {
  open_findings: number;
  high_or_critical_findings: number;
  runs_last_7d: number;
  workflows_active: number;
  total_addressable_savings_usd: number;
  spend_delta_pct: number | null;
  cost_drivers: string[];
  top_findings: FindingPreview[];
  clusters_monitored: number;
}

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Body for POST /api/workflows (matches backend WorkflowCreate). */
export interface WorkflowCreatePayload {
  name: string;
  description: string;
  trigger: TriggerType;
  schedule_cron: string | null;
  steps: WorkflowStep[];
  hitl_writes: boolean;
}

export interface ChatApiResponse {
  message: string;
  workflow: WorkflowCreatePayload | null;
  tips: string[];
  source: "openai" | "heuristic";
}

/** Persisted tool-flow (React Flow graph JSON). */
export interface ToolFlow {
  id: string;
  name: string;
  description: string;
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  created_at: string;
  updated_at: string;
}

export interface FlowRunLogEntry {
  kind: string;
  content: string;
}

export interface FlowRunResponse {
  status: string;
  entries: FlowRunLogEntry[];
}
