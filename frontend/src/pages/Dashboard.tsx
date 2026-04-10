import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/api";
import type { DashboardSummary, FindingPreview } from "@/types";

// =============================================================================
// CLUSTER DATA (mock until API endpoint exists)
// =============================================================================

interface ClusterInfo {
  name: string;
  status: "healthy" | "warning" | "critical";
}

// TODO: replace with API call
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

// TODO: replace with API call
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
    findingsCount: 3,
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
    findingsCount: 3,
    findingsSeverity: "med" as const,
  },
];

type PillVariant = "crit" | "med" | "low" | "green" | "blue" | "gray" | "scan";

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

// TODO: replace with API call
const MOCK_HISTORY: HistoryGroup[] = [
  {
    day: "Today",
    items: [
      { time: "9:14 AM", type: "scan", pill: "green", title: "Cost & query health workflow ran across 12 clusters", meta: "3 new findings · spend, query, index", metaHighlight: "amber", context: "2.4s" },
      { time: "9:10 AM", type: "finding", pill: "med", title: "Data transfer up 34% on prod-east-1", meta: "spend · cross-region replication", context: "$1,520" },
      { time: "2:47 AM", type: "critical", pill: "crit", title: "Unusual IP read 847k records from user_pii", meta: "payments-prod · 340x normal access pattern", context: "unresolved" },
    ],
  },
  {
    day: "Yesterday",
    items: [
      { time: "4:12 PM", type: "resolved", pill: "green", title: "3 unused indexes dropped on analytics-warehouse", meta: "approved by Sarah · cleanup workflow", context: "$340/mo" },
      { time: "9:00 AM", type: "scan", pill: "green", title: "Backup & index audit completed", meta: "3 findings · all clusters scanned", metaHighlight: "amber", context: "4.1s" },
    ],
  },
  {
    day: "Earlier this week",
    items: [
      { time: "Tue Apr 6", type: "config", pill: "low", title: 'Workflow "Cost & query health" was modified', meta: "schedule changed from 12h to 6h · by Sarah", context: "-" },
    ],
  },
];

// TODO: replace with API call
const MOCK_ACTIVITY = [
  { when: "just now", isLive: true, pill: "scan" as const, title: "Cost & query health is scanning · 8 of 12 clusters", meta: "started 12s ago · 3 findings so far · ~3s remaining", impact: "live" },
  { when: "2h ago", isLive: false, pill: "med" as const, title: "Data transfer up 34% on prod-east-1", meta: "spend · cross-region replication anomaly", impact: "$1,520/mo" },
  { when: "5h ago", isLive: false, pill: "med" as const, title: "Backup audit found over-snapshotting on 8 clusters", meta: "backup · low-churn collections", impact: "$1,240/mo" },
  { when: "14h ago", isLive: false, pill: "crit" as const, title: "A new IP read 847k records from user_pii", meta: "payments-prod · 340x normal access pattern", impact: "review", whenColor: "#FF6960" },
  { when: "yesterday", isLive: false, pill: "green" as const, title: "Sarah approved index cleanup on analytics-warehouse", meta: "3 indexes dropped · saving going forward", impact: "$340/mo" },
  { when: "yesterday", isLive: false, pill: "blue" as const, title: "Backup & index audit completed", meta: "all clusters · 3 findings", impact: "4.1s" },
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
// ANIMATIONS
// =============================================================================

const animationStyles = `
@keyframes mdba-pulse-green {
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50%      { opacity: 0.85; transform: scale(1.1); }
}
@keyframes mdba-pulse-red {
  0%, 100% { opacity: 0.7; transform: scale(1); }
  50%      { opacity: 1;   transform: scale(1.3); }
}
@keyframes mdba-progress {
  0%   { width: 22%; }
  50%  { width: 58%; }
  100% { width: 87%; }
}

.dot-ok      { animation: mdba-pulse-green 3s ease-in-out infinite; transform-origin: center; }
.dot-crit    { animation: mdba-pulse-red 1.8s ease-in-out infinite; transform-origin: center; }
.scan-dot    { animation: mdba-pulse-green 1.6s ease-in-out infinite; }
.live-dot    { animation: mdba-pulse-green 2.4s ease-in-out infinite; }
.scan-progress { animation: mdba-progress 4s ease-in-out infinite; }

.row { transition: background 0.15s ease; }
.row:hover { background: rgba(255, 255, 255, 0.025); }
`;

// =============================================================================
// PILL COMPONENT
// =============================================================================

const pillStyles: Record<PillVariant, { color: string; bg: string; border: string }> = {
  crit: { color: "#FF6960", bg: "rgba(255,105,96,0.08)", border: "rgba(255,105,96,0.3)" },
  med: { color: "#FFC010", bg: "rgba(255,192,16,0.08)", border: "rgba(255,192,16,0.3)" },
  low: { color: "#889397", bg: "rgba(136,147,151,0.06)", border: "rgba(136,147,151,0.25)" },
  green: { color: "#00ED64", bg: "rgba(0,237,100,0.08)", border: "rgba(0,237,100,0.3)" },
  blue: { color: "#3D9CFF", bg: "rgba(61,156,255,0.08)", border: "rgba(61,156,255,0.3)" },
  gray: { color: "#889397", bg: "rgba(255,255,255,0.04)", border: "#1C2D38" },
  scan: { color: "#00ED64", bg: "rgba(0,237,100,0.08)", border: "rgba(0,237,100,0.3)" },
};

function Pill({ variant, children }: { variant: PillVariant; children: React.ReactNode }) {
  const s = pillStyles[variant];
  const isScan = variant === "scan";
  return (
    <span
      style={{
        fontSize: 12,
        padding: "3px 8px",
        borderRadius: 3,
        letterSpacing: "0.05em",
        textAlign: "center",
        fontWeight: 500,
        textTransform: "uppercase",
        border: `0.5px solid ${s.border}`,
        color: s.color,
        background: s.bg,
        display: isScan ? "flex" : "inline-block",
        alignItems: isScan ? "center" : undefined,
        justifyContent: isScan ? "center" : undefined,
        gap: isScan ? 5 : undefined,
      }}
    >
      {isScan && (
        <span
          className="scan-dot"
          style={{ width: 4, height: 4, borderRadius: "50%", background: "#00ED64" }}
        />
      )}
      {children}
    </span>
  );
}

// =============================================================================
// ICON COMPONENTS
// =============================================================================

function SearchIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#5C6C75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ChevronIcon() {
  return <span style={{ color: "#5C6C75", fontSize: 14 }}>›</span>;
}

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

