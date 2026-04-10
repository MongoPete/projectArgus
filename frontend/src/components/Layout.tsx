import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useTour } from "@/tour/useTour";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  external?: boolean;
}

interface NavSection {
  heading: string;
  items: NavItem[];
  active?: boolean;
}

const sections: NavSection[] = [
  {
    heading: "Database",
    items: [
      { to: "#", label: "Clusters", external: true },
      { to: "#", label: "Search & Vector Search", external: true },
      { to: "#", label: "Data Explorer", external: true },
      { to: "#", label: "Backup", external: true },
    ],
  },
  {
    heading: "Services",
    items: [
      { to: "#", label: "AI Models", external: true },
      { to: "#", label: "Migration", external: true },
      { to: "#", label: "Triggers", external: true },
    ],
  },
  {
    heading: "MDBA — Atlas Advisor",
    active: true,
    items: [
      { to: "/", label: "Dashboard", end: true },
      { to: "/findings", label: "Findings" },
      { to: "/workflows", label: "Workflows" },
      { to: "/settings", label: "Settings" },
    ],
  },
  {
    heading: "Security",
    items: [
      { to: "#", label: "Project Identity & Access", external: true },
      { to: "#", label: "Database & Network Access", external: true },
      { to: "#", label: "Activity Feed", external: true },
    ],
  },
];

function MongoLeafIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <path
        d="M12.034 2c.09 1.073.585 2.01 1.25 2.79.934 1.1 2.062 1.91 2.918 3.103 1.442 2.012 1.795 5.152.335 7.285-1.263 1.846-3.23 2.698-5.27 2.978l-.233.03c-.027-.603-.147-1.195-.287-1.554 0 0-3.098-4.168-3.685-5.22.024-.116 2.312-3.19 3.15-4.45C10.96 5.72 11.97 4.12 12.034 2z"
        fill="#00ED64"
      />
      <path
        d="M12.034 2c-.044 1.573-.93 2.757-1.82 3.96-.838 1.132-1.847 2.187-2.585 3.46-.652 1.124-1.116 2.45-.93 3.79.208 1.49 1.06 2.678 2.15 3.538.34.268.714.497 1.115.68.027-.603.147-1.195.287-1.554l-.002.002c-.003-.003 3.098-4.168 3.685-5.22-.024-.116-2.312-3.19-3.15-4.45C10.026 5.023 11.97 4.12 12.034 2z"
        fill="#023430"
        opacity="0.6"
      />
    </svg>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const toolsWorkshop = pathname.startsWith("/advisor/flow");
  const tour = useTour();

  return (
    <div className={`flex bg-mdb-slate ${toolsWorkshop ? "h-screen" : "min-h-screen"}`}>
      <aside className="w-60 shrink-0 border-r border-white/[0.08] bg-[#0a1e18] flex flex-col h-screen sticky top-0">
        {/* Atlas-style header - fixed */}
        <div className="px-4 pt-4 pb-3 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <MongoLeafIcon />
            <span className="text-white font-semibold text-sm">MongoDB Atlas</span>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="text-slate-500">PROJECT</span>
            <span className="text-slate-300 font-medium">MDBA Demo</span>
          </div>
        </div>

        {/* Navigation sections - scrollable */}
        <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto">
          {sections.map((section) => (
            <div key={section.heading}>
              <div
                className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                  section.active
                    ? "text-mdb-leaf"
                    : "text-slate-500"
                }`}
              >
                {section.active && <span className="mr-1">●</span>}
                {section.heading}
              </div>
              <div className="mt-0.5 flex flex-col">
                {section.items.map((item) =>
                  item.external ? (
                    <span
                      key={item.label}
                      className="px-3 py-[7px] text-[12.5px] text-slate-500 cursor-default select-none"
                    >
                      {item.label}
                    </span>
                  ) : (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        `px-3 py-[7px] text-[12.5px] rounded-md transition-colors ${
                          isActive
                            ? "text-mdb-leaf font-medium bg-mdb-leaf/[0.08] border-l-2 border-mdb-leaf -ml-[2px] pl-[14px]"
                            : "text-slate-300 hover:text-white hover:bg-white/[0.04]"
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  )
                )}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer - fixed at bottom */}
        <div className="px-3 py-3 border-t border-white/[0.06] shrink-0">
          <button
            type="button"
            onClick={tour.start}
            className="w-full rounded-md border border-mdb-leaf/25 bg-mdb-leaf/[0.08] px-3 py-2 text-[11px] text-mdb-leaf font-medium hover:bg-mdb-leaf/15 transition-colors"
          >
            ▶ Guided tour
          </button>
        </div>
      </aside>

      <main className={toolsWorkshop ? "flex-1 flex flex-col min-h-0 overflow-hidden" : "flex-1 overflow-auto"}>
        <div
          className={
            toolsWorkshop ? "flex-1 flex flex-col min-h-0 min-w-0" : "max-w-[1200px] mx-auto p-8 w-full"
          }
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
