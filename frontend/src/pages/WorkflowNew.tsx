import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/api";
import type { AgentType, ChatMessage, TriggerType, WorkflowCreatePayload, WorkflowStep } from "@/types";
import {
  PipelineTimeline,
  generatePipelineSteps,
  PIPELINE_TEMPLATES,
  TOOL_COLORS,
} from "@/components/PipelineTimeline";

// =============================================================================
// ICONS - Minimal monochrome SVG icons (matching Workflows.tsx)
// =============================================================================

function IconDollar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function IconQuery() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconBackup() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
    </svg>
  );
}

function IconSecurity() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconIndex() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function IconData() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function IconScaling() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}

const AGENT_ICONS: Record<AgentType, React.ReactNode> = {
  spend: <IconDollar />,
  slow_query: <IconQuery />,
  backup: <IconBackup />,
  security: <IconSecurity />,
  index_rationalization: <IconIndex />,
  data_quality: <IconData />,
  scaling: <IconScaling />,
};

// =============================================================================
// CONSTANTS
// =============================================================================

type CreateMode = "templates" | "chat" | "editor";
type SchedulePreset = "manual" | "6h" | "hourly" | "daily";

const MONITOR_CATEGORIES: {
  id: AgentType;
  label: string;
  desc: string;
}[] = [
  { id: "spend", label: "Costs & usage", desc: "Spend drift, invoice anomalies" },
  { id: "slow_query", label: "App speed", desc: "Slow queries, missing indexes" },
  { id: "backup", label: "Backups", desc: "Snapshot frequency vs churn" },
  { id: "security", label: "Security", desc: "Unusual access, export spikes" },
  { id: "data_quality", label: "Data quality", desc: "Outliers, schema drift" },
  { id: "index_rationalization", label: "Indexes", desc: "Unused or redundant indexes" },
  { id: "scaling", label: "Capacity", desc: "CPU, connections, growth trends" },
];

const SCHEDULE_OPTIONS: { id: SchedulePreset; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "6h", label: "Every 6h" },
  { id: "hourly", label: "Hourly" },
  { id: "daily", label: "Daily" },
];

const DEMO_CLUSTERS = [
  { id: "prod-east", name: "prod-east-1", tier: "M30", ok: true },
  { id: "prod-west", name: "prod-west-1", tier: "M30", ok: true },
  { id: "staging", name: "staging-1", tier: "M10", ok: true },
  { id: "analytics", name: "analytics-prod", tier: "M50", ok: false },
  { id: "dev", name: "dev-shared", tier: "M10", ok: true },
];

function presetToCron(preset: SchedulePreset): { trigger: TriggerType; cron: string | null } {
  switch (preset) {
    case "manual":
      return { trigger: "manual", cron: null };
    case "6h":
      return { trigger: "schedule", cron: "0 */6 * * *" };
    case "hourly":
      return { trigger: "schedule", cron: "0 * * * *" };
    case "daily":
      return { trigger: "schedule", cron: "0 7 * * *" };
  }
}

function newStep(agent: AgentType): WorkflowStep {
  const cat = MONITOR_CATEGORIES.find((c) => c.id === agent);
  return {
    id: crypto.randomUUID(),
    agent,
    label: cat?.label ?? agent,
    config: {},
  };
}

// =============================================================================
// CHAT PANEL (embedded from Assistant logic)
// =============================================================================

const STARTERS = [
  "Monitor Atlas spend and warn if we're above baseline",
  "Hourly slow query checks with index suggestions",
  "Review backup costs and whether we're over-snapshotting",
];

