import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_AGENTS, WS_URL } from '../lib/constants';
import { useVoiceSession } from '../hooks/useVoiceSession';

import AgentConfig from '../components/agent/AgentConfig';
import AgentBuilderChat from '../components/agent/AgentBuilderChat';
import TestInterface from '../components/agent/TestInterface';
import AnalyticsModal from '../components/modals/AnalyticsModal';
import PhoneNumberModal from '../components/modals/PhoneNumberModal';
import { Button } from '@/components/ui/button';
import { Plus, Phone, ChevronLeft, ChevronRight, Bot, Settings2, Save, BarChart3, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

/** Converts the UI builder tool list -> OpenAI-format schemas for saving/sending */
export function buildToolSchemas(customTools = []) {
  return customTools
    .filter(t => t.name.trim())
    .map(t => {
      const properties = {};
      const required = [];
      for (const p of t.parameters) {
        if (!p.name.trim()) continue;
        properties[p.name.trim()] = { type: p.type || 'string', description: p.description || '' };
        if (p.required) required.push(p.name.trim());
      }
      return {
        type: 'function',
        function: {
          name: t.name.trim(),
          description: t.description,
          parameters: { type: 'object', properties, required }
        }
      };
    });
}

const EMPTY_CONFIG = {
  name: '',
  systemPrompt: '',
  conversationGuidelines: '',
  dataToCollect: [],
  voiceId: '',
  language: 'en-US',
  timezone: 'Asia/Kolkata',
  initialMessage: "Hi, thanks for calling! How can I help you today?",
  enableWhatsAppConfirmation: false,
  enableEmailConfirmation: false
};

export default function AgentStudioPage() {
  const { agentId } = useParams();
  const navigate = useNavigate();

  const {
    isConnected, isAgentSpeaking, transcript, usage, cost,
    startSession, endSession, sendTextMessage
  } = useVoiceSession(WS_URL);

  const [agents, setAgents] = useState([]);
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [customTools, setCustomTools] = useState([]);

  const [showPhoneDialog, setShowPhoneDialog] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [activeRightPanel, setActiveRightPanel] = useState('builder'); // 'builder' | 'test' | null
  const [isSaving, setIsSaving] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await axios.get(API_AGENTS);
      setAgents(res.data);
    } catch (err) {
      console.error('Failed to fetch agents', err);
    }
  }, []);

  const fetchPhoneNumbers = useCallback(async () => {
    try {
      const { data } = await axios.get(`http://localhost:8083/api/phonenumbers`);
      setPhoneNumbers(data);
    } catch (err) {
      console.error('Failed to fetch phone numbers', err);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    fetchPhoneNumbers();
  }, [fetchAgents, fetchPhoneNumbers]);

  useEffect(() => {
    if (!agentId || agents.length === 0) return;
    const found = agents.find(a => a.id === agentId);
    if (found) applyAgentToForm(found);
  }, [agentId, agents]);

  function applyAgentToForm(agent) {
    let toolsArr = [];
    let parsedCustomTools = [];
    if (agent.tools) {
      if (typeof agent.tools === 'object' && !Array.isArray(agent.tools)) {
        if (Array.isArray(agent.tools.dataToCollect)) toolsArr = agent.tools.dataToCollect;
        if (Array.isArray(agent.tools.customTools)) {
          parsedCustomTools = agent.tools.customTools.map(t => {
            if (Array.isArray(t.parameters)) return t;
            const fn = t.function || t;
            const props = fn.parameters?.properties || {};
            const required = fn.parameters?.required || [];
            return {
              type: t.type || 'frontend',
              name: fn.name || '',
              description: fn.description || '',
              webhookUrl: t.webhookUrl || '',
              method: t.method || 'POST',
              headers: t.headers || {},
              parameters: Object.entries(props).map(([pname, pval]) => ({
                name: pname,
                type: pval.type || 'string',
                description: pval.description || '',
                required: required.includes(pname)
              }))
            };
          });
        }
      } else if (Array.isArray(agent.tools)) {
        toolsArr = agent.tools;
      }
    }
    setConfig({
      name: agent.name,
      systemPrompt: agent.systemPrompt,
      conversationGuidelines: agent.conversationGuidelines || '',
      initialMessage: agent.initialMessage,
      voiceId: agent.voiceId || '',
      language: agent.language || 'en-US',
      timezone: agent.timezone || 'Asia/Kolkata',
      dataToCollect: toolsArr,
      enableWhatsAppConfirmation: !!agent.enableWhatsAppConfirmation,
      enableEmailConfirmation: !!agent.enableEmailConfirmation,
      allowedEmails: Array.isArray(agent.allowedEmails) ? agent.allowedEmails : [],
      providers: agent.providers || null,
    });
    setCustomTools(parsedCustomTools);
  }

  const selectAgent = (agent) => navigate(`/agents/${agent.id}`);

  function createNewAgent() {
    navigate('/agents');
    setConfig(EMPTY_CONFIG);
    setCustomTools([]);
    setViewMode('chat');
  }

  const saveAgent = async () => {
    const rawTools = customTools.filter(t => t.name?.trim());
    const payload = {
      name: config.name,
      systemPrompt: config.systemPrompt,
      conversationGuidelines: config.conversationGuidelines,
      initialMessage: config.initialMessage,
      voiceId: config.voiceId,
      language: config.language,
      timezone: config.timezone,
      enableWhatsAppConfirmation: config.enableWhatsAppConfirmation,
      enableEmailConfirmation: config.enableEmailConfirmation,
      allowedEmails: Array.isArray(config.allowedEmails) ? config.allowedEmails : [],
      tools: { dataToCollect: config.dataToCollect, customTools: rawTools },
      providers: config.providers || null,
    };
    try {
      if (agentId) {
        await axios.put(`${API_AGENTS}/${agentId}`, payload);
        try { toast({ title: 'Saved', description: 'Agent updated.' }); } catch {}
      } else {
        const res = await axios.post(API_AGENTS, payload);
        navigate(`/agents/${res.data.id}`);
        try { toast({ title: 'Created', description: 'New agent created.' }); } catch {}
      }
      fetchAgents();
    } catch (err) {
      console.error('Failed to save agent', err);
      try { toast({ title: 'Save failed', description: 'Could not save the agent.', variant: 'destructive' }); } catch {}
    }
  };

  const wrappedSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try { await saveAgent(); } finally { setIsSaving(false); }
  };

  const deleteAgent = async () => {
    if (!agentId) return;
    if (!confirm('Delete this agent? This cannot be undone.')) return;
    try {
      await axios.delete(`${API_AGENTS}/${agentId}`);
      navigate('/agents');
      setConfig(EMPTY_CONFIG);
      setCustomTools([]);
      fetchAgents();
    } catch (err) {
      console.error('Failed to delete agent', err);
    }
  };

  const handleStartCall = () => {
    const rawTools = customTools.filter(t => t.name?.trim());
    startSession({
      agentId,
      systemPrompt: config.systemPrompt,
      conversationGuidelines: config.conversationGuidelines,
      dataToCollect: config.dataToCollect,
      voiceId: config.voiceId,
      language: config.language,
      timezone: config.timezone,
      firstMessage: config.initialMessage,
      customTools: rawTools,
      providers: config.providers || null,
    });
  };

  useEffect(() => {
    if (!isConnected && cost) setShowAnalytics(true);
  }, [isConnected, cost]);

  const currentAgent = agents.find(a => a.id === agentId);

  return (
    <div className="h-screen w-full flex overflow-hidden bg-background">
      {/* CENTER: Builder or Configuration */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Single solid studio header */}
        <div className="h-16 shrink-0 border-b border-border bg-card flex items-center px-5 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-foreground flex items-center justify-center text-background shrink-0">
              <Bot className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Link to="/crm/agents" className="hover:text-foreground">Agents</Link>
                <ChevronRight className="w-3 h-3" />
                <span>{currentAgent ? 'Studio' : 'New agent'}</span>
              </div>
              <h1 className="text-base font-semibold tracking-tight truncate">
                {currentAgent ? currentAgent.name : 'Create a new agent'}
              </h1>
            </div>
          </div>

          {/* Actions (right aligned) */}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <button
              onClick={() => setActiveRightPanel(prev => prev === 'builder' ? null : 'builder')}
              className={cn(
                'h-9 pl-1.5 pr-3 text-sm font-medium rounded-lg transition-all flex items-center gap-2 border',
                activeRightPanel === 'builder'
                  ? 'bg-zinc-800/80 border-zinc-700 text-white shadow-sm'
                  : 'bg-zinc-950 border-zinc-800/80 text-zinc-300 hover:bg-zinc-800/50'
              )}
            >
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              Composer
            </button>
            <button
              onClick={() => setActiveRightPanel(prev => prev === 'test' ? null : 'test')}
              className={cn(
                'h-9 px-3 text-sm font-medium rounded-lg transition-all flex items-center gap-2 border',
                activeRightPanel === 'test'
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400 shadow-sm'
                  : 'bg-zinc-950 border-zinc-800/80 text-emerald-500/70 hover:bg-emerald-500/5'
              )}
            >
              <Phone className="w-4 h-4" /> Talk
            </button>

            <div className="w-px h-5 bg-border mx-1" />

            <Button variant="outline" size="icon" className="h-9 w-9" title="Phone numbers" onClick={() => setShowPhoneDialog(true)}>
              <Phone className="w-4 h-4" />
            </Button>
            {agentId && (
              <Button variant="ghost" className="h-9 px-3" onClick={() => navigate(`/crm/agent/${agentId}`)}>
                <BarChart3 className="w-3.5 h-3.5 mr-1.5" /> CRM
              </Button>
            )}
            <Button className="h-9 px-3" onClick={wrappedSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <AgentConfig
            config={config}
            setConfig={setConfig}
            customTools={customTools}
            setCustomTools={setCustomTools}
            activeAgentId={agentId || null}
            phoneNumbers={phoneNumbers}
            agents={agents}
            onSave={wrappedSave}
            onDelete={deleteAgent}
            onPhoneAssign={fetchPhoneNumbers}
            hideHeader
          />
        </div>
      </div>

      {/* RIGHT PANELS */}
      <div 
        className={cn(
          "transition-[width] duration-300 ease-in-out shrink-0 overflow-hidden flex bg-zinc-950",
          activeRightPanel ? "w-[450px]" : "w-0 border-l-0"
        )}
      >
        <div className={cn("w-[450px] shrink-0 h-full", activeRightPanel === 'builder' ? 'block' : 'hidden')}>
          <AgentBuilderChat config={config} setConfig={setConfig} onSave={wrappedSave} />
        </div>
        <div className={cn("w-[450px] shrink-0 h-full", activeRightPanel === 'test' ? 'block' : 'hidden')}>
          <TestInterface
            agentName={config.name}
            isConnected={isConnected}
            isAgentSpeaking={isAgentSpeaking}
            transcript={transcript}
            onStartCall={handleStartCall}
            onEndCall={endSession}
            onSendText={sendTextMessage}
          />
        </div>
      </div>

      <AnalyticsModal
        open={showAnalytics}
        onClose={() => setShowAnalytics(false)}
        usage={usage}
        cost={cost}
      />

      <PhoneNumberModal
        open={showPhoneDialog}
        onClose={() => setShowPhoneDialog(false)}
        phoneNumbers={phoneNumbers}
        agents={agents}
        onRefresh={fetchPhoneNumbers}
      />
    </div>
  );
}
