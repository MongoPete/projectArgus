import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api";
import type { Workflow } from "@/types";

export function Workflows() {
  const [items, setItems] = useState<Workflow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => {
    api.workflows
      .list()
      .then(setItems)
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runOne(id: string) {
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

  async function deleteOne(wf: Workflow) {
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

  if (err && items.length === 0) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-100">
        {err}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-tour="workflows">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Workflows</h1>
          <p className="text-slate-400 mt-1">
            Automated monitoring pipelines. Each workflow watches your clusters and reports findings — write operations always require your approval.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/create"
            className="rounded-xl border border-mdb-leaf/30 text-slate-200 px-4 py-2.5 text-sm font-medium hover:bg-mdb-leaf/10"
          >
            New workflow
          </Link>
          <Link
            to="/workflows/new"
            className="rounded-xl border border-mdb-leaf/20 text-slate-400 px-4 py-2.5 text-sm hover:text-slate-200 hover:border-mdb-leaf/35"
          >
            Quick list
          </Link>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {err}
        </div>
      )}

      <div className="space-y-3">
        {items.map((w) => (
          <div
            key={w.id}
            className="glass rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between"
          >
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-medium text-white">{w.name}</h2>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-mdb-leaf/15 text-mdb-leaf border border-mdb-leaf/25">
                  {w.trigger}
                </span>
                {w.hitl_writes && (
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-mdb-leaf/40 text-mdb-leaf">
                    Human approval
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400 mt-1">{w.description || "—"}</p>
              <p className="text-xs text-slate-500 mt-2 font-mono">
                {w.steps.length} step{w.steps.length === 1 ? "" : "s"}:{" "}
                {w.steps.map((s) => s.agent).join(" → ")}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                disabled={running === w.id}
                onClick={() => runOne(w.id)}
                className="rounded-lg bg-mdb-leaf/20 border border-mdb-leaf/35 px-4 py-2 text-sm text-mdb-leaf hover:bg-mdb-leaf/30 disabled:opacity-50"
              >
                {running === w.id ? "Running…" : "Run now"}
              </button>
              <Link
                to={`/workflows/${w.id}`}
                className="rounded-lg border border-mdb-leaf/25 px-4 py-2 text-sm text-slate-200 hover:bg-mdb-leaf/10 inline-flex items-center"
              >
                View
              </Link>
              <button
                type="button"
                disabled={deletingId === w.id}
                onClick={() => deleteOne(w)}
                className="rounded-lg border border-red-500/20 px-3 py-2 text-sm text-red-400/70 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50 transition-colors"
                title="Delete workflow"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
