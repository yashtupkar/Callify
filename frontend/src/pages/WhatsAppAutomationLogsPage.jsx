import { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  MessageCircle, RefreshCw, Filter, X, ChevronDown,
  Loader2, AlertCircle, CheckCircle, Zap, MessageSquare, FileText, Settings, Bug, Terminal
} from 'lucide-react';
import { SERVER_URL } from '@/lib/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/data-badge';

import { useAuth } from '@/hooks/useAuth';
import { useParams } from 'react-router-dom';

const LEVEL_COLORS = {
  info: 'bg-blue-100 text-blue-800 border-blue-200',
  warn: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  error: 'bg-red-100 text-red-800 border-red-200',
  debug: 'bg-gray-100 text-gray-800 border-gray-200',
};

const LEVEL_ICONS = {
  info: MessageCircle,
  warn: AlertCircle,
  error: CheckCircle,
  debug: Bug,
};

const CATEGORY_ICONS = {
  system: Settings,
  message: MessageSquare,
  tool: Zap,
  auto_reply: MessageCircle,
  llm: Terminal,
  error: AlertCircle,
  status: FileText,
};

export default function WhatsAppAutomationLogsPage() {
  const { isAdmin } = useAuth();
  const { automationId } = useParams();
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ total: 0, byCategory: {}, byLevel: {} });
  const [loading, setLoading] = useState(false);
  const [_loadingStats, setLoadingStats] = useState(false);
  const [filters, setFilters] = useState({
    level: '',
    category: '',
    sessionId: '',
    since: '',
    limit: 100,
  });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [error, setError] = useState('');
  const [expandedLog, setExpandedLog] = useState(null);
  const intervalRef = useRef(null);
  const logEndRef = useRef(null);

  const loadLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.level) params.append('level', filters.level);
      if (filters.category) params.append('category', filters.category);
      if (filters.sessionId) params.append('sessionId', filters.sessionId);
      if (filters.since) params.append('since', filters.since);
      if (filters.limit) params.append('limit', filters.limit);

      const response = await axios.get(`${SERVER_URL}/api/whatsapp-automation/${automationId}/logs?${params}`);
      setLogs(response.data.logs || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const response = await axios.get(`${SERVER_URL}/api/whatsapp-automation/${automationId}/logs/stats`);
      setStats(response.data.stats || { total: 0, byCategory: {}, byLevel: {} });
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadRecentLogs = async () => {
    try {
      const response = await axios.get(`${SERVER_URL}/api/whatsapp-automation/${automationId}/logs/recent?limit=100`);
      setLogs(response.data.logs || []);
    } catch (err) {
      console.error('Failed to load recent logs:', err);
    }
  };

  useEffect(() => {
    if (!isAdmin || !automationId) return;
    loadLogs();
    loadStats();
  }, [isAdmin, automationId, filters]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        loadRecentLogs();
        loadStats();
      }, 3000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, automationId]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({ level: '', category: '', sessionId: '', since: '', limit: 100 });
  };

  const scrollToBottom = () => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTimestamp = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const formatMetadata = (metadata) => {
    if (!metadata) return null;
    try {
      return JSON.stringify(metadata, null, 2);
    } catch {
      return String(metadata);
    }
  };

  if (!isAdmin) return <div className="p-6 text-muted-foreground">Admins only.</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Terminal className="w-6 h-6 text-emerald-500" /> Live Automation Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time logging for WhatsApp automation. Logs are saved to database and streamed live.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="flex items-center gap-2"
          >
            <Loader2 className={cn(autoRefresh && 'animate-spin')} /> {autoRefresh ? 'Live' : 'Start Live'}
          </Button>
          <Button variant="outline" onClick={() => { loadLogs(); loadStats(); }}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <Card className="bg-emerald-50 border-emerald-200">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard label="Total Logs" value={stats.total} icon={FileText} color="emerald" />
            <StatCard label="Errors" value={stats.byLevel?.error || 0} icon={AlertCircle} color="red" />
            <StatCard label="Warnings" value={stats.byLevel?.warn || 0} icon={AlertCircle} color="yellow" />
            <StatCard label="Info" value={stats.byLevel?.info || 0} icon={MessageCircle} color="blue" />
            <StatCard label="Debug" value={stats.byLevel?.debug || 0} icon={Bug} color="gray" />
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-muted-foreground">
            <div>Messages: {stats.byCategory?.message || 0}</div>
            <div>Tools: {stats.byCategory?.tool || 0}</div>
            <div>Auto-replies: {stats.byCategory?.auto_reply || 0}</div>
            <div>LLM: {stats.byCategory?.llm || 0}</div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 rounded-md text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={filters.level}
                onChange={(e) => handleFilterChange('level', e.target.value)}
                className="w-[140px] border rounded-md px-2 py-1.5 text-xs bg-background"
              >
                <option value="">All Levels</option>
                <option value="info">Info</option>
                <option value="warn">Warning</option>
                <option value="error">Error</option>
                <option value="debug">Debug</option>
              </select>
              <select
                value={filters.category}
                onChange={(e) => handleFilterChange('category', e.target.value)}
                className="w-[160px] border rounded-md px-2 py-1.5 text-xs bg-background"
              >
                <option value="">All Categories</option>
                <option value="system">System</option>
                <option value="message">Message</option>
                <option value="tool">Tool</option>
                <option value="auto_reply">Auto Reply</option>
                <option value="llm">LLM</option>
                <option value="error">Error</option>
                <option value="status">Status</option>
              </select>
              <Input
                placeholder="Session ID (optional)"
                value={filters.sessionId}
                onChange={(e) => handleFilterChange('sessionId', e.target.value)}
                className="w-[200px]"
              />
              <Input
                type="datetime-local"
                placeholder="Since"
                value={filters.since}
                onChange={(e) => handleFilterChange('since', e.target.value)}
                className="w-[200px]"
              />
              <Input
                type="number"
                placeholder="Limit"
                value={filters.limit}
                onChange={(e) => handleFilterChange('limit', parseInt(e.target.value) || 100)}
                className="w-[80px]"
              />
              {(filters.level || filters.category || filters.sessionId || filters.since) && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="w-4 h-4 mr-1" /> Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Log Entries ({logs.length})</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={scrollToBottom} disabled={loading}>
              <ChevronDown className="w-4 h-4 mr-1" /> Bottom
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground space-y-2">
              <Terminal className="w-12 h-12 mx-auto text-muted-foreground/50" />
              <div className="font-medium">No Logs Found</div>
              <div className="text-xs">Adjust filters or wait for automation activity.</div>
            </div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50 border-b">
                  <tr>
                    <th className="p-2 text-left font-medium text-xs uppercase text-muted-foreground w-40">Time</th>
                    <th className="p-2 text-left font-medium text-xs uppercase text-muted-foreground w-24">Level</th>
                    <th className="p-2 text-left font-medium text-xs uppercase text-muted-foreground w-28">Category</th>
                    <th className="p-2 text-left font-medium text-xs uppercase text-muted-foreground">Event</th>
                    <th className="p-2 text-left font-medium text-xs uppercase text-muted-foreground flex-1">Message</th>
                    <th className="p-2 text-left font-medium text-xs uppercase text-muted-foreground w-32">Session</th>
                    <th className="p-2 text-right font-medium text-xs uppercase text-muted-foreground w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <LogRow
                      key={log.id}
                      log={log}
                      expanded={expandedLog === log.id}
                      onToggle={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                      formatTimestamp={formatTimestamp}
                      formatMetadata={formatMetadata}
                    />
                  ))}
                  <tr>
                    <td colSpan={7} ref={logEndRef} />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  const colorMap = {
    emerald: 'text-emerald-600 bg-emerald-100',
    red: 'text-red-600 bg-red-100',
    yellow: 'text-yellow-600 bg-yellow-100',
    blue: 'text-blue-600 bg-blue-100',
    gray: 'text-gray-600 bg-gray-100',
  };
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-white">
      <div className={`p-2 rounded-lg ${colorMap[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function LogRow({ log, expanded, onToggle, formatTimestamp, formatMetadata }) {
  const LevelIcon = LEVEL_ICONS[log.level] || MessageCircle;
  const CategoryIcon = CATEGORY_ICONS[log.category] || Settings;

  return (
    <>
      <tr
        className={`border-b transition-colors hover:bg-muted/30 cursor-pointer ${expanded ? 'bg-muted/50' : ''}`}
        onClick={onToggle}
      >
        <td className="p-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
          {formatTimestamp(log.createdAt)}
        </td>
        <td className="p-2">
          <div className="flex items-center gap-1">
            <LevelIcon className="w-3 h-3" />
            <Badge className={LEVEL_COLORS[log.level] || LEVEL_COLORS.info}>
              {log.level.toUpperCase()}
            </Badge>
          </div>
        </td>
        <td className="p-2">
          <div className="flex items-center gap-1">
            <CategoryIcon className="w-3 h-3 text-muted-foreground" />
            <Badge tone="neutral" className="capitalize text-[10px]">
              {log.category.replace('_', ' ')}
            </Badge>
          </div>
        </td>
        <td className="p-2 font-mono text-xs text-primary max-w-[180px] truncate">{log.event}</td>
        <td className="p-2 text-muted-foreground max-w-[300px] truncate" title={log.message}>
          {log.message}
        </td>
        <td className="p-2 font-mono text-xs text-muted-foreground max-w-[24px] truncate">
          {log.sessionId ? log.sessionId.slice(0, 8) : '—'}
        </td>
        <td className="p-2 text-right">
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/30">
          <td colSpan={7} className="p-4">
            <div className="space-y-3 text-xs font-mono bg-background border rounded p-3">
              {log.metadata && (
                <div>
                  <div className="text-muted-foreground mb-1">Metadata:</div>
                  <pre className="whitespace-pre-wrap break-all text-[10px]">{formatMetadata(log.metadata)}</pre>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-muted-foreground">
                <div><span className="font-medium">ID:</span> {log.id}</div>
                <div><span className="font-medium">Automation:</span> {log.automationId?.slice(0, 8)}</div>
                <div><span className="font-medium">Connection:</span> {log.connectionId?.slice(0, 8) || '—'}</div>
                <div><span className="font-medium">Contact:</span> {log.contactWaId || '—'}</div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}
