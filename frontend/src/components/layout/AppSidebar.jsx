import { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  Phone,
  Users,
  Calendar as CalendarIcon,
  Bot,
  Settings2,
  PhoneCall,
  Plus,
  ChevronsLeft,
  ChevronsRight,
  Search,
  BarChart3,
  LogOut,
  MessageCircle,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import { SERVER_URL } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/data-badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { NameAvatar } from '@/components/ui/name-avatar';
import { Loader2 } from 'lucide-react';

function AdminNav() {
  return [
    {
      group: 'Overview',
      items: [
        { to: '/crm/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/crm/calls', icon: Phone, label: 'Calls', badge: 'Live' },
        { to: '/crm/contacts', icon: Users, label: 'Contacts' },
        { to: '/crm/calendar', icon: CalendarIcon, label: 'Calendar' },
      ],
    },
    {
      group: 'Workspace',
      items: [
        { to: '/agents', icon: Bot, label: 'Agent Studio', end: true },
        { to: '/crm/agents', icon: Settings2, label: 'Agent settings' },
        { to: '/admin/whatsapp-automations', icon: MessageCircle, label: 'WhatsApp Agents' },
        { to: '/admin/whatsapp-numbers', icon: Phone, label: 'WhatsApp Numbers' },
        { to: '/admin/whatsapp-live', icon: MessageCircle, label: 'Live Chat' },
      ],
    },
  ];
}

function UserNav() {
  return [
    {
      group: 'Overview',
      items: [
        { to: '/crm/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/crm/calls', icon: Phone, label: 'Calls' },
        { to: '/crm/contacts', icon: Users, label: 'Contacts' },
        { to: '/crm/calendar', icon: CalendarIcon, label: 'Calendar' },
      ],
    },
  ];
}

export default function AppSidebar() {
  const { isAdmin, user, logout } = useAuth();
  const { agentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('callify_sidebar_collapsed') === '1'; } catch { return false; }
  });
  const [search, setSearch] = useState('');
  const [agents, setAgents] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  useEffect(() => {
    try { localStorage.setItem('callify_sidebar_collapsed', collapsed ? '1' : '0'); } catch {}
  }, [collapsed]);

  useEffect(() => {
    if (!user) return;
    setLoadingAgents(true);
    const url = isAdmin ? `${SERVER_URL}/api/agents` : `${SERVER_URL}/api/crm/my-agents`;
    axios.get(url)
      .then(r => setAgents(r.data))
      .catch(() => setAgents([]))
      .finally(() => setLoadingAgents(false));
  }, [user, isAdmin, location.pathname]);

  const groups = isAdmin ? AdminNav() : UserNav();
  const filteredAgents = useMemo(() => {
    if (!search.trim()) return agents.slice(0, 8);
    const q = search.toLowerCase();
    return agents.filter(a => a.name.toLowerCase().includes(q)).slice(0, 8);
  }, [agents, search]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={cn(
          'group/sidebar relative flex h-screen flex-col border-r border-border bg-card/60 backdrop-blur-xl transition-[width] duration-300 ease-out shrink-0',
          collapsed ? 'w-[72px]' : 'w-64'
        )}
      >
        {/* Brand row with collapse button in front of logo */}
        <div className={cn(
          'flex items-center gap-2 px-3 h-16 border-b border-border shrink-0',
          collapsed && 'justify-center px-2'
        )}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setCollapsed(c => !c)}
                className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{collapsed ? 'Expand' : 'Collapse'}</TooltipContent>
          </Tooltip>

          <div className="relative h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-primary via-primary to-foreground/80 flex items-center justify-center shadow-lg shadow-primary/20">
            <PhoneCall className="h-4 w-4 text-primary-foreground" />
            <span className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-card" />
          </div>

          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm tracking-tight truncate">Callify</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                {isAdmin ? 'Admin Console' : 'CRM Workspace'}
              </p>
            </div>
          )}
        </div>

        {/* Quick action (only admin) */}
        {isAdmin && (
          <div className="px-3 pt-3 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={() => navigate('/agents')}
                  className={cn('w-full gap-2 shadow-md', collapsed && 'px-0')}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {!collapsed && <span>New Agent</span>}
                </Button>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">New agent</TooltipContent>}
            </Tooltip>
          </div>
        )}

        {/* Nav (scrollable) */}
        <div className="flex-1 overflow-y-auto py-3 scrollbar-thin">
          {groups.map((group) => (
            <div key={group.group} className="px-3 py-1">
              {!collapsed && (
                <p className="px-2 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                  {group.group}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <NavRow
                    key={item.to}
                    to={item.to}
                    icon={item.icon}
                    label={item.label}
                    end={item.end}
                    badge={item.badge}
                    collapsed={collapsed}
                  />
                ))}
              </ul>
            </div>
          ))}

          {/* Agents quick list */}
          <div className="px-3 py-1">
            {!collapsed && (
              <div className="flex items-center justify-between px-2 pt-2 pb-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                  {isAdmin ? 'All agents' : 'My agents'}
                </p>
                <Badge tone="neutral" className="font-mono text-[10px]">{agents.length}</Badge>
              </div>
            )}
            {collapsed && (
              <p className="px-2 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 text-center">
                <Bot className="h-3 w-3 mx-auto" />
              </p>
            )}

            {!collapsed && agents.length > 3 && (
              <div className="px-1.5 mb-1.5">
                <div className="relative">
                  <Search className="h-3 w-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter…"
                    className="h-7 pl-7 text-xs"
                  />
                </div>
              </div>
            )}

            {loadingAgents ? (
              <div className="flex justify-center py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredAgents.length === 0 ? (
              !collapsed && (
                <div className="px-2 py-2 text-[11px] text-muted-foreground/70 italic">No agents</div>
              )
            ) : (
              <ul className="space-y-0.5">
                {filteredAgents.map(a => (
                  <AgentRow
                    key={a.id}
                    agent={a}
                    active={agentId === a.id}
                    collapsed={collapsed}
                    to={isAdmin ? `/agents/${a.id}` : `/crm/agent/${a.id}`}
                    onNavigate={navigate}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-2 shrink-0 space-y-1">
          {!collapsed && (
            <div className="px-2 py-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider font-bold text-muted-foreground/80">
              <span>Account</span>
              <Badge tone={isAdmin ? 'emerald' : 'blue'} dot className="text-[9px] font-mono">
                {isAdmin ? 'Admin' : 'User'}
              </Badge>
            </div>
          )}
          <UserButton user={user} collapsed={collapsed} onLogout={handleLogout} />
        </div>
      </aside>
    </TooltipProvider>
  );
}

/* ──────────────── Nav row ──────────────── */

function NavRow({ to, icon: Icon, label, end, badge, collapsed }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = end
    ? location.pathname === to
    : location.pathname === to || location.pathname.startsWith(to + '/');

  return (
    <li>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => navigate(to)}
            className={cn(
              'group/row relative w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-all',
              'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              isActive && 'bg-primary/10 text-foreground shadow-[inset_2px_0_0_0_hsl(var(--primary))]',
              collapsed && 'justify-center px-0'
            )}
          >
            <Icon className={cn(
              'h-4 w-4 shrink-0 transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground group-hover/row:text-foreground'
            )} />
            {!collapsed && <span className="truncate flex-1 text-left">{label}</span>}
            {!collapsed && badge && (
              <Badge tone="primary" className="text-[9px] font-mono px-1.5 py-0">{badge}</Badge>
            )}
          </button>
        </TooltipTrigger>
        {collapsed && <TooltipContent side="right">{label}</TooltipContent>}
      </Tooltip>
    </li>
  );
}

/* ──────────────── Agent row (uses NameAvatar) ──────────────── */

function AgentRow({ agent, active, collapsed, to, onNavigate }) {
  return (
    <li>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onNavigate(to)}
            className={cn(
              'w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-all',
              'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              active && 'bg-primary/10 text-foreground shadow-[inset_2px_0_0_0_hsl(var(--primary))]',
              collapsed && 'justify-center px-0'
            )}
          >
            <NameAvatar name={agent.name} size="xs" className={cn(active && 'ring-2 ring-primary')} />
            {!collapsed && <span className="truncate flex-1 text-left text-xs">{agent.name}</span>}
          </button>
        </TooltipTrigger>
        {collapsed && <TooltipContent side="right">{agent.name}</TooltipContent>}
      </Tooltip>
    </li>
  );
}

/* ──────────────── User button ──────────────── */

function UserButton({ user, collapsed, onLogout }) {
  if (!user) return null;
  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="w-full flex justify-center p-1 rounded-md hover:bg-muted/50 transition-colors">
            <NameAvatar name={user.name} email={user.email} size="sm" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">{user.name || user.email}</span>
            <span className="text-xs text-muted-foreground font-normal">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
            <LogOut className="w-3.5 h-3.5 mr-2" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-full flex items-center gap-2.5 p-1.5 rounded-md hover:bg-muted/50 transition-colors text-left">
          <NameAvatar name={user.name} email={user.email} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate">{user.name || user.email}</p>
            <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">{user.name || user.email}</span>
          <span className="text-xs text-muted-foreground font-normal">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
          <LogOut className="w-3.5 h-3.5 mr-2" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
