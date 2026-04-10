import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTour } from "@/tour/useTour";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  BackgroundVariant,
  type Edge,
  type Node,
  type NodeProps,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { api } from "@/api";
import {
  defaultLabelForTool,
  TOOL_PALETTE,
  type ToolKind,
  type ToolNodeData,
} from "@/flow/toolPalette";
import type { FlowRunLogEntry, ToolFlow } from "@/types";

// =============================================================================
// THEME - MDBA Design System
// =============================================================================

const TOOL_COLORS: Record<ToolKind, { bg: string; border: string; accent: string }> = {
  mdba: { bg: "bg-[#1a1f2e]", border: "border-[#8b5cf6]/40", accent: "text-[#a78bfa]" },
  mongodb: { bg: "bg-[#0a1e18]", border: "border-mdb-leaf/40", accent: "text-mdb-leaf" },
  atlas_api: { bg: "bg-[#0d1a2d]", border: "border-[#3D9CFF]/40", accent: "text-[#3D9CFF]" },
  slack: { bg: "bg-[#1a1f2e]", border: "border-[#FFC010]/40", accent: "text-[#FFC010]" },
  email: { bg: "bg-[#1a1f2e]", border: "border-[#FF6960]/40", accent: "text-[#FF6960]" },
};

function getToolTheme(tool: ToolKind) {
  return TOOL_COLORS[tool] || TOOL_COLORS.mdba;
}

// =============================================================================
// HELPERS
// =============================================================================

function findTailId(nodes: Node[], edges: Edge[]): string | null {
  if (nodes.length === 0) return null;
  const sources = new Set(edges.map((e) => e.source));
  const leaves = nodes.filter((n) => !sources.has(n.id));
  const pick = (arr: Node[]) =>
    [...arr].sort((a, b) => (b.position?.y ?? 0) - (a.position?.y ?? 0))[0];
  return pick(leaves.length ? leaves : nodes).id;
}

// =============================================================================
// TOOL NODE COMPONENT
// =============================================================================

