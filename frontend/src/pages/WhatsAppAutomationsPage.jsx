import { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle, Plus, Loader2, Power, Pencil, Trash2, Save, X, Bot, Phone, Sparkles, Check, Copy, ExternalLink,
} from 'lucide-react';
import { SERVER_URL } from '@/lib/constants';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/data-badge';
import { useAuth } from '@/hooks/useAuth';

const STATUS_STYLES = {
  active:  { label: 'Active',  cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
  paused:  { label: 'Paused',  cls: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
  draft:   { label: 'Draft',   cls: 'bg-zinc-500/15 text-zinc-500 border-zinc-500/30' },
};

export default function WhatsAppAutomationsPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [automations, setAutomations] = useState([]);
  const [presets, setPresets] = useState([]);
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [a, p, i] = await Promise.all([
        axios.get(`${SERVER_URL}/api/agents`),
        axios.get(`${SERVER_URL}/api/whatsapp/presets`),
        axios.get(`${SERVER_URL}/api/baileys/instances`),
      ]);
      setAutomations((a.data || []).filter(x => x.whatsappEnabled || x.automationPurpose));
      setPresets(p.data.presets || []);
      setInstances(i.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isAdmin) refresh(); }, [isAdmin]);

  const toggleStatus = async (agent, nextStatus) => {
    try {
      await axios.put(`${SERVER_URL}/api/whatsapp/automations/${agent.id}/status`, { status: nextStatus });
      refresh();
    } catch (e) { console.error(e); }
  };

  const deleteAutomation = async (agent) => {
    if (!confirm(`Delete automation "${agent.name}"? This removes the agent and all its data.`)) return;
    try {
      await axios.delete(`${SERVER_URL}/api/agents/${agent.id}`);
      refresh();
    } catch (e) { console.error(e); }
  };

  if (!isAdmin) return <div className="p-6 text-muted-foreground">Admins only.</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MessageCircle className="w-6 h-6" /> WhatsApp Automations
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Build, configure and deploy AI agents on your clients' WhatsApp numbers. Each automation is an agent with a clear purpose, data it collects, and tools it can use.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/admin/whatsapp-live')}>
            <ExternalLink className="w-4 h-4 mr-2" /> Live Conversations
          </Button>
          <Button onClick={() => setShowNew(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Automation
          </Button>
        </div>
      </div>

      {/* Onboarding banner when no numbers connected */}
      {instances.length === 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3">
            <Phone className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <div className="font-medium">Connect a WhatsApp number first</div>
              <div className="text-sm text-muted-foreground">You need at least one connected WhatsApp number before messages can flow. Connect by scanning a QR code — no API keys needed.</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/whatsapp-numbers')}>
              Connect number
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Grid of automation cards */}
      {loading && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}

      {!loading && automations.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Bot className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <div className="font-medium mb-1">No automations yet</div>
            <div className="text-sm">Click "New Automation" to spin up your first one in seconds.</div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {automations.map((a) => {
          const status = STATUS_STYLES[a.automationStatus] || STATUS_STYLES.draft;
          const preset = presets.find(p => p.id === a.automationPurpose);
          const phoneForAgent = instances.find(i => i.id); // not 1:1 in current model; show assigned phones if present
          return (
            <Card key={a.id} className="hover:border-primary/40 transition">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{preset?.icon || '✨'}</span>
                    <div>
                      <CardTitle className="text-base">{a.name}</CardTitle>
                      <div className="text-xs text-muted-foreground">{preset?.name || 'Custom automation'}</div>
                    </div>
                  </div>
                  <Badge className={status.cls}>{status.label}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground line-clamp-3 min-h-[2.5em]">
                  {a.conversationGuidelines?.split('\n')[0] || a.systemPrompt?.slice(0, 120) || 'No description yet.'}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Phone className="w-3.5 h-3.5" />
                  {phoneForAgent ? phoneForAgent.phoneNumber : 'No number assigned'}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditing(a)}>
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                  </Button>
                  {a.automationStatus === 'active' ? (
                    <Button size="sm" variant="outline" onClick={() => toggleStatus(a, 'paused')}>
                      <Power className="w-3.5 h-3.5" />
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => toggleStatus(a, 'active')}>
                      <Power className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button size="sm" variant="destructive" onClick={() => deleteAutomation(a)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {showNew && (
        <NewAutomationDialog
          presets={presets}
          instances={instances}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); refresh(); }}
        />
      )}

      {editing && (
        <EditAutomationDialog
          agent={editing}
          instances={instances}
          presets={presets}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// "New Automation" dialog
// ------------------------------------------------------------------
function NewAutomationDialog({ presets, instances, onClose, onCreated }) {
  const [step, setStep] = useState(1);
  const [presetId, setPresetId] = useState(null);
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phoneInstanceId, setPhoneInstanceId] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [language, setLanguage] = useState('en-US');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const preset = presets.find(p => p.id === presetId);

  const create = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await axios.post(`${SERVER_URL}/api/whatsapp/automations`, {
        presetId,
        name: name || preset?.name || 'New Automation',
        businessName,
        phoneInstanceId: phoneInstanceId || null,
        timezone,
        language,
      });
      onCreated();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} title={`New WhatsApp Automation${step > 1 ? ` — ${preset?.name || ''}` : ''}`}>
      {step === 1 && (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">Pick a purpose. We'll pre-fill the agent's prompt, data fields, and recommended tools based on your choice.</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {presets.map(p => (
              <button
                key={p.id}
                onClick={() => { setPresetId(p.id); setName(p.name); setStep(2); }}
                className={`text-left p-3 rounded-lg border transition ${presetId === p.id ? 'border-primary bg-primary/5' : 'hover:border-primary/40'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">{p.icon}</span>
                  <div className="font-medium text-sm">{p.name}</div>
                </div>
                <div className="text-xs text-muted-foreground">{p.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && preset && (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Tell us a bit about the business. You can fine-tune the system prompt, data fields, and tools after creating.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Automation / Agent name">
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={preset.name} />
            </Field>
            <Field label="Business / client name">
              <Input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="e.g. SmileCare Dental" />
            </Field>
            <Field label="Timezone">
              <Input value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="Asia/Kolkata" />
            </Field>
            <Field label="Language">
              <select value={language} onChange={e => setLanguage(e.target.value)} className="border rounded-md px-2 py-1 text-sm bg-background h-9">
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="hi-IN">Hindi (India)</option>
                <option value="es-ES">Spanish</option>
                <option value="pt-BR">Portuguese (BR)</option>
                <option value="fr-FR">French</option>
                <option value="de-DE">German</option>
                <option value="ar-SA">Arabic</option>
              </select>
            </Field>
            <Field label="WhatsApp number to deploy on" className="md:col-span-2">
              <select value={phoneInstanceId} onChange={e => setPhoneInstanceId(e.target.value)} className="border rounded-md px-2 py-1 text-sm bg-background h-9 w-full">
                <option value="">— Choose later —</option>
                {instances.map(i => (
                  <option key={i.instanceId} value={i.instanceId}>{i.phoneNumber || i.instanceId} ({i.status || 'disconnected'})</option>
                ))}
              </select>
              <div className="text-xs text-muted-foreground mt-1">Don't have one yet? Connect a number from the WhatsApp Connect page first.</div>
            </Field>
          </div>

          <div className="rounded-md border border-dashed p-3 text-xs space-y-1">
            <div className="font-medium text-sm">What we'll set up automatically:</div>
            <div className="text-muted-foreground">• System prompt tailored for {preset.name.toLowerCase()}</div>
            <div className="text-muted-foreground">• Data fields: {preset.defaultDataFields.join(', ')}</div>
            <div className="text-muted-foreground">• Recommended tools: {preset.recommendedTools.join(', ') || '(none)'}</div>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={create} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Create automation
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------
// "Edit Automation" dialog
// ------------------------------------------------------------------
function EditAutomationDialog({ agent, presets, instances, onClose, onSaved }) {
  const [config, setConfig] = useState(() => ({
    name: agent.name || '',
    systemPrompt: agent.systemPrompt || '',
    initialMessage: agent.initialMessage || '',
    conversationGuidelines: agent.conversationGuidelines || '',
    timezone: agent.timezone || 'Asia/Kolkata',
    language: agent.language || 'en-US',
    enableWhatsAppConfirmation: agent.enableWhatsAppConfirmation || false,
    enableEmailConfirmation: agent.enableEmailConfirmation || false,
    automationPurpose: agent.automationPurpose || 'custom',
    dataToCollect: (() => {
      try { return agent.tools?.dataToCollect || []; } catch (e) { return []; }
    })(),
  }));
  const [phoneInstanceId, setPhoneInstanceId] = useState('');
  const [dataFieldInput, setDataFieldInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const addDataField = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = dataFieldInput.trim();
      if (val && !config.dataToCollect.includes(val)) {
        setConfig(prev => ({ ...prev, dataToCollect: [...prev.dataToCollect, val] }));
      }
      setDataFieldInput('');
    }
  };
  const removeDataField = (f) => setConfig(prev => ({ ...prev, dataToCollect: prev.dataToCollect.filter(x => x !== f) }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const tools = { ...(agent.tools || {}), dataToCollect: config.dataToCollect };
      await axios.put(`${SERVER_URL}/api/agents/${agent.id}`, {
        ...config,
        tools,
      });
      if (phoneInstanceId) {
        await axios.put(`${SERVER_URL}/api/phone-numbers-bind`, { agentId: agent.id, instanceId: phoneInstanceId }).catch(() => {});
        await axios.put(`${SERVER_URL}/api/whatsapp/instances/${phoneInstanceId}`, { agentId: agent.id });
      }
      onSaved();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title={`Edit — ${agent.name}`} wide>
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Agent name">
            <Input value={config.name} onChange={e => setConfig({ ...config, name: e.target.value })} />
          </Field>
          <Field label="WhatsApp number">
            <select value={phoneInstanceId} onChange={e => setPhoneInstanceId(e.target.value)} className="border rounded-md px-2 py-1 text-sm bg-background h-9 w-full">
              <option value="">— Unassigned —</option>
              {instances.map(i => (
                <option key={i.instanceId} value={i.instanceId}>{i.phoneNumber || i.instanceId} ({i.status || 'disconnected'})</option>
              ))}
            </select>
          </Field>
          <Field label="Purpose">
            <select value={config.automationPurpose} onChange={e => setConfig({ ...config, automationPurpose: e.target.value })} className="border rounded-md px-2 py-1 text-sm bg-background h-9 w-full">
              {presets.map(p => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
            </select>
          </Field>
          <Field label="Timezone">
            <Input value={config.timezone} onChange={e => setConfig({ ...config, timezone: e.target.value })} />
          </Field>
          <Field label="Language">
            <select value={config.language} onChange={e => setConfig({ ...config, language: e.target.value })} className="border rounded-md px-2 py-1 text-sm bg-background h-9 w-full">
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="hi-IN">Hindi</option>
              <option value="es-ES">Spanish</option>
            </select>
          </Field>
        </div>

        <Field label="Initial message (first reply in every conversation)">
          <textarea
            value={config.initialMessage}
            onChange={e => setConfig({ ...config, initialMessage: e.target.value })}
            className="flex min-h-[80px] w-full rounded-md border border-input bg-[#1c1c1e] px-3 py-2 text-sm"
          />
        </Field>

        <Field label="System prompt (the agent's instructions)">
          <textarea
            value={config.systemPrompt}
            onChange={e => setConfig({ ...config, systemPrompt: e.target.value })}
            className="flex min-h-[260px] w-full rounded-md border border-input bg-[#1c1c1e] px-3 py-2 text-sm font-mono"
          />
          <div className="text-xs text-muted-foreground mt-1">Tip: Use <code>{'{AGENT_NAME}'}</code>, <code>{'{BUSINESS_NAME}'}</code>, <code>{'{TIMEZONE}'}</code> as placeholders.</div>
        </Field>

        <Field label="Conversation guidelines (step-by-step flow)">
          <textarea
            value={config.conversationGuidelines}
            onChange={e => setConfig({ ...config, conversationGuidelines: e.target.value })}
            className="flex min-h-[160px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm font-mono"
          />
        </Field>

        <div className="space-y-2">
          <div>
            <label className="text-sm font-medium">Data the agent will collect from every customer</label>
            <p className="text-xs text-muted-foreground">These fields become the schema for the contact record.</p>
          </div>
          <div className="flex flex-wrap gap-2 min-h-[32px]">
            {config.dataToCollect.map(f => (
              <span key={f} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/15 text-primary text-xs font-medium border border-primary/30">
                {f}
                <button onClick={() => removeDataField(f)} className="ml-0.5 hover:text-white" aria-label={`Remove ${f}`}><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
          <input
            value={dataFieldInput}
            onChange={e => setDataFieldInput(e.target.value)}
            onKeyDown={addDataField}
            placeholder='Type a field and press Enter (e.g. "Delivery Address")'
            className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm"
          />
        </div>

        <div className="flex items-center gap-4 pt-2 border-t border-border">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={config.enableWhatsAppConfirmation} onChange={e => setConfig({ ...config, enableWhatsAppConfirmation: e.target.checked })} />
            Send WhatsApp receipt
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={config.enableEmailConfirmation} onChange={e => setConfig({ ...config, enableEmailConfirmation: e.target.checked })} />
            Send email receipt
          </label>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t mt-4">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save changes
        </Button>
      </div>
    </Modal>
  );
}

function Field({ label, children, className = '' }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-auto" onClick={onClose}>
      <div
        className={`bg-background border rounded-xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} max-h-[90vh] flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-md"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
