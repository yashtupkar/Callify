import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useVoiceSession } from './hooks/useVoiceSession';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Phone, PhoneOff, Settings2, User, Plus, Save, Trash2, Mic, X, ChevronDown, ChevronUp, Send } from 'lucide-react';

const API_BASE = 'http://localhost:8083/api/agents';
const PHONE_API_BASE = 'http://localhost:8083/api/phonenumbers';

function App() {
  const { isConnected, isAgentSpeaking, transcript, usage, cost, startSession, endSession, sendTextMessage } = useVoiceSession('ws://localhost:8083');
  const [chatInput, setChatInput] = useState('');
  
  const [agents, setAgents] = useState([]);
  const [activeAgentId, setActiveAgentId] = useState(null);
  
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [showPhoneDialog, setShowPhoneDialog] = useState(false);
  const [newPhoneNumber, setNewPhoneNumber] = useState('');

  const [config, setConfig] = useState({
    name: "Dental Receptionist",
    systemPrompt: "You are a highly capable, professional, and impressive dental clinic receptionist. Keep your answers natural, engaging, and brief. IMPORTANT RULES: 1. If you receive any specific information from the user (like a name, email, or address), you MUST confirm it back to the user normally to ensure accuracy. 2. NEVER book an appointment without explicitly confirming the exact date and time with the user first. If they only give a time, ask for the date! 3. If the user indicates they want to end the call, or the conversation is naturally over, call the 'end_call' tool to hang up.",
    dataToCollect: ["Name", "Email", "Phone"],
    customToolsStr: "",
    voiceId: "",
    language: "en-US",
    initialMessage: "Hi, thanks for calling! You've reached our reception desk. How can I help you today?"
  });

  const [showAnalytics, setShowAnalytics] = useState(false);

  // Data collection tag input
  const [dataFieldInput, setDataFieldInput] = useState('');

  // Custom tool builder state
  // Each tool: { name, description, parameters: [{ name, type, description, required }] }
  const [customTools, setCustomTools] = useState([]);
  const [expandedToolIdx, setExpandedToolIdx] = useState(null);

  useEffect(() => {
    fetchAgents();
    fetchPhoneNumbers();
  }, []);

  const fetchPhoneNumbers = async () => {
    try {
      const res = await axios.get(PHONE_API_BASE);
      setPhoneNumbers(res.data);
    } catch (err) {
      console.error("Failed to fetch phone numbers", err);
    }
  };

  const fetchAgents = async () => {
    try {
      const res = await axios.get(API_BASE);
      setAgents(res.data);
      if (res.data.length > 0 && !activeAgentId) {
        selectAgent(res.data[0]);
      }
    } catch (err) {
      console.error("Failed to fetch agents", err);
    }
  };

  const selectAgent = (agent) => {
    setActiveAgentId(agent.id);
    let toolsArr = [];
    let parsedCustomTools = [];
    if (agent.tools) {
      if (typeof agent.tools === 'object' && !Array.isArray(agent.tools)) {
        if (Array.isArray(agent.tools.dataToCollect)) toolsArr = agent.tools.dataToCollect;
        if (Array.isArray(agent.tools.customTools)) {
          // Convert stored OpenAI schema back to builder format
          parsedCustomTools = agent.tools.customTools.map(t => {
            const fn = t.function || t;
            const props = fn.parameters?.properties || {};
            const required = fn.parameters?.required || [];
            return {
              name: fn.name || '',
              description: fn.description || '',
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
      dataToCollect: toolsArr,
    });
    setCustomTools(parsedCustomTools);
    setExpandedToolIdx(null);
  };

  const createNewAgent = () => {
    setActiveAgentId(null);
    setConfig({
      name: 'New Agent',
      systemPrompt: '',
      dataToCollect: [],
      voiceId: '',
      language: 'en-US',
      initialMessage: "Hi, thanks for calling! How can I help you today?"
    });
    setCustomTools([]);
    setExpandedToolIdx(null);
  };

  // Convert the builder tool list into OpenAI-format schemas for saving/sending
  const buildToolSchemas = () => customTools
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

  const saveAgent = async () => {
    const payload = {
      name: config.name,
      systemPrompt: config.systemPrompt,
      initialMessage: config.initialMessage,
      voiceId: config.voiceId,
      language: config.language,
      tools: { 
        dataToCollect: config.dataToCollect,
        customTools: buildToolSchemas()
      }
    };

    try {
      if (activeAgentId) {
        await axios.put(`${API_BASE}/${activeAgentId}`, payload);
      } else {
        const res = await axios.post(API_BASE, payload);
        setActiveAgentId(res.data.id);
      }
      fetchAgents();
    } catch (err) {
      console.error('Failed to save agent', err);
    }
  };

  const deleteAgent = async () => {
    if (!activeAgentId) return;
    try {
      await axios.delete(`${API_BASE}/${activeAgentId}`);
      setActiveAgentId(null);
      fetchAgents();
    } catch (err) {
      console.error("Failed to delete agent", err);
    }
  };

  const handleStart = () => {
    startSession({
      systemPrompt: config.systemPrompt,
      dataToCollect: config.dataToCollect,
      voiceId: config.voiceId,
      language: config.language,
      firstMessage: config.initialMessage,
      customTools: buildToolSchemas()
    });
  };

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

  // Custom tool builder helpers
  const addTool = () => {
    const idx = customTools.length;
    setCustomTools(prev => [...prev, { name: '', description: '', parameters: [] }]);
    setExpandedToolIdx(idx);
  };

  const removeTool = (idx) => {
    setCustomTools(prev => prev.filter((_, i) => i !== idx));
    setExpandedToolIdx(null);
  };

  const updateTool = (idx, field, value) => {
    setCustomTools(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  };

  const addParam = (toolIdx) => {
    setCustomTools(prev => prev.map((t, i) => i === toolIdx
      ? { ...t, parameters: [...t.parameters, { name: '', type: 'string', description: '', required: false }] }
      : t
    ));
  };

  const removeParam = (toolIdx, paramIdx) => {
    setCustomTools(prev => prev.map((t, i) => i === toolIdx
      ? { ...t, parameters: t.parameters.filter((_, pi) => pi !== paramIdx) }
      : t
    ));
  };

  const updateParam = (toolIdx, paramIdx, field, value) => {
    setCustomTools(prev => prev.map((t, i) => i === toolIdx
      ? { ...t, parameters: t.parameters.map((p, pi) => pi === paramIdx ? { ...p, [field]: value } : p) }
      : t
    ));
  };

  useEffect(() => {
    if (!isConnected && cost) {
      setShowAnalytics(true);
    }
  }, [isConnected, cost]);

  return (
    <div className="min-h-screen bg-background text-foreground flex overflow-hidden">
      
      {/* LEFT SIDEBAR: Agent List */}
      <div className="w-72 border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-zinc-400" /> Agents
          </h2>
          <div className="flex gap-1">
            <Button onClick={() => setShowPhoneDialog(true)} size="icon" variant="ghost" className="h-8 w-8 rounded-full" title="Manage Phone Numbers">
              <Phone className="h-4 w-4" />
            </Button>
            <Button onClick={createNewAgent} size="icon" variant="ghost" className="h-8 w-8 rounded-full" title="Create New Agent">
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {agents.map(a => (
              <button 
                key={a.id} 
                onClick={() => selectAgent(a)}
                className={`w-full text-left px-3 py-3 rounded-md text-sm transition-colors ${activeAgentId === a.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-zinc-800/50 text-zinc-400'}`}
              >
                {a.name}
              </button>
            ))}
            {agents.length === 0 && (
              <div className="text-center text-sm text-zinc-500 mt-8">No agents created.</div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* CENTER: Configuration */}
      <div className="flex-1 flex flex-col border-r border-border bg-background">
        <div className="p-4 border-b border-border flex justify-between items-center bg-card">
          <h1 className="text-xl font-bold">Configure Agent</h1>
          <div className="flex gap-2">
            {activeAgentId && (
              <Button onClick={deleteAgent} variant="destructive" size="sm" className="gap-2">
                <Trash2 className="w-4 h-4" /> Delete
              </Button>
            )}
            <Button onClick={saveAgent} size="sm" className="gap-2">
              <Save className="w-4 h-4" /> Save
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1 p-6">
          <div className="max-w-2xl space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Agent Name</label>
              <Input 
                value={config.name} 
                onChange={e => setConfig({...config, name: e.target.value})} 
                className="bg-card"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Initial Message</label>
              <Input 
                value={config.initialMessage} 
                onChange={e => setConfig({...config, initialMessage: e.target.value})} 
                className="bg-card"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">System Prompt</label>
              <textarea 
                value={config.systemPrompt} 
                onChange={e => setConfig({...config, systemPrompt: e.target.value})} 
                className="flex min-h-[150px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium">Data to Collect</label>
              <p className="text-xs text-zinc-500">The agent will collect these fields from the caller before helping with their request.</p>
              {/* Tag display */}
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
              {/* Tag input */}
              <input
                type="text"
                value={dataFieldInput}
                onChange={e => setDataFieldInput(e.target.value)}
                onKeyDown={addDataField}
                placeholder='Type a field name and press Enter (e.g. "Company", "Budget")'
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {/* Custom Tools Builder */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">Custom Tools</label>
                  <p className="text-xs text-zinc-500 mt-0.5">Tools the LLM can call — executed by your frontend.</p>
                </div>
                <button
                  onClick={addTool}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors border border-zinc-700"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Tool
                </button>
              </div>

              {customTools.length === 0 && (
                <div className="text-center py-6 rounded-lg border border-dashed border-zinc-700 text-zinc-500 text-sm">
                  No custom tools yet. Click "Add Tool" to create one.
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
                        {expandedToolIdx === idx ? <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />}
                        <span className="text-sm font-mono font-medium text-zinc-200 truncate">
                          {tool.name || <span className="text-zinc-500 font-sans font-normal">Unnamed tool</span>}
                        </span>
                        {tool.parameters.length > 0 && (
                          <span className="ml-auto text-xs text-zinc-500 shrink-0">{tool.parameters.length} param{tool.parameters.length !== 1 ? 's' : ''}</span>
                        )}
                      </button>
                      <button onClick={() => removeTool(idx)} className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Tool Body */}
                    {expandedToolIdx === idx && (
                      <div className="px-3 pb-3 space-y-3 border-t border-zinc-700/60 pt-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-xs text-zinc-400">Function Name</label>
                            <input
                              value={tool.name}
                              onChange={e => updateTool(idx, 'name', e.target.value.replace(/\s+/g, '_'))}
                              placeholder="e.g. lookup_order"
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

                          {tool.parameters.length === 0 && (
                            <p className="text-xs text-zinc-600 italic">No parameters — tool takes no arguments.</p>
                          )}

                          {tool.parameters.map((param, pi) => (
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
                              <button onClick={() => removeParam(idx, pi)} className="p-0.5 rounded hover:text-red-400 text-zinc-600 transition-colors">
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
            <div className="space-y-2">
              <label className="text-sm font-medium">TTS Voice ID (Optional)</label>
              <Input 
                value={config.voiceId} 
                onChange={e => setConfig({...config, voiceId: e.target.value})} 
                className="bg-card"
                placeholder="Leave blank for default"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Language</label>
              <select
                value={config.language}
                onChange={e => setConfig({...config, language: e.target.value})}
                className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="en-US">English (US)</option>
                <option value="hi-IN">Hindi (India)</option>
              </select>
            </div>
            
            {/* Phone Number Assignment */}
            {activeAgentId && (
              <div className="space-y-3 pt-4 border-t border-border">
                <label className="text-sm font-medium">Assigned Phone Numbers</label>
                <div className="space-y-2">
                  {phoneNumbers.length === 0 ? (
                    <p className="text-xs text-zinc-500">No phone numbers added. Click the phone icon on the left to add one.</p>
                  ) : (
                    phoneNumbers.map(phone => (
                      <label key={phone.id} className="flex items-center gap-2 text-sm cursor-pointer hover:text-zinc-300">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-primary focus:ring-primary focus:ring-offset-background"
                          checked={phone.agentId === activeAgentId}
                          onChange={async (e) => {
                            const isChecked = e.target.checked;
                            try {
                              await axios.put(`${PHONE_API_BASE}/${phone.id}`, {
                                agentId: isChecked ? activeAgentId : null
                              });
                              fetchPhoneNumbers();
                            } catch (err) {
                              console.error('Failed to update phone number assignment', err);
                            }
                          }}
                        />
                        {phone.phoneNumber}
                        {phone.agentId && phone.agentId !== activeAgentId && (
                          <span className="text-xs text-zinc-500 ml-2">(Currently assigned to another agent)</span>
                        )}
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* RIGHT: Test Interface */}
      <div className="w-[450px] bg-zinc-950 flex flex-col">
        <div className="p-6 border-b border-border flex flex-col items-center justify-center bg-card">
          <div className="relative mt-4">
            {isAgentSpeaking && (
              <div className="absolute -inset-4 bg-primary/20 rounded-full animate-ping"></div>
            )}
            <Avatar className={`w-24 h-24 border-4 ${isAgentSpeaking ? 'border-primary shadow-[0_0_30px_rgba(255,255,255,0.2)]' : 'border-zinc-800'} transition-all duration-300`}>
              <AvatarImage src={`https://api.dicebear.com/7.x/bottts/svg?seed=${config.name}&backgroundColor=09090b`} />
              <AvatarFallback>AI</AvatarFallback>
            </Avatar>
          </div>
          <h3 className="mt-4 text-lg font-medium tracking-tight">
            {isConnected ? (isAgentSpeaking ? 'Agent Speaking...' : 'Listening...') : config.name}
          </h3>
          <div className="mt-6">
            {!isConnected ? (
              <Button onClick={handleStart} size="lg" className="rounded-full px-8 shadow-lg">
                <Phone className="mr-2 h-5 w-5" /> Test Call
              </Button>
            ) : (
              <Button onClick={endSession} size="lg" variant="destructive" className="rounded-full px-8 shadow-lg">
                <PhoneOff className="mr-2 h-5 w-5" /> End Call
              </Button>
            )}
          </div>
        </div>

        {/* Live Transcript */}
        <div className="flex-1 overflow-hidden relative bg-zinc-950 flex flex-col">
          <ScrollArea className="flex-1 w-full p-4">
            {transcript.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-600 italic text-sm">
                Transcript will appear here...
              </div>
            ) : (
              <div className="space-y-4 pb-4">
                {transcript.map((msg, i) => (
                  <div key={i} className={`flex ${msg.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex gap-3 max-w-[85%] ${msg.speaker === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <Avatar className="w-7 h-7 mt-1 border border-zinc-800">
                        {msg.speaker === 'user' ? (
                          <div className="w-full h-full bg-zinc-800 flex items-center justify-center"><User className="w-3.5 h-3.5 text-zinc-300" /></div>
                        ) : (
                          <AvatarImage src={`https://api.dicebear.com/7.x/bottts/svg?seed=${config.name}&backgroundColor=09090b`} />
                        )}
                      </Avatar>
                      <div className={`p-3 rounded-2xl ${msg.speaker === 'user' ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-zinc-800 text-zinc-100 rounded-tl-sm'} ${!msg.isFinal ? 'opacity-70' : ''}`}>
                        <p className="text-sm leading-relaxed">{msg.text}</p>
                        {!msg.isFinal && <span className="inline-block w-1.5 h-1.5 ml-2 bg-current rounded-full animate-pulse"></span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          {isConnected && (
            <div className="p-4 border-t border-zinc-800 bg-zinc-950">
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (chatInput.trim()) {
                    sendTextMessage(chatInput);
                    setChatInput('');
                  }
                }}
                className="flex gap-2"
              >
                <Input 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a message to test..."
                  className="bg-zinc-900 border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-primary/50"
                />
                <Button type="submit" size="icon" className="shrink-0 hover:bg-primary/90" disabled={!chatInput.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Analytics Modal */}
      <Dialog open={showAnalytics} onOpenChange={setShowAnalytics}>
        <DialogContent className="bg-card text-foreground border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl text-center pb-2 border-b border-border">Call Summary</DialogTitle>
          </DialogHeader>
          {cost && usage && (
            <div className="space-y-6 py-4">
              <div className="flex justify-center">
                <div className="text-center">
                  <p className="text-sm text-zinc-400 mb-1">Estimated Cost</p>
                  <p className="text-5xl font-bold text-emerald-400">${cost.totalCost.toFixed(5)}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-900/50 p-4 rounded-xl border border-border text-center">
                  <p className="text-sm text-zinc-400 mb-1">Duration</p>
                  <p className="text-xl font-semibold">{usage.callDurationSeconds}s</p>
                </div>
                <div className="bg-zinc-900/50 p-4 rounded-xl border border-border text-center">
                  <p className="text-sm text-zinc-400 mb-1">Tools Called</p>
                  <p className="text-xl font-semibold">{usage.toolCalls}</p>
                </div>
              </div>

              <div className="space-y-3 bg-zinc-900/50 p-4 rounded-xl border border-border">
                <h4 className="font-medium text-sm text-zinc-300 border-b border-border pb-2">Cost Breakdown</h4>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">LLM Processing</span>
                  <span className="font-mono">${cost.llmCost.toFixed(5)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Speech-to-Text</span>
                  <span className="font-mono">${cost.sttCost.toFixed(5)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Text-to-Speech</span>
                  <span className="font-mono">${cost.ttsCost.toFixed(5)}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowAnalytics(false)} className="w-full">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phone Number Management Modal */}
      <Dialog open={showPhoneDialog} onOpenChange={setShowPhoneDialog}>
        <DialogContent className="bg-card text-foreground border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Phone Numbers</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Input 
                placeholder="+1234567890" 
                value={newPhoneNumber} 
                onChange={e => setNewPhoneNumber(e.target.value)} 
                className="bg-background"
              />
              <Button onClick={async () => {
                if (!newPhoneNumber) return;
                try {
                  await axios.post(PHONE_API_BASE, { phoneNumber: newPhoneNumber });
                  setNewPhoneNumber('');
                  fetchPhoneNumbers();
                } catch(e) {
                  alert("Failed to add number (might already exist)");
                }
              }}>Add</Button>
            </div>
            
            <div className="space-y-2 mt-4 max-h-[250px] overflow-y-auto pr-2">
              {phoneNumbers.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-4">No numbers added yet.</p>
              ) : (
                phoneNumbers.map(phone => {
                  const assignedAgent = agents.find(a => a.id === phone.agentId);
                  return (
                    <div key={phone.id} className="flex justify-between items-center p-2 rounded-md bg-zinc-900/50 border border-border">
                      <div>
                        <p className="font-mono text-sm">{phone.phoneNumber}</p>
                        <p className="text-xs text-zinc-500">
                          {assignedAgent ? `Assigned to: ${assignedAgent.name}` : 'Unassigned'}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={async () => {
                        try {
                          await axios.delete(`${PHONE_API_BASE}/${phone.id}`);
                          fetchPhoneNumbers();
                        } catch(e) {
                          console.error('Failed to delete', e);
                        }
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
