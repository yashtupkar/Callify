import { useEffect, useState } from "react";
import { Button, Modal, SelectField, TextArea, TextField, apiError } from "@/components/whatsapp/automationKit";
import { campaignApi } from "@/lib/campaignApi";
import { VariableRow } from "@/pages/CampaignCreatePage";

const EMPTY_MAP = { header: {}, body: {}, buttons: {} };

/** Edits a draft (name, message, settings) or a paused campaign (name, settings). Recipients are not editable. */
export default function CampaignEditModal({ campaign, onClose, onSaved }) {
  const isDraft = campaign.status === "draft";
  const isCloud = campaign.channel === "cloud_api";
  const [cfg, setCfg] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [columns, setColumns] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const c = await campaignApi.config(campaign.id);
        if (!live) return;
        setCfg({
          ...c,
          templateKey: c.templateName ? `${c.templateName}::${c.templateLanguage}` : "",
          variableMap: { ...EMPTY_MAP, ...c.variableMap },
          headerMediaUrl: c.headerMediaUrl || "",
          messageText: c.messageText || "",
        });
        if (isDraft) {
          const first = (await campaignApi.recipients(campaign.id, { status: "pending", limit: 1 })).items[0];
          if (live) setColumns(Object.keys(first?.variables || {}));
          if (isCloud) {
            const t = await campaignApi.templates(campaign.connectionId);
            if (live) setTemplates(t.templates);
          }
        }
      } catch (e) {
        if (live) setError(apiError(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [campaign.id, campaign.connectionId, isDraft, isCloud]);

  if (!cfg) {
    return (
      <Modal title="Edit campaign" onClose={onClose}>
        {error ? <p className="text-red-300">{error}</p> : <p className="text-zinc-400">Loading…</p>}
      </Modal>
    );
  }

  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));
  const template = templates.find((t) => `${t.name}::${t.language}` === cfg.templateKey);
  const setVar = (group, key, spec) => set({ variableMap: { ...cfg.variableMap, [group]: { ...cfg.variableMap[group], [key]: spec } } });

  const vars = [];
  if (isDraft && isCloud && template) {
    vars.push(...(template.header?.placeholders || []).map((p) => ["header", p, `Header {{${p}}}`]));
    vars.push(...template.body.placeholders.map((p) => ["body", p, `Body {{${p}}}`]));
    vars.push(...template.buttons.filter((b) => b.hasVariable).map((b) => ["buttons", String(b.index), `Button ${b.index + 1}`]));
  } else if (isDraft && !isCloud) {
    [...new Set([...cfg.messageText.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))].forEach((p) => vars.push(["body", p, `{{${p}}}`]));
  }

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const body = {
        name: cfg.name,
        concurrency: Number(cfg.concurrency),
        ratePerMinute: Number(cfg.ratePerMinute),
        maxAttempts: Number(cfg.maxAttempts),
        dailyLimit: Number(cfg.dailyLimit),
      };
      if (isDraft) {
        Object.assign(body, { variableMap: cfg.variableMap, headerMediaUrl: cfg.headerMediaUrl || null });
        if (isCloud) Object.assign(body, { templateName: template?.name, templateLanguage: template?.language });
        else body.messageText = cfg.messageText;
      }
      onSaved(await campaignApi.update(campaign.id, body));
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title="Edit campaign"
      description={isDraft ? "Recipients can't be changed. To use a different list, create a new campaign." : "Paused campaigns can only change name and sending settings."}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" disabled={busy || (isDraft && isCloud && !template)} onClick={save}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error && <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-200">{error}</div>}
        <TextField label="Campaign name" max={120} value={cfg.name} onChange={(v) => set({ name: v })} />
        {isDraft && isCloud && (
          <SelectField
            label="Approved template"
            value={cfg.templateKey}
            onChange={(v) => set({ templateKey: v, variableMap: EMPTY_MAP })}
            options={[["", "Select a template"], ...templates.map((t) => [`${t.name}::${t.language}`, `${t.name} (${t.language}) — ${t.status}`])]}
          />
        )}
        {isDraft && !isCloud && <TextArea label="Message text" rows={5} max={4096} value={cfg.messageText} onChange={(v) => set({ messageText: v })} />}
        {isDraft && isCloud && template?.header && ["IMAGE", "VIDEO", "DOCUMENT"].includes(template.header.format) && (
          <TextField label="Header media URL (https)" value={cfg.headerMediaUrl} onChange={(v) => set({ headerMediaUrl: v })} />
        )}
        {vars.map(([group, key, label]) => (
          <VariableRow key={`${group}-${key}`} label={label} spec={cfg.variableMap[group]?.[key]} columns={columns} onChange={(spec) => setVar(group, key, spec)} />
        ))}
        <div className="grid gap-3 sm:grid-cols-4">
          <TextField label="Concurrency" type="number" min={1} value={String(cfg.concurrency)} onChange={(v) => set({ concurrency: v })} />
          <TextField label="Messages / minute" type="number" min={1} value={String(cfg.ratePerMinute)} onChange={(v) => set({ ratePerMinute: v })} />
          <TextField label="Max attempts" type="number" min={1} max={5} value={String(cfg.maxAttempts)} onChange={(v) => set({ maxAttempts: v })} />
          <TextField label="Daily limit" type="number" min={1} value={String(cfg.dailyLimit)} onChange={(v) => set({ dailyLimit: v })} />
        </div>
      </div>
    </Modal>
  );
}
