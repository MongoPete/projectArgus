import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api";
import type { RunRecord } from "@/types";

export function Runs() {
  const [items, setItems] = useState<RunRecord[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.runs
      .list()
      .then(setItems)
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (err && items.length === 0) {
    return <div className="text-red-300">{err}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Run history</h1>
        <p className="text-slate-400 mt-1">
          Audit trail of LangGraph executions: ingest → analyze → synthesize → deliver.
        </p>
      </div>

      <div className="space-y-3">
        {items.map((r) => (
          <div key={r.id} className="glass rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Link to={`/workflows/${r.workflow_id}`} className="font-medium text-white hover:text-mdb-leaf">
                  {r.workflow_name}
                </Link>
                <div className="text-xs text-slate-500 mt-1 font-mono">{r.id}</div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] uppercase px-2 py-0.5 rounded ${
                    r.status === "completed"
                      ? "bg-mdb-leaf/20 text-mdb-leaf"
                      : r.status === "failed"
                        ? "bg-red-500/20 text-red-300"
                        : "bg-mdb-forest/40 border border-mdb-leaf/15 text-slate-300"
                  }`}
                >
                  {r.status}
                </span>
                <span className="text-xs text-slate-500">{r.trigger}</span>
              </div>
            </div>
            <div className="text-xs text-slate-500 mt-2">
              {new Date(r.started_at).toLocaleString()}
              {r.completed_at && ` → ${new Date(r.completed_at).toLocaleString()}`}
            </div>
            {r.error && <div className="text-sm text-red-300 mt-2">{r.error}</div>}
            {r.trace.length > 0 && (
              <ol className="mt-4 space-y-2 border-t border-mdb-leaf/15 pt-4">
                {r.trace.map((t, i) => (
                  <li key={i} className="text-sm flex gap-3">
                    <span className="font-mono text-xs text-mdb-leaf w-24 shrink-0">{t.node}</span>
                    <span className="text-slate-300">{t.message}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
