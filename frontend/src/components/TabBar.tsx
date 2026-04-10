import { type ReactNode } from "react";

// =============================================================================
// TAB BAR COMPONENT
// =============================================================================

export interface Tab<T extends string> {
  key: T;
  label: string;
  count?: number;
  countVariant?: "default" | "warning" | "success";
  showDot?: boolean;
}

interface TabBarProps<T extends string> {
  tabs: Tab<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  rightContent?: ReactNode;
  className?: string;
}

export function TabBar<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  rightContent,
  className = "",
}: TabBarProps<T>) {
  return (
    <div
      className={`flex items-center justify-between border-b border-[#0E2230] ${className}`}
    >
      <div className="flex items-center">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;

          // Count badge styling based on variant
          const countBgClass =
            tab.countVariant === "warning"
              ? "bg-[#FF6960]/10 text-[#FF6960] border-[#FF6960]/30"
              : tab.countVariant === "success"
                ? "bg-mdb-leaf/10 text-mdb-leaf border-mdb-leaf/30"
                : isActive
                  ? "bg-mdb-leaf/10 text-mdb-leaf"
                  : "text-[#5C6C75]";

          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.key)}
              className={`
                px-4 py-3.5 text-sm font-medium transition-colors
                flex items-center gap-2
                border-b-2 -mb-px
                ${
                  isActive
                    ? "text-white border-mdb-leaf"
                    : "text-[#5C6C75] border-transparent hover:text-white"
                }
              `}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`
                    text-xs px-2 py-0.5 rounded-full
                    ${tab.countVariant ? `border-[0.5px] ${countBgClass}` : countBgClass}
                  `}
                >
                  {tab.count}
                </span>
              )}
              {tab.showDot && (
                <span className="w-1.5 h-1.5 rounded-full bg-mdb-leaf animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
      {rightContent && <div className="pr-4">{rightContent}</div>}
    </div>
  );
}

export default TabBar;
