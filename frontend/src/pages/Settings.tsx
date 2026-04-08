import { useEffect, useState } from "react";
import { api } from "@/api";

export function Settings() {
  const [health, setHealth] = useState<{ status: string; message: string } | null>(null);

  useEffect(() => {
    api.settings.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="text-slate-400 mt-1">Integration placeholders for a full Atlas-connected deployment.</p>
      </div>

      <div className="glass rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-medium text-mdb-leaf">API status</h2>
        {health ? (
          <p className="text-sm text-slate-300">
            <span className="text-mdb-leaf">{health.status}</span> — {health.message}
          </p>
        ) : (
          <p className="text-sm text-amber-200">Backend unreachable. Start the FastAPI server.</p>
        )}
      </div>

      <div className="glass rounded-xl p-6 space-y-3 text-sm text-slate-400">
        <h2 className="text-sm font-medium text-white">Environment (production)</h2>
        <ul className="list-disc list-inside space-y-2">
          <li>
            <code className="text-mdb-leaf">MONGODB_URI</code> — store workflows, runs, findings
          </li>
          <li>Atlas Admin API keys — spend, clusters, backups</li>
          <li>Cluster read-only user — <code className="text-slate-500">$collStats</code>, profiler</li>
          <li>
            Optional <code className="text-slate-500">OPENAI_API_KEY</code> — powers <strong className="text-slate-300">Atlas Advisor</strong> chat (
            <code className="text-slate-500">gpt-4o-mini</code>); without it, a demo heuristic is used
          </li>
        </ul>
      </div>
    </div>
  );
}
