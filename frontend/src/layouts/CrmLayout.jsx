import { Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import AppSidebar from '@/components/layout/AppSidebar';
import { Loader2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Calendar } from 'lucide-react';

const ROUTE_LABELS = {
  '/crm/dashboard': 'Dashboard',
  '/crm/calls': 'Calls',
  '/crm/contacts': 'Contacts',
  '/crm/calendar': 'Calendar',
  '/crm/agents': 'Agents',
};

export default function CrmLayout() {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-foreground" />
      </div>
    );
  }
  if (!isAuthenticated) return null; // RequireAuth handles redirect

  let title = 'CRM';
  for (const path in ROUTE_LABELS) {
    if (location.pathname === path || location.pathname.startsWith(path + '/')) {
      title = ROUTE_LABELS[path];
      break;
    }
  }
  if (location.pathname.startsWith('/crm/agent/')) title = 'Agent';

  return (
    <div className="min-h-screen w-full flex bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-20 flex items-center px-6 gap-4">
          <div>
            <h1 className="text-base font-semibold tracking-tight">{title}</h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
            <div className="text-xs text-muted-foreground hidden md:block">
              Signed in as <span className="text-foreground font-medium">{user?.email}</span>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto bg-background scrollbar-thin">
          <div className="p-6 lg:p-8 max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
