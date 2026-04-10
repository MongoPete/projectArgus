import type { AgentType } from "@/types";

// =============================================================================
// TYPES & CONSTANTS
// =============================================================================

export type ToolType = "atlas_api" | "mongodb" | "mdba" | "notify";

export interface PipelineStepData {
  id: string;
  label: string;
  desc: string;
  tool: ToolType;
}

export const TOOL_COLORS: Record<ToolType, string> = {
  atlas_api: "#3D9CFF",
  mongodb: "#00ED64",
  mdba: "#8b5cf6",
  notify: "#FFC010",
};

export const TOOL_LABELS: Record<ToolType, string> = {
  atlas_api: "Atlas API",
  mongodb: "MongoDB",
  mdba: "LLM",
  notify: "Notify",
};

// Pipeline templates for each agent type
export const PIPELINE_TEMPLATES: Record<AgentType, { label: string; desc: string; tool: ToolType }[]> = {
  spend: [
    { label: "Poll Atlas billing API", desc: "Fetch invoices + cluster metrics", tool: "atlas_api" },
    { label: "Compute 30-day baseline", desc: "Rolling average from spend_baselines", tool: "mongodb" },
    { label: "Detect spend anomalies", desc: "LLM judges deviation from baseline", tool: "mdba" },
  ],
  slow_query: [
    { label: "Scan system.profile", desc: "Slow queries exceeding threshold", tool: "mongodb" },
    { label: "Run explain analysis", desc: "explain() on each slow pattern", tool: "mongodb" },
    { label: "Generate index recommendations", desc: "LLM suggests compound indexes", tool: "mdba" },
  ],
  backup: [
    { label: "Fetch backup policies", desc: "Snapshot schedules + retention", tool: "atlas_api" },
    { label: "Analyze data churn rate", desc: "Oplog rate vs snapshot frequency", tool: "mongodb" },
    { label: "Evaluate backup efficiency", desc: "Identify over-snapshotting", tool: "mdba" },
  ],
  security: [
    { label: "Scan audit logs", desc: "New IPs, off-hours, volume spikes", tool: "mongodb" },
    { label: "Behavioral pattern analysis", desc: "Compare against 90-day baseline", tool: "mdba" },
  ],
  data_quality: [
    { label: "Compute field statistics", desc: "Z-scores on configured fields", tool: "mongodb" },
    { label: "Flag statistical outliers", desc: "Contextual anomaly evaluation", tool: "mdba" },
  ],
  index_rationalization: [
    { label: "Run $indexStats", desc: "Zero-op indexes in 30 days", tool: "mongodb" },
    { label: "Rationalize indexes", desc: "Prefix coverage + drop recommendations", tool: "mdba" },
  ],
  scaling: [
    { label: "Collect cluster metrics", desc: "CPU, memory, connections, latency", tool: "atlas_api" },
    { label: "Analyze scaling patterns", desc: "Predict capacity needs from trends", tool: "mdba" },
  ],
};

// Generate pipeline steps from selected agents
export function generatePipelineSteps(agents: AgentType[]): PipelineStepData[] {
  const steps: PipelineStepData[] = [];

  agents.forEach((agent) => {
    const template = PIPELINE_TEMPLATES[agent];
    template.forEach((step, i) => {
      steps.push({
        id: `${agent}-${i}`,
        label: step.label,
        desc: step.desc,
        tool: step.tool,
      });
    });
  });

  // Always append synthesis and delivery steps
  steps.push({
    id: "synthesize",
    label: "Synthesize findings",
    desc: "Rank by severity and estimated savings",
    tool: "mdba",
  });
  steps.push({
    id: "deliver",
    label: "Deliver to inbox",
    desc: "Publish findings for human review",
    tool: "notify",
  });

  return steps;
}

// =============================================================================
// PIPELINE TIMELINE COMPONENT
// =============================================================================

export function PipelineTimeline({
  steps,
  editable = false,
  onEdit,
  compact = false,
}: {
  steps: PipelineStepData[];
  editable?: boolean;
  onEdit?: (step: PipelineStepData) => void;
  compact?: boolean;
}) {
  return (
    <div className="relative">
      {steps.map((step, i) => {
        const color = TOOL_COLORS[step.tool];
        const toolLabel = TOOL_LABELS[step.tool];
        const isLast = i === steps.length - 1;

        return (
          <div
            key={step.id}
            className={`relative flex items-start gap-3 ${compact ? "pb-3" : "pb-4"}`}
          >
            {/* Vertical connector line */}
            {!isLast && (
              <div
                className="absolute left-[4px] top-[14px] w-[1.5px] bg-[#112733]"
                style={{ height: compact ? "calc(100% - 6px)" : "calc(100% - 2px)" }}
              />
            )}

            {/* Dot with ring and glow */}
            <div className="relative shrink-0">
              <div
                className="w-[9px] h-[9px] rounded-full"
                style={{
                  background: color,
                  boxShadow: `0 0 6px ${color}40`,
                  border: "2px solid #001E2B",
                }}
              />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 -mt-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`font-semibold text-white ${compact ? "text-xs" : "text-sm"}`}
                >
                  {step.label}
                </span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    background: `${color}15`,
                    color: color,
                  }}
                >
                  {toolLabel}
                </span>
                {editable && onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(step)}
                    className="text-xs text-[#5C6C75] hover:text-mdb-leaf ml-auto"
                  >
                    Edit
                  </button>
                )}
              </div>
              {!compact && (
                <p className="text-xs text-[#889397] mt-0.5 leading-snug">
                  {step.desc}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
