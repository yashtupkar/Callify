import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Loader2, Save, Trash2, Bot as BotIcon, ChevronRight, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { API_AGENTS, SERVER_URL, WS_URL } from '@/lib/constants';
import { useAuth } from '@/hooks/useAuth';
import { useVoiceSession } from '@/hooks/useVoiceSession';
import AgentConfig from '@/components/agent/AgentConfig';
import CrmDashboard from '@/components/agent/CrmDashboard';
import TestInterface from '@/components/agent/TestInterface';
import AnalyticsModal from '@/components/modals/AnalyticsModal';

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

export default function CrmAgentConfigPage() {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [agents, setAgents] = useState([]);
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [customTools, setCustomTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('config');

  const {
    isConnected, isAgentSpeaking, transcript, usage, cost,
    startSession, endSession, sendTextMessage
  } = useVoiceSession(WS_URL);
  const [showAnalytics, setShowAnalytics] = useState(false);

  useEffect(() => {
    if (!isConnected && cost) setShowAnalytics(true);
  }, [isConnected, cost]);

  const fetchAgents = useCallback(async () => {
    try { const r = await axios.get(`${SERVER_URL}/api/crm/my-agents`); setAgents(r.data); } catch {}
  }, []);

  const fetchPhoneNumbers = useCallback(async () => {
    try { const r = await axios.get(`${SERVER_URL}/api/phonenumbers`); setPhoneNumbers(r.data); } catch {}
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchAgents(), fetchPhoneNumbers()]);
      if (agentId) {
        try {
          const r = await axios.get(`${API_AGENTS}/${agentId}`);
          applyAgentToForm(r.data);
        } catch (err) {
          console.error('[CrmAgentConfigPage] Failed to load agent:', err);
        }
      }
      setLoading(false);
    };
    init();
  }, [agentId, fetchAgents, fetchPhoneNumbers]);

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
    });
    setCustomTools(parsedCustomTools);
  }

  const saveAgent = async () => {
    setSaving(true);
    try {
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
        tools: { dataToCollect: config.dataToCollect, customTools: rawTools }
      };
      if (agentId) {
        await axios.put(`${API_AGENTS}/${agentId}`, payload);
      } else {
        const res = await axios.post(API_AGENTS, payload);
        navigate(`/crm/agent/${res.data.id}`);
      }
      await fetchAgents();
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const deleteAgent = async () => {
    if (!agentId) return;
    if (!confirm('Delete this agent? This cannot be undone.')) return;
    try {
      await axios.delete(`${API_AGENTS}/${agentId}`);
      navigate('/crm/agents');
      fetchAgents();
    } catch (err) { console.error(err); }
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
      customTools: rawTools
    });
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Link to="/crm/agents" className="hover:text-foreground">Agents</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-foreground">{config.name || 'New Agent'}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center text-background">
              <BotIcon className="w-5 h-5" />
            </div>
            {config.name || 'Configure Agent'}
          </h1>
        </div>
        <div className="flex gap-2">
          {agentId && isAdmin && (
            <Button variant="destructive" size="sm" onClick={deleteAgent} disabled={saving}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" onClick={saveAgent} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {saving ? 'Saving…' : 'Save Agent'}
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="test" disabled={!agentId}>
            <Phone className="w-3.5 h-3.5 mr-1.5" /> Test Call
          </TabsTrigger>
          <TabsTrigger value="crm">CRM Data</TabsTrigger>
        </TabsList>
        <TabsContent value="config" className="mt-6">
          <div className="border border-border rounded-xl overflow-hidden bg-card h-[calc(100vh-220px)] min-h-[600px] flex flex-col">
            <AgentConfig
              config={config}
              setConfig={setConfig}
              customTools={customTools}
              setCustomTools={setCustomTools}
              activeAgentId={agentId || null}
              phoneNumbers={phoneNumbers}
              agents={agents}
              onSave={saveAgent}
              onDelete={deleteAgent}
              onPhoneAssign={fetchPhoneNumbers}
              hideHeader={true}
              isAdmin={isAdmin}
            />
          </div>
        </TabsContent>
        <TabsContent value="test" className="mt-6">
          {agentId ? (
            <div className="border border-border rounded-xl overflow-hidden bg-card h-[calc(100vh-220px)] min-h-[600px] flex">
              <div className="flex-1 p-6 overflow-y-auto scrollbar-thin bg-background">
                <div className="max-w-2xl space-y-3">
                  <div>
                    <h2 className="text-lg font-semibold">Test your agent</h2>
                    <p className="text-sm text-muted-foreground">
                      Click "Test Call" on the right to start a live voice session. The agent will use the current configuration above. Make sure your microphone is enabled.
                    </p>
                  </div>
                  <Card>
                    <CardContent className="p-4 space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Agent</span>
                        <span className="font-medium">{config.name || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Language</span>
                        <span className="font-mono text-xs">{config.language}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Timezone</span>
                        <span className="font-mono text-xs">{config.timezone}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Custom tools</span>
                        <span className="font-mono text-xs">{customTools.filter(t => t.name?.trim()).length}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Initial message</span>
                        <span className="text-xs italic truncate max-w-[260px]">"{config.initialMessage}"</span>
                      </div>
                    </CardContent>
                  </Card>
                  {!config.systemPrompt && (
                    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
                      This agent has no system prompt yet. Add one in the Configuration tab for richer conversations.
                    </div>
                  )}
                </div>
              </div>
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
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">Save the agent first to start a test call.</CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="crm" className="mt-6">
          {agentId ? (
            <div className="border border-border rounded-xl overflow-hidden bg-card h-[calc(100vh-220px)] min-h-[600px] flex flex-col">
              <CrmDashboard agentId={agentId} />
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">Save the agent first to view CRM data.</CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <AnalyticsModal
        open={showAnalytics}
        onClose={() => setShowAnalytics(false)}
        usage={usage}
        cost={cost}
      />
    </div>
  );
}
