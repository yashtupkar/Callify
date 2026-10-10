import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, Search, X, CheckCircle2, Plus } from 'lucide-react';
import { SERVER_URL } from '@/lib/constants';

const API = `${SERVER_URL}/api/whatsapp-automation/crm`;
const STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

const fmt = (value) => (value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function ContactPanel({ contactId, onClose, onChanged }) {
  const [contact, setContact] = useState(null);
  const [note, setNote] = useState('');
  const [task, setTask] = useState('');

  const load = useCallback(async () => {
    const { data } = await axios.get(`${API}/contacts/${contactId}`);
    setContact(data.contact);
  }, [contactId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const act = async (fn) => { await fn(); await load(); onChanged(); };

  if (!contact) return <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l bg-background p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l bg-background p-5 shadow-xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">{contact.name || contact.waId}</h2>
          <p className="text-sm text-muted-foreground">+{contact.waId}{contact.email ? ` · ${contact.email}` : ''}</p>
        </div>
        <button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <label className="text-sm">Stage</label>
        <select
          className="rounded border bg-background px-2 py-1 text-sm"
          value={contact.stage}
          onChange={(e) => act(() => axios.patch(`${API}/contacts/${contact.id}`, { stage: e.target.value }))}
        >
          {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {(contact.tags || []).map((t) => <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs">{t}</span>)}
      </div>

      {contact.customFields && Object.keys(contact.customFields).length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-1 text-sm">
          {Object.entries(contact.customFields).map(([k, v]) => (
            <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd>{String(v)}</dd></div>
          ))}
        </dl>
      )}

      <section className="mt-6">
        <h3 className="mb-2 text-sm font-medium">Tasks &amp; follow-ups</h3>
        {(contact.tasks || []).map((t) => (
          <div key={t.id} className="mb-1 flex items-center justify-between rounded border p-2 text-sm">
            <div>
              <div className={t.status !== 'open' ? 'line-through opacity-60' : ''}>{t.title}</div>
              <div className="text-xs text-muted-foreground">{t.kind} · {fmt(t.dueAt)}</div>
            </div>
            {t.status === 'open' && (
              <button title="Mark done" onClick={() => act(() => axios.patch(`${API}/tasks/${t.id}`, { status: 'done' }))}>
                <CheckCircle2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (task.trim()) act(async () => { await axios.post(`${API}/contacts/${contact.id}/tasks`, { title: task }); setTask(''); }); }}>
          <input className="flex-1 rounded border bg-background px-2 py-1 text-sm" placeholder="New follow-up" value={task} onChange={(e) => setTask(e.target.value)} />
          <button className="rounded border px-2"><Plus className="h-4 w-4" /></button>
        </form>
      </section>

      {(contact.deals || []).length > 0 && (
        <section className="mt-6">
          <h3 className="mb-2 text-sm font-medium">Deals</h3>
          {contact.deals.map((d) => (
            <div key={d.id} className="mb-1 flex justify-between rounded border p-2 text-sm">
              <span>{d.title}</span><span>{d.value != null ? `${d.currency} ${d.value}` : ''} · {d.status}</span>
            </div>
          ))}
        </section>
      )}

      <section className="mt-6">
        <h3 className="mb-2 text-sm font-medium">Timeline</h3>
        <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) act(async () => { await axios.post(`${API}/contacts/${contact.id}/notes`, { note }); setNote(''); }); }}>
          <input className="flex-1 rounded border bg-background px-2 py-1 text-sm" placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="rounded border px-3 text-sm">Add</button>
        </form>
        <ul className="space-y-2">
          {(contact.activities || []).map((a) => (
            <li key={a.id} className="border-l-2 pl-3 text-sm">
              <div>{a.content}</div>
              <div className="text-xs text-muted-foreground">{a.type} · {a.createdBy === 'ai' ? 'AI' : 'Team'} · {fmt(a.createdAt)}</div>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

export default function WhatsAppCrmPage() {
  const [summary, setSummary] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [stage, setStage] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        axios.get(`${API}/summary`),
        axios.get(`${API}/contacts`, { params: { stage: stage || undefined, q: query || undefined } }),
      ]);
      setSummary(s.data);
      setContacts(c.data.contacts || []);
    } finally {
      setLoading(false);
    }
  }, [stage, query]);

  useEffect(() => {
    const timer = setTimeout(() => load().catch(() => {}), 250);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">WhatsApp CRM</h1>
      <p className="text-sm text-muted-foreground">Every customer, note, follow-up and deal captured by your WhatsApp automations.</p>

      {summary && (
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
          {STAGES.map((s) => (
            <button key={s} onClick={() => setStage(stage === s ? '' : s)} className={`rounded border p-3 text-left ${stage === s ? 'border-primary' : ''}`}>
              <div className="text-xs capitalize text-muted-foreground">{s}</div>
              <div className="text-xl font-semibold">{summary.stages?.[s] ?? 0}</div>
            </button>
          ))}
          <div className="rounded border p-3"><div className="text-xs text-muted-foreground">Open tasks</div><div className="text-xl font-semibold">{summary.openTasks ?? 0}</div></div>
          <div className="rounded border p-3"><div className="text-xs text-muted-foreground">Overdue</div><div className="text-xl font-semibold">{summary.overdueTasks ?? 0}</div></div>
        </div>
      )}

      <div className="relative mt-5 max-w-sm">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <input className="w-full rounded border bg-background py-2 pl-8 pr-2 text-sm" placeholder="Search name, phone, email, company" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="mt-4 overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>{['Customer', 'Stage', 'Tags', 'Open tasks', 'Messages', 'Last message'].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-6 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></td></tr>}
            {!loading && contacts.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No contacts yet. They appear when customers message your WhatsApp number.</td></tr>}
            {!loading && contacts.map((c) => (
              <tr key={c.id} className="cursor-pointer border-t hover:bg-muted/30" onClick={() => setSelected(c.id)}>
                <td className="p-3"><div className="font-medium">{c.name || 'Unknown'}</div><div className="text-xs text-muted-foreground">+{c.waId}</div></td>
                <td className="p-3 capitalize">{c.stage}</td>
                <td className="p-3">{(c.tags || []).join(', ') || '—'}</td>
                <td className="p-3">{c._count?.tasks ?? 0}</td>
                <td className="p-3">{c.messageCount}</td>
                <td className="p-3">{fmt(c.lastMessageAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && <ContactPanel contactId={selected} onClose={() => setSelected(null)} onChanged={() => load().catch(() => {})} />}
    </div>
  );
}
