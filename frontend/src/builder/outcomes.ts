import type { AgentType } from "@/types";

export type OutcomeId =
  | "cost"
  | "performance"
  | "backups"
  | "security"
  | "data"
  | "capacity"
  | "indexes";

export type SimpleOutcome = {
  id: OutcomeId;
  title: string;
  blurb: string;
  agents: AgentType[];
};

/** Plain-language “what to watch” — each maps to one or more technical agents. */
export const SIMPLE_OUTCOMES: SimpleOutcome[] = [
  {
    id: "cost",
    title: "Costs & usage",
    blurb: "Catch spend drift before the bill does",
    agents: ["spend"],
  },
  {
    id: "performance",
    title: "App speed",
    blurb: "Slow queries and index suggestions",
    agents: ["slow_query"],
  },
  {
    id: "backups",
    title: "Backups",
    blurb: "Snapshot habits and storage cost",
    agents: ["backup"],
  },
  {
    id: "security",
    title: "Security",
    blurb: "Odd access or export patterns",
    agents: ["security"],
  },
  {
    id: "data",
    title: "Data quality",
    blurb: "Outliers and unusual values",
    agents: ["data_quality"],
  },
  {
    id: "capacity",
    title: "Capacity",
    blurb: "CPU, connections, growth trends",
    agents: ["scaling"],
  },
  {
    id: "indexes",
    title: "Indexes",
    blurb: "Unused or overlapping indexes",
    agents: ["index_rationalization"],
  },
];

const ESSENTIAL_IDS: OutcomeId[] = ["cost", "performance", "backups"];

export function essentialOutcomeSet(): Set<OutcomeId> {
  return new Set(ESSENTIAL_IDS);
}

/** Stable order: follow SIMPLE_OUTCOMES order; dedupe agents. */
export function agentsFromOutcomes(selected: Set<OutcomeId>): AgentType[] {
  const out: AgentType[] = [];
  const seen = new Set<AgentType>();
  for (const o of SIMPLE_OUTCOMES) {
    if (!selected.has(o.id)) continue;
    for (const a of o.agents) {
      if (!seen.has(a)) {
        seen.add(a);
        out.push(a);
      }
    }
  }
  return out;
}

export function defaultWorkflowTitle(selected: Set<OutcomeId>): string {
  if (selected.size === 0) return "New workflow";
  const titles = SIMPLE_OUTCOMES.filter((o) => selected.has(o.id)).map((o) => o.title);
  if (titles.length <= 2) return titles.join(" & ");
  return `${titles.slice(0, 2).join(", ")} +${titles.length - 2}`;
}
