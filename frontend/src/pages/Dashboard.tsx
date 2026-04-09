import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api";
import type { DashboardSummary } from "@/types";

const severityColor: Record<string, string> = {
  critical: "bg-red-500/20 text-red-200 border-red-500/40",
  high: "bg-orange-500/15 text-orange-200 border-orange-500/30",
  medium: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  low: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

export function Dashboard() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .dashboard()
      .then(setData)
      .catch((e: Error) => setErr(e.message));
  }, []);

  if (err) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-100">
        <p className="font-medium">Could not load dashboard</p>
        <p className="text-sm mt-2 text-amber-200/80">{err}</p>
        <p className="text-xs mt-4 text-slate-400">
          Start MongoDB (<code className="text-mdb-leaf">docker compose up -d</code>) and the API (
          <code className="text-mdb-leaf">uvicorn app.main:app</code>).
        </p>
      </div>
    );
  }

  if (!data) {
    return <p className="text-slate-400">Loading cluster intelligence…</p>;
  }

  return (
    <div className="space-y-8">
      {/* Hero */}
      <header>
        <p className="text-xs uppercase tracking-wider text-mdb-leaf font-medium">
          MDBA — Proactive Atlas Advisor
        </p>
        <h1 className="text-2xl font-semibold text-white mt-1">
          Here's what we found across your {data.clusters_monitored} clusters
        </h1>
        <p className="text-slate-400 mt-2 max-w-2xl text-sm leading-relaxed">
          MDBA continuously monitors spend, query health, backups, security, and data quality.
          Everything below was generated automatically — no manual investigation required.
        </p>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4" data-tour="savings">
        <div className="glass rounded-xl p-5 border-l-2 border-mdb-leaf">
          <div className="text-slate-400 text-xs uppercase tracking-wider">Addressable savings</div>
          <div className="text-3xl font-bold text-mdb-leaf mt-2 tabular-nums">
            ${data.total_addressable_savings_usd.toLocaleString()}<span className="text-lg text-mdb-leaf/70">/mo</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">${(data.total_addressable_savings_usd * 12).toLocaleString()}/year potential</div>
        </div>
        <div className="glass rounded-xl p-5">
          <div className="text-slate-400 text-xs uppercase tracking-wider">Open findings</div>
          <div className="text-3xl font-semibold text-white mt-2 tabular-nums">{data.open_findings}</div>
          <div className="text-xs text-slate-500 mt-1">Awaiting review</div>
        </div>
        <div className="glass rounded-xl p-5">
          <div className="text-slate-400 text-xs uppercase tracking-wider">High / Critical</div>
          <div className="text-3xl font-semibold text-orange-300 mt-2 tabular-nums">{data.high_or_critical_findings}</div>
          <div className="text-xs text-slate-500 mt-1">Needs attention now</div>
        </div>
        <div className="glass rounded-xl p-5">
          <div className="text-slate-400 text-xs uppercase tracking-wider">Runs this week</div>
          <div className="text-3xl font-semibold text-white mt-2 tabular-nums">{data.runs_last_7d}</div>
          <div className="text-xs text-slate-500 mt-1">Automated analyses</div>
        </div>
        <div className="glass rounded-xl p-5">
          <div className="text-slate-400 text-xs uppercase tracking-wider">Active workflows</div>
          <div className="text-3xl font-semibold text-white mt-2 tabular-nums">{data.workflows_active}</div>
          <div className="text-xs text-slate-500 mt-1">Monitoring your estate</div>
        </div>
      </div>

      {/* Spend signal */}
      {data.spend_delta_pct != null && (
        <div className="glass rounded-xl p-6 border-l-2 border-orange-400/60">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs uppercase tracking-wider text-orange-300 font-medium">Spend alert</span>
            <span className="text-2xl font-bold text-white">+{data.spend_delta_pct}%</span>
            <span className="text-sm text-slate-400">week-over-week cost increase detected</span>
          </div>
          {data.cost_drivers.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {data.cost_drivers.map((d) => (
                <span
                  key={d}
                  className="text-xs px-3 py-1.5 rounded-full bg-mdb-leaf/10 text-slate-300 border border-mdb-leaf/20"
                >
                  {d}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Top findings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4" data-tour="top-findings">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-white">Top findings requiring action</h2>
            <Link
              to="/findings"
              className="text-xs text-mdb-leaf hover:underline"
            >
              View all findings →
            </Link>
          </div>
          <div className="space-y-2">
            {data.top_findings.map((f) => (
              <Link
                key={f.id}
                to="/findings"
                className="block glass rounded-xl p-4 hover:border-mdb-leaf/40 transition-colors"
              >
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
                <p className="text-sm text-white font-medium leading-snug">{f.title}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Right column — quick actions */}
        <div className="space-y-4" data-tour="quick-actions">
          <h2 className="text-sm font-medium text-white">Quick actions</h2>
          <div className="space-y-2">
            <Link
              to="/findings"
              className="block glass rounded-xl p-4 hover:border-mdb-leaf/40 transition-colors"
            >
              <div className="text-sm text-white font-medium">Review findings</div>
              <p className="text-xs text-slate-400 mt-1">
                Approve or dismiss recommendations. Destructive actions require your sign-off.
              </p>
            </Link>
            <Link
              to="/create"
              className="block glass rounded-xl p-4 hover:border-mdb-leaf/40 transition-colors"
            >
              <div className="text-sm text-white font-medium">Create a workflow</div>
              <p className="text-xs text-slate-400 mt-1">
                Pick what to watch — costs, queries, backups, security — and how often.
              </p>
            </Link>
            <Link
              to="/advisor"
              className="block glass rounded-xl p-4 hover:border-mdb-leaf/40 transition-colors"
            >
              <div className="text-sm text-white font-medium">Ask the advisor</div>
              <p className="text-xs text-slate-400 mt-1">
                Describe what you need in plain English. The advisor drafts a workflow for you.
              </p>
            </Link>
            <Link
              to="/runs"
              className="block glass rounded-xl p-4 hover:border-mdb-leaf/40 transition-colors"
            >
              <div className="text-sm text-white font-medium">View run history</div>
              <p className="text-xs text-slate-400 mt-1">
                Full audit trail of every automated analysis — what ran, what it found.
              </p>
            </Link>
          </div>
        </div>
      </div>

      {/* Pipeline overview */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-sm font-medium text-mdb-leaf">How it works</h2>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { node: "Ingest", desc: "Atlas billing, metrics, profiler, audit logs" },
            { node: "Analyze", desc: "Spend, queries, backups, security, data quality" },
            { node: "Synthesize", desc: "Rank by severity and estimated savings" },
            { node: "Deliver", desc: "Findings inbox, Slack, email — with human approval" },
          ].map((step, i) => (
            <div key={step.node} className="flex items-start gap-3">
              <div className="text-mdb-leaf font-mono text-xs font-bold w-5 shrink-0 mt-0.5">
                {i + 1}
              </div>
              <div>
                <div className="text-sm font-medium text-white">{step.node}</div>
                <p className="text-xs text-slate-500 mt-0.5 leading-snug">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
