import { type ReactNode } from "react";

// =============================================================================
// PAGE CONTAINER - Consistent max-width and spacing
// =============================================================================

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

export function PageContainer({ children, className = "" }: PageContainerProps) {
  return (
    <div className={`max-w-[1400px] mx-auto ${className}`}>
      {children}
    </div>
  );
}

// =============================================================================
// PAGE HEADER - Consistent header layout
// =============================================================================

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  className = "",
}: PageHeaderProps) {
  return (
    <div
      className={`flex flex-wrap items-end justify-between gap-4 mb-6 ${className}`}
    >
      <div>
        <h1 className="text-2xl font-semibold text-white">{title}</h1>
        {description && (
          <p className="text-slate-400 mt-1 text-sm max-w-xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

// =============================================================================
// CARD CONTAINER - Glass card styling
// =============================================================================

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function Card({
  children,
  className = "",
  onClick,
  hoverable = false,
  onMouseEnter,
  onMouseLeave,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`
        bg-white/[0.02] border-[0.5px] border-[#112733] rounded-xl
        ${hoverable ? "cursor-pointer hover:bg-white/[0.03] transition-colors" : ""}
        ${onClick ? "cursor-pointer" : ""}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

// =============================================================================
// TABLE CONTAINER - Consistent table styling
// =============================================================================

interface TableContainerProps {
  children: ReactNode;
  className?: string;
}

export function TableContainer({ children, className = "" }: TableContainerProps) {
  return (
    <div
      className={`
        bg-white/[0.02] border-[0.5px] border-[#112733] rounded-xl
        overflow-hidden
        ${className}
      `}
    >
      {children}
    </div>
  );
}

// =============================================================================
// TABLE HEADER ROW
// =============================================================================

interface TableHeaderProps {
  columns: { key: string; label: string; align?: "left" | "right" | "center" }[];
  gridCols: string;
  className?: string;
}

export function TableHeader({ columns, gridCols, className = "" }: TableHeaderProps) {
  return (
    <div
      className={`grid gap-4 px-6 py-3 border-b border-[#0E2230] ${className}`}
      style={{ gridTemplateColumns: gridCols }}
    >
      {columns.map((col) => (
        <div
          key={col.key}
          className={`text-[11px] text-[#5C6C75] uppercase tracking-wide ${
            col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""
          }`}
        >
          {col.label}
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// TABLE ROW
// =============================================================================

interface TableRowProps {
  children: ReactNode;
  gridCols: string;
  onClick?: () => void;
  className?: string;
}

export function TableRow({ children, gridCols, onClick, className = "" }: TableRowProps) {
  return (
    <div
      onClick={onClick}
      className={`
        grid gap-4 px-6 py-4 items-center
        border-b border-[#0E2230] last:border-b-0
        transition-colors
        ${onClick ? "cursor-pointer hover:bg-white/[0.025]" : ""}
        ${className}
      `}
      style={{ gridTemplateColumns: gridCols }}
    >
      {children}
    </div>
  );
}

// =============================================================================
// TABLE FOOTER
// =============================================================================

interface TableFooterProps {
  children: ReactNode;
  className?: string;
}

export function TableFooter({ children, className = "" }: TableFooterProps) {
  return (
    <div
      className={`
        flex items-center justify-between
        px-6 py-4 text-[13px]
        border-t border-[#0E2230]
        ${className}
      `}
    >
      {children}
    </div>
  );
}

export default PageContainer;
