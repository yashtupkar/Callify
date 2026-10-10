import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Plus, Pencil, Globe, RefreshCw, Phone, Terminal, Search, Pause, Bot } from "lucide-react";
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
          <Button variant="primary" onClick={() => navigate("/whatsapp/setup")}>
            <Plus className="h-4 w-4" />
            New automation
          </Button>
        </div>
      </div>

      <WebhookBanner />

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

function WebhookBanner() {
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="flex items-center gap-2 font-medium">
          <Globe className="h-4 w-4 text-sky-400" />
          Meta WhatsApp Cloud API webhook URL
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          Configure this callback URL in your Meta App Dashboard under{" "}
          <b className="text-zinc-300">WhatsApp → Configuration → Webhook</b>.
        </p>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <code className="min-w-0 flex-1 select-all truncate rounded-lg border border-[#26262b] bg-[#0c0c0f] px-3 py-1.5 font-mono text-xs">
          {WEBHOOK_URL}
        </code>
        <CopyButton text={WEBHOOK_URL} />
      </div>
    </div>
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
      onClick={() => open(a.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open(a.id);
        }
      }}
      className="group cursor-pointer rounded-xl border border-[#26262b] bg-[#111114] p-5 transition hover:-translate-y-px hover:border-sky-500/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-zinc-50">
            {a.name}
          </h3>
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            {a.businessName || "WhatsApp Automation"} · {langLabel(a.language)}
          </p>
        </div>
        <Badge tone={active ? "green" : "amber"}>
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              active ? "bg-emerald-400" : "bg-amber-400",
            )}
          />
          {active ? "Active" : a.status === "draft" ? "Draft" : "Paused"}
        </Badge>
      </div>

      <div className="my-4 min-h-[52px] space-y-1.5">
        {connections.length ? (
          connections.slice(0, 2).map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-lg border border-[#26262b] bg-[#16161a] px-2.5 py-1.5"
            >
              <Phone className="h-3.5 w-3.5 shrink-0 text-sky-400" />
              <span className="truncate font-mono text-xs">
                {c.phoneNumber}
              </span>
              <Badge
                tone={c.provider === "cloud_api" ? "sky" : "green"}
                className="ml-auto text-[10px] uppercase"
              >
                {providerLabel(c.provider)}
              </Badge>
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-dashed border-[#26262b] px-3 py-2.5 text-center text-xs text-zinc-500">
            No WhatsApp number connected
          </p>
        )}
        {connections.length > 2 && (
          <p className="text-xs text-zinc-500">
            +{connections.length - 2} more
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 border-y border-dashed border-[#26262b] py-3 text-center">
        {[
          ["Numbers", connections.length],
          ["Auto-replies", ruleCount],
          ["Tools", enabledTools],
        ].map(([label, value]) => (
          <div key={label}>
            <b className="block text-lg tabular-nums">{value}</b>
            <small className="text-[11px] text-zinc-500">{label}</small>
          </div>
        ))}
      </div>

      <div
        className="mt-3 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          size="sm"
          onClick={() => navigate(`/admin/whatsapp-automations/${a.id}/logs`)}
        >
          <Terminal className="h-3.5 w-3.5" />
          Logs
        </Button>
        <Button size="sm" onClick={() => open(a.id, "settings")}>
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
        <span className="ml-auto">
          <Toggle
            ariaLabel={active ? `Pause ${a.name}` : `Resume ${a.name}`}
            checked={active}
            onChange={() => toggleStatus(a)}
          />
        </span>
      </div>
      {updated && (
        <p className="mt-2 text-[11px] text-zinc-600">Updated {updated}</p>
      )}
    </div>
  );
}
