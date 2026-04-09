import type {
  ChatApiResponse,
  DashboardSummary,
  Finding,
  FindingStatus,
  FlowRunLogEntry,
  FlowRunResponse,
  RunRecord,
  ToolFlow,
  Workflow,
} from "./types";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  dashboard: () => fetchJson<DashboardSummary>("/api/dashboard/summary"),
  workflows: {
    list: () => fetchJson<Workflow[]>("/api/workflows"),
    get: (id: string) => fetchJson<Workflow>(`/api/workflows/${id}`),
    create: (body: Partial<Workflow>) =>
      fetchJson<Workflow>("/api/workflows", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      fetchJson<{ ok: boolean }>(`/api/workflows/${id}`, { method: "DELETE" }),
  },
  findings: {
    list: () => fetchJson<Finding[]>("/api/findings"),
    setStatus: (id: string, status: FindingStatus) =>
      fetchJson<Finding>(`/api/findings/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
  },
  runs: {
    list: () => fetchJson<RunRecord[]>("/api/runs"),
    get: (id: string) => fetchJson<RunRecord>(`/api/runs/${id}`),
    runWorkflow: (workflowId: string) =>
      fetchJson<RunRecord>(`/api/runs/workflow/${workflowId}`, { method: "POST" }),
  },
  settings: {
    health: () => fetchJson<{ status: string; message: string }>("/api/settings/health"),
    connection: () =>
      fetchJson<{
        connected: boolean;
        cluster_name: string | null;
        server_version: string | null;
        db_name: string;
        uri_masked: string;
      }>("/api/settings/connection"),
    testConnection: (body: { uri: string; db_name: string }) =>
      fetchJson<{ ok: boolean; cluster_name?: string; server_version?: string; error?: string }>(
        "/api/settings/connection/test",
        { method: "POST", body: JSON.stringify(body) }
      ),
    saveConnection: (body: { uri: string; db_name: string }) =>
      fetchJson<{ ok: boolean; cluster_name?: string; server_version?: string; error?: string }>(
        "/api/settings/connection/save",
        { method: "POST", body: JSON.stringify(body) }
      ),
    llm: () =>
      fetchJson<{ configured: boolean; provider: string | null; model: string | null; key_masked: string | null }>(
        "/api/settings/llm"
      ),
    testLlm: (body: { openai_api_key: string }) =>
      fetchJson<{ ok: boolean; model?: string; error?: string }>("/api/settings/llm/test", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    saveLlm: (body: { openai_api_key: string | null }) =>
      fetchJson<{ ok: boolean; configured: boolean }>("/api/settings/llm/save", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    resetDemo: () =>
      fetchJson<{ ok: boolean; message: string }>("/api/settings/reset-demo", { method: "POST" }),
  },
  chat: {
    send: (body: { messages: { role: string; content: string }[] }) =>
      fetchJson<ChatApiResponse>("/api/chat", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  flows: {
    list: () => fetchJson<ToolFlow[]>("/api/flows"),
    create: (body: { name: string; description?: string; nodes: unknown[]; edges: unknown[] }) =>
      fetchJson<ToolFlow>("/api/flows", { method: "POST", body: JSON.stringify(body) }),
    get: (id: string) => fetchJson<ToolFlow>(`/api/flows/${id}`),
    update: (
      id: string,
      body: { name?: string; description?: string; nodes?: unknown[]; edges?: unknown[] }
    ) =>
      fetchJson<ToolFlow>(`/api/flows/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      fetchJson<{ ok: boolean }>(`/api/flows/${id}`, { method: "DELETE" }),
    runPersist: (body: { nodes: unknown[]; edges: unknown[]; flow_id?: string | null }) =>
      fetchJson<{ ok: boolean; run_id: string; findings_count: number; flow_name: string }>(
        "/api/flows/run/persist",
        { method: "POST", body: JSON.stringify(body) }
      ),
    runInline: (body: { nodes: unknown[]; edges: unknown[] }) =>
      fetchJson<FlowRunResponse>("/api/flows/run", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    runSaved: (id: string) =>
      fetchJson<FlowRunResponse>(`/api/flows/${id}/run`, { method: "POST" }),
    /**
     * NDJSON stream from POST /api/flows/run/stream — each line is a FlowRunLogEntry.
     * Optionally pass flow_id to execute the persisted graph from MongoDB.
     */
    runStream: async (
      body: { nodes: unknown[]; edges: unknown[]; flow_id?: string | null },
      onEntry: (entry: FlowRunLogEntry) => void,
      signal?: AbortSignal
    ): Promise<void> => {
      const res = await fetch("/api/flows/run/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodes: body.nodes,
          edges: body.edges,
          ...(body.flow_id ? { flow_id: body.flow_id } : {}),
        }),
        signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          try {
            onEntry(JSON.parse(t) as FlowRunLogEntry);
          } catch {
            /* ignore malformed chunk */
          }
        }
      }
      const tail = buffer.trim();
      if (tail) {
        try {
          onEntry(JSON.parse(tail) as FlowRunLogEntry);
        } catch {
          /* */
        }
      }
    },
  },
};
