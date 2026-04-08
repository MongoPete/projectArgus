import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/api";
import type { Workflow } from "@/types";

export function WorkflowDetail() {
  const { id } = useParams<{ id: string }>();
  const [w, setW] = useState<Workflow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!id || id === "new") return;
    api.workflows
      .get(id)
      .then(setW)
      .catch((e: Error) => setErr(e.message));
  }, [id]);

  async function run() {
    if (!id || id === "new") return;
    setRunning(true);
    try {
      await api.runs.runWorkflow(id);
    } finally {
      setRunning(false);
    }
  }

  if (id === "new") {
    return null;
  }

  if (err) {
    return <div className="text-red-300">{err}</div>;
  }
  if (!w) {
    return <p className="text-slate-400">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <Link to="/workflows" className="text-sm text-mdb-leaf hover:underline">
        ← Workflows
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">{w.name}</h1>
          <p className="text-slate-400 mt-1">{w.description}</p>
        </div>
        <button
          type="button"
          disabled={running}
          onClick={run}
          className="rounded-lg bg-mdb-leaf text-mdb-forest px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {running ? "Running…" : "Run workflow"}
        </button>
      </div>

      <div className="glass rounded-xl p-6">
        <h2 className="text-sm font-medium text-mdb-leaf">Execution graph (concept)</h2>
        <div className="mt-6 flex flex-col gap-3">
          {["ingest", "analyze", "synthesize", "deliver"].map((node, i) => (
            <div key={node} className="flex items-center gap-3">
              <div className="w-28 font-mono text-xs text-mdb-leaf">{node}</div>
              <div className="flex-1 h-px bg-mdb-leaf/20" />
              {i < 3 && <div className="text-slate-600 text-xs">↓</div>}
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-6">
          LangGraph compiles this path for every run; per-workflow steps drive the analyze node.
        </p>
      </div>

      <div className="glass rounded-xl p-6">
        <h2 className="text-sm font-medium text-white">Configured steps</h2>
        <ul className="mt-4 space-y-4">
          {w.steps.map((s, idx) => (
            <li key={s.id} className="flex gap-4 border-l-2 border-mdb-leaf/40 pl-4">
              <span className="text-slate-500 font-mono text-sm w-6">{idx + 1}</span>
              <div>
                <div className="text-white font-medium">{s.label}</div>
                <div className="text-xs text-mdb-leaf font-mono mt-0.5">{s.agent}</div>
                <pre className="text-[11px] text-slate-500 mt-2 font-mono overflow-x-auto">
                  {JSON.stringify(s.config, null, 2)}
                </pre>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
