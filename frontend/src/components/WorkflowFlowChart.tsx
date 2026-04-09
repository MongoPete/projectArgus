import { useCallback, useEffect, useMemo, type MouseEvent as ReactMouseEvent } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { catalogEntry } from "@/agentCatalog";
import type { TriggerType, WorkflowStep } from "@/types";

const NODE_W = 158;
const GAP = 36;
const START_X = 20;
const Y_ROW = 88;

type PlatformData = { label: string; sub: string };
type AgentNodeData = { step: WorkflowStep };

function PlatformNode({ data }: NodeProps<Node<PlatformData, "platform">>) {
  return (
    <div className="rounded-xl border border-mdb-leaf/30 bg-mdb-forest/70 px-3 py-2.5 shadow-lg min-w-[148px] max-w-[168px]">
      <Handle type="target" position={Position.Left} className="!bg-slate-500 !w-2 !h-2 !border-0" />
      <div className="text-[9px] uppercase tracking-wider text-mdb-leaf font-medium">Platform</div>
      <div className="text-sm font-semibold text-white leading-tight mt-0.5">{data.label}</div>
      <div className="text-[10px] text-slate-500 leading-snug mt-1">{data.sub}</div>
      <Handle type="source" position={Position.Right} className="!bg-mdb-leaf !w-2 !h-2 !border-0" />
    </div>
  );
}

function AgentFlowNode({ data, selected }: NodeProps<Node<AgentNodeData, "agent">>) {
  const cat = catalogEntry(data.step.agent);
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 shadow-lg min-w-[148px] max-w-[180px] transition-colors ${
        selected
          ? "border-mdb-leaf bg-mdb-leaf/15 ring-1 ring-mdb-leaf/40"
          : "border-mdb-leaf/20 bg-mdb-slate/90 hover:border-mdb-leaf/45"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-500 !w-2 !h-2 !border-0" />
      <div className={`text-[9px] uppercase tracking-wider ${cat?.accent ?? "text-slate-400"}`}>Agent</div>
      <div className="text-sm font-medium text-white leading-tight mt-0.5 line-clamp-2">{data.step.label}</div>
      <div className="text-[10px] text-slate-500 font-mono mt-1">{data.step.agent}</div>
      <Handle type="source" position={Position.Right} className="!bg-mdb-leaf !w-2 !h-2 !border-0" />
    </div>
  );
}

function PlaceholderNode() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2.5 min-w-[148px] max-w-[168px]">
      <Handle type="target" position={Position.Left} className="!bg-slate-500 !w-2 !h-2 !border-0" />
      <div className="text-[9px] uppercase tracking-wider text-amber-400/90">Your agents</div>
      <div className="text-sm text-amber-200/80 leading-snug mt-1">Add steps from the palette →</div>
      <Handle type="source" position={Position.Right} className="!bg-amber-500/50 !w-2 !h-2 !border-0" />
    </div>
  );
}

const nodeTypes = {
  platform: PlatformNode,
  agent: AgentFlowNode,
  placeholder: PlaceholderNode,
};

function triggerSubtitle(trigger: TriggerType, scheduleCron: string | null): string {
  if (trigger === "schedule") return `Cron: ${scheduleCron || "—"}`;
  if (trigger === "change_stream") return "Change stream trigger";
  return "Manual / API run";
}

function buildElements(
  steps: WorkflowStep[],
  selectedId: string | null,
  trigger: TriggerType,
  scheduleCron: string | null
): { nodes: Node[]; edges: Edge[] } {
  const edgeStyle = {
    stroke: "#475569",
    strokeWidth: 1.5,
  };
  const marker = { type: MarkerType.ArrowClosed, color: "#64748b", width: 18, height: 18 };

  type ChainItem =
    | { id: string; kind: "platform"; label: string; sub: string }
    | { id: string; kind: "placeholder" }
    | { id: string; kind: "agent"; step: WorkflowStep };

  const chain: ChainItem[] = [
    {
      id: "ingest",
      kind: "platform",
      label: "Ingest",
      sub: `${triggerSubtitle(trigger, scheduleCron)} · signals`,
    },
  ];

  if (steps.length === 0) {
    chain.push({ id: "placeholder", kind: "placeholder" });
  } else {
    for (const s of steps) {
      chain.push({ id: `step-${s.id}`, kind: "agent", step: s });
    }
  }

  chain.push(
    { id: "synthesize", kind: "platform", label: "Synthesize", sub: "Rank · severity · TCO" },
    { id: "deliver", kind: "platform", label: "Deliver", sub: "Findings · approval · channels" }
  );

  const nodes: Node[] = chain.map((item, i) => {
    const x = START_X + i * (NODE_W + GAP);
    const base = {
      id: item.id,
      position: { x, y: Y_ROW },
      draggable: false,
    };
    if (item.kind === "platform") {
      return {
        ...base,
        type: "platform",
        data: { label: item.label, sub: item.sub },
        selectable: false,
      } satisfies Node;
    }
    if (item.kind === "placeholder") {
      return {
        ...base,
        type: "placeholder",
        data: {},
        selectable: false,
      } satisfies Node;
    }
    return {
      ...base,
      type: "agent",
      data: { step: item.step },
      selected: item.step.id === selectedId,
      selectable: true,
    } satisfies Node;
  });

  const edges: Edge[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i];
    const b = chain[i + 1];
    edges.push({
      id: `e-${a.id}-${b.id}`,
      source: a.id,
      target: b.id,
      type: "smoothstep",
      style: edgeStyle,
      markerEnd: marker,
    });
  }

  return { nodes, edges };
}

