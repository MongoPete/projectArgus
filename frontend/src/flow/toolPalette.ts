export type ToolKind = "atlas_api" | "mongodb" | "mdba" | "slack" | "email";

/** React Flow node `data` for `type: "tool"`. */
export interface ToolNodeData extends Record<string, unknown> {
  tool: ToolKind;
  label: string;
  prompt: string;
  include_prior_memory: boolean;
}

export type PaletteItem = {
  tool: ToolKind;
  label: string;
  hint: string;
};

export type PaletteGroup = {
  title: string;
  items: PaletteItem[];
};

export const TOOL_PALETTE: PaletteGroup[] = [
  {
    title: "Tools",
    items: [
      { tool: "mdba", label: "MDBA", hint: "Internal reasoning / policy" },
      { tool: "mongodb", label: "MongoDB", hint: "Driver & profiler ops" },
      { tool: "atlas_api", label: "Atlas API", hint: "Billing, clusters, org" },
    ],
  },
  {
    title: "Notifications",
    items: [
      { tool: "slack", label: "Slack message", hint: "Post to a channel" },
      { tool: "email", label: "Email", hint: "SMTP / SES style" },
    ],
  },
];

export function defaultLabelForTool(tool: ToolKind): string {
  const flat = TOOL_PALETTE.flatMap((g) => g.items);
  return flat.find((i) => i.tool === tool)?.label ?? tool;
}
