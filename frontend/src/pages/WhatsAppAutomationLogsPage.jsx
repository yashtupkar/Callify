// import { useEffect, useMemo, useRef, useState } from 'react';
// import axios from 'axios';
// import {
//   AlertCircle,
//   ArrowDownLeft,
//   ArrowUpRight,
//   Bug,
//   CheckCircle,
//   ChevronDown,
//   FileText,
//   Loader2,
//   MessageCircle,
//   MessageSquare,
//   RefreshCw,
//   Search,
//   Settings,
//   Terminal,
//   Zap,
// } from 'lucide-react';
// import { SERVER_URL } from '@/lib/constants';
// import { useAuth } from '@/hooks/useAuth';
// import { useParams } from 'react-router-dom';

// const FILTER_TABS = [
//   { id: 'all', label: 'All' },
//   { id: 'incoming', label: 'Incoming' },
//   { id: 'auto_reply', label: 'Auto-reply' },
//   { id: 'llm', label: 'AI' },
//   { id: 'error', label: 'Errors' },
//   { id: 'status', label: 'Status' },
// ];

// const LEVEL_STYLES = {
//   info: 'bg-zinc-800 text-zinc-200 border-zinc-700',
//   warn: 'bg-zinc-800 text-zinc-200 border-zinc-700',
//   error: 'bg-zinc-800 text-zinc-200 border-zinc-700',
//   debug: 'bg-zinc-800 text-zinc-200 border-zinc-700',
// };

// const CATEGORY_STYLE = {
//   message: { label: 'Incoming', badge: 'bg-zinc-800 text-zinc-200 border-zinc-700', arrow: '↓', arrowBg: 'bg-zinc-800 text-zinc-200' },
//   auto_reply: { label: 'Auto-reply', badge: 'bg-zinc-800 text-zinc-200 border-zinc-700', arrow: '↑', arrowBg: 'bg-zinc-800 text-zinc-200' },
//   llm: { label: 'AI', badge: 'bg-zinc-800 text-zinc-200 border-zinc-700', arrow: '→', arrowBg: 'bg-zinc-800 text-zinc-200' },
//   tool: { label: 'Tool', badge: 'bg-zinc-800 text-zinc-200 border-zinc-700', arrow: '↗', arrowBg: 'bg-zinc-800 text-zinc-200' },
//   error: { label: 'Error', badge: 'bg-zinc-800 text-zinc-200 border-zinc-700', arrow: '!', arrowBg: 'bg-zinc-800 text-zinc-200' },
//   status: { label: 'Status', badge: 'bg-zinc-800 text-zinc-200 border-zinc-700', arrow: '→', arrowBg: 'bg-zinc-800 text-zinc-200' },
//   default: { label: 'System', badge: 'bg-zinc-800 text-zinc-200 border-zinc-700', arrow: '→', arrowBg: 'bg-zinc-800 text-zinc-200' },
// };

// const EMPTY_STATS = { total: 0, byCategory: {}, byLevel: {} };

// function cn(...classes) {
//   return classes.filter(Boolean).join(' ');
// }

// function formatLogTime(value) {
//   if (!value) return '--:--:--';
//   const date = new Date(value);
//   return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
// }

// function getLogMessage(log) {
//   if (typeof log.message === 'string' && log.message.trim()) return log.message.trim();
//   if (typeof log.event === 'string' && log.event.trim()) return log.event.trim();
//   return 'No message recorded';
// }

// function getLogKey(log) {
//   return log.id || `${log.createdAt}-${log.category}-${log.event}-${log.contactWaId || ''}`;
// }

