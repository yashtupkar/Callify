import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import CrmSidebar from '@/components/crm/CrmSidebar';
import CrmTopbar from '@/components/crm/CrmTopbar';

export default function CrmLayout() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return (
    <div className="min-h-screen w-full flex bg-background">
      <CrmSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <CrmTopbar />
        <main className="flex-1 overflow-auto bg-background scrollbar-thin">
          <div className="p-6 lg:p-8 max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}