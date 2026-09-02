import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, Trash2, Plus, X, ChevronDown, ChevronUp, Webhook, Globe, Sparkles, Loader2, BarChart3, Settings2, Brain, Volume2, Mic, Pencil } from 'lucide-react';
import { API_AGENTS } from '../../lib/constants';

const LLM_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'], defaultModel: 'gpt-4o-mini' },
  { id: 'openrouter', name: 'OpenRouter', models: ['openai/gpt-4o', 'openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-pro', 'meta-llama/llama-4-maverick', 'openai/gpt-oss-120b'], defaultModel: 'openai/gpt-4o-mini' },
];

const TTS_PROVIDERS = [
  { id: 'elevenlabs', name: 'ElevenLabs', models: ['eleven_turbo_v2_5', 'eleven_multilingual_v2', 'eleven_monolingual_v1'], defaultModel: 'eleven_turbo_v2_5' },
  { id: 'fish', name: 'Fish Audio', models: ['s2.1-pro-free', 's2.1-pro', 's1-fast'], defaultModel: 's2.1-pro-free' },
  { id: 'sarvam', name: 'Sarvam', models: ['bulbul:v3'], defaultModel: 'bulbul:v3' },
];

const STT_PROVIDERS = [
  { id: 'deepgram', name: 'Deepgram', models: ['nova-2', 'nova-3', 'base'], defaultModel: 'nova-2' },
];

const TOOL_TYPE_LABELS = {
  frontend: { label: 'Frontend (JS)', icon: '⚡', desc: 'Your page handles the call' },
  webhook:  { label: 'Webhook (HTTP)', icon: '🌐', desc: 'Server calls your URL' },
};

const WEBHOOK_PRESETS = [
  {
    label: 'Cal.com — Check Availability',
    name: 'check_availability',
    description: 'Check available time slots on Cal.com before booking. Always call this before create_booking to confirm the slot is open. IMPORTANT: If the response shows `"slots": {}` (an empty object) or an empty array for the date, it means NO SLOTS ARE AVAILABLE. Only proceed if there is an actual time listed inside the slots object.',
    type: 'webhook',
    method: 'GET',
    webhookUrl: 'https://api.cal.com/v2/slots/available',
    headers: {
      Authorization: 'Bearer {{CAL_API_KEY}}',
      'cal-api-version': '2024-08-13'
    },
    parameters: [
      { name: 'startTime', type: 'string', description: 'ISO 8601 start of the window to check, e.g. the start of the requested day', required: true },
      { name: 'endTime', type: 'string', description: 'ISO 8601 end of the window to check, e.g. end of the requested day', required: true },
      { name: 'eventTypeId', type: 'number', description: 'Cal.com event type ID (number)', required: true }
    ]
  },
  {
    label: 'Cal.com — Create Booking',
    name: 'create_booking',
    description: "Book an appointment on Cal.com using the caller's actual details. Only call this AFTER check_availability confirms the slot is free and after confirming all details with the caller.",
    type: 'webhook',
    method: 'POST',
    webhookUrl: 'https://api.cal.com/v2/bookings',
    headers: {
      Authorization: 'Bearer {{CAL_API_KEY}}',
      'cal-api-version': '2024-08-13'
    },
    paramMapping: {
      startTime: 'start',
      attendeeName: 'attendee.name',
      attendeeEmail: 'attendee.email'
    },
    staticBody: {
      'attendee.timeZone': 'Asia/Kolkata',
      'attendee.language': 'en'
    },
    parameters: [
      { name: 'startTime', type: 'string', description: 'ISO 8601 datetime of the appointment — the exact slot confirmed available by check_availability', required: true },
      { name: 'eventTypeId', type: 'number', description: 'Cal.com event type ID (number)', required: true },
      { name: 'attendeeName', type: 'string', description: "The caller's full name — must be what they told you, never use a placeholder", required: true },
      { name: 'attendeeEmail', type: 'string', description: "The caller's email address — must be what they told you, never use a placeholder", required: true }
    ]
  },
  { label: 'Google Sheets — Append Row', name: 'save_to_sheet', description: 'Append caller data to a Google Sheet via Apps Script', method: 'POST', webhookUrl: 'https://script.google.com/macros/s/{{APPS_SCRIPT_ID}}/exec', headers: {}, parameters: [{ name: 'name', type: 'string', description: "Caller's name", required: true }, { name: 'phone', type: 'string', description: "Caller's phone", required: true }, { name: 'note', type: 'string', description: 'Additional notes', required: false }] },
  { label: 'Zapier Webhook', name: 'trigger_zapier', description: 'Trigger a Zapier automation', method: 'POST', webhookUrl: 'https://hooks.zapier.com/hooks/catch/{{ZAP_ID}}/', headers: {}, parameters: [{ name: 'event', type: 'string', description: 'Event type', required: true }, { name: 'data', type: 'string', description: 'JSON data string', required: false }] },
  { label: 'Make (Integromat) Webhook', name: 'trigger_make', description: 'Trigger a Make scenario', method: 'POST', webhookUrl: 'https://hook.eu1.make.com/{{MAKE_HOOK_ID}}', headers: {}, parameters: [{ name: 'caller_name', type: 'string', description: "Caller's name", required: true }, { name: 'request', type: 'string', description: "What the caller wants", required: true }] },
  { label: 'Custom Webhook', name: 'custom_action', description: 'Call a custom endpoint', method: 'POST', webhookUrl: '', headers: {}, parameters: [] },
];


