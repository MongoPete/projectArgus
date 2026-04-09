import { useCallback, useEffect, useState } from "react";
import { api } from "@/api";
import type { Finding, FindingStatus, ReasoningStep } from "@/types";

const severityClass: Record<string, string> = {
  low: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  medium: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  high: "bg-orange-500/15 text-orange-200 border-orange-500/30",
  critical: "bg-red-500/20 text-red-200 border-red-500/40",
};

const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const CATEGORY_META: Record<string, { label: string; icon: string; color: string; barColor: string }> = {
  spend: { label: "Cost optimization", icon: "💰", color: "text-emerald-300", barColor: "bg-emerald-500" },
  slow_query: { label: "Query performance", icon: "⚡", color: "text-amber-300", barColor: "bg-amber-500" },
  backup: { label: "Backup & storage", icon: "🗄️", color: "text-blue-300", barColor: "bg-blue-500" },
  index_rationalization: { label: "Index health", icon: "📇", color: "text-violet-300", barColor: "bg-violet-500" },
  security: { label: "Security", icon: "🛡️", color: "text-red-300", barColor: "bg-red-500" },
  data_quality: { label: "Data quality", icon: "📊", color: "text-cyan-300", barColor: "bg-cyan-500" },
  scaling: { label: "Capacity planning", icon: "📈", color: "text-orange-300", barColor: "bg-orange-500" },
};

function categoryOf(agent: string) {
  return CATEGORY_META[agent] ?? { label: agent.replace(/_/g, " "), icon: "🔍", color: "text-slate-300", barColor: "bg-slate-500" };
}

function EvidenceDisplay({ evidence }: { evidence: Record<string, unknown> }) {
  const entries = Object.entries(evidence);
  if (entries.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
      {entries.map(([key, value]) => {
        const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        let display: string;
        if (Array.isArray(value)) {
          display = value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ");
        } else if (typeof value === "object" && value !== null) {
          display = JSON.stringify(value);
        } else if (typeof value === "number") {
          display = value.toLocaleString();
        } else if (typeof value === "boolean") {
          display = value ? "Yes" : "No";
        } else {
          display = String(value ?? "—");
        }
        return (
          <div key={key} className="rounded-lg bg-black/25 border border-white/[0.04] px-3 py-2">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider truncate">{label}</div>
            <div className="text-xs text-slate-300 mt-0.5 break-words line-clamp-2">{display}</div>
          </div>
        );
      })}
    </div>
  );
}

const ROLE_STYLE: Record<string, { icon: string; label: string; bg: string; text: string; border: string }> = {
  agent: { icon: "🤖", label: "Agent", bg: "bg-indigo-500/10", text: "text-indigo-200", border: "border-indigo-500/20" },
  tool: { icon: "🔧", label: "Tool call", bg: "bg-amber-500/10", text: "text-amber-200", border: "border-amber-500/20" },
  data: { icon: "📦", label: "Data", bg: "bg-cyan-500/10", text: "text-cyan-200", border: "border-cyan-500/20" },
  conclusion: { icon: "✅", label: "Conclusion", bg: "bg-mdb-leaf/10", text: "text-mdb-leaf", border: "border-mdb-leaf/25" },
};

