import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageCircle,
  Plus,
  Pencil,
  RefreshCw,
  Phone,
  Terminal,
  Search,
  Bot,
  Users,
  Play,
  Sparkles,
  AlertTriangle,
  Clock,
  DollarSign,
} from "lucide-react";
import {
  cn,
  langLabel,
  providerLabel,
  ago,
  toolsOf,
  inputBase,
  inputTone,
  Button,
  Badge,
  Toggle,
  Skeleton,
  useAutomationsController,
  AutomationModals,
} from "@/components/whatsapp/automationKit";

export default function WhatsAppAutomationsPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ query: "", status: "all" });
  const c = useAutomationsController({
    onCreated: (id) => navigate(`/whatsapp/automation/${id}?tab=channels`),
  });
  const open = (id, tab) =>
    navigate(`/whatsapp/automation/${id}${tab ? `?tab=${tab}` : ""}`);

  if (!c.isAdmin)
    return (
      <div className="grid min-h-screen place-items-center bg-[#09090b] text-zinc-400">
        Admins only.
      </div>
    );

  return (
    <div className="min-h-screen bg-[#09090b] text-sm text-zinc-100 antialiased">
      {/* Standard horizontal padding matching CRM and studio pages */}
      <div className="mx-auto w-full max-w-7xl px-6 py-6 sm:px-8 lg:px-10">
        {c.loadError && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-200"
          >
            <span>{c.loadError}</span>
            <Button
              size="sm"
              onClick={() => {
                c.setLoading(true);
                c.load();
              }}
            >
              Retry
            </Button>
          </div>
        )}
        <ListView
          automations={c.automations}
          instances={c.instances || []}
          rulesBy={c.rulesBy}
          loading={c.loading}
          refreshing={c.refreshing}
          filters={filters}
          setFilters={setFilters}
          open={open}
          toggleStatus={c.toggleStatus}
          navigate={navigate}
          refresh={() => c.load(true)}
          onNew={() => c.setModal({ type: "new" })}
        />
      </div>
      <AutomationModals c={c} navigate={navigate} />
    </div>
  );
}

/* ───────────────────────────── List View ───────────────────────────── */