// function getLogTone(log) {
//   const base = 'border-zinc-700 bg-zinc-800 text-zinc-200';
//   if (log.category === 'message' && log.event === 'outgoing') {
//     return { badge: 'border-sky-500/40 bg-sky-500/15 text-sky-300', arrow: '↑', arrowBg: 'bg-sky-500/15 text-sky-300', label: 'Outgoing' };
//   }
//   if (log.category === 'message') {
//     return { badge: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300', arrow: '↓', arrowBg: 'bg-emerald-500/15 text-emerald-300', label: log.contactWaId ? `Incoming · ${log.contactWaId}` : 'Incoming' };
//   }
//   if (log.category === 'auto_reply') {
//     const failed = log.event === 'send_failed';
//     return {
//       badge: failed ? 'border-red-500/40 bg-red-500/15 text-red-300' : 'border-violet-500/40 bg-violet-500/15 text-violet-300',
//       arrow: '↻',
//       arrowBg: failed ? 'bg-red-500/15 text-red-300' : 'bg-violet-500/15 text-violet-300',
//       label: failed ? 'Auto-reply failed' : 'Auto-reply',
//     };
//   }
//   const style = CATEGORY_STYLE[log.category] || CATEGORY_STYLE.default;
//   return { badge: base, arrow: style.arrow, arrowBg: style.arrowBg, label: style.label };
// }
// export default function WhatsAppAutomationLogsPage() {
//   const { isAdmin } = useAuth();
//   const { automationId } = useParams();
//   const [logs, setLogs] = useState([]);
//   const [stats, setStats] = useState(EMPTY_STATS);
//   const [loading, setLoading] = useState(false);
//   const [autoRefresh, setAutoRefresh] = useState(false);
//   const [searchQuery, setSearchQuery] = useState('');
//   const [activeTab, setActiveTab] = useState('all');
//   const [expandedLog, setExpandedLog] = useState(null);
//   const [error, setError] = useState('');
//   const intervalRef = useRef(null);
//   const endRef = useRef(null);

//   const loadLogs = async () => {
//     if (!automationId) return;
//     setLoading(true);
//     setError('');
//     try {
//       const response = await axios.get(`${SERVER_URL}/api/whatsapp-automation/${automationId}/logs?limit=200`);
//       setLogs(response.data.logs || []);
//     } catch (err) {
//       setError(err.response?.data?.error || err.message);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const loadStats = async () => {
//     if (!automationId) return;
//     try {
//       const response = await axios.get(`${SERVER_URL}/api/whatsapp-automation/${automationId}/logs/stats`);
//       setStats(response.data.stats || EMPTY_STATS);
//     } catch (err) {
//       console.error('Failed to load stats:', err);
//     }
//   };

//   const loadRecentLogs = async () => {
//     if (!automationId) return;
//     try {
//       const response = await axios.get(`${SERVER_URL}/api/whatsapp-automation/${automationId}/logs/recent?limit=80`);
//       setLogs(response.data.logs || []);
//     } catch (err) {
//       console.error('Failed to load recent logs:', err);
//     }
//   };

//   useEffect(() => {
//     if (!isAdmin || !automationId) return;
//     loadLogs();
//     loadStats();
//   }, [isAdmin, automationId]);

//   useEffect(() => {
//     if (!autoRefresh) {
//       if (intervalRef.current) {
//         clearInterval(intervalRef.current);
//         intervalRef.current = null;
//       }
//       return undefined;
//     }

//     intervalRef.current = setInterval(() => {
//       loadRecentLogs();
//       loadStats();
//     }, 3000);

//     return () => {
//       if (intervalRef.current) {
//         clearInterval(intervalRef.current);
//         intervalRef.current = null;
//       }
//     };
//   }, [autoRefresh, automationId]);

//   useEffect(() => {
//     if (!autoRefresh) return;
//     endRef.current?.scrollIntoView({ behavior: 'smooth' });
//   }, [logs, autoRefresh]);

//   const filteredLogs = useMemo(() => {
//     const query = searchQuery.trim().toLowerCase();
//     return logs.filter((log) => {
//       const matchesTab = activeTab === 'all' || (activeTab === 'incoming' ? log.category === 'message' : log.category === activeTab || (activeTab === 'error' && log.level === 'error'));
//       const matchesQuery = !query || [log.message, log.event, log.category, log.contactWaId, log.sessionId].some((value) => String(value || '').toLowerCase().includes(query));
//       return matchesTab && matchesQuery;
//     });
//   }, [logs, activeTab, searchQuery]);

//   const clearLogs = () => {
//     setLogs([]);
//     setExpandedLog(null);
//   };

