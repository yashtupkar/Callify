import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed, Loader2, User, Bot, ExternalLink, Copy, Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SERVER_URL } from '@/lib/constants';
import { DataTable } from '@/components/ui/data-table';
import { Badge, StatusBadge } from '@/components/ui/data-badge';
import { toast } from '@/hooks/use-toast';

export default function CrmCallsPage() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const allBookings = [];
        for (const agent of (await axios.get(`${SERVER_URL}/api/crm/my-agents`)).data) {
          const res = await axios.get(`${SERVER_URL}/api/crm/agents/${agent.id}/bookings?all=true`);
          for (const b of res.data) {
            allBookings.push({ ...b, agentName: agent.name, agentId: agent.id });
          }
        }
        allBookings.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
        setCalls(allBookings);
      } catch (err) {
        console.error('Failed to load calls', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const counts = {
    total: calls.length,
    confirmed: calls.filter(c => c.status === 'confirmed' || !c.status).length,
    cancelled: calls.filter(c => c.status === 'cancelled').length,
    rescheduled: calls.filter(c => c.status === 'rescheduled').length,
  };

  const filtered = filter === 'all' ? calls : calls.filter(c => (c.status || 'confirmed') === filter);

  const copy = (text, label) => {
    navigator.clipboard?.writeText(text);
    try { toast({ title: 'Copied', description: label }); } catch {}
  };

  const columns = [
    {
      key: 'contact',
      header: 'Contact',
      sortable: true,
      sortAccessor: r => r.contact?.name || '',
      render: r => {
        const name = r.contact?.name || 'Unknown';
        const initial = name.charAt(0).toUpperCase();
        return (
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-indigo-500/30 to-violet-500/20 text-foreground flex items-center justify-center text-xs font-semibold border border-border">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="font-medium truncate">{name}</div>
              {r.contact?.phone && <div className="text-xs text-muted-foreground truncate">{r.contact.phone}</div>}
            </div>
          </div>
        );
      },
    },
    {
      key: 'agent',
      header: 'Agent',
      sortable: true,
      sortAccessor: r => r.agentName,
      render: r => (
        <div className="flex items-center gap-1.5 text-sm">
          <Bot className="w-3.5 h-3.5 text-muted-foreground" />
          <span>{r.agentName}</span>
        </div>
      ),
    },
    {
      key: 'startTime',
      header: 'Scheduled',
      sortable: true,
      sortAccessor: r => new Date(r.startTime),
      render: r => {
        const start = new Date(r.startTime);
        const end = new Date(r.endTime);
        const now = new Date();
        const isPast = end < now;
        return (
          <div className="text-sm">
            <div className="font-mono">{start.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            <div className="text-xs text-muted-foreground">{isPast ? 'Past' : 'Upcoming'} · {Math.round((end - start) / 60000)}m</div>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      width: '140px',
      render: r => <StatusBadge status={r.status || 'confirmed'} />,
    },
  ];

  const rows = filtered.map(c => ({
    ...c,
    __actions: [
      {
        label: 'Open agent',
        icon: ExternalLink,
        onClick: () => navigate(`/crm/agent/${c.agentId}`),
      },
      {
        label: 'Open in calendar',
        icon: Calendar,
        onClick: () => navigate(`/crm/calendar?agent=${c.agentId}`),
      },
      { separator: true },
      {
        label: 'Copy phone',
        icon: Copy,
        onClick: () => copy(c.contact?.phone || '', c.contact?.phone || ''),
        disabled: !c.contact?.phone,
      },
    ],
  }));

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calls</h1>
          <p className="text-muted-foreground mt-1">All call activity across your agents</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total" value={counts.total} icon={PhoneCall} />
        <StatCard label="Confirmed" value={counts.confirmed} icon={PhoneIncoming} tone="emerald" />
        <StatCard label="Rescheduled" value={counts.rescheduled} icon={PhoneOutgoing} tone="violet" />
        <StatCard label="Cancelled" value={counts.cancelled} icon={PhoneMissed} tone="red" />
      </div>

      <div className="flex items-center gap-1.5 p-1 rounded-lg border border-border bg-card w-fit">
        {['all', 'confirmed', 'rescheduled', 'cancelled'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ' +
              (filter === s
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50')
            }
          >
            {s}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        searchPlaceholder="Search by name, agent, or phone…"
        searchKeys={[
          r => r.contact?.name,
          r => r.agentName,
          r => r.contact?.phone,
          r => r.contact?.email,
        ]}
        emptyState={
          <div className="space-y-2">
            <PhoneCall className="w-10 h-10 mx-auto opacity-30" />
            <p>No calls found</p>
          </div>
        }
        onRowClick={r => navigate(`/crm/agent/${r.agentId}`)}
      />
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone = 'primary' }) {
  const toneClasses = {
    primary: 'bg-primary/15 text-primary',
    emerald: 'bg-emerald-500/15 text-emerald-400',
    violet:  'bg-violet-500/15 text-violet-400',
    red:     'bg-red-500/15 text-red-400',
  }[tone];
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${toneClasses}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className="text-2xl font-bold leading-tight">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
