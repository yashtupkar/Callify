import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  SelectField,
  TextArea,
  TextField,
  apiError,
  cn,
} from "@/components/whatsapp/automationKit";
import { campaignApi } from "@/lib/campaignApi";
import { parseContactFile } from "@/lib/campaignFiles";

const STEPS = ["Details", "Recipients", "Message", "Review"];
const SOURCES = [
  ["column", "Contact column"],
  ["name", "Contact name"],
  ["phone", "Phone number"],
  ["static", "Fixed text"],
];

const Alert = ({ tone = "red", children }) => (
  <div
    role="alert"
    className={cn(
      "mb-4 rounded-lg border px-4 py-3",
      tone === "red" && "border-red-500/40 bg-red-500/10 text-red-200",
      tone === "amber" && "border-amber-500/40 bg-amber-500/10 text-amber-200",
    )}
  >
    {children}
  </div>
);

export function VariableRow({ label, spec, columns, onChange }) {
  const source = spec?.source || "column";
  return (
    <div className="grid gap-2 sm:grid-cols-[90px_1fr_1fr_1fr] sm:items-end">
      <div className="pb-2 font-mono text-xs text-sky-300">{label}</div>
      <SelectField
        label="Source"
        value={source}
        options={SOURCES}
        onChange={(v) => onChange({ ...spec, source: v, value: v === "column" ? columns[0] || "" : "" })}
      />
      {source === "column" ? (
        <SelectField
          label="Column"
          value={spec?.value || ""}
          options={[["", "Select…"], ...columns.map((c) => [c, c])]}
          onChange={(v) => onChange({ ...spec, source, value: v })}
        />
      ) : source === "static" ? (
        <TextField label="Text" value={spec?.value || ""} onChange={(v) => onChange({ ...spec, source, value: v })} />
      ) : (
        <div />
      )}
      <TextField
        label="Fallback"
        value={spec?.fallback || ""}
        hint="Used when empty"
        onChange={(v) => onChange({ ...spec, source, fallback: v })}
      />
    </div>
  );
}

