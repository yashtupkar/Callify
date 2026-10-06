import { useEffect, useState } from 'react';
import axios from 'axios';
import { MessageCircle, Plus, Trash2, Link2, Pencil, Save, X } from 'lucide-react';
import { SERVER_URL } from '@/lib/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';

const empty = { name: '', businessName: '', systemPrompt: '', initialMessage: '', language: 'en-US', supportedLanguages: ['en-US'], timezone: 'Asia/Kolkata' };

export default function WhatsAppAutomationsPage() {
  const { isAdmin } = useAuth();
  const [automations, setAutomations] = useState([]);
  const [instances, setInstances] = useState([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [selectedInstances, setSelectedInstances] = useState({});
  const [connectingId, setConnectingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [automationsResponse, instancesResponse] = await Promise.all([
        axios.get(`${SERVER_URL}/api/whatsapp-automation`),
        axios.get(`${SERVER_URL}/api/baileys/instances`),
      ]);
      setAutomations(automationsResponse.data.automations || []);
      setInstances(instancesResponse.data || []);
    } catch (err) { setError(err.response?.data?.error || err.message); }
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        status: 'active',
        supportedLanguages: form.supportedLanguages,
      };
      if (editingId) {
        await axios.put(`${SERVER_URL}/api/whatsapp-automation/${editingId}`, payload);
      } else {
        await axios.post(`${SERVER_URL}/api/whatsapp-automation`, payload);
      }
      setForm({ ...empty, supportedLanguages: [...empty.supportedLanguages] });
      setEditingId(null);
      await load();
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const edit = (automation) => {
    setForm({
      name: automation.name || '',
      businessName: automation.businessName || '',
      systemPrompt: automation.systemPrompt || '',
      initialMessage: automation.initialMessage || '',
      language: automation.language || 'en-US',
      supportedLanguages: automation.supportedLanguages?.length
        ? automation.supportedLanguages
        : [automation.language || 'en-US'],
      timezone: automation.timezone || 'Asia/Kolkata',
    });
    setEditingId(automation.id);
    setError('');
  };

  const cancelEdit = () => {
    setForm({ ...empty, supportedLanguages: [...empty.supportedLanguages] });
    setEditingId(null);
    setError('');
  };

  const addConnection = async (automation, instance) => {
    if (!automation || !instance) return;
    setConnectingId(automation.id);
    try {
      await axios.post(`${SERVER_URL}/api/whatsapp-automation/${automation.id}/connections`, {
        provider: 'baileys',
        phoneNumber: instance.phoneNumber,
        instanceId: instance.instanceId,
      });
      setSelectedInstances({ ...selectedInstances, [automation.id]: '' });
      await load();
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setConnectingId(null);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this WhatsApp automation?')) return;
    await axios.delete(`${SERVER_URL}/api/whatsapp-automation/${id}`);
    load();
  };

  if (!isAdmin) return <div className="p-6 text-muted-foreground">Admins only.</div>;

  const connectedAutomationInstanceIds = new Set(
  automations.flatMap(a => (a.connections || []).map(c => c.instanceId).filter(Boolean))
  );
  const availableInstances = instances.filter(instance => {
  const status = typeof instance.status === 'object'
    ? instance.status?.status || instance.status?.connection
    : instance.status;
  return (status === 'connected' || status === 'open')
    && instance.phoneNumber
    && !instance.agentId;
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><MessageCircle className="w-6 h-6" /> WhatsApp Automation</h1>
        <p className="text-sm text-muted-foreground mt-1">Create independent WhatsApp automations. No voice agent is required.</p>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">{editingId ? 'Edit automation' : 'Create automation'}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Automation name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Business name" value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })} />
            <select className="border rounded-md px-2 py-2 text-sm bg-background w-full" value={form.language} onChange={e => setForm({ ...form, language: e.target.value, supportedLanguages: [e.target.value] })}>
              <option value="en-US">English</option><option value="hi-IN">Hindi</option><option value="mr-IN">Marathi</option><option value="es-ES">Spanish</option><option value="ar-SA">Arabic</option>
            </select>
            <Input placeholder="Timezone" value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })} />
            <textarea className="min-h-[130px] w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Automation instructions / system prompt" value={form.systemPrompt} onChange={e => setForm({ ...form, systemPrompt: e.target.value })} />
            <Input placeholder="Welcome message (optional)" value={form.initialMessage} onChange={e => setForm({ ...form, initialMessage: e.target.value })} />
            <div className="flex gap-2">
              <Button onClick={save} disabled={!form.name || !form.systemPrompt || saving}>
                {editingId ? <Save className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create'}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                  <X className="w-4 h-4 mr-2" /> Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        <div className="space-y-3">
          {automations.map(a => (
            <Card key={a.id}>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-left flex-1">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.businessName || 'WhatsApp automation'} · {a.status}</div>
                  </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => edit(a)} aria-label={`Edit ${a.name}`}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => remove(a.id)} aria-label={`Delete ${a.name}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {a.connections?.length || 0} WhatsApp number(s) connected
                </div>
                {a.connections?.length > 0 && (
                  <div className="space-y-1">
                    {a.connections.map(c => (
                      <div key={c.id} className="text-sm rounded-md border px-3 py-2">
                        {c.phoneNumber} <span className="text-xs text-muted-foreground">({c.instanceId || c.provider})</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <select
                    className="border rounded-md px-2 py-2 text-sm bg-background flex-1"
                    value={selectedInstances[a.id] || ''}
                    onChange={e => setSelectedInstances({ ...selectedInstances, [a.id]: e.target.value })}
                  >
                    <option value="">Select a connected WhatsApp number</option>
                    {availableInstances
                      .filter(instance => !connectedAutomationInstanceIds.has(instance.instanceId))
                      .map(instance => (
                        <option key={instance.instanceId} value={instance.instanceId}>
                          {instance.phoneNumber} ({instance.instanceId})
                        </option>
                      ))}
                  </select>
                  <Button
                    onClick={() => addConnection(a, availableInstances.find(i => i.instanceId === selectedInstances[a.id]))}
                    disabled={!selectedInstances[a.id] || connectingId === a.id}
                  >
                    <Link2 className="w-4 h-4 mr-2" />
                    {connectingId === a.id ? 'Connecting…' : 'Connect number'}
                  </Button>
                </div>
                {!availableInstances.some(instance => !connectedAutomationInstanceIds.has(instance.instanceId)) && (
                  <div className="text-xs text-muted-foreground">
                    No unassigned connected numbers are available. Connect a number from WhatsApp Connect first.
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {!automations.length && <Card><CardContent className="p-8 text-center text-muted-foreground">No automations yet.</CardContent></Card>}
        </div>
      </div>
    </div>
  );
}
