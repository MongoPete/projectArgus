import { NavLink, Outlet } from "react-router-dom";

const nav = [
  { to: "/", label: "Start", end: true },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/builder", label: "Build" },
  { to: "/assistant", label: "Ask" },
  { to: "/workflows", label: "Workflows" },
  { to: "/findings", label: "Inbox" },
  { to: "/runs", label: "Activity" },
  { to: "/settings", label: "Settings" },
];

export function Layout() {
  return (
    <div className="min-h-screen flex bg-mdb-slate">
      <aside className="w-56 shrink-0 border-r border-mdb-leaf/20 bg-mdb-forest/50 backdrop-blur-sm p-5 flex flex-col gap-8">
        <div>
          <div className="text-mdb-leaf font-semibold text-sm tracking-wide">MDBA</div>
          <div className="text-xs text-slate-400 mt-0.5 leading-snug">Proactive Atlas advisor</div>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2.5 text-[13px] transition-colors ${
                  isActive
                    ? "bg-mdb-leaf/15 text-mdb-leaf font-medium border border-mdb-leaf/25"
                    : "text-slate-300 hover:bg-mdb-leaf/10 hover:text-white border border-transparent"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto text-[10px] text-slate-500 leading-relaxed border-t border-mdb-leaf/10 pt-4">
          <span className="text-mdb-leaf/80">●</span> Low-code workflows · HITL for writes
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-[1200px] mx-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
