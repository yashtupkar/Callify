import { Navigate, useParams } from "react-router-dom";

/**
 * Legacy logs route wrapper.
 * Seamlessly redirects to the unified WhatsApp Automation Details page on the Live Logs tab,
 * ensuring users always have access to CRM, Auto-replies, Channels, and Settings in one place.
 */
export default function WhatsAppAutomationLogsPage() {
  const { automationId } = useParams();
  
  if (!automationId) {
    return <Navigate to="/whatsapp" replace />;
  }

  return <Navigate to={`/whatsapp/automation/${automationId}?tab=logs`} replace />;
}