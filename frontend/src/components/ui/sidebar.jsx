import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/data-badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ChevronsLeft, ChevronsRight, LogOut, User as UserIcon, Settings } from 'lucide-react';

const SidebarContext = createContext(null);

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used inside <SidebarProvider>');
  return ctx;
}

export function SidebarProvider({ defaultOpen = true, children }) {
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem('callify_sidebar_open');
      if (v != null) return v === '1';
    } catch {}
    return defaultOpen;
  });
  const toggle = useCallback(() => setOpen(o => !o), []);
  useEffect(() => {
    try { localStorage.setItem('callify_sidebar_open', open ? '1' : '0'); } catch {}
  }, [open]);
  return (
    <SidebarContext.Provider value={{ open, setOpen, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function Sidebar({ className, children }) {
  const { open } = useSidebar();
  return (
    <aside
      data-state={open ? 'open' : 'collapsed'}
      className={cn(
        'group/sidebar relative flex h-screen flex-col border-r border-border bg-card transition-[width] duration-200 ease-out',
        open ? 'w-64' : 'w-[68px]',
        className
      )}
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({ className, children }) {
  return <div className={cn('flex items-center gap-3 px-4 h-16 border-b border-border shrink-0', className)}>{children}</div>;
}

export function SidebarContent({ className, children }) {
  return <div className={cn('flex-1 overflow-y-auto py-4 scrollbar-thin', className)}>{children}</div>;
}

export function SidebarFooter({ className, children }) {
  return <div className={cn('border-t border-border p-3 shrink-0', className)}>{children}</div>;
}

export function SidebarGroup({ className, children }) {
  return <div className={cn('px-3 py-1', className)}>{children}</div>;
}

export function SidebarGroupLabel({ className, children }) {
  const { open } = useSidebar();
  if (!open) return null;
  return (
    <div className={cn('px-2 pt-3 pb-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground', className)}>
      {children}
    </div>
  );
}

export function SidebarGroupContent({ className, children }) {
  return <div className={cn('space-y-0.5', className)}>{children}</div>;
}

export function SidebarMenu({ className, children }) {
  return <ul className={cn('space-y-0.5', className)}>{children}</ul>;
}

export function SidebarMenuItem({ children }) {
  return <li>{children}</li>;
}

export function SidebarMenuButton({ asChild = false, isActive = false, className, children, ...props }) {
  const { open } = useSidebar();
  const Comp = asChild ? 'span' : 'button';
  return (
    <Comp
      data-active={isActive || undefined}
      title={!open ? (typeof children === 'string' ? children : undefined) : undefined}
      className={cn(
        'group/menubutton relative w-full flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
        'text-muted-foreground hover:text-foreground hover:bg-muted/50',
        'data-[active]:bg-primary/10 data-[active]:text-primary data-[active]:shadow-[inset_2px_0_0_0_hsl(var(--primary))]',
        !open && 'justify-center px-0',
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}

export function SidebarMenuBadge({ className, children }) {
  const { open } = useSidebar();
  if (!open || !children) return null;
  return (
    <Badge tone="neutral" className={cn('ml-auto text-[10px] font-mono px-1.5', className)}>
      {children}
    </Badge>
  );
}

export function SidebarRail() {
  const { toggle, open } = useSidebar();
  return (
    <button
      onClick={toggle}
      aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
      className="absolute -right-3 top-20 z-10 hidden md:flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground shadow-sm"
    >
      {open ? <ChevronsLeft className="h-3.5 w-3.5" /> : <ChevronsRight className="h-3.5 w-3.5" />}
    </button>
  );
}

/* ──────────────── Brand block (logo + title) ──────────────── */

export function SidebarBrand({ icon: Icon, title, subtitle, accent = 'foreground' }) {
  const { open } = useSidebar();
  return (
    <div className={cn('flex items-center gap-3', !open && 'justify-center')}>
      <div
        className={cn(
          'shrink-0 h-9 w-9 rounded-lg flex items-center justify-center shadow-sm',
          accent === 'foreground' ? 'bg-foreground text-background' : 'bg-primary text-primary-foreground'
        )}
      >
        {Icon && <Icon className="h-4.5 w-4.5" />}
      </div>
      {open && (
        <div className="min-w-0">
          <p className="font-bold text-sm tracking-tight truncate">{title}</p>
          {subtitle && <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{subtitle}</p>}
        </div>
      )}
    </div>
  );
}

/* ──────────────── User footer ──────────────── */

export function SidebarUserFooter() {
  const { user, logout, isAdmin } = useAuth();
  const { open } = useSidebar();
  const navigate = useNavigate();
  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (!open) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full p-0 mx-auto">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/15 text-primary text-sm font-semibold">
                {user.email?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">{user.name || user.email}</span>
            <span className="text-xs text-muted-foreground font-normal">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
            <LogOut className="w-3.5 h-3.5 mr-2" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className="bg-primary/15 text-primary text-sm font-semibold">
              {user.email?.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{user.name || user.email}</p>
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              {isAdmin ? 'Admin' : 'CRM User'}
            </p>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">{user.name || user.email}</span>
          <span className="text-xs text-muted-foreground font-normal">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
          <LogOut className="w-3.5 h-3.5 mr-2" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ──────────────── NavLink helper for sidebar items ──────────────── */

export function SidebarNavLink({ to, icon: Icon, label, end = false, badge }) {
  const location = useLocation();
  const isActive = end ? location.pathname === to : location.pathname === to || location.pathname.startsWith(to + '/');
  return (
    <SidebarMenuItem>
      <Link to={to} className="block">
        <SidebarMenuButton isActive={isActive}>
          {Icon && <Icon className="h-4 w-4 shrink-0" />}
          <span className="truncate">{label}</span>
          {badge != null && <SidebarMenuBadge>{badge}</SidebarMenuBadge>}
        </SidebarMenuButton>
      </Link>
    </SidebarMenuItem>
  );
}
