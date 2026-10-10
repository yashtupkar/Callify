// import { useState, useEffect, useMemo } from 'react';
// import {
//   LayoutDashboard,
//   Phone,
//   Users,
//   Calendar as CalendarIcon,
//   Bot,
//   Settings2,
//   PhoneCall,
//   Plus,
//   ChevronsLeft,
//   ChevronsRight,
//   Search,
//   BarChart3,
//   LogOut,
//   MessageCircle,
// } from 'lucide-react';
// import { useAuth } from '@/hooks/useAuth';
// import { useNavigate, useParams, useLocation } from 'react-router-dom';
// import axios from 'axios';
// import { SERVER_URL } from '@/lib/constants';
// import { cn } from '@/lib/utils';
// import { Button } from '@/components/ui/button';
// import { Input } from '@/components/ui/input';
// import { Badge } from '@/components/ui/data-badge';
// import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
// import {
//   DropdownMenu,
//   DropdownMenuTrigger,
//   DropdownMenuContent,
//   DropdownMenuItem,
//   DropdownMenuLabel,
//   DropdownMenuSeparator,
// } from '@/components/ui/dropdown-menu';
// import { NameAvatar } from '@/components/ui/name-avatar';
// import { Loader2 } from 'lucide-react';

// function AdminNav() {
//   return [
//     {
//       group: 'Overview',
//       items: [
//         { to: '/crm/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
//         { to: '/crm/calls', icon: Phone, label: 'Calls', badge: 'Live' },
//         { to: '/crm/contacts', icon: Users, label: 'Contacts' },
//         { to: '/crm/calendar', icon: CalendarIcon, label: 'Calendar' },
//       ],
//     },
//     {
//       group: 'Workspace',
//       items: [
//         { to: '/agents', icon: Bot, label: 'Agent Studio', end: true },
//         { to: '/crm/agents', icon: Settings2, label: 'Agent settings' },
//         { to: '/whatsapp', icon: MessageCircle, label: 'WhatsApp Automation' },
//         { to: '/admin/whatsapp-numbers', icon: Phone, label: 'WhatsApp Connections' },
//         { to: '/admin/whatsapp-live', icon: MessageCircle, label: 'Live Chat' },
//       ],
//     },
//   ];
// }

// function UserNav() {
//   return [
//     {
//       group: 'Overview',
//       items: [
//         { to: '/crm/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
//         { to: '/crm/calls', icon: Phone, label: 'Calls' },
//         { to: '/crm/contacts', icon: Users, label: 'Contacts' },
//         { to: '/crm/calendar', icon: CalendarIcon, label: 'Calendar' },
//       ],
//     },
//   ];
// }

// export default function AppSidebar() {
//   const { isAdmin, user, logout } = useAuth();
//   const { agentId } = useParams();
//   const navigate = useNavigate();
//   const location = useLocation();
//   const [collapsed, setCollapsed] = useState(() => {
//     try { return localStorage.getItem('callify_sidebar_collapsed') === '1'; } catch { return false; }
//   });
//   const [search, setSearch] = useState('');
//   const [agents, setAgents] = useState([]);
//   const [loadingAgents, setLoadingAgents] = useState(false);

//   useEffect(() => {
//     try { localStorage.setItem('callify_sidebar_collapsed', collapsed ? '1' : '0'); } catch {}
//   }, [collapsed]);

//   useEffect(() => {
//     if (!user) return;
//     setLoadingAgents(true);
//     const url = isAdmin ? `${SERVER_URL}/api/agents` : `${SERVER_URL}/api/crm/my-agents`;
//     axios.get(url)
//       .then(r => setAgents(r.data))
//       .catch(() => setAgents([]))
//       .finally(() => setLoadingAgents(false));
//   }, [user, isAdmin, location.pathname]);

//   const groups = isAdmin ? AdminNav() : UserNav();
//   const filteredAgents = useMemo(() => {
//     if (!search.trim()) return agents.slice(0, 8);
//     const q = search.toLowerCase();
//     return agents.filter(a => a.name.toLowerCase().includes(q)).slice(0, 8);
//   }, [agents, search]);