//   if (!isAdmin) {
//     return <div className="p-6 text-slate-300">Admins only.</div>;
//   }

//   return (
//     <div className="min-h-screen bg-[#050505] text-zinc-200">
//       <div className="mx-auto max-w-[1600px] px-4 py-5 lg:px-6">
//         <header className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-4">
//           <div className="flex items-center gap-2 text-sm text-zinc-200">
//             <span className={cn('h-2.5 w-2.5 rounded-full', autoRefresh ? 'bg-zinc-300 shadow-[0_0_12px_rgba(255,255,255,0.35)]' : 'bg-zinc-600 shadow-[0_0_12px_rgba(255,255,255,0.15)]')} />
//             <span>{autoRefresh ? 'Automation live — receiving traffic' : 'Automation paused — no live traffic'}</span>
//           </div>

//           <div className="flex items-center gap-2">
//             <button
//               type="button"
//               onClick={() => setAutoRefresh((value) => !value)}
//               className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-zinc-500"
//             >
//               {autoRefresh ? <PauseIcon /> : <PlayIcon />}
//               {autoRefresh ? 'Pause stream' : 'Resume stream'}
//             </button>
//             <button
//               type="button"
//               className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-zinc-500"
//             >
//               <CheckCircle className="h-4 w-4" />
//               Auto-scroll
//             </button>
//             <button
//               type="button"
//               onClick={clearLogs}
//               className="rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-zinc-500"
//             >
//               Clear
//             </button>
//             <button
//               type="button"
//               className="rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-zinc-500"
//             >
//               Export JSON
//             </button>
//           </div>
//         </header>

//         <div className="mt-5 flex flex-wrap items-center gap-3">
//           <div className="flex flex-wrap gap-2">
//             {FILTER_TABS.map((tab) => (
//               <button
//                 key={tab.id}
//                 type="button"
//                 onClick={() => setActiveTab(tab.id)}
//                 className={cn(
//                   'rounded-full border px-3 py-1.5 text-sm transition',
//                   activeTab === tab.id
//                     ? 'border-zinc-600 bg-zinc-800 text-zinc-100 shadow-[0_0_0_1px_rgba(161,161,170,0.15)]'
//                     : 'border-zinc-700 bg-zinc-900/70 text-zinc-300 hover:border-zinc-500'
//                 )}
//               >
//                 {tab.label}
//               </button>
//             ))}
//           </div>

//           <div className="ml-auto flex w-full max-w-md items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-300">
//             <Search className="h-4 w-4 text-zinc-500" />
//             <input
//               value={searchQuery}
//               onChange={(event) => setSearchQuery(event.target.value)}
//               placeholder="Search number, text, rule..."
//               className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
//             />
//           </div>
//         </div>

//         <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800 bg-[#09090b] shadow-[0_0_0_1px_rgba(24,24,27,0.8)]">
//           <div className="max-h-[760px] overflow-y-auto">
//             {loading && logs.length === 0 ? (
//               <div className="flex min-h-[260px] items-center justify-center text-zinc-400">
//                 <Loader2 className="h-6 w-6 animate-spin text-zinc-300" />
//               </div>
//             ) : filteredLogs.length === 0 ? (
//               <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-zinc-400">
//                 <Terminal className="h-8 w-8 text-zinc-500" />
//                 <div className="text-sm">No matching logs.</div>
//               </div>
//             ) : (
//               filteredLogs.map((log) => {
//                 const tone = getLogTone(log);
//                 const message = getLogMessage(log);
//                 const metaText = log.metadata && Object.keys(log.metadata).length ? Object.keys(log.metadata).join(', ') : log.event || log.category;

//                 return (
//                   <div key={getLogKey(log)} className="border-b border-zinc-800 last:border-b-0">
//                     <button
//                       type="button"
//                       onClick={() => setExpandedLog((value) => value === getLogKey(log) ? null : getLogKey(log))}
//                       className="grid w-full cursor-pointer grid-cols-[118px_150px_1fr_200px] items-center gap-4 px-3 py-2.5 text-left transition hover:bg-zinc-800/40"
//                     >
//                       <div className="font-mono text-[11px] text-zinc-500">{formatLogTime(log.createdAt)}</div>

