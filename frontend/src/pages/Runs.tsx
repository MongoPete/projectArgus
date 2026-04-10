import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api";
import type { RunRecord } from "@/types";
import { PageContainer, PageHeader, Card } from "@/components/PageContainer";
import { Pill } from "@/components/Pill";

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
    return (
      <PageContainer>
        <Card className="p-6">
          <p className="text-[#FF6960]">{err}</p>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-6" data-tour="runs">
      <PageHeader
        title="Run history"
        description="Full audit trail of every automated analysis, what ran, when, and what it found."
      />

      <div className="space-y-3">
        {items.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-[#889397]">No runs yet.</p>
          </Card>
        )}

        {items.map((r) => (
          <Card key={r.id} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Link to={`/workflows/${r.workflow_id}`} className="font-medium text-white hover:text-mdb-leaf transition-colors">
                  {r.workflow_name}
                </Link>
                <div className="text-xs text-[#5C6C75] mt-1 font-mono">{r.id}</div>
              </div>
              <div className="flex items-center gap-2">
                <Pill
                  variant={
                    r.status === "completed" ? "success" :
                    r.status === "failed" ? "critical" :
                    "muted"
                  }
                >
                  {r.status}
                </Pill>
                <span className="text-xs text-[#5C6C75]">{r.trigger}</span>
              </div>
            </div>
            <div className="text-xs text-[#5C6C75] mt-2">
              {new Date(r.started_at).toLocaleString()}
              {r.completed_at && ` → ${new Date(r.completed_at).toLocaleString()}`}
            </div>
            {r.error && <div className="text-sm text-[#FF6960] mt-2">{r.error}</div>}
            {r.trace.length > 0 && (
              <ol className="mt-4 space-y-2 border-t border-[#112733] pt-4">
                {r.trace.map((t, i) => (
                  <li key={i} className="text-sm flex gap-3">
                    <span className="font-mono text-xs text-mdb-leaf w-20 shrink-0">{t.node}</span>
                    <span className="text-[#C5CDD3]">{t.message}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
