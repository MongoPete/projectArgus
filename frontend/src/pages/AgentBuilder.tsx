import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AGENT_CATALOG, catalogEntry } from "@/agentCatalog";
import {
  agentsFromOutcomes,
  defaultWorkflowTitle,
  essentialOutcomeSet,
  type OutcomeId,
  SIMPLE_OUTCOMES,
} from "@/builder/outcomes";
import { SimpleFlowStrip } from "@/components/SimpleFlowStrip";
import { WorkflowFlowChart } from "@/components/WorkflowFlowChart";
import { api } from "@/api";
import type { AgentType, TriggerType, WorkflowStep } from "@/types";

function newStep(agent: AgentType): WorkflowStep {
  const c = catalogEntry(agent);
  return {
    id: crypto.randomUUID(),
    agent,
    label: c?.defaultLabel ?? agent,
    config: { ...(c?.defaultConfig ?? {}) },
  };
}

type SchedulePreset = "manual" | "daily" | "hourly";

function presetToTrigger(preset: SchedulePreset): { trigger: TriggerType; cron: string | null } {
  if (preset === "manual") return { trigger: "manual", cron: null };
  if (preset === "daily") return { trigger: "schedule", cron: "0 7 * * *" };
  return { trigger: "schedule", cron: "0 * * * *" };
}