//   const handleLogout = async () => {
//     await logout();
//     navigate('/login');
//   };

//   return (
//     <TooltipProvider delayDuration={300}>
//       <aside
//         className={cn(
//           'group/sidebar relative flex h-screen flex-col border-r border-border bg-card/60 backdrop-blur-xl transition-[width] duration-300 ease-out shrink-0',
//           collapsed ? 'w-[72px]' : 'w-64'
//         )}
//       >
//         {/* Brand row with collapse button in front of logo */}
//         <div className={cn(
//           'flex items-center gap-2 px-3 h-16 border-b border-border shrink-0',
//           collapsed && 'justify-center px-2'
//         )}>
//           <Tooltip>
//             <TooltipTrigger asChild>
//               <button
//                 onClick={() => setCollapsed(c => !c)}
//                 className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
//                 aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
//               >
//                 {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
//               </button>
//             </TooltipTrigger>
//             <TooltipContent side="bottom">{collapsed ? 'Expand' : 'Collapse'}</TooltipContent>
//           </Tooltip>

//           <div className="relative h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-primary via-primary to-foreground/80 flex items-center justify-center shadow-lg shadow-primary/20">
//             <PhoneCall className="h-4 w-4 text-primary-foreground" />
//             <span className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-card" />
//           </div>

//           {!collapsed && (
//             <div className="min-w-0 flex-1">
//               <p className="font-bold text-sm tracking-tight truncate">Callify</p>
//               <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
//                 {isAdmin ? 'Admin Console' : 'CRM Workspace'}
//               </p>
//             </div>
//           )}
//         </div>

//         {/* Quick action (only admin) */}
//         {isAdmin && (
//           <div className="px-3 pt-3 shrink-0">
//             <Tooltip>
//               <TooltipTrigger asChild>
//                 <Button
//                   size="sm"
//                   onClick={() => navigate('/agents')}
//                   className={cn('w-full gap-2 shadow-md', collapsed && 'px-0')}
//                 >
//                   <Plus className="h-3.5 w-3.5" />
//                   {!collapsed && <span>New Agent</span>}
//                 </Button>
//               </TooltipTrigger>
//               {collapsed && <TooltipContent side="right">New agent</TooltipContent>}
//             </Tooltip>
//           </div>
//         )}

//         {/* Nav (scrollable) */}
//         <div className="flex-1 overflow-y-auto py-3 scrollbar-thin">
//           {groups.map((group) => (
//             <div key={group.group} className="px-3 py-1">
//               {!collapsed && (
//                 <p className="px-2 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
//                   {group.group}
//                 </p>
//               )}
//               <ul className="space-y-0.5">
//                 {group.items.map((item) => (
//                   <NavRow
//                     key={item.to}
//                     to={item.to}
//                     icon={item.icon}
//                     label={item.label}
//                     end={item.end}
//                     badge={item.badge}
//                     collapsed={collapsed}
//                   />
//                 ))}
//               </ul>
//             </div>
//           ))}

//           {/* Agents quick list */}
//           <div className="px-3 py-1">
//             {!collapsed && (
//               <div className="flex items-center justify-between px-2 pt-2 pb-1.5">
//                 <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
//                   {isAdmin ? 'All agents' : 'My agents'}
//                 </p>
//                 <Badge tone="neutral" className="font-mono text-[10px]">{agents.length}</Badge>
//               </div>
//             )}
//             {collapsed && (
//               <p className="px-2 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 text-center">
//                 <Bot className="h-3 w-3 mx-auto" />
//               </p>
//             )}

//             {!collapsed && agents.length > 3 && (
//               <div className="px-1.5 mb-1.5">
//                 <div className="relative">
//                   <Search className="h-3 w-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
//                   <Input
//                     value={search}
//                     onChange={(e) => setSearch(e.target.value)}
//                     placeholder="Filter…"
//                     className="h-7 pl-7 text-xs"
//                   />
//                 </div>
//               </div>
//             )}

