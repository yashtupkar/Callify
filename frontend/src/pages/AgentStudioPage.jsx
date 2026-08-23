import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_AGENTS, WS_URL } from '../lib/constants';
import { useVoiceSession } from '../hooks/useVoiceSession';

import AgentSidebar from '../components/agent/AgentSidebar';
import AgentConfig from '../components/agent/AgentConfig';
import CrmDashboard from '../components/agent/CrmDashboard';
import TestInterface from '../components/agent/TestInterface';
import AnalyticsModal from '../components/modals/AnalyticsModal';
import PhoneNumberModal from '../components/modals/PhoneNumberModal';

/** Converts the UI builder tool list → OpenAI-format schemas for saving/sending */
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
  dataToCollect: [],
  voiceId: '',
  language: 'en-US',
  timezone: 'Asia/Kolkata',
  initialMessage: "Hi, thanks for calling! How can I help you today?"
};

export default function AgentStudioPage() {
  const { agentId } = useParams();
  const navigate = useNavigate();

  // ── Voice session ──────────────────────────────────────────────────────────
  const {
    isConnected, isAgentSpeaking, transcript, usage, cost,
    startSession, endSession, sendTextMessage
  } = useVoiceSession(WS_URL);

  // ── Data state ─────────────────────────────────────────────────────────────
  const [agents, setAgents] = useState([]);
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [customTools, setCustomTools] = useState([]);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [showPhoneDialog, setShowPhoneDialog] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [viewMode, setViewMode] = useState('config'); // 'config' | 'crm'

  // ── Fetch agents ───────────────────────────────────────────────────────────
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

  // ── Sync URL param → selected agent ───────────────────────────────────────
  useEffect(() => {
    if (!agentId || agents.length === 0) return;
    const found = agents.find(a => a.id === agentId);
    if (found) applyAgentToForm(found);
  }, [agentId, agents]);

  // ── Agent form helpers ─────────────────────────────────────────────────────
  function applyAgentToForm(agent) {
    let toolsArr = [];
    let parsedCustomTools = [];
    if (agent.tools) {
      if (typeof agent.tools === 'object' && !Array.isArray(agent.tools)) {
        if (Array.isArray(agent.tools.dataToCollect)) toolsArr = agent.tools.dataToCollect;
        if (Array.isArray(agent.tools.customTools)) {
          // Restore raw tool configs (type, webhookUrl, method, headers, parameters[])
          parsedCustomTools = agent.tools.customTools.map(t => {
            // If already in raw format (has .parameters as array), use as-is
            if (Array.isArray(t.parameters)) return t;
            // Legacy: was saved as OpenAI schema — reconstruct best-effort
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
      initialMessage: agent.initialMessage,
      voiceId: agent.voiceId || '',
      language: agent.language || 'en-US',
      timezone: agent.timezone || 'Asia/Kolkata',
      dataToCollect: toolsArr,
    });
    setCustomTools(parsedCustomTools);
  }

  const selectAgent = (agent) => {
    navigate(`/agents/${agent.id}`);
  };

  function createNewAgent() {
    navigate('/agents');
    setConfig(EMPTY_CONFIG);
    setCustomTools([]);
    setViewMode('config');
  };

  // ── Save / delete ──────────────────────────────────────────────────────────
  const saveAgent = async () => {
    // Save raw tool configs (preserving type, webhookUrl, method, headers)
    // so webhook tools are not downgraded to frontend tools on reload.
    const rawTools = customTools.filter(t => t.name?.trim());
    const payload = {
      name: config.name,
      systemPrompt: config.systemPrompt,
      initialMessage: config.initialMessage,
      voiceId: config.voiceId,
      language: config.language,
      timezone: config.timezone,
      tools: {
        dataToCollect: config.dataToCollect,
        customTools: rawTools
      }
    };
    try {
      if (agentId) {
        await axios.put(`${API_AGENTS}/${agentId}`, payload);
      } else {
        const res = await axios.post(API_AGENTS, payload);
        navigate(`/agents/${res.data.id}`);
      }
      fetchAgents();
    } catch (err) {
      console.error('Failed to save agent', err);
    }
  };

  const deleteAgent = async () => {
    if (!agentId) return;
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

  // ── Test call ──────────────────────────────────────────────────────────────
  const handleStartCall = () => {
    // Send raw tool configs (not stripped OpenAI schemas) so the server can
    // distinguish webhook tools (with type/webhookUrl) from frontend tools.
    const rawTools = customTools.filter(t => t.name?.trim());
    startSession({
      agentId,
      systemPrompt: config.systemPrompt,
      dataToCollect: config.dataToCollect,
      voiceId: config.voiceId,
      language: config.language,
      timezone: config.timezone,
      firstMessage: config.initialMessage,
      customTools: rawTools
    });
  };


  // Show analytics when call ends
  useEffect(() => {
    if (!isConnected && cost) setShowAnalytics(true);
  }, [isConnected, cost]);

  return (
    <div className="min-h-screen bg-background text-foreground flex overflow-hidden">
      {/* LEFT: Agent List */}
      <AgentSidebar
        agents={agents}
        activeAgentId={agentId || null}
        onSelectAgent={selectAgent}
        onCreateNew={createNewAgent}
        onOpenPhoneDialog={() => setShowPhoneDialog(true)}
      />

      {/* CENTER: Configuration or CRM */}
      <div className="flex-1 flex flex-col min-w-[500px]">
        {agentId && (
          <div className="flex border-b border-border bg-card p-2 justify-center space-x-2">
            <button
              onClick={() => setViewMode('config')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'config' ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground'
              }`}
            >
              Agent Configuration
            </button>
            <button
              onClick={() => setViewMode('crm')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'crm' ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground'
              }`}
            >
              CRM Dashboard
            </button>
          </div>
        )}
        
        {viewMode === 'config' || !agentId ? (
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
          />
        ) : (
          <CrmDashboard agentId={agentId} />
        )}
      </div>

      {/* RIGHT: Test Interface */}
      <TestInterface
        agentName={config.name}
        isConnected={isConnected}
        isAgentSpeaking={isAgentSpeaking}
        transcript={transcript}
        onStartCall={handleStartCall}
        onEndCall={endSession}
        onSendText={sendTextMessage}
      />

      {/* Modals */}
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
