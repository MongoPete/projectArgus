import type { AgentType } from "@/types";

export interface AgentCatalogEntry {
  type: AgentType;
  title: string;
  short: string;
  /** Tailwind border/text accent */
  accent: string;
  defaultLabel: string;
  defaultConfig: Record<string, unknown>;
}

/** Presets shown in the Agent Builder palette (and defaults for new steps). */
export const AGENT_CATALOG: AgentCatalogEntry[] = [
  {
    type: "spend",
    title: "Spend intelligence",
    short: "Invoice & baseline anomalies, cost drivers",
    accent: "border-emerald-500/40 text-emerald-300",
    defaultLabel: "Spend baseline check",
    defaultConfig: { baseline_days: 30, threshold_pct: 15 },
  },
  {
    type: "slow_query",
    title: "Slow query",
    short: "Profiler signals, index / explain hints",
    accent: "border-sky-500/40 text-sky-300",
    defaultLabel: "Slow query intelligence",
    defaultConfig: { slow_ms: 100, dedup_hours: 24 },
  },
  {
    type: "backup",
    title: "Backup & retention",
    short: "Snapshot frequency vs churn & cost",
    accent: "border-violet-500/40 text-violet-300",
    defaultLabel: "Backup cost intelligence",
    defaultConfig: {},
  },
  {
    type: "index_rationalization",
    title: "Index rationalization",
    short: "Unused / redundant indexes (HITL only)",
    accent: "border-amber-500/40 text-amber-300",
    defaultLabel: "Index rationalization",
    defaultConfig: { unused_days: 30 },
  },
  {
    type: "data_quality",
    title: "Data quality",
    short: "Outliers, drift, field anomalies",
    accent: "border-rose-500/40 text-rose-300",
    defaultLabel: "Data quality watch",
    defaultConfig: { lookback_days: 7 },
  },
  {
    type: "security",
    title: "Security behavior",
    short: "Audit patterns, access anomalies",
    accent: "border-red-500/40 text-red-300",
    defaultLabel: "Security behavior watch",
    defaultConfig: {},
  },
  {
    type: "scaling",
    title: "Scaling & capacity",
    short: "CPU, connections, recurring spikes",
    accent: "border-cyan-500/40 text-cyan-300",
    defaultLabel: "Capacity & scaling",
    defaultConfig: { lookback_days: 30 },
  },
];

export function catalogEntry(agent: AgentType): AgentCatalogEntry | undefined {
  return AGENT_CATALOG.find((a) => a.type === agent);
}
