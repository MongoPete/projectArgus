import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api";
import type { AgentType, TriggerType, WorkflowStep } from "@/types";

const AGENTS: { value: AgentType; label: string }[] = [
  { value: "spend", label: "Spend intelligence" },
  { value: "slow_query", label: "Slow query / explain" },
  { value: "backup", label: "Backup & retention" },
  { value: "index_rationalization", label: "Index rationalization" },
  { value: "data_quality", label: "Data quality" },
  { value: "security", label: "Security behavior" },
  { value: "scaling", label: "Scaling patterns" },
];

function newStep(agent: AgentType): WorkflowStep {
  return {
    id: crypto.randomUUID(),
    agent,
    label: AGENTS.find((a) => a.value === agent)?.label ?? agent,
    config: {},
  };
}

export function WorkflowNew() {
  const nav = useNavigate();
  const [name, setName] = useState("My proactive workload");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState<TriggerType>("manual");
  const [steps, setSteps] = useState<WorkflowStep[]>([newStep("spend"), newStep("slow_query")]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function addStep(agent: AgentType) {
    setSteps((s) => [...s, newStep(agent)]);
  }

  function removeStep(id: string) {
    setSteps((s) => s.filter((x) => x.id !== id));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const w = await api.workflows.create({
        name,
        description,
        trigger,
        schedule_cron: trigger === "schedule" ? "0 * * * *" : null,
        steps,
        hitl_writes: true,
      });
      nav(`/workflows/${w.id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <button
        type="button"
        onClick={() => nav(-1)}
        className="text-sm text-mdb-leaf hover:underline"
      >
        ← Back
      </button>
      <h1 className="text-2xl font-semibold text-white">New workflow</h1>
      <p className="text-slate-400 text-sm">
        Select analysis steps and save. Each run collects data, analyzes it, ranks findings by impact, 
        and delivers results to your inbox.
      </p>

      <form onSubmit={submit} className="space-y-6 glass rounded-xl p-6">
        {err && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {err}
          </div>
        )}
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider">Name</label>
          <input
            className="mt-1 w-full rounded-lg bg-mdb-slate border border-mdb-leaf/25 px-3 py-2 text-sm text-white"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider">Description</label>
          <textarea
            className="mt-1 w-full rounded-lg bg-mdb-slate border border-mdb-leaf/25 px-3 py-2 text-sm text-white min-h-[72px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 uppercase tracking-wider">Trigger</label>
          <select
            className="mt-1 w-full rounded-lg bg-mdb-slate border border-mdb-leaf/25 px-3 py-2 text-sm text-white"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value as TriggerType)}
          >
            <option value="manual">Manual</option>
            <option value="schedule">Schedule (hourly placeholder)</option>
            <option value="change_stream">Change stream (future)</option>
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-400 uppercase tracking-wider">Steps</label>
            <select
              className="text-xs rounded-lg bg-mdb-slate border border-mdb-leaf/25 px-2 py-1 text-slate-200"
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value as AgentType;
                if (v) addStep(v);
                e.target.value = "";
              }}
            >
              <option value="">+ Add agent</option>
              {AGENTS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <ul className="mt-3 space-y-2">
            {steps.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-mdb-forest/30 border border-mdb-leaf/20 px-3 py-2"
              >
                <span className="text-sm text-slate-200">{s.label}</span>
                <button
                  type="button"
                  onClick={() => removeStep(s.id)}
                  className="text-xs text-slate-500 hover:text-red-300"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>

        <button
          type="submit"
          disabled={saving || steps.length === 0}
          className="rounded-lg bg-mdb-leaf text-mdb-forest px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Create workflow"}
        </button>
      </form>
    </div>
  );
}