function StepInspector({
  step,
  onChange,
}: {
  step: WorkflowStep;
  onChange: (s: WorkflowStep) => void;
}) {
  const patchConfig = (patch: Record<string, unknown>) => {
    onChange({ ...step, config: { ...step.config, ...patch } });
  };

  const num = (key: string, label: string, placeholder?: string) => (
    <div>
      <label className="block text-xs text-slate-500">{label}</label>
      <input
        type="number"
        className="mt-1.5 w-full rounded-xl bg-mdb-slate/60 border border-mdb-leaf/20 px-3 py-2.5 text-sm text-white"
        value={step.config[key] != null ? String(step.config[key]) : ""}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value === "" ? undefined : Number(e.target.value);
          patchConfig({ [key]: v });
        }}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-slate-500">Name this step</label>
        <input
          className="mt-1.5 w-full rounded-xl bg-mdb-slate/60 border border-mdb-leaf/20 px-3 py-2.5 text-sm text-white"
          value={step.label}
          onChange={(e) => onChange({ ...step, label: e.target.value })}
        />
      </div>
      <div className="text-xs text-slate-500">Fine-tune</div>
      {step.agent === "spend" && (
        <div className="grid grid-cols-2 gap-3">
          {num("baseline_days", "Baseline (days)", "30")}
          {num("threshold_pct", "Alert above (%)", "15")}
        </div>
      )}
      {step.agent === "slow_query" && (
        <div className="grid grid-cols-2 gap-3">
          {num("slow_ms", "Slow threshold (ms)", "100")}
          {num("dedup_hours", "Dedup (hours)", "24")}
        </div>
      )}
      {step.agent === "index_rationalization" && (
        <div>{num("unused_days", "Unused window (days)", "30")}</div>
      )}
      {(step.agent === "data_quality" || step.agent === "scaling") && (
        <div>{num("lookback_days", "Lookback (days)", "7")}</div>
      )}
      {(step.agent === "backup" || step.agent === "security") && (
        <div>
          <label className="block text-xs text-slate-500">Notes</label>
          <textarea
            className="mt-1.5 w-full rounded-xl bg-mdb-slate/60 border border-mdb-leaf/20 px-3 py-2.5 text-xs text-white min-h-[72px]"
            placeholder="Optional…"
            value={String(step.config.notes ?? "")}
            onChange={(e) => patchConfig({ notes: e.target.value || undefined })}
          />
        </div>
      )}
      {step.agent === "index_rationalization" && (
        <div>
          <label className="block text-xs text-slate-500">Operator notes</label>
          <textarea
            className="mt-1.5 w-full rounded-xl bg-mdb-slate/60 border border-mdb-leaf/20 px-3 py-2.5 text-xs text-white min-h-[72px]"
            placeholder="Optional…"
            value={String(step.config.notes ?? "")}
            onChange={(e) => patchConfig({ notes: e.target.value || undefined })}
          />
        </div>
      )}
      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer text-slate-400 hover:text-slate-300 py-1">Technical details</summary>
        <pre className="mt-2 p-3 rounded-xl bg-black/30 font-mono text-[10px] overflow-x-auto text-slate-500">
          {JSON.stringify(step.config, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export function AgentBuilder() {
  const nav = useNavigate();
  const [builderMode, setBuilderMode] = useState<"simple" | "advanced">("simple");

  const [selectedOutcomes, setSelectedOutcomes] = useState<Set<OutcomeId>>(() => essentialOutcomeSet());
  const [schedulePreset, setSchedulePreset] = useState<SchedulePreset>("manual");
  const [simpleName, setSimpleName] = useState("");

  const [name, setName] = useState("Custom workflow");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState<TriggerType>("manual");
  const [scheduleCron, setScheduleCron] = useState("0 * * * *");
  const [steps, setSteps] = useState<WorkflowStep[]>(() => [newStep("spend"), newStep("slow_query")]);
  const [selectedId, setSelectedId] = useState<string | null>(() => steps[0]?.id ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => steps.find((s) => s.id === selectedId) ?? null,
    [steps, selectedId]
  );

  const simpleAgentsPreview = useMemo(() => agentsFromOutcomes(selectedOutcomes), [selectedOutcomes]);

  useEffect(() => {
    if (steps.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !steps.some((s) => s.id === selectedId)) {
      setSelectedId(steps[0].id);
    }
  }, [steps, selectedId]);

  function toggleOutcome(id: OutcomeId) {
    setSelectedOutcomes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openAdvanced() {
    const agents = agentsFromOutcomes(selectedOutcomes);
    const built = agents.length > 0 ? agents.map((a) => newStep(a)) : steps;
    setSteps(built.length > 0 ? built : [newStep("spend")]);
    const { trigger: tr, cron } = presetToTrigger(schedulePreset);
    setTrigger(tr);
    if (cron) setScheduleCron(cron);
    setName(simpleName.trim() || defaultWorkflowTitle(selectedOutcomes) || "Custom workflow");
    setBuilderMode("advanced");
    if (built.length > 0) setSelectedId(built[0].id);
  }

  function addAgent(agent: AgentType) {
    const s = newStep(agent);
    setSteps((prev) => [...prev, s]);
    setSelectedId(s.id);
  }

  function removeStep(id: string) {
    setSteps((prev) => prev.filter((x) => x.id !== id));
  }

  function moveStep(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= steps.length) return;
    setSteps((prev) => {
      const copy = [...prev];
      [copy[index], copy[j]] = [copy[j], copy[index]];
      return copy;
    });
  }

  function updateStep(updated: WorkflowStep) {
    setSteps((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  async function saveSimple() {
    setErr(null);
    const agents = agentsFromOutcomes(selectedOutcomes);
    if (agents.length === 0) {
      setErr("Choose at least one area to watch.");
      return;
    }
    const builtSteps = agents.map((a) => newStep(a));
    const { trigger: tr, cron } = presetToTrigger(schedulePreset);
    setSaving(true);
    try {
      const w = await api.workflows.create({
        name: simpleName.trim() || defaultWorkflowTitle(selectedOutcomes),
        description: "Created with the simple builder.",
        trigger: tr,
        schedule_cron: cron,
        steps: builtSteps,
        hitl_writes: true,
      });
      nav(`/workflows/${w.id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveAdvanced(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const w = await api.workflows.create({
        name,
        description,
        trigger,
        schedule_cron: trigger === "schedule" ? scheduleCron : null,
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

  if (builderMode === "simple") {
    return (
      <div className="max-w-xl mx-auto space-y-10 pb-16">
        <div>
          <Link to="/workflows" className="text-sm text-slate-500 hover:text-mdb-leaf transition-colors">
            ← Back
          </Link>
          <h1 className="text-2xl font-semibold text-white tracking-tight mt-4">Create a workflow</h1>
          <p className="text-slate-400 text-[15px] leading-relaxed mt-2">
            Choose what to watch on Atlas. We’ll turn it into a saved workflow you can run anytime — no wiring
            required.
          </p>
        </div>

        {err && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-white">What should we watch?</h2>
          <p className="text-xs text-slate-500">Select one or more. You can refine later.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {SIMPLE_OUTCOMES.map((o) => {
              const on = selectedOutcomes.has(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggleOutcome(o.id)}
                  className={`text-left rounded-2xl border px-4 py-4 transition-all ${
                    on
                      ? "border-mdb-leaf/35 bg-mdb-leaf/10 ring-1 ring-mdb-leaf/25 shadow-[0_0_0_1px_rgba(0,237,100,0.12)]"
                      : "border-mdb-leaf/12 bg-mdb-forest/25 hover:bg-mdb-slate/60 hover:border-mdb-leaf/25"
                  }`}
                >
                  <div className="text-[15px] font-medium text-white">{o.title}</div>
                  <div className="text-xs text-slate-500 mt-1 leading-snug">{o.blurb}</div>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setSelectedOutcomes(essentialOutcomeSet())}
            className="text-xs text-mdb-leaf hover:underline"
          >
            Use recommended: costs, speed & backups
          </button>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-white">How often?</h2>
          <div className="flex flex-col gap-2">
            {(
              [
                { id: "manual" as const, title: "When I run it", sub: "You start it from the app" },
                { id: "daily" as const, title: "Once a day", sub: "Quiet morning check" },
                { id: "hourly" as const, title: "Every hour", sub: "Tighter watch for busy clusters" },
              ] as const
            ).map((opt) => (
              <label
                key={opt.id}
                className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3.5 transition ${
                  schedulePreset === opt.id
                    ? "border-mdb-leaf/30 bg-mdb-leaf/10"
                    : "border-mdb-leaf/12 bg-mdb-forest/25 hover:border-mdb-leaf/25"
                }`}
              >
                <input
                  type="radio"
                  name="schedule"
                  checked={schedulePreset === opt.id}
                  onChange={() => setSchedulePreset(opt.id)}
                  className="accent-mdb-leaf"
                />
                <div>
                  <div className="text-sm font-medium text-white">{opt.title}</div>
                  <div className="text-xs text-slate-500">{opt.sub}</div>
                </div>
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-mdb-leaf/12 bg-mdb-forest/25 p-5">
          <h2 className="text-sm font-medium text-white">Preview</h2>
          <SimpleFlowStrip agents={simpleAgentsPreview} />
        </section>

        <section className="space-y-2">
          <label className="text-sm text-slate-400">Name (optional)</label>
          <input
            className="w-full rounded-2xl bg-mdb-slate/60 border border-mdb-leaf/20 px-4 py-3 text-sm text-white placeholder:text-slate-600"
            placeholder={defaultWorkflowTitle(selectedOutcomes)}
            value={simpleName}
            onChange={(e) => setSimpleName(e.target.value)}
          />
        </section>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <button
            type="button"
            disabled={saving}
            onClick={saveSimple}
            className="flex-1 rounded-2xl bg-mdb-leaf text-mdb-forest px-6 py-3.5 text-sm font-semibold hover:bg-mdb-leaf/90 disabled:opacity-40 transition-colors"
          >
            {saving ? "Saving…" : "Create workflow"}
          </button>
          <button
            type="button"
            onClick={openAdvanced}
            className="rounded-2xl border border-mdb-leaf/30 px-5 py-3.5 text-sm text-slate-300 hover:bg-mdb-leaf/10 transition-colors"
          >
            Custom workflow
          </button>
        </div>

        <p className="text-center text-xs text-slate-600">
          <Link to="/assistant" className="text-slate-500 hover:text-mdb-leaf">
            Prefer to describe it in chat?
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 -mx-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => setBuilderMode("simple")}
            className="text-sm text-slate-500 hover:text-mdb-leaf transition-colors"
          >
            ← Simple builder
          </button>
          <h1 className="text-2xl font-semibold text-white tracking-tight mt-3">Custom workflow</h1>
          <p className="text-slate-400 text-sm mt-1 max-w-xl">
            Reorder steps, open the map, tune parameters. Changes stay human-approved before any write to the
            cluster.
          </p>
        </div>
        <Link
          to="/assistant"
          className="text-xs rounded-2xl border border-mdb-leaf/20 px-3 py-2 text-slate-500 hover:text-mdb-leaf hover:border-mdb-leaf/30"
        >
          Chat instead
        </Link>
      </div>

      <form onSubmit={saveAdvanced} className="space-y-8">
        {err && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-3 space-y-3">
            <h2 className="text-sm font-medium text-white">Add step</h2>
            <p className="text-xs text-slate-500">Append to the end of your workflow.</p>
            <div className="grid grid-cols-1 gap-2">
              {AGENT_CATALOG.map((a) => (
                <button
                  key={a.type}
                  type="button"
                  onClick={() => addAgent(a.type)}
                  className="text-left rounded-2xl border border-mdb-leaf/12 bg-mdb-forest/25 px-3 py-3 transition hover:bg-mdb-leaf/10 hover:border-mdb-leaf/25"
                >
                  <div className="text-sm font-medium text-white">{a.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{a.short}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 space-y-5">
            <h2 className="text-sm font-medium text-white">Workflow</h2>

            <div className="rounded-2xl border border-mdb-leaf/12 bg-mdb-forest/25 p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500">Name</label>
                  <input
                    required
                    className="mt-1.5 w-full rounded-xl bg-mdb-slate/60 border border-mdb-leaf/20 px-3 py-2.5 text-sm text-white"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Trigger</label>
                  <select
                    className="mt-1.5 w-full rounded-xl bg-mdb-slate/60 border border-mdb-leaf/20 px-3 py-2.5 text-sm text-white"
                    value={trigger}
                    onChange={(e) => setTrigger(e.target.value as TriggerType)}
                  >
                    <option value="manual">Manual</option>
                    <option value="schedule">Schedule (cron)</option>
                    <option value="change_stream">Change stream</option>
                  </select>
                </div>
              </div>
              {trigger === "schedule" && (
                <div>
                  <label className="text-xs text-slate-500">Cron</label>
                  <input
                    className="mt-1.5 w-full rounded-xl bg-mdb-slate/60 border border-mdb-leaf/20 px-3 py-2.5 text-sm font-mono text-white"
                    value={scheduleCron}
                    onChange={(e) => setScheduleCron(e.target.value)}
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-slate-500">Description</label>
                <textarea
                  className="mt-1.5 w-full rounded-xl bg-mdb-slate/60 border border-mdb-leaf/20 px-3 py-2.5 text-sm text-white min-h-[56px]"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-white">Flow map</h3>
                <p className="text-[11px] text-slate-500">Click a step to edit it on the right.</p>
              </div>
              <WorkflowFlowChart
                steps={steps}
                selectedId={selectedId}
                trigger={trigger}
                scheduleCron={trigger === "schedule" ? scheduleCron : null}
                onSelectStep={setSelectedId}
                showMiniMap
                heightClassName="h-[min(340px,42vh)] min-h-[240px]"
              />
            </div>

            <div className="space-y-2">
              {steps.length === 0 && (
                <div className="rounded-2xl border border-dashed border-mdb-leaf/25 p-8 text-center text-sm text-slate-500">
                  Add steps from the left.
                </div>
              )}
              {steps.map((s, i) => {
                const cat = catalogEntry(s.agent);
                const active = s.id === selectedId;
                return (
                  <div
                    key={s.id}
                    className={`rounded-2xl border px-3 py-3 flex flex-wrap items-center gap-2 transition ${
                      active
                        ? "border-mdb-leaf/35 bg-mdb-leaf/10"
                        : "border-mdb-leaf/12 bg-mdb-forest/25 hover:border-mdb-leaf/25"
                    }`}
                  >
                    <div className="flex flex-col gap-0.5 mr-1">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => moveStep(i, -1)}
                        className="text-slate-500 hover:text-white disabled:opacity-20 text-[10px]"
                        aria-label="Move up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={i === steps.length - 1}
                        onClick={() => moveStep(i, 1)}
                        className="text-slate-500 hover:text-white disabled:opacity-20 text-[10px]"
                        aria-label="Move down"
                      >
                        ▼
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      className="flex-1 min-w-[180px] text-left"
                    >
                      <div className={`text-[10px] uppercase tracking-wide ${cat?.accent ?? "text-slate-500"}`}>
                        {s.agent.replace(/_/g, " ")}
                      </div>
                      <div className="text-sm text-white font-medium">{s.label}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStep(s.id)}
                      className="text-xs text-slate-500 hover:text-red-300 px-2"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Writes need approval</span>
              <span className="rounded-full bg-mdb-leaf/15 border border-mdb-leaf/25 px-2 py-0.5 text-mdb-leaf text-xs">Always on</span>
            </div>

            <button
              type="submit"
              disabled={saving || steps.length === 0}
              className="rounded-2xl bg-mdb-leaf text-mdb-forest px-6 py-3 text-sm font-semibold disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save workflow"}
            </button>
          </div>

          <div className="lg:col-span-3 space-y-3">
            <h2 className="text-sm font-medium text-white">Selected step</h2>
            <div className="rounded-2xl border border-mdb-leaf/12 bg-mdb-forest/25 p-4 min-h-[260px]">
              {selected ? (
                <StepInspector step={selected} onChange={updateStep} />
              ) : (
                <p className="text-sm text-slate-500">Pick a step in the list or on the map.</p>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
