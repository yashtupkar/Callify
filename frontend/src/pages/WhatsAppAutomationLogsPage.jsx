import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Bug,
  CheckCircle,
  ChevronDown,
  FileText,
  Loader2,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  Search,
  Settings,
  Terminal,
  Zap,
} from 'lucide-react';
import { SERVER_URL } from '@/lib/constants';
import { useAuth } from '@/hooks/useAuth';
import { useParams } from 'react-router-dom';

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'incoming', label: 'Incoming' },
  { id: 'auto_reply', label: 'Auto-reply' },
  { id: 'llm', label: 'AI' },
  { id: 'error', label: 'Errors' },
  { id: 'status', label: 'Status' },
];

const LEVEL_STYLES = {
  info: 'bg-zinc-800 text-zinc-200 border-zinc-700',
  warn: 'bg-zinc-800 text-zinc-200 border-zinc-700',
  error: 'bg-zinc-800 text-zinc-200 border-zinc-700',
  debug: 'bg-zinc-800 text-zinc-200 border-zinc-700',
};

const CATEGORY_STYLE = {
  message: { label: 'Incoming', badge: 'bg-zinc-800 text-zinc-200 border-zinc-700', arrow: '↓', arrowBg: 'bg-zinc-800 text-zinc-200' },
  auto_reply: { label: 'Auto-reply', badge: 'bg-zinc-800 text-zinc-200 border-zinc-700', arrow: '↑', arrowBg: 'bg-zinc-800 text-zinc-200' },
  llm: { label: 'AI', badge: 'bg-zinc-800 text-zinc-200 border-zinc-700', arrow: '→', arrowBg: 'bg-zinc-800 text-zinc-200' },
  tool: { label: 'Tool', badge: 'bg-zinc-800 text-zinc-200 border-zinc-700', arrow: '↗', arrowBg: 'bg-zinc-800 text-zinc-200' },
  error: { label: 'Error', badge: 'bg-zinc-800 text-zinc-200 border-zinc-700', arrow: '!', arrowBg: 'bg-zinc-800 text-zinc-200' },
  status: { label: 'Status', badge: 'bg-zinc-800 text-zinc-200 border-zinc-700', arrow: '→', arrowBg: 'bg-zinc-800 text-zinc-200' },
  default: { label: 'System', badge: 'bg-zinc-800 text-zinc-200 border-zinc-700', arrow: '→', arrowBg: 'bg-zinc-800 text-zinc-200' },
};

const EMPTY_STATS = { total: 0, byCategory: {}, byLevel: {} };

function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