export default function CampaignCreatePage() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connections, setConnections] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const [form, setForm] = useState({
    name: "",
    connectionId: "",
    optInConfirmed: false,
    optInSource: "",
    acceptRisk: false,
    manualNumbers: "",
    defaultCountryCode: "",
    phoneColumn: "",
    templateKey: "",
    messageText: "",
    headerMediaUrl: "",
    concurrency: "",
    ratePerMinute: "",
    maxAttempts: "3",
  });
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [variableMap, setVariableMap] = useState({ header: {}, body: {}, buttons: {} });
  const [recipientPreview, setRecipientPreview] = useState(null);
  const [messagePreview, setMessagePreview] = useState(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const connection = connections?.find((c) => c.id === form.connectionId);
  const isCloud = connection?.channel === "cloud_api";
  const template = templates.find((t) => `${t.name}::${t.language}` === form.templateKey);
  const columns = recipientPreview?.columns || file?.columns || [];

  useEffect(() => {
    campaignApi
      .connections()
      .then((r) => setConnections(r.connections.filter((c) => c.enabled)))
      .catch((e) => {
        setError(apiError(e));
        setConnections([]);
      });
  }, []);

  useEffect(() => {
    setTemplates([]);
    setForm((f) => ({ ...f, templateKey: "" }));
    if (!form.connectionId || !isCloud) return undefined;
    let live = true;
    campaignApi
      .templates(form.connectionId)
      .then((r) => live && setTemplates(r.templates))
      .catch((e) => live && setError(apiError(e)));
    return () => {
      live = false;
    };
  }, [form.connectionId, isCloud]);

  const recipientsPayload = () => ({
    file: file ? { columns: file.columns, rows: file.rows } : undefined,
    manualNumbers: form.manualNumbers,
    defaultCountryCode: form.defaultCountryCode,
    phoneColumn: form.phoneColumn || undefined,
  });

  const messagePayload = () => ({
    templateName: template?.name,
    templateLanguage: template?.language,
    messageText: isCloud ? undefined : form.messageText,
    variableMap,
    headerMediaUrl: form.headerMediaUrl || undefined,
  });

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    run(async () => {
      setFile(await parseContactFile(picked));
      setFileName(picked.name);
      setRecipientPreview(null);
    });
  };

  const checkRecipients = () =>
    run(async () => {
      setRecipientPreview(
        await campaignApi.previewRecipients({
          connectionId: form.connectionId,
          recipients: recipientsPayload(),
        }),
      );
    });

  const checkMessage = () =>
    run(async () => {
      const sample = recipientPreview?.sample?.[0];
      setMessagePreview(
        await campaignApi.previewMessage({
          connectionId: form.connectionId,
          columns,
          sampleRecipient: sample,
          ...messagePayload(),
        }),
      );
    });

  const setVar = (group, key, spec) =>
    setVariableMap((m) => ({ ...m, [group]: { ...m[group], [key]: spec } }));

  const requiredVars = useMemo(() => {
    if (!template) return [];
    const rows = (template.header?.placeholders || []).map((p) => ["header", p, `Header {{${p}}}`]);
    rows.push(...template.body.placeholders.map((p) => ["body", p, `Body {{${p}}}`]));
    rows.push(...template.buttons.filter((b) => b.hasVariable).map((b) => ["buttons", String(b.index), `Button ${b.index + 1}`]));
    return rows;
  }, [template]);

  const stepValid = [
    form.name.trim() &&
      form.connectionId &&
      form.optInConfirmed &&
      form.optInSource.trim().length >= 3 &&
      (isCloud || form.acceptRisk),
    recipientPreview && recipientPreview.validCount > 0,
    isCloud ? template?.supported && template.status === "APPROVED" : form.messageText.trim(),
    true,
  ];

  const create = () =>
    run(async () => {
      const result = await campaignApi.create({
        name: form.name.trim(),
        connectionId: form.connectionId,
        recipients: recipientsPayload(),
        ...messagePayload(),
        concurrency: form.concurrency ? Number(form.concurrency) : undefined,
        ratePerMinute: form.ratePerMinute ? Number(form.ratePerMinute) : undefined,
        maxAttempts: Number(form.maxAttempts) || 3,
        optIn: { confirmed: form.optInConfirmed, source: form.optInSource.trim() },
        acceptUnofficialRisk: form.acceptRisk,
        idempotencyKey,
      });
      navigate(`/whatsapp/campaigns/${result.id}`);
    });

  const goNext = () => {
    setError("");
    if (step === 2) setMessagePreview(null);
    setStep((s) => s + 1);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-sm text-zinc-100 antialiased">
      <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-7">
        <button
          onClick={() => navigate("/whatsapp/campaigns")}
          className="mb-4 inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" /> Campaigns
        </button>
        <h1 className="mb-4 text-lg font-semibold">New campaign</h1>

        <ol className="mb-6 flex flex-wrap gap-2" aria-label="Steps">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                i === step ? "border-sky-500/50 bg-sky-500/10 text-sky-300" : "border-[#26262b] text-zinc-500",
              )}
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>

        {error && <Alert>{error}</Alert>}

        {step === 0 && (
          <Card title="Campaign details">
            <div className="grid gap-4">
              <TextField label="Campaign name" required max={120} value={form.name} onChange={(v) => set({ name: v })} />
              <SelectField
                label="WhatsApp account"
                required
                value={form.connectionId}
                onChange={(v) => set({ connectionId: v, acceptRisk: false })}
                options={[
                  ["", connections === null ? "Loading…" : "Select an account"],
                  ...(connections || []).map((c) => [
                    c.id,
                    `${c.phoneNumber || c.automationName || c.id} — ${c.channel === "cloud_api" ? "Meta Cloud API" : "QR linked (unofficial)"}`,
                  ]),
                ]}
              />
              {connection && !isCloud && (
                <Alert tone="amber">
                  <p className="mb-2">
                    QR-linked accounts are unofficial. Bulk messaging can get the number restricted or banned, only plain text is
                    sent, and delivery/read status is not tracked. Limit: {connection.limits.maxRecipients} recipients,{" "}
                    {connection.limits.maxRatePerMinute}/min.
                  </p>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" checked={form.acceptRisk} onChange={(e) => set({ acceptRisk: e.target.checked })} className="mt-0.5" />
                    I understand and accept the risk.
                  </label>
                </Alert>
              )}
              <div className="rounded-lg border border-[#26262b] p-4">
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={form.optInConfirmed} onChange={(e) => set({ optInConfirmed: e.target.checked })} className="mt-0.5" />
                  <span>I confirm every recipient has given explicit consent (opt-in) to receive these WhatsApp messages, and I will honour opt-outs.</span>
                </label>
                <TextField
                  className="mt-3"
                  label="How was consent collected?"
                  required
                  max={300}
                  placeholder="e.g. Website checkout form, Jan 2025"
                  value={form.optInSource}
                  onChange={(v) => set({ optInSource: v })}
                />
              </div>
            </div>
          </Card>
        )}

        {step === 1 && (
          <Card title="Recipients">
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.txt" hidden onChange={onFile} />
                <Button onClick={() => fileRef.current?.click()} disabled={busy}>
                  <Upload className="h-4 w-4" /> Upload CSV / Excel
                </Button>
                <span className="text-zinc-500">{fileName ? `${fileName} (${file.rows.length} rows)` : "Max 5 MB. First row must be headers."}</span>
              </div>
              {file && (
                <SelectField
                  label="Phone number column"
                  value={form.phoneColumn}
                  onChange={(v) => {
                    set({ phoneColumn: v });
                    setRecipientPreview(null);
                  }}
                  options={[["", "Auto-detect"], ...file.columns.map((c) => [c, c])]}
                />
              )}
              <TextArea
                label="Or enter numbers manually"
                rows={4}
                value={form.manualNumbers}
                hint="One per line or comma separated"
                onChange={(v) => {
                  set({ manualNumbers: v });
                  setRecipientPreview(null);
                }}
              />
              <TextField
                label="Default country code"
                placeholder="e.g. 91"
                value={form.defaultCountryCode}
                hint="Applied to numbers without an international prefix"
                onChange={(v) => {
                  set({ defaultCountryCode: v.replace(/\D/g, "") });
                  setRecipientPreview(null);
                }}
              />
              <div>
                <Button variant="primary" disabled={busy || (!file && !form.manualNumbers.trim())} onClick={checkRecipients}>
                  Validate &amp; preview
                </Button>
              </div>
              {recipientPreview && (
                <div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Badge tone="green">{recipientPreview.validCount} valid</Badge>
                    <Badge tone={recipientPreview.invalidCount ? "red" : "neutral"}>{recipientPreview.invalidCount} invalid</Badge>
                    <Badge>{recipientPreview.duplicateCount} duplicates removed</Badge>
                    <Badge tone={recipientPreview.optedOutCount ? "amber" : "neutral"}>{recipientPreview.optedOutCount} opted out</Badge>
                    {recipientPreview.noConsentCount > 0 && <Badge tone="amber">{recipientPreview.noConsentCount} without consent in file</Badge>}
                  </div>
                  <p className="mb-3 text-zinc-500">
                    Estimated time at the default rate: ~{recipientPreview.estimatedMinutes} min. Limit for this account:{" "}
                    {recipientPreview.limits.maxRecipients} recipients.
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-[#26262b]">
                    <table className="w-full text-left text-xs">
                      <thead className="text-zinc-500">
                        <tr><th className="px-3 py-2">Phone</th><th className="px-3 py-2">Name</th></tr>
                      </thead>
                      <tbody>
                        {recipientPreview.sample.map((r) => (
                          <tr key={r.phone} className="border-t border-[#1b1b20]">
                            <td className="px-3 py-1.5 font-mono">+{r.phone}</td>
                            <td className="px-3 py-1.5">{r.name || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {recipientPreview.invalid.length > 0 && (
                    <details className="mt-3 text-xs text-zinc-400">
                      <summary className="cursor-pointer text-red-300">Invalid numbers ({recipientPreview.invalidCount})</summary>
                      <ul className="mt-2 space-y-1">
                        {recipientPreview.invalid.map((r, i) => (
                          <li key={i}><span className="font-mono">{r.rawPhone || "(empty)"}</span> — {r.reason} ({r.source})</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}

        {step === 2 && (
          <Card title="Message">
            <div className="grid gap-4">
              {isCloud ? (
                <>
                  <SelectField
                    label="Approved template"
                    required
                    value={form.templateKey}
                    onChange={(v) => {
                      set({ templateKey: v });
                      setVariableMap({ header: {}, body: {}, buttons: {} });
                      setMessagePreview(null);
                    }}
                    options={[
                      ["", templates.length ? "Select a template" : "No templates loaded"],
                      ...templates.map((t) => [
                        `${t.name}::${t.language}`,
                        `${t.name} (${t.language}) — ${t.status}${t.supported ? "" : " — unsupported"}`,
                      ]),
                    ]}
                  />
                  {template && template.status !== "APPROVED" && <Alert tone="amber">This template is {template.status}; only APPROVED templates can be sent.</Alert>}
                  {template && !template.supported && <Alert tone="amber">{template.unsupportedReason}</Alert>}
                  {template && (
                    <div className="rounded-lg border border-[#26262b] bg-[#0c0c0f] p-3 text-zinc-300">
                      <div className="mb-1 text-xs text-zinc-500">{template.category}</div>
                      <p className="whitespace-pre-wrap">{template.body.text}</p>
                    </div>
                  )}
                  {template?.header && ["IMAGE", "VIDEO", "DOCUMENT"].includes(template.header.format) && (
                    <TextField
                      label={`Header ${template.header.format.toLowerCase()} URL (https)`}
                      required
                      value={form.headerMediaUrl}
                      onChange={(v) => set({ headerMediaUrl: v })}
                    />
                  )}
                  {requiredVars.map(([group, key, label]) => (
                    <VariableRow
                      key={`${group}-${key}`}
                      label={label}
                      spec={variableMap[group]?.[key]}
                      columns={columns}
                      onChange={(spec) => setVar(group, key, spec)}
                    />
                  ))}
                </>
              ) : (
                <TextArea
                  label="Message text"
                  required
                  rows={6}
                  max={4096}
                  value={form.messageText}
                  hint="Use {{1}}, {{2}} … and map them below. Plain text only."
                  onChange={(v) => set({ messageText: v })}
                />
              )}
              {!isCloud &&
                [...new Set([...form.messageText.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))].map((p) => (
                  <VariableRow key={p} label={`{{${p}}}`} spec={variableMap.body?.[p]} columns={columns} onChange={(spec) => setVar("body", p, spec)} />
                ))}

              <div className="grid gap-3 sm:grid-cols-3">
                <TextField
                  label="Concurrency"
                  type="number"
                  min={1}
                  placeholder={String(connection?.limits.defaultConcurrency ?? "")}
                  value={form.concurrency}
                  onChange={(v) => set({ concurrency: v })}
                />
                <TextField
                  label="Messages / minute"
                  type="number"
                  min={1}
                  placeholder={String(connection?.limits.defaultRatePerMinute ?? "")}
                  hint={`Max ${connection?.limits.maxRatePerMinute ?? ""}`}
                  value={form.ratePerMinute}
                  onChange={(v) => set({ ratePerMinute: v })}
                />
                <TextField label="Max attempts" type="number" min={1} max={5} value={form.maxAttempts} onChange={(v) => set({ maxAttempts: v })} />
              </div>

              <div>
                <Button onClick={checkMessage} disabled={busy || !stepValid[2]}>Preview message</Button>
              </div>
              {messagePreview?.missingVariable && (
                <Alert tone="amber">Sample contact has no value for variable {`{{${messagePreview.missingVariable}}}`}. Recipients missing it will be skipped.</Alert>
              )}
              {messagePreview?.preview && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <div className="mb-1 text-xs text-zinc-500">Preview</div>
                  {typeof messagePreview.preview.header === "string" && <div className="mb-1 font-semibold">{messagePreview.preview.header}</div>}
                  {messagePreview.preview.header?.mediaType && <div className="mb-1 text-xs text-zinc-400">[{messagePreview.preview.header.mediaType} header]</div>}
                  <p className="whitespace-pre-wrap">{messagePreview.preview.body}</p>
                  {messagePreview.preview.footer && <div className="mt-1 text-xs text-zinc-500">{messagePreview.preview.footer}</div>}
                </div>
              )}
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card title="Review">
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ["Name", form.name],
                ["Account", `${connection?.phoneNumber || ""} (${isCloud ? "Meta Cloud API" : "QR linked"})`],
                ["Template", isCloud ? `${template?.name} (${template?.language})` : "Plain text message"],
                ["Recipients to send", recipientPreview?.validCount],
                ["Skipped (invalid / opted out)", `${recipientPreview?.invalidCount} / ${recipientPreview?.optedOutCount}`],
                ["Estimated time", `~${Math.ceil((recipientPreview?.validCount || 0) / (Number(form.ratePerMinute) || connection?.limits.defaultRatePerMinute || 1))} min`],
                ["Consent source", form.optInSource],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-zinc-500">{k}</dt>
                  <dd className="break-words">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-zinc-500">
              Creating the campaign saves it as a draft. Nothing is sent until you confirm on the next screen.
            </p>
          </Card>
        )}

        <div className="flex justify-between">
          <Button disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}>Back</Button>
          {step < 3 ? (
            <Button variant="primary" disabled={!stepValid[step] || busy} onClick={goNext}>Next</Button>
          ) : (
            <Button variant="primary" disabled={busy} onClick={create}>
              {busy ? "Creating…" : "Create draft campaign"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
