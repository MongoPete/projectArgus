export interface TourStep {
  id: string;
  route: string;
  target: string | null;
  placement: "top" | "bottom" | "left" | "right" | "center";
  title: string;
  body: string;
  action?: string;
  /** Selector to click when entering this step */
  clickOnEnter?: string;
  /** Delay before clicking (ms) */
  clickDelay?: number;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    route: "/",
    target: null,
    placement: "center",
    title: "Welcome to MDBA",
    body: "Your AI-powered Atlas advisor",
    action: "Begin",
  },
  {
    id: "dashboard-stats",
    route: "/",
    target: "[data-tour='savings']",
    placement: "bottom",
    title: "At a glance",
    body: "Findings, savings, and cluster health",
  },
  {
    id: "dashboard-workspace",
    route: "/",
    target: "[data-tour='top-findings']",
    placement: "top",
    title: "Your workspace",
    body: "Switch between findings, workflows, and activity",
  },
  {
    id: "findings",
    route: "/findings",
    target: "[data-tour='findings-list']",
    placement: "top",
    title: "Findings",
    body: "Review and act on recommendations",
  },
  {
    id: "workflows-create",
    route: "/workflows",
    target: "[data-tour='create-btn']",
    placement: "bottom",
    title: "Create a workflow",
    body: "Set up automated monitoring",
  },
  {
    id: "create-modes",
    route: "/workflows/new?mode=templates",
    target: "[data-tour='create-modes']",
    placement: "bottom",
    title: "Three ways to create",
    body: "Templates, Chat, or Flow editor",
  },
  {
    id: "templates-view",
    route: "/workflows/new?mode=templates",
    target: "[data-tour='outcomes']",
    placement: "right",
    title: "Templates",
    body: "Pick what to monitor from ready-made options",
  },
  {
    id: "chat-view",
    route: "/workflows/new?mode=chat",
    target: "[data-tour='chat-starters']",
    placement: "top",
    title: "Chat",
    body: "Describe what you need in plain language",
  },
  {
    id: "chat-demo",
    route: "/workflows/new?mode=chat",
    target: "[data-tour='chat-panel']",
    placement: "left",
    title: "Watch it work",
    body: "The AI builds your workflow in real-time",
    clickOnEnter: "[data-tour='chat-starter-0']",
    clickDelay: 600,
  },
  {
    id: "flow-editor",
    route: "/advisor/flow",
    target: "[data-tour='flow-canvas']",
    placement: "left",
    title: "Flow editor",
    body: "Drag tools to build custom pipelines",
  },
  {
    id: "complete",
    route: "/",
    target: null,
    placement: "center",
    title: "You're ready!",
    body: "Start monitoring your clusters",
    action: "Done",
  },
];
