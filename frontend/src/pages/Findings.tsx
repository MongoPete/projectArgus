import { useCallback, useEffect, useState } from "react";
import { api } from "@/api";
import type { Finding, FindingStatus } from "@/types";

const severityClass: Record<string, string> = {
  low: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  medium: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  high: "bg-orange-500/15 text-orange-200 border-orange-500/30",
  critical: "bg-red-500/20 text-red-200 border-red-500/40",
};

export function Findings() {
  const [items, setItems] = useState<Finding[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Findings</h1>
        <p className="text-slate-400 mt-1">
          Plain-English recommendations with evidence. Approve or dismiss — destructive actions stay HITL-gated.
        </p>
      </div>

      <div className="space-y-3">
        {items.map((f) => (
          <div key={f.id} className="glass rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setExpanded(expanded === f.id ? null : f.id)}
              className="w-full text-left p-5 hover:bg-mdb-leaf/5 transition-colors"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${severityClass[f.severity]}`}
                >
                  {f.severity}
                </span>
                <span className="text-xs text-slate-500 font-mono">{f.agent}</span>
                <span className="text-xs text-slate-500">· {f.status}</span>
              </div>
              <h2 className="font-medium text-white mt-2">{f.title}</h2>
              <p className="text-sm text-slate-400 mt-1 line-clamp-2">{f.summary}</p>
              {f.estimated_monthly_savings_usd != null && (
                <p className="text-xs text-mdb-leaf mt-2">
                  Est. savings ~ ${f.estimated_monthly_savings_usd.toFixed(0)}/mo
                </p>
              )}
            </button>
            {expanded === f.id && (
              <div className="px-5 pb-5 border-t border-mdb-leaf/15 pt-4 space-y-4">
                <div>
                  <div className="text-xs text-slate-500 uppercase">Recommendations</div>
                  <ul className="mt-2 list-disc list-inside text-sm text-slate-300 space-y-1">
                    {f.recommendations.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
                <pre className="text-[11px] font-mono text-slate-500 bg-black/30 rounded-lg p-3 overflow-x-auto">
                  {JSON.stringify(f.evidence, null, 2)}
                </pre>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus(f.id, "acknowledged")}
                    className="rounded-lg bg-mdb-leaf/20 border border-mdb-leaf/30 px-3 py-1.5 text-xs text-mdb-leaf"
                  >
                    Acknowledge
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus(f.id, "approved")}
                    className="rounded-lg bg-mdb-leaf/20 border border-mdb-leaf/40 px-3 py-1.5 text-xs text-mdb-leaf"
                  >
                    Approve (HITL)
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus(f.id, "dismissed")}
                    className="rounded-lg border border-mdb-leaf/25 px-3 py-1.5 text-xs text-slate-400 hover:border-mdb-leaf/40"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
