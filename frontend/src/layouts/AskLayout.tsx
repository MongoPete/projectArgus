import { NavLink, Outlet, useLocation } from "react-router-dom";

export function AskLayout() {
  const { pathname } = useLocation();
  const isTools = pathname.includes("/advisor/flow");

  return (
    <div className={isTools ? "w-full flex flex-col flex-1 min-h-0" : "w-full max-w-[1400px] mx-auto"}>
      <div
        className={`flex flex-wrap items-center gap-2 ${isTools ? "shrink-0 px-4 py-2.5 border-b border-[#2d2d4e] bg-[#16162a]/90" : "mb-8"}`}
      >
        <div
          className={`inline-flex p-1 rounded-xl border ${isTools ? "bg-[#1e293b] border-[#334155]" : "bg-mdb-forest/30 border-mdb-leaf/20"}`}
        >
          <NavLink
            to="/advisor"
            end
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? isTools
                    ? "bg-[#334155] text-[#e2e8f0] border border-[#475569]"
                    : "bg-mdb-leaf/20 text-mdb-leaf border border-mdb-leaf/35 shadow-sm"
                  : isTools
                    ? "text-slate-500 hover:text-[#818cf8] border border-transparent"
                    : "text-slate-400 hover:text-mdb-leaf/90 border border-transparent"
              }`
            }
          >
            Chat
          </NavLink>
          <NavLink
            to="flow"
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? isTools
                    ? "bg-indigo-600/30 text-[#a5b4fc] border border-[#818cf8]/50"
                    : "bg-mdb-leaf/20 text-mdb-leaf border border-mdb-leaf/35 shadow-sm"
                  : isTools
                    ? "text-slate-500 hover:text-[#818cf8] border border-transparent"
                    : "text-slate-400 hover:text-mdb-leaf/90 border border-transparent"
              }`
            }
          >
            Flow editor
          </NavLink>
        </div>
        <p className="text-xs text-slate-500 ml-2 hidden sm:block">
          <span className="text-mdb-leaf/90">Chat</span> — describe what to watch ·{" "}
          <span className="text-indigo-300/90">Flow editor</span> — visual tool chains
        </p>
      </div>
      <div className={isTools ? "flex-1 min-h-0 flex flex-col" : ""}>
        <Outlet />
      </div>
    </div>
  );
}