function ListView({
  automations,
  instances,
  rulesBy,
  loading,
  refreshing,
  filters,
  setFilters,
  open,
  toggleStatus,
  navigate,
  refresh,
  onNew,
}) {
  const stats = useMemo(() => {
    return {
      total: automations.length,
      active: automations.filter((a) => a.status === "active").length,
      conversations: automations.reduce(
        (sum, a) => sum + (a.stats?.totalConversations || 0),
        0,
      ),
      leads: automations.reduce(
        (sum, a) => sum + (a.stats?.leadsCount || 0),
        0,
      ),
      handoffs: automations.reduce(
        (sum, a) => sum + (a.stats?.pendingHandoffs || 0),
        0,
      ),
      totalSpend: automations.reduce(
        (sum, a) => sum + (a.stats?.totalLlmCost || 0),
        0,
      ),
    };
  }, [automations]);

  const visible = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return automations.filter(
      (a) =>
        (filters.status === "all" || a.status === filters.status) &&
        (!q ||
          [
            a.name,
            a.businessName,
            ...(a.connections || []).map((c) => c.phoneNumber),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q)),
    );
  }, [automations, filters]);

  return (
    <>
      {/* Top Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-zinc-100">
            <MessageCircle className="h-6 w-6 text-emerald-500" />
            WhatsApp Automations
          </h1>
          <p className="mt-0.5 text-xs text-zinc-400">
            Monitor, control and operate AI chatbots across Meta Cloud API and linked WhatsApp numbers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh"
            className="border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300"
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshing && "animate-spin text-zinc-200")}
            />
          </Button>
          <Button
            onClick={() => navigate("/whatsapp/crm")}
            className="border-transparent bg-sky-600 text-white hover:bg-sky-500 font-semibold shadow-sm"
            title="Open global WhatsApp CRM contacts & follow-ups"
          >
            <Users className="h-4 w-4" />
            Global CRM
          </Button>
          <Button
            variant="primary"
            onClick={() => navigate("/whatsapp/setup")}
            className="shadow-sm shadow-emerald-500/20"
          >
            <Plus className="h-4 w-4" />
            New automation
          </Button>
        </div>
      </div>

      {/* Admin Executive Summary Ribbon */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ["Automations", `${stats.active} Active · ${stats.total} Total`, "text-zinc-100"],
          ["Conversations", stats.conversations.toLocaleString(), "text-sky-400"],
          ["Leads Captured", stats.leads.toLocaleString(), "text-indigo-400"],
          ["AI Total Spend", `$${stats.totalSpend.toFixed(2)}`, "text-emerald-400"],
          [
            "Human Escalations",
            stats.handoffs > 0 ? `${stats.handoffs} Waiting` : "0 Pending",
            stats.handoffs > 0 ? "text-rose-400" : "text-zinc-400",
          ],
        ].map(([label, value, color]) => (
          <div
            key={label}
            className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3 backdrop-blur-sm"
          >
            <p className="text-[11px] font-medium text-zinc-400">{label}</p>
            <b className={cn("mt-0.5 block text-lg font-bold tabular-nums tracking-tight", color)}>
              {loading ? "–" : value}
            </b>
          </div>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            placeholder="Search by name, business or number…"
            aria-label="Search automations"
            className={cn(
              inputBase,
              inputTone(false),
              "pl-9 py-1.5 bg-zinc-900/60 border-zinc-800/80 focus:border-sky-500/60 text-xs sm:text-sm",
            )}
          />
        </div>
        <div
          className="inline-flex rounded-lg border border-zinc-800/80 bg-zinc-900/60 p-1"
          role="radiogroup"
          aria-label="Filter by status"
        >
          {[
            ["all", "All Automations"],
            ["active", "Active"],
            ["paused", "Paused"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={filters.status === value}
              onClick={() => setFilters({ ...filters, status: value })}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition",
                filters.status === value
                  ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/50 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards Grid: Strictly 2 Cards per Row */}
      {loading ? (
        <Skeleton rows={3} />
      ) : visible.length ? (
        <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
          {visible.map((a) => (
            <AutomationCard
              key={a.id}
              a={a}
              instances={instances}
              ruleCount={(rulesBy[a.id] || []).length}
              open={open}
              toggleStatus={toggleStatus}
              navigate={navigate}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-800/80 bg-zinc-900/20 px-6 py-14 text-center">
          <Bot className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
          <h3 className="font-semibold text-zinc-200 text-sm">
            {automations.length
              ? "No automations match your search filter"
              : "No WhatsApp automations yet"}
          </h3>
          <p className="mx-auto mb-3 mt-1 max-w-sm text-xs text-zinc-500">
            {automations.length
              ? "Try adjusting your search terms or filter tags."
              : "Create your first WhatsApp AI bot in minutes with Meta Cloud API or QR linking."}
          </p>
          {automations.length ? (
            <Button
              size="sm"
              onClick={() => setFilters({ query: "", status: "all" })}
              className="border-zinc-800 bg-zinc-900"
            >
              Clear filters
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={onNew}>
              <Plus className="h-3.5 w-3.5" />
              New automation
            </Button>
          )}
        </div>
      )}
    </>
  );
}

/* ────────────────────── Compact Automation Card ────────────────────── */

function getConnectionHealth(c, instances = []) {
  if (c.provider === "cloud_api") {
    const isOk = c.enabled !== false;
    return {
      online: isOk,
      label: isOk ? "Online" : "Disabled",
    };
  }
  // QR Baileys instance check
  const instance = instances.find(
    (ins) =>
      ins.instanceId === c.instanceId ||
      ins.phoneNumber === c.phoneNumber,
  );
  const status =
    typeof instance?.status === "object"
      ? instance?.status?.status || instance?.status?.connection
      : instance?.status;
  const isConnected = status === "connected" || status === "open";
  return {
    online: isConnected,
    label: isConnected ? "Linked" : "Offline",
  };
}

function AutomationCard({ a, instances, ruleCount, open, toggleStatus, navigate }) {
  const active = a.status === "active";
  const connections = a.connections || [];
  const enabledTools = toolsOf(a).filter((t) => t.enabled).length;
  const stats = a.stats || {
    totalConversations: 0,
    leadsCount: 0,
    pendingHandoffs: 0,
    messagesSent: 0,
    messagesReceived: 0,
    messagesFailed: 0,
    totalLlmCost: 0,
    lastActivityAt: null,
  };

  const lastActive = stats.lastActivityAt ? ago(stats.lastActivityAt) : null;
  const updated = ago(a.updatedAt || a.createdAt);

  // Extract primary AI model label
  const modelName =
    a.promptConfig?.onboarding?.businessProfile?.model ||
    a.promptConfig?.onboarding?.model ||
    a.behaviorConfig?.model ||
    "GPT-4o";

  const firstConnection = connections[0] || null;
  const connHealth = firstConnection ? getConnectionHealth(firstConnection, instances) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => open(a.id, "overview")}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open(a.id, "overview");
        }
      }}
      className="group relative flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 backdrop-blur-sm transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900/80 hover:shadow-xl hover:shadow-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50"
    >
      <div>
        {/* Card Header: Compact Identity + Badges */}
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="h-8 w-8 shrink-0 rounded-lg bg-zinc-800 border border-zinc-700/60 text-emerald-400 flex items-center justify-center">
              <Bot className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-bold text-zinc-100 transition-colors group-hover:text-sky-300">
                  {a.name}
                </h3>
                <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.2 text-[10px] font-semibold text-zinc-300 border border-zinc-700/60 font-mono">
                  {modelName}
                </span>
              </div>
              <p className="truncate text-[11px] text-zinc-400">
                {a.businessName || "WhatsApp Bot"} · {langLabel(a.language)}
              </p>
            </div>
          </div>

          {/* Right Status / Alert Badges */}
          <div className="flex items-center gap-1.5 shrink-0">
            {stats.pendingHandoffs > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  open(a.id, "crm");
                }}
                className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-300 hover:bg-rose-500/25 animate-pulse transition"
                title="Customers waiting for human response"
              >
                <AlertTriangle className="h-3 w-3 text-rose-400" />
                <span>{stats.pendingHandoffs} Handoff</span>
              </button>
            )}
            <Badge tone={active ? "green" : a.status === "draft" ? "neutral" : "amber"}>
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  active
                    ? "animate-pulse bg-emerald-400"
                    : a.status === "draft"
                    ? "bg-zinc-500"
                    : "bg-amber-400",
                )}
              />
              <span className="text-[10px]">{active ? "Active" : a.status === "draft" ? "Draft" : "Paused"}</span>
            </Badge>
          </div>
        </div>

        {/* Compact Channel Strip */}
        <div className="mt-2.5">
          {firstConnection ? (
            <div
              onClick={(e) => {
                e.stopPropagation();
                open(a.id, "channels");
              }}
              className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-2.5 py-1.5 text-xs transition hover:border-zinc-700 hover:bg-zinc-950/80"
              title="Manage phone channels"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Phone className="h-3 w-3 shrink-0 text-sky-400" />
                <span className="truncate font-mono text-[11px] font-medium text-zinc-200">
                  {firstConnection.phoneNumber}
                </span>
                {connections.length > 1 && (
                  <span className="text-[10px] text-zinc-500">
                    (+{connections.length - 1} more)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge
                  tone={firstConnection.provider === "cloud_api" ? "sky" : "green"}
                  className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0"
                >
                  {providerLabel(firstConnection.provider)}
                </Badge>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.2 text-[9px] font-medium border",
                    connHealth.online
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-rose-500/10 text-rose-400 border-rose-500/20",
                  )}
                >
                  <span
                    className={cn(
                      "h-1 w-1 rounded-full",
                      connHealth.online ? "bg-emerald-400" : "bg-rose-400",
                    )}
                  />
                  {connHealth.label}
                </span>
              </div>
            </div>
          ) : (
            <div
              onClick={(e) => {
                e.stopPropagation();
                open(a.id, "channels");
              }}
              className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 px-2.5 py-1.5 text-xs text-zinc-400 transition hover:border-sky-500/50 hover:text-sky-300"
              title="Click to connect a WhatsApp number"
            >
              <Phone className="h-3 w-3 text-sky-400" />
              <span className="text-[11px]">No number linked · Click to connect line</span>
            </div>
          )}
        </div>

        {/* Compact Segmented 4-Cell Metrics Strip */}
        <div className="mt-2.5 grid grid-cols-4 divide-x divide-zinc-800/80 rounded-lg border border-zinc-800/80 bg-zinc-950/50 py-1.5 text-center">
          {/* Cell 1: Conversations */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              open(a.id, "logs");
            }}
            className="cursor-pointer px-1 transition hover:opacity-80"
            title="Total conversations handled"
          >
            <span className="block text-[10px] font-medium text-zinc-400">Conversations</span>
            <b className="block text-sm font-bold tabular-nums text-zinc-100">
              {stats.totalConversations ?? 0}
            </b>
          </div>

          {/* Cell 2: Leads */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              open(a.id, "crm");
            }}
            className="cursor-pointer px-1 transition hover:opacity-80"
            title="Leads saved in CRM"
          >
            <span className="block text-[10px] font-medium text-zinc-400">Leads</span>
            <b className="block text-sm font-bold tabular-nums text-indigo-300">
              {stats.leadsCount ?? 0}
            </b>
          </div>

          {/* Cell 3: AI Spend */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              open(a.id, "logs");
            }}
            className="cursor-pointer px-1 transition hover:opacity-80"
            title="Real LLM API Cost"
          >
            <span className="block text-[10px] font-medium text-zinc-400">AI Spend</span>
            <b className="block text-sm font-bold tabular-nums text-emerald-300">
              ${Number(stats.totalLlmCost || 0).toFixed(2)}
            </b>
          </div>

          {/* Cell 4: Rules / Health */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              open(a.id, stats.pendingHandoffs > 0 ? "crm" : "rules");
            }}
            className="cursor-pointer px-1 transition hover:opacity-80"
            title="System health or auto-replies"
          >
            {stats.pendingHandoffs > 0 ? (
              <>
                <span className="block text-[10px] font-medium text-rose-300">Handoffs</span>
                <b className="block text-sm font-bold tabular-nums text-rose-300">
                  {stats.pendingHandoffs}
                </b>
              </>
            ) : stats.messagesFailed > 0 ? (
              <>
                <span className="block text-[10px] font-medium text-amber-300">Failed</span>
                <b className="block text-sm font-bold tabular-nums text-amber-300">
                  {stats.messagesFailed}
                </b>
              </>
            ) : (
              <>
                <span className="block text-[10px] font-medium text-zinc-400">Auto-Replies</span>
                <b className="block text-sm font-bold tabular-nums text-violet-300">
                  {ruleCount}
                </b>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action Toolbar & Compact Footer */}
      <div className="mt-2.5 pt-2 border-t border-zinc-800/70">
        <div
          className="flex flex-wrap items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* CRM Button */}
          <button
            type="button"
            onClick={() => open(a.id, "crm")}
            className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-sky-500 active:scale-95"
            title="Open CRM & captured leads"
          >
            <Users className="h-3 w-3 text-white" />
            <span>CRM</span>
            {stats.leadsCount > 0 && (
              <span className="rounded-full bg-black/25 px-1 text-[9px] font-bold text-white">
                {stats.leadsCount}
              </span>
            )}
          </button>

          {/* Live Logs Button */}
          <button
            type="button"
            onClick={() => open(a.id, "logs")}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 active:scale-95"
            title="Open Live Logs & real-time traffic"
          >
            <Terminal className="h-3 w-3 text-white" />
            <span>Logs</span>
          </button>

          {/* Test / Simulator Button */}
          <button
            type="button"
            onClick={() => open(a.id, "overview")}
            className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-violet-500 active:scale-95"
            title="Open bot simulator & test responses"
          >
            <Play className="h-3 w-3 text-white fill-current" />
            <span>Test Bot</span>
          </button>

          {/* Edit Button */}
          <button
            type="button"
            onClick={() => navigate(`/whatsapp/setup/${a.id}?status=edit`)}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-600 bg-zinc-700 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-zinc-600 active:scale-95"
            title="Edit configuration & prompt"
          >
            <Pencil className="h-3 w-3 text-zinc-200" />
            <span>Edit</span>
          </button>

          {/* Status Toggle on Right */}
          <div className="ml-auto flex items-center gap-1.5">
            <span
              className={cn(
                "text-[11px] font-medium",
                active ? "text-emerald-400" : "text-zinc-500",
              )}
            >
              {active ? "Active" : "Paused"}
            </span>
            <Toggle
              ariaLabel={active ? `Pause ${a.name}` : `Resume ${a.name}`}
              checked={active}
              onChange={() => toggleStatus(a)}
            />
          </div>
        </div>

        {/* Footer Meta Row */}
        <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-500">
          <div className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5 text-zinc-500" />
            <span>
              {lastActive
                ? `Active ${lastActive}`
                : updated
                ? `Updated ${updated}`
                : "No activity yet"}
            </span>
          </div>
          <span>
            {enabledTools} tools · {a.fallbackMode === "ai" ? "AI Autonomous" : "Standard"}
          </span>
        </div>
      </div>
    </div>
  );
}