export default function AgentConfig({
  config,
  setConfig,
  customTools,
  setCustomTools,
  activeAgentId,
  phoneNumbers,
  agents,
  onSave,
  onDelete,
  onPhoneAssign,
  hideHeader = false,
  onGoToCRM = null,
  isAdmin = true,
}) {
  const [dataFieldInput, setDataFieldInput] = useState('');
  const [expandedToolIdx, setExpandedToolIdx] = useState(null);
  const [showPresets, setShowPresets] = useState(false);
  const [isGeneratingGuidelines, setIsGeneratingGuidelines] = useState(false);
  const [availabilities, setAvailabilities] = useState([]);
  const [slotDuration, setSlotDuration] = useState(60);
  const [isSavingAvailability, setIsSavingAvailability] = useState(false);
  const [providers, setProviders] = useState({
    llm: { provider: 'openrouter', model: 'openai/gpt-4o-mini' },
    tts: { provider: 'elevenlabs', model: 'eleven_turbo_v2_5', voiceId: '' },
    stt: { provider: 'deepgram', model: 'nova-2' },
  });
  const [showProviderDialog, setShowProviderDialog] = useState(false);
  const [activeProviderTab, setActiveProviderTab] = useState('llm');

  // Load providers from agent config
  useEffect(() => {
    if (config.providers) {
      setProviders({
        llm: config.providers.llm || { provider: 'openrouter', model: 'openai/gpt-4o-mini' },
        tts: config.providers.tts || { provider: 'elevenlabs', model: 'eleven_turbo_v2_5', voiceId: '' },
        stt: config.providers.stt || { provider: 'deepgram', model: 'nova-2' },
      });
    }
  }, [config.providers]);

  const updateProvider = (type, field, value) => {
    setProviders(prev => ({
      ...prev,
      [type]: { ...prev[type], [field]: value }
    }));
  };

  const getProviderLabel = (type) => {
    const list = type === 'llm' ? LLM_PROVIDERS : type === 'tts' ? TTS_PROVIDERS : STT_PROVIDERS;
    const current = list.find(p => p.id === providers[type]?.provider);
    return current ? current.name : 'Select';
  };

  // Load availability
  useEffect(() => {
    if (activeAgentId) {
      axios.get(`${API_AGENTS}/${activeAgentId}/availability`).then(res => {
        const data = res.data;
        const defaultAvail = Array.from({ length: 7 }, (_, i) => ({
          dayOfWeek: i,
          startTime: '09:00',
          endTime: '17:00',
          isActive: [1, 2, 3, 4, 5].includes(i) // Mon-Fri active by default
        }));
        
        if (data.availabilities && data.availabilities.length > 0) {
          const merged = defaultAvail.map(da => {
            const found = data.availabilities.find(a => a.dayOfWeek === da.dayOfWeek);
            return found || da;
          });
          setAvailabilities(merged);
        } else {
          setAvailabilities(defaultAvail);
        }
        setSlotDuration(data.slotDuration || 60);
      }).catch(err => {
        console.error('Failed to load availability', err);
      });
    }
  }, [activeAgentId]);

  const saveAvailability = async () => {
    if (!activeAgentId) return;
    setIsSavingAvailability(true);
    try {
      await axios.put(`${API_AGENTS}/${activeAgentId}/availability`, {
        availabilities,
        slotDuration
      });
    } catch (err) {
      console.error('Failed to save availability', err);
    } finally {
      setIsSavingAvailability(false);
    }
  };

  // ── Guideline Generator ────────────────────────────────────────────────────
  const generateGuidelines = async () => {
    if (!activeAgentId) {
      alert("Please save the agent first before generating guidelines.");
      return;
    }
    
    // Auto-save before generating to ensure the backend has the latest context
    await onSave();
    
    setIsGeneratingGuidelines(true);
    try {
      const res = await axios.post(`${API_AGENTS}/${activeAgentId}/generate-guidelines`);
      if (res.data && res.data.conversationGuidelines) {
        setConfig(prev => ({ ...prev, conversationGuidelines: res.data.conversationGuidelines }));
      }
    } catch (err) {
      console.error('Failed to generate guidelines', err);
      alert('Failed to generate guidelines. See console for details.');
    } finally {
      setIsGeneratingGuidelines(false);
    }
  };

  // ── Data collection field helpers ──────────────────────────────────────────
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

  const removeDataField = (field) => {
    setConfig(prev => ({ ...prev, dataToCollect: prev.dataToCollect.filter(f => f !== field) }));
  };

  // ── Custom tool builder helpers ────────────────────────────────────────────
  const addTool = (preset = null) => {
    const newTool = preset ? { ...preset } : {
      type: 'frontend', name: '', description: '', parameters: []
    };
    const idx = customTools.length;
    setCustomTools(prev => [...prev, newTool]);
    setExpandedToolIdx(idx);
    setShowPresets(false);
  };

  const removeTool = (idx) => {
    setCustomTools(prev => prev.filter((_, i) => i !== idx));
    setExpandedToolIdx(null);
  };

  const updateTool = (idx, field, value) => {
    setCustomTools(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  };

  const addParam = (toolIdx) => {
    setCustomTools(prev => prev.map((t, i) =>
      i === toolIdx ? { ...t, parameters: [...t.parameters, { name: '', type: 'string', description: '', required: false }] } : t
    ));
  };

  const removeParam = (toolIdx, paramIdx) => {
    setCustomTools(prev => prev.map((t, i) =>
      i === toolIdx ? { ...t, parameters: t.parameters.filter((_, pi) => pi !== paramIdx) } : t
    ));
  };

  const updateParam = (toolIdx, paramIdx, field, value) => {
    setCustomTools(prev => prev.map((t, i) =>
      i === toolIdx
        ? { ...t, parameters: t.parameters.map((p, pi) => pi === paramIdx ? { ...p, [field]: value } : p) }
        : t
    ));
  };

  // Header helpers for webhook tools
  const updateHeader = (toolIdx, key, value, oldKey = null) => {
    setCustomTools(prev => prev.map((t, i) => {
      if (i !== toolIdx) return t;
      const headers = { ...(t.headers || {}) };
      if (oldKey && oldKey !== key) delete headers[oldKey];
      headers[key] = value;
      return { ...t, headers };
    }));
  };

  const removeHeader = (toolIdx, key) => {
    setCustomTools(prev => prev.map((t, i) => {
      if (i !== toolIdx) return t;
      const headers = { ...(t.headers || {}) };
      delete headers[key];
      return { ...t, headers };
    }));
  };

  const addHeader = (toolIdx) => {
    setCustomTools(prev => prev.map((t, i) => {
      if (i !== toolIdx) return t;
      return { ...t, headers: { ...(t.headers || {}), '': '' } };
    }));
  };

  // ── Phone assignment ────────────────────────────────────────────────────────
  const handlePhoneAssign = async (phoneId, checked) => {
    try {
      await axios.put(`http://localhost:8083/api/phonenumbers/${phoneId}`, {
        agentId: checked ? activeAgentId : null
      });
      onPhoneAssign();
    } catch (err) {
      console.error('Failed to update phone assignment', err);
    }
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSave();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this agent? This cannot be undone.')) return;
    await onDelete();
  };

  return (
    <div className="flex flex-col bg-background min-w-0 h-full overflow-hidden border-r border-border">
      {!hideHeader && (
        <div className="p-4 border-b border-border flex justify-between items-center bg-card shrink-0">
          <h1 className="text-xl font-bold">Configure Agent</h1>
          <div className="flex gap-2">
            {activeAgentId && onGoToCRM && (
              <Button onClick={onGoToCRM} variant="outline" size="sm" className="gap-2">
                <BarChart3 className="w-4 h-4" /> CRM Dashboard
              </Button>
            )}
            {activeAgentId && (
              <Button onClick={handleDelete} variant="destructive" size="sm" className="gap-2" disabled={isSaving}>
                <Trash2 className="w-4 h-4" /> Delete
              </Button>
            )}
            <Button onClick={handleSave} size="sm" className="gap-2" disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-6 scrollbar-thin">
        <div className="max-w-full space-y-6">

          {/* Provider Selection Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* STT Card */}
            <div 
              onClick={() => { setActiveProviderTab('stt'); setShowProviderDialog(true); }}
              className="bg-[#1c1c1e] rounded-xl p-4 border border-white/5 cursor-pointer hover:bg-white/5 transition-colors group flex flex-col"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  <span className="text-[10px] font-bold text-zinc-500 tracking-wider">TRANSCRIBER</span>
                </div>
                <Pencil className="w-3.5 h-3.5 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="mb-4">
                <div className="text-white font-semibold text-lg truncate">{providers.stt?.model || 'None'}</div>
                <div className="text-zinc-400 text-sm flex items-center gap-1.5 mt-0.5">
                  <span className="capitalize">{providers.stt?.provider || 'Unknown'}</span>
                  {providers.stt?.provider && <span>· English</span>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-auto pt-4 border-t border-white/5">
                <div>
                  <div className="text-[10px] font-medium text-zinc-500 mb-1 border-b border-zinc-700/50 pb-1 border-dashed">Latency</div>
                  <div className="text-zinc-300 text-xs font-medium">330ms</div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-zinc-500 mb-1 border-b border-zinc-700/50 pb-1 border-dashed">Cost</div>
                  <div className="text-zinc-300 text-xs font-medium">$0.01/min</div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-zinc-500 mb-1 border-b border-zinc-700/50 pb-1 border-dashed">Accuracy</div>
                  <div className="text-zinc-300 text-xs font-medium">2.7% WER</div>
                </div>
              </div>
            </div>

            {/* LLM Card */}
            <div 
              onClick={() => { setActiveProviderTab('llm'); setShowProviderDialog(true); }}
              className="bg-[#1c1c1e] rounded-xl p-4 border border-white/5 cursor-pointer hover:bg-white/5 transition-colors group flex flex-col"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span className="text-[10px] font-bold text-zinc-500 tracking-wider">MODEL</span>
                </div>
                <Pencil className="w-3.5 h-3.5 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="mb-4">
                <div className="text-white font-semibold text-lg truncate">{providers.llm?.model?.split('/').pop() || 'None'}</div>
                <div className="text-zinc-400 text-sm flex items-center gap-1.5 mt-0.5 truncate">
                  <span className="capitalize">{providers.llm?.provider || 'Unknown'}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-auto pt-4 border-t border-white/5">
                <div>
                  <div className="text-[10px] font-medium text-zinc-500 mb-1 border-b border-zinc-700/50 pb-1 border-dashed">Latency</div>
                  <div className="text-zinc-300 text-xs font-medium">690ms</div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-zinc-500 mb-1 border-b border-zinc-700/50 pb-1 border-dashed">Cost</div>
                  <div className="text-zinc-300 text-xs font-medium">$0.02/min</div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-zinc-500 mb-1 border-b border-zinc-700/50 pb-1 border-dashed">Intelligence</div>
                  <div className="text-zinc-300 text-xs font-medium">20</div>
                </div>
              </div>
            </div>

            {/* TTS Card */}
            <div 
              onClick={() => { setActiveProviderTab('tts'); setShowProviderDialog(true); }}
              className="bg-[#1c1c1e] rounded-xl p-4 border border-white/5 cursor-pointer hover:bg-white/5 transition-colors group flex flex-col"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                  <span className="text-[10px] font-bold text-zinc-500 tracking-wider">VOICE</span>
                </div>
                <Pencil className="w-3.5 h-3.5 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="mb-4">
                <div className="text-white font-semibold text-lg truncate">{providers.tts?.model || 'None'}</div>
                <div className="text-zinc-400 text-sm flex items-center gap-1.5 mt-0.5 truncate">
                  <span className="capitalize">{providers.tts?.provider || 'Unknown'}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-auto pt-4 border-t border-white/5">
                <div>
                  <div className="text-[10px] font-medium text-zinc-500 mb-1 border-b border-zinc-700/50 pb-1 border-dashed">Latency</div>
                  <div className="text-zinc-300 text-xs font-medium">480ms</div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-zinc-500 mb-1 border-b border-zinc-700/50 pb-1 border-dashed">Cost</div>
                  <div className="text-zinc-300 text-xs font-medium">$0.02/min</div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-zinc-500 mb-1 border-b border-zinc-700/50 pb-1 border-dashed">Humanness</div>
                  <div className="text-zinc-500 text-xs font-medium">—</div>
                </div>
              </div>
            </div>
            
          </div>

          {/* Agent Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Agent Name</label>
            <Input
              value={config.name}
              onChange={e => setConfig({ ...config, name: e.target.value })}
              className="bg-[#1c1c1e]"
              placeholder="e.g. SmileCare Receptionist"
            />
          </div>

          {/* Initial Message */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Initial Message</label>
            <Input
              value={config.initialMessage}
              onChange={e => setConfig({ ...config, initialMessage: e.target.value })}
              className="bg-[#1c1c1e]"
              placeholder="What the agent says when the call connects"
            />
          </div>

          {/* System Prompt */}
          <div className="space-y-2">
            <label className="text-sm font-medium">System Prompt (Role & Identity)</label>
            <textarea
              value={config.systemPrompt}
              onChange={e => setConfig({ ...config, systemPrompt: e.target.value })}
              className="flex min-h-[150px] w-full rounded-md border border-input bg-[#1c1c1e] px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Describe what this agent does, its role, business context..."
            />
          </div>

          {/* Conversation Guidelines */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">Conversation Guidelines (Sequential Flow)</label>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 gap-1.5 text-xs bg-card text-primary border-primary/20 hover:bg-primary/10" 
                onClick={generateGuidelines}
                disabled={isGeneratingGuidelines || !activeAgentId}
              >
                <Sparkles className="w-3.5 h-3.5" /> 
                {isGeneratingGuidelines ? 'Generating...' : 'Auto-Generate'}
              </Button>
            </div>
            <textarea
              value={config.conversationGuidelines || ''}
              onChange={e => setConfig({ ...config, conversationGuidelines: e.target.value })}
              className="flex min-h-[200px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono text-xs"
              placeholder="Step-by-step instructions on how the call should flow (or use the AI generator)..."
            />
          </div>

          {/* Data to Collect */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Data to Collect</label>
              <p className="text-xs text-zinc-500 mt-0.5">
                The agent will collect these fields from the caller before helping with their request.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 min-h-[32px]">
              {config.dataToCollect.map(field => (
                <span
                  key={field}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/15 text-primary text-xs font-medium border border-primary/30"
                >
                  {field}
                  <button
                    onClick={() => removeDataField(field)}
                    className="ml-0.5 hover:text-white transition-colors"
                    aria-label={`Remove ${field}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={dataFieldInput}
              onChange={e => setDataFieldInput(e.target.value)}
              onKeyDown={addDataField}
              placeholder='Type a field and press Enter (e.g. "Company", "Budget")'
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Automated Confirmations */}
          <div className="space-y-3 pt-2 border-t border-border">
            <div>
              <label className="text-sm font-medium">Automated Confirmations</label>
              <p className="text-xs text-zinc-500 mt-0.5">
                Automatically send a receipt or summary after successfully helping a caller.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.enableWhatsAppConfirmation || false}
                  onChange={e => setConfig({ ...config, enableWhatsAppConfirmation: e.target.checked })}
                  className="rounded border-zinc-700 bg-zinc-900 text-primary focus:ring-primary focus:ring-offset-background"
                />
                Send WhatsApp Confirmation
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.enableEmailConfirmation || false}
                  onChange={e => setConfig({ ...config, enableEmailConfirmation: e.target.checked })}
                  className="rounded border-zinc-700 bg-zinc-900 text-primary focus:ring-primary focus:ring-offset-background"
                />
                Send Email Confirmation
              </label>
            </div>
          </div>

          {/* Availability Management */}
          {activeAgentId && (
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex justify-between items-center">
                <div>
                  <label className="text-sm font-medium">Availability Management</label>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Configure working hours for the internal CRM booking system.
                  </p>
                </div>
                <Button 
                  onClick={saveAvailability} 
                  disabled={isSavingAvailability} 
                  size="sm" 
                  variant="outline"
                  className="h-8 text-xs border-zinc-700 hover:bg-zinc-800"
                >
                  {isSavingAvailability ? 'Saving...' : 'Save Schedule'}
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-sm font-medium">Slot Duration (mins)</label>
                <select
                  value={slotDuration}
                  onChange={e => setSlotDuration(parseInt(e.target.value, 10))}
                  className="h-8 w-24 rounded-md border border-input bg-card px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={45}>45</option>
                  <option value={60}>60</option>
                </select>
              </div>

              <div className="space-y-2">
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((dayName, idx) => {
                  const av = availabilities.find(a => a.dayOfWeek === idx) || { dayOfWeek: idx, startTime: '09:00', endTime: '17:00', isActive: false };
                  return (
                    <div key={idx} className="flex items-center gap-4 bg-zinc-900/50 p-2 rounded-md border border-zinc-800">
                      <label className="flex items-center gap-2 text-sm w-32 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={av.isActive}
                          onChange={e => {
                            setAvailabilities(prev => prev.map(a => a.dayOfWeek === idx ? { ...a, isActive: e.target.checked } : a));
                          }}
                          className="rounded border-zinc-700 bg-zinc-900 text-primary focus:ring-primary focus:ring-offset-background"
                        />
                        {dayName}
                      </label>
                      <div className={`flex items-center gap-2 ${!av.isActive ? 'opacity-50 pointer-events-none' : ''}`}>
                        <input
                          type="time"
                          value={av.startTime}
                          onChange={e => {
                            setAvailabilities(prev => prev.map(a => a.dayOfWeek === idx ? { ...a, startTime: e.target.value } : a));
                          }}
                          className="h-8 rounded-md border border-input bg-card px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        <span className="text-zinc-500 text-sm">to</span>
                        <input
                          type="time"
                          value={av.endTime}
                          onChange={e => {
                            setAvailabilities(prev => prev.map(a => a.dayOfWeek === idx ? { ...a, endTime: e.target.value } : a));
                          }}
                          className="h-8 rounded-md border border-input bg-card px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom Tools */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">Agent Tools</label>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Connect to Cal.com, Google Sheets, Zapier, or custom webhooks.
                </p>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowPresets(v => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors border border-zinc-700"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Tool
                </button>
                {showPresets && (
                  <div className="absolute right-0 top-9 z-50 w-72 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden">
                    <div className="px-3 py-2 text-xs text-zinc-400 border-b border-zinc-700 font-medium">Choose integration</div>
                    {WEBHOOK_PRESETS.map(preset => (
                      <button
                        key={preset.label}
                        onClick={() => addTool({ ...preset, type: 'webhook' })}
                        className="w-full text-left px-3 py-2.5 hover:bg-zinc-800 transition-colors border-b border-zinc-800/50 last:border-0"
                      >
                        <div className="text-sm text-zinc-200 font-medium">{preset.label}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">{preset.description}</div>
                      </button>
                    ))}
                    <button
                      onClick={() => addTool({ type: 'frontend', name: '', description: '', parameters: [] })}
                      className="w-full text-left px-3 py-2.5 hover:bg-zinc-800 transition-colors"
                    >
                      <div className="text-sm text-zinc-200 font-medium">⚡ Frontend Tool (JS)</div>
                      <div className="text-xs text-zinc-500 mt-0.5">Your page's JS handles execution</div>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {customTools.length === 0 && (
              <div className="text-center py-8 rounded-lg border border-dashed border-zinc-700 text-zinc-500 text-sm space-y-1">
                <Globe className="w-6 h-6 mx-auto mb-2 opacity-40" />
                <p>No tools yet.</p>
                <p className="text-xs">Connect to Cal.com, Google Sheets, Zapier, or build custom webhooks.</p>
              </div>
            )}

            <div className="space-y-2">
              {customTools.map((tool, idx) => (
                <div key={idx} className="rounded-lg border border-zinc-700 bg-zinc-900/50 overflow-hidden">
                  {/* Tool Header */}
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <button
                      onClick={() => setExpandedToolIdx(expandedToolIdx === idx ? null : idx)}
                      className="flex-1 flex items-center gap-2 text-left"
                    >
                      {expandedToolIdx === idx
                        ? <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
                        : <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                      }
                      <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono shrink-0">
                        {tool.type === 'webhook' ? '🌐' : '⚡'}
                      </span>
                      <span className="text-sm font-mono font-medium text-zinc-200 truncate">
                        {tool.name || <span className="text-zinc-500 font-sans font-normal">Unnamed tool</span>}
                      </span>
                      {tool.parameters?.length > 0 && (
                        <span className="ml-auto text-xs text-zinc-500 shrink-0">
                          {tool.parameters.length} param{tool.parameters.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => removeTool(idx)}
                      className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Tool Body */}
                  {expandedToolIdx === idx && (
                    <div className="px-3 pb-4 space-y-4 border-t border-zinc-700/60 pt-3">

                      {/* Tool Type Toggle */}
                      <div className="space-y-1.5">
                        <label className="text-xs text-zinc-400 font-medium">Execution Type</label>
                        <div className="flex gap-2">
                          {Object.entries(TOOL_TYPE_LABELS).map(([type, { label, icon }]) => (
                            <button
                              key={type}
                              onClick={() => updateTool(idx, 'type', type)}
                              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                                tool.type === type
                                  ? 'bg-primary/20 border-primary text-primary'
                                  : 'bg-zinc-950 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                              }`}
                            >
                              {icon} {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Name + Description */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs text-zinc-400">Function Name</label>
                          <input
                            value={tool.name}
                            onChange={e => updateTool(idx, 'name', e.target.value.replace(/\s+/g, '_'))}
                            placeholder="e.g. book_appointment"
                            className="flex h-8 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs font-mono placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-zinc-400">Description</label>
                          <input
                            value={tool.description}
                            onChange={e => updateTool(idx, 'description', e.target.value)}
                            placeholder="What does this tool do?"
                            className="flex h-8 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                      </div>

                      {/* Webhook-specific fields */}
                      {tool.type === 'webhook' && (
                        <div className="space-y-3 rounded-md border border-zinc-700/60 bg-zinc-950/60 p-3">
                          <div className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
                            <Webhook className="w-3.5 h-3.5" /> Webhook Configuration
                          </div>

                          {/* URL + Method */}
                          <div className="flex gap-2">
                            <select
                              value={tool.method || 'POST'}
                              onChange={e => updateTool(idx, 'method', e.target.value)}
                              className="h-8 w-20 rounded-md border border-zinc-700 bg-zinc-900 px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
                            >
                              <option value="POST">POST</option>
                              <option value="GET">GET</option>
                              <option value="PUT">PUT</option>
                              <option value="PATCH">PATCH</option>
                            </select>
                            <input
                              value={tool.webhookUrl || ''}
                              onChange={e => updateTool(idx, 'webhookUrl', e.target.value)}
                              placeholder="https://api.example.com/endpoint"
                              className="flex-1 h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-mono placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </div>

                          {/* Headers */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-zinc-500">Headers</span>
                              <button
                                onClick={() => addHeader(idx)}
                                className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                              >
                                <Plus className="w-3 h-3" /> Add header
                              </button>
                            </div>
                            <p className="text-xs text-zinc-600 italic">Use {'{{ENV_VAR}}'} for secrets, e.g. {`Authorization: Bearer {{CAL_API_KEY}}`}</p>
                            {Object.entries(tool.headers || {}).map(([key, val], hi) => (
                              <div key={hi} className="flex gap-1.5 items-center">
                                <input
                                  value={key}
                                  onChange={e => updateHeader(idx, e.target.value, val, key)}
                                  placeholder="Header-Name"
                                  className="flex-1 h-7 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs font-mono placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-ring"
                                />
                                <input
                                  value={val}
                                  onChange={e => updateHeader(idx, key, e.target.value)}
                                  placeholder="Value or {{ENV_VAR}}"
                                  className="flex-1 h-7 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs font-mono placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-ring"
                                />
                                <button onClick={() => removeHeader(idx, key)} className="text-zinc-600 hover:text-red-400 transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Parameters */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-400 font-medium">Parameters</span>
                          <button
                            onClick={() => addParam(idx)}
                            className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                          >
                            <Plus className="w-3 h-3" /> Add param
                          </button>
                        </div>
                        {tool.parameters?.length === 0 && (
                          <p className="text-xs text-zinc-600 italic">No parameters — tool takes no arguments.</p>
                        )}
                        {tool.parameters?.map((param, pi) => (
                          <div key={pi} className="grid grid-cols-[1fr_90px_1fr_auto_auto] gap-1.5 items-center">
                            <input
                              value={param.name}
                              onChange={e => updateParam(idx, pi, 'name', e.target.value.replace(/\s+/g, '_'))}
                              placeholder="param_name"
                              className="h-7 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-xs font-mono placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            <select
                              value={param.type}
                              onChange={e => updateParam(idx, pi, 'type', e.target.value)}
                              className="h-7 rounded-md border border-zinc-700 bg-zinc-950 px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                              <option value="string">string</option>
                              <option value="number">number</option>
                              <option value="boolean">boolean</option>
                            </select>
                            <input
                              value={param.description}
                              onChange={e => updateParam(idx, pi, 'description', e.target.value)}
                              placeholder="Description"
                              className="h-7 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-xs placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={param.required}
                                onChange={e => updateParam(idx, pi, 'required', e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-zinc-600"
                              />
                              req
                            </label>
                            <button
                              onClick={() => removeParam(idx, pi)}
                              className="p-0.5 rounded hover:text-red-400 text-zinc-600 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Voice ID */}
          <div className="space-y-2">
            <label className="text-sm font-medium">TTS Voice ID <span className="text-zinc-500 font-normal">(Optional)</span></label>
            <Input
              value={config.voiceId}
              onChange={e => setConfig({ ...config, voiceId: e.target.value })}
              className="bg-card"
              placeholder="Leave blank for default"
            />
          </div>

          {/* Language */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Language</label>
            <select
              value={config.language}
              onChange={e => setConfig({ ...config, language: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="en-US">English (US)</option>
              <option value="hi-IN">Hindi (India)</option>
            </select>
          </div>

          {/* Timezone */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Timezone</label>
            <select
              value={config.timezone || 'Asia/Kolkata'}
              onChange={e => setConfig({ ...config, timezone: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="UTC">UTC (Default)</option>
              <option value="America/New_York">Eastern Time (US)</option>
              <option value="America/Chicago">Central Time (US)</option>
              <option value="America/Denver">Mountain Time (US)</option>
              <option value="America/Los_Angeles">Pacific Time (US)</option>
              <option value="Europe/London">London (UK)</option>
              <option value="Europe/Berlin">Berlin (CET)</option>
              <option value="Asia/Kolkata">India (IST)</option>
              <option value="Asia/Tokyo">Tokyo (JST)</option>
              <option value="Australia/Sydney">Sydney (AEST)</option>
            </select>
          </div>

          {/* Phone Number Assignment */}
          {activeAgentId && (
            <div className="space-y-3 pt-4 border-t border-border">
              <label className="text-sm font-medium">Assigned Phone Numbers</label>
              <div className="space-y-2">
                {phoneNumbers.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    No phone numbers added. Click the phone icon in the sidebar to add one.
                  </p>
                ) : (
                  phoneNumbers.map(phone => (
                    <label key={phone.id} className="flex items-center gap-2 text-sm cursor-pointer hover:text-zinc-300">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-primary focus:ring-primary focus:ring-offset-background"
                        checked={phone.agentId === activeAgentId}
                        onChange={e => handlePhoneAssign(phone.id, e.target.checked)}
                      />
                      {phone.phoneNumber}
                      {phone.agentId && phone.agentId !== activeAgentId && (
                        <span className="text-xs text-zinc-500 ml-2">(assigned to another agent)</span>
                      )}
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Allowed CRM Users (admin only) */}
          {activeAgentId && isAdmin && (
            <AllowedUsersSection
              agentId={activeAgentId}
              initialEmails={Array.isArray(config.allowedEmails) ? config.allowedEmails : []}
              onUpdate={(emails) => setConfig(prev => ({ ...prev, allowedEmails: emails }))}
            />
          )}

          {/* Provider Configuration Dialog */}
          {showProviderDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowProviderDialog(false)}>
              <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h3 className="text-lg font-semibold">Provider Configuration</h3>
                  <button onClick={() => setShowProviderDialog(false)} className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="p-4">
                  {/* Tabs */}
                  <div className="flex gap-1 mb-4 p-1 bg-zinc-900 rounded-lg">
                    {[
                      { id: 'llm', label: 'LLM', icon: Brain, color: 'text-emerald-400' },
                      { id: 'tts', label: 'TTS', icon: Volume2, color: 'text-blue-400' },
                      { id: 'stt', label: 'STT', icon: Mic, color: 'text-purple-400' },
                    ].map(tab => {
                      const Icon = tab.icon;
                      const isActive = activeProviderTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveProviderTab(tab.id)}
                          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                            isActive
                              ? 'bg-zinc-800 text-white shadow-sm'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* LLM Config */}
                  {activeProviderTab === 'llm' && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">LLM Provider</label>
                        <select
                          value={providers.llm?.provider || 'openrouter'}
                          onChange={e => {
                            const newProvider = e.target.value;
                            const providerData = LLM_PROVIDERS.find(p => p.id === newProvider);
                            updateProvider('llm', 'provider', newProvider);
                            if (providerData) {
                              updateProvider('llm', 'model', providerData.defaultModel);
                            }
                          }}
                          className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          {LLM_PROVIDERS.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Model</label>
                        <select
                          value={providers.llm?.model || 'openai/gpt-4o-mini'}
                          onChange={e => updateProvider('llm', 'model', e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          {(LLM_PROVIDERS.find(p => p.id === providers.llm?.provider)?.models || []).map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* TTS Config */}
                  {activeProviderTab === 'tts' && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">TTS Provider</label>
                        <select
                          value={providers.tts?.provider || 'elevenlabs'}
                          onChange={e => {
                            const newProvider = e.target.value;
                            const providerData = TTS_PROVIDERS.find(p => p.id === newProvider);
                            updateProvider('tts', 'provider', newProvider);
                            if (providerData) {
                              updateProvider('tts', 'model', providerData.defaultModel);
                            }
                          }}
                          className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          {TTS_PROVIDERS.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Model / Voice</label>
                        <select
                          value={providers.tts?.model || 'eleven_turbo_v2_5'}
                          onChange={e => updateProvider('tts', 'model', e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          {(TTS_PROVIDERS.find(p => p.id === providers.tts?.provider)?.models || []).map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Voice ID <span className="text-zinc-500 font-normal">(Optional)</span></label>
                        <Input
                          value={providers.tts?.voiceId || ''}
                          onChange={e => updateProvider('tts', 'voiceId', e.target.value)}
                          className="bg-card"
                          placeholder="Leave blank for default"
                        />
                      </div>
                    </div>
                  )}

                  {/* STT Config */}
                  {activeProviderTab === 'stt' && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">STT Provider</label>
                        <select
                          value={providers.stt?.provider || 'deepgram'}
                          onChange={e => {
                            const newProvider = e.target.value;
                            const providerData = STT_PROVIDERS.find(p => p.id === newProvider);
                            updateProvider('stt', 'provider', newProvider);
                            if (providerData) {
                              updateProvider('stt', 'model', providerData.defaultModel);
                            }
                          }}
                          className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          {STT_PROVIDERS.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Model</label>
                        <select
                          value={providers.stt?.model || 'nova-2'}
                          onChange={e => updateProvider('stt', 'model', e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          {(STT_PROVIDERS.find(p => p.id === providers.stt?.provider)?.models || []).map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 p-4 border-t border-border">
                  <Button variant="outline" size="sm" onClick={() => setShowProviderDialog(false)}>Cancel</Button>
                  <Button size="sm" onClick={() => {
                    setConfig(prev => ({ ...prev, providers }));
                    setShowProviderDialog(false);
                  }}>Save Providers</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AllowedUsersSection({ agentId, initialEmails, onUpdate }) {
  const [emails, setEmails] = useState(initialEmails);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [credentials, setCredentials] = useState(null); // array of { email, tempPassword }
  const [resetting, setResetting] = useState(null);

  useEffect(() => { setEmails(initialEmails); }, [initialEmails.join('|')]);

  const addEmail = () => {
    const v = input.trim().toLowerCase();
    if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return;
    if (emails.includes(v)) { setInput(''); return; }
    const next = [...emails, v];
    setEmails(next);
    setInput('');
  };

  const removeEmail = (email) => {
    const next = emails.filter(e => e !== email);
    setEmails(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await axios.put(`${API_AGENTS}/${agentId}/allowed-emails`, { emails });
      onUpdate(res.data.allowedEmails);
      if (Array.isArray(res.data.createdCredentials) && res.data.createdCredentials.length > 0) {
        setCredentials(res.data.createdCredentials);
      }
    } catch (err) {
      console.error('Failed to save allowed emails', err);
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async (email) => {
    setResetting(email);
    try {
      const res = await axios.post(`${API_AGENTS}/${agentId}/allowed-emails/${encodeURIComponent(email)}/reset-password`);
      setCredentials([{ email: res.data.email, tempPassword: res.data.tempPassword }]);
    } catch (err) {
      console.error('Failed to reset password', err);
      alert(err.response?.data?.error || 'Failed to reset password');
    } finally {
      setResetting(null);
    }
  };

  return (
    <div className="space-y-3 pt-4 border-t border-border">
      <div>
        <label className="text-sm font-medium">Allowed CRM Users</label>
        <p className="text-xs text-zinc-500 mt-0.5">
          Invite users to view this agent's CRM data. New users get a temporary password — share it with them so they can sign in and change it.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 min-h-[32px]">
        {emails.length === 0 ? (
          <span className="text-xs text-zinc-500 italic">No invited users yet</span>
        ) : (
          emails.map(email => (
            <span
              key={email}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-foreground/10 text-foreground text-xs font-medium border border-border"
            >
              {email}
              <button
                onClick={() => resetPassword(email)}
                disabled={resetting === email}
                className="ml-1 px-1.5 py-0.5 rounded hover:bg-foreground/10 text-[10px] font-semibold uppercase tracking-wide disabled:opacity-50"
                title="Reset password for this user"
              >
                {resetting === email ? '…' : 'Reset'}
              </button>
              <button
                onClick={() => removeEmail(email)}
                className="p-0.5 hover:text-destructive transition-colors"
                aria-label={`Remove ${email}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <Input
          type="email"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
          placeholder="user@example.com"
          className="bg-card"
        />
        <Button onClick={addEmail} variant="outline" size="sm">Add</Button>
        <Button onClick={save} size="sm" disabled={saving} className="gap-1">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? 'Saving…' : 'Save Users'}
        </Button>
      </div>

      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />
    </div>
  );
}

function CredentialsDialog({ credentials, onClose }) {
  if (!credentials || credentials.length === 0) return null;
  const text = credentials.map(c => `${c.email}  /  ${c.tempPassword}`).join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Share these credentials</h3>
        <p className="text-xs text-muted-foreground mt-1">
          New user accounts were created. Send these credentials to the user — they'll be prompted to change the password after signing in.
        </p>
        <div className="mt-4 space-y-2">
          {credentials.map(c => (
            <div key={c.email} className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{c.email}</p>
                <p className="text-xs text-muted-foreground font-mono">Password: {c.tempPassword}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(`${c.email}  /  ${c.tempPassword}`)}>
                Copy
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={copy}>Copy all</Button>
          <Button size="sm" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}