function formatLogTime(value) {
  if (!value) return '--:--:--';
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function getLogMessage(log) {
  if (typeof log.message === 'string' && log.message.trim()) return log.message.trim();
  if (typeof log.event === 'string' && log.event.trim()) return log.event.trim();
  return 'No message recorded';
}

function getLogTypeLabel(log) {
  const style = CATEGORY_STYLE[log.category] || CATEGORY_STYLE.default;
  if (log.category === 'message') {
    return log.contactWaId ? log.contactWaId : style.label;
  }
  if (log.category === 'auto_reply') {
    return 'bot';
  }
  return style.label;
}

function getLogTone(log) {
  const categoryStyle = CATEGORY_STYLE[log.category] || CATEGORY_STYLE.default;
  const base = {
    badge: categoryStyle.badge,
    arrow: categoryStyle.arrow,
    arrowBg: categoryStyle.arrowBg,
    label: getLogTypeLabel(log),
  };

  if (log.category === 'message') {
    base.badge = 'bg-zinc-800 text-zinc-200 border-zinc-700';
    base.arrow = '↓';
  }

  if (log.category === 'auto_reply') {
    base.badge = 'bg-zinc-800 text-zinc-200 border-zinc-700';
    base.arrow = '↑';
  }

  if (log.category === 'llm') {
    base.badge = 'bg-zinc-800 text-zinc-200 border-zinc-700';
    base.arrow = '→';
  }

  if (log.category === 'status') {
    base.badge = 'bg-zinc-800 text-zinc-200 border-zinc-700';
    base.arrow = '→';
  }

  return base;
}

export default function WhatsAppAutomationLogsPage() {
  const { isAdmin } = useAuth();
  const { automationId } = useParams();
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [expandedLog, setExpandedLog] = useState(null);
  const [error, setError] = useState('');
  const intervalRef = useRef(null);
  const endRef = useRef(null);

  const loadLogs = async () => {
    if (!automationId) return;
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${SERVER_URL}/api/whatsapp-automation/${automationId}/logs?limit=200`);
      setLogs(response.data.logs || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (!automationId) return;
    try {
      const response = await axios.get(`${SERVER_URL}/api/whatsapp-automation/${automationId}/logs/stats`);
      setStats(response.data.stats || EMPTY_STATS);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadRecentLogs = async () => {
    if (!automationId) return;
    try {
      const response = await axios.get(`${SERVER_URL}/api/whatsapp-automation/${automationId}/logs/recent?limit=80`);
      setLogs(response.data.logs || []);
    } catch (err) {
      console.error('Failed to load recent logs:', err);
    }
  };

  useEffect(() => {
    if (!isAdmin || !automationId) return;
    loadLogs();
    loadStats();
  }, [isAdmin, automationId]);

  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return undefined;
    }

    intervalRef.current = setInterval(() => {
      loadRecentLogs();
      loadStats();
    }, 3000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, automationId]);

  useEffect(() => {
    if (!autoRefresh) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, autoRefresh]);

  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return logs.filter((log) => {
      const matchesTab = activeTab === 'all' || (activeTab === 'incoming' ? log.category === 'message' : log.category === activeTab || (activeTab === 'error' && log.level === 'error'));
      const matchesQuery = !query || [log.message, log.event, log.category, log.contactWaId, log.sessionId].some((value) => String(value || '').toLowerCase().includes(query));
      return matchesTab && matchesQuery;
    });
  }, [logs, activeTab, searchQuery]);

  const clearLogs = () => {
    setLogs([]);
    setExpandedLog(null);
  };

  if (!isAdmin) {
    return <div className="p-6 text-slate-300">Admins only.</div>;
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-200">
      <div className="mx-auto max-w-[1600px] px-4 py-5 lg:px-6">
        <header className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2 text-sm text-zinc-200">
            <span className={cn('h-2.5 w-2.5 rounded-full', autoRefresh ? 'bg-zinc-300 shadow-[0_0_12px_rgba(255,255,255,0.35)]' : 'bg-zinc-600 shadow-[0_0_12px_rgba(255,255,255,0.15)]')} />
            <span>{autoRefresh ? 'Automation live — receiving traffic' : 'Automation paused — no live traffic'}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoRefresh((value) => !value)}
              className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-zinc-500"
            >
              {autoRefresh ? <PauseIcon /> : <PlayIcon />}
              {autoRefresh ? 'Pause stream' : 'Resume stream'}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-zinc-500"
            >
              <CheckCircle className="h-4 w-4" />
              Auto-scroll
            </button>
            <button
              type="button"
              onClick={clearLogs}
              className="rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-zinc-500"
            >
              Clear
            </button>
            <button
              type="button"
              className="rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-zinc-500"
            >
              Export JSON
            </button>
          </div>
        </header>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm transition',
                  activeTab === tab.id
                    ? 'border-zinc-600 bg-zinc-800 text-zinc-100 shadow-[0_0_0_1px_rgba(161,161,170,0.15)]'
                    : 'border-zinc-700 bg-zinc-900/70 text-zinc-300 hover:border-zinc-500'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex w-full max-w-md items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-300">
            <Search className="h-4 w-4 text-zinc-500" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search number, text, rule..."
              className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800 bg-[#09090b] shadow-[0_0_0_1px_rgba(24,24,27,0.8)]">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-[#09090b] px-4 py-3">
            <div className="text-sm text-zinc-300">Simulate a customer message, e.g. price kita hai?</div>
            <button
              type="button"
              className="rounded-md bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-950 transition hover:bg-zinc-100"
            >
              Send test webhook
            </button>
          </div>

          <div className="max-h-[760px] overflow-y-auto">
            {loading && logs.length === 0 ? (
              <div className="flex min-h-[260px] items-center justify-center text-zinc-400">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-300" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-zinc-400">
                <Terminal className="h-8 w-8 text-zinc-500" />
                <div className="text-sm">No matching logs.</div>
              </div>
            ) : (
              filteredLogs.map((log) => {
                const tone = getLogTone(log);
                const message = getLogMessage(log);
                const metaText = log.metadata && Object.keys(log.metadata).length ? Object.keys(log.metadata).join(', ') : log.event || log.category;

                return (
                  <div key={log.id} className="border-b border-zinc-800 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setExpandedLog((value) => value === log.id ? null : log.id)}
                      className="grid w-full cursor-pointer grid-cols-[118px_150px_1fr_200px] items-center gap-4 px-3 py-2.5 text-left transition hover:bg-zinc-800/40"
                    >
                      <div className="font-mono text-[11px] text-zinc-500">{formatLogTime(log.createdAt)}</div>

                      <div className="flex items-center gap-2">
                        <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-md text-xs', tone.arrowBg)}>{tone.arrow}</span>
                        <span className={cn('rounded-full border px-2 py-1 text-[11px] font-medium uppercase tracking-[0.08em]', tone.badge)}>
                          {tone.label}
                        </span>
                      </div>

                      <div className="min-w-0 pr-4 text-sm text-zinc-200">
                        <span className="line-clamp-2 break-all">{message}</span>
                      </div>

                      <div className="text-right text-[11px] text-zinc-500">
                        {metaText}
                      </div>
                    </button>

                    {expandedLog === log.id && (
                      <div className="border-t border-zinc-800 bg-zinc-950/40 px-4 py-3 text-xs text-zinc-300">
                        <div className="grid gap-2 md:grid-cols-3">
                          <div>
                            <div className="mb-1 text-zinc-500">Level</div>
                            <div className={cn('inline-flex rounded-full border px-2 py-1 text-[11px] uppercase', LEVEL_STYLES[log.level] || LEVEL_STYLES.info)}>{log.level}</div>
                          </div>
                          <div>
                            <div className="mb-1 text-zinc-500">Category</div>
                            <div className="text-zinc-200">{log.category}</div>
                          </div>
                          <div>
                            <div className="mb-1 text-zinc-500">Session</div>
                            <div className="font-mono text-zinc-200">{log.sessionId || 'n/a'}</div>
                          </div>
                        </div>

                        {log.metadata && (
                          <pre className="mt-3 overflow-x-auto rounded-md border border-zinc-800 bg-zinc-900/80 p-3 text-[11px] text-zinc-300 whitespace-pre-wrap break-all">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={endRef} />
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function PauseIcon() {
  return (
    <span className="flex h-4 w-4 items-center justify-center gap-0.5 text-[10px]">
      <span className="h-3 w-0.5 rounded-full bg-current" />
      <span className="h-3 w-0.5 rounded-full bg-current" />
    </span>
  );
}

function PlayIcon() {
  return <ArrowDownLeft className="h-4 w-4" />;
}
