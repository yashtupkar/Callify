import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useVoiceSession } from './hooks/useVoiceSession';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Phone, PhoneOff, Settings2, User, Plus, Save, Trash2, Mic } from 'lucide-react';

const API_BASE = 'http://localhost:8083/api/agents';

function App() {
  const { isConnected, isAgentSpeaking, transcript, usage, cost, startSession, endSession } = useVoiceSession('ws://localhost:8083');
  
  const [agents, setAgents] = useState([]);
  const [activeAgentId, setActiveAgentId] = useState(null);

  const [config, setConfig] = useState({
    name: "Dental Receptionist",
    systemPrompt: "You are a highly capable, professional, and impressive dental clinic receptionist. Keep your answers natural, engaging, and brief. IMPORTANT RULES: 1. If you receive any specific information from the user (like a name, email, or address), you MUST confirm it back to the user normally to ensure accuracy. 2. NEVER book an appointment without explicitly confirming the exact date and time with the user first. If they only give a time, ask for the date! 3. If the user indicates they want to end the call, or the conversation is naturally over, call the 'end_call' tool to hang up.",
    dataToCollect: ["Name", "Email", "Phone"],
    customToolsStr: "",
    voiceId: "",
    initialMessage: "Hi, thanks for calling! You've reached our reception desk. How can I help you today?"
  });

  const [showAnalytics, setShowAnalytics] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, []);

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
    let customToolsStr = "";
    if (agent.tools) {
      if (typeof agent.tools === 'object' && !Array.isArray(agent.tools)) {
        if (Array.isArray(agent.tools.dataToCollect)) toolsArr = agent.tools.dataToCollect;
        if (Array.isArray(agent.tools.customTools)) customToolsStr = JSON.stringify(agent.tools.customTools, null, 2);
      } else if (Array.isArray(agent.tools)) {
        toolsArr = agent.tools;
      }
    }

    setConfig({
      name: agent.name,
      systemPrompt: agent.systemPrompt,
      initialMessage: agent.initialMessage,
      voiceId: agent.voiceId || "",
      dataToCollect: toolsArr,
      customToolsStr: customToolsStr
    });
  };

  const createNewAgent = () => {
    setActiveAgentId(null);
    setConfig({
      name: "Dental Receptionist",
      systemPrompt: "You are a highly capable, professional, and impressive dental clinic receptionist. Keep your answers natural, engaging, and brief. IMPORTANT RULES: 1. If you receive any specific information from the user (like a name, email, or address), you MUST confirm it back to the user normally to ensure accuracy. 2. NEVER book an appointment without explicitly confirming the exact date and time with the user first. If they only give a time, ask for the date! 3. If the user indicates they want to end the call, or the conversation is naturally over, call the 'end_call' tool to hang up.",
      dataToCollect: ["Name", "Email", "Phone"],
      customToolsStr: "",
      voiceId: "",
      initialMessage: "Hi, thanks for calling! You've reached our reception desk. How can I help you today?"
    });
  };

  const saveAgent = async () => {
    let parsedCustomTools = [];
    if (config.customToolsStr.trim()) {
      try {
        parsedCustomTools = JSON.parse(config.customToolsStr);
      } catch (e) {
        alert("Invalid JSON in Custom Tools. Please fix it before saving.");
        return;
      }
    }

    const payload = {
      name: config.name,
      systemPrompt: config.systemPrompt,
      initialMessage: config.initialMessage,
      voiceId: config.voiceId,
      tools: { 
        dataToCollect: config.dataToCollect,
        customTools: parsedCustomTools
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
      console.error("Failed to save agent", err);
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
    let parsedCustomTools = [];
    if (config.customToolsStr.trim()) {
      try { parsedCustomTools = JSON.parse(config.customToolsStr); } catch (e) {}
    }
    startSession({
      systemPrompt: config.systemPrompt,
      dataToCollect: config.dataToCollect,
      voiceId: config.voiceId,
      firstMessage: config.initialMessage,
      customTools: parsedCustomTools
    });
  };

  const handleCheckbox = (field) => {
    setConfig(prev => {
      const isChecked = prev.dataToCollect.includes(field);
      const newArr = isChecked ? prev.dataToCollect.filter(f => f !== field) : [...prev.dataToCollect, field];
      return { ...prev, dataToCollect: newArr };
    });
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
          <Button onClick={createNewAgent} size="icon" variant="ghost" className="h-8 w-8 rounded-full">
            <Plus className="h-5 w-5" />
          </Button>
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
              <div className="flex gap-4">
                {['Name', 'Email', 'Phone'].map(field => (
                  <label key={field} className="flex items-center gap-2 text-sm cursor-pointer hover:text-zinc-300">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-primary focus:ring-primary focus:ring-offset-background"
                      checked={config.dataToCollect.includes(field)}
                      onChange={() => handleCheckbox(field)}
                    />
                    {field}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Custom Tools (JSON Array)</label>
              <textarea 
                value={config.customToolsStr} 
                onChange={e => setConfig({...config, customToolsStr: e.target.value})} 
                placeholder='[{"type":"function","name":"book_appointment","description":"Books an appointment..."}]'
                className="flex min-h-[120px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
              />
              <p className="text-xs text-zinc-500">Provide an array of tool objects if the LLM needs external APIs.</p>
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
        <div className="flex-1 overflow-hidden relative bg-zinc-950">
          <ScrollArea className="h-full w-full p-4">
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
    </div>
  );
}

export default App;