//                       <div className="flex items-center gap-2">
//                         <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-md text-xs', tone.arrowBg)}>{tone.arrow}</span>
//                         <span className={cn('rounded-full border px-2 py-1 text-[11px] font-medium uppercase tracking-[0.08em]', tone.badge)}>
//                           {tone.label}
//                         </span>
//                       </div>

//                       <div className="min-w-0 pr-4 text-sm text-zinc-200">
//                         <span className="line-clamp-2 break-all">{message}</span>
//                       </div>

//                       <div className="text-right text-[11px] text-zinc-500">
//                         {metaText}
//                       </div>
//                     </button>

//                     {expandedLog === getLogKey(log) && (
//                       <div className="border-t border-zinc-800 bg-zinc-950/40 px-4 py-3 text-xs text-zinc-300">
//                         <div className="grid gap-2 md:grid-cols-3">
//                           <div>
//                             <div className="mb-1 text-zinc-500">Level</div>
//                             <div className={cn('inline-flex rounded-full border px-2 py-1 text-[11px] uppercase', LEVEL_STYLES[log.level] || LEVEL_STYLES.info)}>{log.level}</div>
//                           </div>
//                           <div>
//                             <div className="mb-1 text-zinc-500">Category</div>
//                             <div className="text-zinc-200">{log.category}</div>
//                           </div>
//                           <div>
//                             <div className="mb-1 text-zinc-500">Session</div>
//                             <div className="font-mono text-zinc-200">{log.sessionId || 'n/a'}</div>
//                           </div>
//                         </div>

//                         {log.metadata && (
//                           <pre className="mt-3 overflow-x-auto rounded-md border border-zinc-800 bg-zinc-900/80 p-3 text-[11px] text-zinc-300 whitespace-pre-wrap break-all">
//                             {JSON.stringify(log.metadata, null, 2)}
//                           </pre>
//                         )}
//                       </div>
//                     )}
//                   </div>
//                 );
//               })
//             )}
//             <div ref={endRef} />
//           </div>
//         </div>

//         {error && (
//           <div className="mt-4 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
//             <AlertCircle className="h-4 w-4" />
//             {error}
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

// function PauseIcon() {
//   return (
//     <span className="flex h-4 w-4 items-center justify-center gap-0.5 text-[10px]">
//       <span className="h-3 w-0.5 rounded-full bg-current" />
//       <span className="h-3 w-0.5 rounded-full bg-current" />
//     </span>
//   );
// }

// function PlayIcon() {
//   return <ArrowDownLeft className="h-4 w-4" />;
// }
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  AlertCircle,
  Loader2,
  Pause,
  Play,
  Search,
  Terminal,
} from "lucide-react";
import { useParams } from "react-router-dom";
import { SERVER_URL } from "@/lib/constants";
import { useAuth } from "@/hooks/useAuth";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const FILTER_TABS = [
  { id: "all", label: "All" },
  { id: "incoming", label: "Incoming" },
  { id: "auto_reply", label: "Auto-reply" },
  { id: "llm", label: "AI" },
  { id: "handoff", label: "Handoff" },
  { id: "error", label: "Errors" },
  { id: "status", label: "Status" },
];

// Every badge: same shape, only the color family changes.
const BADGE_BASE =
  "inline-flex min-w-[88px] items-center justify-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5";

