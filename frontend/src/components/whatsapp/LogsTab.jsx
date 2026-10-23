import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Filter,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Search,
  Terminal,
  Trash2,
  Users,
  Check,
} from "lucide-react";
import { SERVER_URL } from "@/lib/constants";
import {
  Badge,
  Button,
  cn,
} from "@/components/whatsapp/automationKit";

/* ------------------------------------------------------------------ */
/* Config & Tones                                                     */
/* ------------------------------------------------------------------ */

const FILTER_TABS = [
  { id: "all", label: "All Events" },
  { id: "incoming", label: "Incoming" },
  { id: "auto_reply", label: "Auto-replies" },
  { id: "llm", label: "AI Responses" },
  { id: "tool", label: "Tool Calls" },
  { id: "handoff", label: "Handoff" },
  { id: "error", label: "Errors" },
  { id: "status", label: "Status" },
];

const TONES = {
  incoming: {
    label: "Incoming",
    badge: "border-sky-400/60 bg-sky-500/20 text-sky-200",
    arrow: "text-sky-400",
    glyph: "↓",
  },
  outgoing: {
    label: "Outgoing",
    badge: "border-orange-400/60 bg-orange-500/20 text-orange-200",
    arrow: "text-orange-400",
    glyph: "↑",
  },
  auto_reply: {
    label: "Auto-reply",
    badge: "border-emerald-400/60 bg-emerald-500/20 text-emerald-200",
    arrow: "text-emerald-400",
    glyph: "↑",
  },
  auto_reply_failed: {
    label: "Failed Reply",
    badge: "border-dashed border-rose-400/70 bg-rose-500/15 text-rose-200",
    arrow: "text-rose-400",
    glyph: "↑",
  },
  llm: {
    label: "AI Response",
    badge: "border-violet-400/60 bg-violet-500/20 text-violet-200",
    arrow: "text-violet-400",
    glyph: "↑",
  },
  tool: {
    label: "Tool Call",
    badge: "border-yellow-400/60 bg-yellow-500/20 text-yellow-200",
    arrow: "text-yellow-400",
    glyph: "↗",
  },
  handoff: {
    label: "Handoff",
    badge: "border-fuchsia-400/60 bg-fuchsia-500/20 text-fuchsia-200",
    arrow: "text-fuchsia-400",
    glyph: "⇄",
  },
  error: {
    label: "Error",
    badge: "border-red-500/80 bg-red-600/30 text-red-100 font-semibold",
    arrow: "text-red-500",
    glyph: "!",
  },
  status: {
    label: "Status",
    badge: "border-zinc-500/60 bg-zinc-600/20 text-zinc-200",
    arrow: "text-zinc-400",
    glyph: "→",
  },
  system: {
    label: "System",
    badge: "border-teal-400/60 bg-teal-500/20 text-teal-200",
    arrow: "text-teal-400",
    glyph: "→",
  },
};

const LEVEL_BADGE = {
  info: "border-sky-400/60 bg-sky-500/20 text-sky-200",
  warn: "border-amber-400/60 bg-amber-500/20 text-amber-200",
  error: "border-red-500/80 bg-red-600/30 text-red-100",
  debug: "border-zinc-500/60 bg-zinc-600/20 text-zinc-300",
};
/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

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

function formatWaId(waId) {
  const { cc, local } = splitNumber(waId);
  if (!local) return "—";
  return `${cc ? `+${cc} ` : ""}${local}`;
}

