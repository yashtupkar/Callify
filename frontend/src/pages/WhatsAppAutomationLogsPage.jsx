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
  info: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
  warn: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  error: 'bg-red-500/10 text-red-300 border-red-500/20',
  debug: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
};

const CATEGORY_STYLE = {
  message: { label: 'Incoming', badge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20', arrow: '↓', arrowBg: 'bg-cyan-500/10 text-cyan-300' },
  auto_reply: { label: 'Auto-reply', badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20', arrow: '↑', arrowBg: 'bg-emerald-500/10 text-emerald-300' },
  llm: { label: 'AI', badge: 'bg-violet-500/10 text-violet-300 border-violet-500/20', arrow: '→', arrowBg: 'bg-violet-500/10 text-violet-300' },
  tool: { label: 'Tool', badge: 'bg-amber-500/10 text-amber-300 border-amber-500/20', arrow: '↗', arrowBg: 'bg-amber-500/10 text-amber-300' },
  error: { label: 'Error', badge: 'bg-red-500/10 text-red-300 border-red-500/20', arrow: '!', arrowBg: 'bg-red-500/10 text-red-300' },
  status: { label: 'Status', badge: 'bg-slate-500/10 text-slate-200 border-slate-500/20', arrow: '→', arrowBg: 'bg-slate-500/10 text-slate-300' },
  default: { label: 'System', badge: 'bg-slate-500/10 text-slate-200 border-slate-500/20', arrow: '→', arrowBg: 'bg-slate-500/10 text-slate-300' },
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
    base.badge = 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20';
    base.arrow = '↓';
  }

  if (log.category === 'auto_reply') {
    base.badge = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
    base.arrow = '↑';
  }

  if (log.category === 'llm') {
    base.badge = 'bg-violet-500/10 text-violet-300 border-violet-500/20';
    base.arrow = '→';
  }

  if (log.category === 'status') {
    base.badge = 'bg-slate-500/10 text-slate-200 border-slate-500/20';
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
    <div className="min-h-screen bg-[#050b12] text-slate-200">
      <div className="mx-auto max-w-[1600px] px-4 py-5 lg:px-6">
        <header className="flex items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2 text-sm text-slate-200">
            <span className={cn('h-2.5 w-2.5 rounded-full', autoRefresh ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]' : 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.8)]')} />
            <span>{autoRefresh ? 'Automation live — receiving traffic' : 'Automation paused — no live traffic'}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoRefresh((value) => !value)}
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-500"
            >
              {autoRefresh ? <PauseIcon /> : <PlayIcon />}
              {autoRefresh ? 'Pause stream' : 'Resume stream'}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-500"
            >
              <CheckCircle className="h-4 w-4" />
              Auto-scroll
            </button>
            <button
              type="button"
              onClick={clearLogs}
              className="rounded-md border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-500"
            >
              Clear
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-500"
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
                    ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200 shadow-[0_0_0_1px_rgba(34,211,238,0.15)]'
                    : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex w-full max-w-md items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search number, text, rule..."
              className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-slate-800 bg-[#0a1016] shadow-[0_0_0_1px_rgba(15,23,42,0.8)]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-[#0a1016] px-4 py-3">
            <div className="text-sm text-slate-300">Simulate a customer message, e.g. price kita hai?</div>
            <button
              type="button"
              className="rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
            >
              Send test webhook
            </button>
          </div>

          <div className="max-h-[760px] overflow-y-auto">
            {loading && logs.length === 0 ? (
              <div className="flex min-h-[260px] items-center justify-center text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-slate-400">
                <Terminal className="h-8 w-8 text-slate-500" />
                <div className="text-sm">No matching logs.</div>
              </div>
            ) : (
              filteredLogs.map((log) => {
                const tone = getLogTone(log);
                const message = getLogMessage(log);
                const metaText = log.metadata && Object.keys(log.metadata).length ? Object.keys(log.metadata).join(', ') : log.event || log.category;

                return (
                  <div key={log.id} className="border-b border-slate-800 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setExpandedLog((value) => value === log.id ? null : log.id)}
                      className="grid w-full cursor-pointer grid-cols-[118px_150px_1fr_200px] items-center gap-4 px-3 py-2.5 text-left transition hover:bg-slate-800/40"
                    >
                      <div className="font-mono text-[11px] text-slate-500">{formatLogTime(log.createdAt)}</div>

                      <div className="flex items-center gap-2">
                        <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-md text-xs', tone.arrowBg)}>{tone.arrow}</span>
                        <span className={cn('rounded-full border px-2 py-1 text-[11px] font-medium uppercase tracking-[0.08em]', tone.badge)}>
                          {tone.label}
                        </span>
                      </div>

                      <div className="min-w-0 pr-4 text-sm text-slate-200">
                        <span className="line-clamp-2 break-all">{message}</span>
                      </div>

                      <div className="text-right text-[11px] text-slate-500">
                        {metaText}
                      </div>
                    </button>

                    {expandedLog === log.id && (
                      <div className="border-t border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-300">
                        <div className="grid gap-2 md:grid-cols-3">
                          <div>
                            <div className="mb-1 text-slate-500">Level</div>
                            <div className={cn('inline-flex rounded-full border px-2 py-1 text-[11px] uppercase', LEVEL_STYLES[log.level] || LEVEL_STYLES.info)}>{log.level}</div>
                          </div>
                          <div>
                            <div className="mb-1 text-slate-500">Category</div>
                            <div className="text-slate-200">{log.category}</div>
                          </div>
                          <div>
                            <div className="mb-1 text-slate-500">Session</div>
                            <div className="font-mono text-slate-200">{log.sessionId || 'n/a'}</div>
                          </div>
                        </div>

                        {log.metadata && (
                          <pre className="mt-3 overflow-x-auto rounded-md border border-slate-800 bg-slate-900/70 p-3 text-[11px] text-slate-300 whitespace-pre-wrap break-all">
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
