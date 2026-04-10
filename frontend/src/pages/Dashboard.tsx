import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/api";
import type { DashboardSummary, FindingPreview } from "@/types";
import { Pill, severityToVariant, type PillVariant } from "@/components/Pill";
import { TabBar, type Tab } from "@/components/TabBar";
import { PageContainer, TableContainer, TableFooter } from "@/components/PageContainer";
import { FilterBar, FilterDropdown, SearchInput, FilterSpacer } from "@/components/FilterBar";

// =============================================================================
// CLUSTER DATA (mock until API endpoint exists)
// =============================================================================

interface ClusterInfo {
  name: string;
  status: "healthy" | "warning" | "critical";
}

const MOCK_CLUSTERS: ClusterInfo[] = [
  { name: "payments-prod", status: "critical" },
  { name: "analytics-warehouse", status: "warning" },
  { name: "prod-east-1", status: "warning" },
  { name: "user-service", status: "healthy" },
  { name: "order-service", status: "healthy" },
  { name: "inventory-db", status: "healthy" },
  { name: "search-cluster", status: "healthy" },
  { name: "cache-layer", status: "healthy" },
  { name: "logs-archive", status: "healthy" },
  { name: "metrics-store", status: "healthy" },
  { name: "session-store", status: "healthy" },
  { name: "config-db", status: "healthy" },
];

const MOCK_WORKFLOWS = [
  {
    id: "cost-query",
    name: "Cost & query health",
    iconType: "cost" as const,
    status: "scanning" as const,
    schedule: "every 6h",
    scope: "12 clusters",
    lastRunAt: "4m ago",
    nextRunIn: "in 5h 56m",
    findingsCount: 2,
    findingsSeverity: "med" as const,
  },
  {
    id: "security",
    name: "Security & data quality",
    iconType: "security" as const,
    status: "active" as const,
    schedule: "hourly",
    scope: "payments-prod",
    lastRunAt: "14m ago",
    nextRunIn: "in 46m",
    findingsCount: 1,
    findingsSeverity: "crit" as const,
  },
  {
    id: "backup",
    name: "Backup & index audit",
    iconType: "backup" as const,
    status: "active" as const,
    schedule: "daily",
    scope: "all clusters",
    lastRunAt: "1h ago",
    nextRunIn: "in 23h",
    findingsCount: 2,
    findingsSeverity: "med" as const,
  },
];

interface HistoryItem {
  time: string;
  type: string;
  pill: PillVariant;
  title: string;
  meta: string;
  metaHighlight?: string;
  context: string;
}

interface HistoryGroup {
  day: string;
  items: HistoryItem[];
}

const MOCK_HISTORY: HistoryGroup[] = [
  {
    day: "Today",
    items: [
      { time: "9:14 AM", type: "scan", pill: "success", title: "Cost & query health workflow ran across 12 clusters", meta: "2 new findings · spend, query", metaHighlight: "amber", context: "2.4s" },
      { time: "9:10 AM", type: "finding", pill: "medium", title: "Data transfer up 34% on prod-east-1", meta: "spend · cross-region replication", context: "$1,520" },
      { time: "2:47 AM", type: "critical", pill: "critical", title: "Unusual IP read 847k records from user_pii", meta: "payments-prod · 340x normal access pattern", context: "unresolved" },
    ],
  },
  {
    day: "Yesterday",
    items: [
      { time: "4:12 PM", type: "resolved", pill: "success", title: "3 unused indexes dropped on analytics-warehouse", meta: "approved by Sarah · cleanup workflow", context: "$340/mo" },
      { time: "9:00 AM", type: "scan", pill: "success", title: "Backup & index audit completed", meta: "2 findings · all clusters scanned", metaHighlight: "amber", context: "4.1s" },
    ],
  },
  {
    day: "Earlier this week",
    items: [
      { time: "Tue Apr 6", type: "config", pill: "low", title: 'Workflow "Cost & query health" was modified', meta: "schedule changed from 12h to 6h · by Sarah", context: "-" },
    ],
  },
];

const MOCK_ACTIVITY = [
  { when: "just now", isLive: true, pill: "scan" as const, title: "Cost & query health is scanning · 8 of 12 clusters", meta: "started 12s ago · 2 findings so far · ~3s remaining", impact: "live" },
  { when: "2h ago", isLive: false, pill: "medium" as const, title: "Data transfer up 34% on prod-east-1", meta: "spend · cross-region replication anomaly", impact: "$1,520/mo" },
  { when: "5h ago", isLive: false, pill: "medium" as const, title: "Backup audit found over-snapshotting on 8 clusters", meta: "backup · low-churn collections", impact: "$1,240/mo" },
  { when: "14h ago", isLive: false, pill: "critical" as const, title: "A new IP read 847k records from user_pii", meta: "payments-prod · 340x normal access pattern", impact: "review", whenColor: "#FF6960" },
  { when: "yesterday", isLive: false, pill: "success" as const, title: "Sarah approved index cleanup on analytics-warehouse", meta: "3 indexes dropped · saving going forward", impact: "$340/mo" },
  { when: "yesterday", isLive: false, pill: "info" as const, title: "Backup & index audit completed", meta: "all clusters · 2 findings", impact: "4.1s" },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getClusterHealth(clusters: ClusterInfo[]) {
  const critical = clusters.filter((c) => c.status === "critical").length;
  const warning = clusters.filter((c) => c.status === "warning").length;
  const healthy = clusters.filter((c) => c.status === "healthy").length;
  return { healthy, warning, critical, total: clusters.length };
}

const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function getHighestSeverityFinding(findings: FindingPreview[]): FindingPreview | null {
  if (findings.length === 0) return null;
  return [...findings].sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9))[0];
}