//             {loadingAgents ? (
//               <div className="flex justify-center py-2">
//                 <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
//               </div>
//             ) : filteredAgents.length === 0 ? (
//               !collapsed && (
//                 <div className="px-2 py-2 text-[11px] text-muted-foreground/70 italic">No agents</div>
//               )
//             ) : (
//               <ul className="space-y-0.5">
//                 {filteredAgents.map(a => (
//                   <AgentRow
//                     key={a.id}
//                     agent={a}
//                     active={agentId === a.id}
//                     collapsed={collapsed}
//                     to={isAdmin ? `/agents/${a.id}` : `/crm/agent/${a.id}`}
//                     onNavigate={navigate}
//                   />
//                 ))}
//               </ul>
//             )}
//           </div>
//         </div>

//         {/* Footer */}
//         <div className="border-t border-border p-2 shrink-0 space-y-1">
//           {!collapsed && (
//             <div className="px-2 py-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider font-bold text-muted-foreground/80">
//               <span>Account</span>
//               <Badge tone={isAdmin ? 'emerald' : 'blue'} dot className="text-[9px] font-mono">
//                 {isAdmin ? 'Admin' : 'User'}
//               </Badge>
//             </div>
//           )}
//           <UserButton user={user} collapsed={collapsed} onLogout={handleLogout} />
//         </div>
//       </aside>
//     </TooltipProvider>
//   );
// }

// /* ──────────────── Nav row ──────────────── */

// function NavRow({ to, icon: Icon, label, end, badge, collapsed }) {
//   const location = useLocation();
//   const navigate = useNavigate();
//   const isActive = end
//     ? location.pathname === to
//     : location.pathname === to || location.pathname.startsWith(to + '/');

//   return (
//     <li>
//       <Tooltip>
//         <TooltipTrigger asChild>
//           <button
//             onClick={() => navigate(to)}
//             className={cn(
//               'group/row relative w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-all',
//               'text-muted-foreground hover:text-foreground hover:bg-muted/50',
//               isActive && 'bg-primary/10 text-foreground shadow-[inset_2px_0_0_0_hsl(var(--primary))]',
//               collapsed && 'justify-center px-0'
//             )}
//           >
//             <Icon className={cn(
//               'h-4 w-4 shrink-0 transition-colors',
//               isActive ? 'text-primary' : 'text-muted-foreground group-hover/row:text-foreground'
//             )} />
//             {!collapsed && <span className="truncate flex-1 text-left">{label}</span>}
//             {!collapsed && badge && (
//               <Badge tone="primary" className="text-[9px] font-mono px-1.5 py-0">{badge}</Badge>
//             )}
//           </button>
//         </TooltipTrigger>
//         {collapsed && <TooltipContent side="right">{label}</TooltipContent>}
//       </Tooltip>
//     </li>
//   );
// }

// /* ──────────────── Agent row (uses NameAvatar) ──────────────── */

// function AgentRow({ agent, active, collapsed, to, onNavigate }) {
//   return (
//     <li>
//       <Tooltip>
//         <TooltipTrigger asChild>
//           <button
//             onClick={() => onNavigate(to)}
//             className={cn(
//               'w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-all',
//               'text-muted-foreground hover:text-foreground hover:bg-muted/50',
//               active && 'bg-primary/10 text-foreground shadow-[inset_2px_0_0_0_hsl(var(--primary))]',
//               collapsed && 'justify-center px-0'
//             )}
//           >
//             <NameAvatar name={agent.name} size="xs" className={cn(active && 'ring-2 ring-primary')} />
//             {!collapsed && <span className="truncate flex-1 text-left text-xs">{agent.name}</span>}
//           </button>
//         </TooltipTrigger>
//         {collapsed && <TooltipContent side="right">{agent.name}</TooltipContent>}
//       </Tooltip>
//     </li>
//   );
// }

// /* ──────────────── User button ──────────────── */