function ChatPanel({
  onSwitchToEditor,
  onSwitchToTemplates,
}: {
  onSwitchToEditor?: () => void;
  onSwitchToTemplates?: (payload: WorkflowCreatePayload) => void;
}) {
  const nav = useNavigate();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Describe what you want to monitor (costs, slow queries, backups, security...) and I'll draft a workflow you can save and run.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingWorkflow, setPendingWorkflow] = useState<WorkflowCreatePayload | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const scrollDown = () => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
  };

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setApplyError(null);
      setPendingWorkflow(null);
      const nextMsgs: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
      setMessages(nextMsgs);
      setInput("");
      setLoading(true);
      scrollDown();
      try {
        const res = await api.chat.send({
          messages: nextMsgs.map(({ role, content }) => ({ role, content })),
        });
        setMessages((m) => [...m, { role: "assistant", content: res.message }]);
        if (res.workflow) {
          setPendingWorkflow(res.workflow);
        }
        scrollDown();
      } catch (e) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: `Couldn't reach the assistant API. (${(e as Error).message})`,
          },
        ]);
      } finally {
        setLoading(false);
        scrollDown();
      }
    },
    [loading, messages]
  );

  async function applyWorkflow() {
    if (!pendingWorkflow) return;
    setApplyError(null);
    try {
      const w = await api.workflows.create(pendingWorkflow);
      setPendingWorkflow(null);
      nav(`/workflows/${w.id}`);
    } catch (e) {
      setApplyError((e as Error).message);
    }
  }

  // Render markdown-lite (bold)
  function MarkdownLite({ text }: { text: string }) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
        {parts.map((part, i) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <strong key={i} className="text-white font-medium">
                {part.slice(2, -2)}
              </strong>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </p>
    );
  }

  return (
    <div className="flex flex-col min-h-[60vh]">
      {/* Chat messages */}
      <div className="flex-1 min-h-[400px] overflow-y-auto glass rounded-xl p-6 flex flex-col gap-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[90%] rounded-2xl px-4 py-3 ${
                m.role === "user"
                  ? "bg-mdb-leaf/20 border border-mdb-leaf/30 text-slate-100"
                  : "bg-mdb-forest/35 border border-mdb-leaf/15 text-slate-200"
              }`}
            >
              {m.role === "assistant" ? (
                <MarkdownLite text={m.content} />
              ) : (
                <p className="text-sm text-slate-100 whitespace-pre-wrap">{m.content}</p>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="text-xs text-slate-500 font-mono animate-pulse">Thinking...</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Pending workflow card */}
      {pendingWorkflow && (
        <div className="mt-4 glass rounded-xl p-4 border border-mdb-leaf/25">
          <div className="text-xs uppercase tracking-wider text-mdb-leaf">Draft workflow</div>
          <div className="text-white font-medium mt-1">{pendingWorkflow.name}</div>
          <p className="text-sm text-slate-400 mt-1">{pendingWorkflow.description}</p>
          <div className="text-xs text-slate-500 mt-2 font-mono">
            {pendingWorkflow.trigger}
            {pendingWorkflow.schedule_cron ? ` · ${pendingWorkflow.schedule_cron}` : ""} ·{" "}
            {pendingWorkflow.steps.map((s) => s.agent).join(" → ")}
          </div>
          {applyError && <p className="text-sm text-red-300 mt-2">{applyError}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={applyWorkflow}
              className="rounded-lg bg-mdb-leaf text-mdb-forest px-4 py-2 text-sm font-medium hover:bg-mdb-leaf/90"
            >
              Create workflow
            </button>
            {onSwitchToTemplates && (
              <button
                type="button"
                onClick={() => onSwitchToTemplates(pendingWorkflow)}
                className="rounded-lg border border-mdb-leaf/25 px-4 py-2 text-sm text-slate-300 hover:bg-mdb-leaf/10"
              >
                Customize steps
              </button>
            )}
            {onSwitchToEditor && (
              <button
                type="button"
                onClick={onSwitchToEditor}
                className="rounded-lg border border-mdb-leaf/25 px-4 py-2 text-sm text-slate-300 hover:bg-mdb-leaf/10"
              >
                Open in editor
              </button>
            )}
            <button
              type="button"
              onClick={() => setPendingWorkflow(null)}
              className="rounded-lg border border-[#112733] px-4 py-2 text-sm text-slate-500 hover:bg-white/[0.02]"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Starters and input */}
      <div className="shrink-0 mt-4 space-y-3">
        <div className="flex flex-wrap gap-2" data-tour="chat-starters">
          {STARTERS.map((s, i) => (
            <button
              key={s}
              type="button"
              disabled={loading}
              onClick={() => send(s)}
              data-tour={i === 0 ? "chat-starter-0" : undefined}
              className="text-xs rounded-full border border-mdb-leaf/25 px-3 py-1.5 text-slate-300 hover:bg-mdb-leaf/10 hover:border-mdb-leaf/50 disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            className="flex-1 rounded-xl bg-mdb-slate border border-mdb-leaf/25 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-mdb-leaf/50 focus:outline-none focus:ring-1 focus:ring-mdb-leaf/30"
            placeholder="Ask in plain language..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl bg-mdb-leaf text-mdb-forest px-5 py-3 text-sm font-medium disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// FLOW EDITOR PANEL - Shows saved flows
// =============================================================================

function FlowEditorPanel() {
  const nav = useNavigate();
  const [flows, setFlows] = useState<{ id: string; name: string; updated_at: string; nodes: unknown[] }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.flows.list()
      .then((list) => setFlows(list))
      .catch(() => setFlows([]))
      .finally(() => setLoading(false));
  }, []);

  function timeAgo(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  if (loading) {
    return (
      <div className="glass rounded-xl p-8 min-h-[300px] flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading flows...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-white">Flows</h3>
        <button
          type="button"
          onClick={() => nav("/advisor/flow")}
          className="rounded-lg bg-mdb-leaf text-mdb-forest px-4 py-2 text-sm font-semibold hover:bg-mdb-leaf/90"
        >
          + Create
        </button>
      </div>

      {/* Flow list */}
      {flows.length === 0 ? (
        <div className="glass rounded-xl p-6 text-center">
          <p className="text-slate-500">No saved flows yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {flows.map((flow) => (
            <div
              key={flow.id}
              onClick={() => nav("/advisor/flow", { state: { loadFlowId: flow.id } })}
              className="glass rounded-xl p-4 flex items-center justify-between cursor-pointer hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-mdb-leaf/10 border border-mdb-leaf/25 flex items-center justify-center text-mdb-leaf text-sm font-medium">
                  {flow.nodes?.length || 0}
                </div>
                <div>
                  <h4 className="font-medium text-white">{flow.name}</h4>
                  <p className="text-xs text-slate-500">
                    {flow.nodes?.length || 0} step{(flow.nodes?.length || 0) !== 1 ? "s" : ""} · Updated {timeAgo(flow.updated_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    nav("/advisor/flow", { state: { loadFlowId: flow.id } });
                  }}
                  className="rounded-lg border border-[#112733] px-3 py-1.5 text-xs text-slate-400 hover:bg-white/[0.02]"
                >
                  Open
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function WorkflowNew() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const urlMode = (searchParams.get("mode") as CreateMode) || "templates";

  const [mode, setMode] = useState<CreateMode>(urlMode);
  const [step, setStep] = useState(1); // 1 = monitors, 2 = configure, 3 = review

  // Sync mode with URL query param
  useEffect(() => {
    setMode(urlMode);
  }, [urlMode]);
  const [selectedMonitors, setSelectedMonitors] = useState<Set<AgentType>>(new Set());
  const [schedule, setSchedule] = useState<SchedulePreset>("manual");
  const [selectedClusters, setSelectedClusters] = useState<Set<string>>(
    new Set(DEMO_CLUSTERS.filter((c) => c.ok).map((c) => c.id))
  );
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Generate pipeline preview
  const pipelineSteps = useMemo(() => {
    return generatePipelineSteps(Array.from(selectedMonitors));
  }, [selectedMonitors]);

  // Open selected monitors in flow editor with full pipeline
  function openInFlowEditor() {
    if (selectedMonitors.size === 0) return;

    const agents = Array.from(selectedMonitors);

    // Build full pipeline steps (same logic as generatePipelineSteps)
    const allSteps: { id: string; label: string; desc: string; tool: string }[] = [];

    agents.forEach((agent) => {
      const template = PIPELINE_TEMPLATES[agent];
      template.forEach((step, i) => {
        allSteps.push({
          id: `${agent}-${i}`,
          label: step.label,
          desc: step.desc,
          tool: step.tool,
        });
      });
    });

    // Add synthesis and delivery steps
    allSteps.push({
      id: "synthesize",
      label: "Synthesize findings",
      desc: "Rank by severity and estimated savings",
      tool: "mdba",
    });
    allSteps.push({
      id: "deliver",
      label: "Deliver to inbox",
      desc: "Publish findings for human review",
      tool: "notify",
    });

    // Create nodes for each step
    const nodes = allSteps.map((step, i) => ({
      id: `template-${step.id}`,
      type: "tool",
      position: { x: 80, y: 40 + i * 140 },
      data: {
        tool: step.tool,
        label: step.label,
        prompt: step.desc,
        include_prior_memory: i > 0,
      },
    }));

    // Create edges connecting all nodes with tool-colored styling
    const edges = nodes.slice(1).map((n, i) => {
      const sourceTool = allSteps[i].tool as keyof typeof TOOL_COLORS;
      const color = TOOL_COLORS[sourceTool] || "#818cf8";
      return {
        id: `template-edge-${i}`,
        source: nodes[i].id,
        target: n.id,
        type: "smoothstep",
        markerEnd: { type: "arrowclosed", color, width: 18, height: 18 },
        style: { stroke: color, strokeWidth: 2 },
      };
    });

    const flowName = `${agents.slice(0, 2).map(a => MONITOR_CATEGORIES.find(c => c.id === a)?.label ?? a).join(" + ")} workflow`;
    nav("/advisor/flow", { state: { nodes, edges, flowName } });
  }

  // Mode switcher component
  const ModeToggle = () => (
    <div className="bg-mdb-slate rounded-lg p-0.5 flex" data-tour="create-modes">
      {(["templates", "chat", "editor"] as CreateMode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          className={`px-4 py-1.5 text-sm rounded-md transition-all ${
            mode === m
              ? "bg-[rgba(255,255,255,0.06)] border border-[#112733] shadow-sm text-white font-semibold"
              : "text-[#889397] border border-transparent"
          }`}
        >
          {m === "templates" ? "Templates" : m === "chat" ? "Chat" : "Flow editor"}
        </button>
      ))}
    </div>
  );

  // Get subtitle based on mode
  const getSubtitle = () => {
    switch (mode) {
      case "templates":
        return "Pick what to monitor, configure, and launch.";
      case "chat":
        return "Describe what you want and we'll build the pipeline.";
      case "editor":
        return null;
    }
  };

  // Toggle monitor selection
  const toggleMonitor = (id: AgentType) => {
    setSelectedMonitors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle cluster selection
  const toggleCluster = (id: string) => {
    setSelectedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Use recommended monitors
  const useRecommended = () => {
    setSelectedMonitors(new Set(["spend", "slow_query", "backup"]));
  };

  // Create workflow
  async function createWorkflow() {
    if (selectedMonitors.size === 0) {
      setErr("Select at least one monitor.");
      return;
    }
    setSaving(true);
    setErr(null);
    const { trigger, cron } = presetToCron(schedule);
    const steps = Array.from(selectedMonitors).map((agent) => newStep(agent));
    const name = `${Array.from(selectedMonitors).slice(0, 2).join(" + ")} workflow`;

    try {
      const w = await api.workflows.create({
        name,
        description: `Monitors: ${Array.from(selectedMonitors).join(", ")}. Clusters: ${selectedClusters.size}.`,
        trigger,
        schedule_cron: cron,
        steps,
        hitl_writes: true,
      });
      nav(`/workflows/${w.id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Back button logic
  const handleBack = () => {
    if (mode === "templates" && step > 1) {
      setStep(step - 1);
    } else {
      nav("/workflows");
    }
  };

  const backLabel = step > 1 ? "Back" : "Workflows";

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Back link */}
      <button
        type="button"
        onClick={handleBack}
        className="text-sm text-mdb-leaf hover:underline"
      >
        ← {backLabel}
      </button>

      {/* Header with mode toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-white">New workflow</h1>
        <ModeToggle />
      </div>

      {/* Subtitle */}
      {getSubtitle() && <p className="text-slate-400 text-sm">{getSubtitle()}</p>}

      {err && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {err}
        </div>
      )}

      {/* TEMPLATES MODE */}
      {mode === "templates" && (
        <div className="space-y-8">
          {/* Step indicators */}
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                    step >= s
                      ? "bg-mdb-leaf text-mdb-forest"
                      : "bg-[#112733] text-slate-500"
                  }`}
                >
                  {s}
                </div>
                {s < 3 && (
                  <div
                    className={`w-8 h-0.5 ${
                      step > s ? "bg-mdb-leaf" : "bg-[#112733]"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step 1: What to watch */}
          {step === 1 && (
            <div className="space-y-4" data-tour="outcomes">
              <h2 className="text-lg font-medium text-white">What should we watch?</h2>
              <div className="grid grid-cols-2 gap-3">
                {MONITOR_CATEGORIES.map((cat) => {
                  const selected = selectedMonitors.has(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleMonitor(cat.id)}
                      className={`text-left rounded-xl p-3 border transition-all ${
                        selected
                          ? "border-mdb-leaf bg-mdb-leaf/[0.06]"
                          : "border-[#112733] bg-transparent hover:border-mdb-leaf/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={selected ? "text-mdb-leaf" : "text-[#889397]"}>{AGENT_ICONS[cat.id]}</span>
                          <span className="font-semibold text-sm text-white">{cat.label}</span>
                        </div>
                        {selected && (
                          <span className="text-mdb-leaf text-sm">✓</span>
                        )}
                      </div>
                      <p className="text-xs text-[#889397] mt-1">{cat.desc}</p>
                    </button>
                  );
                })}
              </div>
              {selectedMonitors.size === 0 && (
                <button
                  type="button"
                  onClick={useRecommended}
                  className="text-xs text-mdb-leaf hover:underline"
                >
                  Use recommended: costs, speed & backups
                </button>
              )}
              <button
                type="button"
                disabled={selectedMonitors.size === 0}
                onClick={() => setStep(2)}
                className="w-full rounded-lg bg-mdb-leaf text-mdb-forest py-2.5 text-sm font-semibold disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 2: Configure */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-medium text-white mb-3">How often?</h2>
                <div className="grid grid-cols-4 gap-2">
                  {SCHEDULE_OPTIONS.map((opt) => {
                    const selected = schedule === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSchedule(opt.id)}
                        className={`rounded-lg p-3 border text-sm transition-all ${
                          selected
                            ? "border-mdb-leaf bg-mdb-leaf/[0.06] text-white"
                            : "border-[#112733] text-slate-400 hover:border-mdb-leaf/30"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <h2 className="text-lg font-medium text-white mb-3">Which clusters?</h2>
                <div className="space-y-2">
                  {DEMO_CLUSTERS.map((cluster) => {
                    const selected = selectedClusters.has(cluster.id);
                    return (
                      <button
                        key={cluster.id}
                        type="button"
                        onClick={() => toggleCluster(cluster.id)}
                        className={`w-full text-left rounded-lg border px-3 py-2.5 flex items-center gap-3 transition-all ${
                          selected
                            ? "border-mdb-leaf bg-mdb-leaf/[0.06]"
                            : "border-[#112733] hover:border-mdb-leaf/30"
                        }`}
                      >
                        <div
                          className={`w-[14px] h-[14px] rounded-sm flex items-center justify-center text-[10px] ${
                            selected
                              ? "bg-mdb-leaf text-mdb-forest"
                              : "border border-[#112733]"
                          }`}
                        >
                          {selected && "✓"}
                        </div>
                        <div className="flex-1">
                          <span className="font-medium text-sm text-white">{cluster.name}</span>
                          <span className="text-xs text-[#889397] ml-2">{cluster.tier}</span>
                        </div>
                        <span
                          className={`w-2 h-2 rounded-full ${
                            cluster.ok ? "bg-mdb-leaf" : "bg-amber-500"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                disabled={selectedClusters.size === 0}
                onClick={() => setStep(3)}
                className="w-full rounded-lg bg-mdb-leaf text-mdb-forest py-2.5 text-sm font-semibold disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-6">
              <p className="text-sm text-[#889397]">
                {pipelineSteps.length} steps ·{" "}
                {schedule === "manual" ? "manual" : `every ${schedule === "6h" ? "6h" : schedule === "hourly" ? "hour" : "day"}`} ·{" "}
                {selectedClusters.size} cluster{selectedClusters.size !== 1 ? "s" : ""}
              </p>

              {/* Pipeline preview card */}
              <div className="glass rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-white">Pipeline preview</h3>
                  <button
                    type="button"
                    onClick={openInFlowEditor}
                    className="text-xs text-mdb-leaf hover:underline"
                  >
                    Customize in editor →
                  </button>
                </div>
                <PipelineTimeline steps={pipelineSteps} />
              </div>

              {/* Write protection banner */}
              <div className="rounded-lg bg-mdb-leaf/[0.06] border border-mdb-leaf/20 px-4 py-2.5 flex items-center gap-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00ED64" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span className="text-xs text-mdb-leaf">
                  Write protection on. No cluster modifications without your approval.
                </span>
              </div>

              {/* Action button */}
              <button
                type="button"
                disabled={saving}
                onClick={createWorkflow}
                className="w-full rounded-lg bg-mdb-leaf text-mdb-forest py-2.5 text-sm font-semibold disabled:opacity-40"
              >
                {saving ? "Creating..." : "Create workflow"}
              </button>

            </div>
          )}
        </div>
      )}

      {/* CHAT MODE */}
      {mode === "chat" && (
        <div data-tour="chat-panel">
        <ChatPanel
          onSwitchToEditor={() => setMode("editor")}
          onSwitchToTemplates={(payload) => {
            const agents = payload.steps.map((s) => s.agent);
            setSelectedMonitors(new Set(agents));
            setStep(3);
            setMode("templates");
          }}
        />
        </div>
      )}

      {/* EDITOR MODE */}
      {mode === "editor" && (
        <div data-tour="editor-panel">
          <FlowEditorPanel />
        </div>
      )}
    </div>
  );
}
