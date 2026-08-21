import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Play, PhoneOff, Check, Bot, Wand2, Mic, Wrench, Plus, Trash2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../lib/api';
import { useVoiceCall } from '../hooks/useVoiceCall';
import { ModeToggle } from '../components/mode-toggle';

const MODELS = [
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'openai/gpt-4.1-mini',
  'anthropic/claude-3.5-haiku',
  'google/gemini-2.0-flash-001',
  'meta-llama/llama-3.3-70b-instruct',
];

const TABS = [
  { id: 'model', label: 'Model', icon: Wand2 },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'tools', label: 'Tools', icon: Wrench },
];

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary/50';

function ToolCard({ tool, catalogEntry, onChange, onRemove }) {
  const fields = catalogEntry?.configFields || [];
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench size={14} className="text-primary" />
          <span className="text-sm font-semibold">{catalogEntry?.label || tool.type}</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={tool.enabled !== false}
              onChange={(e) => onChange({ ...tool, enabled: e.target.checked })}
            />
            Enabled
          </label>
          <button onClick={onRemove} className="text-muted-foreground hover:text-red-500">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{catalogEntry?.description}</p>
      {fields.map((f) => (
        <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`}>
          <input
            className={inputCls}
            value={tool.config?.[f.key] || ''}
            onChange={(e) => onChange({ ...tool, config: { ...tool.config, [f.key]: e.target.value } })}
          />
        </Field>
      ))}
    </div>
  );
}

function CallPanel({ status, messages, onEnd }) {
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  return (
    <div className="w-96 border-l border-border bg-card flex flex-col shrink-0">
      <div className="h-12 border-b border-border flex items-center justify-between px-4">
        <span className="text-sm font-semibold flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full', status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-yellow-500')} />
          {status === 'active' ? 'Live call' : 'Connecting…'}
        </span>
        <button onClick={onEnd} className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-400">
          <PhoneOff size={14} /> End
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          m.speaker === 'tool' ? (
            <p key={i} className="text-[11px] text-center text-muted-foreground italic">{m.text}</p>
          ) : (
            <div key={i} className={cn('max-w-[85%] rounded-lg px-3 py-2 text-sm', m.speaker === 'agent' ? 'bg-accent text-foreground' : 'bg-primary/10 text-foreground ml-auto')}>
              <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">{m.speaker === 'agent' ? 'Assistant' : 'You'}</p>
              {m.text}
            </div>
          )
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export function AssistantEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [tab, setTab] = useState('model');
  const [saved, setSaved] = useState(true);
  const { status, messages, startCall, endCall } = useVoiceCall();

  useEffect(() => {
    api.getAgent(id).then(setAgent).catch(console.error);
    api.listToolTypes().then(setCatalog).catch(console.error);
  }, [id]);

  const update = (patch) => {
    setAgent((a) => ({ ...a, ...patch }));
    setSaved(false);
  };

  const save = async () => {
    const updated = await api.updateAgent(id, agent);
    setAgent(updated);
    setSaved(true);
  };

  if (!agent) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  const inCall = status !== 'idle';

  return (
    <div className="flex h-full">
      <div className="flex flex-col flex-1 min-w-0">
        <header className="h-16 border-b border-border flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/dashboard/assistants')} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft size={18} />
            </button>
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Bot size={16} />
            </div>
            <input
              className="text-sm font-semibold bg-transparent focus:outline-none focus:border-b border-border"
              value={agent.name}
              onChange={(e) => update({ name: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saved}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
                saved ? 'border-border text-muted-foreground' : 'bg-primary text-primary-foreground border-transparent hover:bg-primary/90'
              )}
            >
              <Check size={16} /> {saved ? 'Saved' : 'Save'}
            </button>
            <button
              onClick={() => (inCall ? endCall() : startCall(agent.id))}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                inCall ? 'bg-red-500/10 text-red-500 border border-red-500/30' : 'border border-border hover:bg-accent'
              )}
            >
              {inCall ? <PhoneOff size={16} /> : <Play size={16} className="text-emerald-500" />}
              {inCall ? 'End Call' : 'Talk'}
            </button>
            <ModeToggle />
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6 max-w-[900px] w-full mx-auto">
          <div className="flex gap-6 border-b border-border mb-6">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
                  tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <t.icon size={15} /> {t.label}
              </button>
            ))}
          </div>

          {tab === 'model' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Model">
                  <select className={inputCls} value={agent.model} onChange={(e) => update({ model: e.target.value })}>
                    {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                    {!MODELS.includes(agent.model) && <option value={agent.model}>{agent.model}</option>}
                  </select>
                </Field>
                <Field label={`Temperature (${agent.temperature})`}>
                  <input
                    type="range" min="0" max="1.5" step="0.1"
                    className="w-full mt-3"
                    value={agent.temperature}
                    onChange={(e) => update({ temperature: parseFloat(e.target.value) })}
                  />
                </Field>
              </div>
              <Field label="First Message (spoken as soon as the call starts)">
                <textarea
                  className={cn(inputCls, 'min-h-[80px] resize-y')}
                  value={agent.firstMessage}
                  onChange={(e) => update({ firstMessage: e.target.value })}
                />
              </Field>
              <Field label="System Prompt (natural voice-style rules are appended automatically)">
                <textarea
                  className={cn(inputCls, 'min-h-[200px] resize-y')}
                  value={agent.systemPrompt}
                  onChange={(e) => update({ systemPrompt: e.target.value })}
                />
              </Field>
            </div>
          )}

          {tab === 'voice' && (
            <div className="space-y-6 max-w-md">
              <Field label="TTS Provider">
                <select
                  className={inputCls}
                  value={agent.voice?.provider || 'elevenlabs'}
                  onChange={(e) => update({ voice: { ...agent.voice, provider: e.target.value } })}
                >
                  <option value="elevenlabs">ElevenLabs</option>
                  <option value="fish">Fish Audio</option>
                </select>
              </Field>
              <Field label="Voice ID (leave empty for provider default)">
                <input
                  className={inputCls}
                  value={agent.voice?.voiceId || ''}
                  onChange={(e) => update({ voice: { ...agent.voice, voiceId: e.target.value } })}
                />
              </Field>
            </div>
          )}

          {tab === 'tools' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-muted-foreground mr-1">Add tool:</span>
                {catalog.map((c) => (
                  <button
                    key={c.type}
                    onClick={() => update({ tools: [...(agent.tools || []), { type: c.type, enabled: true, config: {} }] })}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-border hover:bg-accent transition-colors"
                  >
                    <Plus size={12} /> {c.label}
                  </button>
                ))}
              </div>
              {(agent.tools || []).length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">No tools yet. Add Google Sheets, Calendar, or a custom API tool above.</p>
              )}
              {(agent.tools || []).map((tool, i) => (
                <ToolCard
                  key={i}
                  tool={tool}
                  catalogEntry={catalog.find((c) => c.type === tool.type)}
                  onChange={(t) => update({ tools: agent.tools.map((x, j) => (j === i ? t : x)) })}
                  onRemove={() => update({ tools: agent.tools.filter((_, j) => j !== i) })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {inCall && <CallPanel status={status} messages={messages} onEnd={endCall} />}
    </div>
  );
}
