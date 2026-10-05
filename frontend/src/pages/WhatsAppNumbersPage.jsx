import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import {
  MessageCircle, Plus, Loader2, Trash2, Send, Wifi, WifiOff,
  QrCode, Phone, RefreshCcw, CheckCircle2, XCircle, Unplug, Bot, Link2,
} from 'lucide-react';
import { SERVER_URL, WS_URL } from '@/lib/constants';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/data-badge';
import { useAuth } from '@/hooks/useAuth';

const STATUS_CONFIG = {
  connected: { icon: CheckCircle2, label: 'Connected', color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-500' },
  scan_qr: { icon: QrCode, label: 'Scan QR Code', color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/30', dot: 'bg-amber-500' },
  disconnected: { icon: WifiOff, label: 'Disconnected', color: 'text-zinc-500', bg: 'bg-zinc-500/10 border-zinc-500/30', dot: 'bg-zinc-500' },
  error: { icon: XCircle, label: 'Error', color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/30', dot: 'bg-red-500' },
};

export default function WhatsAppNumbersPage() {
  const { isAdmin } = useAuth();
  const [instances, setInstances] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newInstanceId, setNewInstanceId] = useState('');
  const [creating, setCreating] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  // Fetch agents for the dropdown
  const fetchAgents = useCallback(async () => {
    try {
      const r = await axios.get(`${SERVER_URL}/api/agents`);
      setAgents(r.data || []);
    } catch (e) { console.error(e); }
  }, []);

  // Fetch instances via REST (initial load)
  const fetchInstances = useCallback(async () => {
    try {
      const r = await axios.get(`${SERVER_URL}/api/baileys/instances`);
      setInstances(r.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  // WebSocket connection for real-time updates
  const connectWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) return;

    const ws = new WebSocket(`${WS_URL}/baileys`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[BaileysWS] Connected');
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);

        if (data.type === 'initial') {
          setInstances(data.instances || []);
          setLoading(false);
        } else if (data.type === 'qr') {
          setInstances(prev => prev.map(inst =>
            inst.instanceId === data.instanceId
              ? { ...inst, qrCode: data.qr, status: 'scan_qr' }
              : inst
          ));
        } else if (data.type === 'connectionUpdate') {
          setInstances(prev => prev.map(inst =>
            inst.instanceId === data.instanceId
              ? { ...inst, status: data.status, phoneNumber: data.phoneNumber || inst.phoneNumber, qrCode: data.status === 'connected' ? null : inst.qrCode }
              : inst
          ));
        } else if (data.type === 'instanceRemoved') {
          setInstances(prev => prev.filter(inst => inst.instanceId !== data.instanceId));
        }
      } catch (e) {
        console.error('[BaileysWS] Parse error:', e);
      }
    };

    ws.onclose = () => {
      console.log('[BaileysWS] Disconnected');
      reconnectTimerRef.current = setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (err) => {
      console.error('[BaileysWS] Error:', err);
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetchAgents();
    fetchInstances();
    connectWebSocket();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [isAdmin, fetchAgents, fetchInstances, connectWebSocket]);

  const createInstance = async () => {
    if (!newInstanceId.trim()) return;
    setCreating(true);
    try {
      await axios.post(`${SERVER_URL}/api/baileys/instance`, { instanceId: newInstanceId.trim() });
      setNewInstanceId('');
      setShowNew(false);
      fetchInstances();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    } finally {
      setCreating(false);
    }
  };

  const removeInstance = async (instanceId) => {
    if (!confirm(`Disconnect and remove "${instanceId}"? This will log out the WhatsApp session.`)) return;
    try {
      await axios.delete(`${SERVER_URL}/api/baileys/instance/${instanceId}`);
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const reconnectInstance = async (instanceId) => {
    try {
      await axios.post(`${SERVER_URL}/api/baileys/instance/${instanceId}/reconnect`);
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const assignAgent = async (instanceId, agentId) => {
    try {
      await axios.put(`${SERVER_URL}/api/baileys/instance/${instanceId}/agent`, { agentId });
      setInstances(prev => prev.map(inst =>
        inst.instanceId === instanceId ? { ...inst, agentId } : inst
      ));
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  if (!isAdmin) return <div className="p-6 text-muted-foreground">Admins only.</div>;

  const connectedCount = instances.filter(i => i.status === 'connected').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MessageCircle className="w-6 h-6" /> WhatsApp Connect
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect WhatsApp numbers via QR code scan. No API keys needed — just scan with your phone.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={connectedCount > 0 ? 'emerald' : 'neutral'} dot>
            {connectedCount} connected
          </Badge>
          <Button onClick={() => setShowNew(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Connection
          </Button>
        </div>
      </div>

      {/* New instance form */}
      {showNew && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Connection Name</label>
                <Input
                  value={newInstanceId}
                  onChange={e => setNewInstanceId(e.target.value)}
                  placeholder="e.g. my-business-wa"
                  onKeyDown={e => e.key === 'Enter' && createInstance()}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">A unique name for this WhatsApp connection. Use lowercase letters, numbers, and hyphens.</p>
              </div>
              <Button onClick={createInstance} disabled={creating || !newInstanceId.trim()}>
                {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
                Connect
              </Button>
              <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading connections…
        </div>
      )}

      {/* Empty state */}
      {!loading && instances.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
              <QrCode className="w-8 h-8 text-primary" />
            </div>
            <div className="font-semibold text-lg mb-1">No WhatsApp connections</div>
            <div className="text-sm text-muted-foreground max-w-md mx-auto">
              Click "New Connection" to add a WhatsApp number. You'll scan a QR code with your phone to connect instantly — no API keys or external services needed.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instance cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {instances.map(inst => (
          <InstanceCard
            key={inst.instanceId}
            instance={inst}
            agents={agents}
            onRemove={removeInstance}
            onReconnect={reconnectInstance}
            onAssignAgent={assignAgent}
          />
        ))}
      </div>
    </div>
  );
}

function InstanceCard({ instance, agents, onRemove, onReconnect, onAssignAgent }) {
  const statusKey = instance.status || 'disconnected';
  const cfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.disconnected;
  const StatusIcon = cfg.icon;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot} animate-pulse`} />
            <div>
              <CardTitle className="text-base font-semibold">{instance.instanceId}</CardTitle>
              {instance.phoneNumber && (
                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3" /> +{instance.phoneNumber}
                </div>
              )}
            </div>
          </div>
          <div className={`px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color} flex items-center gap-1`}>
            <StatusIcon className="w-3 h-3" />
            {cfg.label}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* QR Code display */}
        {statusKey === 'scan_qr' && instance.qrCode && (
          <div className="flex flex-col items-center py-4">
            <div className="bg-white p-4 rounded-xl shadow-lg">
              <QRCodeSVG
                value={instance.qrCode}
                size={220}
                level="M"
                includeMargin={false}
              />
            </div>
            <div className="mt-3 text-center">
              <p className="text-sm font-medium">Scan with WhatsApp</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Open WhatsApp → Settings → Linked Devices → Link a Device
              </p>
            </div>
          </div>
        )}

        {/* Connected state */}
        {statusKey === 'connected' && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-emerald-600">WhatsApp Connected</p>
              <p className="text-xs text-muted-foreground">
                Receiving messages on +{instance.phoneNumber || 'unknown'}
              </p>
            </div>
          </div>
        )}

        {/* Disconnected state */}
        {statusKey === 'disconnected' && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <WifiOff className="w-5 h-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">Connection is offline</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onReconnect(instance.instanceId)}>
              <RefreshCcw className="w-3.5 h-3.5 mr-1" /> Reconnect
            </Button>
          </div>
        )}

        {/* Agent assignment */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Bot className="w-3 h-3" /> Assigned Agent
          </label>
          <select
            value={instance.agentId || ''}
            onChange={e => onAssignAgent(instance.instanceId, e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <option value="">— No agent assigned —</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          {!instance.agentId && (
            <p className="text-[11px] text-amber-600">
              ⚠ Assign an agent to auto-reply to incoming messages.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1 border-t border-border">
          {statusKey === 'disconnected' && (
            <Button size="sm" variant="outline" className="flex-1" onClick={() => onReconnect(instance.instanceId)}>
              <RefreshCcw className="w-3.5 h-3.5 mr-1" /> Reconnect
            </Button>
          )}
          <Button size="sm" variant="destructive" onClick={() => onRemove(instance.instanceId)}>
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
