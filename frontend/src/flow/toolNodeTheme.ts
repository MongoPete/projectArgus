import type { ToolKind } from "@/flow/toolPalette";

/** Eugene-style node chrome (Flask builder mockups) — per-tool colors */
export function toolNodeTheme(tool: ToolKind) {
  switch (tool) {
    case "mdba":
      return {
        bg: "bg-[#1a0a2e]",
        borderIdle: "border-[#7c3aed]",
        borderSel: "border-[#818cf8]",
        accent: "text-[#a78bfa]",
        hint: "text-[#7c3aed]",
        pill: "text-[#a78bfa] bg-violet-500/15",
      };
    case "mongodb":
      return {
        bg: "bg-[#0a1e0a]",
        borderIdle: "border-[#00684a]",
        borderSel: "border-[#818cf8]",
        accent: "text-[#00ED64]",
        hint: "text-[#00684a]",
        pill: "text-mdb-leaf bg-mdb-leaf/15",
      };
    case "atlas_api":
      return {
        bg: "bg-[#0d1b2e]",
        borderIdle: "border-[#1d6fe0]",
        borderSel: "border-[#818cf8]",
        accent: "text-[#60a5fa]",
        hint: "text-[#1d6fe0]",
        pill: "text-sky-300 bg-sky-500/15",
      };
    case "slack":
      return {
        bg: "bg-[#1a0e2e]",
        borderIdle: "border-[#4a154b]",
        borderSel: "border-[#818cf8]",
        accent: "text-[#d896ff]",
        hint: "text-[#4a154b]",
        pill: "text-[#d896ff] bg-purple-500/10",
      };
    case "email":
      return {
        bg: "bg-[#0c1629]",
        borderIdle: "border-[#0ea5e9]",
        borderSel: "border-[#818cf8]",
        accent: "text-[#38bdf8]",
        hint: "text-[#0369a1]",
        pill: "text-sky-300 bg-sky-500/10",
      };
    default:
      return {
        bg: "bg-[#0d1b38]",
        borderIdle: "border-[#1d4ed8]",
        borderSel: "border-[#818cf8]",
        accent: "text-slate-200",
        hint: "text-slate-500",
        pill: "text-slate-400 bg-slate-500/10",
      };
  }
}