function CostIconChip() {
  return (
    <div style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(0,237,100,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00ED64" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    </div>
  );
}

function SecurityIconChip() {
  return (
    <div style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(255,105,96,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF6960" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    </div>
  );
}

function BackupIconChip() {
  return (
    <div style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(61,156,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
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

  const parts: React.ReactNode[] = [];
  if (breakdown.critical > 0) {
    parts.push(<span key="crit" style={{ color: "#FF6960" }}>{breakdown.critical} critical</span>);
  }
  if (breakdown.high > 0) {
    parts.push(<span key="high" style={{ color: "#FF6960" }}>{breakdown.high} high</span>);
  }
  if (breakdown.medium > 0) {
    parts.push(<span key="med" style={{ color: "#FFC010" }}>{breakdown.medium} medium</span>);
  }
  if (breakdown.low > 0) {
    parts.push(<span key="low" style={{ color: "#889397" }}>{breakdown.low} low</span>);
  }

  return (
    <Link to="/findings" style={{ textDecoration: "none", display: "block", height: "100%" }}>
      <div style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid #112733", borderRadius: 10, padding: "18px 20px", cursor: "pointer", transition: "border-color 0.15s", height: "100%", boxSizing: "border-box" }} className="hover:border-[#00ED64]/40">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, textTransform: "uppercase", color: "#889397", letterSpacing: "0.05em" }}>OPEN FINDINGS</span>
          <SunIcon />
        </div>
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 36, fontWeight: 500, color: "#FFFFFF", lineHeight: 1 }}>{total}</span>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "#5C6C75" }}>
          {parts.length > 0 ? (
            parts.map((part, i) => (
              <span key={i}>
                {i > 0 && " · "}
                {part}
              </span>
            ))
          ) : (
            <span>No open findings</span>
          )}
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
    <Link to="/findings" style={{ textDecoration: "none", display: "block", height: "100%" }}>
      <div style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid #112733", borderRadius: 10, padding: "18px 20px", cursor: "pointer", transition: "border-color 0.15s", height: "100%", boxSizing: "border-box" }} className="hover:border-[#00ED64]/40">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, textTransform: "uppercase", color: "#889397", letterSpacing: "0.05em" }}>AVAILABLE SAVINGS</span>
          <DollarIcon />
        </div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "baseline" }}>
          <span style={{ fontSize: 36, fontWeight: 500, color: "#00ED64", lineHeight: 1, letterSpacing: "-0.01em" }}>
            ${totalSavings.toLocaleString()}
          </span>
          <span style={{ fontSize: 12, color: "#5C6C75", marginLeft: 2 }}>/mo</span>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "#5C6C75" }}>
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

