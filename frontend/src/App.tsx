import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LocaleProvider } from './contexts/LocaleContext';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import ForcePasswordChange from './pages/ForcePasswordChange';
import Dashboard from './pages/Dashboard';
import DiagnosisCenter from './pages/DiagnosisCenter';
import OperationCases from './pages/OperationCases';
import ExecutionCenter from './pages/ExecutionCenter';
import AssetsCenter from './pages/AssetsCenter';
import HermesConsole from './pages/HermesConsole';
import EvolutionGovernance from './pages/EvolutionGovernance';
import PlatformOperations from './pages/PlatformOperations';
import Servers from './pages/Servers';
import Agents from './pages/Agents';
import HermesAssistant from './pages/HermesAssistant';
import HermesChannels from './pages/HermesChannels';
import HermesDashboardBridge from './pages/HermesDashboardBridge';
import EvolutionProposals from './pages/EvolutionProposals';
import ToolApprovals from './pages/ToolApprovals';
import Workflows from './pages/Workflows';
import WorkflowEditor from './pages/WorkflowEditor';
import Tasks from './pages/Tasks';
import Alerts from './pages/Alerts';
import AlertMappings from './pages/AlertMappings';
import Knowledge from './pages/Knowledge';
import Scripts from './pages/Scripts';
import ScheduledTasks from './pages/ScheduledTasks';
import AuditLogs from './pages/AuditLogs';
import Notifications from './pages/Notifications';
import Reports from './pages/Reports';
import Users from './pages/Users';
import Settings from './pages/Settings';
import AlertNoiseManagement from './pages/AlertNoiseManagement';
import RootCauseAnalysis from './pages/RootCauseAnalysis';
import TerminalPage from './pages/TerminalPage';
import RemoteDesktop from './pages/RemoteDesktop';
import BigScreenDashboard from './pages/BigScreenDashboard';
import RemediationPolicies from './pages/RemediationPolicies';
import RemediationPolicyEditor from './pages/RemediationPolicyEditor';
import RemediationExecutions from './pages/RemediationExecutions';
import RemediationDashboard from './pages/RemediationDashboard';
import Topology from './pages/Topology';
import AIRootCause from './pages/AIRootCause';
import RCADetail from './pages/RCADetail';
import RemediationWorkbench from './pages/RemediationWorkbench';
import AIInsights from './pages/AIInsights';
import NetworkDevices from './pages/NetworkDevices';
import KubernetesClusters from './pages/KubernetesClusters';
import KubernetesConsole from './pages/KubernetesConsole';
import SSHKeys from './pages/SSHKeys';
import AIModels from './pages/AIModels';
import OpsReadiness from './pages/OpsReadiness';
import NotFound from './pages/NotFound';
import { useLocale } from './contexts/LocaleContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function LocaleRenderBoundary({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();
  return (
    <div key={locale} className="contents">
      {children}
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
      <LocaleProvider>
        <AuthProvider>
          <ToastProvider>
          <QueryClientProvider client={queryClient}>
            <LocaleRenderBoundary>
            <BrowserRouter>
            <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/force-password-change" element={<ProtectedRoute><ForcePasswordChange /></ProtectedRoute>} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="diagnosis-center" element={<ProtectedRoute><DiagnosisCenter /></ProtectedRoute>} />
              <Route path="operation-cases" element={<ProtectedRoute><OperationCases /></ProtectedRoute>} />
              <Route path="execution-center" element={<ProtectedRoute><ExecutionCenter /></ProtectedRoute>} />
              <Route path="assets-center" element={<ProtectedRoute><AssetsCenter /></ProtectedRoute>} />
              <Route path="hermes-console" element={<ProtectedRoute><HermesConsole /></ProtectedRoute>} />
              <Route path="evolution-governance" element={<ProtectedRoute><EvolutionGovernance /></ProtectedRoute>} />
              <Route path="platform-operations" element={<ProtectedRoute><PlatformOperations /></ProtectedRoute>} />
              <Route path="servers" element={<ProtectedRoute><Servers /></ProtectedRoute>} />
              <Route path="ssh-keys" element={<ProtectedRoute><SSHKeys /></ProtectedRoute>} />
              <Route path="network-devices" element={<ProtectedRoute><NetworkDevices /></ProtectedRoute>} />
              <Route path="kubernetes-clusters" element={<ProtectedRoute><KubernetesClusters /></ProtectedRoute>} />
              <Route path="kubernetes-console" element={<ProtectedRoute><KubernetesConsole /></ProtectedRoute>} />
              <Route path="agents" element={<ProtectedRoute><Agents /></ProtectedRoute>} />
              <Route path="hermes" element={<ProtectedRoute><HermesAssistant /></ProtectedRoute>} />
              <Route path="hermes-channels" element={<ProtectedRoute><HermesChannels /></ProtectedRoute>} />
              <Route path="hermes-dashboard" element={<ProtectedRoute><HermesDashboardBridge /></ProtectedRoute>} />
              <Route path="evolution-proposals" element={<ProtectedRoute><EvolutionProposals /></ProtectedRoute>} />
              <Route path="tool-approvals" element={<ProtectedRoute><ToolApprovals /></ProtectedRoute>} />
              <Route path="workflows" element={<ProtectedRoute><Workflows /></ProtectedRoute>} />
              <Route path="workflows/:id" element={<ProtectedRoute><WorkflowEditor /></ProtectedRoute>} />
              <Route path="tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
              <Route path="alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
              <Route path="alert-mappings" element={<ProtectedRoute><AlertMappings /></ProtectedRoute>} />
              <Route path="knowledge" element={<ProtectedRoute><Knowledge /></ProtectedRoute>} />
              <Route path="scripts" element={<ProtectedRoute><Scripts /></ProtectedRoute>} />
              <Route path="scheduled-tasks" element={<ProtectedRoute><ScheduledTasks /></ProtectedRoute>} />
              <Route path="audit" element={<ProtectedRoute><AuditLogs /></ProtectedRoute>} />
              <Route path="notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
              <Route path="reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
              <Route path="users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
              <Route path="settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="ops-readiness" element={<ProtectedRoute><OpsReadiness /></ProtectedRoute>} />
              <Route path="alert-noise" element={<ProtectedRoute><AlertNoiseManagement /></ProtectedRoute>} />
              <Route path="root-cause-analysis" element={<ProtectedRoute><RootCauseAnalysis /></ProtectedRoute>} />
              <Route path="terminal" element={<ProtectedRoute><TerminalPage /></ProtectedRoute>} />
<Route path="remote-desktop" element={<ProtectedRoute><RemoteDesktop /></ProtectedRoute>} />
<Route path="remote-desktop/:serverId" element={<ProtectedRoute><RemoteDesktop /></ProtectedRoute>} />
<Route path="big-screen" element={<ProtectedRoute><BigScreenDashboard /></ProtectedRoute>} />
<Route path="remediation-policies" element={<ProtectedRoute><RemediationPolicies /></ProtectedRoute>} />
              <Route path="remediation-policies/:id" element={<ProtectedRoute><RemediationPolicyEditor /></ProtectedRoute>} />
              <Route path="remediation-executions" element={<ProtectedRoute><RemediationExecutions /></ProtectedRoute>} />
              <Route path="remediation-dashboard" element={<ProtectedRoute><RemediationDashboard /></ProtectedRoute>} />
              <Route path="topology" element={<ProtectedRoute><Topology /></ProtectedRoute>} />
              <Route path="ai-root-cause" element={<ProtectedRoute><AIRootCause /></ProtectedRoute>} />
              <Route path="ai-root-cause/:id" element={<ProtectedRoute><RCADetail /></ProtectedRoute>} />
              <Route path="remediation-workbench" element={<ProtectedRoute><RemediationWorkbench /></ProtectedRoute>} />
              <Route path="ai-insights" element={<ProtectedRoute><AIInsights /></ProtectedRoute>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
            </LocaleRenderBoundary>
      </QueryClientProvider>
          </ToastProvider>
        </AuthProvider>
      </LocaleProvider>
    </ThemeProvider>
  </ErrorBoundary>
  );
}

export default App;
