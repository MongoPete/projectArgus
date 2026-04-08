import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
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

function findTailId(nodes: Node[], edges: Edge[]): string | null {
  if (nodes.length === 0) return null;
  const sources = new Set(edges.map((e) => e.source));
  const leaves = nodes.filter((n) => !sources.has(n.id));
  const pick = (arr: Node[]) =>
    [...arr].sort((a, b) => (b.position?.y ?? 0) - (a.position?.y ?? 0))[0];
  return pick(leaves.length ? leaves : nodes).id;
}

function ToolRfNode({ data, selected }: NodeProps<Node<ToolNodeData, "tool">>) {
  const preview =
    data.prompt.trim().slice(0, 72) + (data.prompt.length > 72 ? "…" : "") || "Tap to add instructions…";
  return (
    <div
      className={`rounded-2xl border min-w-[220px] max-w-[280px] px-3 py-2.5 shadow-md transition-all ${
        selected
          ? "border-mdb-leaf/50 bg-mdb-leaf/10 ring-1 ring-mdb-leaf/30"
          : "border-mdb-leaf/20 bg-mdb-forest/30 hover:border-mdb-leaf/40"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-2 !h-2 !border-0" />
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{data.tool.replace("_", " ")}</div>
      <div className="text-sm font-medium text-white mt-0.5">{data.label}</div>
      <p className="text-[11px] text-slate-500 mt-1.5 leading-snug line-clamp-2">{preview}</p>
      {data.include_prior_memory && (
        <span className="inline-block mt-2 text-[9px] uppercase tracking-wider text-mdb-leaf/90 bg-mdb-leaf/10 px-1.5 py-0.5 rounded">
          Memory on
        </span>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-mdb-leaf !w-2 !h-2 !border-0" />
    </div>
  );
}

const nodeTypes = { tool: ToolRfNode };

const edgeDefaults = {
  type: "smoothstep" as const,
  markerEnd: { type: MarkerType.ArrowClosed, color: "#64748b", width: 16, height: 16 },
  style: { stroke: "#475569", strokeWidth: 1.5 },
};

function backupMonitorDemo(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node<ToolNodeData, "tool">[] = [
    {
      id: "demo-1",
      type: "tool",
      position: { x: 300, y: 0 },
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
      position: { x: 300, y: 130 },
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
      position: { x: 300, y: 260 },
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
      position: { x: 300, y: 390 },
      data: {
        tool: "slack",
        label: "Slack · alert",
        prompt: "If the delta in backup costs is > 1000 (USD basis) then send a notification to @eugene-kang.",
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
    const t = requestAnimationFrame(() => fitView({ padding: 0.2, duration: 200, minZoom: 0.4, maxZoom: 1.2 }));
    return () => cancelAnimationFrame(t);
  }, [sig, fitView]);
  return null;
}

function FlowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNodeClick,
  sig,
}: {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange<Node>;
  onEdgesChange: OnEdgesChange<Edge>;
  onNodeClick: (id: string) => void;
  sig: string;
}) {
  const handleClick = useCallback(
    (_: MouseEvent, n: Node) => {
      if (n.type === "tool") onNodeClick(n.id);
    },
    [onNodeClick]
  );

  return (
    <div className="h-[min(520px,58vh)] min-h-[360px] w-full rounded-2xl border border-mdb-leaf/20 bg-mdb-slate overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25, minZoom: 0.35, maxZoom: 1.25 }}
        panOnScroll
        zoomOnScroll
        nodesDraggable
        nodesConnectable={false}
        deleteKeyCode="Delete"
        defaultEdgeOptions={edgeDefaults}
      >
        <Background color="#1e293b" gap={18} size={1} />
        <Controls
          className="!bg-mdb-forest/95 !border-mdb-leaf/25 !rounded-xl [&_button]:!fill-mdb-leaf"
          showInteractive={false}
        />
        <FitViewEffect sig={sig} />
      </ReactFlow>
    </div>
  );
}

export function FlowBuilder() {
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
      const lastY = tail ? (nodes.find((n) => n.id === tail)?.position.y ?? 0) : -130;
      const newNode: Node<ToolNodeData, "tool"> = {
        id,
        type: "tool",
        position: { x: 300, y: lastY + 130 },
        data: {
          tool,
          label,
          prompt: "",
          include_prior_memory: false,
        },
      };
      setNodes((ns) => [...ns, newNode]);
      if (tail) {
        setEdges((es) => [
          ...es,
          { id: `e-${tail}-${id}`, source: tail, target: id, ...edgeDefaults },
        ]);
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

  const runFlow = useCallback(async () => {
    setErr(null);
    setRunning(true);
    setRunnerLines([]);
    try {
      const res = savedId
        ? await api.flows.runSaved(savedId)
        : await api.flows.runInline({ nodes, edges });
      setRunnerLines(res.entries);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [nodes, edges, savedId]);

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
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">MDBA Flow Builder</h1>
          <p className="text-slate-400 text-sm mt-1 max-w-xl">
            Drag tools onto the canvas (or use <strong className="text-slate-300">Add</strong>). Click a step to write
            prompts and toggle <strong className="text-mdb-leaf">prior-step memory</strong>. Run to see a mock
            flow-runner log — the 20% lane for edge cases.
          </p>
        </div>
        <Link
          to="/assistant"
          className="text-xs text-slate-500 hover:text-mdb-leaf rounded-xl border border-mdb-leaf/15 px-3 py-2"
        >
          ← Chat
        </Link>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.08] px-4 py-3 text-sm text-red-200">
          {err}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <aside className="xl:col-span-2 space-y-6">
          {TOOL_PALETTE.map((group) => (
            <div key={group.title}>
              <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">{group.title}</h2>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <button
                    key={item.tool + item.label}
                    type="button"
                    onClick={() => addTool(item.tool)}
                    className="w-full text-left rounded-2xl border border-mdb-leaf/15 bg-mdb-forest/25 px-3 py-3 hover:bg-mdb-leaf/10 hover:border-mdb-leaf/30 transition-colors"
                  >
                    <div className="text-sm font-medium text-white">{item.label}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{item.hint}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={applyDemo}
            className="w-full rounded-2xl border border-mdb-leaf/30 text-mdb-leaf text-sm py-2.5 hover:bg-mdb-leaf/10"
          >
            Load backup demo
          </button>
        </aside>

        <div className="xl:col-span-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="flex-1 min-w-[200px] rounded-2xl bg-mdb-forest/20 border border-mdb-leaf/20 px-4 py-2.5 text-sm text-white"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              placeholder="Flow name"
            />
            <select
              className="rounded-2xl bg-mdb-forest/20 border border-mdb-leaf/20 px-3 py-2.5 text-sm text-slate-300 max-w-[200px]"
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v) loadFlow(v);
                e.target.value = "";
              }}
            >
              <option value="">Load saved…</option>
              {savedList.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={saveBusy}
              onClick={saveFlow}
              className="rounded-2xl bg-mdb-leaf text-mdb-forest px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
            >
              {saveBusy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={running || nodes.length === 0}
              onClick={runFlow}
              className="rounded-2xl border border-mdb-leaf/35 text-mdb-leaf px-4 py-2.5 text-sm hover:bg-mdb-leaf/10 disabled:opacity-40"
            >
              {running ? "Running…" : "Run"}
            </button>
          </div>
          {savedId && <p className="text-[11px] text-slate-600">Saved · {savedId.slice(0, 8)}…</p>}

          <ReactFlowProvider>
            <FlowCanvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={setEditingId}
              sig={sig}
            />
          </ReactFlowProvider>
          <p className="text-[11px] text-slate-600">
            Tip: connect steps by adding tools in order, or drag nodes. Delete key removes selected nodes (edges may need
            cleanup).
          </p>
        </div>

        <aside className="xl:col-span-4 rounded-2xl border border-mdb-leaf/15 bg-black/40 overflow-hidden flex flex-col min-h-[360px] max-h-[min(560px,62vh)]">
          <div className="px-4 py-3 border-b border-mdb-leaf/15 flex items-center justify-between gap-2">
            <span className="text-xs font-mono text-slate-400">bash — flow-runner</span>
            <span className="text-[10px] text-slate-600">mock</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed text-slate-400 space-y-3">
            {runnerLines.length === 0 && (
              <p className="text-slate-600">Run the flow to see reasoning, fake API paths, and JSON here.</p>
            )}
            {runnerLines.map((line, i) => {
              if (line.kind === "heading")
                return (
                  <div key={i} className="text-slate-200 font-semibold text-xs pt-2 border-t border-mdb-leaf/15 first:border-0 first:pt-0">
                    {line.content}
                  </div>
                );
              if (line.kind === "code")
                return (
                  <pre key={i} className="text-emerald-400/90 whitespace-pre-wrap break-all">
                    {line.content}
                  </pre>
                );
              if (line.kind === "json")
                return (
                  <pre key={i} className="text-sky-300/80 whitespace-pre-wrap break-all text-[10px]">
                    {line.content}
                  </pre>
                );
              return (
                <p key={i} className="text-slate-500 whitespace-pre-wrap">
                  {line.content}
                </p>
              );
            })}
          </div>
        </aside>
      </div>

      {editingId && editingNode?.type === "tool" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-mdb-leaf/25 bg-mdb-forest/60 shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white">
              {(editingNode.data as ToolNodeData).tool === "atlas_api"
                ? "Atlas API request"
                : `Configure · ${(editingNode.data as ToolNodeData).label}`}
            </h3>
            <p className="text-xs text-slate-500 mt-1">Handhold the tool with an explicit prompt. Iterate until the runner matches your spec.</p>
            <label className="block text-xs text-slate-500 mt-4">Step title</label>
            <input
              className="mt-1.5 w-full rounded-xl bg-mdb-slate/80 border border-mdb-leaf/20 px-3 py-2.5 text-sm text-white"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
            />
            <label className="block text-xs text-slate-500 mt-4">Prompt</label>
            <textarea
              className="mt-1.5 w-full rounded-xl bg-mdb-slate/80 border border-mdb-leaf/20 px-3 py-3 text-sm text-white min-h-[140px] resize-y"
              value={draftPrompt}
              onChange={(e) => setDraftPrompt(e.target.value)}
              placeholder="e.g. Use fromDate for the invoice window…"
            />
            <label className="flex items-center gap-3 mt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={draftMemory}
                onChange={(e) => setDraftMemory(e.target.checked)}
                className="rounded border-mdb-leaf/40 accent-mdb-leaf w-4 h-4"
              />
              <span className="text-sm text-slate-300">Include prior task output as context</span>
            </label>
            <p className="text-[10px] text-slate-600 mt-2">
              Chains the previous step’s output into this prompt (pipeline memory — not long-term RAG).
            </p>
            <div className="flex flex-wrap gap-2 mt-6">
              <button
                type="button"
                onClick={saveModal}
                className="rounded-xl bg-mdb-leaf text-mdb-forest px-4 py-2.5 text-sm font-semibold"
              >
                Save
              </button>
              <button type="button" onClick={closeModal} className="rounded-xl border border-mdb-leaf/25 px-4 py-2.5 text-sm text-slate-300 hover:bg-mdb-leaf/10">
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteStep}
                className="rounded-xl text-red-400/90 text-sm px-4 py-2.5 hover:bg-red-500/10 ml-auto"
              >
                Remove step
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