function StatCardEstate({ clusters }: { clusters: ClusterInfo[] }) {
  const health = getClusterHealth(clusters);

  const problemClusters = useMemo(() => {
    return clusters
      .filter((c) => c.status === "critical" || c.status === "warning")
      .sort((a, b) => {
        if (a.status === "critical" && b.status !== "critical") return -1;
        if (b.status === "critical" && a.status !== "critical") return 1;
        return 0;
      });
  }, [clusters]);

  const needsAttention = problemClusters.length > 0;

  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid #112733", borderRadius: 10, padding: "18px 20px", height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, textTransform: "uppercase", color: "#889397", letterSpacing: "0.05em" }}>ESTATE</span>
        <ServerIcon />
      </div>
      <div style={{ marginTop: 8 }}>
        <span style={{ fontSize: 36, fontWeight: 500, color: "#FFFFFF", lineHeight: 1 }}>{health.total}</span>
        <span style={{ fontSize: 15, color: "#5C6C75", marginLeft: 6 }}>cluster{health.total !== 1 ? "s" : ""}</span>
      </div>
      <div style={{ marginTop: 12, fontSize: 11 }}>
        {needsAttention ? (
          <>
            <div style={{ color: "#5C6C75", marginBottom: 6 }}>
              <span style={{ color: problemClusters.length > 0 ? "#FF6960" : "#FFC010" }}>
                {problemClusters.length} need{problemClusters.length === 1 ? "s" : ""} attention
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {problemClusters.slice(0, 3).map((cluster) => (
                <span
                  key={cluster.name}
                  style={{
                    fontSize: 12,
                    padding: "2px 6px",
                    borderRadius: 3,
                    fontFamily: "ui-monospace, monospace",
                    background: cluster.status === "critical" ? "rgba(255,105,96,0.1)" : "rgba(255,192,16,0.1)",
                    color: cluster.status === "critical" ? "#FF6960" : "#FFC010",
                    border: `0.5px solid ${cluster.status === "critical" ? "rgba(255,105,96,0.3)" : "rgba(255,192,16,0.3)"}`,
                  }}
                >
                  {cluster.name}
                </span>
              ))}
              {problemClusters.length > 3 && (
                <span style={{ fontSize: 12, color: "#5C6C75", padding: "2px 4px" }}>
                  +{problemClusters.length - 3} more
                </span>
              )}
            </div>
            <div style={{ marginTop: 8, color: "#5C6C75" }}>
              <span style={{ color: "rgba(0,237,100,0.8)" }}>{health.healthy} healthy</span>
            </div>
          </>
        ) : (
          <div style={{ color: "rgba(0,237,100,0.8)" }}>All clusters healthy</div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// CONSTELLATION SVG
// =============================================================================

interface ConstellationProps {
  clusters: ClusterInfo[];
  topCriticalCluster: string | null;
}

function ConstellationSVG({ clusters, topCriticalCluster }: ConstellationProps) {
  const maxDots = clusters.length <= 12 ? clusters.length : clusters.length <= 30 ? clusters.length : 15;
  const dotRadius = clusters.length <= 12 ? 3 : clusters.length <= 30 ? 2 : 2.5;

  const criticalClusters = clusters.filter((c) => c.status === "critical");
  const warningClusters = clusters.filter((c) => c.status === "warning");
  const healthyClusters = clusters.filter((c) => c.status === "healthy");

  const displayClusters: ClusterInfo[] = [];
  displayClusters.push(...criticalClusters.slice(0, 12));
  displayClusters.push(...warningClusters.slice(0, Math.min(warningClusters.length, maxDots - displayClusters.length)));

  const remainingSlots = maxDots - displayClusters.length;
  if (remainingSlots > 0 && healthyClusters.length > 0) {
    const step = Math.max(1, Math.floor(healthyClusters.length / remainingSlots));
    for (let i = 0; i < remainingSlots && i * step < healthyClusters.length; i++) {
      displayClusters.push(healthyClusters[i * step]);
    }
  }

  const positions = useMemo(() => {
    const count = displayClusters.length;
    if (count === 0) return [];

    const pts: { x: number; y: number }[] = [];
    const width = 240;
    const height = 160;
    const padding = 25;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.3;
      const radius = 40 + (i % 4) * 15 + (i % 2) * 10;
      const x = (width / 2) + Math.cos(angle) * radius * 0.8 + ((i * 17) % 30) - 15;
      const y = (height / 2) + Math.sin(angle) * radius * 0.5 + ((i * 13) % 20) - 10;
      pts.push({
        x: Math.max(padding, Math.min(width - padding, x)),
        y: Math.max(padding, Math.min(height - padding, y)),
      });
    }
    return pts;
  }, [displayClusters.length]);

  const criticalIndex = displayClusters.findIndex((c) => c.status === "critical");
  const annotationCluster = criticalIndex >= 0 ? displayClusters[criticalIndex] : null;
  const annotationPos = criticalIndex >= 0 ? positions[criticalIndex] : null;

  return (
    <svg viewBox="0 0 240 160" style={{ position: "absolute", top: 14, right: 14, width: 240, height: 160, opacity: 0.95 }}>
      {positions.map((pos, i) => {
        if (i === 0) return null;
        const prev = positions[i - 1];
        const isCriticalLine = displayClusters[i]?.status === "critical" || displayClusters[i - 1]?.status === "critical";
        return (
          <line
            key={`line-${i}`}
            x1={prev.x}
            y1={prev.y}
            x2={pos.x}
            y2={pos.y}
            stroke={isCriticalLine ? "rgba(255,105,96,0.35)" : "rgba(0,237,100,0.15)"}
            strokeWidth={isCriticalLine ? 0.6 : 0.5}
          />
        );
      })}
      {displayClusters.map((cluster, i) => {
        const pos = positions[i];
        if (!pos) return null;

        const fill =
          cluster.status === "critical"
            ? "#FF6960"
            : cluster.status === "warning"
            ? "#FFC010"
            : "#00ED64";

        const className =
          cluster.status === "critical"
            ? "dot-crit"
            : cluster.status === "warning"
            ? ""
            : "dot-ok";

        const r = cluster.status === "critical" ? dotRadius + 1 : dotRadius;

        return (
          <circle
            key={i}
            className={className}
            cx={pos.x}
            cy={pos.y}
            r={r}
            fill={fill}
            opacity={cluster.status === "warning" ? 0.7 : undefined}
          >
            <title>{cluster.name}</title>
          </circle>
        );
      })}
      {annotationCluster && annotationPos && (
        <>
          <line
            x1={annotationPos.x + 10}
            y1={annotationPos.y + 10}
            x2={annotationPos.x + 35}
            y2={annotationPos.y + 30}
            stroke="#FF6960"
            strokeWidth="0.5"
            opacity="0.5"
          />
          <text
            x={annotationPos.x + 15}
            y={annotationPos.y + 43}
            fill="#FF6960"
            fontSize="9"
            fontFamily="ui-monospace, monospace"
            fontWeight="500"
          >
            {topCriticalCluster || annotationCluster.name}
          </text>
        </>
      )}
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

  const tabCounts: Record<TabKey, number | null> = {
    findings: data.open_findings,
    workflows: data.workflows_active,
    history: null,
    activity: null,
  };

  const hasCriticalFindings = data.top_findings.some((f) => f.severity === "critical" || f.severity === "high");

  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid #112733", borderRadius: 10, marginTop: 24 }}>
      <div style={{ display: "flex", padding: "0 22px", borderBottom: "0.5px solid #0E2230", borderRadius: "10px 10px 0 0" }}>
        {(["findings", "workflows", "history", "activity"] as TabKey[]).map((tab) => {
          const isActive = activeTab === tab;
          const count = tabCounts[tab];
          const isActivityTab = tab === "activity";
          const showRedCount = tab === "findings" && hasCriticalFindings;

          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTabChange(tab)}
              style={{
                padding: "16px 14px",
                fontSize: 15,
                color: isActive ? "#FFFFFF" : "#5C6C75",
                fontWeight: isActive ? 500 : 400,
                background: "transparent",
                border: "none",
                borderBottom: isActive ? "1.5px solid #00ED64" : "1.5px solid transparent",
                marginBottom: isActive ? "-0.5px" : 0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {count !== null && (
                <span
                  style={{
                    fontSize: 12,
                    padding: "2px 7px",
                    borderRadius: 9999,
                    background: isActive ? (showRedCount ? "rgba(255,105,96,0.1)" : "rgba(0,237,100,0.1)") : "transparent",
                    color: isActive ? (showRedCount ? "#FF6960" : "#00ED64") : "#5C6C75",
                  }}
                >
                  {count}
                </span>
              )}
              {isActivityTab && (
                <span className="scan-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "#00ED64" }} />
              )}
            </button>
          );
        })}
      </div>

      <FilterRow activeTab={activeTab} filters={filters} onFilterChange={updateFilter} />

      {activeTab === "findings" && <FindingsTab findings={data.top_findings} filters={filters} />}
      {activeTab === "workflows" && <WorkflowsTab filters={filters} />}
      {activeTab === "history" && <HistoryTab filters={filters} />}
      {activeTab === "activity" && <ActivityTab filters={filters} />}
    </div>
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

function FilterRow({ activeTab, filters, onFilterChange }: FilterRowProps) {
  const filterConfigs: Record<TabKey, { key: keyof FilterState; label: string; options: string[] }[]> = {
    findings: [
      { key: "severity", label: "Severity", options: ["all", "critical", "high", "medium", "low"] },
      { key: "category", label: "Category", options: ["all", "spend", "slow_query", "backup", "security", "index_rationalization", "data_quality", "scaling"] },
      { key: "cluster", label: "Cluster", options: ["all", "payments-prod", "analytics-warehouse", "prod-east-1"] },
    ],
    workflows: [
      { key: "status", label: "Status", options: ["all", "scanning", "active", "paused"] },
      { key: "schedule", label: "Schedule", options: ["all", "hourly", "every 6h", "daily", "weekly"] },
      { key: "scope", label: "Scope", options: ["all", "all clusters", "payments-prod", "12 clusters"] },
    ],
    history: [
      { key: "date", label: "Date", options: ["last 7d", "last 24h", "last 30d", "all time"] },
      { key: "type", label: "Type", options: ["all", "scan", "finding", "critical", "resolved", "config"] },
      { key: "cluster", label: "Cluster", options: ["all", "payments-prod", "analytics-warehouse", "prod-east-1"] },
    ],
    activity: [
      { key: "type", label: "Type", options: ["all", "scan", "finding", "critical", "resolved"] },
      { key: "cluster", label: "Cluster", options: ["all", "payments-prod", "analytics-warehouse", "prod-east-1"] },
    ],
  };

  const sortOptions: Record<TabKey, string[]> = {
    findings: ["impact", "severity", "recent"],
    workflows: ["last run", "next run", "name"],
    history: ["recent", "type"],
    activity: ["recent", "impact"],
  };

  return (
    <div style={{ padding: "14px 22px", borderBottom: "0.5px solid #0E2230", background: "rgba(0,0,0,0.15)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", position: "relative", zIndex: 10 }}>
      <div
        style={{
          flex: "0 0 220px",
          background: "rgba(255,255,255,0.025)",
          border: "0.5px solid #0E2230",
          borderRadius: 5,
          padding: "6px 11px",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <SearchIcon />
        <input
          type="text"
          placeholder={`Search ${activeTab}`}
          value={filters.search}
          onChange={(e) => onFilterChange("search", e.target.value)}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 12,
            color: "#FFFFFF",
          }}
        />
        <span
          style={{
            fontSize: 12,
            color: "#5C6C75",
            fontFamily: "ui-monospace, monospace",
            padding: "1px 5px",
            border: "0.5px solid #1C2D38",
            borderRadius: 2,
          }}
        >
          K
        </span>
      </div>

      {filterConfigs[activeTab].map((config) => (
        <FilterDropdown
          key={config.key}
          label={config.label}
          value={filters[config.key]}
          options={config.options}
          onChange={(val) => onFilterChange(config.key, val)}
        />
      ))}

      <div style={{ flex: 1 }} />

      {activeTab === "activity" ? (
        <span
          style={{
            fontSize: 12,
            color: "#00ED64",
            padding: "6px 11px",
            border: "0.5px solid rgba(0,237,100,0.25)",
            background: "rgba(0,237,100,0.04)",
            borderRadius: 5,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span className="live-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "#00ED64" }} />
          live · auto-refreshing
        </span>
      ) : activeTab === "history" ? (
        <span style={{ fontSize: 12, color: "#C5CDD3", padding: "7px 11px", border: "0.5px solid #1C2D38", borderRadius: 5, cursor: "pointer" }}>
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
    </div>
  );
}

function FilterDropdown({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (val: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          fontSize: 12,
          color: "#C5CDD3",
          padding: "7px 11px",
          border: "0.5px solid #1C2D38",
          borderRadius: 5,
          display: "flex",
          gap: 6,
          cursor: "pointer",
          background: "transparent",
        }}
      >
        {label} <span style={{ color: value === "all" ? "#5C6C75" : "#00ED64" }}>{value}</span> <span style={{ color: "#5C6C75" }}>v</span>
      </button>
      {isOpen && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 100 }} onClick={() => setIsOpen(false)} />
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 4,
              background: "#0A1A1F",
              border: "0.5px solid #1C2D38",
              borderRadius: 6,
              padding: 4,
              zIndex: 101,
              minWidth: 140,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  fontSize: 12,
                  color: opt === value ? "#00ED64" : "#C5CDD3",
                  background: opt === value ? "rgba(0,237,100,0.08)" : "transparent",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// FINDINGS TAB
// =============================================================================

function FindingsTab({ findings, filters }: { findings: FindingPreview[]; filters: FilterState }) {
  const navigate = useNavigate();

  const severityToPill: Record<string, PillVariant> = {
    critical: "crit",
    high: "crit",
    medium: "med",
    low: "low",
  };

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

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "14px 96px minmax(0, 1fr) 90px 14px",
          gap: 14,
          padding: "10px 22px",
          fontSize: 12,
          color: "#5C6C75",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        <span />
        <span>Severity</span>
        <span>Finding</span>
        <span style={{ textAlign: "right" }}>Impact</span>
        <span />
      </div>

      {filteredFindings.length === 0 ? (
        <div style={{ padding: "40px 22px", textAlign: "center", color: "#5C6C75" }}>
          No findings match your filters
        </div>
      ) : (
        filteredFindings.map((f) => {
          const isCritical = f.severity === "critical" || f.severity === "high";
          return (
            <div
              key={f.id}
              onClick={() => handleFindingClick(f.id)}
              className="row"
              style={{
                display: "grid",
                gridTemplateColumns: "14px 96px minmax(0, 1fr) 90px 14px",
                gap: 14,
                padding: "13px 22px",
                alignItems: "center",
                borderTop: "0.5px solid #0E2230",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: isCritical ? "#FF6960" : f.severity === "medium" ? "#FFC010" : "#889397",
                  boxShadow: isCritical ? "0 0 8px rgba(255,105,96,0.4)" : undefined,
                }}
              />
              <Pill variant={severityToPill[f.severity] || "low"}>{f.severity.toUpperCase()}</Pill>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, color: "#FFFFFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {f.title}
                </div>
                <div style={{ fontSize: 12, color: "#5C6C75", fontFamily: "ui-monospace, monospace", marginTop: 4 }}>
                  {f.agent.replace(/_/g, " ")} · {timeAgo(f.created_at)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                {f.estimated_monthly_savings_usd ? (
                  <span style={{ color: "#00ED64", fontWeight: 600, fontSize: 13 }}>
                    ${f.estimated_monthly_savings_usd.toLocaleString()}
                    <span style={{ fontSize: 12, color: "#5C6C75" }}>/mo</span>
                  </span>
                ) : isCritical ? (
                  <span style={{ color: "#FF6960", fontWeight: 600, fontSize: 11 }}>REVIEW</span>
                ) : (
                  <span style={{ color: "#889397", fontSize: 11 }}>review</span>
                )}
              </div>
              <ChevronIcon />
            </div>
          );
        })
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 22px",
          borderTop: "0.5px solid #0E2230",
          fontSize: 12,
        }}
      >
        <span style={{ color: "#5C6C75" }}>
          Showing <span style={{ color: "#C5CDD3" }}>{filteredFindings.length}</span> of <span style={{ color: "#C5CDD3" }}>{findings.length}</span> ·{" "}
          <span style={{ color: "#00ED64" }}>saved ${thisWeekSavings.toLocaleString()}/mo this week</span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link to="/findings" style={{ color: "#00ED64", textDecoration: "none" }}>Open in Findings</Link>
        </div>
      </div>
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

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "28px 96px minmax(0, 1fr) 90px 14px",
          gap: 14,
          padding: "10px 22px",
          fontSize: 12,
          color: "#5C6C75",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        <span />
        <span>Status</span>
        <span>Workflow</span>
        <span style={{ textAlign: "right" }}>Next run</span>
        <span />
      </div>

      {filteredWorkflows.length === 0 ? (
        <div style={{ padding: "40px 22px", textAlign: "center", color: "#5C6C75" }}>
          No workflows match your filters
        </div>
      ) : (
        filteredWorkflows.map((w) => (
          <div
            key={w.id}
            onClick={() => navigate("/workflows")}
            className="row"
            style={{
              display: "grid",
              gridTemplateColumns: "28px 96px minmax(0, 1fr) 90px 14px",
              gap: 14,
              padding: "13px 22px",
              alignItems: "center",
              borderTop: "0.5px solid #0E2230",
              cursor: "pointer",
            }}
          >
            {iconChips[w.iconType]}
            <Pill variant={w.status === "scanning" ? "scan" : "gray"}>
              {w.status === "scanning" ? "SCANNING" : "ACTIVE"}
            </Pill>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, color: "#FFFFFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {w.name}
              </div>
              <div style={{ fontSize: 12, color: "#5C6C75", marginTop: 4 }}>
                {w.schedule} · {w.scope} · ran {w.lastRunAt} ·{" "}
                <span style={{ color: severityColors[w.findingsSeverity] }}>{w.findingsCount} findings</span>
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12, color: "#5C6C75" }}>{w.nextRunIn}</div>
            <ChevronIcon />
          </div>
        ))
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 22px",
          borderTop: "0.5px solid #0E2230",
          fontSize: 12,
        }}
      >
        <span style={{ color: "#5C6C75" }}>
          Showing <span style={{ color: "#C5CDD3" }}>{filteredWorkflows.length}</span> of <span style={{ color: "#C5CDD3" }}>{MOCK_WORKFLOWS.length}</span> · monitoring{" "}
          <span style={{ color: "#C5CDD3" }}>12</span> clusters ·{" "}
          <span style={{ color: "#00ED64" }}>7 findings this week</span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link to="/workflows" style={{ color: "#00ED64", textDecoration: "none" }}>Browse library</Link>
        </div>
      </div>
    </>
  );
}

// =============================================================================
// HISTORY TAB
// =============================================================================

function HistoryTab({ filters }: { filters: FilterState }) {
  const navigate = useNavigate();

  const typeToPill: Record<string, PillVariant> = {
    scan: "green",
    finding: "med",
    critical: "crit",
    resolved: "green",
    config: "low",
  };

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

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "78px 96px minmax(0, 1fr) 90px 14px",
          gap: 14,
          padding: "10px 22px",
          fontSize: 12,
          color: "#5C6C75",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        <span>Time</span>
        <span>Type</span>
        <span>Event</span>
        <span style={{ textAlign: "right" }}>Context</span>
        <span />
      </div>

      {groupedHistory.length === 0 ? (
        <div style={{ padding: "40px 22px", textAlign: "center", color: "#5C6C75" }}>
          No history matches your filters
        </div>
      ) : (
        groupedHistory.map(([day, items]) => (
          <div key={day}>
            <div
              style={{
                fontSize: 12,
                color: "#5C6C75",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: "14px 22px 6px",
                borderTop: "0.5px solid #0E2230",
              }}
            >
              {day}
            </div>
            {items.map((item, i) => (
              <div
                key={i}
                className="row"
                onClick={() => item.type === "finding" || item.type === "critical" ? navigate("/findings") : navigate("/runs")}
                style={{
                  display: "grid",
                  gridTemplateColumns: "78px 96px minmax(0, 1fr) 90px 14px",
                  gap: 14,
                  padding: "13px 22px",
                  alignItems: "center",
                  borderTop: "0.5px solid #0E2230",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 12, color: "#5C6C75", fontFamily: "ui-monospace, monospace" }}>{item.time}</span>
                <Pill variant={typeToPill[item.type] || "low"}>{item.type.toUpperCase()}</Pill>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, color: "#FFFFFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 12, color: "#5C6C75", marginTop: 4 }}>
                    {item.metaHighlight === "amber" ? (
                      <span><span style={{ color: "#FFC010" }}>{item.meta.split("·")[0]}</span>·{item.meta.split("·").slice(1).join("·")}</span>
                    ) : (
                      item.meta
                    )}
                  </div>
                </div>
                <div style={{ textAlign: "right", fontSize: 12, color: item.context.startsWith("$") ? "#00ED64" : item.context === "unresolved" ? "#FF6960" : "#5C6C75" }}>
                  {item.context}
                </div>
                <ChevronIcon />
              </div>
            ))}
          </div>
        ))
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 22px",
          borderTop: "0.5px solid #0E2230",
          fontSize: 12,
        }}
      >
        <span style={{ color: "#5C6C75" }}>
          Showing <span style={{ color: "#C5CDD3" }}>{filteredHistory.length}</span> of <span style={{ color: "#C5CDD3" }}>24</span> events · last 7 days
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link to="/runs" style={{ color: "#00ED64", textDecoration: "none" }}>View all runs</Link>
        </div>
      </div>
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
        if (filters.type === "scan") return item.isLive || item.pill === "blue";
        if (filters.type === "finding") return item.pill === "med";
        if (filters.type === "critical") return item.pill === "crit";
        if (filters.type === "resolved") return item.pill === "green" && !item.isLive;
        return true;
      });
    }

    return result;
  }, [filters]);

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "78px 96px minmax(0, 1fr) 90px 14px",
          gap: 14,
          padding: "10px 22px",
          fontSize: 12,
          color: "#5C6C75",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        <span>When</span>
        <span>Type</span>
        <span>Event</span>
        <span style={{ textAlign: "right" }}>Impact</span>
        <span />
      </div>

      {filteredActivity.length === 0 ? (
        <div style={{ padding: "40px 22px", textAlign: "center", color: "#5C6C75" }}>
          No activity matches your filters
        </div>
      ) : (
        filteredActivity.map((item, i) => {
          if (item.isLive) {
            return (
              <div
                key={i}
                className="row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "78px 96px minmax(0, 1fr) 90px 14px",
                  gap: 14,
                  padding: "13px 22px",
                  alignItems: "center",
                  borderTop: "0.5px solid rgba(0,237,100,0.18)",
                  background: "rgba(0,237,100,0.025)",
                  cursor: "pointer",
                }}
                onClick={() => navigate("/runs")}
              >
                <span style={{ fontSize: 12, color: "#00ED64" }}>{item.when}</span>
                <Pill variant="scan">SCANNING</Pill>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, color: "#FFFFFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 12, color: "#5C6C75", marginTop: 4 }}>
                    {item.meta.includes("findings so far") ? (
                      <span>
                        {item.meta.split("·")[0]}· <span style={{ color: "#FFC010" }}>{item.meta.split("·")[1]}</span> ·{item.meta.split("·")[2]}
                      </span>
                    ) : (
                      item.meta
                    )}
                  </div>
                  <div style={{ height: 2, background: "rgba(0,237,100,0.1)", borderRadius: 1, marginTop: 8, overflow: "hidden" }}>
                    <div className="scan-progress" style={{ height: "100%", background: "#00ED64", borderRadius: 1 }} />
                  </div>
                </div>
                <div style={{ textAlign: "right", fontSize: 12, color: "#5C6C75" }}>{item.impact}</div>
                <ChevronIcon />
              </div>
            );
          }

          return (
            <div
              key={i}
              className="row"
              onClick={() => item.pill === "crit" || item.pill === "med" ? navigate("/findings") : navigate("/runs")}
              style={{
                display: "grid",
                gridTemplateColumns: "78px 96px minmax(0, 1fr) 90px 14px",
                gap: 14,
                padding: "13px 22px",
                alignItems: "center",
                borderTop: "0.5px solid #0E2230",
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 12, color: item.whenColor || "#5C6C75" }}>{item.when}</span>
              <Pill variant={item.pill}>{item.pill === "crit" ? "CRITICAL" : item.pill === "med" ? "FINDING" : item.pill === "green" ? "RESOLVED" : item.pill === "blue" ? "SCAN" : item.pill.toUpperCase()}</Pill>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, color: "#FFFFFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 12, color: "#5C6C75", marginTop: 4 }}>{item.meta}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                {item.impact.startsWith("$") ? (
                  <span style={{ color: "#00ED64", fontWeight: 600, fontSize: 13 }}>
                    {item.impact.replace("/mo", "")}
                    <span style={{ fontSize: 12, color: "#5C6C75" }}>/mo</span>
                  </span>
                ) : item.impact === "review" ? (
                  <span style={{ color: "#FF6960", fontWeight: 600, fontSize: 11 }}>review</span>
                ) : (
                  <span style={{ color: "#5C6C75", fontSize: 11 }}>{item.impact}</span>
                )}
              </div>
              <ChevronIcon />
            </div>
          );
        })
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 22px",
          borderTop: "0.5px solid #0E2230",
          fontSize: 12,
        }}
      >
        <span style={{ color: "#5C6C75", display: "flex", alignItems: "center", gap: 6 }}>
          <span className="live-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "#00ED64" }} />
          Updates in real time as MDBA scans your estate
        </span>
        <span style={{ color: "#00ED64", cursor: "pointer" }}>Load older</span>
      </div>
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
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-100">
        <p className="font-medium">Could not load dashboard</p>
        <p className="text-sm mt-2 text-amber-200/80">{err}</p>
        <p className="text-xs mt-4 text-slate-400">
          Start MongoDB (<code className="text-mdb-leaf">docker compose up -d</code>) and the API (
          <code className="text-mdb-leaf">uvicorn app.main:app</code>).
        </p>
      </div>
    );
  }

  if (!data) {
    return <p className="text-slate-400">Loading cluster intelligence...</p>;
  }

  const topFinding = getHighestSeverityFinding(data.top_findings);
  const hasCriticals = topFinding && (topFinding.severity === "critical" || topFinding.severity === "high");
  const topClusterName = topFinding ? extractClusterFromFinding(topFinding) : null;
  const clusterHealth = getClusterHealth(MOCK_CLUSTERS);

  return (
    <>
      <style>{animationStyles}</style>

      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        {/* ACTION STRIP */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginBottom: 22 }}>
          <Link
            to="/create"
            style={{
              background: "#00ED64",
              color: "#001E2B",
              padding: "9px 16px",
              borderRadius: 6,
              fontWeight: 500,
              fontSize: 15,
              textDecoration: "none",
            }}
          >
            + New workflow
          </Link>
        </div>

        {/* HERO CARD */}
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            background: "linear-gradient(135deg, #062A1F 0%, #001E2B 60%)",
            border: "0.5px solid #1C3329",
            borderRadius: 12,
            padding: "32px 36px",
            marginBottom: 24,
          }}
        >
          <ConstellationSVG clusters={MOCK_CLUSTERS} topCriticalCluster={topClusterName} />

          <div style={{ maxWidth: 460, position: "relative" }}>
            <div style={{ fontSize: 12, color: "#00ED64", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}>
              YOUR ESTATE
            </div>

            <h1
              style={{
                fontSize: 36,
                color: "#FFFFFF",
                fontWeight: 500,
                lineHeight: 1.2,
                letterSpacing: "-0.015em",
                marginTop: 12,
              }}
            >
              {hasCriticals ? (
                <>
                  Looking <span style={{ color: "#00ED64" }}>mostly healthy</span> this morning
                </>
              ) : (
                <>
                  Looking <span style={{ color: "#00ED64" }}>healthy</span> this morning
                </>
              )}
            </h1>

            <p style={{ fontSize: 15, color: "#C5CDD3", lineHeight: 1.6, marginTop: 14 }}>
              {clusterHealth.healthy} of your {clusterHealth.total} cluster{clusterHealth.total !== 1 ? "s" : ""} {clusterHealth.total === 1 ? "is" : "are"} running clean.
              {hasCriticals && topClusterName && (
                <>
                  {" "}
                  <span style={{ color: "#FF6960" }}>{topClusterName}</span> needs your attention.
                </>
              )}
            </p>

            <div style={{ marginTop: 24, display: "flex", gap: 10, alignItems: "center" }}>
              <Link
                to={topFinding ? `/findings?id=${topFinding.id}` : "/findings"}
                style={{
                  background: "#00ED64",
                  color: "#001E2B",
                  padding: "11px 22px",
                  borderRadius: 6,
                  fontWeight: 500,
                  fontSize: 15,
                  textDecoration: "none",
                }}
              >
                {hasCriticals && topClusterName ? `Take a look at ${topClusterName}` : "View findings"}
              </Link>
              <Link to="/findings" style={{ color: "#889397", padding: "11px 16px", fontSize: 15, textDecoration: "none" }}>
                Browse all findings
              </Link>
            </div>
          </div>
        </div>

        {/* STAT CARDS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, alignItems: "stretch" }}>
          <StatCardFindings findings={data.top_findings} />
          <StatCardSavings totalSavings={data.total_addressable_savings_usd} findings={data.top_findings} />
          <StatCardEstate clusters={MOCK_CLUSTERS} />
        </div>

        {/* TABBED WORKSPACE */}
        <TabbedWorkspace data={data} />
      </div>
    </>
  );
}