/** Fits viewport when graph structure changes. */
function FitViewOnChange({ stepsSig }: { stepsSig: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const t = requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 220, minZoom: 0.35, maxZoom: 1.2 });
    });
    return () => cancelAnimationFrame(t);
  }, [stepsSig, fitView]);
  return null;
}

type Props = {
  steps: WorkflowStep[];
  selectedId: string | null;
  trigger: TriggerType;
  scheduleCron: string | null;
  onSelectStep: (stepId: string) => void;
  /** Low-code default: calmer canvas without minimap. */
  showMiniMap?: boolean;
  heightClassName?: string;
};

function WorkflowFlowChartInner({
  steps,
  selectedId,
  trigger,
  scheduleCron,
  onSelectStep,
  showMiniMap = false,
  heightClassName = "h-[220px] min-h-[200px] sm:h-[260px] sm:min-h-[220px]",
}: Props) {
  const stepsSig = useMemo(
    () =>
      `${trigger}|${scheduleCron ?? ""}|${selectedId ?? ""}|${steps.map((s) => `${s.id}:${s.label}:${s.agent}`).join(";")}`,
    [steps, selectedId, trigger, scheduleCron]
  );

  const { nodes: builtNodes, edges: builtEdges } = useMemo(
    () => buildElements(steps, selectedId, trigger, scheduleCron),
    [steps, selectedId, trigger, scheduleCron]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(builtNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(builtEdges);

  useEffect(() => {
    const { nodes: n, edges: e } = buildElements(steps, selectedId, trigger, scheduleCron);
    setNodes(n);
    setEdges(e);
  }, [steps, selectedId, trigger, scheduleCron, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: ReactMouseEvent, node: Node) => {
      if (node.type !== "agent") return;
      const data = node.data as AgentNodeData;
      if (data?.step?.id) onSelectStep(data.step.id);
    },
    [onSelectStep]
  );

  return (
    <div
      className={`${heightClassName} w-full rounded-2xl border border-mdb-leaf/20 bg-mdb-slate overflow-hidden [&_.react-flow\_\_attribution]:bg-transparent [&_.react-flow\_\_attribution]:text-slate-600 [&_.react-flow\_\_attribution]:text-[10px]`}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        panOnScroll
        zoomOnScroll
        zoomOnPinch
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        deleteKeyCode={null}
        fitViewOptions={{ padding: 0.2, minZoom: 0.35, maxZoom: 1.25 }}
      >
        <Background color="#0d4d3a" gap={20} size={1} />
        <Controls
          className="!bg-mdb-forest/90 !border-mdb-leaf/25 !shadow-lg [&_button]:!fill-mdb-leaf/80 [&_button:hover]:!bg-mdb-leaf/15"
          showInteractive={false}
        />
        {showMiniMap && (
          <MiniMap
            className="!bg-mdb-forest/50 !border !border-mdb-leaf/20 rounded-lg"
            nodeStrokeWidth={2}
            nodeColor={() => "#023430"}
            maskColor="rgba(0, 30, 40, 0.5)"
            pannable
            zoomable
          />
        )}
        <FitViewOnChange stepsSig={stepsSig} />
      </ReactFlow>
    </div>
  );
}

/** Live LangGraph-style flow: ingest → agents → synthesize → deliver. Click an agent node to inspect it. */
export function WorkflowFlowChart(props: Props) {
  return (
    <ReactFlowProvider>
      <WorkflowFlowChartInner {...props} />
    </ReactFlowProvider>
  );
}
