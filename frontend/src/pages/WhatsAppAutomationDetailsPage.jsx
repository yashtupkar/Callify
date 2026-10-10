import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Plus, Trash2, Link2, Pencil, Save, X, Check, KeyRound, Phone, Terminal, ArrowLeft, Pause, Play, Settings2, Bot } from "lucide-react";
import {
  WEBHOOK_URL,
  toolOptions,
  languages,
  timezones,
  triggerTypes,
  responseTypes,
  tabs,
  cn,
  blank,
  langLabel,
  toolsOf,
  parseRule,
  ruleTrigger,
  ruleText,
  validateAutomationForm,
  useFieldErrors,
  inputBase,
  inputTone,
  Button,
  Badge,
  TextField,
  TextArea,
  SelectField,
  Toggle,
  Card,
  CopyButton,
  Skeleton,
  useAutomationsController,
  AutomationModals,
} from "@/components/whatsapp/automationKit";

export default function WhatsAppAutomationDetailsPage() {
  const navigate = useNavigate();
  const { automationId } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = tabs.some(([key]) => key === params.get("tab"))
    ? params.get("tab")
    : "overview";
  const setTab = (next) => setParams({ tab: next });
  const back = () => navigate("/whatsapp");
  const c = useAutomationsController({ onRemoved: back });
  const selected = useMemo(
    () => c.automations.find((item) => item.id === automationId) || null,
    [c.automations, automationId],
  );

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
        {c.loading ? (
          <Skeleton rows={3} />
        ) : selected ? (
          <DetailView
            key={selected.id}
            automation={selected}
            rules={c.rulesBy[selected.id] || []}
            tab={tab}
            setTab={setTab}
            back={back}
            navigate={navigate}
            actions={c.actions}
            toggleStatus={c.toggleStatus}
            availableInstances={c.availableInstances}
            openModal={c.setModal}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-[#26262b] p-12 text-center text-zinc-400">
            <p className="mb-3">That automation could not be found.</p>
            <Button onClick={back}>
              <ArrowLeft className="h-4 w-4" />
              Back to automations
            </Button>
          </div>
        )}
      </div>
      <AutomationModals c={c} navigate={navigate} />
    </div>
  );
}

function DetailView({
  automation,
  rules,
  tab,
  setTab,
  back,
  navigate,
  actions,
  toggleStatus,
  availableInstances,
  openModal,
}) {
  const active = automation.status === "active";
  const [pending, setPending] = useState(false);
  const tabProps = {
    automation,
    rules,
    actions,
    openModal,
    navigate,
    availableInstances,
  };
  return (
    <>
      <button
        type="button"
        onClick={back}
        className="mb-3 inline-flex items-center gap-1 text-zinc-400 transition hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" />
        All automations
      </button>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
            <span className="truncate">{automation.name}</span>
            <Badge tone={active ? "green" : "amber"}>
              {active
                ? "● Active"
                : automation.status === "draft"
                  ? "Draft"
                  : "Paused"}
            </Badge>
          </h1>
          <p className="mt-1 text-zinc-500">
            {automation.businessName || "WhatsApp Automation"} ·{" "}
            {langLabel(automation.language)} · {automation.timezone}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              navigate(`/whatsapp/setup/${automation.id}`)
            }
          >
            <Settings2 className="h-4 w-4" />
            Setup wizard
          </Button>
          <Button
            onClick={() =>
              navigate(`/admin/whatsapp-automations/${automation.id}/logs`)
            }
          >
            <Terminal className="h-4 w-4" />
            Live logs
          </Button>
          <Button
            disabled={pending}
            onClick={async () => {
              setPending(true);
              await toggleStatus(automation);
              setPending(false);
            }}
          >
            {active ? (
              <>
                <Pause className="h-4 w-4" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Resume
              </>
            )}
          </Button>
          <Button
            variant="danger"
            onClick={() => openModal({ type: "delete", automation })}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <div
        role="tablist"
        className="mb-5 flex gap-1 overflow-x-auto border-b border-[#26262b]"
      >
        {tabs.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 transition",
              tab === key
                ? "border-sky-500 text-zinc-50"
                : "border-transparent text-zinc-500 hover:text-zinc-200",
            )}
          >
            {label}
            {key === "rules" && <Badge className="ml-2">{rules.length}</Badge>}
            {key === "channels" && (
              <Badge
                className="ml-2"
                tone={automation.connections?.length ? "green" : "amber"}
              >
                {automation.connections?.length || 0}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab {...tabProps} setTab={setTab} />}
      {tab === "rules" && <RulesTab {...tabProps} />}
      {tab === "settings" && <SettingsTab {...tabProps} />}
      {tab === "channels" && <ChannelsTab {...tabProps} />}
    </>
  );
}

