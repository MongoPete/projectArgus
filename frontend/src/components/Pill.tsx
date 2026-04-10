import { type ReactNode } from "react";

// =============================================================================
// PILL VARIANTS & STYLES
// =============================================================================

export type PillVariant =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "success"
  | "info"
  | "muted"
  | "scan"
  | "active"
  | "paused";

const variantClasses: Record<PillVariant, string> = {
  critical: "text-[#FF6960] bg-[#FF6960]/[0.08] border-[#FF6960]/30",
  high: "text-[#FF6960] bg-[#FF6960]/[0.08] border-[#FF6960]/30",
  medium: "text-[#FFC010] bg-[#FFC010]/[0.08] border-[#FFC010]/30",
  low: "text-[#889397] bg-[#889397]/[0.06] border-[#889397]/25",
  success: "text-mdb-leaf bg-mdb-leaf/[0.08] border-mdb-leaf/30",
  info: "text-[#3D9CFF] bg-[#3D9CFF]/[0.08] border-[#3D9CFF]/30",
  muted: "text-[#889397] bg-white/[0.04] border-[#1C2D38]",
  scan: "text-mdb-leaf bg-mdb-leaf/[0.08] border-mdb-leaf/30",
  active: "text-mdb-leaf bg-mdb-leaf/15 border-mdb-leaf/25",
  paused: "text-slate-400 bg-slate-600/20 border-slate-600/30",
};

// =============================================================================
// HELPER: Map severity string to variant
// =============================================================================

export function severityToVariant(
  severity: string,
  status?: string
): PillVariant {
  if (status === "approved" || status === "dismissed") return "success";
  if (severity === "critical") return "critical";
  if (severity === "high") return "high";
  if (severity === "medium") return "medium";
  return "low";
}

// =============================================================================
// PILL COMPONENT
// =============================================================================

interface PillProps {
  variant: PillVariant;
  children: ReactNode;
  size?: "sm" | "md";
  showDot?: boolean;
  pulseDot?: boolean;
  className?: string;
}

export function Pill({
  variant,
  children,
  size = "sm",
  showDot = false,
  pulseDot = false,
  className = "",
}: PillProps) {
  const sizeClasses =
    size === "md"
      ? "text-xs px-3.5 py-1.5 rounded-[5px]"
      : "text-[11px] px-2.5 py-1 rounded";

  const isScan = variant === "scan";
  const shouldShowDot = showDot || isScan;

  return (
    <span
      className={`
        inline-flex items-center justify-center gap-1.5
        font-medium uppercase tracking-wide
        border-[0.5px]
        ${sizeClasses}
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {shouldShowDot && (
        <span
          className={`
            w-1.5 h-1.5 rounded-full
            ${variant === "critical" || variant === "high" ? "bg-[#FF6960]" : "bg-mdb-leaf"}
            ${pulseDot ? "animate-pulse" : ""}
          `}
        />
      )}
      {children}
    </span>
  );
}

export default Pill;
