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
  /** Route must match exactly — no extra query params allowed */
  exact?: boolean;
  /** Scroll the target element into view before spotlighting */
  scrollToTarget?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    route: "/",
    target: null,
    placement: "center",
    title: "Welcome to MDBA",
    body: "AI-powered cost and health advisor for MongoDB Atlas",
    action: "Begin",
  },
  {
    id: "dashboard-stats",
    route: "/",
    target: "[data-tour='savings']",
    placement: "bottom",
    title: "At a glance",
    body: "Open findings, savings on the table, and cluster health — all before the first meeting of the day",
  },
  {
    id: "findings-list",
    route: "/findings",
    exact: true,
    target: "[data-tour='findings-list']",
    placement: "top",
    title: "Findings",
    body: "Ranked by dollar impact — full transparency on what's costing you and exactly why",
  },
  {
    id: "finding-detail",
    route: "/findings",
    target: "[data-tour='finding-detail']",
    placement: "right",
    title: "Root cause, traced",
    body: "Affected collections, the spike that triggered it, addressable savings — with the full analysis trace below",
    clickOnEnter: "[data-tour='finding-row-0']",
    clickDelay: 300,
  },
  {
    id: "hitl-gate",
    route: "/findings",
    target: "[data-tour='decision-section']",
    placement: "left",
    scrollToTarget: true,
    title: "Human in the loop",
    body: "Review the exact operation before anything runs — confirm or cancel. Nothing touches your cluster without sign-off",
  },
  {
    id: "workflows",
    route: "/workflows",
    target: "[data-tour='workflows']",
    placement: "right",
    title: "Active agents",
    body: "Always-on monitors for cost, query health, security, and backups — running continuously across every cluster",
  },
  {
    id: "create-modes",
    route: "/workflows/new?mode=templates",
    target: "[data-tour='create-modes']",
    placement: "bottom",
    title: "Three ways to build",
    body: "Templates for one-click setup, chat to describe it in plain English, or a full visual flow editor — three on-ramps for three personas",
  },
  {
    id: "chat-demo",
    route: "/workflows/new?mode=chat",
    target: "[data-tour='chat-panel']",
    placement: "left",
    title: "Build with chat",
    body: "One sentence is enough — describe what to monitor and the agent drafts the full pipeline",
    clickOnEnter: "[data-tour='chat-starter-0']",
    clickDelay: 600,
  },
  {
    id: "flow-editor",
    route: "/advisor/flow",
    target: "[data-tour='flow-workspace']",
    placement: "top",
    title: "Full control",
    body: "Wire Atlas API calls, MongoDB ops, and analysis nodes into your own pipeline — the terminal traces every step",
  },
  {
    id: "complete",
    route: "/",
    target: null,
    placement: "center",
    title: "You're ready",
    body: "Start monitoring your clusters",
    action: "Done",
  },
];
