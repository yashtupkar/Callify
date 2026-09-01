import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import AppSidebar from '@/components/layout/AppSidebar';
import { Loader2 } from 'lucide-react';

export default function RequireAdmin() {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-foreground" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login?mode=admin" replace />;
  if (user?.role !== 'admin') return <Navigate to="/crm/dashboard" replace />;
  return <AgentShell />;
}

function AgentShell() {
  return (
    <div className="min-h-screen w-full flex bg-background">
      <AppSidebar />
      <main className="flex-1 min-w-0 overflow-auto bg-background scrollbar-thin">
        <Outlet />
      </main>
    </div>
  );
}