// function UserButton({ user, collapsed, onLogout }) {
//   if (!user) return null;
//   if (collapsed) {
//     return (
//       <DropdownMenu>
//         <DropdownMenuTrigger asChild>
//           <button className="w-full flex justify-center p-1 rounded-md hover:bg-muted/50 transition-colors">
//             <NameAvatar name={user.name} email={user.email} size="sm" />
//           </button>
//         </DropdownMenuTrigger>
//         <DropdownMenuContent side="right" align="end" className="w-56">
//           <DropdownMenuLabel className="flex flex-col gap-0.5">
//             <span className="text-sm font-semibold">{user.name || user.email}</span>
//             <span className="text-xs text-muted-foreground font-normal">{user.email}</span>
//           </DropdownMenuLabel>
//           <DropdownMenuSeparator />
//           <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
//             <LogOut className="w-3.5 h-3.5 mr-2" /> Sign out
//           </DropdownMenuItem>
//         </DropdownMenuContent>
//       </DropdownMenu>
//     );
//   }
//   return (
//     <DropdownMenu>
//       <DropdownMenuTrigger asChild>
//         <button className="w-full flex items-center gap-2.5 p-1.5 rounded-md hover:bg-muted/50 transition-colors text-left">
//           <NameAvatar name={user.name} email={user.email} size="sm" />
//           <div className="min-w-0 flex-1">
//             <p className="text-xs font-semibold truncate">{user.name || user.email}</p>
//             <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
//           </div>
//         </button>
//       </DropdownMenuTrigger>
//       <DropdownMenuContent side="right" align="end" className="w-56">
//         <DropdownMenuLabel className="flex flex-col gap-0.5">
//           <span className="text-sm font-semibold">{user.name || user.email}</span>
//           <span className="text-xs text-muted-foreground font-normal">{user.email}</span>
//         </DropdownMenuLabel>
//         <DropdownMenuSeparator />
//         <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
//           <LogOut className="w-3.5 h-3.5 mr-2" /> Sign out
//         </DropdownMenuItem>
//       </DropdownMenuContent>
//     </DropdownMenu>
//   );
// }
import { useState, useEffect, useMemo, useRef } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  LayoutDashboard,
  Phone,
  Users,
  Calendar,
  Bot,
  Settings2,
  PhoneCall,
  Plus,
  ChevronLeft,
  LogOut,
  MessageCircle,
  Megaphone,
  Radio,
  Loader2,
  ChevronUp,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { SERVER_URL } from "@/lib/constants";

/* ───────────── helpers ───────────── */

const cx = (...c) => c.filter(Boolean).join(" ");

const STORAGE_KEY = "callify_sidebar_collapsed";

const ADMIN_NAV = [
  {
    group: "Overview",
    items: [
      { to: "/crm/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/crm/calls", icon: Phone, label: "Calls", live: true },
      { to: "/crm/contacts", icon: Users, label: "Contacts" },
      { to: "/crm/calendar", icon: Calendar, label: "Calendar" },
    ],
  },
  {
    group: "Workspace",
    items: [
      { to: "/agents", icon: Bot, label: "Agent Studio", end: true },
      { to: "/crm/agents", icon: Settings2, label: "Agent Settings" },
      { to: "/whatsapp", icon: MessageCircle, label: "WhatsApp Automation" },
      { to: "/whatsapp/campaigns", icon: Megaphone, label: "Campaigns" },
      {
        to: "/admin/whatsapp-numbers",
        icon: PhoneCall,
        label: "WhatsApp Numbers",
      },
      { to: "/admin/whatsapp-live", icon: Radio, label: "Live Chat" },
    ],
  },
];

const USER_NAV = [
  {
    group: "Overview",
    items: [
      { to: "/crm/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/crm/calls", icon: Phone, label: "Calls" },
      { to: "/crm/contacts", icon: Users, label: "Contacts" },
      { to: "/crm/calendar", icon: Calendar, label: "Calendar" },
    ],
  },
];

const initialsOf = (name = "", email = "") => {
  const src = (name || email || "?").trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
};

/* ───────────── sidebar ───────────── */

