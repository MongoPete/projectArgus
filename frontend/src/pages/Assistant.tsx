import { useCallback, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/api";
import type { ChatMessage, Workflow, WorkflowCreatePayload } from "@/types";

const STARTERS = [
  "Monitor Atlas spend and warn if we’re above baseline",
  "Hourly slow query checks with index suggestions",
  "Review backup costs and whether we’re over-snapshotting",
  "Help me combine spend and performance monitoring",
];

function MarkdownLite({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="text-white font-medium">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

export function Assistant() {
  const nav = useNavigate();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi — I’m your **Atlas Advisor**. Describe what you want to watch on your cluster (cost, slow queries, backups, security…). I’ll draft a **workflow** you can save and run. No auto-writes: anything risky stays in **human approval**.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingWorkflow, setPendingWorkflow] = useState<WorkflowCreatePayload | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [lastSource, setLastSource] = useState<string | null>(null);
  const [tipBar, setTipBar] = useState<string[]>([]);

  const scrollDown = () => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
  };

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setApplyError(null);
      setPendingWorkflow(null);
      setTipBar([]);
      const nextMsgs: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
      setMessages(nextMsgs);
      setInput("");
      setLoading(true);
      scrollDown();
      try {
        const res = await api.chat.send({
          messages: nextMsgs.map(({ role, content }) => ({ role, content })),
        });
        setLastSource(res.source);
        setMessages((m) => [...m, { role: "assistant", content: res.message }]);
        setTipBar(res.tips ?? []);
        if (res.workflow) {
          setPendingWorkflow(res.workflow);
        }
        scrollDown();
      } catch (e) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: `Sorry — I couldn’t reach the assistant API. (${(e as Error).message})`,
          },
        ]);
      } finally {
        setLoading(false);
        scrollDown();
      }
    },
    [loading, messages]
  );

  async function applyWorkflow() {
    if (!pendingWorkflow) return;
    setApplyError(null);
    try {
      const w: Workflow = await api.workflows.create(pendingWorkflow);
      setPendingWorkflow(null);
      nav(`/workflows/${w.id}`);
    } catch (e) {
      setApplyError((e as Error).message);
    }
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-6rem)] max-w-3xl mx-auto">
      <header className="shrink-0 mb-4">
        <h1 className="text-2xl font-semibold text-white">Atlas Advisor</h1>
        <p className="text-slate-400 text-sm mt-1">
          Describe what you need in plain language — the advisor drafts a workflow you can save and run.
          {lastSource && (
            <span className="ml-2 text-xs text-slate-500">
              Last reply:{" "}
              <span className="text-mdb-leaf">
                {lastSource === "openai" ? "OpenAI" : "Demo NLP (no API key)"}
              </span>
            </span>
          )}
        </p>
      </header>

      <div className="flex-1 min-h-[22rem] max-h-[55vh] overflow-y-auto glass rounded-xl p-4 flex flex-col gap-4" data-tour="chat">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[90%] rounded-2xl px-4 py-3 ${
                m.role === "user"
                  ? "bg-mdb-leaf/20 border border-mdb-leaf/30 text-slate-100"
                  : "bg-mdb-forest/35 border border-mdb-leaf/15 text-slate-200"
              }`}
            >
              {m.role === "assistant" ? (
                <MarkdownLite text={m.content} />
              ) : (
                <p className="text-sm text-slate-100 whitespace-pre-wrap">{m.content}</p>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="text-xs text-slate-500 font-mono animate-pulse">Thinking…</div>
        )}
        <div ref={bottomRef} />
      </div>

      {tipBar.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tipBar.map((t, i) => (
            <span
              key={`${i}-${t}`}
              className="text-xs rounded-lg bg-mdb-forest/40 border border-mdb-leaf/20 px-2.5 py-1 text-slate-400"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {pendingWorkflow && (
        <div className="mt-4 glass rounded-xl p-4 border border-mdb-leaf/25">
          <div className="text-xs uppercase tracking-wider text-mdb-leaf">Draft workflow</div>
          <div className="text-white font-medium mt-1">{pendingWorkflow.name}</div>
          <p className="text-sm text-slate-400 mt-1">{pendingWorkflow.description}</p>
          <div className="text-xs text-slate-500 mt-2 font-mono">
            {pendingWorkflow.trigger}
            {pendingWorkflow.schedule_cron ? ` · ${pendingWorkflow.schedule_cron}` : ""} ·{" "}
            {pendingWorkflow.steps.map((s) => s.agent).join(" → ")}
          </div>
          {applyError && <p className="text-sm text-red-300 mt-2">{applyError}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={applyWorkflow}
              className="rounded-lg bg-mdb-leaf text-mdb-forest px-4 py-2 text-sm font-medium hover:bg-mdb-leaf/90"
            >
              Create workflow
            </button>
            <button
              type="button"
              onClick={() => setPendingWorkflow(null)}
              className="rounded-lg border border-mdb-leaf/25 px-4 py-2 text-sm text-slate-300 hover:bg-mdb-leaf/10"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="shrink-0 mt-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={loading}
              onClick={() => send(s)}
              className="text-xs rounded-full border border-mdb-leaf/25 px-3 py-1.5 text-slate-300 hover:bg-mdb-leaf/10 hover:border-mdb-leaf/50 disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            className="flex-1 rounded-xl bg-mdb-slate border border-mdb-leaf/25 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-mdb-leaf/50 focus:outline-none focus:ring-1 focus:ring-mdb-leaf/30"
            placeholder="Ask in plain language…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl bg-mdb-leaf text-mdb-forest px-5 py-3 text-sm font-medium disabled:opacity-40"
          >
            Send
          </button>
        </form>
        <p className="text-center text-xs text-slate-600 pt-2">
          Need tool-by-tool control?{" "}
          <Link to="/advisor/flow" className="text-slate-500 hover:text-indigo-300">
            Open flow editor
          </Link>
        </p>
      </div>
    </div>
  );
}
