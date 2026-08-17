import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { 
  Search,
  Wand2,
  Check,
  ChevronDown,
  ChevronLeft,
  Save,
  Trash2,
  AlertCircle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ModeToggle } from '../components/mode-toggle';
import { WebDialer } from '../components/WebDialer';

function Card({ title, subtitle, icon, provider, metrics }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-border/80 transition-all">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <div className="w-2 h-2 rounded-full bg-primary" />
          {title}
        </div>
      </div>
      
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground">{subtitle}</h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
          {icon} {provider}
        </div>
      </div>
      
      <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border/50">
        {metrics.map((metric, i) => (
          <div key={i}>
            <p className="text-[11px] text-muted-foreground mb-0.5">{metric.label}</p>
            <p className="text-sm font-medium text-foreground">{metric.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Composer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [initialMessage, setInitialMessage] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [toolsStr, setToolsStr] = useState('');
  const [toolsError, setToolsError] = useState('');

  useEffect(() => {
    if (id) {
      loadAgent();
    }
  }, [id]);

  const loadAgent = async () => {
    try {
      setLoading(true);
      const data = await api.getAgent(id);
      setAgent(data);
      setName(data.name || '');
      setInitialMessage(data.initialMessage || '');
      setSystemPrompt(data.systemPrompt || '');
      setToolsStr(data.tools ? JSON.stringify(data.tools, null, 2) : '[]');
    } catch (err) {
      console.error(err);
      // maybe navigate back
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setToolsError('');
      let parsedTools = [];
      
      try {
        parsedTools = JSON.parse(toolsStr);
        if (!Array.isArray(parsedTools)) throw new Error('Tools must be a JSON array');
      } catch (e) {
        setToolsError('Invalid JSON format for tools');
        setSaving(false);
        return;
      }

      const updated = await api.updateAgent(id, {
        name,
        systemPrompt,
        initialMessage,
        tools: parsedTools
      });
      setAgent(updated);
      // Optionally show a success toast here
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center">Loading agent...</div>;
  }

  if (!agent) {
    return <div className="flex h-full items-center justify-center">Agent not found</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-background/95 backdrop-blur z-10 sticky top-0 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/dashboard/agents')}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors mr-2"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-800 rounded flex items-center justify-center">
              <span className="text-xs font-medium text-white">{name.substring(0, 2).toUpperCase()}</span>
            </div>
            <div>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-sm font-semibold text-foreground bg-transparent border-none outline-none focus:ring-1 focus:ring-primary rounded px-1 -ml-1 w-[200px]"
              />
              <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <span className="bg-emerald-500/10 text-emerald-500 px-1 rounded font-medium">id: {agent.id.substring(0,8)}</span>
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <ModeToggle />
        </div>
      </header>

      {/* Main Scrollable Area */}
      <div className="flex-1 overflow-auto p-6 max-w-[1200px] w-full mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Configuration */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Configuration Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card 
                title="Transcriber"
                subtitle="Flux General English"
                icon={<div className="w-3 h-3 bg-white rounded-sm" />}
                provider="Deepgram · English"
                metrics={[
                  { label: "Latency", value: "380ms" },
                  { label: "Cost", value: "$0.01/min" },
                ]}
              />
              <Card 
                title="Model"
                subtitle="GPT-4o (Configured)"
                icon={<div className="w-3 h-3 bg-white rounded-full" />}
                provider="OpenAI"
                metrics={[
                  { label: "Latency", value: "690ms" },
                  { label: "Cost", value: "$0.02/min" },
                ]}
              />
            </div>

            {/* First Message */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                <span className="text-sm font-semibold text-foreground">First Message</span>
              </div>
              <textarea 
                value={initialMessage}
                onChange={(e) => setInitialMessage(e.target.value)}
                className="w-full bg-transparent text-sm p-4 text-foreground resize-none focus:outline-none min-h-[80px]"
                placeholder="Hello, how can I help you today?"
              />
            </div>

            {/* System Prompt */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                <span className="text-sm font-semibold text-foreground">System Prompt</span>
              </div>
              <textarea 
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="w-full bg-transparent text-sm p-4 text-foreground resize-y focus:outline-none min-h-[250px]"
                placeholder="You are a helpful AI assistant..."
              />
            </div>

            {/* Tools Array */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                <span className="text-sm font-semibold text-foreground">Tools (JSON Array)</span>
                {toolsError && <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12}/> {toolsError}</span>}
              </div>
              <textarea 
                value={toolsStr}
                onChange={(e) => {
                  setToolsStr(e.target.value);
                  setToolsError('');
                }}
                className={cn(
                  "w-full bg-transparent text-sm p-4 text-foreground resize-y focus:outline-none min-h-[200px] font-mono",
                  toolsError ? "bg-red-500/5" : ""
                )}
                placeholder="[{...}]"
              />
            </div>

          </div>

          {/* Right Column: Web Dialer */}
          <div className="lg:col-span-1 space-y-6">
            <div className="sticky top-6">
              <WebDialer agentId={agent.id} agentConfig={agent} />
              
              <div className="mt-6 bg-card border border-border rounded-xl p-4">
                <h4 className="text-sm font-semibold mb-2">Linked Phone Numbers</h4>
                {agent.phoneNumbers && agent.phoneNumbers.length > 0 ? (
                  <ul className="space-y-2">
                    {agent.phoneNumbers.map(pn => (
                      <li key={pn.id} className="text-sm text-muted-foreground flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        {pn.phoneNumber}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No phone numbers linked to this agent yet. Go to Phone Numbers to map one.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
