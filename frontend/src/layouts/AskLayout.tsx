import { NavLink, Outlet } from "react-router-dom";

export function AskLayout() {
  return (
    <div className="w-full max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <div className="inline-flex p-1 rounded-2xl bg-mdb-forest/30 border border-mdb-leaf/20">
          <NavLink
            to="/assistant"
            end
            className={({ isActive }) =>
              `px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? "bg-mdb-leaf/20 text-mdb-leaf border border-mdb-leaf/35 shadow-sm"
                  : "text-slate-400 hover:text-mdb-leaf/90 border border-transparent"
              }`
            }
          >
            Chat
          </NavLink>
          <NavLink
            to="flow"
            className={({ isActive }) =>
              `px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? "bg-mdb-leaf/20 text-mdb-leaf border border-mdb-leaf/35 shadow-sm"
                  : "text-slate-400 hover:text-mdb-leaf/90 border border-transparent"
              }`
            }
          >
            Flow builder
          </NavLink>
        </div>
        <p className="text-xs text-slate-500 ml-2 hidden sm:block">
          <span className="text-mdb-leaf/90">Chat</span> for drafts ·{" "}
          <span className="text-mdb-leaf/90">Flow builder</span> for tools & prompts
        </p>
      </div>
      <Outlet />
    </div>
  );
}