function ToolRfNode({ data, selected }: NodeProps<Node<ToolNodeData, "tool">>) {
  const theme = getToolTheme(data.tool);
  const preview =
    data.prompt.trim().slice(0, 120) + (data.prompt.length > 120 ? "..." : "") ||
    "Double-click to add instructions...";

  return (
    <div
      className={`rounded-xl border-[1.5px] w-[280px] min-h-[80px] px-3.5 pt-2.5 pb-3 shadow-lg transition-all ${theme.bg} ${
        selected ? "border-mdb-leaf shadow-[0_0_0_2px_rgba(0,237,100,0.2)]" : theme.border
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-[#112733] !w-[12px] !h-[12px] !border-2 !border-mdb-leaf/50 -top-[6px]"
      />
      <div className={`text-[10px] uppercase tracking-wider font-semibold ${theme.accent}`}>
        {data.tool.replace("_", " ")}
      </div>
      <div className="text-[13px] font-semibold text-white leading-snug mt-1">
        {data.label}
      </div>
      <div
        className={`mt-2 pt-2 border-t border-[#112733] text-[11px] leading-snug line-clamp-3 ${
          data.prompt.trim() ? "text-slate-400" : "text-slate-600 italic"
        }`}
      >
        {preview}
      </div>
      {data.include_prior_memory && (
        <span className="inline-block mt-2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-mdb-leaf/10 text-mdb-leaf border border-mdb-leaf/25">
          Memory on
        </span>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-mdb-leaf !w-[12px] !h-[12px] !border-2 !border-[#001E2B] -bottom-[6px]"
      />
    </div>
  );
}

const nodeTypes = { tool: ToolRfNode };

const edgeDefaults = {
  type: "smoothstep" as const,
  markerEnd: { type: MarkerType.ArrowClosed, color: "#00ED64", width: 16, height: 16 },
  style: { stroke: "#00ED64", strokeWidth: 2 },
};

// =============================================================================
// CLUSTERS
// =============================================================================

const FLOW_CLUSTERS = [
  { id: "prod-east", name: "prod-east-1" },
  { id: "prod-west", name: "prod-west-1" },
  { id: "staging", name: "staging-1" },
  { id: "analytics", name: "analytics-prod" },
  { id: "dev", name: "dev-shared" },
];

// =============================================================================
// DEMO DATA
// =============================================================================

function backupMonitorDemo(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node<ToolNodeData, "tool">[] = [
    {
      id: "demo-1",
      type: "tool",
      position: { x: 80, y: 40 },
      data: {
        tool: "atlas_api",
        label: "Atlas API - invoices",
        prompt: "Fetch the previous month's invoice for the Atlas org. Use fromDate param to bound the query.",
        include_prior_memory: false,
      },
    },
    {
      id: "demo-2",
      type: "tool",
      position: { x: 80, y: 240 },
      data: {
        tool: "atlas_api",
        label: "Atlas API - line items",
        prompt: "Get invoice details for each ID from the prior step. Summarize total backup cost by cluster.",
        include_prior_memory: true,
      },
    },
    {
      id: "demo-3",
      type: "tool",
      position: { x: 80, y: 440 },
      data: {
        tool: "mdba",
        label: "MDBA - analyze delta",
        prompt: "Compute month-over-month delta in backup costs. Flag if change exceeds threshold.",
        include_prior_memory: true,
      },
    },
    {
      id: "demo-4",
      type: "tool",
      position: { x: 80, y: 640 },
      data: {
        tool: "slack",
        label: "Slack - notify",
        prompt: "If the delta in backup costs exceeds $1000 then send a notification to the channel.",
        include_prior_memory: true,
      },
    },
  ];
  const edges: Edge[] = [
    { id: "de1", source: "demo-1", target: "demo-2", ...edgeDefaults },
    { id: "de2", source: "demo-2", target: "demo-3", ...edgeDefaults },
    { id: "de3", source: "demo-3", target: "demo-4", ...edgeDefaults },
  ];
  return { nodes, edges };
}

// =============================================================================
// FLOW CANVAS
// =============================================================================

function FitViewEffect({ sig }: { sig: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const t = requestAnimationFrame(() => fitView({ padding: 0.15, duration: 200, minZoom: 0.25, maxZoom: 1.35 }));
    return () => cancelAnimationFrame(t);
  }, [sig, fitView]);
  return null;
}

function FlowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNodeOpen,
  sig,
}: {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange<Node>;
  onEdgesChange: OnEdgesChange<Edge>;
  onNodeOpen: (id: string) => void;
  sig: string;
}) {
  const onClick = useCallback(
    (_: ReactMouseEvent, n: Node) => {
      if (n.type === "tool") onNodeOpen(n.id);
    },
    [onNodeOpen]
  );
  const onDoubleClick = useCallback(
    (_: ReactMouseEvent, n: Node) => {
      if (n.type === "tool") onNodeOpen(n.id);
    },
    [onNodeOpen]
  );

  return (
    <div className="absolute inset-0">
      <ReactFlow
        className="!bg-[#001E2B]"
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onClick}
        onNodeDoubleClick={onDoubleClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12, minZoom: 0.2, maxZoom: 1.5 }}
        minZoom={0.15}
        maxZoom={1.6}
        panOnScroll
        zoomOnScroll
        zoomOnDoubleClick={false}
        nodesDraggable
        nodesConnectable={false}
        deleteKeyCode="Delete"
        defaultEdgeOptions={edgeDefaults}
      >
        <Background gap={24} size={1} color="#112733" variant={BackgroundVariant.Dots} />
        <Controls
          className="!bg-[#0B2330] !border !border-[#112733] !rounded-lg !shadow-lg [&_button]:!bg-[#0B2330] [&_button]:!border-[#112733] [&_button]:!fill-mdb-leaf [&_button:hover]:!bg-mdb-leaf/10 [&_button]:!text-mdb-leaf [&_button_svg]:!fill-mdb-leaf"
          showInteractive={false}
        />
        <FitViewEffect sig={sig} />
      </ReactFlow>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function FlowBuilder() {
  const { active: tourActive } = useTour();
  const location = useLocation();
  const [flowName, setFlowName] = useState("Untitled flow");
  const [targetCluster, setTargetCluster] = useState("prod-east");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedList, setSavedList] = useState<ToolFlow[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [draftMemory, setDraftMemory] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const [runnerLines, setRunnerLines] = useState<FlowRunLogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [termW, setTermW] = useState(480);
  const [termInput, setTermInput] = useState("");
  const termDrag = useRef<{ startX: number; startW: number } | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const termScrollRef = useRef<HTMLDivElement | null>(null);

  const sig = useMemo(
    () => nodes.map((n) => n.id).join(",") + edges.map((e) => e.id).join(","),
    [nodes, edges]
  );

  useEffect(() => {
    api.flows
      .list()
      .then(setSavedList)
      .catch(() => setSavedList([]));
  }, []);

  // Hydrate from route state
  useEffect(() => {
    const st = location.state as { nodes?: unknown[]; edges?: unknown[]; flowName?: string; loadFlowId?: string } | null;
    if (st?.loadFlowId) {
      // Load existing flow by ID
      api.flows.get(st.loadFlowId).then((f) => {
        setFlowName(f.name);
        setSavedId(f.id);
        setNodes(f.nodes as Node[]);
        setEdges(f.edges as Edge[]);
        setRunnerLines([]);
      }).catch((e) => setErr((e as Error).message));
      window.history.replaceState({}, "");
    } else if (st?.nodes && Array.isArray(st.nodes) && st.nodes.length > 0) {
      setNodes(st.nodes as Node[]);
      setEdges((st.edges ?? []) as Edge[]);
      if (st.flowName) setFlowName(st.flowName);
      setSavedId(null);
      setRunnerLines([]);
      window.history.replaceState({}, "");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tourRanRef = useRef(false);

  // Auto-load demo when tour is active
  useEffect(() => {
    if (!tourActive) {
      tourRanRef.current = false;
      return;
    }
    if (nodes.length === 0) {
      const { nodes: n, edges: e } = backupMonitorDemo();
      setNodes(n);
      setEdges(e);
      setFlowName("backup monitor");
      tourRanRef.current = false;
    }
  }, [tourActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Terminal resize handling
  useEffect(() => {
    const onMove = (ev: Event) => {
      const e = ev as globalThis.MouseEvent;
      if (!termDrag.current) return;
      const dx = termDrag.current.startX - e.clientX;
      const maxW = Math.min(window.innerWidth * 0.55, 800);
      setTermW(Math.max(280, Math.min(maxW, termDrag.current.startW + dx)));
    };
    const onUp = () => {
      termDrag.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  useEffect(() => {
    const el = termScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [runnerLines]);

  const editingNode = editingId ? nodes.find((n) => n.id === editingId) : null;

  useEffect(() => {
    if (!editingNode || editingNode.type !== "tool") return;
    const d = editingNode.data as ToolNodeData;
    setDraftPrompt(d.prompt);
    setDraftMemory(d.include_prior_memory);
    setDraftLabel(d.label);
  }, [editingId, editingNode]);

  const addTool = useCallback(
    (tool: ToolKind) => {
      const id = crypto.randomUUID();
      const label = defaultLabelForTool(tool);
      const tail = findTailId(nodes, edges);
      const lastY = tail ? (nodes.find((n) => n.id === tail)?.position.y ?? 0) : -140;
      const newNode: Node<ToolNodeData, "tool"> = {
        id,
        type: "tool",
        position: { x: 100, y: lastY + 140 },
        data: { tool, label, prompt: "", include_prior_memory: false },
      };
      setNodes((ns) => [...ns, newNode]);
      if (tail) {
        setEdges((es) => [...es, { id: `e-${tail}-${id}`, source: tail, target: id, ...edgeDefaults }]);
      }
    },
    [nodes, edges, setNodes, setEdges]
  );

  const applyDemo = useCallback(() => {
    const { nodes: n, edges: e } = backupMonitorDemo();
    setNodes(n);
    setEdges(e);
    setFlowName("backup monitor");
    setSavedId(null);
    setRunnerLines([]);
  }, [setNodes, setEdges]);

  const closeModal = useCallback(() => setEditingId(null), []);

  const saveModal = useCallback(() => {
    if (!editingId) return;
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== editingId || n.type !== "tool") return n;
        return {
          ...n,
          data: {
            ...(n.data as ToolNodeData),
            label: draftLabel.trim() || (n.data as ToolNodeData).label,
            prompt: draftPrompt,
            include_prior_memory: draftMemory,
          },
        };
      })
    );
    closeModal();
  }, [editingId, draftLabel, draftPrompt, draftMemory, setNodes, closeModal]);

  const deleteStep = useCallback(() => {
    if (!editingId) return;
    setNodes((ns) => ns.filter((n) => n.id !== editingId));
    setEdges((es) => es.filter((e) => e.source !== editingId && e.target !== editingId));
    closeModal();
  }, [editingId, setNodes, setEdges, closeModal]);

  const executeStreamRun = useCallback(async () => {
    setErr(null);
    streamAbortRef.current?.abort();
    const ac = new AbortController();
    streamAbortRef.current = ac;
    setRunning(true);
    setRunnerLines([]);
    try {
      await api.flows.runStream(
        { nodes, edges, flow_id: savedId ?? undefined },
        (entry) => setRunnerLines((prev) => [...prev, entry]),
        ac.signal
      );
    } catch (e) {
      const err = e as Error;
      if (err.name === "AbortError") return;
      setErr(err.message);
    } finally {
      setRunning(false);
      if (streamAbortRef.current === ac) streamAbortRef.current = null;
    }
  }, [nodes, edges, savedId]);

  const processTermCommand = useCallback(
    (raw: string) => {
      const line = raw.trim();
      if (!line) return;
      setRunnerLines((p) => [...p, { kind: "echo", content: line }]);
      const head = line.toLowerCase().split(/\s+/)[0];
      if (head === "help") {
        const rows: FlowRunLogEntry[] = [
          { kind: "text", content: "Commands:" },
          { kind: "text", content: "  help   - show this list" },
          { kind: "text", content: "  clear  - clear the terminal" },
          { kind: "text", content: "  list   - list nodes on canvas" },
          { kind: "text", content: "  run    - execute the flow" },
          { kind: "text", content: "  abort  - stop running flow" },
        ];
        setRunnerLines((p) => [...p, ...rows]);
        return;
      }
      if (head === "clear") {
        setRunnerLines([]);
        return;
      }
      if (head === "list") {
        if (!nodes.length) {
          setRunnerLines((p) => [...p, { kind: "text", content: "(no nodes)" }]);
          return;
        }
        const rows: FlowRunLogEntry[] = nodes.map((n, i) => {
          const d = (n.data || {}) as ToolNodeData;
          return { kind: "text", content: `  ${i + 1}. [${d.tool}] ${d.label}` };
        });
        setRunnerLines((p) => [...p, ...rows]);
        return;
      }
      if (head === "run") {
        if (!nodes.length) {
          setRunnerLines((p) => [...p, { kind: "text", content: "(no nodes - add tools first)" }]);
          return;
        }
        void executeStreamRun();
        return;
      }
      if (head === "abort") {
        streamAbortRef.current?.abort();
        setRunnerLines((p) => [...p, { kind: "text", content: "Aborted." }]);
        return;
      }
      setRunnerLines((p) => [...p, { kind: "text", content: "Unknown command. Type help." }]);
    },
    [nodes, executeStreamRun]
  );

  const resetRunner = useCallback(() => {
    streamAbortRef.current?.abort();
    setRunnerLines([]);
    setErr(null);
  }, []);

  // Auto-run during tour
  useEffect(() => {
    if (!tourActive || nodes.length === 0 || running || tourRanRef.current) return;
    tourRanRef.current = true;
    const ac = new AbortController();
    streamAbortRef.current = ac;
    const kick = async () => {
      setRunning(true);
      setRunnerLines([]);
      try {
        await api.flows.runStream(
          { nodes, edges },
          (entry) => setRunnerLines((prev) => [...prev, entry]),
          ac.signal,
        );
      } catch (e) {
        if ((e as Error).name !== "AbortError") setErr((e as Error).message);
      } finally {
        setRunning(false);
      }
    };
    const t = setTimeout(() => void kick(), 500);
    return () => { clearTimeout(t); ac.abort(); };
  }, [tourActive, nodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveFlow = useCallback(async () => {
    setErr(null);
    setSaveBusy(true);
    try {
      const body = { name: flowName.trim() || "Untitled flow", description: "", nodes, edges };
      if (savedId) {
        const updated = await api.flows.update(savedId, body);
        setSavedList((list) => {
          const i = list.findIndex((f) => f.id === updated.id);
          if (i < 0) return [updated, ...list];
          const copy = [...list];
          copy[i] = updated;
          return copy;
        });
      } else {
        const created = await api.flows.create(body);
        setSavedId(created.id);
        setSavedList((list) => [created, ...list]);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaveBusy(false);
    }
  }, [flowName, nodes, edges, savedId]);

  const loadFlow = useCallback(
    async (id: string) => {
      setErr(null);
      try {
        const f = await api.flows.get(id);
        setFlowName(f.name);
        setSavedId(f.id);
        setNodes(f.nodes as Node[]);
        setEdges(f.edges as Edge[]);
        setRunnerLines([]);
      } catch (e) {
        setErr((e as Error).message);
      }
    },
    [setNodes, setEdges]
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#001E2B] text-slate-200">
      {/* Top bar */}
      <header className="flex items-center justify-between h-12 shrink-0 px-4 border-b border-[#112733] bg-[#0B2330]">
        {/* Left section */}
        <div className="flex items-center gap-4">
          <Link
            to="/workflows/new?mode=editor"
            className="flex items-center gap-1.5 text-[13px] font-medium text-mdb-leaf hover:text-mdb-leaf/80"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </Link>

          <div className="h-5 w-px bg-[#112733]" />

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#5C6C75]">Name:</span>
            <input
              className="text-[13px] font-medium bg-transparent border-b border-[#112733] focus:border-mdb-leaf outline-none px-1 py-0.5 text-white w-[140px]"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              placeholder="Untitled flow"
            />
          </div>

          <div className="h-5 w-px bg-[#112733]" />

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#5C6C75]">Cluster:</span>
            <select
              className="text-[12px] rounded-md bg-mdb-slate border border-[#112733] text-white px-2 py-1"
              value={targetCluster}
              onChange={(e) => setTargetCluster(e.target.value)}
            >
              {FLOW_CLUSTERS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right section - actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={running || nodes.length === 0}
            onClick={() => void executeStreamRun()}
            className="flex items-center gap-1.5 rounded-md bg-mdb-leaf/20 border border-mdb-leaf/35 text-mdb-leaf px-3 py-1.5 text-xs font-medium hover:bg-mdb-leaf/30 disabled:opacity-40 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
            Run
          </button>
          <button
            type="button"
            disabled={running || nodes.length === 0}
            onClick={async () => {
              setErr(null);
              try {
                const res = await api.flows.runPersist({ nodes, edges, flow_id: savedId ?? undefined });
                setRunnerLines((p) => [
                  ...p,
                  { kind: "heading", content: `Findings saved - ${res.findings_count} finding(s)` },
                  { kind: "text", content: `Run ID: ${res.run_id}` },
                ]);
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
            className="rounded-md border border-[#112733] text-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-white/[0.02] disabled:opacity-40 transition-colors"
          >
            Save findings
          </button>
          <button
            type="button"
            onClick={() => {
              if (nodes.length === 0 || confirm("Clear all nodes from canvas?")) {
                setNodes([]);
                setEdges([]);
                setSavedId(null);
                setFlowName("Untitled flow");
              }
            }}
            className="rounded-md border border-[#112733] text-slate-400 px-3 py-1.5 text-xs hover:bg-white/[0.02] transition-colors"
          >
            Clear
          </button>

          <div className="h-5 w-px bg-[#112733]" />

          {savedId && (
            <button
              type="button"
              onClick={async () => {
                if (!savedId || !confirm("Delete this saved flow?")) return;
                try {
                  await api.flows.delete(savedId);
                  setSavedList((l) => l.filter((f) => f.id !== savedId));
                  setSavedId(null);
                  setNodes([]);
                  setEdges([]);
                  setFlowName("Untitled flow");
                } catch (e) {
                  setErr((e as Error).message);
                }
              }}
              className="rounded-md border border-red-500/25 text-red-400/70 px-3 py-1.5 text-xs hover:bg-red-500/10 transition-colors"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            disabled={saveBusy}
            onClick={saveFlow}
            className="rounded-md bg-mdb-leaf text-mdb-forest px-4 py-1.5 text-xs font-semibold hover:bg-mdb-leaf/90 disabled:opacity-40"
          >
            {saveBusy ? "Saving..." : "Save"}
          </button>
        </div>
      </header>

      {err && (
        <div className="shrink-0 mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {err}
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Palette */}
        <aside
          className={`shrink-0 border-r border-[#112733] bg-[#0B2330] flex flex-col overflow-hidden transition-[width] duration-200 ${
            sidebarCollapsed ? "w-10" : "w-[260px]"
          }`}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#112733] shrink-0">
            {!sidebarCollapsed && (
              <span className="text-[10px] font-semibold text-[#5C6C75] uppercase tracking-wider">Components</span>
            )}
            <button
              type="button"
              title={sidebarCollapsed ? "Expand" : "Collapse"}
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="ml-auto text-[#5C6C75] hover:text-mdb-leaf p-0.5 rounded"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {sidebarCollapsed ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />}
              </svg>
            </button>
          </div>
          {!sidebarCollapsed && (
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {TOOL_PALETTE.map((group) => (
                <div key={group.title}>
                  <p className="text-[10px] font-semibold text-[#5C6C75] uppercase tracking-wider mb-2">{group.title}</p>
                  <div className="space-y-1.5">
                    {group.items.map((item) => {
                      const theme = getToolTheme(item.tool);
                      return (
                        <button
                          key={item.tool + item.label}
                          type="button"
                          onClick={() => addTool(item.tool)}
                          className={`w-full text-left rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${theme.bg} ${theme.border} hover:border-mdb-leaf/50`}
                        >
                          <div className={`text-[12px] font-medium ${theme.accent}`}>{item.label}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{item.hint}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={applyDemo}
                className="w-full rounded-lg border border-[#112733] text-mdb-leaf text-xs py-2.5 hover:bg-mdb-leaf/10"
              >
                Load backup demo
              </button>
            </div>
          )}
        </aside>

        {/* Canvas */}
        <div className="flex-1 min-w-0 relative min-h-0" data-tour="flow-canvas">
          <ReactFlowProvider>
            <FlowCanvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeOpen={setEditingId}
              sig={sig}
            />
          </ReactFlowProvider>
        </div>

        {/* Resize handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          className="w-1 shrink-0 cursor-col-resize hover:bg-mdb-leaf/40 bg-transparent border-l border-[#112733]"
          onMouseDown={(e) => {
            termDrag.current = { startX: e.clientX, startW: termW };
            e.preventDefault();
          }}
        />

        {/* Terminal */}
        <aside
          data-tour="flow-terminal"
          className="shrink-0 flex flex-col border-l border-[#112733] bg-[#001E2B] min-h-0"
          style={{ width: termW }}
        >
          <div className="flex items-center justify-between px-3 py-2 bg-[#0B2330] border-b border-[#112733] shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-mdb-leaf/80" />
              <span className="text-[11px] text-[#5C6C75] ml-2 font-mono">flow-runner</span>
            </div>
            <span className="text-[9px] text-[#5C6C75] uppercase">mock</span>
          </div>
          <div
            ref={termScrollRef}
            className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed text-slate-400 space-y-1 min-h-0"
          >
            <div>
              <span className="text-mdb-leaf font-semibold">MDBA Flow Runner</span>{" "}
              <span className="text-slate-500">v1.0</span>
            </div>
            <div className="text-[#112733]">{'─'.repeat(40)}</div>
            {runnerLines.length === 0 && (
              <p className="text-[#5C6C75] mt-2">
                Type <span className="text-slate-400">help</span> or <span className="text-slate-400">run</span> to start.
              </p>
            )}
            {runnerLines.map((line, i) => {
              if (line.kind === "echo")
                return (
                  <div key={i} className="text-white mt-2">
                    <span className="text-mdb-leaf">$</span> {line.content}
                  </div>
                );
              if (line.kind === "state")
                return (
                  <pre key={i} className="text-amber-400/80 text-[10px] whitespace-pre-wrap border-l-2 border-amber-400/30 pl-2 my-1">
                    {line.content}
                  </pre>
                );
              if (line.kind === "heading")
                return (
                  <div key={i} className="text-white font-medium text-xs pt-2 border-t border-[#112733] first:border-0">
                    {line.content}
                  </div>
                );
              if (line.kind === "code")
                return (
                  <pre key={i} className="text-mdb-leaf/80 whitespace-pre-wrap break-all text-[10px]">
                    {line.content}
                  </pre>
                );
              if (line.kind === "json")
                return (
                  <pre key={i} className="text-[#3D9CFF]/80 whitespace-pre-wrap break-all text-[10px]">
                    {line.content}
                  </pre>
                );
              return (
                <p key={i} className="text-slate-400 whitespace-pre-wrap">
                  {line.content}
                </p>
              );
            })}
          </div>
          <div className="shrink-0 border-t border-[#112733] px-2 py-1.5 flex items-center gap-2 bg-[#0B2330]">
            <span className="text-mdb-leaf font-mono text-sm select-none">$</span>
            <input
              type="text"
              className="flex-1 min-w-0 bg-transparent text-[11px] text-white font-mono outline-none placeholder:text-[#5C6C75]"
              value={termInput}
              onChange={(e) => setTermInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = termInput;
                  setTermInput("");
                  processTermCommand(v);
                }
              }}
              placeholder="help | run | list | clear | abort"
              disabled={running}
              aria-label="Terminal input"
            />
          </div>
        </aside>
      </div>

      {savedId && (
        <p className="shrink-0 text-center text-[10px] text-[#5C6C75] py-1 border-t border-[#112733]">
          Saved: {savedId.slice(0, 8)}...
        </p>
      )}

      {/* Edit Modal */}
      {editingId && editingNode?.type === "tool" && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60"
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-[440px] rounded-xl border border-[#112733] bg-[#0B2330] shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-semibold text-white">
              Edit {(editingNode.data as ToolNodeData).tool.replace("_", " ")} step
            </h3>
            <p className="text-xs text-[#5C6C75] mt-1">Configure this step's behavior.</p>

            <label className="block text-[11px] text-[#5C6C75] mt-4">Step title</label>
            <input
              className="mt-1.5 w-full rounded-lg bg-[#001E2B] border border-[#112733] px-3 py-2 text-sm text-white focus:border-mdb-leaf outline-none"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
            />

            <label className="block text-[11px] text-[#5C6C75] mt-4">Prompt / instructions</label>
            <textarea
              className="mt-1.5 w-full rounded-lg bg-[#001E2B] border border-[#112733] px-3 py-2.5 text-sm text-white min-h-[120px] resize-y focus:border-mdb-leaf outline-none"
              value={draftPrompt}
              onChange={(e) => setDraftPrompt(e.target.value)}
              placeholder="Enter instructions..."
            />

            <label className="flex items-center gap-3 mt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={draftMemory}
                onChange={(e) => setDraftMemory(e.target.checked)}
                className="rounded border-[#112733] accent-mdb-leaf w-4 h-4"
              />
              <span className="text-xs text-slate-400">Include prior task memory</span>
            </label>

            <div className="flex flex-wrap gap-2 mt-6 justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-[#112733] text-slate-400 px-4 py-2 text-sm hover:bg-white/[0.02]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveModal}
                className="rounded-lg bg-mdb-leaf text-mdb-forest px-4 py-2 text-sm font-semibold"
              >
                Save
              </button>
              <button
                type="button"
                onClick={deleteStep}
                className="text-sm text-red-400/70 hover:text-red-300 ml-2"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
