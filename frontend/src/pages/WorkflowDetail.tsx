import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/api";
import type { Finding, RunRecord, Workflow } from "@/types";
import {
  PipelineTimeline,
  generatePipelineSteps,
  PIPELINE_TEMPLATES,
  TOOL_COLORS,
} from "@/components/PipelineTimeline";
import { PageContainer, Card } from "@/components/PageContainer";
import { Pill } from "@/components/Pill";

// =============================================================================
// HELPERS
// =============================================================================

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
  return date.toLocaleDateString();
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function WorkflowDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [w, setW] = useState<Workflow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [recentRuns, setRecentRuns] = useState<RunRecord[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);

  // Simulation state
  const [running, setRunning] = useState(false);
  const [simLog, setSimLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id || id === "new") return;
    api.workflows.get(id).then(setW).catch((e: Error) => setErr(e.message));
    loadRecentRuns();
    loadFindings();
  }, [id]);

  const loadRecentRuns = useCallback(() => {
    api.runs.list().then((runs) => {
      setRecentRuns(runs.filter((r) => r.workflow_id === id).slice(0, 3));
    }).catch(() => {});
  }, [id]);

  const loadFindings = useCallback(() => {
    api.findings.list().then((all) => {
      setFindings(all.filter((f) => f.workflow_id === id));
    }).catch(() => {});
  }, [id]);

  async function handleDelete() {
    if (!id || !w) return;
    if (!confirm(`Delete workflow "${w.name}" and all its runs and findings?`)) return;
    setDeleting(true);
    try {
      await api.workflows.delete(id);
      nav("/workflows");
    } catch (e) {
      setErr((e as Error).message);
      setDeleting(false);
    }
  }

  function openInFlowEditor() {
    if (!w) return;

    // Build full pipeline steps from workflow agents
    const allSteps: { id: string; label: string; desc: string; tool: string }[] = [];

    w.steps.forEach((step) => {
      const template = PIPELINE_TEMPLATES[step.agent];
      if (template) {
        template.forEach((t, i) => {
          allSteps.push({
            id: `${step.agent}-${i}`,
            label: t.label,
            desc: t.desc,
            tool: t.tool,
          });
        });
      }
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
      id: `wf-${step.id}`,
      type: "tool",
      position: { x: 80, y: 40 + i * 140 },
      data: {
        tool: step.tool,
        label: step.label,
        prompt: step.desc,
        include_prior_memory: i > 0,
      },
    }));

    // Create edges with tool-colored styling
    const edges = nodes.slice(1).map((n, i) => {
      const sourceTool = allSteps[i].tool as keyof typeof TOOL_COLORS;
      const color = TOOL_COLORS[sourceTool] || "#818cf8";
      return {
        id: `we-${i}`,
        source: nodes[i].id,
        target: n.id,
        type: "smoothstep",
        markerEnd: { type: "arrowclosed", color, width: 18, height: 18 },
        style: { stroke: color, strokeWidth: 2 },
      };
    });

    nav("/advisor/flow", { state: { nodes, edges, flowName: w.name } });
  }

  function appendLog(msg: string) {
    setSimLog((prev) => [...prev, msg]);
    setTimeout(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }), 50);
  }

  async function runSimulation() {
    if (!id || !w) return;
    setSimLog([]);
    setRunning(true);

    appendLog(`▶ Starting pipeline for "${w.name}"`);
    appendLog(`  Trigger: ${w.trigger}${w.schedule_cron ? ` (${w.schedule_cron})` : ""}`);
    await delay(400);

    for (const step of w.steps) {
      appendLog(`  ↳ Running ${step.label}...`);
      await delay(600);
      appendLog(`  ✓ ${step.agent} complete`);
    }

    appendLog("\n▶ Synthesizing results...");
    await delay(500);
    appendLog("  ✓ Findings ranked by severity");

    appendLog("\n▶ Delivering to inbox...");
    await delay(400);

    try {
      const run = await api.runs.runWorkflow(id);
      const findingsCount = run.trace.filter((t) => t.message.includes("finding")).length;
      appendLog(`  ✓ ${findingsCount > 0 ? findingsCount : "No"} finding(s) generated`);
      appendLog(`\n✅ Pipeline complete`);
      loadRecentRuns();
      loadFindings();
    } catch (e) {
      appendLog(`  ✗ Error: ${(e as Error).message}`);
    }

    setRunning(false);
  }

  // Generate pipeline steps from workflow
  const pipelineSteps = useMemo(() => {
    if (!w) return [];
    return generatePipelineSteps(w.steps.map((s) => s.agent));
  }, [w]);

  // Calculate findings stats
  const openFindings = findings.filter((f) => f.status === "new" || f.status === "acknowledged");
  const totalSavings = openFindings.reduce((sum, f) => sum + (f.estimated_monthly_savings_usd ?? 0), 0);

  if (id === "new") return null;

  if (err) {
    return (
      <PageContainer>
        <Card className="p-6">
          <p className="text-[#FF6960]">{err}</p>
        </Card>
      </PageContainer>
    );
  }

  if (!w) {
    return (
      <PageContainer>
        <p className="text-[#889397]">Loading...</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-6">
      {/* Back link */}
      <Link to="/workflows" className="inline-flex items-center gap-1 text-sm text-mdb-leaf hover:underline">
        ← Workflows
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">{w.name}</h1>
          <p className="text-[#889397] mt-1 text-sm max-w-xl">{w.description}</p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Pill variant="success">Active</Pill>
            <span className="text-xs text-[#5C6C75]">
              {w.trigger === "schedule"
                ? `${w.schedule_cron}`
                : w.trigger === "manual"
                ? "Manual"
                : w.trigger}
            </span>
            <span className="text-[#3D4F58]">·</span>
            <span className="text-xs text-[#5C6C75]">{w.steps.length} step{w.steps.length !== 1 ? "s" : ""}</span>
            {recentRuns[0] && (
              <>
                <span className="text-[#3D4F58]">·</span>
                <span className="text-xs text-[#5C6C75]">Last run {timeAgo(recentRuns[0].started_at)}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={running}
            onClick={runSimulation}
            className="rounded-lg bg-mdb-leaf/10 border border-mdb-leaf/30 px-4 py-2 text-sm text-mdb-leaf hover:bg-mdb-leaf/20 disabled:opacity-50 transition-colors"
          >
            {running ? "Running..." : "Run now"}
          </button>
          <button
            type="button"
            onClick={openInFlowEditor}
            className="rounded-lg border border-[#112733] px-4 py-2 text-sm text-[#889397] hover:bg-white/[0.02] hover:text-[#C5CDD3] transition-colors"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Analysis pipeline */}
      <Card className="p-5" data-tour="workflow-pipeline">
        <h2 className="text-sm font-medium text-white mb-4">Analysis pipeline</h2>
        <PipelineTimeline steps={pipelineSteps} />
      </Card>

      {/* Two-column: Findings + Recent runs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Findings card */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-white">Findings</h2>
            <Link to="/findings" className="text-xs text-mdb-leaf hover:underline">
              View all →
            </Link>
          </div>
          {openFindings.length > 0 ? (
            <div>
              <span className="text-mdb-leaf text-lg font-medium">{openFindings.length} open</span>
              {totalSavings > 0 && (
                <span className="text-sm text-mdb-leaf ml-2">
                  · ${totalSavings.toLocaleString()}/mo
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-[#5C6C75]">All clear, no issues found.</p>
          )}
        </Card>

        {/* Recent runs card */}
        <Card className="p-5">
          <h2 className="text-sm font-medium text-white mb-3">Last 3 runs</h2>
          {recentRuns.length > 0 ? (
            <div className="space-y-2">
              {recentRuns.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between text-sm border-t border-[#112733] pt-2 first:border-0 first:pt-0"
                >
                  <div className="flex items-center gap-2">
                    <Pill
                      variant={r.status === "completed" ? "success" : r.status === "failed" ? "critical" : "muted"}
                    >
                      {r.status === "completed" ? "OK" : r.status === "failed" ? "FAIL" : r.status}
                    </Pill>
                    <span className="text-[#889397]">{formatTime(r.started_at)}</span>
                  </div>
                  <span className="text-[#5C6C75] text-xs">
                    {r.trace.length} step{r.trace.length !== 1 ? "s" : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#5C6C75]">No runs yet.</p>
          )}
        </Card>
      </div>

      {/* Execution log (only show when running or has log) */}
      {simLog.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-medium text-white mb-3">Execution log</h2>
          <div
            ref={logRef}
            className="rounded-lg bg-[#001E2B] border border-[#112733] p-4 font-mono text-[11px] text-[#889397] leading-relaxed max-h-[250px] overflow-y-auto whitespace-pre-wrap scrollbar-dark"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#112733 #001E2B" }}
          >
            {simLog.map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith("✅") ? "text-mdb-leaf font-semibold" :
                  line.startsWith("  ✓") ? "text-mdb-leaf/80" :
                  line.startsWith("  ✗") ? "text-[#FF6960]" :
                  line.startsWith("▶") ? "text-white font-medium" :
                  ""
                }
              >
                {line}
              </div>
            ))}
            {running && (
              <span className="inline-block w-2 h-3.5 bg-mdb-leaf/80 animate-pulse ml-0.5" />
            )}
          </div>
        </Card>
      )}

      {/* Delete button */}
      <div className="flex justify-end pt-4 border-t border-[#112733]">
        <button
          type="button"
          disabled={deleting}
          onClick={handleDelete}
          className="rounded-lg border border-[#FF6960]/25 text-[#FF6960]/70 px-4 py-2 text-sm hover:bg-[#FF6960]/10 hover:text-[#FF6960] disabled:opacity-50 transition-colors"
        >
          {deleting ? "Deleting..." : "Delete workflow"}
        </button>
      </div>
    </PageContainer>
  );
}