function maskNumber(waId) {
  const { cc, local } = splitNumber(waId);
  if (!local) return "—";
  return `${cc ? `+${cc} ` : ""}${local.slice(0, 5)}•••${local.slice(-2)}`;
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
    return formatWaId(log.contactWaId);
  if (isOutbound(log)) {
    return log.contactWaId ? `Bot → ${formatWaId(log.contactWaId)}` : "Bot →";
  }
  return log.contactWaId ? formatWaId(log.contactWaId) : "System";
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

function matchesCategory(log, tab) {
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
/* Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function LogsTab({ automation, setTab, onInspectContact }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [expandedKey, setExpandedKey] = useState(null);
  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState(null);

  const listRef = useRef(null);
  const base = `${SERVER_URL}/api/whatsapp-automation/${automation.id}/logs`;

  const loadLogs = useCallback(async (isRefresh = false) => {
    if (!automation?.id) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const { data } = await axios.get(`${base}?limit=200`, { withCredentials: true });
      setLogs(data.logs || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [automation?.id, base]);

  const loadRecent = useCallback(async () => {
    if (!automation?.id) return;
    try {
      const { data } = await axios.get(`${base}/recent?limit=100`, { withCredentials: true });
      if (Array.isArray(data.logs)) {
        setLogs((prev) => {
          // Merge unique logs
          const existingIds = new Set(prev.map((l) => getKey(l)));
          const incoming = data.logs.filter((l) => !existingIds.has(getKey(l)));
          if (!incoming.length) return prev;
          return [...prev, ...incoming].slice(-300);
        });
      }
    } catch (err) {
      console.warn("Recent logs polling error:", err.message);
    }
  }, [automation?.id, base]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!live) return undefined;
    const interval = setInterval(loadRecent, 3000);
    return () => clearInterval(interval);
  }, [live, loadRecent]);

  // Sort logs by time (ascending for live terminal feel)
  const sorted = useMemo(() => {
    return [...logs].sort(
      (a, b) =>
        new Date(a.createdAt || 0).getTime() -
        new Date(b.createdAt || 0).getTime()
    );
  }, [logs]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sorted.filter((log) => {
      if (!matchesCategory(log, activeCategory)) return false;
      if (!q) return true;
      return [
        log.message,
        log.event,
        log.category,
        log.contactWaId,
        log.sessionId,
        getMeta(log),
      ].some((v) =>
        String(v || "")
          .toLowerCase()
          .includes(q)
      );
    });
  }, [sorted, activeCategory, searchQuery]);

  const counts = useMemo(() => {
    const out = {};
    FILTER_TABS.forEach((t) => {
      out[t.id] = sorted.filter((log) => matchesCategory(log, t.id)).length;
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
    a.download = `whatsapp-${automation.name.toLowerCase().replace(/\s+/g, "-")}-logs.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyPayload = (key, text) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <div className="space-y-4">
      {/* Quick context & fast switch header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#26262b] bg-[#111114] p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              {live && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={cn(
                  "relative inline-flex h-3 w-3 rounded-full",
                  live ? "bg-emerald-500" : "bg-amber-500"
                )}
              />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
              {live ? "Live Stream Active" : "Live Stream Paused"}
            </span>
          </div>
          <span className="text-xs text-zinc-500">
            {live ? "Auto-refreshing every 3s" : "Click resume to stream"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {setTab && (
            <Button
              size="sm"
              variant="default"
              className="border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
              onClick={() => setTab("crm")}
            >
              <Users className="h-3.5 w-3.5" />
              Switch to CRM &amp; Leads
              <ArrowRight className="h-3 w-3" />
            </Button>
          )}

          <Button
            size="sm"
            onClick={() => setLive((v) => !v)}
            className={live ? "text-amber-300" : "text-emerald-300"}
          >
            {live ? (
              <>
                <Pause className="h-3.5 w-3.5" /> Pause
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" /> Resume
              </>
            )}
          </Button>

          <Button
            size="sm"
            onClick={() => loadLogs(true)}
            disabled={refreshing}
            title="Refresh logs from server"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
            />
          </Button>

          <label className="inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border border-[#26262b] bg-[#16161a] px-2.5 py-1.5 text-xs text-zinc-300 hover:border-[#3a3a42]">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[#26262b] bg-[#0c0c0f] accent-sky-500"
            />
            Auto-scroll
          </label>

          <Button size="sm" onClick={clearLogs} title="Clear visible logs">
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </Button>

          <Button size="sm" onClick={exportJson} title="Export current logs as JSON">
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_TABS.map((tab) => {
            const active = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                  active
                    ? "border-sky-500 bg-sky-500/15 text-sky-200 shadow-sm"
                    : "border-[#26262b] bg-[#111114] text-zinc-400 hover:border-[#3a3a42] hover:text-zinc-200"
                )}
              >
                {tab.label}
                {counts[tab.id] > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] tabular-nums",
                      active
                        ? "bg-sky-500/30 text-sky-100"
                        : "bg-[#1f1f24] text-zinc-500"
                    )}
                  >
                    {counts[tab.id]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search number, message, rule..."
            className="w-full rounded-lg border border-[#26262b] bg-[#0c0c0f] py-1.5 pl-8 pr-3 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-300"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Terminal View */}
      <div className="overflow-hidden rounded-xl border border-[#26262b] bg-[#09090b] shadow-xl">
        {/* Table Header */}
        <div className="grid grid-cols-[80px_20px_160px_110px_minmax(0,1fr)_160px_60px] items-center gap-x-3 border-b border-[#26262b] bg-[#111114] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          <span>Time</span>
          <span className="text-center">Dir</span>
          <span>Contact</span>
          <span>Category</span>
          <span>Message / Event</span>
          <span className="text-right">Metadata</span>
          <span className="text-right">Action</span>
        </div>

        {/* Scrollable list */}
        <div
          ref={listRef}
          className="h-[520px] overflow-y-auto font-mono text-xs [scrollbar-width:thin] [scrollbar-color:#26262b_transparent]"
        >
          {loading && sorted.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-500">
              <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
              <p className="text-xs">Loading live automation logs...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-zinc-500">
              <Terminal className="h-8 w-8 text-zinc-600" />
              <div>
                <p className="font-medium text-zinc-400">
                  {logs.length
                    ? "No logs match current category or search query"
                    : "No logs recorded yet"}
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  {logs.length
                    ? "Try switching to 'All Events' or clearing the search bar."
                    : "Logs will appear here in real time as WhatsApp messages are sent or received."}
                </p>
              </div>
              {searchQuery && (
                <Button size="sm" onClick={() => setSearchQuery("")}>
                  Clear search
                </Button>
              )}
            </div>
          ) : (
            filtered.map((log) => {
              const key = getKey(log);
              const tone = getTone(log);
              const expanded = expandedKey === key;
              const hasWaId = Boolean(log.contactWaId);

              return (
                <div
                  key={key}
                  className={cn(
                    "border-b border-[#18181c] transition-colors",
                    expanded ? "bg-[#131317]" : "hover:bg-[#111114]/80"
                  )}
                >
                  <div className="grid grid-cols-[80px_20px_160px_110px_minmax(0,1fr)_160px_60px] items-center gap-x-3 px-4 py-2.5">
                    {/* Time */}
                    <span className="tabular-nums text-zinc-500">
                      {formatLogTime(log.createdAt)}
                    </span>

                    {/* Direction */}
                    <span
                      className={cn(
                        "text-center text-sm font-bold",
                        tone.arrow
                      )}
                    >
                      {tone.glyph}
                    </span>

                    {/* Contact */}
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <span className="truncate text-zinc-300">
                        {getParty(log)}
                      </span>
                    </div>

                    {/* Badge */}
                    <div>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium leading-none",
                          tone.badge
                        )}
                      >
                        {tone.label}
                      </span>
                    </div>

                    {/* Message */}
                    <div
                      className="cursor-pointer truncate text-zinc-100 hover:text-sky-300"
                      onClick={() => setExpandedKey(expanded ? null : key)}
                      title="Click to view full payload"
                    >
                      {getMessage(log)}
                    </div>

                    {/* Metadata */}
                    <span className="truncate text-right text-[11px] text-zinc-500">
                      {getMeta(log)}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-1">
                      {hasWaId && setTab && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onInspectContact) {
                              onInspectContact(log.contactWaId);
                            } else {
                              setTab("crm");
                            }
                          }}
                          title={`Open ${log.contactWaId} in CRM`}
                          className="rounded p-1 text-zinc-500 transition hover:bg-sky-500/10 hover:text-sky-300"
                        >
                          <Users className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpandedKey(expanded ? null : key)}
                        title={expanded ? "Collapse details" : "Expand details"}
                        className="rounded p-1 text-zinc-500 transition hover:bg-[#26262b] hover:text-zinc-200"
                      >
                        {expanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expandable Details Drawer */}
                  {expanded && (
                    <div className="border-t border-[#26262b] bg-[#0c0c0f] p-4 text-xs">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[#26262b] pb-3">
                        <div className="flex flex-wrap items-center gap-4 text-zinc-400">
                          <div>
                            <span className="text-zinc-500">Level: </span>
                            <span
                              className={cn(
                                "inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold uppercase",
                                LEVEL_BADGE[log.level] || LEVEL_BADGE.info
                              )}
                            >
                              {log.level || "info"}
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-500">Category: </span>
                            <span className="text-zinc-200">{log.category}</span>
                          </div>
                          <div>
                            <span className="text-zinc-500">Event: </span>
                            <span className="text-zinc-200">{log.event}</span>
                          </div>
                          {log.sessionId && (
                            <div>
                              <span className="text-zinc-500">Session: </span>
                              <span className="text-zinc-300">{log.sessionId}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {hasWaId && setTab && (
                            <Button
                              size="sm"
                              className="border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
                              onClick={() => {
                                if (onInspectContact) {
                                  onInspectContact(log.contactWaId);
                                } else {
                                  setTab("crm");
                                }
                              }}
                            >
                              <Users className="h-3.5 w-3.5" />
                              Inspect in CRM
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() =>
                              copyPayload(
                                key,
                                JSON.stringify(log.metadata || log, null, 2)
                              )
                            }
                          >
                            {copiedKey === key ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                Copy JSON
                              </>
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Message preview block */}
                      <div className="mb-3">
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                          Message Body
                        </div>
                        <div className="rounded-lg border border-[#26262b] bg-[#141418] p-3 text-zinc-200">
                          {log.message || "—"}
                        </div>
                      </div>

                      {/* Payload / Metadata */}
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div>
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                            Payload &amp; Metadata
                          </div>
                          <pre className="max-h-60 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-[#26262b] bg-[#050507] p-3 text-[11px] text-zinc-300">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <Button size="sm" className="ml-auto" onClick={() => loadLogs(true)}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
