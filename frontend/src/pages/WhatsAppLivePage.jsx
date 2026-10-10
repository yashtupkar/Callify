import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { MessageCircle, RefreshCcw, Send, Loader2, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SERVER_URL, WS_URL } from '@/lib/constants';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/data-badge';
import { useAuth } from '@/hooks/useAuth';

function timeAgo(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function WhatsAppLivePage() {
  const { isAdmin } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [instances, setInstances] = useState([]);
  const [testTo, setTestTo] = useState('');
  const [testBody, setTestBody] = useState('Hello from Callify 👋');
  const [testInstance, setTestInstance] = useState('');
  const [testStatus, setTestStatus] = useState(null);
  const wsRef = useRef(null);
  const scrollRef = useRef(null);

  const refreshSessions = async () => {
    setLoadingSessions(true);
    try {
      const r = await axios.get(`${SERVER_URL}/api/whatsapp-automation/sessions`);
      setSessions(r.data.sessions || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSessions(false);
    }
  };

  const refreshInstances = async () => {
    try {
      const r = await axios.get(`${SERVER_URL}/api/baileys/instances`);
      setInstances(r.data || []);
      if (!testInstance && r.data?.[0]) setTestInstance(r.data[0].instanceId);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    refreshSessions();
    refreshInstances();
    const i = setInterval(refreshSessions, 5000);
    return () => clearInterval(i);
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (!selectedKey) return;
  }, [selectedKey, isAdmin]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcript]);

  const sendTest = async () => {
    if (!testInstance || !testTo) return;
    setTestStatus('sending');
    try {
      const r = await axios.post(`${SERVER_URL}/api/baileys/instance/${testInstance}/send`, {
        to: testTo,
        type: 'text',
        body: testBody,
      });
      setTestStatus({ ok: true, data: r.data });
    } catch (e) {
      setTestStatus({ ok: false, error: e.response?.data?.error || e.message });
    }
  };

  if (!isAdmin) {
    return <div className="p-6 text-muted-foreground">Admins only.</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MessageCircle className="w-6 h-6" /> WhatsApp Live
          </h1>
          <p className="text-sm text-muted-foreground">Watch active WhatsApp conversations in real time and test your numbers.</p>
        </div>
        <Button variant="outline" onClick={() => { refreshSessions(); refreshInstances(); }}>
          <RefreshCcw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Active conversations ({sessions.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[60vh] overflow-auto">
            {loadingSessions && <div className="text-sm text-muted-foreground">Loading...</div>}
            {!loadingSessions && sessions.length === 0 && (
              <div className="text-sm text-muted-foreground">No active WhatsApp conversations. Send a message to one of your configured numbers to see it here.</div>
            )}
            {sessions.map((s) => (
              <button
                key={s.key}
                onClick={() => { setSelectedKey(s.key); setTranscript([]); }}
                className={`w-full text-left p-3 rounded-md border transition ${selectedKey === s.key ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-mono text-sm">{s.contactWaId}</div>
                  <Badge variant="outline">{s.messageCount} msgs</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {s.key} • last activity {timeAgo(s.lastActivityAt)}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              {selectedKey ? `Conversation: ${selectedKey}` : 'Select a conversation'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={scrollRef} className="h-[55vh] overflow-auto border rounded-md p-3 space-y-2 bg-muted/20">
              {!selectedKey && <div className="text-sm text-muted-foreground">Pick a session from the left to view its live transcript.</div>}
              {transcript.map((m, i) => (
                <div key={i} className={`text-sm ${m.role === 'user' ? 'text-blue-700' : m.role === 'assistant' ? 'text-foreground' : m.role === 'tool' ? 'text-purple-700' : 'text-muted-foreground'}`}>
                  <span className="font-semibold mr-1">[{m.role}{m.tool ? `:${m.tool}` : ''}]</span>
                  <span className="whitespace-pre-wrap">
                    {m.text ?? (m.tool ? JSON.stringify(m.result ?? m.args) : '')}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send a test message</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col md:flex-row gap-2">
            <select
              value={testInstance}
              onChange={(e) => setTestInstance(e.target.value)}
              className="border rounded-md px-2 py-1 text-sm bg-background"
            >
              <option value="">Select instance…</option>
              {instances.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.phoneNumber} ({i.provider})
                </option>
              ))}
            </select>
            <Input
              placeholder="Recipient WhatsApp number (with country code, e.g. 14155552671)"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              className="md:max-w-sm"
            />
            <Input
              placeholder="Message body"
              value={testBody}
              onChange={(e) => setTestBody(e.target.value)}
              className="flex-1"
            />
            <Button onClick={sendTest} disabled={!testInstance || !testTo || testStatus === 'sending'}>
              {testStatus === 'sending' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send
            </Button>
          </div>
          {testStatus && typeof testStatus === 'object' && (
            <div className={`text-xs ${testStatus.ok ? 'text-green-700' : 'text-red-700'}`}>
              {testStatus.ok ? `Sent. ${JSON.stringify(testStatus.data.result || {})}` : `Error: ${testStatus.error}`}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            Configure connections from the <Link to="/admin/whatsapp-numbers" className="text-primary underline">WhatsApp Connections</Link> page.
            Build and deploy automations from the <Link to="/whatsapp" className="text-primary underline">WhatsApp Automation</Link> page.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