function AgentReasoningPanel({ trace }: { trace: ReasoningStep[] }) {
  const [showAll, setShowAll] = useState(false);
  if (!trace || trace.length === 0) return null;

  const visible = showAll ? trace : trace.slice(0, 4);
  const hasMore = trace.length > 4;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">🧠</span>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Agent reasoning trail</span>
        <span className="text-[10px] text-slate-600">{trace.length} steps</span>
      </div>
      <div className="relative">
        {/* Vertical line connecting steps */}
        <div className="absolute left-[15px] top-4 bottom-4 w-px bg-white/[0.06]" />
        <div className="space-y-2.5">
          {visible.map((step, i) => {
            const style = ROLE_STYLE[step.role] ?? ROLE_STYLE.agent;
            const isCode = step.role === "tool" || step.role === "data";
            return (
              <div key={i} className="flex gap-3 relative">
                <div className={`w-[30px] h-[30px] shrink-0 rounded-full flex items-center justify-center text-[11px] ${style.bg} ${style.border} border z-10`}>
                  {style.icon}
                </div>
                <div className={`flex-1 rounded-xl border px-4 py-3 ${style.bg} ${style.border}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${style.text}`}>
                      {style.label}
                    </span>
                    {step.role === "conclusion" && (
                      <span className="text-[9px] text-mdb-leaf/60 bg-mdb-leaf/10 px-1.5 py-0.5 rounded">Final</span>
                    )}
                  </div>
                  {isCode ? (
                    <pre className="text-[11px] font-mono text-slate-300 whitespace-pre-wrap break-all leading-relaxed">
                      {step.content}
                    </pre>
                  ) : (
                    <p className="text-[12px] text-slate-300 leading-relaxed">{step.content}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {hasMore && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-xs text-mdb-leaf hover:underline ml-[42px] mt-1"
        >
          Show all {trace.length} reasoning steps →
        </button>
      )}
      {showAll && hasMore && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="text-xs text-slate-400 hover:underline ml-[42px] mt-1"
        >
          Collapse
        </button>
      )}
    </div>
  );
}

export function Findings() {
  const [items, setItems] = useState<Finding[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string | null>(null);

  const load = useCallback(() => {
    api.findings
      .list()
      .then(setItems)
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: string, status: FindingStatus) {
    await api.findings.setStatus(id, status);
    load();
  }

  if (err && items.length === 0) {
    return <div className="text-red-300">{err}</div>;
  }

  const open = items.filter((f) => f.status === "new" || f.status === "acknowledged");
  const totalSavings = open.reduce((sum, f) => sum + (f.estimated_monthly_savings_usd ?? 0), 0);
  const highCount = open.filter((f) => f.severity === "high" || f.severity === "critical").length;
  const securityCount = open.filter((f) => f.agent === "security").length;

  // Savings by category
  const savingsByCategory: Record<string, { savings: number; count: number }> = {};
  for (const f of open) {
    const cat = f.agent;
    if (!savingsByCategory[cat]) savingsByCategory[cat] = { savings: 0, count: 0 };
    savingsByCategory[cat].savings += f.estimated_monthly_savings_usd ?? 0;
    savingsByCategory[cat].count += 1;
  }
  const sortedCategories = Object.entries(savingsByCategory)
    .sort(([, a], [, b]) => b.savings - a.savings);
  const maxCatSavings = Math.max(...sortedCategories.map(([, v]) => v.savings), 1);

  // Filtered and sorted
  const filtered = filterCat ? items.filter((f) => f.agent === filterCat) : items;
  const sorted = [...filtered].sort(
    (a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Findings</h1>
        <p className="text-slate-400 mt-1">
          Actionable recommendations with evidence. Approve, acknowledge, or dismiss — any cluster changes require your sign-off.
        </p>
      </div>

      {/* Hero summary */}
      <div className="glass rounded-xl p-6 border-l-2 border-mdb-leaf" data-tour="findings-summary">
        <div className="flex flex-wrap gap-6 items-start">
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wider">Total addressable savings</div>
            <div className="text-3xl font-bold text-mdb-leaf mt-1">
              ${totalSavings.toLocaleString()}<span className="text-lg text-mdb-leaf/70">/mo</span>
            </div>
            <div className="text-sm text-slate-400 mt-0.5">
              ${(totalSavings * 12).toLocaleString()}/year annualized
            </div>
          </div>
          <div className="hidden sm:block w-px h-16 bg-mdb-leaf/15 self-center" />
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Open</div>
              <div className="text-xl font-semibold text-white mt-0.5">{open.length}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">High / Critical</div>
              <div className="text-xl font-semibold text-orange-300 mt-0.5">{highCount}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Security</div>
              <div className="text-xl font-semibold text-red-300 mt-0.5">{securityCount}</div>
            </div>
          </div>
        </div>

        {/* What this means */}
        {totalSavings > 0 && (
          <div className="mt-5 pt-4 border-t border-mdb-leaf/10">
            <p className="text-sm text-slate-300 leading-relaxed">
              <span className="text-white font-medium">What this means:</span>{" "}
              MDBA analyzed your clusters and identified{" "}
              <span className="text-mdb-leaf font-medium">${totalSavings.toLocaleString()}/month</span> in
              addressable savings across {Object.keys(savingsByCategory).length} categories.{" "}
              {highCount > 0 && (
                <>
                  <span className="text-orange-300">{highCount} finding{highCount > 1 ? "s" : ""}</span> require
                  immediate attention.{" "}
                </>
              )}
              {securityCount > 0 && (
                <>
                  <span className="text-red-300">{securityCount} security finding{securityCount > 1 ? "s" : ""}</span> flagged
                  for compliance review.{" "}
                </>
              )}
              None of these changes will be applied without your explicit approval.
            </p>
          </div>
        )}
      </div>

      {/* Savings by category */}
      {sortedCategories.length > 0 && (
        <div className="glass rounded-xl p-6">
          <h2 className="text-sm font-medium text-white mb-4">Savings breakdown by category</h2>
          <div className="space-y-3">
            {sortedCategories.map(([cat, { savings, count }]) => {
              const meta = categoryOf(cat);
              const pct = totalSavings > 0 ? ((savings / totalSavings) * 100) : 0;
              const barW = (savings / maxCatSavings) * 100;
              const isActive = filterCat === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilterCat(isActive ? null : cat)}
                  className={`w-full text-left rounded-xl border p-4 transition-all ${
                    isActive
                      ? "border-mdb-leaf/40 bg-mdb-leaf/[0.06]"
                      : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{meta.icon}</span>
                      <span className={`text-sm font-medium ${meta.color}`}>{meta.label}</span>
                      <span className="text-[10px] text-slate-500">{count} finding{count > 1 ? "s" : ""}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {savings > 0 && (
                        <span className="text-sm font-semibold text-mdb-leaf">
                          ${savings.toLocaleString()}/mo
                        </span>
                      )}
                      {pct > 0 && (
                        <span className="text-[10px] text-slate-500">
                          ({pct.toFixed(0)}%)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${meta.barColor} transition-all`}
                      style={{ width: `${barW}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
          {filterCat && (
            <button
              type="button"
              onClick={() => setFilterCat(null)}
              className="mt-3 text-xs text-slate-400 hover:text-white"
            >
              Clear filter ×
            </button>
          )}
        </div>
      )}

      {/* Findings list */}
      <div data-tour="findings-list">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-white">
            {filterCat ? `${categoryOf(filterCat).label} findings` : "All findings"}
            <span className="text-slate-500 ml-2">({sorted.length})</span>
          </h2>
        </div>
        <div className="space-y-3">
          {sorted.map((f) => {
            const meta = categoryOf(f.agent);
            const isOpen = expanded === f.id;
            return (
              <div key={f.id} className="glass rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : f.id)}
                  className="w-full text-left p-5 hover:bg-mdb-leaf/5 transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${severityClass[f.severity]}`}
                    >
                      {f.severity}
                    </span>
                    <span className={`text-[10px] ${meta.color}`}>{meta.icon} {meta.label}</span>
                    <span className="text-[10px] text-slate-500">· {f.status}</span>
                    {f.estimated_monthly_savings_usd != null && (
                      <span className="text-xs text-mdb-leaf ml-auto font-semibold">
                        ~${f.estimated_monthly_savings_usd.toLocaleString()}/mo
                      </span>
                    )}
                    {f.estimated_monthly_savings_usd == null && f.agent === "security" && (
                      <span className="text-[10px] text-red-300/70 ml-auto uppercase tracking-wider">
                        Security review
                      </span>
                    )}
                  </div>
                  <h2 className="font-medium text-white mt-2">{f.title}</h2>
                  <p className="text-sm text-slate-400 mt-1 line-clamp-2">{f.summary}</p>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 border-t border-mdb-leaf/10 pt-4 space-y-5">
                    {/* Full summary */}
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">
                        Analysis
                      </div>
                      <p className="text-sm text-slate-300 leading-relaxed">{f.summary}</p>
                    </div>

                    {/* Recommendations */}
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">
                        Recommendations
                      </div>
                      <div className="space-y-2">
                        {f.recommendations.map((r, i) => (
                          <div key={r} className="flex gap-3 rounded-lg bg-mdb-forest/20 border border-mdb-leaf/10 px-4 py-3">
                            <span className="text-mdb-leaf font-bold shrink-0 text-sm">{i + 1}</span>
                            <span className="text-sm text-slate-300">{r}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Agent reasoning trail */}
                    {f.reasoning_trace && f.reasoning_trace.length > 0 && (
                      <AgentReasoningPanel trace={f.reasoning_trace} />
                    )}

                    {/* Evidence */}
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">
                        Evidence
                      </div>
                      <EvidenceDisplay evidence={f.evidence} />
                    </div>

                    {/* Raw JSON toggle */}
                    <details className="text-xs text-slate-500">
                      <summary className="cursor-pointer text-slate-400 hover:text-slate-300 py-1">
                        View raw evidence JSON
                      </summary>
                      <pre className="mt-2 text-[11px] font-mono text-slate-500 bg-black/30 rounded-lg p-3 overflow-x-auto">
                        {JSON.stringify(f.evidence, null, 2)}
                      </pre>
                    </details>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-white/[0.04]">
                      {f.status === "new" && (
                        <button
                          type="button"
                          onClick={() => setStatus(f.id, "acknowledged")}
                          className="rounded-lg bg-mdb-leaf/10 border border-mdb-leaf/30 px-4 py-2 text-xs text-mdb-leaf font-medium hover:bg-mdb-leaf/20"
                        >
                          Acknowledge
                        </button>
                      )}
                      {(f.status === "new" || f.status === "acknowledged") && (
                        <>
                          <button
                            type="button"
                            onClick={() => setStatus(f.id, "approved")}
                            className="rounded-lg bg-mdb-leaf text-mdb-forest px-4 py-2 text-xs font-semibold hover:bg-mdb-leaf/90"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => setStatus(f.id, "dismissed")}
                            className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 hover:border-slate-500"
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                      {f.status === "approved" && (
                        <span className="text-xs text-mdb-leaf/70 py-2">✓ Approved — queued for execution</span>
                      )}
                      {f.status === "dismissed" && (
                        <span className="text-xs text-slate-500 py-2">Dismissed</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {sorted.length === 0 && (
            <div className="glass rounded-xl p-8 text-center text-slate-500">
              {filterCat ? "No findings in this category." : "No findings yet. Run a workflow to generate findings."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
