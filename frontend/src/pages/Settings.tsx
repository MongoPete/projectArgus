import { useEffect, useState } from "react";
import { api } from "@/api";
import { PageContainer, PageHeader, Card } from "@/components/PageContainer";

type ConnStatus = {
  connected: boolean;
  cluster_name: string | null;
  server_version: string | null;
  db_name: string;
  uri_masked: string;
};

type LlmStatus = {
  configured: boolean;
  provider: string | null;
  model: string | null;
  key_masked: string | null;
};

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${
        ok ? "bg-mdb-leaf" : "bg-[#FF6960]"
      }`}
    />
  );
}

export function Settings() {
  const [health, setHealth] = useState<{ status: string; message: string } | null>(null);

  // MongoDB connection
  const [conn, setConn] = useState<ConnStatus | null>(null);
  const [uri, setUri] = useState("");
  const [dbName, setDbName] = useState("mdba_demo");
  const [connTesting, setConnTesting] = useState(false);
  const [connSaving, setConnSaving] = useState(false);
  const [connResult, setConnResult] = useState<{ ok: boolean; message: string } | null>(null);

  // LLM
  const [llm, setLlm] = useState<LlmStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmResult, setLlmResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Demo reset
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  useEffect(() => {
    api.settings.health().then(setHealth).catch(() => setHealth(null));
    loadConnection();
    loadLlm();
  }, []);

  function loadConnection() {
    api.settings.connection().then(setConn).catch(() => null);
  }

  function loadLlm() {
    api.settings.llm().then(setLlm).catch(() => null);
  }

  async function testConnection() {
    if (!uri.trim()) return;
    setConnTesting(true);
    setConnResult(null);
    try {
      const res = await api.settings.testConnection({ uri: uri.trim(), db_name: dbName });
      if (res.ok) {
        setConnResult({ ok: true, message: `Connected to ${res.cluster_name} (v${res.server_version})` });
      } else {
        setConnResult({ ok: false, message: res.error || "Connection failed" });
      }
    } catch (e) {
      setConnResult({ ok: false, message: (e as Error).message });
    } finally {
      setConnTesting(false);
    }
  }

  async function saveConnection() {
    if (!uri.trim()) return;
    setConnSaving(true);
    setConnResult(null);
    try {
      const res = await api.settings.saveConnection({ uri: uri.trim(), db_name: dbName });
      if (res.ok) {
        setConnResult({ ok: true, message: `Saved. Connected to ${res.cluster_name}. Demo data seeded.` });
        setUri("");
        loadConnection();
      } else {
        setConnResult({ ok: false, message: res.error || "Save failed" });
      }
    } catch (e) {
      setConnResult({ ok: false, message: (e as Error).message });
    } finally {
      setConnSaving(false);
    }
  }

  async function testLlm() {
    if (!apiKey.trim()) return;
    setLlmTesting(true);
    setLlmResult(null);
    try {
      const res = await api.settings.testLlm({ openai_api_key: apiKey.trim() });
      if (res.ok) {
        setLlmResult({ ok: true, message: `OpenAI connected (${res.model})` });
      } else {
        setLlmResult({ ok: false, message: res.error || "Test failed" });
      }
    } catch (e) {
      setLlmResult({ ok: false, message: (e as Error).message });
    } finally {
      setLlmTesting(false);
    }
  }

  async function saveLlm() {
    setLlmSaving(true);
    setLlmResult(null);
    try {
      const key = apiKey.trim() || null;
      const res = await api.settings.saveLlm({ openai_api_key: key });
      if (res.ok) {
        setLlmResult({
          ok: true,
          message: res.configured ? "OpenAI key saved. Advisor will use GPT." : "Key cleared. Using demo mode.",
        });
        setApiKey("");
        loadLlm();
      }
    } catch (e) {
      setLlmResult({ ok: false, message: (e as Error).message });
    } finally {
      setLlmSaving(false);
    }
  }

  async function resetDemo() {
    setResetting(true);
    setResetMsg(null);
    try {
      const res = await api.settings.resetDemo();
      setResetMsg(res.message);
    } catch (e) {
      setResetMsg((e as Error).message);
    } finally {
      setResetting(false);
    }
  }

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure your MongoDB connection and LLM keys."
      />

      {/* API status */}
      <Card className="p-5 flex items-center gap-3">
        <StatusDot ok={!!health} />
        <div className="text-sm">
          <span className="text-white font-medium">API server</span>
          {health ? (
            <span className="text-[#889397] ml-2">{health.message}</span>
          ) : (
            <span className="text-[#FFC010] ml-2">Unreachable. Start the FastAPI server.</span>
          )}
        </div>
      </Card>

      {/* MongoDB Connection */}
      <Card className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-white">MongoDB Connection</h2>
          {conn && (
            <div className="flex items-center gap-2 text-xs">
              <StatusDot ok={conn.connected} />
              <span className={conn.connected ? "text-mdb-leaf" : "text-[#FF6960]"}>
                {conn.connected
                  ? `${conn.cluster_name} (v${conn.server_version})`
                  : "Not connected"}
              </span>
            </div>
          )}
        </div>

        {conn?.connected && (
          <div className="rounded-lg bg-[#0A1A1F] border border-[#112733] px-4 py-3 text-xs space-y-1">
            <div className="text-[#5C6C75]">
              URI: <span className="text-[#C5CDD3] font-mono">{conn.uri_masked}</span>
            </div>
            <div className="text-[#5C6C75]">
              Database: <span className="text-[#C5CDD3] font-mono">{conn.db_name}</span>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[#5C6C75] mb-1.5">Connection string</label>
            <input
              type="password"
              className="w-full rounded-lg bg-[#001E2B] border border-[#112733] px-4 py-3 text-sm text-white placeholder:text-[#3D4F58] font-mono focus:border-mdb-leaf/50 focus:outline-none"
              placeholder="mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/"
              value={uri}
              onChange={(e) => setUri(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-[#5C6C75] mb-1.5">Database name</label>
            <input
              className="w-full rounded-lg bg-[#001E2B] border border-[#112733] px-4 py-3 text-sm text-white placeholder:text-[#3D4F58] font-mono focus:border-mdb-leaf/50 focus:outline-none"
              placeholder="mdba_demo"
              value={dbName}
              onChange={(e) => setDbName(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!uri.trim() || connTesting}
              onClick={testConnection}
              className="rounded-lg border border-[#112733] px-4 py-2.5 text-sm text-[#889397] hover:bg-white/[0.02] hover:text-[#C5CDD3] disabled:opacity-40 transition-colors"
            >
              {connTesting ? "Testing..." : "Test connection"}
            </button>
            <button
              type="button"
              disabled={!uri.trim() || connSaving}
              onClick={saveConnection}
              className="rounded-lg bg-mdb-leaf/10 border border-mdb-leaf/30 px-4 py-2.5 text-sm font-medium text-mdb-leaf hover:bg-mdb-leaf/20 disabled:opacity-40 transition-colors"
            >
              {connSaving ? "Connecting..." : "Save & connect"}
            </button>
          </div>
          {connResult && (
            <div
              className={`rounded-lg px-4 py-2.5 text-sm ${
                connResult.ok
                  ? "bg-mdb-leaf/10 border border-mdb-leaf/25 text-mdb-leaf"
                  : "bg-[#FF6960]/10 border border-[#FF6960]/25 text-[#FF6960]"
              }`}
            >
              {connResult.message}
            </div>
          )}
        </div>
      </Card>

      {/* LLM Configuration */}
      <Card className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-white">LLM Configuration</h2>
          {llm && (
            <div className="flex items-center gap-2 text-xs">
              <StatusDot ok={llm.configured} />
              <span className={llm.configured ? "text-mdb-leaf" : "text-[#FFC010]"}>
                {llm.configured ? `${llm.provider} (${llm.model})` : "Demo mode"}
              </span>
            </div>
          )}
        </div>

        {llm?.configured && llm.key_masked && (
          <div className="rounded-lg bg-[#0A1A1F] border border-[#112733] px-4 py-3 text-xs">
            <span className="text-[#5C6C75]">Key: </span>
            <span className="text-[#C5CDD3] font-mono">{llm.key_masked}</span>
          </div>
        )}

        <p className="text-xs text-[#5C6C75] leading-relaxed">
          The advisor chat uses OpenAI to draft workflows from natural language. Without a key, a built-in
          demo heuristic handles common requests.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[#5C6C75] mb-1.5">OpenAI API key</label>
            <input
              type="password"
              className="w-full rounded-lg bg-[#001E2B] border border-[#112733] px-4 py-3 text-sm text-white placeholder:text-[#3D4F58] font-mono focus:border-mdb-leaf/50 focus:outline-none"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!apiKey.trim() || llmTesting}
              onClick={testLlm}
              className="rounded-lg border border-[#112733] px-4 py-2.5 text-sm text-[#889397] hover:bg-white/[0.02] hover:text-[#C5CDD3] disabled:opacity-40 transition-colors"
            >
              {llmTesting ? "Testing..." : "Test key"}
            </button>
            {apiKey.trim() ? (
              <button
                type="button"
                disabled={llmSaving}
                onClick={saveLlm}
                className="rounded-lg bg-mdb-leaf/10 border border-mdb-leaf/30 px-4 py-2.5 text-sm font-medium text-mdb-leaf hover:bg-mdb-leaf/20 disabled:opacity-40 transition-colors"
              >
                {llmSaving ? "Saving..." : "Save key"}
              </button>
            ) : llm?.configured ? (
              <button
                type="button"
                disabled={llmSaving}
                onClick={saveLlm}
                className="rounded-lg border border-[#112733] px-4 py-2.5 text-sm text-[#889397] hover:bg-white/[0.02] hover:text-[#C5CDD3] disabled:opacity-40 transition-colors"
              >
                {llmSaving ? "Clearing..." : "Clear key"}
              </button>
            ) : null}
          </div>
          {llmResult && (
            <div
              className={`rounded-lg px-4 py-2.5 text-sm ${
                llmResult.ok
                  ? "bg-mdb-leaf/10 border border-mdb-leaf/25 text-mdb-leaf"
                  : "bg-[#FF6960]/10 border border-[#FF6960]/25 text-[#FF6960]"
              }`}
            >
              {llmResult.message}
            </div>
          )}
        </div>
      </Card>

      {/* Demo data reset */}
      <Card className="p-6 space-y-4">
        <h2 className="text-sm font-medium text-white">Demo data</h2>
        <p className="text-xs text-[#5C6C75] leading-relaxed">
          Reset all workflows, findings, runs, and flows to the pre-seeded demo state.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={resetting}
            onClick={resetDemo}
            className="rounded-lg border border-[#FFC010]/30 bg-[#FFC010]/10 px-4 py-2.5 text-sm text-[#FFC010] hover:bg-[#FFC010]/20 disabled:opacity-40 transition-colors"
          >
            {resetting ? "Resetting..." : "Reset demo data"}
          </button>
          {resetMsg && <span className="text-xs text-mdb-leaf">{resetMsg}</span>}
        </div>
      </Card>
    </PageContainer>
  );
}
