import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Phone,
  Users,
  Calendar as CalendarIcon,
  Settings2,
  PhoneCall,
  Bot
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const navItems = [
  { to: '/crm/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/crm/calls', icon: Phone, label: 'Calls' },
  { to: '/crm/contacts', icon: Users, label: 'Contacts' },
  { to: '/crm/calendar', icon: CalendarIcon, label: 'Calendar' },
  { to: '/crm/agents', icon: Bot, label: 'Agents' },
];

export default function CrmSidebar() {
  return (
    <aside className="w-64 shrink-0 border-r border-border bg-card flex flex-col">
      <div className="p-5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center shadow-md shadow-foreground/20">
          <PhoneCall className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-bold tracking-tight text-base">Callify</h1>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">CRM</p>
        </div>
      </div>

      <Separator />

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-primary/10 text-primary shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`
            }
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <Separator />

      <div className="p-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Settings2 className="w-3.5 h-3.5" />
          <span>v1.0 · {new Date().getFullYear()}</span>
        </div>
      </div>
    </aside>
  );
}