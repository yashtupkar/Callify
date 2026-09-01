import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LogOut, ArrowLeft, User } from 'lucide-react';

const routeTitles = {
  '/crm/dashboard': 'Dashboard',
  '/crm/calls': 'Calls',
  '/crm/contacts': 'Contacts',
  '/crm/calendar': 'Calendar',
  '/crm/agents': 'Agents',
};

export default function CrmTopbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  let title = 'CRM';
  for (const path in routeTitles) {
    if (location.pathname.startsWith(path)) {
      title = routeTitles[path];
      break;
    }
  }

  const isAgentRoute = location.pathname.startsWith('/crm/agent/');
  if (isAgentRoute) {
    title = 'Agent Configuration';
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="h-16 border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30 flex items-center px-6 gap-4">
      <div className="flex items-center gap-3 flex-1">
        {isAgentRoute && (
          <Button variant="ghost" size="icon" asChild className="rounded-full">
            <Link to="/crm/agents">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
        )}
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-10 gap-2 px-2 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:inline-block text-sm font-medium">{user?.email}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">{user?.name}</span>
            <span className="text-xs text-muted-foreground font-normal">{user?.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-xs text-muted-foreground">
            <User className="w-3.5 h-3.5 mr-2" />
            Signed in
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}