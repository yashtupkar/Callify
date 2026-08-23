import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Settings2, Phone, Plus } from 'lucide-react';

export default function AgentSidebar({ agents, activeAgentId, onSelectAgent, onCreateNew, onOpenPhoneDialog }) {
  return (
    <div className="w-72 border-r border-border bg-card flex flex-col shrink-0">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-zinc-400" /> Agents
        </h2>
        <div className="flex gap-1">
          <Button
            onClick={onOpenPhoneDialog}
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-full"
            title="Manage Phone Numbers"
          >
            <Phone className="h-4 w-4" />
          </Button>
          <Button
            onClick={onCreateNew}
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-full"
            title="Create New Agent"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {agents.map(a => (
            <button
              key={a.id}
              onClick={() => onSelectAgent(a)}
              className={`w-full text-left px-3 py-3 rounded-md text-sm transition-colors ${
                activeAgentId === a.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-zinc-800/50 text-zinc-400'
              }`}
            >
              {a.name}
            </button>
          ))}
          {agents.length === 0 && (
            <div className="text-center text-sm text-zinc-500 mt-8">
              No agents yet.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
