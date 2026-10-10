import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { Toaster } from '@/components/ui/toaster';
import AgentStudioPage from '@/pages/AgentStudioPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import CrmLayout from '@/layouts/CrmLayout';
import RequireAuth from '@/layouts/RequireAuth';
import RequireAdmin from '@/layouts/RequireAdmin';
import CrmDashboardPage from '@/pages/crm/CrmDashboardPage';
import CrmCallsPage from '@/pages/crm/CrmCallsPage';
import CrmContactsPage from '@/pages/crm/CrmContactsPage';
import CrmCalendarPage from '@/pages/crm/CrmCalendarPage';
import CrmAgentsListPage from '@/pages/crm/CrmAgentsListPage';
import CrmAgentConfigPage from '@/pages/crm/CrmAgentConfigPage';
import WhatsAppLivePage from '@/pages/WhatsAppLivePage';
import WhatsAppAutomationSetupPage from '@/pages/WhatsAppAutomationSetupPage';
import WhatsAppNumbersPage from '@/pages/WhatsAppNumbersPage';
import WhatsAppAutomationLogsPage from '@/pages/WhatsAppAutomationLogsPage';
import WhatsAppAutomationsPage from '@/pages/WhatsAppAutomationsPage';
import WhatsAppAutomationDetailsPage from '@/pages/WhatsAppAutomationDetailsPage';
import WhatsAppCrmPage from '@/pages/WhatsAppCrmPage';

function RootRedirect() {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={user?.role === 'admin' ? '/agents' : '/crm/dashboard'} replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* CRM (both admin and invited users) */}
          <Route element={<RequireAuth />}>
            <Route path="/crm" element={<CrmLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<CrmDashboardPage />} />
              <Route path="calls" element={<CrmCallsPage />} />
              <Route path="contacts" element={<CrmContactsPage />} />
              <Route path="calendar" element={<CrmCalendarPage />} />
              <Route path="agents" element={<CrmAgentsListPage />} />
              <Route path="agent/:agentId" element={<CrmAgentConfigPage />} />
            </Route>
          </Route>

          {/* Admin-only: agent studio (uses the same AppSidebar via RequireAdmin) */}
          <Route element={<RequireAdmin />}>
            <Route path="/agents" element={<AgentStudioPage />} />
            <Route path="/agents/:agentId" element={<AgentStudioPage />} />
            <Route path="/admin/whatsapp-live" element={<WhatsAppLivePage />} />
            <Route path="/whatsapp" element={<WhatsAppAutomationsPage />} />
          <Route path="/whatsapp/crm" element={<WhatsAppCrmPage />} />
            <Route
              path="/whatsapp/setup"
              element={<WhatsAppAutomationSetupPage />}
            />
            <Route
              path="/whatsapp/setup/:automationId"
              element={<WhatsAppAutomationSetupPage />}
            />
            <Route
              path="/whatsapp/automation/:automationId"
              element={<WhatsAppAutomationDetailsPage />}
            />
        
            <Route
              path="/admin/whatsapp-automations/list"
              element={<Navigate to="/whatsapp" replace />}
            />
            <Route
              path="/admin/whatsapp-automations/new"
              element={<WhatsAppAutomationSetupPage />}
            />
            <Route
              path="/admin/whatsapp-automations/:automationId/setup"
              element={<WhatsAppAutomationSetupPage />}
            />
            <Route
              path="/admin/whatsapp-numbers"
              element={<WhatsAppNumbersPage />}
            />
            <Route
              path="/admin/whatsapp-automations/:automationId/logs"
              element={<WhatsAppAutomationLogsPage />}
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </AuthProvider>
  );
}

export default App;