const TONES = {
  incoming: {
    label: "Incoming",
    badge: "border-sky-500/40 bg-sky-500/10 text-sky-300",
    arrow: "text-sky-400",
    glyph: "↓",
  },
  outgoing: {
    label: "Outgoing",
    badge: "border-indigo-500/40 bg-indigo-500/10 text-indigo-300",
    arrow: "text-indigo-400",
    glyph: "↑",
  },
  auto_reply: {
    label: "Auto-reply",
    badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    arrow: "text-emerald-400",
    glyph: "↑",
  },
  auto_reply_failed: {
    label: "Failed",
    badge: "border-red-500/40 bg-red-500/10 text-red-300",
    arrow: "text-red-400",
    glyph: "↑",
  },
  llm: {
    label: "AI",
    badge: "border-violet-500/40 bg-violet-500/10 text-violet-300",
    arrow: "text-violet-400",
    glyph: "↑",
  },
  tool: {
    label: "Tool",
    badge: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
    arrow: "text-cyan-400",
    glyph: "↗",
  },
  handoff: {
    label: "Handoff",
    badge: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    arrow: "text-amber-400",
    glyph: "⇄",
  },
  error: {
    label: "Error",
    badge: "border-red-500/40 bg-red-500/10 text-red-300",
    arrow: "text-red-400",
    glyph: "!",
  },
  status: {
    label: "Status",
    badge: "border-zinc-600/60 bg-zinc-700/30 text-zinc-300",
    arrow: "text-zinc-400",
    glyph: "↑",
  },
  system: {
    label: "System",
    badge: "border-zinc-600/60 bg-zinc-700/30 text-zinc-300",
    arrow: "text-zinc-400",
    glyph: "→",
  },
};

const LEVEL_BADGE = {
  info: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  error: "border-red-500/40 bg-red-500/10 text-red-300",
  debug: "border-zinc-600/60 bg-zinc-700/30 text-zinc-300",
};

const GRID =
  "grid grid-cols-[84px_20px_190px_104px_minmax(0,1fr)_220px] items-center gap-x-4";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function formatLogTime(value) {
  if (!value) return "--:--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function splitNumber(waId) {
  const digits = String(waId || "").replace(/\D/g, "");
  if (digits.length > 10) {
    return {
      cc: digits.slice(0, digits.length - 10),
      local: digits.slice(-10),
    };
  }
  return { cc: "", local: digits };
}

function maskNumber(waId) {
  const { cc, local } = splitNumber(waId);
  if (!local) return "—";
  return `${cc ? `+${cc} ` : ""}${local.slice(0, 5)}•••${local.slice(-2)}`;
}

function maskShort(waId) {
  const { local } = splitNumber(waId);
  if (!local) return "";
  return `${local.slice(0, 2)}•••${local.slice(-2)}`;
}

function isOutbound(log) {
  return (
    log.category === "auto_reply" ||
    log.category === "llm" ||
    log.category === "status" ||
    log.category === "tool" ||
    (log.category === "message" && log.event === "outgoing")
  );
}

function getTone(log) {
  if (log.category === "message") {
    return log.event === "outgoing" ? TONES.outgoing : TONES.incoming;
  }
  if (log.category === "auto_reply") {
    return log.event === "send_failed"
      ? TONES.auto_reply_failed
      : TONES.auto_reply;
  }
  if (log.category === "error" || log.level === "error") return TONES.error;
  return TONES[log.category] || TONES.system;
}

function getParty(log) {
  if (log.category === "message" && log.event !== "outgoing")
    return maskNumber(log.contactWaId);
  if (isOutbound(log)) {
    const short = maskShort(log.contactWaId);
    return short ? `bot → ${short}` : "bot →";
  }
  return log.contactWaId ? maskNumber(log.contactWaId) : "system";
}

function getMessage(log) {
  if (typeof log.message === "string" && log.message.trim())
    return log.message.trim();
  if (typeof log.event === "string" && log.event.trim())
    return log.event.trim();
  return "No message recorded";
}

function getMeta(log) {
  const md = log.metadata || {};
  const source = md.source || md.rule || log.event || log.category;
  const latency = md.latencyMs ?? md.latency_ms ?? md.durationMs;
  const parts = [String(source).replace(/_/g, " ")];
  if (latency != null) parts.push(`${latency} ms`);
  return parts.join(" · ");
}

function getKey(log) {
  return (
    log.id ||
    `${log.createdAt}-${log.category}-${log.event}-${log.contactWaId || ""}`
  );
}

