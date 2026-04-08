import type {
  ChatApiResponse,
  DashboardSummary,
  Finding,
  FindingStatus,
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
    runInline: (body: { nodes: unknown[]; edges: unknown[] }) =>
      fetchJson<FlowRunResponse>("/api/flows/run", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    runSaved: (id: string) =>
      fetchJson<FlowRunResponse>(`/api/flows/${id}/run`, { method: "POST" }),
  },
};
