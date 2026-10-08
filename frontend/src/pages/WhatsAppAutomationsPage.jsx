import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  MessageCircle, Plus, Trash2, Link2, Pencil, Save, X, Globe,
  ShieldCheck, Copy, Check, ExternalLink, RefreshCw, KeyRound, Phone
} from 'lucide-react';
import { SERVER_URL } from '@/lib/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/data-badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';

const empty = {
  name: '',
  businessName: '',
  systemPrompt: '',
  initialMessage: '',
  language: 'en-US',
  supportedLanguages: ['en-US'],
  timezone: 'Asia/Kolkata',
};

const emptyMeta = {
  phoneNumber: '',
  phoneNumberId: '',
  apiToken: '',
  apiVersion: 'v20.0',
  verifyToken: 'callify_webhook_token',
  appSecret: '',
  businessId: '',
};

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
  const [success, setSuccess] = useState('');

  // Meta Dialog state
  const [metaDialogOpen, setMetaDialogOpen] = useState(false);
  const [metaTargetAutomation, setMetaTargetAutomation] = useState(null);
  const [metaForm, setMetaForm] = useState(emptyMeta);
  const [savingMeta, setSavingMeta] = useState(false);
  const [copiedField, setCopiedField] = useState(null);

  const load = async () => {
    try {
      const [automationsResponse, instancesResponse] = await Promise.all([
        axios.get(`${SERVER_URL}/api/whatsapp-automation`),
        axios.get(`${SERVER_URL}/api/baileys/instances`),
      ]);
      setAutomations(automationsResponse.data.automations || []);
      setInstances(instancesResponse.data || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const copyToClipboard = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

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
      setSuccess('Automation saved successfully');
      setTimeout(() => setSuccess(''), 3000);
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

  const addBaileysConnection = async (automation, instance) => {
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

  const openMetaModal = (automation) => {
    setMetaTargetAutomation(automation);
    setMetaForm({
      ...emptyMeta,
      verifyToken: `verify_${Math.random().toString(36).slice(2, 10)}`,
    });
    setMetaDialogOpen(true);
    setError('');
  };

  const saveMetaConnection = async () => {
    if (!metaTargetAutomation) return;
    if (!metaForm.phoneNumber || !metaForm.phoneNumberId || !metaForm.apiToken) {
      setError('Phone Number, Phone Number ID, and Access Token are required.');
      return;
    }

    setSavingMeta(true);
    try {
      await axios.post(`${SERVER_URL}/api/whatsapp-automation/${metaTargetAutomation.id}/connections`, {
        provider: 'cloud_api',
        phoneNumber: metaForm.phoneNumber.trim(),
        phoneNumberId: metaForm.phoneNumberId.trim(),
        apiToken: metaForm.apiToken.trim(),
        verifyToken: metaForm.verifyToken.trim(),
        appSecret: metaForm.appSecret ? metaForm.appSecret.trim() : null,
        businessId: metaForm.businessId ? metaForm.businessId.trim() : null,
        credentials: {
          apiVersion: metaForm.apiVersion.trim() || 'v20.0',
        },
      });
      setMetaDialogOpen(false);
      await load();
      setError('');
      setSuccess('Meta Cloud API connected successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSavingMeta(false);
    }
  };

  const removeConnection = async (automationId, connectionId) => {
    if (!confirm('Disconnect this WhatsApp number from the automation?')) return;
    try {
      await axios.delete(`${SERVER_URL}/api/whatsapp-automation/${automationId}/connections/${connectionId}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const removeAutomation = async (id) => {
    if (!confirm('Delete this WhatsApp automation?')) return;
    try {
      await axios.delete(`${SERVER_URL}/api/whatsapp-automation/${id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
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

  const webhookUrl = `${SERVER_URL}/api/whatsapp-automation/webhook`;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-emerald-500" /> WhatsApp Automation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Build AI-driven WhatsApp chatbots. Supports Official Meta WhatsApp Cloud API & Linked Devices.
          </p>
        </div>
      </div>

      {/* Global Webhook Info Banner */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Globe className="w-4 h-4 text-primary" /> Meta WhatsApp Cloud API Webhook URL
              </div>
              <p className="text-xs text-muted-foreground">
                Configure this Callback URL in your Meta App Dashboard under <strong>WhatsApp → Configuration → Webhook</strong>.
              </p>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <code className="bg-background px-3 py-1.5 rounded-md border text-xs font-mono select-all">
                {webhookUrl}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(webhookUrl, 'globalWebhook')}
              >
                {copiedField === 'globalWebhook' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 rounded-md text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 rounded-md text-sm">
          {success}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1.3fr]">
        {/* Left: Create / Edit Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>{editingId ? 'Edit Automation' : 'Create Automation'}</span>
              {editingId && (
                <Badge tone="primary">Editing</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Automation Name *</label>
              <Input
                placeholder="e.g. Customer Support Bot"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Business Name</label>
              <Input
                placeholder="e.g. Acme Corp"
                value={form.businessName}
                onChange={e => setForm({ ...form, businessName: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Primary Language</label>
                <select
                  className="border rounded-md px-3 py-2 text-sm bg-background w-full"
                  value={form.language}
                  onChange={e => setForm({ ...form, language: e.target.value, supportedLanguages: [e.target.value] })}
                >
                  <option value="en-US">English</option>
                  <option value="hi-IN">Hindi</option>
                  <option value="mr-IN">Marathi</option>
                  <option value="es-ES">Spanish</option>
                  <option value="ar-SA">Arabic</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Timezone</label>
                <Input
                  placeholder="Asia/Kolkata"
                  value={form.timezone}
                  onChange={e => setForm({ ...form, timezone: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">System Instructions / Prompt *</label>
              <textarea
                className="min-h-[140px] w-full rounded-md border bg-background px-3 py-2 text-sm font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="You are a helpful customer service assistant for Acme Corp..."
                value={form.systemPrompt}
                onChange={e => setForm({ ...form, systemPrompt: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Initial Greeting Message (Optional)</label>
              <Input
                placeholder="Hi! How can I help you today?"
                value={form.initialMessage}
                onChange={e => setForm({ ...form, initialMessage: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={save} disabled={!form.name || !form.systemPrompt || saving} className="flex-1">
                {editingId ? <Save className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create Automation'}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                  <X className="w-4 h-4 mr-2" /> Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right: Automations List */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground">Active Automations ({automations.length})</h2>
          {automations.map(a => (
            <Card key={a.id} className="relative overflow-hidden border">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-left flex-1">
                    <div className="font-semibold text-base">{a.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {a.businessName || 'WhatsApp Automation'} · {a.language} · <span className="text-emerald-500 font-medium capitalize">{a.status}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => edit(a)} aria-label={`Edit ${a.name}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => removeAutomation(a.id)} aria-label={`Delete ${a.name}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Connected WhatsApp Numbers */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Connected WhatsApp Channels ({a.connections?.length || 0}):
                  </div>
                  {a.connections && a.connections.length > 0 ? (
                    <div className="space-y-1.5">
                      {a.connections.map(c => (
                        <div
                          key={c.id}
                          className="text-sm rounded-lg border bg-muted/30 px-3 py-2 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-primary" />
                            <span className="font-medium font-mono text-xs">{c.phoneNumber}</span>
                            <Badge
                              tone={c.provider === 'cloud_api' ? 'sky' : 'emerald'}
                              className="text-[10px] uppercase font-semibold"
                            >
                              {c.provider === 'cloud_api' ? 'Meta Cloud API' : 'Baileys Linked'}
                            </Badge>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                            onClick={() => removeConnection(a.id, c.id)}
                            title="Disconnect Number"
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground bg-muted/20 p-2.5 rounded-md border border-dashed text-center">
                      No WhatsApp numbers connected yet. Connect via Meta Cloud API or QR Code below.
                    </div>
                  )}
                </div>

                {/* Connection Action Buttons */}
                <div className="pt-2 border-t space-y-2">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="bg-sky-600 hover:bg-sky-700 text-white flex-1"
                      onClick={() => openMetaModal(a)}
                    >
                      <KeyRound className="w-4 h-4 mr-1.5" /> Connect Meta Cloud API
                    </Button>
                  </div>

                  {/* Baileys instance connector */}
                  <div className="flex gap-2">
                    <select
                      className="border rounded-md px-2 py-1.5 text-xs bg-background flex-1"
                      value={selectedInstances[a.id] || ''}
                      onChange={e => setSelectedInstances({ ...selectedInstances, [a.id]: e.target.value })}
                    >
                      <option value="">Or select a QR Linked Device...</option>
                      {availableInstances
                        .filter(instance => !connectedAutomationInstanceIds.has(instance.instanceId))
                        .map(instance => (
                          <option key={instance.instanceId} value={instance.instanceId}>
                            {instance.phoneNumber} ({instance.instanceId})
                          </option>
                        ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addBaileysConnection(a, availableInstances.find(i => i.instanceId === selectedInstances[a.id]))}
                      disabled={!selectedInstances[a.id] || connectingId === a.id}
                    >
                      <Link2 className="w-3.5 h-3.5 mr-1" />
                      {connectingId === a.id ? 'Linking…' : 'Link QR'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {!automations.length && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground space-y-2">
                <MessageCircle className="w-10 h-10 mx-auto text-muted-foreground/50" />
                <div className="font-medium">No Automations Created</div>
                <div className="text-xs">Create your first WhatsApp AI bot using the form on the left.</div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Meta Cloud API Connection Dialog */}
      <Dialog open={metaDialogOpen} onOpenChange={setMetaDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-sky-500" />
              Connect Meta WhatsApp Cloud API
            </DialogTitle>
            <DialogDescription>
              Store your Meta Developer credentials to enable automated AI messaging via the Official WhatsApp Graph API.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Phone Number (E.164 with Country Code) *</label>
              <Input
                placeholder="e.g. +15551234567 or +919876543210"
                value={metaForm.phoneNumber}
                onChange={e => setMetaForm({ ...metaForm, phoneNumber: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">Your verified WhatsApp business phone number.</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold">Phone Number ID (WHATSAPP_PHONE_NUMBER_ID) *</label>
              <Input
                placeholder="e.g. 104829384812345"
                value={metaForm.phoneNumberId}
                onChange={e => setMetaForm({ ...metaForm, phoneNumberId: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">Found in Meta App Dashboard → WhatsApp → API Setup.</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold">Access Token (WHATSAPP_ACCESS_TOKEN) *</label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-xs font-mono min-h-[70px] focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="EAAG..."
                value={metaForm.apiToken}
                onChange={e => setMetaForm({ ...metaForm, apiToken: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">Permanent System User Token (recommended) or 24hr temporary token.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold">API Version (WHATSAPP_API_VERSION)</label>
                <Input
                  placeholder="v20.0"
                  value={metaForm.apiVersion}
                  onChange={e => setMetaForm({ ...metaForm, apiVersion: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Webhook Verify Token *</label>
                <Input
                  placeholder="custom_verify_token"
                  value={metaForm.verifyToken}
                  onChange={e => setMetaForm({ ...metaForm, verifyToken: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold">App Secret (WHATSAPP_APP_SECRET - Optional)</label>
              <Input
                type="password"
                placeholder="Meta App Secret for HMAC signature security"
                value={metaForm.appSecret}
                onChange={e => setMetaForm({ ...metaForm, appSecret: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold">WhatsApp Business Account ID (WABA ID - Optional)</label>
              <Input
                placeholder="e.g. 109823485723412"
                value={metaForm.businessId}
                onChange={e => setMetaForm({ ...metaForm, businessId: e.target.value })}
              />
            </div>

            {/* Meta Webhook Setup Instructions in Dialog */}
            <div className="rounded-lg bg-muted/50 p-3 border space-y-2">
              <div className="text-xs font-semibold flex items-center gap-1.5 text-primary">
                <ShieldCheck className="w-4 h-4" /> Meta Webhook Configuration Details
              </div>
              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-muted-foreground">Callback URL:</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <code className="bg-background px-2 py-1 rounded border text-[11px] select-all flex-1">
                      {webhookUrl}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => copyToClipboard(webhookUrl, 'modalUrl')}
                    >
                      {copiedField === 'modalUrl' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Verify Token:</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <code className="bg-background px-2 py-1 rounded border text-[11px] select-all flex-1">
                      {metaForm.verifyToken}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => copyToClipboard(metaForm.verifyToken, 'modalToken')}
                    >
                      {copiedField === 'modalToken' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground pt-1">
                  In Meta Dashboard, subscribe to the <strong>messages</strong> webhook field.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMetaDialogOpen(false)} disabled={savingMeta}>
              Cancel
            </Button>
            <Button onClick={saveMetaConnection} disabled={savingMeta} className="bg-sky-600 hover:bg-sky-700 text-white">
              {savingMeta ? 'Saving...' : 'Save & Connect'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
