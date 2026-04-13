import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/api";
import type { Finding, FindingStatus } from "@/types";
import { Pill, severityToVariant, type PillVariant } from "@/components/Pill";
import { TabBar, type Tab } from "@/components/TabBar";
import { PageContainer, PageHeader, TableContainer, TableFooter } from "@/components/PageContainer";
import { FilterBar, FilterDropdown, SearchInput, FilterSpacer } from "@/components/FilterBar";

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
      className={`transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" />
    </svg>
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
    <div className="mt-10 w-full">
      <svg
        viewBox="0 0 900 160"
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
        style={{ minHeight: "160px", maxHeight: "200px" }}
      >
        {/* Gridlines */}
        <line x1="0" y1="35" x2="900" y2="35" stroke="#0E2230" strokeWidth="0.5" />
        <line x1="0" y1="70" x2="900" y2="70" stroke="#0E2230" strokeWidth="0.5" />
        <line x1="0" y1="105" x2="900" y2="105" stroke="#0E2230" strokeWidth="0.5" />

        {/* Baseline (blue) */}
        <polyline
          points="0,108 150,107 300,109 400,108 500,107 600,108 750,109 850,108 900,107"
          fill="none"
          stroke="#3D9CFF"
          strokeWidth="2"
        />

        {/* Anomaly spike area */}
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

        {/* Peak dot */}
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

        {/* Legend - positioned below x-axis */}
        <line x1="720" y1="152" x2="745" y2="152" stroke="#3D9CFF" strokeWidth="2" />
        <text x="752" y="155" fill="#5C6C75" fontSize="10">baseline</text>
        <line x1="810" y1="152" x2="835" y2="152" stroke="#FF6960" strokeWidth="2" />
        <text x="842" y="155" fill="#5C6C75" fontSize="10">anomaly</text>
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
    <div className="mt-10 bg-gradient-to-br from-mdb-leaf/[0.06] to-mdb-leaf/[0.01] border-[0.5px] border-mdb-leaf/20 rounded-xl p-7">
      <div className="text-[11px] text-[#5C6C75] tracking-wider uppercase mb-4">
        ADDRESSABLE SAVINGS
      </div>
      <div className="flex items-baseline gap-8">
        <div>
          <div className="text-[40px] font-semibold text-mdb-leaf leading-tight">
            ${monthly.toLocaleString()}
          </div>
          <div className="text-[13px] text-[#5C6C75] mt-1">per month</div>
        </div>
        <div className="w-px h-12 bg-mdb-leaf/20" />
        <div>
          <div className="text-[40px] font-semibold text-white leading-tight">
            ${yearly.toLocaleString()}
          </div>
          <div className="text-[13px] text-[#5C6C75] mt-1">per year</div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// CURATED INSIGHTS
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

function CuratedInsights({ finding }: { finding: Finding }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const category = getCategoryType(finding.agent);

  const insights = useMemo(() => {
    if (finding.reasoning_trace && finding.reasoning_trace.length > 0) {
      const conclusion = finding.reasoning_trace.find((s) => s.role === "conclusion");
      const agentSteps = finding.reasoning_trace.filter((s) => s.role === "agent");
      const selected = [
        agentSteps[0],
        agentSteps[Math.floor(agentSteps.length / 2)],
        conclusion,
      ].filter(Boolean);
      if (selected.length > 0) {
        return selected.map((step) => step!.content);
      }
    }
    return generateDefaultInsights(category).map((i) => i.detail);
  }, [finding.reasoning_trace, category]);

  const totalSteps = finding.reasoning_trace?.length ?? 0;

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
    <div className="mt-8">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center gap-3 w-full p-3.5 rounded-lg border-[0.5px] cursor-pointer text-left transition-all ${
          isExpanded
            ? "bg-[#3D9CFF]/[0.04] border-[#3D9CFF]/20"
            : "bg-transparent border-[#1C2D38] hover:border-[#3D9CFF]/20"
        }`}
      >
        <div className="w-7 h-7 rounded-md bg-[#3D9CFF]/10 flex items-center justify-center text-[#3D9CFF]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
        </div>
        <span className={`flex-1 text-[13px] ${isExpanded ? "text-[#C5CDD3]" : "text-[#889397]"}`}>
          {isExpanded ? "Analysis trace" : "Analysis steps - click to see how MDBA reached this conclusion"}
        </span>
        <ChevronDown open={isExpanded} />
      </button>

      {isExpanded && (
        <div className="mt-4 ml-3.5 pl-5 border-l-2 border-[#3D9CFF]/20">
          {insights.slice(0, 3).map((content, i) => (
            <div key={i} className={`relative ${i < insights.length - 1 ? "pb-5" : ""}`}>
              <div
                className={`absolute -left-[26px] top-1 w-2.5 h-2.5 rounded-full border-2 border-[#001E2B] ${
                  i === insights.length - 1 ? "bg-mdb-leaf" : "bg-[#3D9CFF]"
                }`}
              />
              <p className="text-[13px] text-[#C5CDD3] leading-relaxed">{content}</p>
            </div>
          ))}

          {totalSteps > 0 && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 mt-4 text-xs text-[#5C6C75] hover:text-[#889397] transition-colors"
            >
              <DownloadIcon />
              <span>Full trace ({totalSteps} steps)</span>
            </button>
          )}
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
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000]"
      onClick={onCancel}
    >
      <div
        className="bg-[#001E2B] border-[0.5px] border-[#1C2D38] rounded-xl p-8 max-w-[520px] w-[90%]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[11px] text-[#5C6C75] tracking-wider uppercase mb-3">
          CONFIRM ACTION
        </div>
        <h3 className="text-xl text-white font-medium mb-5">{actionLabel}</h3>

        <div className="mb-5">
          <div className="text-xs text-[#5C6C75] mb-2">Target cluster</div>
          <div className="text-sm text-white font-mono">{cluster}</div>
        </div>

        <div className="mb-6">
          <div className="text-xs text-[#5C6C75] mb-2">Operation</div>
          <div className="bg-black/30 border-[0.5px] border-[#1C2D38] rounded-md p-3.5 text-[13px] font-mono text-[#C5CDD3] leading-relaxed whitespace-pre-wrap break-all">
            {command}
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 bg-transparent border-[0.5px] border-[#1C2D38] rounded-md text-[#889397] text-sm hover:bg-white/[0.02] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2.5 bg-mdb-leaf border-none rounded-md text-[#001E2B] text-sm font-medium hover:bg-mdb-leaf/90 transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// DECISION SECTION
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
      iconBg: "bg-mdb-leaf/15",
      iconColor: "text-mdb-leaf",
      title: primaryAction.label,
      description: "Execute the recommended action",
      isPrimary: true,
      onClick: onShowConfirmation,
    },
    {
      id: "review",
      icon: <EyeIcon />,
      iconBg: "bg-[#889397]/10",
      iconColor: "text-[#889397]",
      title: "Review in Atlas",
      description: "Open cluster in MongoDB Atlas",
      isPrimary: false,
      onClick: handleReviewInAtlas,
    },
    {
      id: "dismiss",
      icon: <XIcon />,
      iconBg: "bg-[#889397]/10",
      iconColor: "text-[#889397]",
      title: "Dismiss",
      description: "Not applicable or will handle manually",
      isPrimary: false,
      onClick: () => onDecision("dismissed"),
    },
  ];

  return (
    <div className="mt-8" data-tour="decision-section">
      <div className="text-[11px] text-[#5C6C75] tracking-wider uppercase mb-3.5">
        YOUR CALL
      </div>
      <div className="flex flex-col gap-2.5">
        {actions.map((action) => {
          const isCompleted = completedAction === action.id;
          const isDisabled = completedAction !== null && !isCompleted;

          return (
            <button
              key={action.id}
              onClick={() => !isDisabled && action.onClick()}
              disabled={isDisabled}
              className={`w-full p-4 border-[0.5px] rounded-lg flex items-center gap-3.5 text-left transition-all ${
                isCompleted
                  ? "border-mdb-leaf/40 bg-mdb-leaf/[0.08]"
                  : action.isPrimary
                    ? "border-mdb-leaf/30 bg-mdb-leaf/[0.04] hover:bg-mdb-leaf/[0.08]"
                    : "border-[#1C2D38] hover:bg-white/[0.02]"
              } ${isDisabled ? "opacity-40 cursor-default" : "cursor-pointer"}`}
            >
              <div
                className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                  isCompleted ? "bg-mdb-leaf/15 text-mdb-leaf" : `${action.iconBg} ${action.iconColor}`
                }`}
              >
                {isCompleted ? <CheckIcon /> : action.icon}
              </div>
              <div className="flex-1">
                <div className="text-sm text-white font-medium">
                  {isCompleted ? "Done" : action.title}
                </div>
                <div className="text-xs text-[#5C6C75] mt-0.5">
                  {isCompleted ? "Status updated" : action.description}
                </div>
              </div>
              {!isCompleted && !isDisabled && (
                <span className={`text-base ${action.isPrimary ? "text-mdb-leaf" : "text-[#5C6C75]"}`}>→</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// DETAIL VIEW
// =============================================================================

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

  useEffect(() => {
    setCompletedAction(null);
    setLocalStatus(finding.status);
    setShowConfirmation(false);
  }, [finding.id, finding.status]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (showConfirmation) return;
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

  const pillVariant: PillVariant = localStatus === "approved" || localStatus === "dismissed" ? "success" : severityToVariant(finding.severity);

  return (
    <div data-tour="finding-detail">
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
      <div className="flex justify-between items-center mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-mdb-leaf text-sm hover:underline"
        >
          <ArrowLeft />
          All findings
        </button>
        <div className="relative">
          <button
            onMouseEnter={() => setShowHelpTooltip(true)}
            onMouseLeave={() => setShowHelpTooltip(false)}
            className="w-7 h-7 flex items-center justify-center border-[0.5px] border-[#1C2D38] rounded-md text-[#5C6C75] hover:text-[#889397] transition-colors"
          >
            <HelpIcon />
          </button>
          {showHelpTooltip && (
            <div className="absolute top-full right-0 mt-2 p-3 bg-[#0D2436] border-[0.5px] border-[#1C2D38] rounded-md text-xs text-[#889397] whitespace-nowrap z-50">
              <div className="mb-1.5">
                <span className="text-[#C5CDD3] font-mono">J</span> / <span className="text-[#C5CDD3] font-mono">K</span> - Navigate findings
              </div>
              <div>
                <span className="text-[#C5CDD3] font-mono">Esc</span> - Back to list
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div>
        <Pill variant={pillVariant} size="md">
          {localStatus === "approved" ? "Resolved" : localStatus === "dismissed" ? "Dismissed" : finding.severity}
        </Pill>
        <h1 className="text-[28px] text-white font-medium leading-tight mt-4">
          {finding.title}
        </h1>
        <div className="text-[13px] text-[#889397] mt-2.5">
          <span className={`font-mono ${finding.severity === "critical" && localStatus === "new" ? "text-[#FF6960]" : ""}`}>
            {cluster}
          </span>
          {" · "}
          {categoryOf(finding.agent).label}
          {" · "}
          {timeAgo(finding.created_at)}
        </div>

        {/* Summary */}
        <div className="mt-7 max-w-[680px]">
          <p className="text-base text-[#C5CDD3] leading-relaxed">
            {finding.summary}
          </p>
        </div>

        {/* Chart / Visual */}
        {category === "security" && <AnomalyChart finding={finding} />}
        {category === "cost" && <SavingsCallout finding={finding} />}

        {/* Actions */}
        <DecisionSection
          finding={finding}
          onDecision={handleDecision}
          completedAction={completedAction}
          onShowConfirmation={() => setShowConfirmation(true)}
        />

        {/* Reasoning trace */}
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
  const snoozedCount = items.filter((f) => f.status === "acknowledged").length;
  const resolvedCount = items.filter((f) => f.status === "approved").length;
  const dismissedCount = items.filter((f) => f.status === "dismissed").length;

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
    if (filters.cluster !== "all") {
      result = result.filter((f) => extractClusterFromFinding(f) === filters.cluster);
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

  const tabs: Tab<StatusTab>[] = [
    { key: "open", label: "Open", count: openItems.length, countVariant: "warning" },
    { key: "snoozed", label: "Snoozed", count: snoozedCount },
    { key: "resolved", label: "Resolved", count: resolvedCount },
    { key: "dismissed", label: "Dismissed", count: dismissedCount },
  ];

  const gridCols = "16px 85px minmax(0,1fr) 100px 130px 16px";

  return (
    <TableContainer>
      {/* Tabs */}
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        rightContent={
          <span className="text-[13px] text-mdb-leaf">
            Saved $3,460/mo this month
          </span>
        }
        className="px-6"
      />

      {/* Filter bar */}
      <FilterBar>
        <SearchInput
          value={filters.search}
          onChange={(val) => setFilters({ ...filters, search: val })}
          placeholder="Search findings..."
        />

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

        <FilterSpacer />

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
      </FilterBar>

      {/* Table header */}
      <div
        className="grid gap-4 px-6 py-3 border-b border-[#0E2230]"
        style={{ gridTemplateColumns: gridCols }}
      >
        <div />
        <div className="text-[11px] text-[#5C6C75] uppercase tracking-wide">Severity</div>
        <div className="text-[11px] text-[#5C6C75] uppercase tracking-wide">Finding</div>
        <div className="text-[11px] text-[#5C6C75] uppercase tracking-wide">Category</div>
        <div className="text-[11px] text-[#5C6C75] uppercase tracking-wide text-right">Impact</div>
        <div />
      </div>

      {/* Table rows */}
      <div>
        {filteredItems.map((f, index) => {
          const clusterName = extractClusterFromFinding(f);
          const hasSavings = f.estimated_monthly_savings_usd && f.estimated_monthly_savings_usd > 0;

          return (
            <div
              key={f.id}
              onClick={() => onSelect(f.id)}
              data-tour={index === 0 ? "finding-row-0" : undefined}
              className="grid gap-4 px-6 py-4 items-center border-b border-[#0E2230] cursor-pointer hover:bg-white/[0.025] transition-colors"
              style={{ gridTemplateColumns: gridCols }}
            >
              {/* Severity dot */}
              <div className="flex justify-center">
                <span
                  className={`w-[7px] h-[7px] rounded-full ${f.severity === "critical" ? "animate-pulse" : ""}`}
                  style={{
                    background:
                      f.severity === "critical" || f.severity === "high"
                        ? "#FF6960"
                        : f.severity === "medium"
                          ? "#FFC010"
                          : "#889397",
                    boxShadow: f.severity === "critical" ? "0 0 10px rgba(255,105,96,0.5)" : "none",
                  }}
                />
              </div>

              {/* Severity pill */}
              <Pill variant={severityToVariant(f.severity)}>{f.severity}</Pill>

              {/* Title + meta */}
              <div className="min-w-0">
                <div className="text-[15px] text-white truncate">{f.title}</div>
                <div className="text-xs text-[#5C6C75] font-mono mt-1">
                  {clusterName} · detected {timeAgo(f.created_at)}
                </div>
              </div>

              {/* Category */}
              <div className="text-xs text-[#5C6C75]">
                {categoryOf(f.agent).label}
              </div>

              {/* Impact */}
              <div className="text-right">
                {hasSavings ? (
                  <span className="text-sm text-mdb-leaf font-medium">
                    ${f.estimated_monthly_savings_usd!.toLocaleString()}/mo
                  </span>
                ) : (
                  <span className="text-xs text-[#5C6C75]">-</span>
                )}
              </div>

              {/* Chevron */}
              <div className="flex justify-center">
                <ChevronRight />
              </div>
            </div>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="py-12 text-center text-[#5C6C75] text-sm">
            No findings match your filters.
          </div>
        )}
      </div>

      {/* Footer */}
      <TableFooter>
        <span className="text-[#5C6C75]">
          Showing <span className="text-[#C5CDD3]">{filteredItems.length}</span> of{" "}
          <span className="text-[#C5CDD3]">{activeTab === "open" ? openItems.length : filteredItems.length}</span> {activeTab} ·{" "}
          <span className="text-mdb-leaf">${totalSavings.toLocaleString()}/mo total addressable savings</span>
        </span>
        <div className="flex items-center gap-2.5">
          <span className="text-[#5C6C75]">Items per page</span>
          <select className="bg-transparent border-[0.5px] border-[#1C2D38] rounded-md text-[#C5CDD3] text-[13px] px-2.5 py-1.5">
            <option value="25" className="bg-[#001E2B]">25</option>
            <option value="50" className="bg-[#001E2B]">50</option>
            <option value="100" className="bg-[#001E2B]">100</option>
          </select>
        </div>
      </TableFooter>
    </TableContainer>
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

  const selectedId = searchParams.get("selected") || searchParams.get("id");

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
      const updated = await api.findings.list();
      setItems(updated);
    } catch (e: unknown) {
      console.error("Failed to update status:", e);
    }
  }

  if (loading && items.length === 0) {
    return (
      <PageContainer>
        <div className="py-12 text-center text-[#889397] text-[15px]">
          Loading findings...
        </div>
      </PageContainer>
    );
  }

  if (err && items.length === 0) {
    return (
      <PageContainer>
        <div className="py-12 text-center text-[#FF6960] text-[15px]">
          {err}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Page header (only show in list view) */}
      {!selectedFinding && (
        <div data-tour="findings-summary">
          <PageHeader title="Findings" className="mb-7" />
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
        <div data-tour="findings-list">
          <ListView items={items} onSelect={(id) => setSearchParams({ selected: id })} />
        </div>
      )}

      {/* Hidden reset toast */}
      {showResetToast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 text-[11px] bg-mdb-leaf/[0.08] border-[0.5px] border-mdb-leaf/30 text-mdb-leaf px-4 py-2 rounded-full z-[9999] transition-opacity duration-300 ${
            toastFading ? "opacity-0" : "opacity-100"
          }`}
        >
          Demo reset - all findings restored
        </div>
      )}
    </PageContainer>
  );
}
