import { useCallback, useState, useMemo } from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { FlowBuilder } from "@/pages/FlowBuilder";
import { Dashboard } from "@/pages/Dashboard";
import { Findings } from "@/pages/Findings";
import { Runs } from "@/pages/Runs";
import { Settings } from "@/pages/Settings";
import { WorkflowDetail } from "@/pages/WorkflowDetail";
import { WorkflowNew } from "@/pages/WorkflowNew";
import { Workflows } from "@/pages/Workflows";
import { TourContext } from "@/tour/useTour";
import { TourOverlay } from "@/tour/TourOverlay";
import { api } from "@/api";

export default function App() {
  const [tourActive, setTourActive] = useState(false);

  const startTour = useCallback(() => {
    api.settings.resetDemo().catch(() => {}).finally(() => setTourActive(true));
  }, []);

  const tourCtx = useMemo(
    () => ({
      active: tourActive,
      start: startTour,
      stop: () => setTourActive(false),
    }),
    [tourActive, startTour]
  );

  return (
    <TourContext.Provider value={tourCtx}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="findings" element={<Findings />} />
          <Route path="workflows" element={<Workflows />} />
          <Route path="workflows/new" element={<WorkflowNew />} />
          <Route path="workflows/:id" element={<WorkflowDetail />} />
          <Route path="advisor/flow" element={<FlowBuilder />} />
          <Route path="runs" element={<Runs />} />
          <Route path="settings" element={<Settings />} />

          {/* Redirects - unified workflow creation */}
          <Route path="create" element={<Navigate to="/workflows/new" replace />} />
          <Route path="builder" element={<Navigate to="/workflows/new" replace />} />
          <Route path="advisor" element={<Navigate to="/workflows/new?mode=chat" replace />} />
          <Route path="assistant" element={<Navigate to="/workflows/new?mode=chat" replace />} />
          <Route path="assistant/flow" element={<Navigate to="/advisor/flow" replace />} />
          <Route path="dashboard" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      {tourActive && <TourOverlay onClose={() => setTourActive(false)} />}
    </TourContext.Provider>
  );
}
