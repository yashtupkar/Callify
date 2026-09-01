import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Users, Loader2, Bot, ExternalLink, Copy, Mail, Phone as PhoneIcon } from 'lucide-react';
import { SERVER_URL } from '@/lib/constants';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/data-badge';
import { toast } from '@/hooks/use-toast';

export default function CrmContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const agentRes = await axios.get(`${SERVER_URL}/api/crm/my-agents`);
        const all = [];
        for (const agent of agentRes.data) {
          const res = await axios.get(`${SERVER_URL}/api/crm/agents/${agent.id}/contacts`);
          for (const c of res.data) all.push({ ...c, agentName: agent.name, agentId: agent.id });
        }
        all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setContacts(all);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const copy = (text, label) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    try { toast({ title: 'Copied', description: label }); } catch {}
  };

  const columns = [
    {
      key: 'name',
      header: 'Contact',
      sortable: true,
      sortAccessor: r => r.name || '',
      render: r => {
        const name = r.name || r.email || 'Unknown';
        const initial = name.charAt(0).toUpperCase();
        return (
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-indigo-500/30 to-violet-500/20 text-foreground flex items-center justify-center text-xs font-semibold border border-border">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="font-medium truncate">{r.name || <span className="text-muted-foreground italic">No name</span>}</div>
              {r.email && <div className="text-xs text-muted-foreground truncate flex items-center gap-1"><Mail className="w-3 h-3" />{r.email}</div>}
            </div>
          </div>
        );
      },
    },
    {
      key: 'phone',
      header: 'Phone',
      sortable: true,
      sortAccessor: r => r.phone || '',
      render: r => r.phone
        ? <span className="font-mono text-sm">{r.phone}</span>
        : <span className="text-muted-foreground text-xs italic">—</span>,
    },
    {
      key: 'agent',
      header: 'Captured by',
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
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      sortAccessor: r => new Date(r.createdAt),
      render: r => (
        <div className="text-sm">
          <div className="font-mono">{new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          <div className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      ),
    },
  ];

  const rows = contacts.map(c => ({
    ...c,
    __actions: [
      { label: 'Open agent', icon: ExternalLink, onClick: () => navigate(`/crm/agent/${c.agentId}`) },
      { separator: true },
      { label: 'Copy email', icon: Copy, onClick: () => copy(c.email, c.email), disabled: !c.email },
      { label: 'Copy phone', icon: Copy, onClick: () => copy(c.phone, c.phone), disabled: !c.phone },
    ],
  }));

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
          <p className="text-muted-foreground mt-1">
            {contacts.length} total {contacts.length === 1 ? 'contact' : 'contacts'}
          </p>
        </div>
        <Badge tone="primary" className="px-3 py-1">
          <Users className="w-3 h-3 mr-1" />
          CRM Database
        </Badge>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        searchPlaceholder="Search by name, email, phone, or agent…"
        searchKeys={[
          r => r.name,
          r => r.email,
          r => r.phone,
          r => r.agentName,
        ]}
        emptyState={
          <div className="space-y-2">
            <Users className="w-10 h-10 mx-auto opacity-30" />
            <p>No contacts yet</p>
          </div>
        }
        onRowClick={r => navigate(`/crm/agent/${r.agentId}`)}
      />
    </div>
  );
}
