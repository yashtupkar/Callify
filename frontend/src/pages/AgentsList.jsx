import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Plus, Bot, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function AgentsList() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      const data = await api.getAgents();
      setAgents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const newAgent = await api.createAgent({
        name: "New Agent",
        systemPrompt: "You are a helpful AI assistant.",
        initialMessage: "Hello, how can I help you?",
        tools: []
      });
      navigate(`/dashboard/agent/${newAgent.id}`);
    } catch (err) {
      console.error("Failed to create agent");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-auto p-6 max-w-[1200px] w-full mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Agents</h1>
          <p className="text-muted-foreground mt-1">Manage your Vapi-style voice agents</p>
        </div>
        <button 
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={18} />
          Create Agent
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">Loading agents...</div>
      ) : agents.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <Bot size={48} className="mx-auto text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-foreground mb-2">No agents found</h3>
          <p className="text-muted-foreground mb-6">Create your first AI agent to get started.</p>
          <button 
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors mx-auto"
          >
            <Plus size={18} />
            Create Agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map(agent => (
            <div 
              key={agent.id}
              onClick={() => navigate(`/dashboard/agent/${agent.id}`)}
              className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 cursor-pointer transition-all group hover:shadow-md"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Bot size={20} />
                </div>
                <ChevronRight size={18} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1 truncate">{agent.name}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                {agent.initialMessage}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-accent/50 w-fit px-2 py-1 rounded">
                <span className="font-mono">{agent.id.split('-')[0]}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
