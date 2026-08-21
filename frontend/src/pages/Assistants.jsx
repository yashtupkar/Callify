import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Bot, Trash2, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { ModeToggle } from '../components/mode-toggle';

export function Assistants() {
  const [agents, setAgents] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const refresh = () => api.listAgents().then(setAgents).catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, []);

  const createAgent = async () => {
    const agent = await api.createAgent({ name: 'New Assistant' });
    navigate(`/dashboard/assistants/${agent.id}`);
  };

  const removeAgent = async (e, id) => {
    e.stopPropagation();
    await api.deleteAgent(id);
    refresh();
  };

  return (
    <div className="flex flex-col h-full">
      <header className="h-16 border-b border-border flex items-center justify-between px-6 shrink-0">
        <h1 className="text-sm font-semibold">Assistants</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={createAgent}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={16} /> Create Assistant
          </button>
          <ModeToggle />
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 max-w-[1000px] w-full mx-auto">
        {error && <p className="text-sm text-red-500 mb-4">Failed to load assistants: {error}</p>}
        {agents && agents.length === 0 && (
          <div className="text-center py-24 text-muted-foreground">
            <Bot size={40} className="mx-auto mb-4 opacity-50" />
            <p className="text-sm">No assistants yet. Create your first one to get started.</p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(agents || []).map((agent) => (
            <div
              key={agent.id}
              onClick={() => navigate(`/dashboard/assistants/${agent.id}`)}
              className="bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-all cursor-pointer group"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <Bot size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{agent.name}</h3>
                    <p className="text-xs text-muted-foreground">{agent.model}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => removeAgent(e, agent.id)}
                    className="text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={14} />
                  </button>
                  <ChevronRight size={16} className="text-muted-foreground" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3 line-clamp-2">{agent.systemPrompt}</p>
              <div className="flex gap-2 mt-3">
                {(agent.tools || []).filter((t) => t.enabled !== false).map((t, i) => (
                  <span key={i} className="text-[10px] bg-accent px-2 py-0.5 rounded-full text-muted-foreground">
                    {t.type}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
