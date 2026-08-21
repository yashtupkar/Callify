import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { 
  Search,
  Wand2,
  Users,
  Wrench,
  PhoneCall,
  PhoneForwarded,
  Files,
  ClipboardCheck,
  PlaySquare,
  LayoutTemplate,
  Activity,
  LayoutDashboard,
  ChevronDown,
} from 'lucide-react';
import { cn } from '../lib/utils';

function SidebarItem({ icon: Icon, label, active = false, shortcut = null, to = null }) {
  if (to) {
    return (
      <NavLink
        to={to}
        className={({ isActive }) => cn(
          "flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors text-sm",
          "hover:bg-accent hover:text-accent-foreground text-muted-foreground",
          isActive && "bg-accent/50 text-foreground font-medium"
        )}
      >
        <div className="flex items-center gap-3">
          <Icon size={16} />
          <span>{label}</span>
        </div>
      </NavLink>
    );
  }
  return (
    <div className={cn(
      "flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors text-sm",
      "hover:bg-accent hover:text-accent-foreground text-muted-foreground",
      active && "bg-accent/50 text-foreground font-medium"
    )}>
      <div className="flex items-center gap-3">
        <Icon size={16} className={active ? "text-primary" : ""} />
        <span>{label}</span>
      </div>
      {shortcut && (
        <span className="text-[10px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">
          {shortcut}
        </span>
      )}
    </div>
  );
}

export function DashboardLayout() {
  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground font-sans">
      {/* Sidebar Layout */}
      <aside className="w-64 border-r border-border bg-card flex flex-col shrink-0">
        <div className="h-16 flex items-center px-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 font-semibold text-lg tracking-tight">
            <Wand2 size={24} className="text-primary" />
            Callify
          </div>
        </div>
        
        <div className="p-3 shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 bg-accent/50 rounded-md border border-border cursor-pointer">
            <div className="w-6 h-6 bg-emerald-500 rounded text-black flex items-center justify-center font-bold text-xs">
              Y
            </div>
            <span className="text-sm font-medium truncate flex-1">yashtupkar@gmail.com</span>
            <ChevronDown size={14} className="text-muted-foreground" />
          </div>
          
          <div className="mt-4 flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-md text-muted-foreground">
            <Search size={14} />
            <span className="text-sm flex-1">Search</span>
            <span className="text-[10px] font-mono bg-zinc-800 px-1 rounded">⌘ K</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2 flex flex-col gap-1 px-3">
          <div className="mt-4 mb-1">
            <p className="px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Studio</p>
            <SidebarItem icon={Wand2} label="Composer" to="/dashboard/composer" />
          </div>

          <div className="mt-4 mb-1">
            <p className="px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Build</p>
            <SidebarItem icon={Users} label="Assistants" to="/dashboard/assistants" />
            <SidebarItem icon={Wrench} label="Squads" />
            <SidebarItem icon={Wrench} label="Tools" />
            <SidebarItem icon={PhoneCall} label="Phone Numbers" />
            <SidebarItem icon={PhoneForwarded} label="Outbound" />
            <SidebarItem icon={Files} label="Resources" />
          </div>

          <div className="mt-4 mb-1">
            <p className="px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Test</p>
            <SidebarItem icon={ClipboardCheck} label="Evals" />
            <SidebarItem icon={PlaySquare} label="Simulations" />
            <SidebarItem icon={LayoutTemplate} label="Test Suites" />
          </div>

          <div className="mt-4 mb-1">
            <p className="px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Observe</p>
            <SidebarItem icon={Activity} label="Logs" />
            <SidebarItem icon={LayoutDashboard} label="Boards" />
          </div>
        </div>

        <div className="p-4 border-t border-border mt-auto shrink-0">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold bg-zinc-800 px-2 py-0.5 rounded text-muted-foreground">PAYG</span>
            <span className="text-sm font-medium">-0.53 Credits</span>
          </div>
          <button className="w-full flex items-center justify-center gap-2 py-2 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/80 transition-colors">
            Buy Credits
          </button>
        </div>
      </aside>

      {/* Main Content Router Area */}
      <main className="flex-1 bg-background relative overflow-hidden flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
