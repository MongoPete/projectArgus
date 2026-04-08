import { Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { AgentBuilder } from "@/pages/AgentBuilder";
import { AskLayout } from "@/layouts/AskLayout";
import { Assistant } from "@/pages/Assistant";
import { FlowBuilder } from "@/pages/FlowBuilder";
import { Dashboard } from "@/pages/Dashboard";
import { Findings } from "@/pages/Findings";
import { Runs } from "@/pages/Runs";
import { Settings } from "@/pages/Settings";
import { WorkflowDetail } from "@/pages/WorkflowDetail";
import { WorkflowNew } from "@/pages/WorkflowNew";
import { Start } from "@/pages/Start";
import { Workflows } from "@/pages/Workflows";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Start />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="assistant" element={<AskLayout />}>
          <Route index element={<Assistant />} />
          <Route path="flow" element={<FlowBuilder />} />
        </Route>
        <Route path="builder" element={<AgentBuilder />} />
        <Route path="workflows" element={<Workflows />} />
        <Route path="workflows/new" element={<WorkflowNew />} />
        <Route path="workflows/:id" element={<WorkflowDetail />} />
        <Route path="findings" element={<Findings />} />
        <Route path="runs" element={<Runs />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
