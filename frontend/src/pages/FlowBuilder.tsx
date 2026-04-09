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
import { toolNodeTheme } from "@/flow/toolNodeTheme";
import type { FlowRunLogEntry, ToolFlow } from "@/types";

/** Server-sent step boundary (Eugene-style status as NDJSON lines). */
function renderStateBlock(content: string) {
  return (
    <pre className="text-[#e3b341]/90 text-[10px] whitespace-pre-wrap border-l-2 border-[#e3b341]/35 pl-2 my-1 font-mono leading-snug">
      {content}
    </pre>
  );
}

function findTailId(nodes: Node[], edges: Edge[]): string | null {
  if (nodes.length === 0) return null;
  const sources = new Set(edges.map((e) => e.source));
  const leaves = nodes.filter((n) => !sources.has(n.id));
  const pick = (arr: Node[]) =>
    [...arr].sort((a, b) => (b.position?.y ?? 0) - (a.position?.y ?? 0))[0];
  return pick(leaves.length ? leaves : nodes).id;
}

function ToolRfNode({ data, selected }: NodeProps<Node<ToolNodeData, "tool">>) {
  const t = toolNodeTheme(data.tool);
  const preview =
    data.prompt.trim().slice(0, 140) + (data.prompt.length > 140 ? "…" : "") ||
    "Double-click to add instructions…";
  const border = selected ? t.borderSel : t.borderIdle;
  return (
    <div
      className={`rounded-[10px] border-[1.5px] w-[300px] min-h-[88px] px-3.5 pt-2.5 pb-3 shadow-lg transition-all ${t.bg} ${border} ${
        selected ? "shadow-[0_0_0_3px_rgba(129,140,248,0.35)] z-10" : "z-[1]"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-[#4b5563] !w-[14px] !h-[14px] !border-2 !border-[#1a1a2e] -top-[7px]"
      />
      <div className={`text-[10px] uppercase tracking-wider font-bold ${t.hint}`}>{data.tool.replace("_", " ")}</div>
      <div className={`text-[13px] font-bold leading-snug mt-1 ${t.accent}`}>{data.label}</div>
      <div
        className={`mt-2 pt-2 border-t text-[12px] leading-snug line-clamp-4 ${
          data.prompt.trim() ? t.accent : `${t.hint} italic`
        }`}
        style={{ borderColor: "rgba(129, 140, 248, 0.25)" }}
      >
        {preview}
      </div>
      {data.include_prior_memory && (
        <span className={`inline-block mt-2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${t.pill}`}>
          Prior memory on
        </span>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-[#818cf8] !w-[14px] !h-[14px] !border-2 !border-[#1a1a2e] -bottom-[7px]"
      />
    </div>
  );
}

const nodeTypes = { tool: ToolRfNode };

const edgeDefaults = {
  type: "smoothstep" as const,
  markerEnd: { type: MarkerType.ArrowClosed, color: "#818cf8", width: 18, height: 18 },
  style: { stroke: "#818cf8", strokeWidth: 2 },
};

function backupMonitorDemo(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node<ToolNodeData, "tool">[] = [
    {
      id: "demo-1",
      type: "tool",
      position: { x: 80, y: 40 },
      data: {
        tool: "atlas_api",
        label: "Atlas API · invoices",
        prompt:
          "Grab the previous month's invoice for atlas org 5f32de177f39cd00a6fb1071. Use the fromDate param to bound the query to the month we care about.",
        include_prior_memory: false,
      },
    },
    {
      id: "demo-2",
      type: "tool",
      position: { x: 80, y: 200 },
      data: {
        tool: "atlas_api",
        label: "Atlas API · line items",
        prompt:
          "Get invoice details for each id from the prior step. Summarize total backup cost by cluster and overall. Keep each invoice separate; use period end as the invoice date in summaries.",
        include_prior_memory: true,
      },
    },
    {
      id: "demo-3",
      type: "tool",
      position: { x: 80, y: 360 },
      data: {
        tool: "mdba",
        label: "MDBA · delta",
        prompt:
          "Subtract the most recent totalBackupCostCents from the prior month to compute the month-over-month delta.",
        include_prior_memory: true,
      },
    },
    {
      id: "demo-4",
      type: "tool",
      position: { x: 80, y: 520 },
      data: {
        tool: "slack",
        label: "Slack · alert",
        prompt: "If the delta in backup costs is > 1000 (USD basis) then send a notification to the channel.",
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
        className="!bg-[#1a1a2e]"
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
        <Background gap={24} size={1} color="#2d2d4e" variant={BackgroundVariant.Dots} />
        <Controls
          className="!bg-[#16162a]/95 !border !border-[#2d2d4e] !rounded-lg !shadow-lg [&_button]:!fill-[#818cf8] [&_button:hover]:!bg-[#2d2d4e]"
          showInteractive={false}
        />
        <FitViewEffect sig={sig} />
      </ReactFlow>
    </div>
  );
}

export function FlowBuilder() {
  const { active: tourActive } = useTour();
  const location = useLocation();
  const [flowName, setFlowName] = useState("backup monitor");
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
  const [termW, setTermW] = useState(520);
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

  // Hydrate from route state (e.g. "Open in flow editor" from WorkflowDetail)
  useEffect(() => {
    const st = location.state as { nodes?: unknown[]; edges?: unknown[]; flowName?: string } | null;
    if (st?.nodes && Array.isArray(st.nodes) && st.nodes.length > 0) {
      setNodes(st.nodes as Node[]);
      setEdges((st.edges ?? []) as Edge[]);
      if (st.flowName) setFlowName(st.flowName);
      setSavedId(null);
      setRunnerLines([]);
      window.history.replaceState({}, "");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tourRanRef = useRef(false);

  // Auto-load backup demo AND auto-run when tour navigates here
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

  useEffect(() => {
    const onMove = (ev: Event) => {
      const e = ev as globalThis.MouseEvent;
      if (!termDrag.current) return;
      const dx = termDrag.current.startX - e.clientX;
      const maxW = Math.min(window.innerWidth * 0.62, 900);
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
      const lastY = tail ? (nodes.find((n) => n.id === tail)?.position.y ?? 0) : -160;
      const newNode: Node<ToolNodeData, "tool"> = {
        id,
        type: "tool",
        position: { x: 120, y: lastY + 160 },
        data: {
          tool,
          label,
          prompt: "",
          include_prior_memory: false,
        },
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

  /** NDJSON stream from FastAPI — same mock data as before, emitted line-by-line. */
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
          { kind: "text", content: "Commands (client + server):" },
          { kind: "text", content: "  help   — this list" },
          { kind: "text", content: "  clear  — wipe the terminal" },
          { kind: "text", content: "  list   — nodes on the canvas" },
          { kind: "text", content: "  edges  — edges between nodes" },
          { kind: "text", content: "  run    — stream mock execution (POST /api/flows/run/stream)" },
          { kind: "text", content: "  abort  — stop an in-flight stream" },
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
          return { kind: "text", content: `  ${i + 1}. [${d.tool}] ${d.label}  id=${n.id}` };
        });
        setRunnerLines((p) => [...p, ...rows]);
        return;
      }
      if (head === "edges") {
        if (!edges.length) {
          setRunnerLines((p) => [...p, { kind: "text", content: "(no edges)" }]);
          return;
        }
        const rows: FlowRunLogEntry[] = edges.map((ed, i) => {
          const src = nodes.find((n) => n.id === ed.source);
          const tgt = nodes.find((n) => n.id === ed.target);
          const sl = src && src.type === "tool" ? (src.data as ToolNodeData).label : ed.source;
          const tl = tgt && tgt.type === "tool" ? (tgt.data as ToolNodeData).label : ed.target;
          return { kind: "text", content: `  ${i + 1}. ${sl} → ${tl}` };
        });
        setRunnerLines((p) => [...p, ...rows]);
        return;
      }
      if (head === "run") {
        if (!nodes.length) {
          setRunnerLines((p) => [...p, { kind: "text", content: "(no nodes — add tools from the palette)" }]);
          return;
        }
        void executeStreamRun();
        return;
      }
      if (head === "abort") {
        streamAbortRef.current?.abort();
        setRunnerLines((p) => [...p, { kind: "text", content: "Aborted stream." }]);
        return;
      }
      setRunnerLines((p) => [...p, { kind: "text", content: "Unknown command. Type help." }]);
    },
    [nodes, edges, executeStreamRun]
  );

  const resetRunner = useCallback(() => {
    streamAbortRef.current?.abort();
    setRunnerLines([]);
    setErr(null);
  }, []);

  // Auto-run the flow once nodes are loaded during the tour
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
    <div className="flex flex-col flex-1 min-h-0 bg-[#1e1e2e] text-slate-200">
      {/* Top bar — Eugene-style */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center h-11 shrink-0 px-4 border-b border-[#2d2d4e] bg-[#16162a]">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/advisor"
            className="flex items-center gap-1.5 text-[13px] font-semibold text-[#818cf8] hover:text-indigo-300 shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
            </svg>
            Chat
          </Link>
          <div className="w-px h-5 bg-[#2d2d4e] shrink-0" />
          <input
            className="text-[13px] font-semibold bg-transparent border-b border-[#4b5563] focus:border-[#818cf8] outline-none px-1 py-0.5 text-[#e2e8f0] max-w-[220px] min-w-0"
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            placeholder="Untitled flow"
          />
          <select
            className="text-[11px] rounded-md bg-[#1e293b] border border-[#334155] text-slate-400 px-2 py-1 max-w-[140px]"
            value=""
            title="Load saved flow"
            onChange={(e) => {
              const v = e.target.value;
              if (v) loadFlow(v);
              e.target.value = "";
            }}
          >
            <option value="">Load…</option>
            {savedList.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 justify-center">
          <button
            type="button"
            disabled={running || nodes.length === 0}
            onClick={() => void executeStreamRun()}
            className="flex items-center gap-1.5 rounded-md bg-[#1e293b] text-slate-300 border border-[#334155] px-3 py-1.5 text-xs font-semibold hover:bg-[#1d4ed8] hover:text-white hover:border-[#2563eb] disabled:opacity-40 transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
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
                  { kind: "heading", content: `Findings saved — ${res.findings_count} finding(s) persisted` },
                  { kind: "text", content: `Run ID: ${res.run_id}` },
                  { kind: "text", content: "View findings in the Findings page." },
                ]);
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
            className="flex items-center gap-1.5 rounded-md bg-[#1e293b] text-mdb-leaf border border-mdb-leaf/30 px-3 py-1.5 text-xs font-semibold hover:bg-mdb-leaf/10 disabled:opacity-40 transition-colors"
            title="Run and persist findings to the findings inbox"
          >
            Save findings
          </button>
          <button
            type="button"
            onClick={resetRunner}
            className="flex items-center gap-1.5 rounded-md bg-[#1e293b] text-slate-400 border border-[#334155] px-3 py-1.5 text-xs font-semibold hover:bg-[#334155] hover:text-[#e2e8f0] transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Reset log
          </button>
        </div>

        <div className="flex items-center gap-1.5 justify-end">
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
              className="rounded-md border border-red-500/25 text-red-400 px-3 py-1.5 text-xs hover:bg-red-500/10 transition-colors"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            disabled={saveBusy}
            onClick={saveFlow}
            className="rounded-md bg-[#16a34a] text-white px-3.5 py-1.5 text-xs font-semibold hover:bg-green-600 disabled:opacity-40"
          >
            {saveBusy ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {err && (
        <div className="shrink-0 mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {err}
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Palette */}
        <aside
          className={`shrink-0 border-r border-[#2d2d4e] bg-[#16162a] flex flex-col overflow-hidden transition-[width] duration-200 ${
            sidebarCollapsed ? "w-9" : "w-[300px]"
          }`}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#2d2d4e] shrink-0">
            {!sidebarCollapsed && (
              <span className="text-[10.5px] font-bold text-[#4b5563] uppercase tracking-wider">Components</span>
            )}
            <button
              type="button"
              title={sidebarCollapsed ? "Expand palette" : "Collapse palette"}
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="ml-auto text-[#4b5563] hover:text-[#818cf8] p-0.5 rounded"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                {sidebarCollapsed ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />}
              </svg>
            </button>
          </div>
          {!sidebarCollapsed && (
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
              {TOOL_PALETTE.map((group) => (
                <div key={group.title}>
                  <p className="text-[10.5px] font-bold text-[#4b5563] uppercase tracking-wider mb-2">{group.title}</p>
                  <div className="space-y-2">
                    {group.items.map((item) => {
                      const th = toolNodeTheme(item.tool);
                      return (
                        <button
                          key={item.tool + item.label}
                          type="button"
                          onClick={() => addTool(item.tool)}
                          className={`w-full text-left rounded-[7px] border px-3 py-2.5 cursor-pointer transition-colors ${th.bg} ${th.borderIdle} hover:brightness-110`}
                        >
                          <div className={`text-[12.5px] font-semibold ${th.accent}`}>{item.label}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{item.hint}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={applyDemo}
                className="w-full rounded-[7px] border border-[#334155] text-[#818cf8] text-xs py-2.5 hover:bg-[#1e293b]"
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

        {/* Resize */}
        <div
          role="separator"
          aria-orientation="vertical"
          className="w-1 shrink-0 cursor-col-resize hover:bg-[#818cf8]/60 bg-transparent border-l border-[#2d2d4e]"
          onMouseDown={(e) => {
            termDrag.current = { startX: e.clientX, startW: termW };
            e.preventDefault();
          }}
        />

        {/* Terminal */}
        <aside
          data-tour="flow-terminal"
          className="shrink-0 flex flex-col border-l border-[#2d2d4e] bg-[#0d1117] min-h-0"
          style={{ width: termW }}
        >
          <div className="flex items-center justify-between px-3 py-2 bg-[#161b22] border-b border-[#21262d] shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
              <span className="text-[11px] text-[#8b949e] ml-2 font-mono">bash — flow-runner</span>
            </div>
            <span className="text-[9px] text-[#484f58] uppercase">mock</span>
          </div>
          <div
            ref={termScrollRef}
            className="flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-relaxed text-[#c9d1d9] space-y-1 min-h-0"
          >
            <div>
              <span className="text-[#58a6ff] font-bold">MDBA Flow Runner</span>{" "}
              <span className="text-[#3fb950]">v1.0</span>
            </div>
            <div className="text-[#4b5563]">─────────────────────────────────</div>
            {runnerLines.length === 0 && (
              <p className="text-[#484f58] mt-2">
                Type <span className="text-[#8b949e]">help</span> or <span className="text-[#8b949e]">run</span> — output
                streams from the API (mock Atlas / Mongo / Slack JSON).
              </p>
            )}
            {runnerLines.map((line, i) => {
              if (line.kind === "echo")
                return (
                  <div key={i} className="text-[#e2e8f0] mt-2">
                    <span className="text-[#3fb950]">❯</span> {line.content}
                  </div>
                );
              if (line.kind === "state") return <div key={i}>{renderStateBlock(line.content)}</div>;
              if (line.kind === "heading")
                return (
                  <div key={i} className="text-[#e2e8f0] font-semibold text-xs pt-2 border-t border-[#21262d] first:border-0">
                    {line.content}
                  </div>
                );
              if (line.kind === "code")
                return (
                  <pre key={i} className="text-[#3fb950]/90 whitespace-pre-wrap break-all text-[11px]">
                    {line.content}
                  </pre>
                );
              if (line.kind === "json")
                return (
                  <pre key={i} className="text-[#79c0ff]/90 whitespace-pre-wrap break-all text-[10px]">
                    {line.content}
                  </pre>
                );
              return (
                <p key={i} className="text-[#8b949e] whitespace-pre-wrap">
                  {line.content}
                </p>
              );
            })}
          </div>
          <div className="shrink-0 border-t border-[#21262d] px-2 py-1.5 flex items-center gap-2 bg-[#0d1117]">
            <span className="text-[#3fb950] font-mono text-sm select-none">❯</span>
            <input
              type="text"
              className="flex-1 min-w-0 bg-transparent text-[12px] text-[#e2e8f0] font-mono outline-none placeholder:text-[#484f58]"
              value={termInput}
              onChange={(e) => setTermInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = termInput;
                  setTermInput("");
                  processTermCommand(v);
                }
              }}
              placeholder="help · run · list · edges · clear · abort"
              disabled={running}
              aria-label="Flow runner command line"
            />
          </div>
        </aside>
      </div>

      {savedId && (
        <p className="shrink-0 text-center text-[10px] text-[#4b5563] py-1 border-t border-[#2d2d4e]">
          Saved id · {savedId.slice(0, 8)}…
        </p>
      )}

      {editingId && editingNode?.type === "tool" && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60"
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-[460px] rounded-[10px] border border-[#2d2d4e] bg-[#1e2433] shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-bold text-[#e2e8f0]">
              {(editingNode.data as ToolNodeData).tool === "mongodb"
                ? "MongoDB command"
                : (editingNode.data as ToolNodeData).tool === "atlas_api"
                  ? "Atlas API request"
                  : (editingNode.data as ToolNodeData).tool === "mdba"
                    ? "MDBA prompt"
                    : `Configure · ${(editingNode.data as ToolNodeData).label}`}
            </h3>
            <p className="text-xs text-[#6b7280] mt-1">Sent to the tool when the step runs (mock runner today).</p>
            <label className="block text-[11px] text-[#6b7280] mt-4">Step title</label>
            <input
              className="mt-1.5 w-full rounded-md bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm text-[#c9d1d9] focus:border-[#818cf8] outline-none"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
            />
            <label className="block text-[11px] text-[#6b7280] mt-4">Prompt</label>
            <textarea
              className="mt-1.5 w-full rounded-md bg-[#0d1117] border border-[#30363d] px-3 py-2.5 text-sm text-[#c9d1d9] min-h-[140px] resize-y focus:border-[#818cf8] outline-none"
              value={draftPrompt}
              onChange={(e) => setDraftPrompt(e.target.value)}
              placeholder="Enter prompt…"
            />
            <label className="flex items-center gap-3 mt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={draftMemory}
                onChange={(e) => setDraftMemory(e.target.checked)}
                className="rounded border-[#30363d] accent-[#16a34a] w-4 h-4"
              />
              <span className="text-xs text-[#8b949e]">Include prior task memory</span>
            </label>
            <div className="flex flex-wrap gap-2 mt-6 justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md bg-[#21262d] border border-[#30363d] text-[#8b949e] px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveModal}
                className="rounded-md bg-[#16a34a] text-white px-4 py-2 text-sm font-semibold"
              >
                Save
              </button>
              <button type="button" onClick={deleteStep} className="text-sm text-red-400 hover:underline ml-2">
                Remove step
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
