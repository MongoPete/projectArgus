import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/api";
import type { Finding, RunRecord, Workflow } from "@/types";
import type { ToolKind } from "@/flow/toolPalette";
import {
  PipelineTimeline,
  generatePipelineSteps,
} from "@/components/PipelineTimeline";

// =============================================================================
// HELPERS
// =============================================================================

const AGENT_TO_TOOL: Record<string, ToolKind> = {
  spend: "atlas_api",
  slow_query: "mongodb",
  backup: "atlas_api",
  index_rationalization: "mongodb",
  data_quality: "mongodb",
  security: "atlas_api",
  scaling: "atlas_api",
};

const stepDescriptions: Record<string, string> = {
  spend: "Compares Atlas invoice data against a 30-day rolling average. Flags cost drift above the configured threshold.",
  slow_query: "Scans system.profile for queries exceeding the slow threshold. Runs explain analysis and generates index recommendations.",
  backup: "Evaluates snapshot frequency against actual data change rate. Identifies over-snapshotting and compliance gaps.",
  index_rationalization: "Queries $indexStats across all collections. Identifies indexes with zero operations.",
  data_quality: "Computes statistical anomalies on configured fields. Flags documents that exceed threshold deviations.",
  security: "Analyzes Atlas audit logs for behavioral anomalies — new IP ranges, unusual read patterns.",
  scaling: "Monitors CPU utilization, connection counts, and storage growth trends.",
};

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
    const nodes = w.steps.map((s, i) => ({
      id: `wf-${s.id}`,
      type: "tool",
      position: { x: 80, y: 40 + i * 160 },
      data: {
        tool: AGENT_TO_TOOL[s.agent] ?? "mdba",
        label: s.label,
        prompt: `[${s.agent}] ${stepDescriptions[s.agent] ?? s.label}\nConfig: ${JSON.stringify(s.config)}`,
        include_prior_memory: i > 0,
      },
    }));
    const edges = nodes.slice(1).map((n, i) => ({
      id: `we-${i}`,
      source: nodes[i].id,
      target: n.id,
      type: "smoothstep",
      markerEnd: { type: "arrowclosed", color: "#818cf8", width: 18, height: 18 },
      style: { stroke: "#818cf8", strokeWidth: 2 },
    }));
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
  if (err) return <div className="text-red-300">{err}</div>;
  if (!w) return <p className="text-slate-400">Loading...</p>;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link to="/workflows" className="text-sm text-mdb-leaf hover:underline">
        ← Workflows
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">{w.name}</h1>
          <p className="text-slate-400 mt-1">{w.description}</p>
          <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-[#5C6C75]">
            <span className="text-mdb-leaf">Active</span>
            <span>·</span>
            <span>
              {w.trigger === "schedule"
                ? `Schedule: ${w.schedule_cron}`
                : w.trigger === "manual"
                ? "Manual trigger"
                : w.trigger}
            </span>
            <span>·</span>
            <span>{w.steps.length} step{w.steps.length !== 1 ? "s" : ""}</span>
            {recentRuns[0] && (
              <>
                <span>·</span>
                <span>Last run {timeAgo(recentRuns[0].started_at)}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={running}
            onClick={runSimulation}
            className="rounded-lg bg-mdb-leaf/20 border border-mdb-leaf/35 px-4 py-2 text-sm text-mdb-leaf hover:bg-mdb-leaf/30 disabled:opacity-50 transition-colors"
          >
            {running ? "Running..." : "Run now"}
          </button>
          <button
            type="button"
            onClick={openInFlowEditor}
            className="rounded-lg border border-[#112733] px-4 py-2 text-sm text-[#C5CDD3] hover:bg-white/[0.02] transition-colors"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Analysis pipeline */}
      <div className="glass rounded-xl p-5" data-tour="workflow-pipeline">
        <h2 className="text-sm font-medium text-white mb-4">Analysis pipeline</h2>
        <PipelineTimeline steps={pipelineSteps} />
      </div>

      {/* Two-column: Findings + Recent runs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Findings card */}
        <div className="glass rounded-xl p-5">
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
            <p className="text-sm text-[#5C6C75]">All clear — no issues found.</p>
          )}
        </div>

        {/* Recent runs card */}
        <div className="glass rounded-xl p-5">
          <h2 className="text-sm font-medium text-white mb-3">Last 3 runs</h2>
          {recentRuns.length > 0 ? (
            <div className="space-y-2">
              {recentRuns.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between text-sm border-t border-[#0E2230] pt-2 first:border-0 first:pt-0"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] uppercase px-2 py-0.5 rounded ${
                        r.status === "completed"
                          ? "bg-mdb-leaf/20 text-mdb-leaf"
                          : r.status === "failed"
                          ? "bg-red-500/20 text-red-300"
                          : "bg-slate-600/30 text-slate-300"
                      }`}
                    >
                      {r.status === "completed" ? "OK" : r.status === "failed" ? "FAIL" : r.status}
                    </span>
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
        </div>
      </div>

      {/* Execution log (only show when running or has log) */}
      {simLog.length > 0 && (
        <div className="glass rounded-xl p-5">
          <h2 className="text-sm font-medium text-white mb-3">Execution log</h2>
          <div
            ref={logRef}
            className="rounded-lg bg-black/40 border border-white/[0.06] p-4 font-mono text-[11px] text-slate-400 leading-relaxed max-h-[250px] overflow-y-auto whitespace-pre-wrap"
          >
            {simLog.map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith("✅") ? "text-mdb-leaf font-semibold" :
                  line.startsWith("  ✓") ? "text-mdb-leaf/80" :
                  line.startsWith("  ✗") ? "text-red-400" :
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
        </div>
      )}

      {/* Delete button */}
      <div className="flex justify-end pt-4 border-t border-[#112733]">
        <button
          type="button"
          disabled={deleting}
          onClick={handleDelete}
          className="rounded-lg border border-red-500/25 text-red-400/70 px-4 py-2 text-sm hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50 transition-colors"
        >
          {deleting ? "Deleting..." : "Delete workflow"}
        </button>
      </div>
    </div>
  );
}