function OverviewTab({ automation: a, rules, setTab, navigate }) {
  const connections = a.connections || [];
  const tools = toolsOf(a);
  const checks = [
    [
      "A WhatsApp number is connected",
      connections.length > 0,
      "channels",
      "Connect number",
    ],
    [
      "System instructions are written",
      !blank(a.systemPrompt),
      "settings",
      "Edit",
    ],
    [
      "At least one auto-reply saves LLM usage",
      rules.length > 0,
      "rules",
      "Add rule",
    ],
    ["Automation is active", a.status === "active", null, null],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <Card title="Readiness">
          <ul className="space-y-2">
            {checks.map(([label, done, target, cta]) => (
              <li
                key={label}
                className="flex items-center gap-3 rounded-lg border border-[#26262b] bg-[#16161a] px-3 py-2.5"
              >
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                    done
                      ? "border-emerald-500 bg-emerald-500 text-black"
                      : "border-zinc-600 text-transparent",
                  )}
                >
                  <Check className="h-3 w-3" />
                </span>
                <span className={done ? "text-zinc-200" : "text-zinc-400"}>
                  {label}
                </span>
                {!done && target && (
                  <Button
                    size="sm"
                    className="ml-auto"
                    onClick={() => setTab(target)}
                  >
                    {cta}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card
          title="System instructions"
          action={
            <Button size="sm" onClick={() => setTab("settings")}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          }
        >
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-300">
            {a.systemPrompt || "Not set."}
          </pre>
          {a.initialMessage && (
            <p className="mt-4 rounded-lg border border-[#26262b] bg-[#16161a] p-3 text-xs text-zinc-300">
              <b className="mb-1 block text-[11px] text-zinc-500">Greeting</b>
              {a.initialMessage}
            </p>
          )}
        </Card>
      </div>
      <div>
        <Card title="Configuration">
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2.5 text-[13px]">
            {[
              ["Business", a.businessName || "—"],
              ["Language", langLabel(a.language)],
              ["Timezone", a.timezone || "—"],
              ["Status", a.status],
              [
                "Auto-replies",
                `${rules.filter((r) => r.enabled !== false).length} active / ${rules.length}`,
              ],
              [
                "Tools",
                tools
                  .filter((t) => t.enabled)
                  .map(
                    (t) =>
                      toolOptions.find(([n]) => n === t.name)?.[1] || t.name,
                  )
                  .join(", ") || "None",
              ],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-zinc-500">{k}</dt>
                <dd className="break-words capitalize-first text-zinc-200">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card
          title="Connected channels"
          action={
            <Button size="sm" onClick={() => setTab("channels")}>
              Manage
            </Button>
          }
        >
          {connections.length ? (
            <div className="space-y-2">
              {connections.map((c) => (
                <ChannelRow key={c.id} c={c} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">No numbers connected yet.</p>
          )}
        </Card>
        <Button
          className="w-full justify-center"
          onClick={() => navigate(`/admin/whatsapp-automations/${a.id}/logs`)}
        >
          <Terminal className="h-4 w-4" />
          Open live logs
        </Button>
      </div>
    </div>
  );
}

function ChannelRow({ c, onRemove }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#26262b] bg-[#16161a] px-3 py-2.5">
      <Phone className="h-4 w-4 shrink-0 text-sky-400" />
      <span className="truncate font-mono text-xs font-medium">
        {c.phoneNumber}
      </span>
      <Badge
        tone={c.provider === "cloud_api" ? "sky" : "green"}
        className="text-[10px] uppercase"
      >
        {c.provider === "cloud_api" ? "Meta Cloud API" : "Baileys linked"}
      </Badge>
      {onRemove && (
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto hover:text-red-400"
          onClick={onRemove}
          aria-label={`Disconnect ${c.phoneNumber}`}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

/* auto-replies */
function RulesTab({ automation, rules, actions, openModal }) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-zinc-400">
          Deterministic replies that run <b className="text-zinc-200">before</b>{" "}
          the AI, so common questions cost no LLM usage. For a button reply,
          give the button a stable ID and use the same ID as the trigger.
        </p>
        <Button
          variant="primary"
          onClick={() => openModal({ type: "rule", automation, rule: null })}
        >
          <Plus className="h-4 w-4" />
          New auto-reply
        </Button>
      </div>
      {rules.length ? (
        <div className="space-y-2.5">
          {rules.map((raw) => {
            const rule = parseRule(raw);
            return (
              <div
                key={rule.id}
                className={cn(
                  "flex flex-wrap items-start gap-3 rounded-xl border border-[#26262b] bg-[#111114] p-4",
                  rule.enabled === false && "opacity-60",
                )}
              >
                <Toggle
                  ariaLabel={`Enable rule ${ruleTrigger(rule)}`}
                  checked={rule.enabled !== false}
                  onChange={() => actions.toggleRule(automation.id, rule)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="truncate">
                      {rule.name ||
                        (rule.triggerType === "always"
                          ? "Catch-all"
                          : ruleTrigger(rule))}
                    </b>
                    <Badge tone="sky">
                      {triggerTypes.find(
                        ([v]) => v === rule.triggerType,
                      )?.[1] || rule.triggerType}
                    </Badge>
                    <Badge tone="green">
                      {responseTypes.find(
                        ([v]) => v === rule.responseType,
                      )?.[1] || rule.responseType}
                    </Badge>
                  </div>
                  {rule.triggerType !== "always" && (
                    <p className="mt-1 text-xs text-zinc-500">
                      Trigger:{" "}
                      <code className="rounded bg-[#16161a] px-1.5 py-0.5 text-zinc-300">
                        {ruleTrigger(rule)}
                      </code>
                      {rule.triggerType === "keyword" &&
                        ` · ${rule.matchMode || "exact"}`}
                    </p>
                  )}
                  <p className="mt-1.5 line-clamp-2 text-[13px] text-zinc-400">
                    {ruleText(rule) || "—"}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    onClick={() =>
                      openModal({ type: "rule", automation, rule })
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      openModal({ type: "deleteRule", automation, rule })
                    }
                    aria-label="Delete rule"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[#26262b] px-6 py-12 text-center text-zinc-500">
          <p className="mb-3">No auto-replies yet.</p>
          <Button
            onClick={() => openModal({ type: "rule", automation, rule: null })}
          >
            <Plus className="h-4 w-4" />
            Add the first one
          </Button>
        </div>
      )}
    </>
  );
}

/* settings */
function SettingsTab({ automation, actions }) {
  const initial = useMemo(
    () => ({
      name: automation.name || "",
      businessName: automation.businessName || "",
      systemPrompt: automation.systemPrompt || "",
      initialMessage: automation.initialMessage || "",
      language: automation.language || "en-US",
      timezone: automation.timezone || "Asia/Kolkata",
      tools: toolsOf(automation),
    }),
    [automation],
  );
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const snapshot = useRef(JSON.stringify(initial));
  useEffect(() => {
    setForm(initial);
    snapshot.current = JSON.stringify(initial);
  }, [initial]);

  const errors = useMemo(() => validateAutomationForm(form), [form]);
  const fields = useFieldErrors(errors);
  const dirty = JSON.stringify(form) !== snapshot.current;
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const set = (field, value) =>
    setForm((current) => ({ ...current, [field]: value }));
  const toggleTool = (name) =>
    setForm((current) => {
      const exists = current.tools.find((t) => t.name === name);
      return {
        ...current,
        tools: exists
          ? current.tools.map((t) =>
              t.name === name ? { ...t, enabled: !t.enabled } : t,
            )
          : [...current.tools, { name, enabled: true }],
      };
    });

  const save = async () => {
    if (!fields.valid) {
      fields.showAll();
      return;
    }
    setSaving(true);
    const supported = automation.supportedLanguages?.includes(form.language)
      ? automation.supportedLanguages
      : [form.language];
    await actions.update(automation, {
      tools: form.tools,
      fields: {
        name: form.name.trim(),
        businessName: form.businessName.trim(),
        systemPrompt: form.systemPrompt,
        initialMessage: form.initialMessage,
        language: form.language,
        supportedLanguages: supported,
        timezone: form.timezone,
      },
    });
    setSaving(false);
  };

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <Card title="General">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Automation name"
                required
                max={60}
                value={form.name}
                onChange={(v) => set("name", v)}
                placeholder="e.g. Customer Support Bot"
                {...fields.bind("name")}
              />
              <TextField
                label="Business name"
                max={80}
                value={form.businessName}
                onChange={(v) => set("businessName", v)}
                placeholder="e.g. Acme Corp"
                {...fields.bind("businessName")}
              />
              <SelectField
                label="Primary language"
                value={form.language}
                onChange={(v) => set("language", v)}
                options={languages}
              />
              <SelectField
                label="Timezone"
                value={form.timezone}
                onChange={(v) => set("timezone", v)}
                options={
                  timezones.includes(form.timezone)
                    ? timezones
                    : [form.timezone, ...timezones]
                }
                {...fields.bind("timezone")}
              />
            </div>
          </Card>
          <Card title="Behaviour">
            <div className="space-y-4">
              <TextArea
                label="System instructions / prompt"
                required
                rows={10}
                mono
                max={8000}
                value={form.systemPrompt}
                onChange={(v) => set("systemPrompt", v)}
                placeholder="You are a helpful customer service assistant for Acme Corp…"
                {...fields.bind("systemPrompt")}
              />
              <TextField
                label="Initial greeting message (optional)"
                max={1024}
                value={form.initialMessage}
                onChange={(v) => set("initialMessage", v)}
                placeholder="Hi! How can I help you today?"
                {...fields.bind("initialMessage")}
              />
            </div>
          </Card>
        </div>
        <div>
          <Card title="Enabled tools">
            <p className="mb-3 text-xs text-zinc-500">
              Only enabled tools are exposed to the WhatsApp LLM.
            </p>
            <div className="space-y-2">
              {toolOptions.map(([name, label]) => {
                const enabled = form.tools.some(
                  (t) => t.name === name && t.enabled !== false,
                );
                return (
                  <button
                    key={name}
                    type="button"
                    role="checkbox"
                    aria-checked={enabled}
                    onClick={() => toggleTool(name)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition",
                      enabled
                        ? "border-sky-500/60 bg-sky-500/10 text-sky-200"
                        : "border-[#26262b] bg-[#16161a] text-zinc-300 hover:border-[#3a3a42]",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-4 w-4 shrink-0 place-items-center rounded border",
                        enabled
                          ? "border-sky-500 bg-sky-500 text-black"
                          : "border-zinc-600",
                      )}
                    >
                      {enabled && <Check className="h-3 w-3" />}
                    </span>
                    {label}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 flex items-center justify-end gap-3 border-t border-[#26262b] bg-[#15151a] px-6 py-3 transition-transform",
          dirty ? "translate-y-0" : "translate-y-full",
        )}
      >
        <span className="mr-auto text-zinc-400">
          {!fields.valid
            ? "Fix the highlighted fields to save."
            : "You have unsaved changes"}
        </span>
        <Button
          onClick={() => {
            setForm(initial);
            fields.reset();
          }}
          disabled={saving}
        >
          Discard
        </Button>
        <Button variant="primary" onClick={save} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </>
  );
}

/* channels */
function ChannelsTab({ automation, actions, openModal, availableInstances }) {
  const [selected, setSelected] = useState("");
  const [linking, setLinking] = useState(false);
  const connections = automation.connections || [];
  const link = async () => {
    const instance = availableInstances.find((i) => i.instanceId === selected);
    if (!instance) return;
    setLinking(true);
    const ok = await actions.connectQr(automation, instance);
    setLinking(false);
    if (ok) setSelected("");
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <Card title={`Connected WhatsApp channels (${connections.length})`}>
          {connections.length ? (
            <div className="space-y-2">
              {connections.map((c) => (
                <ChannelRow
                  key={c.id}
                  c={c}
                  onRemove={() =>
                    openModal({ type: "disconnect", automation, connection: c })
                  }
                />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-[#26262b] p-4 text-center text-xs text-zinc-500">
              No WhatsApp numbers connected yet. Connect via Meta Cloud API or a
              QR-linked device.
            </p>
          )}
        </Card>
        <Card title="Add a channel">
          <Button
            variant="primary"
            className="w-full justify-center bg-sky-600"
            onClick={() => openModal({ type: "meta", automation })}
          >
            <KeyRound className="h-4 w-4" />
            Connect Meta Cloud API
          </Button>
          <div className="my-4 flex items-center gap-3 text-xs text-zinc-600">
            <span className="h-px flex-1 bg-[#26262b]" />
            or
            <span className="h-px flex-1 bg-[#26262b]" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <SelectField
                aria-label="QR linked device"
                value={selected}
                onChange={setSelected}
                options={[
                  ["", "Select a QR linked device…"],
                  ...availableInstances.map((i) => [
                    i.instanceId,
                    `${i.phoneNumber} (${i.instanceId})`,
                  ]),
                ]}
              />
            </div>
            <Button onClick={link} disabled={!selected || linking}>
              <Link2 className="h-4 w-4" />
              {linking ? "Linking…" : "Link QR"}
            </Button>
          </div>
          {!availableInstances.length && (
            <p className="mt-2 text-xs text-zinc-500">
              No free connected devices. Link a phone from WhatsApp Connections
              first.
            </p>
          )}
        </Card>
      </div>
      <Card title="Webhook">
        <p className="mb-3 text-xs text-zinc-400">
          Paste this callback URL in your Meta App Dashboard under{" "}
          <b className="text-zinc-300">WhatsApp → Configuration → Webhook</b>,
          then subscribe to <b className="text-zinc-300">messages</b>.
        </p>
        <div className="flex gap-2">
          <input
            readOnly
            aria-label="Webhook URL"
            value={WEBHOOK_URL}
            onFocus={(e) => e.target.select()}
            className={cn(inputBase, inputTone(false), "font-mono text-xs")}
          />
          <CopyButton text={WEBHOOK_URL} />
        </div>
      </Card>
    </div>
  );
}
