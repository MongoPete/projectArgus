import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api";
import type { DashboardSummary } from "@/types";

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

  const cards = [
    { label: "Open findings", value: data.open_findings, hint: "new + acknowledged" },
    { label: "High / critical", value: data.high_or_critical_findings, hint: "needs attention" },
    { label: "Runs (7d)", value: data.runs_last_7d, hint: "workflow executions" },
    { label: "Active workflows", value: data.workflows_active, hint: "configured agents" },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-white">Operations overview</h1>
        <p className="text-slate-400 mt-1 max-w-2xl">
          Proactive signals for spend, query health, and TCO — orchestrated with LangGraph and stored in
          MongoDB for a full audit trail.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="glass rounded-xl p-5">
            <div className="text-slate-400 text-xs uppercase tracking-wider">{c.label}</div>
            <div className="text-3xl font-semibold text-white mt-2 tabular-nums">{c.value}</div>
            <div className="text-xs text-slate-500 mt-1">{c.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass rounded-xl p-6">
          <h2 className="text-sm font-medium text-mdb-leaf">TCO hints (demo)</h2>
          <p className="text-slate-300 mt-3 text-sm leading-relaxed">
            Illustrative spend trajectory vs baseline:{" "}
            <span className="text-white font-medium">
              {data.spend_delta_pct_hint != null ? `+${data.spend_delta_pct_hint}%` : "—"}
            </span>{" "}
            vs prior period. Top cost dimensions to watch:
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {data.cost_drivers_hint.map((d) => (
              <li
                key={d}
                className="text-xs px-3 py-1 rounded-full bg-mdb-leaf/15 text-mdb-leaf border border-mdb-leaf/30"
              >
                {d}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex gap-3 flex-wrap">
            <Link
              to="/builder"
              className="inline-flex items-center rounded-xl border border-mdb-leaf/25 text-slate-200 px-4 py-2.5 text-sm font-medium hover:bg-mdb-leaf/10"
            >
              Build a workflow
            </Link>
            <Link
              to="/assistant"
              className="inline-flex items-center rounded-xl border border-mdb-leaf/35 text-mdb-leaf px-4 py-2.5 text-sm font-medium hover:bg-mdb-leaf/10"
            >
              Ask in chat
            </Link>
            <Link
              to="/workflows"
              className="inline-flex items-center rounded-xl bg-mdb-leaf text-mdb-forest px-4 py-2.5 text-sm font-semibold hover:bg-mdb-leaf/90"
            >
              All workflows
            </Link>
            <Link
              to="/findings"
              className="inline-flex items-center rounded-lg border border-mdb-leaf/25 px-4 py-2 text-sm text-slate-200 hover:bg-mdb-leaf/10"
            >
              Review findings
            </Link>
          </div>
        </div>
        <div className="glass rounded-xl p-6 border-l-2 border-mdb-leaf/50">
          <h2 className="text-sm font-medium text-white">Agent pipeline</h2>
          <ol className="mt-4 space-y-3 text-sm text-slate-400">
            <li className="flex gap-2">
              <span className="text-mdb-leaf font-mono text-xs w-16 shrink-0">ingest</span>
              Atlas metrics & billing
            </li>
            <li className="flex gap-2">
              <span className="text-mdb-leaf font-mono text-xs w-16 shrink-0">analyze</span>
              Spend, slow queries, backup…
            </li>
            <li className="flex gap-2">
              <span className="text-mdb-leaf font-mono text-xs w-16 shrink-0">synthesize</span>
              Rank by severity & savings
            </li>
            <li className="flex gap-2">
              <span className="text-mdb-leaf font-mono text-xs w-16 shrink-0">deliver</span>
              Inbox + (later) Slack
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
