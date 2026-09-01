import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Bot, Loader2, ExternalLink, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SERVER_URL } from '@/lib/constants';

export default function CrmAgentsListPage() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${SERVER_URL}/api/crm/my-agents`).then(r => setAgents(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
          <p className="text-muted-foreground mt-1">{agents.length} active agents</p>
        </div>
      </div>

      {agents.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No agents yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map(agent => (
            <Card key={agent.id} className="hover:border-primary/40 hover:shadow-lg transition-all group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="w-12 h-12 rounded-xl bg-foreground flex items-center justify-center text-background font-bold text-lg shrink-0">
                    {agent.name.charAt(0).toUpperCase()}
                  </div>
                  <Badge variant="outline">{agent.language || 'en-US'}</Badge>
                </div>
                <CardTitle className="mt-3 text-base">{agent.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground line-clamp-3 min-h-[3rem]">
                  {agent.systemPrompt || 'No system prompt configured.'}
                </p>
                <div className="flex gap-2 pt-2">
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link to={`/crm/agent/${agent.id}`}>
                      Configure
                      <ExternalLink className="w-3 h-3 ml-1.5" />
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link to={`/crm/calendar?agent=${agent.id}`}>
                      <Calendar className="w-3.5 h-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}