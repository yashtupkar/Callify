import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Plus, Pencil, Globe, RefreshCw, Phone, Terminal, Search, Pause, Bot, Users } from "lucide-react";
import {
  WEBHOOK_URL,
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
  CopyButton,
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
      <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-7">
        {c.loadError && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-200"
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


/* ───────────────────────────── list view ───────────────────────────── */

function ListView({
  automations,
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
  const stats = useMemo(
    () => ({
      total: automations.length,
      active: automations.filter((a) => a.status === "active").length,
      channels: automations.reduce(
        (sum, a) => sum + (a.connections?.length || 0),
        0,
      ),
      rules: Object.values(rulesBy).reduce((sum, list) => sum + list.length, 0),
    }),
    [automations, rulesBy],
  );

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
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <MessageCircle className="h-6 w-6 text-emerald-500" />
            WhatsApp Automations
          </h1>
          <p className="mt-1 text-zinc-400">
            Build AI-driven WhatsApp chatbots on the official Meta Cloud API or
            linked devices.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={refresh} disabled={refreshing} aria-label="Refresh">
            <RefreshCw
              className={cn("h-4 w-4", refreshing && "animate-spin")}
            />
          </Button>
          <Button
            onClick={() => navigate("/whatsapp/crm")}
            className="border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
            title="Open global WhatsApp CRM contacts & follow-ups"
          >
            <Users className="h-4 w-4" />
            Global CRM
          </Button>
          <Button variant="primary" onClick={() => navigate("/whatsapp/setup")}>
            <Plus className="h-4 w-4" />
            New automation
          </Button>
        </div>
      </div>

    

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Automations", stats.total, "text-zinc-50"],
          ["Active", stats.active, "text-emerald-400"],
          ["Connected numbers", stats.channels, "text-sky-400"],
          ["Auto-reply rules", stats.rules, "text-violet-300"],
        ].map(([label, value, color]) => (
          <div
            key={label}
            className="rounded-xl border border-[#26262b] bg-[#111114] p-4"
          >
            <p className="text-xs text-zinc-500">{label}</p>
            <b className={cn("mt-1 block text-2xl tabular-nums", color)}>
              {loading ? "–" : value}
            </b>
          </div>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            placeholder="Search name, business or number…"
            aria-label="Search automations"
            className={cn(inputBase, inputTone(false), "pl-9")}
          />
        </div>
        <div
          className="inline-flex rounded-lg border border-[#26262b] bg-[#0c0c0f] p-1"
          role="radiogroup"
          aria-label="Filter by status"
        >
          {[
            ["all", "All"],
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
                "rounded-md px-3 py-1 text-xs transition",
                filters.status === value
                  ? "bg-sky-600/20 text-sky-300 ring-1 ring-sky-500/50"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Skeleton rows={2} />
      ) : visible.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((a) => (
            <AutomationCard
              key={a.id}
              a={a}
              ruleCount={(rulesBy[a.id] || []).length}
              open={open}
              toggleStatus={toggleStatus}
              navigate={navigate}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[#26262b] px-6 py-14 text-center">
          <Bot className="mx-auto mb-3 h-10 w-10 text-zinc-600" />
          <h3 className="font-medium text-zinc-200">
            {automations.length
              ? "No automations match your filters"
              : "No automations yet"}
          </h3>
          <p className="mx-auto mb-4 mt-1 max-w-sm text-zinc-500">
            {automations.length
              ? "Try a different search or status."
              : "Create your first WhatsApp AI bot — it only takes a couple of minutes."}
          </p>
          {automations.length ? (
            <Button onClick={() => setFilters({ query: "", status: "all" })}>
              Clear filters
            </Button>
          ) : (
            <Button variant="primary" onClick={onNew}>
              <Plus className="h-4 w-4" />
              New automation
            </Button>
          )}
        </div>
      )}
    </>
  );
}



function AutomationCard({ a, ruleCount, open, toggleStatus, navigate }) {
  const active = a.status === "active";
  const connections = a.connections || [];
  const enabledTools = toolsOf(a).filter((t) => t.enabled).length;
  const updated = ago(a.updatedAt || a.createdAt);

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
      className="group relative flex flex-col justify-between rounded-2xl border border-[#26262b] bg-[#111114] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-sky-500/60 hover:shadow-xl hover:shadow-sky-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50"
    >
      <div>
        {/* Card Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-zinc-50 transition-colors group-hover:text-sky-300">
              {a.name}
            </h3>
            <p className="mt-0.5 truncate text-xs text-zinc-400">
              {a.businessName || "WhatsApp Automation"} · {langLabel(a.language)}
            </p>
          </div>
          <Badge tone={active ? "green" : a.status === "draft" ? "neutral" : "amber"}>
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                active
                  ? "animate-pulse bg-emerald-400"
                  : a.status === "draft"
                  ? "bg-zinc-500"
                  : "bg-amber-400"
              )}
            />
            {active ? "Active" : a.status === "draft" ? "Draft" : "Paused"}
          </Badge>
        </div>

        {/* Connected Numbers / Channels */}
        <div className="my-4 min-h-[52px] space-y-1.5">
          {connections.length ? (
            connections.slice(0, 2).map((c) => (
              <div
                key={c.id}
                onClick={(e) => {
                  e.stopPropagation();
                  open(a.id, "channels");
                }}
                className="flex items-center gap-2 rounded-lg border border-[#26262b] bg-[#16161a] px-3 py-2 text-xs transition hover:border-[#3a3a44]"
                title="Manage this phone channel"
              >
                <Phone className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                <span className="truncate font-mono font-medium text-zinc-200">
                  {c.phoneNumber}
                </span>
                <Badge
                  tone={c.provider === "cloud_api" ? "sky" : "green"}
                  className="ml-auto text-[10px] font-semibold uppercase tracking-wider"
                >
                  {providerLabel(c.provider)}
                </Badge>
              </div>
            ))
          ) : (
            <div
              onClick={(e) => {
                e.stopPropagation();
                open(a.id, "channels");
              }}
              className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#2b2b32] bg-[#141418] px-3 py-2.5 text-xs text-zinc-400 transition hover:border-sky-500/50 hover:text-sky-300"
              title="Click to connect a WhatsApp number"
            >
              <Phone className="h-3.5 w-3.5 text-sky-400" />
              <span>Connect phone number</span>
            </div>
          )}
          {connections.length > 2 && (
            <p className="text-right text-[11px] text-zinc-500">
              +{connections.length - 2} more connected numbers
            </p>
          )}
        </div>

        {/* Quick Metrics Bar */}
        <div className="grid grid-cols-3 gap-2 border-y border-[#202025] py-3 text-center">
          <div
            onClick={(e) => {
              e.stopPropagation();
              open(a.id, "channels");
            }}
            className="cursor-pointer rounded-lg py-1 transition hover:bg-[#18181d]"
            title="View channels"
          >
            <b className="block text-base font-semibold tabular-nums text-zinc-100">
              {connections.length}
            </b>
            <span className="text-[11px] text-zinc-500">Numbers</span>
          </div>

          <div
            onClick={(e) => {
              e.stopPropagation();
              open(a.id, "rules");
            }}
            className="cursor-pointer rounded-lg py-1 transition hover:bg-[#18181d]"
            title="View auto-reply rules"
          >
            <b className="block text-base font-semibold tabular-nums text-zinc-100">
              {ruleCount}
            </b>
            <span className="text-[11px] text-zinc-500">Auto-replies</span>
          </div>

          <div
            onClick={(e) => {
              e.stopPropagation();
              open(a.id, "settings");
            }}
            className="cursor-pointer rounded-lg py-1 transition hover:bg-[#18181d]"
            title="View enabled tools"
          >
            <b className="block text-base font-semibold tabular-nums text-zinc-100">
              {enabledTools}
            </b>
            <span className="text-[11px] text-zinc-500">AI Tools</span>
          </div>
        </div>
      </div>

      {/* Fast Switching Action Toolbar */}
      <div className="mt-4 pt-2">
        <div
          className="flex items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Direct CRM Jump */}
          <Button
            size="sm"
            onClick={() => open(a.id, "crm")}
            className="border-sky-500/25 bg-sky-500/10 px-2.5 text-xs text-sky-300 hover:border-sky-500/50 hover:bg-sky-500/20"
            title="Open CRM & Leads captured by this bot"
          >
            <Users className="h-3.5 w-3.5" />
            CRM
          </Button>

          {/* Direct Live Logs Jump */}
          <Button
            size="sm"
            onClick={() => open(a.id, "logs")}
            className="border-emerald-500/25 bg-emerald-500/10 px-2.5 text-xs text-emerald-300 hover:border-emerald-500/50 hover:bg-emerald-500/20"
            title="Open Live Logs & real-time traffic"
          >
            <Terminal className="h-3.5 w-3.5" />
            Logs
          </Button>

          {/* Edit / Configure */}
          <Button
            size="sm"
            onClick={() => open(a.id, "settings")}
            className="px-2.5 text-xs"
            title="Edit configuration & prompts"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>

          {/* Status Toggle */}
          <div className="ml-auto flex items-center">
            <Toggle
              ariaLabel={active ? `Pause ${a.name}` : `Resume ${a.name}`}
              checked={active}
              onChange={() => toggleStatus(a)}
            />
          </div>
        </div>

        {updated && (
          <p className="mt-2 text-[10px] text-zinc-600">Updated {updated}</p>
        )}
      </div>
    </div>
  );
}