function extractClusterFromFinding(finding: FindingPreview): string {
  const patterns = [
    /on\s+([a-zA-Z0-9_-]+(?:-[a-zA-Z0-9_]+)*)/i,
    /from\s+([a-zA-Z0-9_-]+(?:-[a-zA-Z0-9_]+)*)/i,
    /in\s+([a-zA-Z0-9_-]+(?:-[a-zA-Z0-9_]+)*)/i,
  ];
  for (const pattern of patterns) {
    const match = finding.title.match(pattern);
    if (match) return match[1];
  }
  return finding.agent.replace(/_/g, "-");
}

// =============================================================================
// ICONS
// =============================================================================

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5C6C75" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function DollarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5C6C75" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5C6C75" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}

function ChevronIcon() {
  return <span className="text-[#5C6C75] text-sm">›</span>;
}

function CostIconChip() {
  return (
    <div className="w-6 h-6 rounded-md bg-mdb-leaf/10 flex items-center justify-center">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00ED64" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    </div>
  );
}

function SecurityIconChip() {
  return (
    <div className="w-6 h-6 rounded-md bg-[#FF6960]/[0.08] flex items-center justify-center">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF6960" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    </div>
  );
}

function BackupIconChip() {
  return (
    <div className="w-6 h-6 rounded-md bg-[#3D9CFF]/[0.08] flex items-center justify-center">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3D9CFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="21 8 21 21 3 21 3 8" />
        <rect x="1" y="3" width="22" height="5" />
        <line x1="10" y1="12" x2="14" y2="12" />
      </svg>
    </div>
  );
}

// =============================================================================
// STAT CARDS
// =============================================================================

interface SeverityBreakdown {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

function StatCardFindings({ findings }: { findings: FindingPreview[] }) {
  const breakdown = useMemo<SeverityBreakdown>(() => {
    const result = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of findings) {
      if (f.severity in result) {
        result[f.severity as keyof SeverityBreakdown]++;
      }
    }
    return result;
  }, [findings]);

  const total = findings.length;

  return (
    <Link to="/findings" className="block h-full">
      <div className="bg-white/[0.02] border-[0.5px] border-[#112733] rounded-xl p-5 h-full hover:border-mdb-leaf/40 transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase text-[#889397] tracking-wide">OPEN FINDINGS</span>
          <SunIcon />
        </div>
        <div className="mt-2">
          <span className="text-4xl font-medium text-white">{total}</span>
        </div>
        <div className="mt-2.5 text-xs text-[#5C6C75]">
          {breakdown.critical > 0 && <span className="text-[#FF6960]">{breakdown.critical} critical</span>}
          {breakdown.critical > 0 && breakdown.high > 0 && " · "}
          {breakdown.high > 0 && <span className="text-[#FF6960]">{breakdown.high} high</span>}
          {(breakdown.critical > 0 || breakdown.high > 0) && breakdown.medium > 0 && " · "}
          {breakdown.medium > 0 && <span className="text-[#FFC010]">{breakdown.medium} medium</span>}
          {(breakdown.critical > 0 || breakdown.high > 0 || breakdown.medium > 0) && breakdown.low > 0 && " · "}
          {breakdown.low > 0 && <span className="text-[#889397]">{breakdown.low} low</span>}
          {total === 0 && <span>No open findings</span>}
        </div>
      </div>
    </Link>
  );
}

function StatCardSavings({ totalSavings, findings }: { totalSavings: number; findings: FindingPreview[] }) {
  const savingsInfo = useMemo(() => {
    const withSavings = findings.filter((f) => f.estimated_monthly_savings_usd != null && f.estimated_monthly_savings_usd > 0);
    const categories = [...new Set(withSavings.map((f) => f.agent))];
    return { count: withSavings.length, categories };
  }, [findings]);

  const categoryLabels = savingsInfo.categories.map((c) => c.replace(/_/g, " ")).slice(0, 3);
  const categoryText = categoryLabels.join(", ") + (savingsInfo.categories.length > 3 ? "..." : "");

  return (
    <Link to="/findings" className="block h-full">
      <div className="bg-white/[0.02] border-[0.5px] border-[#112733] rounded-xl p-5 h-full hover:border-mdb-leaf/40 transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase text-[#889397] tracking-wide">AVAILABLE SAVINGS</span>
          <DollarIcon />
        </div>
        <div className="mt-2 flex items-baseline">
          <span className="text-4xl font-medium text-mdb-leaf tracking-tight">
            ${totalSavings.toLocaleString()}
          </span>
          <span className="text-xs text-[#5C6C75] ml-0.5">/mo</span>
        </div>
        <div className="mt-2.5 text-xs text-[#5C6C75]">
          {savingsInfo.count > 0 ? (
            <>across {savingsInfo.count} finding{savingsInfo.count !== 1 ? "s" : ""} · {categoryText}</>
          ) : (
            <>No savings identified yet</>
          )}
        </div>
      </div>
    </Link>
  );
}

