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
import { TOUR_STEPS } from "@/tour/tourSteps";
import { api } from "@/api";

function bestStepForPath(path: string): number {
  // Find the last step whose base route matches the current path,
  // skipping welcome (0) and complete (last) so we land in the meat of the tour.
  const candidates = TOUR_STEPS.map((s, i) => ({ s, i })).filter(({ s, i }) => {
    if (i === 0 || i === TOUR_STEPS.length - 1) return false;
    return path.startsWith(s.route.split("?")[0]);
  });
  return candidates.length > 0 ? candidates[0].i : 0;
}

export default function App() {
  const [tourActive, setTourActive] = useState(false);
  const [startStep, setStartStep] = useState(0);

  const startTour = useCallback((fromPath?: string) => {
    const step = fromPath ? bestStepForPath(fromPath) : 0;
    setStartStep(step);
    if (step === 0) {
      // Only reset demo data when starting fresh from the welcome screen
      api.settings.resetDemo().catch(() => {}).finally(() => setTourActive(true));
    } else {
      setTourActive(true);
    }
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
      {tourActive && (
        <TourOverlay initialStep={startStep} onClose={() => setTourActive(false)} />
      )}
    </TourContext.Provider>
  );
}