function matchesTab(log, tab) {
  switch (tab) {
    case "all":
      return true;
    case "incoming":
      return log.category === "message" && log.event !== "outgoing";
    case "error":
      return log.category === "error" || log.level === "error";
    default:
      return log.category === tab;
  }
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function WhatsAppAutomationLogsPage() {
  const { isAdmin } = useAuth();
  const { automationId } = useParams();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [expandedKey, setExpandedKey] = useState(null);
  const [error, setError] = useState("");
  const [testText, setTestText] = useState("");

  const listRef = useRef(null);

  const base = `${SERVER_URL}/api/whatsapp-automation/${automationId}/logs`;

  const loadLogs = useCallback(async () => {
    if (!automationId) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.get(`${base}?limit=200`);
      setLogs(data.logs || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [automationId, base]);

  const loadRecent = useCallback(async () => {
    if (!automationId) return;
    try {
      const { data } = await axios.get(`${base}/recent?limit=80`);
      setLogs(data.logs || []);
    } catch (err) {
      console.error("Failed to load recent logs:", err);
    }
  }, [automationId, base]);

  useEffect(() => {
    if (!isAdmin || !automationId) return;
    loadLogs();
  }, [isAdmin, automationId, loadLogs]);

  useEffect(() => {
    if (!live) return undefined;
    const id = setInterval(loadRecent, 3000);
    return () => clearInterval(id);
  }, [live, loadRecent]);

  // Oldest first so the newest entry sits at the bottom, like a terminal.
  const sorted = useMemo(
    () =>
      [...logs].sort(
        (a, b) =>
          new Date(a.createdAt || 0).getTime() -
          new Date(b.createdAt || 0).getTime(),
      ),
    [logs],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sorted.filter((log) => {
      if (!matchesTab(log, activeTab)) return false;
      if (!q) return true;
      return [
        log.message,
        log.event,
        log.category,
        log.contactWaId,
        log.sessionId,
      ].some((v) =>
        String(v || "")
          .toLowerCase()
          .includes(q),
      );
    });
  }, [sorted, activeTab, searchQuery]);

  const counts = useMemo(() => {
    const out = {};
    FILTER_TABS.forEach((t) => {
      out[t.id] = sorted.filter((log) => matchesTab(log, t.id)).length;
    });
    return out;
  }, [sorted]);

  useEffect(() => {
    if (!autoScroll || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [filtered, autoScroll]);

  const clearLogs = () => {
    setLogs([]);
    setExpandedKey(null);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `automation-${automationId}-logs.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Demo stream: injects a fake incoming message + fallback reply locally.
  // Replace with a real webhook call / SSE / WebSocket feed.
  const sendTestWebhook = () => {
    const text = testText.trim();
    if (!text) return;
    const now = Date.now();
    const waId = "919999900000";
    setLogs((prev) => [
      ...prev,
      {
        id: `demo-in-${now}`,
        createdAt: new Date(now).toISOString(),
        category: "message",
        event: "incoming",
        level: "info",
        message: text,
        contactWaId: waId,
        metadata: { source: "webhook" },
      },
      {
        id: `demo-out-${now}`,
        createdAt: new Date(now + 120).toISOString(),
        category: "auto_reply",
        event: "fallback",
        level: "info",
        message: "I did not understand. Type *appointment* to book a visit.",
        contactWaId: waId,
        metadata: { source: "fixed fallback", latencyMs: 120 },
      },
    ]);
    setTestText("");
  };

  if (!isAdmin) {
    return <div className="p-6 text-zinc-300">Admins only.</div>;
  }

  const btn =
    "inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50";

  return (
    <div className="min-h-screen bg-black text-zinc-200">
      <div className="mx-auto max-w-[1600px] px-4 py-5 lg:px-6">
        {/* Top bar */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm text-zinc-400">
            <span className="relative flex h-2.5 w-2.5">
              {live && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
              )}
              <span
                className={cn(
                  "relative inline-flex h-2.5 w-2.5 rounded-full",
                  live ? "bg-emerald-400" : "bg-amber-400",
                )}
              />
            </span>
            <span>
              {live
                ? "Automation live — receiving traffic"
                : "Automation paused — no live traffic"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setLive((v) => !v)}
              className={btn}
            >
              {live ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {live ? "Pause stream" : "Resume stream"}
            </button>

            <label className={cn(btn, "cursor-pointer select-none")}>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-zinc-600 bg-zinc-900 accent-sky-500"
              />
              Auto-scroll
            </label>

            <button type="button" onClick={clearLogs} className={btn}>
              Clear
            </button>
            <button type="button" onClick={exportJson} className={btn}>
              Export JSON
            </button>
          </div>
        </header>

        {/* Filters + search */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {FILTER_TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50",
                    active
                      ? "border-sky-500 bg-sky-500/10 text-sky-300"
                      : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600",
                  )}
                >
                  {tab.label}
                  {counts[tab.id] > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[10px] font-medium leading-4",
                        active
                          ? "bg-sky-500/20 text-sky-200"
                          : "bg-zinc-800 text-zinc-400",
                      )}
                    >
                      {counts[tab.id]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search number, text, rule..."
              className="w-full rounded-md border border-zinc-800 bg-zinc-950 py-2.5 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-500/60 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>
        </div>

        {/* Simulator */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendTestWebhook()}
            placeholder="Simulate a customer message, e.g. price kitna hai?"
            className="w-full max-w-xl rounded-md border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-500/60 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
          <button
            type="button"
            onClick={sendTestWebhook}
            disabled={!testText.trim()}
            className="rounded-md bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send test webhook
          </button>
          <span className="text-sm text-zinc-500">
            Demo stream — replace with your SSE / WebSocket feed.
          </span>
        </div>

        {/* Log table */}
        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-[#050505]">
          <div
            ref={listRef}
            className="h-[calc(100vh-290px)] min-h-[360px] overflow-auto"
          >
            <div className="min-w-[960px]">
              {loading && sorted.length === 0 ? (
                <div className="flex min-h-[260px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 text-zinc-500">
                  <Terminal className="h-8 w-8" />
                  <div className="text-sm">No matching logs.</div>
                </div>
              ) : (
                filtered.map((log) => {
                  const key = getKey(log);
                  const tone = getTone(log);
                  const expanded = expandedKey === key;

                  return (
                    <div
                      key={key}
                      className="border-b border-zinc-900 last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedKey(expanded ? null : key)}
                        className={cn(
                          GRID,
                          "w-full px-4 py-2.5 text-left transition hover:bg-zinc-900/60 focus:outline-none focus-visible:bg-zinc-900/60",
                        )}
                      >
                        <span className="font-mono text-xs tabular-nums text-zinc-500">
                          {formatLogTime(log.createdAt)}
                        </span>

                        <span
                          className={cn(
                            "text-center font-mono text-sm font-bold",
                            tone.arrow,
                          )}
                        >
                          {tone.glyph}
                        </span>

                        <span className="truncate font-mono text-[13px] text-zinc-300">
                          {getParty(log)}
                        </span>

                        <span className={cn(BADGE_BASE, tone.badge)}>
                          {tone.label}
                        </span>

                        <span className="min-w-0 truncate font-mono text-[13px] text-zinc-100">
                          {getMessage(log)}
                        </span>

                        <span className="truncate text-right font-mono text-xs text-zinc-500">
                          {getMeta(log)}
                        </span>
                      </button>

                      {expanded && (
                        <div className="border-t border-zinc-900 bg-zinc-950 px-4 py-4 text-xs">
                          <div className="grid gap-4 sm:grid-cols-3">
                            <div>
                              <div className="mb-1.5 text-zinc-500">Level</div>
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase",
                                  LEVEL_BADGE[log.level] || LEVEL_BADGE.info,
                                )}
                              >
                                {log.level || "info"}
                              </span>
                            </div>
                            <div>
                              <div className="mb-1.5 text-zinc-500">
                                Category
                              </div>
                              <div className="font-mono text-zinc-200">
                                {log.category}
                              </div>
                            </div>
                            <div>
                              <div className="mb-1.5 text-zinc-500">
                                Session
                              </div>
                              <div className="break-all font-mono text-zinc-200">
                                {log.sessionId || "n/a"}
                              </div>
                            </div>
                          </div>

                          {log.metadata &&
                            Object.keys(log.metadata).length > 0 && (
                              <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-zinc-800 bg-black p-3 font-mono text-[11px] text-zinc-300">
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
                            )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}