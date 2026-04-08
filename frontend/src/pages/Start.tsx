import { Link } from "react-router-dom";

const paths = [
  {
    title: "Outcomes & workflows",
    subtitle: "Pick what to watch, run guided analysis, review findings with HITL.",
    bullets: ["Simple build path → full custom editor", "Run now → LangGraph trace & inbox", "Best for cost, backup, and slow-query narratives"],
    primary: { to: "/builder", label: "Open Build" },
    secondary: { to: "/workflows", label: "Workflows" },
    accent: "from-mdb-leaf/15 to-transparent",
  },
  {
    title: "Ask & tool flows",
    subtitle: "Natural-language drafts plus an Airflow-style tool graph (mock runner).",
    bullets: ["Chat tab: workflow JSON from prompts", "Flow builder: Atlas API, MongoDB, Slack, Email nodes", "~20% power-user path; steps are simulated in POC"],
    primary: { to: "/assistant", label: "Open Ask" },
    secondary: { to: "/assistant/flow", label: "Flow builder" },
    accent: "from-mdb-forest/80 to-transparent",
  },
] as const;

export function Start() {
  return (
    <div className="max-w-3xl mx-auto space-y-10">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-mdb-leaf font-medium">MDBA demo</p>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Start with two paths</h1>
        <p className="text-slate-400 text-sm leading-relaxed max-w-xl">
          Same pitch deck split: agent-style outcomes first, or compose tools and prompts when you need a custom graph.
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        {paths.map((p) => (
          <div
            key={p.title}
            className={`rounded-2xl border border-mdb-leaf/20 bg-gradient-to-br ${p.accent} bg-mdb-forest/25 p-5 flex flex-col min-h-[280px] shadow-[0_0_0_1px_rgba(0,237,100,0.06)]`}
          >
            <h2 className="text-lg font-semibold text-white">{p.title}</h2>
            <p className="text-sm text-slate-400 mt-2 leading-snug">{p.subtitle}</p>
            <ul className="mt-4 space-y-2 text-xs text-slate-500 flex-1">
              {p.bullets.map((b) => (
                <li key={b} className="flex gap-2">
                  <span className="text-mdb-leaf shrink-0">●</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link
                to={p.primary.to}
                className="inline-flex items-center rounded-xl bg-mdb-leaf text-mdb-forest px-4 py-2.5 text-sm font-semibold hover:bg-mdb-leaf/90 transition-colors"
              >
                {p.primary.label}
              </Link>
              <Link
                to={p.secondary.to}
                className="inline-flex items-center rounded-xl border border-mdb-leaf/30 text-mdb-leaf px-4 py-2.5 text-sm hover:bg-mdb-leaf/10 transition-colors"
              >
                {p.secondary.label}
              </Link>
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-sm text-slate-500">
        Need the numbers view first?{" "}
        <Link to="/dashboard" className="text-mdb-leaf hover:underline">
          Open dashboard
        </Link>
      </p>

      <aside className="rounded-xl border border-mdb-leaf/15 bg-mdb-slate/60 px-4 py-3 text-[11px] text-slate-500 leading-relaxed">
        <span className="text-mdb-leaf/90 font-medium">POC limits:</span> Atlas Admin API, change streams, and flow-tool execution are{" "}
        <strong className="text-slate-400">mocked or manual</strong> unless you extend the backend. See README → Limits of this POC.
      </aside>
    </div>
  );
}
