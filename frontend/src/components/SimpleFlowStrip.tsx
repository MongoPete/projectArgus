import type { AgentType } from "@/types";

const LABELS: Partial<Record<AgentType, string>> = {
  spend: "Costs",
  slow_query: "Speed",
  backup: "Backups",
  security: "Security",
  data_quality: "Quality",
  scaling: "Capacity",
  index_rationalization: "Indexes",
};

type Props = {
  agents: AgentType[];
  className?: string;
};

/** One-line “story” of the pipeline — no graph chrome. */
export function SimpleFlowStrip({ agents, className = "" }: Props) {
  if (agents.length === 0) {
    return (
      <p className={`text-sm text-slate-500 ${className}`}>
        Choose what to watch — we’ll show the path here.
      </p>
    );
  }

  const pills = agents.map((a) => LABELS[a] ?? a);

  return (
    <div
      className={`flex flex-wrap items-center gap-2 text-sm text-slate-400 ${className}`}
      aria-label="Workflow flow preview"
    >
      <span className="rounded-full bg-mdb-leaf/10 border border-mdb-leaf/25 px-3 py-1.5 text-mdb-leaf">Gather</span>
      <span className="text-slate-600">→</span>
      {pills.map((label, i) => (
        <span key={`${label}-${i}`} className="flex items-center gap-2">
          <span className="rounded-full border border-mdb-leaf/20 bg-mdb-forest/40 px-3 py-1.5 text-slate-200">
            {label}
          </span>
          {i < pills.length - 1 && <span className="text-slate-600">·</span>}
        </span>
      ))}
      <span className="text-slate-600">→</span>
      <span className="rounded-full bg-mdb-leaf/10 border border-mdb-leaf/25 px-3 py-1.5 text-mdb-leaf">Summarize</span>
      <span className="text-slate-600">→</span>
      <span className="rounded-full bg-mdb-leaf/15 px-3 py-1.5 text-mdb-leaf">Results</span>
    </div>
  );
}
