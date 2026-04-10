import { type ReactNode } from "react";

// =============================================================================
// FILTER DROPDOWN
// =============================================================================

interface FilterOption {
  value: string;
  label: string;
}

interface FilterDropdownProps {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

export function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: FilterDropdownProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-transparent border-none text-[#C5CDD3] text-[13px] cursor-pointer pr-4 focus:outline-none"
      >
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            className="bg-[#001E2B]"
          >
            {label} {opt.label}
          </option>
        ))}
      </select>
      <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[#5C6C75] text-[10px] pointer-events-none">
        ▾
      </span>
    </div>
  );
}

// =============================================================================
// SEARCH INPUT
// =============================================================================

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  shortcut?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  shortcut = "⌘K",
}: SearchInputProps) {
  return (
    <div className="relative w-60">
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full py-2.5 px-3.5 pr-12 bg-white/[0.04] border-[0.5px] border-[#1C2D38] rounded-lg text-[#C5CDD3] text-[13px] outline-none focus:border-mdb-leaf/30 transition-colors"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#5C6C75] bg-[#112733] px-1.5 py-0.5 rounded">
        {shortcut}
      </span>
    </div>
  );
}

// =============================================================================
// FILTER BAR CONTAINER
// =============================================================================

interface FilterBarProps {
  children: ReactNode;
  className?: string;
}

export function FilterBar({ children, className = "" }: FilterBarProps) {
  return (
    <div
      className={`
        flex items-center gap-4 flex-wrap
        px-6 py-3.5
        bg-black/15 border-b border-[#0E2230]
        ${className}
      `}
    >
      {children}
    </div>
  );
}

// Spacer for flex layouts
export function FilterSpacer() {
  return <div className="flex-1" />;
}

export default FilterBar;
