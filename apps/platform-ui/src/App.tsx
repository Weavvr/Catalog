import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import FeatureBrowser from './pages/FeatureBrowser';
import AppBuilder from './pages/AppBuilder';
import NLPInterface from './pages/NLPInterface';
import RequestQueue from './pages/RequestQueue';
import AdminDashboard from './pages/AdminDashboard';
import MigrationTracker from './pages/MigrationTracker';
import PipelineMonitor from './pages/PipelineMonitor';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="features" element={<FeatureBrowser />} />
        <Route path="builder" element={<AppBuilder />} />
        <Route path="assistant" element={<NLPInterface />} />
        <Route path="requests" element={<RequestQueue />} />
        <Route path="migration" element={<MigrationTracker />} />
        <Route path="pipeline" element={<PipelineMonitor />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
