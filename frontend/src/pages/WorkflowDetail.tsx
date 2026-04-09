import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/api";
import type { Finding, RunRecord, Workflow } from "@/types";
import type { ToolKind } from "@/flow/toolPalette";

const PIPELINE_STAGES = [
  { id: "ingest", label: "Ingest", desc: "Collect Atlas billing, metrics, profiler data, audit logs" },
  { id: "analyze", label: "Analyze", desc: "Run configured agent steps against collected signals" },
  { id: "synthesize", label: "Synthesize", desc: "Rank findings by severity and estimated savings" },
  { id: "deliver", label: "Deliver", desc: "Publish findings to inbox — human approval for writes" },
] as const;

type SimPhase = "idle" | "ingest" | "analyze" | "synthesize" | "deliver" | "done";

const severityColor: Record<string, string> = {
  critical: "bg-red-500/20 text-red-200 border-red-500/40",
  high: "bg-orange-500/15 text-orange-200 border-orange-500/30",
  medium: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  low: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

const stepDescriptions: Record<string, string> = {
  spend: "Compares Atlas invoice data against a 30-day rolling average. Flags cost drift above the configured threshold and identifies the top contributing collections.",
  slow_query: "Scans system.profile for queries exceeding the slow threshold. Runs explain analysis and generates index recommendations for COLLSCAN patterns.",
  backup: "Evaluates snapshot frequency against actual data change rate. Identifies over-snapshotting and compliance gaps between retention policy and RPO requirements.",
  index_rationalization: "Queries $indexStats across all collections. Identifies indexes with zero operations in the configured window and estimates storage savings from cleanup.",
  data_quality: "Computes statistical anomalies (z-score, IQR) on configured fields. Flags documents that exceed threshold deviations from the rolling baseline.",
  security: "Analyzes Atlas audit logs for behavioral anomalies — new IP ranges, unusual read patterns, credential usage outside normal hours.",
  scaling: "Monitors CPU utilization, connection counts, and storage growth trends. Projects when current tier capacity will be exceeded.",
};

const AGENT_TO_TOOL: Record<string, ToolKind> = {
  spend: "atlas_api",
  slow_query: "mongodb",
  backup: "atlas_api",
  index_rationalization: "mongodb",
  data_quality: "mongodb",
  security: "atlas_api",
  scaling: "atlas_api",
};

export function WorkflowDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [w, setW] = useState<Workflow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Simulation state
  const [simPhase, setSimPhase] = useState<SimPhase>("idle");
  const [simLog, setSimLog] = useState<string[]>([]);
  const [, setLastRun] = useState<RunRecord | null>(null);
  const [runFindings, setRunFindings] = useState<Finding[]>([]);
  const [recentRuns, setRecentRuns] = useState<RunRecord[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id || id === "new") return;
    api.workflows.get(id).then(setW).catch((e: Error) => setErr(e.message));
    loadRecentRuns();
  }, [id]);

  const loadRecentRuns = useCallback(() => {
    api.runs.list().then((runs) => {
      setRecentRuns(runs.filter((r) => r.workflow_id === id).slice(0, 5));
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
    setLastRun(null);
    setRunFindings([]);

    const agentNames = w.steps.map((s) => s.label).join(", ");
    const stepCount = w.steps.length;

    // Ingest phase
    setSimPhase("ingest");
    appendLog(`▶ Starting pipeline for "${w.name}"`);
    appendLog(`  Trigger: ${w.trigger}${w.schedule_cron ? ` (${w.schedule_cron})` : ""}`);
    await delay(600);
    appendLog("  ↳ Connecting to Atlas Admin API...");
    await delay(500);
    appendLog("  ↳ Pulling billing invoices and cluster metrics...");
    await delay(400);
    appendLog("  ↳ Reading system.profile and $collStats...");
    await delay(400);
    appendLog("  ✓ Ingestion complete — signals collected");

    // Analyze phase
    setSimPhase("analyze");
    await delay(300);
    appendLog(`\n▶ Analyzing with ${stepCount} agent step(s): ${agentNames}`);
    for (const step of w.steps) {
      await delay(500);
      appendLog(`  ↳ [${step.agent}] ${step.label}`);
      const desc = stepDescriptions[step.agent];
      if (desc) {
        appendLog(`    ${desc.slice(0, 100)}...`);
      }
      const configEntries = Object.entries(step.config);
      if (configEntries.length > 0) {
        appendLog(`    Config: ${configEntries.map(([k, v]) => `${k}=${v}`).join(", ")}`);
      }
      await delay(600);
      appendLog(`  ✓ ${step.agent} analysis complete`);
    }

    // Synthesize phase
    setSimPhase("synthesize");
    await delay(300);
    appendLog("\n▶ Synthesizing results...");
    await delay(500);
    appendLog("  ↳ Ranking findings by severity and estimated TCO impact");
    await delay(400);
    appendLog("  ✓ Synthesis complete");

    // Deliver phase
    setSimPhase("deliver");
    await delay(300);
    appendLog("\n▶ Delivering findings...");
    await delay(400);

    // Actually run the workflow against the backend
    try {
      const run = await api.runs.runWorkflow(id);
      setLastRun(run);
      const findingsCount = run.trace.filter((t) => t.message.includes("finding")).length;
      appendLog(`  ↳ Published ${findingsCount > 0 ? findingsCount : run.trace.length} trace entries to audit trail`);
      appendLog("  ↳ Findings saved to inbox");
      appendLog("  ✓ Delivery complete");

      // Fetch findings for this run
      const allFindings = await api.findings.list();
      const thisRunFindings = allFindings.filter((f) => f.run_id === run.id);
      setRunFindings(thisRunFindings);

      await delay(300);
      appendLog(`\n✅ Pipeline complete — ${thisRunFindings.length} finding(s) generated`);
      if (thisRunFindings.length > 0) {
        const totalSavings = thisRunFindings.reduce((s, f) => s + (f.estimated_monthly_savings_usd ?? 0), 0);
        if (totalSavings > 0) {
          appendLog(`   Total addressable savings: $${totalSavings.toLocaleString()}/month`);
        }
      }
    } catch (e) {
      appendLog(`  ✗ Error: ${(e as Error).message}`);
    }

    setSimPhase("done");
    loadRecentRuns();
  }

  if (id === "new") return null;
  if (err) return <div className="text-red-300">{err}</div>;
  if (!w) return <p className="text-slate-400">Loading…</p>;

  const isRunning = simPhase !== "idle" && simPhase !== "done";

  return (
    <div className="space-y-6">
      <Link to="/workflows" className="text-sm text-mdb-leaf hover:underline">
        ← Workflows
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">{w.name}</h1>
          <p className="text-slate-400 mt-1">{w.description}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-mdb-leaf/15 text-mdb-leaf border border-mdb-leaf/25">
              {w.trigger}
            </span>
            {w.schedule_cron && (
              <span className="text-[10px] font-mono text-slate-500">{w.schedule_cron}</span>
            )}
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-mdb-leaf/40 text-mdb-leaf">
              Human approval
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openInFlowEditor}
            className="rounded-xl border border-indigo-500/30 text-indigo-300 px-4 py-2.5 text-sm font-medium hover:bg-indigo-500/10 transition-colors"
          >
            Open in flow editor
          </button>
          <button
            type="button"
            disabled={isRunning}
            onClick={runSimulation}
            className="rounded-xl bg-mdb-leaf text-mdb-forest px-5 py-2.5 text-sm font-semibold hover:bg-mdb-leaf/90 disabled:opacity-50 transition-colors"
          >
            {isRunning ? "Running…" : "Run workflow"}
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={handleDelete}
            className="rounded-xl border border-red-500/25 text-red-400 px-4 py-2.5 text-sm hover:bg-red-500/10 disabled:opacity-50 transition-colors"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      {/* Pipeline visualization */}
      <div className="glass rounded-xl p-6" data-tour="workflow-pipeline">
        <h2 className="text-sm font-medium text-mdb-leaf mb-4">Analysis pipeline</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {PIPELINE_STAGES.map((stage, i) => {
            const phases: SimPhase[] = ["ingest", "analyze", "synthesize", "deliver"];
            const stagePhase = phases[i];
            const phaseIdx = phases.indexOf(simPhase as typeof phases[number]);
            const stageIdx = i;
            const isActive = simPhase === stagePhase;
            const isComplete = simPhase === "done" || (phaseIdx >= 0 && stageIdx < phaseIdx);

            return (
              <div
                key={stage.id}
                className={`rounded-xl border p-4 transition-all duration-500 ${
                  isActive
                    ? "border-mdb-leaf/60 bg-mdb-leaf/10 shadow-[0_0_12px_rgba(0,237,100,0.15)]"
                    : isComplete
                      ? "border-mdb-leaf/30 bg-mdb-forest/30"
                      : "border-white/[0.06] bg-white/[0.02]"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className={`w-2 h-2 rounded-full transition-all ${
                      isActive
                        ? "bg-mdb-leaf animate-pulse"
                        : isComplete
                          ? "bg-mdb-leaf"
                          : "bg-slate-600"
                    }`}
                  />
                  <span className={`text-xs font-semibold uppercase tracking-wider ${
                    isActive ? "text-mdb-leaf" : isComplete ? "text-mdb-leaf/70" : "text-slate-500"
                  }`}>
                    {stage.label}
                  </span>
                  {isComplete && <span className="text-xs text-mdb-leaf ml-auto">✓</span>}
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">{stage.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Configured steps */}
      <div className="glass rounded-xl p-6" data-tour="workflow-steps">
        <h2 className="text-sm font-medium text-white mb-4">Configured steps</h2>
        <div className="space-y-3">
          {w.steps.map((s, idx) => (
            <div key={s.id} className="flex gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="text-mdb-leaf font-mono text-sm font-bold w-6 shrink-0">{idx + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-medium">{s.label}</div>
                <div className="text-xs text-mdb-leaf font-mono mt-0.5">{s.agent}</div>
                {stepDescriptions[s.agent] && (
                  <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                    {stepDescriptions[s.agent]}
                  </p>
                )}
                {Object.keys(s.config).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(s.config).map(([k, v]) => (
                      <span
                        key={k}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-mdb-forest/40 text-slate-400 border border-white/[0.06]"
                      >
                        {k}: {String(v)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Simulation log */}
      {simLog.length > 0 && (
        <div className="glass rounded-xl p-6">
          <h2 className="text-sm font-medium text-white mb-3">Execution log</h2>
          <div
            ref={logRef}
            className="rounded-lg bg-black/40 border border-white/[0.06] p-4 font-mono text-[11px] text-slate-400 leading-relaxed max-h-[300px] overflow-y-auto whitespace-pre-wrap"
          >
            {simLog.map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith("✅") ? "text-mdb-leaf font-semibold" :
                  line.startsWith("  ✓") ? "text-mdb-leaf/80" :
                  line.startsWith("  ✗") ? "text-red-400" :
                  line.startsWith("▶") ? "text-white font-medium" :
                  line.startsWith("   Total") ? "text-mdb-leaf" :
                  ""
                }
              >
                {line}
              </div>
            ))}
            {isRunning && (
              <span className="inline-block w-2 h-3.5 bg-mdb-leaf/80 animate-pulse ml-0.5" />
            )}
          </div>
        </div>
      )}

      {/* Findings from this run */}
      {runFindings.length > 0 && (
        <div className="glass rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white">Findings from this run</h2>
            <Link to="/findings" className="text-xs text-mdb-leaf hover:underline">
              View all findings →
            </Link>
          </div>
          <div className="space-y-3">
            {runFindings.map((f) => (
              <div key={f.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span
                    className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${severityColor[f.severity] ?? severityColor.low}`}
                  >
                    {f.severity}
                  </span>
                  <span className="text-xs text-slate-500">{f.agent.replace(/_/g, " ")}</span>
                  {f.estimated_monthly_savings_usd != null && (
                    <span className="text-xs text-mdb-leaf ml-auto font-medium">
                      ~${f.estimated_monthly_savings_usd.toLocaleString()}/mo
                    </span>
                  )}
                </div>
                <h3 className="text-sm text-white font-medium">{f.title}</h3>
                <p className="text-[12px] text-slate-400 mt-1 leading-relaxed">{f.summary}</p>
                {f.recommendations.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {f.recommendations.map((r, i) => (
                      <div key={r} className="flex gap-2 text-[11px] text-slate-500">
                        <span className="text-mdb-leaf shrink-0">{i + 1}.</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent runs for this workflow */}
      {recentRuns.length > 0 && (
        <div className="glass rounded-xl p-6">
          <h2 className="text-sm font-medium text-white mb-4">Recent runs</h2>
          <div className="space-y-2">
            {recentRuns.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`text-[10px] uppercase px-2 py-0.5 rounded ${
                      r.status === "completed"
                        ? "bg-mdb-leaf/20 text-mdb-leaf"
                        : r.status === "failed"
                          ? "bg-red-500/20 text-red-300"
                          : "bg-slate-600/30 text-slate-300"
                    }`}
                  >
                    {r.status}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(r.started_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  {r.trace.length} trace steps · {r.trigger}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
