import { useCallback, useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/api";
import type { Workflow, RunRecord } from "@/types";
import { TabBar, type Tab } from "@/components/TabBar";
import { PageContainer, PageHeader, Card } from "@/components/PageContainer";

// =============================================================================
// ICONS - Minimal monochrome SVG icons
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

function IconWorkflow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

const AGENT_ICONS: Record<string, React.ReactNode> = {
  spend: <IconDollar />,
  slow_query: <IconQuery />,
  backup: <IconBackup />,
  security: <IconSecurity />,
  index_rationalization: <IconIndex />,
  data_quality: <IconData />,
  scaling: <IconScaling />,
};

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
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getScheduleLabel(trigger: string, cron: string | null): string {
  if (trigger === "manual") return "Manual";
  if (!cron) return "Scheduled";
  if (cron.includes("0 * * * *")) return "Hourly";
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
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
    return items.filter((w) => {
      const meta = workflowMeta[w.id];
      return !meta?.lastRun || w.trigger === "manual";
    });
  }, [items, activeTab, workflowMeta]);

  const activeCount = items.filter((w) => w.trigger !== "manual" || workflowMeta[w.id]?.lastRun).length;
  const pastCount = items.length - activeCount;

  // Tab configuration
  const tabs: Tab<TabType>[] = [
    { key: "active", label: "Active", count: activeCount },
    { key: "past", label: "Past", count: pastCount },
    { key: "all", label: "All", count: items.length },
  ];

  if (err && items.length === 0) {
    return (
      <PageContainer>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-100">
          {err}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Workflows"
        actions={
          <Link
            to="/workflows/new"
            data-tour="create-btn"
            className="rounded-lg bg-mdb-leaf text-[#001E2B] px-5 py-2.5 text-sm font-semibold hover:bg-mdb-leaf/90 shadow-[0_0_20px_rgba(0,237,100,0.3)] hover:shadow-[0_0_25px_rgba(0,237,100,0.4)] transition-all"
          >
            + Create workflow
          </Link>
        }
      />

      {err && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {err}
        </div>
      )}

      {/* Tabs */}
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Workflow cards */}
      <div className="space-y-2" data-tour="workflows">
        {filteredItems.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-[#889397] mb-4">No workflows yet.</p>
            <Link
              to="/workflows/new"
              className="inline-flex items-center rounded-lg bg-mdb-leaf text-[#001E2B] px-5 py-2.5 text-sm font-semibold hover:bg-mdb-leaf/90 shadow-[0_0_20px_rgba(0,237,100,0.3)] transition-all"
            >
              + Create workflow
            </Link>
          </Card>
        )}

        {filteredItems.map((w) => {
          const meta = workflowMeta[w.id];
          const firstAgent = w.steps[0]?.agent;
          const icon = firstAgent ? AGENT_ICONS[firstAgent] || <IconWorkflow /> : <IconWorkflow />;
          const isActive = w.trigger !== "manual" || !!meta?.lastRun;
          const isHovered = hoveredId === w.id;

          return (
            <Card
              key={w.id}
              onClick={() => nav(`/workflows/${w.id}`)}
              hoverable
              className="p-4 flex items-center gap-4"
              onMouseEnter={() => setHoveredId(w.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Icon */}
              <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${
                isActive ? "bg-[#112733] text-[#889397]" : "bg-[#0A1A1F] text-[#5C6C75]"
              }`}>
                {icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {/* Status dot - subtle */}
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      meta?.status === "ok"
                        ? "bg-mdb-leaf"
                        : meta?.status === "warning"
                          ? "bg-[#FFC010]"
                          : "bg-[#3D4F58]"
                    }`}
                  />
                  <h2 className="font-medium text-white truncate">{w.name}</h2>
                </div>
                <div className="text-[13px] text-[#5C6C75] mt-0.5 flex items-center gap-1.5">
                  <span>{getScheduleLabel(w.trigger, w.schedule_cron)}</span>
                  {meta?.lastRun && (
                    <>
                      <span className="text-[#3D4F58]">·</span>
                      <span>{timeAgo(meta.lastRun.started_at)}</span>
                    </>
                  )}
                  {meta && meta.findingsCount > 0 && (
                    <>
                      <span className="text-[#3D4F58]">·</span>
                      <span>{meta.findingsCount} finding{meta.findingsCount !== 1 ? "s" : ""}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Actions - show on hover */}
              <div
                className={`flex gap-1.5 shrink-0 transition-opacity ${isHovered ? "opacity-100" : "opacity-0"}`}
                onClick={(e) => e.stopPropagation()}
              >
                {isActive && (
                  <button
                    type="button"
                    disabled={running === w.id}
                    onClick={(e) => runOne(w.id, e)}
                    className="rounded-md border border-[#1C2D38] px-3 py-1.5 text-xs text-[#C5CDD3] hover:bg-[#112733] hover:border-[#2A3F4D] disabled:opacity-50 transition-colors"
                  >
                    {running === w.id ? "Running..." : "Run"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={deletingId === w.id}
                  onClick={(e) => deleteOne(w, e)}
                  className="rounded-md border border-[#1C2D38] px-2 py-1.5 text-xs text-[#5C6C75] hover:bg-[#112733] hover:text-[#889397] disabled:opacity-50 transition-colors"
                  title="Delete workflow"
                >
                  {deletingId === w.id ? "..." : "✕"}
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Minimal footer - just a link */}
      {items.length > 0 && (
        <div className="flex justify-end pt-2">
          <Link
            to="/runs"
            className="text-xs text-[#5C6C75] hover:text-[#889397] transition-colors"
          >
            View run history →
          </Link>
        </div>
      )}
    </PageContainer>
  );
}
