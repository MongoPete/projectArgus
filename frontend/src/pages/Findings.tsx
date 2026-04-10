import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/api";
import type { Finding, FindingStatus } from "@/types";

// =============================================================================
// CONSTANTS & HELPERS
// =============================================================================

const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  spend: { label: "cost optimization", color: "#00ED64" },
  slow_query: { label: "query performance", color: "#FFC010" },
  backup: { label: "backup & storage", color: "#3D9CFF" },
  index_rationalization: { label: "index health", color: "#A78BFA" },
  security: { label: "security", color: "#FF6960" },
  data_quality: { label: "data quality", color: "#06B6D4" },
  scaling: { label: "capacity planning", color: "#F97316" },
};

function categoryOf(agent: string) {
  return CATEGORY_META[agent] ?? { label: agent.replace(/_/g, " "), color: "#889397" };
}

type FindingCategory = "security" | "cost" | "query" | "backup" | "data_quality" | "other";

function getCategoryType(agent: string): FindingCategory {
  if (agent === "security") return "security";
  if (agent === "spend" || agent === "index_rationalization") return "cost";
  if (agent === "slow_query") return "query";
  if (agent === "backup") return "backup";
  if (agent === "data_quality") return "data_quality";
  return "other";
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function extractClusterFromFinding(finding: Finding): string {
  const patterns = [
    /on\s+([a-zA-Z0-9_-]+(?:-[a-zA-Z0-9_]+)*)/i,
    /from\s+([a-zA-Z0-9_-]+(?:-[a-zA-Z0-9_]+)*)/i,
    /in\s+([a-zA-Z0-9_-]+(?:-[a-zA-Z0-9_]+)*)/i,
  ];
  for (const pattern of patterns) {
    const match = finding.title.match(pattern);
    if (match) return match[1];
  }
  if (finding.evidence.cluster) return String(finding.evidence.cluster);
  if (finding.evidence.cluster_name) return String(finding.evidence.cluster_name);
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

.dot-crit { animation: mdba-pulse-red 1.8s ease-in-out infinite; transform-origin: center; }
.live-dot { animation: mdba-pulse-green 2.4s ease-in-out infinite; }
.find-row { transition: background 0.15s ease; }
.find-row:hover { background: rgba(255, 255, 255, 0.025); }
`;

// =============================================================================
// PILL COMPONENT
// =============================================================================

type PillVariant = "crit" | "high" | "med" | "low" | "green" | "blue" | "gray" | "scan" | "resolved";

const pillStyles: Record<PillVariant, { color: string; bg: string; border: string }> = {
  crit: { color: "#FF6960", bg: "rgba(255,105,96,0.08)", border: "rgba(255,105,96,0.3)" },
  high: { color: "#FF6960", bg: "rgba(255,105,96,0.08)", border: "rgba(255,105,96,0.3)" },
  med: { color: "#FFC010", bg: "rgba(255,192,16,0.08)", border: "rgba(255,192,16,0.3)" },
  low: { color: "#889397", bg: "rgba(136,147,151,0.06)", border: "rgba(136,147,151,0.25)" },
  green: { color: "#00ED64", bg: "rgba(0,237,100,0.08)", border: "rgba(0,237,100,0.3)" },
  blue: { color: "#3D9CFF", bg: "rgba(61,156,255,0.08)", border: "rgba(61,156,255,0.3)" },
  gray: { color: "#889397", bg: "rgba(255,255,255,0.04)", border: "#1C2D38" },
  scan: { color: "#00ED64", bg: "rgba(0,237,100,0.08)", border: "rgba(0,237,100,0.3)" },
  resolved: { color: "#00ED64", bg: "rgba(0,237,100,0.08)", border: "rgba(0,237,100,0.3)" },
};

function severityToPill(severity: string, status?: string): PillVariant {
  if (status === "approved" || status === "dismissed") return "resolved";
  if (severity === "critical") return "crit";
  if (severity === "high") return "high";
  if (severity === "medium") return "med";
  return "low";
}

function Pill({ variant, children, large }: { variant: PillVariant; children: React.ReactNode; large?: boolean }) {
  const s = pillStyles[variant];
  const isScan = variant === "scan";
  return (
    <span
      style={{
        fontSize: large ? 12 : 11,
        padding: large ? "6px 14px" : "4px 10px",
        borderRadius: large ? 5 : 4,
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
        gap: isScan ? 6 : undefined,
      }}
    >
      {isScan && (
        <span
          className="live-dot"
          style={{ width: 6, height: 6, borderRadius: "50%", background: "#00ED64" }}
        />
      )}
      {children}
    </span>
  );
}

// =============================================================================
// ICONS
// =============================================================================

function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5C6C75" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function ArrowLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// =============================================================================
// FILTER DROPDOWN
// =============================================================================

function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (val: string) => void;
}) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: "none",
          background: "transparent",
          border: "none",
          color: "#C5CDD3",
          fontSize: 13,
          cursor: "pointer",
          paddingRight: 16,
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} style={{ background: "#001E2B" }}>
            {label} {opt.label}
          </option>
        ))}
      </select>
      <span style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", color: "#5C6C75", fontSize: 10, pointerEvents: "none" }}>▾</span>
    </div>
  );
}

// =============================================================================
// ANOMALY CHART (for security findings)
// =============================================================================

function AnomalyChart({ finding }: { finding: Finding }) {
  const peakValue = finding.evidence.record_count
    ? Number(finding.evidence.record_count).toLocaleString()
    : "847k";
  const peakTime = finding.evidence.access_time
    ? String(finding.evidence.access_time).split("T")[1]?.substring(0, 5) || "2:47 AM"
    : "2:47 AM";

  return (
    <div style={{ marginTop: 40 }}>
      <svg viewBox="0 0 900 140" style={{ width: "100%", height: 140 }}>
        {/* Gridlines */}
        <line x1="0" y1="35" x2="900" y2="35" stroke="#0E2230" strokeWidth="0.5" />
        <line x1="0" y1="70" x2="900" y2="70" stroke="#0E2230" strokeWidth="0.5" />
        <line x1="0" y1="105" x2="900" y2="105" stroke="#0E2230" strokeWidth="0.5" />

        {/* Baseline (blue) - clear and prominent */}
        <polyline
          points="0,108 150,107 300,109 400,108 500,107 600,108 750,109 850,108 900,107"
          fill="none"
          stroke="#3D9CFF"
          strokeWidth="2"
        />

        {/* Anomaly spike area - increased opacity */}
        <polygon
          points="400,108 430,100 470,75 500,25 530,32 570,70 610,95 650,108 400,108"
          fill="#FF6960"
          opacity="0.15"
        />

        {/* Anomaly spike line */}
        <polyline
          points="400,108 430,100 470,75 500,25 530,32 570,70 610,95 650,108"
          fill="none"
          stroke="#FF6960"
          strokeWidth="2"
        />

        {/* Peak dot - 4px radius */}
        <circle cx="500" cy="25" r="4" fill="#FF6960" />

        {/* Annotation line */}
        <line x1="500" y1="25" x2="580" y2="12" stroke="#FF6960" strokeWidth="0.5" opacity="0.6" />

        {/* Annotation text */}
        <text x="590" y="16" fill="#FF6960" fontSize="11" fontFamily="ui-monospace, monospace">
          {peakValue} records · {peakTime}
        </text>

        {/* X-axis labels */}
        <text x="0" y="132" fill="#5C6C75" fontSize="10">00:00</text>
        <text x="220" y="132" fill="#5C6C75" fontSize="10">06:00</text>
        <text x="440" y="132" fill="#5C6C75" fontSize="10">12:00</text>
        <text x="660" y="132" fill="#5C6C75" fontSize="10">18:00</text>
        <text x="860" y="132" fill="#5C6C75" fontSize="10">now</text>

        {/* Legend */}
        <line x1="720" y1="10" x2="745" y2="10" stroke="#3D9CFF" strokeWidth="2" />
        <text x="752" y="14" fill="#5C6C75" fontSize="10">baseline</text>
        <line x1="810" y1="10" x2="835" y2="10" stroke="#FF6960" strokeWidth="2" />
        <text x="842" y="14" fill="#5C6C75" fontSize="10">anomaly</text>
      </svg>
    </div>
  );
}

// =============================================================================
// SAVINGS CALLOUT (for cost findings)
// =============================================================================

function SavingsCallout({ finding }: { finding: Finding }) {
  const monthly = finding.estimated_monthly_savings_usd ?? 0;
  const yearly = monthly * 12;

  return (
    <div
      style={{
        marginTop: 40,
        background: "linear-gradient(135deg, rgba(0,237,100,0.06) 0%, rgba(0,237,100,0.01) 100%)",
        border: "0.5px solid rgba(0,237,100,0.2)",
        borderRadius: 12,
        padding: "28px 36px",
      }}
    >
      <div style={{ fontSize: 11, color: "#5C6C75", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
        ADDRESSABLE SAVINGS
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 32 }}>
        {/* Monthly */}
        <div>
          <div style={{ fontSize: 40, fontWeight: 600, color: "#00ED64", lineHeight: 1.1 }}>
            ${monthly.toLocaleString()}
          </div>
          <div style={{ fontSize: 13, color: "#5C6C75", marginTop: 4 }}>per month</div>
        </div>

        {/* Vertical divider */}
        <div style={{ width: 1, height: 48, background: "rgba(0,237,100,0.2)" }} />

        {/* Annual */}
        <div>
          <div style={{ fontSize: 40, fontWeight: 600, color: "#FFFFFF", lineHeight: 1.1 }}>
            ${yearly.toLocaleString()}
          </div>
          <div style={{ fontSize: 13, color: "#5C6C75", marginTop: 4 }}>per year</div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// CURATED INSIGHTS (replaces raw reasoning trail)
// =============================================================================

function generateDefaultInsights(category: FindingCategory): { title: string; detail: string }[] {
  switch (category) {
    case "security":
      return [
        { title: "Anomaly detected", detail: "847,234 records read in 12 minutes, 340x above the rolling 7-day baseline for this collection." },
        { title: "IP not in allowlist", detail: "Source IP 185.220.x.x was cross-referenced against your configured allowlist. No match found." },
        { title: "GDPR-sensitive data", detail: "This collection is flagged as containing personally identifiable information subject to GDPR compliance." },
      ];
    case "cost":
      return [
        { title: "Spend anomaly", detail: "Current week's spend is 34% higher than the rolling 30-day average for this cluster." },
        { title: "Primary driver identified", detail: "Cross-region replication traffic accounts for 78% of the excess cost. EU queries are hitting the US primary." },
        { title: "Addressable savings", detail: "Routing EU queries to local read replica would eliminate $1,520/mo in data transfer fees." },
      ];
    case "query":
      return [
        { title: "Slow queries detected", detail: "12 queries exceeding 100ms threshold found over the past 48 hours." },
        { title: "Full collection scans", detail: "Queries performing COLLSCAN operations on collections with 10M+ documents." },
        { title: "Index recommendation", detail: "Adding compound index on { status, created_at } would reduce p99 latency from 2.4s to ~45ms." },
      ];
    case "backup":
      return [
        { title: "Over-provisioned backups", detail: "8 low-churn collections have hourly snapshots but less than 1% daily change rate." },
        { title: "Storage waste identified", detail: "Current snapshot frequency is 24x higher than necessary for these collections." },
        { title: "Cost reduction", detail: "Reducing snapshot frequency to daily would save $340/mo in backup storage." },
      ];
    case "data_quality":
      return [
        { title: "Schema drift detected", detail: "12% of recent documents have 'price' as string instead of number." },
        { title: "Likely upstream bug", detail: "Type inconsistency started 3 days ago, coinciding with recent deployment." },
        { title: "Downstream impact", detail: "Aggregation pipelines using $sum on price field will return incorrect results." },
      ];
    default:
      return [
        { title: "Metrics collected", detail: "Gathered performance and usage data from MongoDB Atlas monitoring." },
        { title: "Best practices check", detail: "Cross-referenced findings with MongoDB operational guidelines." },
        { title: "Recommendation", detail: "Produced actionable finding with supporting evidence." },
      ];
  }
}

function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#5C6C75"
      strokeWidth="2"
      style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CuratedInsights({ finding }: { finding: Finding }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const category = getCategoryType(finding.agent);

  // Filter reasoning trace to only agent/conclusion roles, or use defaults
  const insights = useMemo(() => {
    if (finding.reasoning_trace && finding.reasoning_trace.length > 0) {
      const filtered = finding.reasoning_trace.filter(
        (step) => step.role === "agent" || step.role === "conclusion"
      );
      // Take at most 5 curated steps
      const curated = filtered.slice(0, 5);
      if (curated.length > 0) {
        return curated.map((step) => ({
          title: step.content.split(".")[0]?.substring(0, 40) || "Analysis step",
          detail: step.content,
        }));
      }
    }
    return generateDefaultInsights(category);
  }, [finding.reasoning_trace, category]);

  const totalSteps = finding.reasoning_trace?.length ?? insights.length;

  const handleDownload = () => {
    const data = {
      finding_id: finding.id,
      title: finding.title,
      agent: finding.agent,
      reasoning_trace: finding.reasoning_trace || [],
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finding-${finding.id}-trace.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ marginTop: 32 }}>
      {/* Collapsed header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "14px 16px",
          background: "rgba(255,255,255,0.02)",
          border: "0.5px solid #1C2D38",
          borderRadius: 8,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 13, color: "#889397" }}>
          {totalSteps} analysis steps
          {!isExpanded && " - expand to see reasoning"}
        </span>
        <ChevronDown open={isExpanded} />
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {insights.map((insight, i) => (
              <div
                key={i}
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "0.5px solid #1C2D38",
                  borderRadius: 8,
                  padding: "14px 16px",
                }}
              >
                <div style={{ fontSize: 13, color: "#FFFFFF", fontWeight: 500, marginBottom: 4 }}>
                  {insight.title}
                </div>
                <div style={{ fontSize: 13, color: "#889397", lineHeight: 1.5 }}>
                  {insight.detail}
                </div>
              </div>
            ))}
          </div>

          {/* Download full trace link */}
          <button
            onClick={handleDownload}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 12,
              padding: 0,
              background: "transparent",
              border: "none",
              color: "#5C6C75",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <DownloadIcon />
            <span>Download full trace (JSON)</span>
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// CONFIRMATION MODAL
// =============================================================================

function ConfirmationModal({
  finding,
  actionLabel,
  command,
  onConfirm,
  onCancel,
}: {
  finding: Finding;
  actionLabel: string;
  command: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cluster = extractClusterFromFinding(finding);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "#001E2B",
          border: "0.5px solid #1C2D38",
          borderRadius: 12,
          padding: 32,
          maxWidth: 520,
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 11, color: "#5C6C75", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
          CONFIRM ACTION
        </div>
        <h3 style={{ fontSize: 20, color: "#FFFFFF", fontWeight: 500, margin: "0 0 20px 0" }}>
          {actionLabel}
        </h3>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "#5C6C75", marginBottom: 8 }}>Target cluster</div>
          <div style={{ fontSize: 14, color: "#FFFFFF", fontFamily: "ui-monospace, monospace" }}>
            {cluster}
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: "#5C6C75", marginBottom: 8 }}>Operation</div>
          <div
            style={{
              background: "rgba(0,0,0,0.3)",
              border: "0.5px solid #1C2D38",
              borderRadius: 6,
              padding: "12px 14px",
              fontSize: 13,
              fontFamily: "ui-monospace, monospace",
              color: "#C5CDD3",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {command}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "10px 20px",
              background: "transparent",
              border: "0.5px solid #1C2D38",
              borderRadius: 6,
              color: "#889397",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "10px 20px",
              background: "#00ED64",
              border: "none",
              borderRadius: 6,
              color: "#001E2B",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// DECISION SECTION (standardized 3-action pattern)
// =============================================================================

function getPrimaryAction(finding: Finding, category: FindingCategory): { label: string; command: string } {
  if (category === "security") {
    const ip = finding.evidence.source_ip || finding.evidence.ip || "unknown";
    return {
      label: "Block IP",
      command: `atlas accessList delete ${ip} --force\natlas alerts acknowledge ${finding.id}`,
    };
  }
  if (category === "cost") {
    if (finding.agent === "index_rationalization") {
      const index = finding.evidence.index_name || "unused_index";
      const collection = finding.evidence.collection || "collection";
      return {
        label: "Drop indexes",
        command: `db.${collection}.dropIndex("${index}")`,
      };
    }
    return {
      label: "Apply optimization",
      command: finding.recommendations?.[0] || "Apply recommended configuration change",
    };
  }
  if (category === "query") {
    const collection = finding.evidence.collection || "orders";
    const fields = finding.evidence.suggested_index || "{ status: 1, created_at: -1 }";
    return {
      label: "Create index",
      command: `db.${collection}.createIndex(${fields})`,
    };
  }
  if (category === "backup") {
    return {
      label: "Update policy",
      command: "Update snapshot frequency from hourly to daily",
    };
  }
  return {
    label: "Apply fix",
    command: finding.recommendations?.[0] || "Apply recommended change",
  };
}

function DecisionSection({
  finding,
  onDecision,
  completedAction,
  onShowConfirmation,
}: {
  finding: Finding;
  onDecision: (status: FindingStatus) => void;
  completedAction: string | null;
  onShowConfirmation: () => void;
}) {
  const category = getCategoryType(finding.agent);
  const primaryAction = getPrimaryAction(finding, category);

  const handleReviewInAtlas = () => {
    window.open("https://cloud.mongodb.com", "_blank");
  };

  const actions = [
    {
      id: "primary",
      icon: <CheckIcon />,
      iconBg: "rgba(0,237,100,0.15)",
      iconColor: "#00ED64",
      title: primaryAction.label,
      description: "Execute the recommended action",
      isPrimary: true,
      onClick: onShowConfirmation,
    },
    {
      id: "review",
      icon: <EyeIcon />,
      iconBg: "rgba(136,147,151,0.1)",
      iconColor: "#889397",
      title: "Review in Atlas",
      description: "Open cluster in MongoDB Atlas",
      isPrimary: false,
      onClick: handleReviewInAtlas,
    },
    {
      id: "dismiss",
      icon: <XIcon />,
      iconBg: "rgba(136,147,151,0.1)",
      iconColor: "#889397",
      title: "Dismiss",
      description: "Not applicable or will handle manually",
      isPrimary: false,
      onClick: () => onDecision("dismissed"),
    },
  ];

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ fontSize: 11, color: "#5C6C75", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>
        YOUR CALL
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {actions.map((action) => {
          const isCompleted = completedAction === action.id;
          const isDisabled = completedAction !== null && !isCompleted;

          return (
            <button
              key={action.id}
              onClick={() => !isDisabled && action.onClick()}
              disabled={isDisabled}
              style={{
                width: "100%",
                padding: "16px 18px",
                border: isCompleted
                  ? "0.5px solid rgba(0,237,100,0.4)"
                  : action.isPrimary
                  ? "0.5px solid rgba(0,237,100,0.3)"
                  : "0.5px solid #1C2D38",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                gap: 14,
                cursor: isDisabled ? "default" : "pointer",
                transition: "all 0.15s",
                background: isCompleted
                  ? "rgba(0,237,100,0.08)"
                  : action.isPrimary
                  ? "rgba(0,237,100,0.04)"
                  : "transparent",
                textAlign: "left",
                opacity: isDisabled ? 0.4 : 1,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: isCompleted ? "rgba(0,237,100,0.15)" : action.iconBg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: isCompleted ? "#00ED64" : action.iconColor,
                  flexShrink: 0,
                }}
              >
                {isCompleted ? <CheckIcon /> : action.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: "#FFFFFF", fontWeight: 500, lineHeight: 1.4 }}>
                  {isCompleted ? "Done" : action.title}
                </div>
                <div style={{ fontSize: 12, color: "#5C6C75", marginTop: 2, lineHeight: 1.4 }}>
                  {isCompleted ? "Status updated" : action.description}
                </div>
              </div>
              {!isCompleted && !isDisabled && (
                <span style={{ color: action.isPrimary ? "#00ED64" : "#5C6C75", fontSize: 16 }}>→</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// NARRATIVE - renders finding.summary directly
// =============================================================================

function Narrative({ finding }: { finding: Finding }) {
  return (
    <p style={{ fontSize: 16, color: "#C5CDD3", lineHeight: 1.8, margin: 0 }}>
      {finding.summary}
    </p>
  );
}

// =============================================================================
// DETAIL VIEW
// =============================================================================

function HelpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" />
    </svg>
  );
}

function DetailView({
  finding,
  items,
  onBack,
  onDecision,
  onNavigate,
}: {
  finding: Finding;
  items: Finding[];
  onBack: () => void;
  onDecision: (id: string, status: FindingStatus) => Promise<void>;
  onNavigate: (id: string) => void;
}) {
  const [completedAction, setCompletedAction] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState(finding.status);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showHelpTooltip, setShowHelpTooltip] = useState(false);

  const category = getCategoryType(finding.agent);
  const cluster = extractClusterFromFinding(finding);
  const openFindings = items.filter((f) => f.status === "new" || f.status === "acknowledged");
  const currentIndex = openFindings.findIndex((f) => f.id === finding.id);
  const total = openFindings.length;
  const primaryAction = getPrimaryAction(finding, category);

  // Reset state when finding changes
  useEffect(() => {
    setCompletedAction(null);
    setLocalStatus(finding.status);
    setShowConfirmation(false);
  }, [finding.id, finding.status]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (showConfirmation) return; // Don't navigate while modal is open
      if (e.key === "j" && currentIndex < total - 1) {
        onNavigate(openFindings[currentIndex + 1].id);
      }
      if (e.key === "k" && currentIndex > 0) {
        onNavigate(openFindings[currentIndex - 1].id);
      }
      if (e.key === "Escape") {
        onBack();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentIndex, total, openFindings, onNavigate, onBack, showConfirmation]);

  const handleDecision = async (status: FindingStatus) => {
    const actionId = status === "approved" ? "primary" : status === "dismissed" ? "dismiss" : "snooze";
    setCompletedAction(actionId);
    setLocalStatus(status);
    await onDecision(finding.id, status);
  };

  const handleConfirm = async () => {
    setShowConfirmation(false);
    await handleDecision("approved");
  };

  const displayStatus = localStatus === "approved" ? "resolved" : localStatus === "dismissed" ? "dismissed" : finding.severity;

  return (
    <div>
      {/* Confirmation Modal */}
      {showConfirmation && (
        <ConfirmationModal
          finding={finding}
          actionLabel={primaryAction.label}
          command={primaryAction.command}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirmation(false)}
        />
      )}

      {/* Back bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 32,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={onBack}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
              border: "none",
              color: "#00ED64",
              fontSize: 14,
              cursor: "pointer",
              padding: 0,
            }}
          >
            <ArrowLeft />
            All findings
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Help tooltip trigger */}
          <div style={{ position: "relative" }}>
            <button
              onMouseEnter={() => setShowHelpTooltip(true)}
              onMouseLeave={() => setShowHelpTooltip(false)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                background: "transparent",
                border: "0.5px solid #1C2D38",
                borderRadius: 6,
                color: "#5C6C75",
                cursor: "pointer",
              }}
            >
              <HelpIcon />
            </button>
            {showHelpTooltip && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: 8,
                  padding: "10px 14px",
                  background: "#0D2436",
                  border: "0.5px solid #1C2D38",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "#889397",
                  whiteSpace: "nowrap",
                  zIndex: 100,
                }}
              >
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: "#C5CDD3", fontFamily: "ui-monospace, monospace" }}>J</span> / <span style={{ color: "#C5CDD3", fontFamily: "ui-monospace, monospace" }}>K</span> - Navigate findings
                </div>
                <div>
                  <span style={{ color: "#C5CDD3", fontFamily: "ui-monospace, monospace" }}>Esc</span> - Back to list
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div>
        {/* Header */}
        <div>
          <Pill variant={severityToPill(displayStatus, localStatus)} large>
            {localStatus === "approved" ? "Resolved" : localStatus === "dismissed" ? "Dismissed" : finding.severity}
          </Pill>
          <h1
            style={{
              fontSize: 28,
              color: "#FFFFFF",
              fontWeight: 500,
              lineHeight: 1.3,
              marginTop: 16,
              marginBottom: 0,
            }}
          >
            {finding.title}
          </h1>
          <div style={{ fontSize: 13, color: "#889397", marginTop: 10, lineHeight: 1.5 }}>
            <span
              style={{
                fontFamily: "ui-monospace, monospace",
                color: finding.severity === "critical" && localStatus === "new" ? "#FF6960" : "#889397",
              }}
            >
              {cluster}
            </span>
            {" · "}
            {categoryOf(finding.agent).label}
            {" · "}
            {timeAgo(finding.created_at)}
          </div>
        </div>

        {/* Narrative */}
        <div style={{ marginTop: 28, maxWidth: 680 }}>
          <Narrative finding={finding} />
        </div>

        {/* Chart / Visual */}
        {category === "security" && <AnomalyChart finding={finding} />}
        {category === "cost" && <SavingsCallout finding={finding} />}

        {/* Actions FIRST - above the fold */}
        <DecisionSection
          finding={finding}
          onDecision={handleDecision}
          completedAction={completedAction}
          onShowConfirmation={() => setShowConfirmation(true)}
        />

        {/* Reasoning trace - collapsed by default */}
        <CuratedInsights finding={finding} />
      </div>
    </div>
  );
}

// =============================================================================
// LIST VIEW
// =============================================================================

type StatusTab = "open" | "snoozed" | "resolved" | "dismissed";

function ListView({
  items,
  onSelect,
}: {
  items: Finding[];
  onSelect: (id: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<StatusTab>("open");
  const [filters, setFilters] = useState({
    search: "",
    severity: "all",
    category: "all",
    cluster: "all",
    sort: "impact",
  });

  const openItems = items.filter((f) => f.status === "new" || f.status === "acknowledged");
  const snoozedCount = 2;
  const resolvedCount = items.filter((f) => f.status === "approved").length || 14;
  const dismissedCount = items.filter((f) => f.status === "dismissed").length || 3;

  const filteredItems = useMemo(() => {
    let result = activeTab === "open" ? openItems : items.filter((f) => {
      if (activeTab === "snoozed") return f.status === "acknowledged";
      if (activeTab === "resolved") return f.status === "approved";
      if (activeTab === "dismissed") return f.status === "dismissed";
      return true;
    });

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((f) => f.title.toLowerCase().includes(q) || f.summary.toLowerCase().includes(q));
    }
    if (filters.severity !== "all") {
      result = result.filter((f) => f.severity === filters.severity);
    }
    if (filters.category !== "all") {
      result = result.filter((f) => f.agent === filters.category);
    }

    if (filters.sort === "impact") {
      result = [...result].sort((a, b) => {
        const sevDiff = (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
        if (sevDiff !== 0) return sevDiff;
        return (b.estimated_monthly_savings_usd ?? 0) - (a.estimated_monthly_savings_usd ?? 0);
      });
    } else if (filters.sort === "newest") {
      result = [...result].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (filters.sort === "savings") {
      result = [...result].sort((a, b) => (b.estimated_monthly_savings_usd ?? 0) - (a.estimated_monthly_savings_usd ?? 0));
    }

    return result;
  }, [items, activeTab, openItems, filters]);

  const totalSavings = filteredItems.reduce((sum, f) => sum + (f.estimated_monthly_savings_usd ?? 0), 0);

  const clusters = useMemo(() => {
    const set = new Set<string>();
    items.forEach((f) => set.add(extractClusterFromFinding(f)));
    return Array.from(set);
  }, [items]);

  const tabStyle = (isActive: boolean) => ({
    padding: "14px 18px",
    fontSize: 14,
    color: isActive ? "#FFFFFF" : "#889397",
    background: "transparent",
    border: "none",
    borderBottom: isActive ? "2px solid #00ED64" : "2px solid transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 10,
  });

  return (
    <div>
      <div
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "0.5px solid #112733",
          borderRadius: 12,
        }}
      >
        {/* Status tabs */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "0.5px solid #0E2230",
            padding: "0 24px",
          }}
        >
          <div style={{ display: "flex" }}>
            <button style={tabStyle(activeTab === "open")} onClick={() => setActiveTab("open")}>
              Open
              <span
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: "rgba(255,105,96,0.1)",
                  color: "#FF6960",
                  border: "0.5px solid rgba(255,105,96,0.3)",
                }}
              >
                {openItems.length}
              </span>
            </button>
            <button style={tabStyle(activeTab === "snoozed")} onClick={() => setActiveTab("snoozed")}>
              Snoozed
              <span style={{ fontSize: 11, color: "#5C6C75" }}>{snoozedCount}</span>
            </button>
            <button style={tabStyle(activeTab === "resolved")} onClick={() => setActiveTab("resolved")}>
              Resolved
              <span style={{ fontSize: 11, color: "#5C6C75" }}>{resolvedCount}</span>
            </button>
            <button style={tabStyle(activeTab === "dismissed")} onClick={() => setActiveTab("dismissed")}>
              Dismissed
              <span style={{ fontSize: 11, color: "#5C6C75" }}>{dismissedCount}</span>
            </button>
          </div>
          <div style={{ fontSize: 13, color: "#00ED64" }}>
            Saved $3,460/mo this month
          </div>
        </div>

        {/* Filter bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: "14px 24px",
            background: "rgba(0, 0, 0, 0.15)",
            borderBottom: "0.5px solid #0E2230",
          }}
        >
          <div style={{ position: "relative", width: 240 }}>
            <input
              type="text"
              placeholder="Search findings..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              style={{
                width: "100%",
                padding: "10px 14px",
                paddingRight: 50,
                background: "rgba(255,255,255,0.04)",
                border: "0.5px solid #1C2D38",
                borderRadius: 8,
                color: "#C5CDD3",
                fontSize: 13,
                outline: "none",
              }}
            />
            <span
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 11,
                color: "#5C6C75",
                background: "#112733",
                padding: "3px 6px",
                borderRadius: 4,
              }}
            >
              ⌘K
            </span>
          </div>

          <FilterDropdown
            label="Severity"
            value={filters.severity}
            options={[
              { value: "all", label: "all" },
              { value: "critical", label: "critical" },
              { value: "high", label: "high" },
              { value: "medium", label: "medium" },
              { value: "low", label: "low" },
            ]}
            onChange={(val) => setFilters({ ...filters, severity: val })}
          />

          <FilterDropdown
            label="Category"
            value={filters.category}
            options={[
              { value: "all", label: "all" },
              { value: "security", label: "security" },
              { value: "spend", label: "cost" },
              { value: "slow_query", label: "query" },
              { value: "backup", label: "backup" },
              { value: "index_rationalization", label: "index" },
              { value: "data_quality", label: "data quality" },
            ]}
            onChange={(val) => setFilters({ ...filters, category: val })}
          />

          <FilterDropdown
            label="Cluster"
            value={filters.cluster}
            options={[{ value: "all", label: "all" }, ...clusters.map((c) => ({ value: c, label: c }))]}
            onChange={(val) => setFilters({ ...filters, cluster: val })}
          />

          <button
            style={{
              background: "transparent",
              border: "none",
              color: "#00ED64",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            + Add filter
          </button>

          <div style={{ flex: 1 }} />

          <FilterDropdown
            label="Sort"
            value={filters.sort}
            options={[
              { value: "impact", label: "impact" },
              { value: "newest", label: "newest" },
              { value: "savings", label: "savings" },
            ]}
            onChange={(val) => setFilters({ ...filters, sort: val })}
          />
        </div>

        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "16px 85px minmax(0, 1fr) 100px 130px 16px",
            gap: 16,
            padding: "12px 24px",
            borderBottom: "0.5px solid #0E2230",
          }}
        >
          <div />
          <div style={{ fontSize: 11, color: "#5C6C75", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Severity
          </div>
          <div style={{ fontSize: 11, color: "#5C6C75", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Finding
          </div>
          <div style={{ fontSize: 11, color: "#5C6C75", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Category
          </div>
          <div style={{ fontSize: 11, color: "#5C6C75", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>
            Impact
          </div>
          <div />
        </div>

        {/* Table rows */}
        <div>
          {filteredItems.map((f) => {
            const clusterName = extractClusterFromFinding(f);
            const hasSavings = f.estimated_monthly_savings_usd && f.estimated_monthly_savings_usd > 0;

            return (
              <div
                key={f.id}
                className="find-row"
                onClick={() => onSelect(f.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "16px 85px minmax(0, 1fr) 100px 130px 16px",
                  gap: 16,
                  padding: "16px 24px",
                  cursor: "pointer",
                  borderBottom: "0.5px solid #0E2230",
                  alignItems: "center",
                }}
              >
                {/* Severity dot */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <span
                    className={f.severity === "critical" ? "dot-crit" : ""}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background:
                        f.severity === "critical" || f.severity === "high"
                          ? "#FF6960"
                          : f.severity === "medium"
                          ? "#FFC010"
                          : "#889397",
                      boxShadow:
                        f.severity === "critical"
                          ? "0 0 10px rgba(255,105,96,0.5)"
                          : "none",
                    }}
                  />
                </div>

                {/* Severity pill */}
                <div>
                  <Pill variant={severityToPill(f.severity)}>{f.severity}</Pill>
                </div>

                {/* Title + meta */}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 15,
                      color: "#FFFFFF",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      lineHeight: 1.4,
                    }}
                  >
                    {f.title}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#5C6C75",
                      fontFamily: "ui-monospace, monospace",
                      marginTop: 4,
                    }}
                  >
                    {clusterName} · detected {timeAgo(f.created_at)}
                  </div>
                </div>

                {/* Category */}
                <div style={{ fontSize: 12, color: "#5C6C75" }}>
                  {categoryOf(f.agent).label}
                </div>

                {/* Impact - always show savings if available, otherwise show "-" */}
                <div style={{ textAlign: "right" }}>
                  {hasSavings ? (
                    <span style={{ fontSize: 14, color: "#00ED64", fontWeight: 500 }}>
                      ${f.estimated_monthly_savings_usd!.toLocaleString()}/mo
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: "#5C6C75" }}>-</span>
                  )}
                </div>

                {/* Chevron */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <ChevronRight />
                </div>
              </div>
            );
          })}

          {filteredItems.length === 0 && (
            <div style={{ padding: "48px 24px", textAlign: "center", color: "#5C6C75", fontSize: 14 }}>
              No findings match your filters.
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 24px",
            borderTop: "0.5px solid #0E2230",
            fontSize: 13,
          }}
        >
          <span style={{ color: "#5C6C75" }}>
            Showing <span style={{ color: "#C5CDD3" }}>{filteredItems.length}</span> of{" "}
            <span style={{ color: "#C5CDD3" }}>{activeTab === "open" ? openItems.length : filteredItems.length}</span> {activeTab} ·{" "}
            <span style={{ color: "#00ED64" }}>${totalSavings.toLocaleString()}/mo total addressable savings</span>
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#5C6C75" }}>Items per page</span>
            <select
              style={{
                background: "transparent",
                border: "0.5px solid #1C2D38",
                borderRadius: 6,
                color: "#C5CDD3",
                fontSize: 13,
                padding: "6px 10px",
              }}
            >
              <option value="25" style={{ background: "#001E2B" }}>25</option>
              <option value="50" style={{ background: "#001E2B" }}>50</option>
              <option value="100" style={{ background: "#001E2B" }}>100</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

export function Findings() {
  const [items, setItems] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showResetToast, setShowResetToast] = useState(false);
  const [toastFading, setToastFading] = useState(false);
  const resetPresses = useRef<number[]>([]);

  const selectedId = searchParams.get("selected");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.findings.list();
      setItems(data);
      setErr(null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load findings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Hidden demo reset: Shift+R three times within 2 seconds
  useEffect(() => {
    async function resetDemo() {
      try {
        await api.settings.resetDemo();
        const refreshed = await api.findings.list();
        setItems(refreshed);
        setSearchParams({});
        setShowResetToast(true);
        setToastFading(false);
        setTimeout(() => {
          setToastFading(true);
          setTimeout(() => setShowResetToast(false), 300);
        }, 1700);
      } catch (e) {
        console.error("Failed to reset demo:", e);
      }
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "R" && e.shiftKey) {
        const now = Date.now();
        resetPresses.current.push(now);
        resetPresses.current = resetPresses.current.filter((t) => now - t < 2000);
        if (resetPresses.current.length >= 3) {
          resetPresses.current = [];
          resetDemo();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSearchParams]);

  const selectedFinding = selectedId ? items.find((f) => f.id === selectedId) : null;

  useEffect(() => {
    if (selectedId && !selectedFinding && items.length > 0 && !loading) {
      setSearchParams({});
    }
  }, [selectedId, selectedFinding, items.length, loading, setSearchParams]);

  async function handleDecision(id: string, status: FindingStatus) {
    try {
      await api.findings.setStatus(id, status);
      // Update local state without navigating away
      const updated = await api.findings.list();
      setItems(updated);
    } catch (e: unknown) {
      console.error("Failed to update status:", e);
    }
  }

  if (loading && items.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "#889397", fontSize: 15 }}>
        Loading findings...
      </div>
    );
  }

  if (err && items.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "#FF6960", fontSize: 15 }}>
        {err}
      </div>
    );
  }

  const clusterCount = new Set(items.map(extractClusterFromFinding)).size;

  return (
    <>
      <style>{animationStyles}</style>

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Page header (only show in list view) */}
        {!selectedFinding && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 28,
            }}
          >
            <div>
              <h1 style={{ fontSize: 24, color: "#FFFFFF", fontWeight: 500, margin: 0 }}>
                Findings
              </h1>
              <p style={{ fontSize: 14, color: "#889397", marginTop: 6, lineHeight: 1.5 }}>
                Triage what MDBA found across your {clusterCount} clusters
              </p>
            </div>
{/* Status removed - was confusing ("Live scanning" without context) */}
          </div>
        )}

        {selectedFinding ? (
          <DetailView
            finding={selectedFinding}
            items={items}
            onBack={() => setSearchParams({})}
            onDecision={handleDecision}
            onNavigate={(id) => setSearchParams({ selected: id })}
          />
        ) : (
          <ListView items={items} onSelect={(id) => setSearchParams({ selected: id })} />
        )}
      </div>

      {/* Hidden reset toast */}
      {showResetToast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 11,
            background: "rgba(0,237,100,0.08)",
            border: "0.5px solid rgba(0,237,100,0.3)",
            color: "#00ED64",
            padding: "8px 16px",
            borderRadius: 9999,
            opacity: toastFading ? 0 : 1,
            transition: "opacity 0.3s ease",
            zIndex: 9999,
          }}
        >
          Demo reset - all findings restored
        </div>
      )}
    </>
  );
}
