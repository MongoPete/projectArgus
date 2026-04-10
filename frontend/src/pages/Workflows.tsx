import { useCallback, useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/api";
import type { Workflow, RunRecord } from "@/types";

// =============================================================================
// CONSTANTS & HELPERS
// =============================================================================

const AGENT_ICONS: Record<string, string> = {
  spend: "$",
  slow_query: "Q",
  backup: "B",
  security: "S",
  index_rationalization: "I",
  data_quality: "D",
  scaling: "C",
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
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatNextRun(cron: string | null): string | null {
  if (!cron) return null;
  // Simple heuristic for demo
  if (cron.includes("0 * * * *")) return "in ~1h";
  if (cron.includes("0 */6 * * *")) return "in ~6h";
  if (cron.includes("0 7 * * *")) return "tomorrow 7am";
  return "scheduled";
}

function getScheduleLabel(trigger: string, cron: string | null): string {
  if (trigger === "manual") return "Manual";
  if (!cron) return "Scheduled";
  if (cron.includes("0 * * * *")) return "Every hour";
  if (cron.includes("0 */6 * * *")) return "Every 6h";
  if (cron.includes("0 7 * * *")) return "Daily";
  return "Scheduled";
}

type TabType = "active" | "past" | "all";

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function Workflows() {
  const nav = useNavigate();
  const [items, setItems] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("active");

  const load = useCallback(() => {
    Promise.all([
      api.workflows.list(),
      api.runs.list(),
    ])
      .then(([workflows, runRecords]) => {
        setItems(workflows);
        setRuns(runRecords);
      })
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runOne(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setRunning(id);
    setErr(null);
    try {
      await api.runs.runWorkflow(id);
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRunning(null);
    }
  }

  async function deleteOne(wf: Workflow, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${wf.name}" and all its runs and findings?`)) return;
    setDeletingId(wf.id);
    try {
      await api.workflows.delete(wf.id);
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  // Derive workflow metadata from runs
  const workflowMeta = useMemo(() => {
    const meta: Record<string, {
      lastRun: RunRecord | null;
      findingsCount: number;
      status: "ok" | "warning" | "inactive";
    }> = {};

    items.forEach((w) => {
      const workflowRuns = runs
        .filter((r) => r.workflow_id === w.id)
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

      const lastRun = workflowRuns[0] || null;
      const findingsCount = workflowRuns.reduce((sum, r) => {
        const count = r.trace.filter((t) => t.message.toLowerCase().includes("finding")).length;
        return sum + count;
      }, 0);

      let status: "ok" | "warning" | "inactive" = "inactive";
      if (lastRun) {
        if (lastRun.status === "completed") {
          status = "ok";
        } else if (lastRun.status === "failed") {
          status = "warning";
        }
      }

      meta[w.id] = { lastRun, findingsCount, status };
    });

    return meta;
  }, [items, runs]);

  // Filter by tab
  const filteredItems = useMemo(() => {
    if (activeTab === "all") return items;
    if (activeTab === "active") {
      return items.filter((w) => w.trigger !== "manual" || workflowMeta[w.id]?.lastRun);
    }
    // past = completed or no recent runs
    return items.filter((w) => {
      const meta = workflowMeta[w.id];
      return !meta?.lastRun || w.trigger === "manual";
    });
  }, [items, activeTab, workflowMeta]);

  const activeCount = items.filter((w) => w.trigger !== "manual" || workflowMeta[w.id]?.lastRun).length;
  const pastCount = items.length - activeCount;

  // Count total clusters (demo: use step count as proxy)
  const totalClusters = useMemo(() => {
    const set = new Set<string>();
    items.forEach((w) => {
      // Demo: assume each workflow monitors some clusters
      set.add(`cluster-${w.id.slice(0, 4)}`);
    });
    return Math.max(set.size * 2, 5); // Demo heuristic
  }, [items]);

  if (err && items.length === 0) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-100">
        {err}
      </div>
    );
  }

  const tabStyle = (isActive: boolean) =>
    `px-4 py-2.5 text-sm transition-all ${
      isActive
        ? "text-mdb-leaf border-b-2 border-mdb-leaf"
        : "text-[#889397] border-b-2 border-transparent hover:text-white"
    }`;

  return (
    <div className="space-y-6" data-tour="workflows">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Workflows</h1>
          <p className="text-slate-400 mt-1 text-sm max-w-xl">
            Automated monitoring pipelines that watch your clusters and report findings — write operations always require your approval.
          </p>
        </div>
        <Link
          to="/workflows/new"
          className="rounded-lg bg-mdb-leaf text-mdb-forest px-5 py-2.5 text-sm font-semibold hover:bg-mdb-leaf/90 transition-colors"
        >
          + New workflow
        </Link>
      </div>

      {err && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {err}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#112733]">
        <button
          type="button"
          onClick={() => setActiveTab("active")}
          className={tabStyle(activeTab === "active")}
        >
          Active <span className="text-[#5C6C75] ml-1">{activeCount}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("past")}
          className={tabStyle(activeTab === "past")}
        >
          Past <span className="text-[#5C6C75] ml-1">{pastCount}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={tabStyle(activeTab === "all")}
        >
          All <span className="text-[#5C6C75] ml-1">{items.length}</span>
        </button>
      </div>

      {/* Workflow cards */}
      <div className="space-y-3">
        {filteredItems.length === 0 && (
          <div className="glass rounded-xl p-8 text-center">
            <p className="text-slate-400 mb-4">No workflows yet. Create one to start monitoring your clusters.</p>
            <Link
              to="/workflows/new"
              className="inline-flex items-center rounded-lg bg-mdb-leaf text-mdb-forest px-5 py-2.5 text-sm font-semibold hover:bg-mdb-leaf/90"
            >
              + New workflow
            </Link>
          </div>
        )}

        {filteredItems.map((w) => {
          const meta = workflowMeta[w.id];
          const firstAgent = w.steps[0]?.agent;
          const icon = firstAgent ? AGENT_ICONS[firstAgent] || "$" : "$";
          const isActive = w.trigger !== "manual" || !!meta?.lastRun;

          return (
            <div
              key={w.id}
              onClick={() => nav(`/workflows/${w.id}`)}
              className="glass rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between cursor-pointer hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex gap-4 items-start">
                {/* Icon square with status dot */}
                <div className="relative">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium ${
                      isActive
                        ? "bg-mdb-leaf/10 border border-mdb-leaf/25 text-mdb-leaf"
                        : "bg-mdb-slate border border-[#112733] text-slate-400"
                    }`}
                  >
                    {icon}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Health dot */}
                    <span
                      className="w-[7px] h-[7px] rounded-full shrink-0"
                      style={{
                        background:
                          meta?.status === "ok"
                            ? "#00ED64"
                            : meta?.status === "warning"
                            ? "#FFC010"
                            : "#5C6C75",
                      }}
                    />
                    <h2 className="font-medium text-white">{w.name}</h2>
                    <span
                      className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
                        isActive
                          ? "bg-mdb-leaf/15 text-mdb-leaf border border-mdb-leaf/25"
                          : "bg-slate-600/20 text-slate-400 border border-slate-600/30"
                      }`}
                    >
                      {isActive ? "Active" : "Paused"}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1 truncate max-w-md">
                    {w.description || "—"}
                  </p>
                  <div className="text-xs text-[#5C6C75] mt-2 flex flex-wrap gap-x-2 gap-y-1">
                    <span>{getScheduleLabel(w.trigger, w.schedule_cron)}</span>
                    {meta?.lastRun && (
                      <>
                        <span>·</span>
                        <span>Last run {timeAgo(meta.lastRun.started_at)}</span>
                      </>
                    )}
                    {w.trigger === "schedule" && formatNextRun(w.schedule_cron) && (
                      <>
                        <span>·</span>
                        <span>Next {formatNextRun(w.schedule_cron)}</span>
                      </>
                    )}
                    {meta && meta.findingsCount > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-mdb-leaf">
                          {meta.findingsCount} finding{meta.findingsCount !== 1 ? "s" : ""} open
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                {isActive && (
                  <button
                    type="button"
                    disabled={running === w.id}
                    onClick={(e) => runOne(w.id, e)}
                    className="rounded-lg bg-mdb-leaf/20 border border-mdb-leaf/35 px-4 py-2 text-sm text-mdb-leaf hover:bg-mdb-leaf/30 disabled:opacity-50 transition-colors"
                  >
                    {running === w.id ? "Running..." : "Run now"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={deletingId === w.id}
                  onClick={(e) => deleteOne(w, e)}
                  className="rounded-lg border border-red-500/20 px-3 py-2 text-sm text-red-400/70 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50 transition-colors"
                  title="Delete workflow"
                >
                  {deletingId === w.id ? "..." : "✕"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer bar */}
      {items.length > 0 && (
        <div className="bg-mdb-slate/60 border border-[#112733] rounded-lg px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs text-[#5C6C75]">
            {activeCount} active workflow{activeCount !== 1 ? "s" : ""} monitoring {totalClusters} cluster{totalClusters !== 1 ? "s" : ""}
          </span>
          <Link
            to="/runs"
            className="text-xs text-mdb-leaf hover:underline"
          >
            View run history
          </Link>
        </div>
      )}
    </div>
  );
}