export default function AppSidebar() {
  const { isAdmin, user, logout } = useAuth();
  const { agentId } = useParams();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [agents, setAgents] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  // persist state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

  // Ctrl/Cmd + B toggles the sidebar
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // load agents once per user/role (no refetch on every route change)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoadingAgents(true);
    const url = isAdmin
      ? `${SERVER_URL}/api/agents`
      : `${SERVER_URL}/api/crm/my-agents`;
    axios
      .get(url)
      .then((r) => !cancelled && setAgents(r.data))
      .catch(() => !cancelled && setAgents([]))
      .finally(() => !cancelled && setLoadingAgents(false));
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin]);

  const groups = isAdmin ? ADMIN_NAV : USER_NAV;
  const visibleAgents = useMemo(
    () => agents.slice(0, collapsed ? 5 : 8),
    [agents, collapsed],
  );

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <aside
      className={cx(
        "relative z-20 flex h-screen shrink-0 flex-col border-r border-border bg-card/60 backdrop-blur-xl",
        "transition-[width] duration-300 ease-in-out",
        collapsed ? "w-[68px]" : "w-64",
      )}
    >
      {/* Edge toggle — sits on the sidebar border, always visible */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand (Ctrl+B)" : "Collapse (Ctrl+B)"}
        className={cx(
          "absolute -right-3 top-[26px] z-30 grid h-6 w-6 place-items-center rounded-full",
          "border border-border bg-card text-muted-foreground shadow-sm",
          "transition-colors hover:bg-muted hover:text-foreground",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        )}
      >
        <ChevronLeft
          className={cx(
            "h-3.5 w-3.5 transition-transform duration-300",
            collapsed && "rotate-180",
          )}
        />
      </button>

      {/* Brand */}
      <div
        className={cx(
          "flex h-16 shrink-0 items-center gap-3 border-b border-border",
          collapsed ? "justify-center px-0" : "px-4",
        )}
      >
        <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary via-primary to-foreground/80 shadow-lg shadow-primary/20">
          <PhoneCall className="h-4 w-4 text-primary-foreground" />
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-bold tracking-tight">Callify</p>
            <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {isAdmin ? "Admin Console" : "CRM Workspace"}
            </p>
          </div>
        )}
      </div>

      {/* Primary action */}
      {isAdmin && (
        <div className={cx("shrink-0 pt-3", collapsed ? "px-3" : "px-3")}>
          <button
            type="button"
            onClick={() => navigate("/agents")}
            className={cx(
              "group relative flex h-9 w-full items-center justify-center gap-2 rounded-lg",
              "bg-primary text-sm font-medium text-primary-foreground shadow-sm",
              "transition hover:opacity-90 active:scale-[0.98]",
            )}
          >
            <Plus className="h-4 w-4 shrink-0" />
            {!collapsed && <span>New Agent</span>}
            {collapsed && <Tip>New agent</Tip>}
          </button>
        </div>
      )}

      {/* Nav — scrolls when expanded; overflow stays visible when collapsed so tooltips aren't clipped */}
      <nav
        className={cx(
          "min-h-0 flex-1 py-3",
          collapsed
            ? "overflow-visible"
            : [
                "overflow-y-auto overflow-x-hidden",
                // Firefox
                "[scrollbar-width:thin] [scrollbar-color:hsl(var(--muted-foreground)/0.25)_transparent]",
                // Chrome / Edge / Safari
                "[&::-webkit-scrollbar]:w-1.5",
                "[&::-webkit-scrollbar-track]:bg-transparent",
                "[&::-webkit-scrollbar-thumb]:rounded-full",
                "[&::-webkit-scrollbar-thumb]:bg-transparent",
                "hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/25",
                "[&::-webkit-scrollbar-thumb:hover]:!bg-muted-foreground/50",
              ].join(" "),
        )}
      >
        {groups.map((g) => (
          <div key={g.group} className="px-3 pb-2">
            {collapsed ? (
              <div className="mx-2 mb-2 mt-1 h-px bg-border" />
            ) : (
              <p className="px-2 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                {g.group}
              </p>
            )}
            <ul className="space-y-0.5">
              {g.items.map((item) => (
                <li key={item.to}>
                  <SideLink {...item} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* Agents */}
        <div className="px-3 pb-2">
          {collapsed ? (
            <div className="mx-2 mb-2 mt-1 h-px bg-border" />
          ) : (
            <p className="px-2 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
              {isAdmin ? "All agents" : "My agents"}
            </p>
          )}

          {loadingAgents ? (
            <div className="flex justify-center py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            </div>
          ) : visibleAgents.length === 0 ? (
            !collapsed && (
              <p className="px-2 py-1 text-xs italic text-muted-foreground/60">
                No agents yet
              </p>
            )
          ) : (
            <ul className="space-y-0.5">
              {visibleAgents.map((a) => {
                const to = isAdmin ? `/agents/${a.id}` : `/crm/agent/${a.id}`;
                return (
                  <li key={a.id}>
                    <AgentLink
                      to={to}
                      name={a.name}
                      active={String(agentId) === String(a.id)}
                      collapsed={collapsed}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </nav>

      {/* User */}
      <div className="shrink-0 border-t border-border p-3">
        <UserMenu
          user={user}
          isAdmin={isAdmin}
          collapsed={collapsed}
          onLogout={handleLogout}
        />
      </div>
    </aside>
  );
}

/* ───────────── pieces ───────────── */

/** CSS-only tooltip, shown on hover of the parent (which must have `group relative`). */
function Tip({ children }) {
  return (
    <span
      role="tooltip"
      className={cx(
        "pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap",
        "rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground shadow-md",
        "opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100",
      )}
    >
      {children}
    </span>
  );
}

function SideLink({ to, icon: Icon, label, end, live, collapsed }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          "group relative flex h-9 items-center rounded-lg text-sm font-medium transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          collapsed ? "justify-center" : "gap-3 px-2.5",
          isActive
            ? "bg-primary/10 text-foreground"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
          )}
          <span className="relative shrink-0">
            <Icon
              className={cx("h-[18px] w-[18px]", isActive && "text-primary")}
            />
            {live && collapsed && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-card bg-emerald-500" />
            )}
          </span>
          {!collapsed && <span className="flex-1 truncate">{label}</span>}
          {!collapsed && live && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-500">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
          )}
          {collapsed && <Tip>{label}</Tip>}
        </>
      )}
    </NavLink>
  );
}

function Avatar({ name, email, size = "h-8 w-8", text = "text-xs", ring }) {
  return (
    <span
      className={cx(
        "grid shrink-0 place-items-center rounded-full bg-primary/15 font-semibold text-primary",
        size,
        text,
        ring && "ring-2 ring-primary",
      )}
    >
      {initialsOf(name, email)}
    </span>
  );
}

function AgentLink({ to, name, active, collapsed }) {
  return (
    <NavLink
      to={to}
      className={cx(
        "group relative flex items-center rounded-lg py-1.5 text-sm transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        collapsed ? "justify-center" : "gap-3 px-2.5",
        active
          ? "bg-primary/10 text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {active && (
        <span className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
      )}
      <Avatar
        name={name}
        size="h-[22px] w-[22px]"
        text="text-[9px]"
        ring={active}
      />
      {!collapsed && (
        <span className="flex-1 truncate text-[13px]">{name}</span>
      )}
      {collapsed && <Tip>{name}</Tip>}
    </NavLink>
  );
}

function UserMenu({ user, isAdmin, collapsed, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) =>
      ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;
  const display = user.name || user.email;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cx(
          "group relative flex w-full items-center rounded-lg p-1.5 text-left transition-colors hover:bg-muted/50",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          collapsed ? "justify-center" : "gap-2.5",
        )}
      >
        <Avatar name={user.name} email={user.email} />
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs font-semibold">{display}</p>
              <p className="truncate text-[10px] text-muted-foreground">
                {isAdmin ? "Administrator" : "User"}
              </p>
            </div>
            <ChevronUp
              className={cx(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                !open && "rotate-180",
              )}
            />
          </>
        )}
        {collapsed && !open && <Tip>{display}</Tip>}
      </button>

      {open && (
        <div
          role="menu"
          className={cx(
            "absolute z-50 w-56 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-xl",
            collapsed ? "bottom-0 left-full ml-3" : "bottom-full left-0 mb-2",
          )}
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{display}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user.email}
            </p>
          </div>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={onLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-500 transition-colors hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}