function StatCardClusters({ clusters }: { clusters: ClusterInfo[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const health = getClusterHealth(clusters);
  const allHealthy = health.critical === 0 && health.warning === 0;

  const criticalClusters = clusters.filter(c => c.status === "critical");
  const warningClusters = clusters.filter(c => c.status === "warning");
  const hasIssues = criticalClusters.length > 0 || warningClusters.length > 0;

  return (
    <div className="bg-white/[0.02] border-[0.5px] border-[#112733] rounded-xl p-5 h-full">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase text-[#889397] tracking-wide">CLUSTERS</span>
        <ServerIcon />
      </div>
      <div className="mt-2">
        <span className="text-4xl font-medium text-white">{health.total}</span>
        <span className="text-[15px] text-[#5C6C75] ml-1.5">monitored</span>
      </div>
      <div className="mt-3 text-xs text-[#5C6C75] flex items-center justify-between">
        {allHealthy ? (
          <span className="text-mdb-leaf">All healthy</span>
        ) : (
          <span>
            <span className="text-mdb-leaf">{health.healthy} healthy</span>
            {health.warning > 0 && <span className="text-[#FFC010]"> · {health.warning} warning</span>}
            {health.critical > 0 && <span className="text-[#FF6960]"> · {health.critical} critical</span>}
          </span>
        )}
        {hasIssues && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-mdb-leaf text-xs px-1.5 py-0.5 rounded hover:bg-mdb-leaf/10 transition-colors"
          >
            {isExpanded ? "Hide" : "Details"}
          </button>
        )}
      </div>

      {isExpanded && hasIssues && (
        <div className="mt-3.5 pt-3.5 border-t border-[#112733]">
          {criticalClusters.length > 0 && (
            <div className={warningClusters.length > 0 ? "mb-2.5" : ""}>
              <div className="text-[11px] text-[#FF6960] mb-1.5 font-medium">
                Critical ({criticalClusters.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {criticalClusters.map(c => (
                  <span
                    key={c.name}
                    className="text-[11px] px-2 py-0.5 rounded bg-[#FF6960]/10 text-[#FF6960] border-[0.5px] border-[#FF6960]/30 font-mono"
                  >
                    {c.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {warningClusters.length > 0 && (
            <div>
              <div className="text-[11px] text-[#FFC010] mb-1.5 font-medium">
                Warning ({warningClusters.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {warningClusters.map(c => (
                  <span
                    key={c.name}
                    className="text-[11px] px-2 py-0.5 rounded bg-[#FFC010]/10 text-[#FFC010] border-[0.5px] border-[#FFC010]/30 font-mono"
                  >
                    {c.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// DECORATIVE NETWORK SVG
// =============================================================================

function NetworkGraphSVG() {
  const nodes = [
    { x: 120, y: 30, r: 5, primary: true },
    { x: 180, y: 45, r: 4, primary: false },
    { x: 80, y: 55, r: 4, primary: false },
    { x: 150, y: 75, r: 6, primary: true },
    { x: 220, y: 80, r: 3.5, primary: false },
    { x: 50, y: 90, r: 3, primary: false },
    { x: 100, y: 100, r: 4, primary: false },
    { x: 190, y: 110, r: 5, primary: true },
    { x: 130, y: 130, r: 4, primary: false },
    { x: 70, y: 135, r: 3, primary: false },
    { x: 170, y: 145, r: 3.5, primary: false },
    { x: 240, y: 125, r: 3, primary: false },
    { x: 30, y: 60, r: 2.5, primary: false },
  ];

  const connections = [
    [0, 1], [0, 2], [0, 3], [1, 3], [1, 4], [2, 3], [2, 5], [2, 6],
    [3, 6], [3, 7], [3, 8], [4, 7], [5, 9], [6, 8], [6, 9],
    [7, 8], [7, 11], [8, 10], [9, 10], [2, 12], [5, 12]
  ];

  return (
    <svg viewBox="0 0 280 170" className="absolute top-2.5 right-2.5 w-80 h-48 opacity-85">
      {connections.map(([from, to], i) => (
        <line
          key={`line-${i}`}
          x1={nodes[from].x}
          y1={nodes[from].y}
          x2={nodes[to].x}
          y2={nodes[to].y}
          stroke="rgba(0,237,100,0.2)"
          strokeWidth={0.6}
        />
      ))}
      {nodes.filter(n => n.primary).map((node, i) => (
        <circle
          key={`glow-${i}`}
          cx={node.x}
          cy={node.y}
          r={node.r * 2.5}
          fill="rgba(0,237,100,0.08)"
        />
      ))}
      {nodes.map((node, i) => (
        <circle
          key={`node-${i}`}
          className="animate-pulse"
          cx={node.x}
          cy={node.y}
          r={node.r}
          fill={node.primary ? "#00ED64" : "rgba(0,237,100,0.6)"}
        />
      ))}
    </svg>
  );
}

// =============================================================================
// FILTER STATE
// =============================================================================

interface FilterState {
  search: string;
  severity: string;
  category: string;
  cluster: string;
  status: string;
  schedule: string;
  scope: string;
  date: string;
  type: string;
  sort: string;
}

const defaultFilters: FilterState = {
  search: "",
  severity: "all",
  category: "all",
  cluster: "all",
  status: "all",
  schedule: "all",
  scope: "all",
  date: "last 7d",
  type: "all",
  sort: "impact",
};

// =============================================================================
// TABBED WORKSPACE
// =============================================================================

type TabKey = "findings" | "workflows" | "history" | "activity";

function TabbedWorkspace({ data }: { data: DashboardSummary }) {
  const [activeTab, setActiveTab] = useState<TabKey>("findings");
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const updateFilter = (key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setFilters({ ...defaultFilters, sort: tab === "workflows" ? "last run" : "impact" });
  };

  const hasCriticalFindings = data.top_findings.some((f) => f.severity === "critical" || f.severity === "high");

  const tabs: Tab<TabKey>[] = [
    { key: "findings", label: "Findings", count: data.open_findings, countVariant: hasCriticalFindings ? "warning" : "success" },
    { key: "workflows", label: "Workflows", count: data.workflows_active },
    { key: "history", label: "History" },
    { key: "activity", label: "Activity", showDot: true },
  ];

  return (
    <TableContainer className="mt-6">
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        className="px-6"
      />

      <FilterRowComponent activeTab={activeTab} filters={filters} onFilterChange={updateFilter} />

      {activeTab === "findings" && <FindingsTab findings={data.top_findings} filters={filters} />}
      {activeTab === "workflows" && <WorkflowsTab filters={filters} />}
      {activeTab === "history" && <HistoryTab filters={filters} />}
      {activeTab === "activity" && <ActivityTab filters={filters} />}
    </TableContainer>
  );
}

// =============================================================================
// FILTER ROW
// =============================================================================

interface FilterRowProps {
  activeTab: TabKey;
  filters: FilterState;
  onFilterChange: (key: keyof FilterState, value: string) => void;
}

function FilterRowComponent({ activeTab, filters, onFilterChange }: FilterRowProps) {
  const filterConfigs: Record<TabKey, { key: keyof FilterState; label: string; options: { value: string; label: string }[] }[]> = {
    findings: [
      { key: "severity", label: "Severity", options: [{ value: "all", label: "all" }, { value: "critical", label: "critical" }, { value: "high", label: "high" }, { value: "medium", label: "medium" }, { value: "low", label: "low" }] },
      { key: "category", label: "Category", options: [{ value: "all", label: "all" }, { value: "spend", label: "spend" }, { value: "slow_query", label: "slow_query" }, { value: "backup", label: "backup" }, { value: "security", label: "security" }] },
      { key: "cluster", label: "Cluster", options: [{ value: "all", label: "all" }, { value: "payments-prod", label: "payments-prod" }, { value: "analytics-warehouse", label: "analytics-warehouse" }, { value: "prod-east-1", label: "prod-east-1" }] },
    ],
    workflows: [
      { key: "status", label: "Status", options: [{ value: "all", label: "all" }, { value: "scanning", label: "scanning" }, { value: "active", label: "active" }, { value: "paused", label: "paused" }] },
      { key: "schedule", label: "Schedule", options: [{ value: "all", label: "all" }, { value: "hourly", label: "hourly" }, { value: "every 6h", label: "every 6h" }, { value: "daily", label: "daily" }] },
      { key: "scope", label: "Scope", options: [{ value: "all", label: "all" }, { value: "all clusters", label: "all clusters" }, { value: "payments-prod", label: "payments-prod" }] },
    ],
    history: [
      { key: "date", label: "Date", options: [{ value: "last 7d", label: "last 7d" }, { value: "last 24h", label: "last 24h" }, { value: "last 30d", label: "last 30d" }] },
      { key: "type", label: "Type", options: [{ value: "all", label: "all" }, { value: "scan", label: "scan" }, { value: "finding", label: "finding" }, { value: "critical", label: "critical" }] },
      { key: "cluster", label: "Cluster", options: [{ value: "all", label: "all" }, { value: "payments-prod", label: "payments-prod" }, { value: "analytics-warehouse", label: "analytics-warehouse" }] },
    ],
    activity: [
      { key: "type", label: "Type", options: [{ value: "all", label: "all" }, { value: "scan", label: "scan" }, { value: "finding", label: "finding" }, { value: "critical", label: "critical" }] },
      { key: "cluster", label: "Cluster", options: [{ value: "all", label: "all" }, { value: "payments-prod", label: "payments-prod" }, { value: "analytics-warehouse", label: "analytics-warehouse" }] },
    ],
  };

  const sortOptions: Record<TabKey, { value: string; label: string }[]> = {
    findings: [{ value: "impact", label: "impact" }, { value: "severity", label: "severity" }, { value: "recent", label: "recent" }],
    workflows: [{ value: "last run", label: "last run" }, { value: "next run", label: "next run" }, { value: "name", label: "name" }],
    history: [{ value: "recent", label: "recent" }, { value: "type", label: "type" }],
    activity: [{ value: "recent", label: "recent" }, { value: "impact", label: "impact" }],
  };

  return (
    <FilterBar>
      <SearchInput
        value={filters.search}
        onChange={(val) => onFilterChange("search", val)}
        placeholder={`Search ${activeTab}`}
        shortcut="K"
      />

      {filterConfigs[activeTab].map((config) => (
        <FilterDropdown
          key={config.key}
          label={config.label}
          value={filters[config.key]}
          options={config.options}
          onChange={(val) => onFilterChange(config.key, val)}
        />
      ))}

      <FilterSpacer />

      {activeTab === "activity" ? (
        <span className="text-xs text-mdb-leaf px-3 py-1.5 border-[0.5px] border-mdb-leaf/25 bg-mdb-leaf/[0.04] rounded-md flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-mdb-leaf animate-pulse" />
          live · auto-refreshing
        </span>
      ) : activeTab === "history" ? (
        <span className="text-xs text-[#C5CDD3] px-3 py-1.5 border-[0.5px] border-[#1C2D38] rounded-md cursor-pointer hover:bg-white/[0.02]">
          Export
        </span>
      ) : (
        <FilterDropdown
          label="Sort"
          value={filters.sort}
          options={sortOptions[activeTab]}
          onChange={(val) => onFilterChange("sort", val)}
        />
      )}
    </FilterBar>
  );
}

// =============================================================================
// FINDINGS TAB
// =============================================================================

function FindingsTab({ findings, filters }: { findings: FindingPreview[]; filters: FilterState }) {
  const navigate = useNavigate();

  const timeAgo = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const filteredFindings = useMemo(() => {
    let result = [...findings];

    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (f) =>
          f.title.toLowerCase().includes(q) ||
          f.agent.toLowerCase().includes(q) ||
          f.severity.toLowerCase().includes(q)
      );
    }

    if (filters.severity !== "all") {
      result = result.filter((f) => f.severity === filters.severity);
    }

    if (filters.category !== "all") {
      result = result.filter((f) => f.agent === filters.category);
    }

    if (filters.sort === "severity") {
      result.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));
    } else if (filters.sort === "impact") {
      result.sort((a, b) => (b.estimated_monthly_savings_usd ?? 0) - (a.estimated_monthly_savings_usd ?? 0));
    } else if (filters.sort === "recent") {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return result;
  }, [findings, filters]);

  const handleFindingClick = (findingId: string) => {
    navigate(`/findings?id=${findingId}`);
  };

  const thisWeekSavings = findings.reduce((sum, f) => sum + (f.estimated_monthly_savings_usd ?? 0), 0);
  const gridCols = "14px 96px minmax(0,1fr) 90px 14px";

  return (
    <>
      <div className="grid gap-3.5 px-6 py-2.5 text-xs text-[#5C6C75] uppercase tracking-wide" style={{ gridTemplateColumns: gridCols }}>
        <span />
        <span>Severity</span>
        <span>Finding</span>
        <span className="text-right">Impact</span>
        <span />
      </div>

      {filteredFindings.length === 0 ? (
        <div className="py-10 text-center text-[#5C6C75]">
          No findings match your filters
        </div>
      ) : (
        filteredFindings.map((f) => {
          const isCritical = f.severity === "critical" || f.severity === "high";
          return (
            <div
              key={f.id}
              onClick={() => handleFindingClick(f.id)}
              className="grid gap-3.5 px-6 py-3.5 items-center border-t border-[#0E2230] cursor-pointer hover:bg-white/[0.025] transition-colors"
              style={{ gridTemplateColumns: gridCols }}
            >
              <span
                className={isCritical ? "animate-pulse" : ""}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: isCritical ? "#FF6960" : f.severity === "medium" ? "#FFC010" : "#889397",
                  boxShadow: isCritical ? "0 0 8px rgba(255,105,96,0.4)" : undefined,
                }}
              />
              <Pill variant={severityToVariant(f.severity)}>{f.severity.toUpperCase()}</Pill>
              <div className="min-w-0">
                <div className="text-[15px] text-white truncate">{f.title}</div>
                <div className="text-xs text-[#5C6C75] font-mono mt-1">
                  {f.agent.replace(/_/g, " ")} · {timeAgo(f.created_at)}
                </div>
              </div>
              <div className="text-right">
                {f.estimated_monthly_savings_usd ? (
                  <span className="text-mdb-leaf font-semibold text-[13px]">
                    ${f.estimated_monthly_savings_usd.toLocaleString()}
                    <span className="text-xs text-[#5C6C75]">/mo</span>
                  </span>
                ) : isCritical ? (
                  <span className="text-[#FF6960] font-semibold text-[11px]">REVIEW</span>
                ) : (
                  <span className="text-[#889397] text-[11px]">review</span>
                )}
              </div>
              <ChevronIcon />
            </div>
          );
        })
      )}

      <TableFooter>
        <span className="text-[#5C6C75]">
          Showing <span className="text-[#C5CDD3]">{filteredFindings.length}</span> of <span className="text-[#C5CDD3]">{findings.length}</span> ·{" "}
          <span className="text-mdb-leaf">saved ${thisWeekSavings.toLocaleString()}/mo this week</span>
        </span>
        <Link to="/findings" className="text-mdb-leaf hover:underline">Open in Findings</Link>
      </TableFooter>
    </>
  );
}

// =============================================================================
// WORKFLOWS TAB
// =============================================================================

function WorkflowsTab({ filters }: { filters: FilterState }) {
  const navigate = useNavigate();

  const iconChips: Record<string, React.ReactNode> = {
    cost: <CostIconChip />,
    security: <SecurityIconChip />,
    backup: <BackupIconChip />,
  };

  const severityColors: Record<string, string> = {
    crit: "#FF6960",
    med: "#FFC010",
    low: "#889397",
  };

  const filteredWorkflows = useMemo(() => {
    let result = [...MOCK_WORKFLOWS];

    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          w.scope.toLowerCase().includes(q) ||
          w.schedule.toLowerCase().includes(q)
      );
    }

    if (filters.status !== "all") {
      result = result.filter((w) => w.status === filters.status);
    }

    if (filters.schedule !== "all") {
      result = result.filter((w) => w.schedule === filters.schedule);
    }

    if (filters.sort === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [filters]);

  const gridCols = "28px 96px minmax(0,1fr) 90px 14px";

  return (
    <>
      <div className="grid gap-3.5 px-6 py-2.5 text-xs text-[#5C6C75] uppercase tracking-wide" style={{ gridTemplateColumns: gridCols }}>
        <span />
        <span>Status</span>
        <span>Workflow</span>
        <span className="text-right">Next run</span>
        <span />
      </div>

      {filteredWorkflows.length === 0 ? (
        <div className="py-10 text-center text-[#5C6C75]">
          No workflows match your filters
        </div>
      ) : (
        filteredWorkflows.map((w) => (
          <div
            key={w.id}
            onClick={() => navigate("/workflows")}
            className="grid gap-3.5 px-6 py-3.5 items-center border-t border-[#0E2230] cursor-pointer hover:bg-white/[0.025] transition-colors"
            style={{ gridTemplateColumns: gridCols }}
          >
            {iconChips[w.iconType]}
            <Pill variant={w.status === "scanning" ? "scan" : "muted"} showDot={w.status === "scanning"}>
              {w.status === "scanning" ? "SCANNING" : "ACTIVE"}
            </Pill>
            <div className="min-w-0">
              <div className="text-[15px] text-white truncate">{w.name}</div>
              <div className="text-xs text-[#5C6C75] mt-1">
                {w.schedule} · {w.scope} · ran {w.lastRunAt} ·{" "}
                <span style={{ color: severityColors[w.findingsSeverity] }}>{w.findingsCount} findings</span>
              </div>
            </div>
            <div className="text-right text-xs text-[#5C6C75]">{w.nextRunIn}</div>
            <ChevronIcon />
          </div>
        ))
      )}

      <TableFooter>
        <span className="text-[#5C6C75]">
          Showing <span className="text-[#C5CDD3]">{filteredWorkflows.length}</span> of <span className="text-[#C5CDD3]">{MOCK_WORKFLOWS.length}</span> · monitoring{" "}
          <span className="text-[#C5CDD3]">12</span> clusters ·{" "}
          <span className="text-mdb-leaf">5 findings this week</span>
        </span>
        <Link to="/workflows" className="text-mdb-leaf hover:underline">Browse library</Link>
      </TableFooter>
    </>
  );
}

// =============================================================================
// HISTORY TAB
// =============================================================================

function HistoryTab({ filters }: { filters: FilterState }) {
  const navigate = useNavigate();

  const filteredHistory = useMemo(() => {
    const allItems: (HistoryItem & { day: string })[] = [];
    for (const group of MOCK_HISTORY) {
      for (const item of group.items) {
        allItems.push({ ...item, day: group.day });
      }
    }

    let result = allItems;

    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.meta.toLowerCase().includes(q) ||
          item.type.toLowerCase().includes(q)
      );
    }

    if (filters.type !== "all") {
      result = result.filter((item) => item.type === filters.type);
    }

    return result;
  }, [filters]);

  const groupedHistory = useMemo(() => {
    const groups: Record<string, HistoryItem[]> = {};
    for (const item of filteredHistory) {
      if (!groups[item.day]) groups[item.day] = [];
      groups[item.day].push(item);
    }
    return Object.entries(groups);
  }, [filteredHistory]);

  const gridCols = "78px 96px minmax(0,1fr) 90px 14px";

  return (
    <>
      <div className="grid gap-3.5 px-6 py-2.5 text-xs text-[#5C6C75] uppercase tracking-wide" style={{ gridTemplateColumns: gridCols }}>
        <span>Time</span>
        <span>Type</span>
        <span>Event</span>
        <span className="text-right">Context</span>
        <span />
      </div>

      {groupedHistory.length === 0 ? (
        <div className="py-10 text-center text-[#5C6C75]">
          No history matches your filters
        </div>
      ) : (
        groupedHistory.map(([day, items]) => (
          <div key={day}>
            <div className="text-xs text-[#5C6C75] uppercase tracking-wide px-6 py-3.5 border-t border-[#0E2230]">
              {day}
            </div>
            {items.map((item, i) => (
              <div
                key={i}
                onClick={() => item.type === "finding" || item.type === "critical" ? navigate("/findings") : navigate("/runs")}
                className="grid gap-3.5 px-6 py-3.5 items-center border-t border-[#0E2230] cursor-pointer hover:bg-white/[0.025] transition-colors"
                style={{ gridTemplateColumns: gridCols }}
              >
                <span className="text-xs text-[#5C6C75] font-mono">{item.time}</span>
                <Pill variant={item.pill}>{item.type.toUpperCase()}</Pill>
                <div className="min-w-0">
                  <div className="text-[15px] text-white truncate">{item.title}</div>
                  <div className="text-xs text-[#5C6C75] mt-1">
                    {item.metaHighlight === "amber" ? (
                      <span><span className="text-[#FFC010]">{item.meta.split("·")[0]}</span>·{item.meta.split("·").slice(1).join("·")}</span>
                    ) : (
                      item.meta
                    )}
                  </div>
                </div>
                <div className={`text-right text-xs ${item.context.startsWith("$") ? "text-mdb-leaf" : item.context === "unresolved" ? "text-[#FF6960]" : "text-[#5C6C75]"}`}>
                  {item.context}
                </div>
                <ChevronIcon />
              </div>
            ))}
          </div>
        ))
      )}

      <TableFooter>
        <span className="text-[#5C6C75]">
          Showing <span className="text-[#C5CDD3]">{filteredHistory.length}</span> of <span className="text-[#C5CDD3]">24</span> events · last 7 days
        </span>
        <Link to="/runs" className="text-mdb-leaf hover:underline">View all runs</Link>
      </TableFooter>
    </>
  );
}

// =============================================================================
// ACTIVITY TAB
// =============================================================================

function ActivityTab({ filters }: { filters: FilterState }) {
  const navigate = useNavigate();

  const filteredActivity = useMemo(() => {
    let result = [...MOCK_ACTIVITY];

    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.meta.toLowerCase().includes(q)
      );
    }

    if (filters.type !== "all") {
      result = result.filter((item) => {
        if (filters.type === "scan") return item.isLive || item.pill === "info";
        if (filters.type === "finding") return item.pill === "medium";
        if (filters.type === "critical") return item.pill === "critical";
        if (filters.type === "resolved") return item.pill === "success" && !item.isLive;
        return true;
      });
    }

    return result;
  }, [filters]);

  const gridCols = "78px 96px minmax(0,1fr) 90px 14px";

  return (
    <>
      <div className="grid gap-3.5 px-6 py-2.5 text-xs text-[#5C6C75] uppercase tracking-wide" style={{ gridTemplateColumns: gridCols }}>
        <span>When</span>
        <span>Type</span>
        <span>Event</span>
        <span className="text-right">Impact</span>
        <span />
      </div>

      {filteredActivity.length === 0 ? (
        <div className="py-10 text-center text-[#5C6C75]">
          No activity matches your filters
        </div>
      ) : (
        filteredActivity.map((item, i) => {
          if (item.isLive) {
            return (
              <div
                key={i}
                onClick={() => navigate("/runs")}
                className="grid gap-3.5 px-6 py-3.5 items-center border-t border-mdb-leaf/20 bg-mdb-leaf/[0.025] cursor-pointer hover:bg-mdb-leaf/[0.04] transition-colors"
                style={{ gridTemplateColumns: gridCols }}
              >
                <span className="text-xs text-mdb-leaf">{item.when}</span>
                <Pill variant="scan" showDot pulseDot>SCANNING</Pill>
                <div className="min-w-0">
                  <div className="text-[15px] text-white truncate">{item.title}</div>
                  <div className="text-xs text-[#5C6C75] mt-1">
                    {item.meta.includes("findings so far") ? (
                      <span>
                        {item.meta.split("·")[0]}· <span className="text-[#FFC010]">{item.meta.split("·")[1]}</span> ·{item.meta.split("·")[2]}
                      </span>
                    ) : (
                      item.meta
                    )}
                  </div>
                  <div className="h-0.5 bg-mdb-leaf/10 rounded mt-2 overflow-hidden">
                    <div className="h-full bg-mdb-leaf rounded animate-pulse" style={{ width: "65%" }} />
                  </div>
                </div>
                <div className="text-right text-xs text-[#5C6C75]">{item.impact}</div>
                <ChevronIcon />
              </div>
            );
          }

          return (
            <div
              key={i}
              onClick={() => item.pill === "critical" || item.pill === "medium" ? navigate("/findings") : navigate("/runs")}
              className="grid gap-3.5 px-6 py-3.5 items-center border-t border-[#0E2230] cursor-pointer hover:bg-white/[0.025] transition-colors"
              style={{ gridTemplateColumns: gridCols }}
            >
              <span className={`text-xs ${item.whenColor ? "" : "text-[#5C6C75]"}`} style={{ color: item.whenColor }}>{item.when}</span>
              <Pill variant={item.pill}>
                {item.pill === "critical" ? "CRITICAL" : item.pill === "medium" ? "FINDING" : item.pill === "success" ? "RESOLVED" : item.pill === "info" ? "SCAN" : item.pill.toUpperCase()}
              </Pill>
              <div className="min-w-0">
                <div className="text-[15px] text-white truncate">{item.title}</div>
                <div className="text-xs text-[#5C6C75] mt-1">{item.meta}</div>
              </div>
              <div className="text-right">
                {item.impact.startsWith("$") ? (
                  <span className="text-mdb-leaf font-semibold text-[13px]">
                    {item.impact.replace("/mo", "")}
                    <span className="text-xs text-[#5C6C75]">/mo</span>
                  </span>
                ) : item.impact === "review" ? (
                  <span className="text-[#FF6960] font-semibold text-[11px]">review</span>
                ) : (
                  <span className="text-[#5C6C75] text-[11px]">{item.impact}</span>
                )}
              </div>
              <ChevronIcon />
            </div>
          );
        })
      )}

      <TableFooter>
        <span className="text-[#5C6C75] flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-mdb-leaf animate-pulse" />
          Updates in real time as MDBA scans your estate
        </span>
        <span className="text-mdb-leaf cursor-pointer hover:underline">Load older</span>
      </TableFooter>
    </>
  );
}

// =============================================================================
// MAIN DASHBOARD COMPONENT
// =============================================================================

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
      <PageContainer>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-100">
          <p className="font-medium">Could not load dashboard</p>
          <p className="text-sm mt-2 text-amber-200/80">{err}</p>
          <p className="text-xs mt-4 text-slate-400">
            Start MongoDB (<code className="text-mdb-leaf">docker compose up -d</code>) and the API (
            <code className="text-mdb-leaf">uvicorn app.main:app</code>).
          </p>
        </div>
      </PageContainer>
    );
  }

  if (!data) {
    return (
      <PageContainer>
        <p className="text-slate-400">Loading cluster intelligence...</p>
      </PageContainer>
    );
  }

  const topFinding = getHighestSeverityFinding(data.top_findings);
  const hasCriticals = topFinding && (topFinding.severity === "critical" || topFinding.severity === "high");
  const topClusterName = topFinding ? extractClusterFromFinding(topFinding) : null;
  const clusterHealth = getClusterHealth(MOCK_CLUSTERS);

  return (
    <PageContainer>
      {/* ACTION STRIP */}
      <div className="flex justify-end gap-2.5 mb-6">
        <Link
          to="/create"
          className="bg-mdb-leaf text-[#001E2B] px-4 py-2.5 rounded-md font-medium text-[15px]"
        >
          + New workflow
        </Link>
      </div>

      {/* HERO CARD */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#062A1F] to-[#001E2B] border-[0.5px] border-[#1C3329] rounded-xl p-8 mb-6">
        <NetworkGraphSVG />

        <div className="max-w-[460px] relative">
          <div className="text-xs text-mdb-leaf tracking-wider uppercase font-medium">
            YOUR ESTATE
          </div>

          <h1 className="text-4xl text-white font-medium leading-tight tracking-tight mt-3">
            {hasCriticals ? (
              <>
                Looking <span className="text-mdb-leaf">mostly healthy</span> this morning
              </>
            ) : (
              <>
                Looking <span className="text-mdb-leaf">healthy</span> this morning
              </>
            )}
          </h1>

          <p className="text-[15px] text-[#C5CDD3] leading-relaxed mt-3.5">
            {clusterHealth.healthy} of your {clusterHealth.total} cluster{clusterHealth.total !== 1 ? "s" : ""} {clusterHealth.total === 1 ? "is" : "are"} running clean.
            {hasCriticals && topClusterName && (
              <>
                {" "}
                <span className="text-[#FF6960]">{topClusterName}</span> needs your attention.
              </>
            )}
          </p>

          <div className="mt-6 flex gap-2.5 items-center">
            <Link
              to={topFinding ? `/findings?id=${topFinding.id}` : "/findings"}
              className="bg-mdb-leaf text-[#001E2B] px-6 py-3 rounded-md font-medium text-[15px]"
            >
              {hasCriticals && topClusterName ? `Take a look at ${topClusterName}` : "View findings"}
            </Link>
            <Link to="/findings" className="text-[#889397] px-4 py-3 text-[15px] hover:text-white transition-colors">
              Browse all findings
            </Link>
          </div>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="grid grid-cols-3 gap-3 items-stretch">
        <StatCardFindings findings={data.top_findings} />
        <StatCardSavings totalSavings={data.total_addressable_savings_usd} findings={data.top_findings} />
        <StatCardClusters clusters={MOCK_CLUSTERS} />
      </div>

      {/* TABBED WORKSPACE */}
      <TabbedWorkspace data={data} />
    </PageContainer>
  );
}
