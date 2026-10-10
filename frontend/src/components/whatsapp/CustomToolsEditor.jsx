import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

const STAGES = ["", "new", "contacted", "qualified", "proposal", "won", "lost"];

const PRESETS = [
  {
    title: "Book site survey",
    description: "Customer wants a site visit or survey.",
    fields: ["Name", "Address", "Phone"],
    askWhen: true,
    stage: "qualified",
    replyMessage: "Your site survey request {{ref}} is received. Our team will confirm the time.",
  },
  {
    title: "Create lead",
    description: "Customer is interested in buying or wants a quote.",
    fields: ["Name", "Requirement"],
    stage: "qualified",
    replyMessage: "Thanks! We've noted your interest ({{ref}}). Someone will contact you soon.",
  },
  {
    title: "Register complaint",
    description: "Customer has a complaint or problem.",
    fields: ["Name", "Issue"],
    replyMessage: "Sorry about that. Your complaint {{ref}} is registered and our team will look into it.",
  },
  {
    title: "Callback request",
    description: "Customer wants someone to call them back.",
    fields: ["Name"],
    askWhen: true,
    replyMessage: "Callback requested ({{ref}}). We'll call you at that time.",
  },
];

const slug = (v) => String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
const input = "w-full rounded-lg border border-[#26262b] bg-[#16161a] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500/60";

const toRow = (draft) => {
  const name = slug(draft.title);
  return {
    name,
    description: draft.description,
    enabled: true,
    config: {
      type: "custom",
      name,
      title: draft.title.trim(),
      description: draft.description.trim(),
      fields: draft.fields.map((label) => ({ label, required: true })),
      askWhen: Boolean(draft.askWhen),
      stage: draft.stage || "",
      replyMessage: draft.replyMessage || "",
    },
  };
};

const toDraft = (row) => ({
  title: row.config.title || row.name,
  description: row.config.description || "",
  fields: (row.config.fields || []).map((f) => f.label),
  askWhen: Boolean(row.config.askWhen),
  stage: row.config.stage || "",
  replyMessage: row.config.replyMessage || "",
});

const blank = { title: "", description: "", fields: [], askWhen: false, stage: "", replyMessage: "" };

/** Simple builder for no-code tools that save requests into the WhatsApp CRM. */
export default function CustomToolsEditor({ tools, onChange }) {
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(null);
  const [fieldText, setFieldText] = useState("");
  const custom = tools.filter((t) => t.config?.type === "custom");

  const addField = () => {
    const label = fieldText.trim();
    if (label && !draft.fields.includes(label)) setDraft({ ...draft, fields: [...draft.fields, label] });
    setFieldText("");
  };

  const save = () => {
    const row = toRow(draft);
    if (!row.name || !draft.description.trim()) return;
    const rest = tools.filter((t) => t.name !== editing && t.name !== row.name);
    onChange([...rest, row]);
    setDraft(null);
    setEditing(null);
  };

  return (
    <div>
      <p className="mb-3 text-xs text-zinc-500">
        Create your own tools without code. The AI collects the details in chat and saves them to your WhatsApp CRM as a request.
      </p>

      <div className="space-y-2">
        {custom.map((tool) => (
          <div key={tool.name} className="flex items-center justify-between rounded-lg border border-[#26262b] bg-[#16161a] px-3 py-2">
            <button type="button" className="text-left" onClick={() => { setDraft(toDraft(tool)); setEditing(tool.name); }}>
              <div className="text-sm text-zinc-100">{tool.config.title}</div>
              <div className="text-xs text-zinc-500">{(tool.config.fields || []).map((f) => f.label).join(", ") || "No fields"}</div>
            </button>
            <button type="button" aria-label="Delete tool" onClick={() => onChange(tools.filter((t) => t.name !== tool.name))}>
              <Trash2 className="h-4 w-4 text-zinc-400" />
            </button>
          </div>
        ))}
      </div>

      {!draft && (
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.title} type="button" onClick={() => { setDraft({ ...blank, ...p }); setEditing(null); }}
              className="rounded-full border border-[#26262b] px-3 py-1 text-xs text-zinc-300 hover:border-sky-500/60">
              + {p.title}
            </button>
          ))}
          <button type="button" onClick={() => { setDraft({ ...blank }); setEditing(null); }}
            className="inline-flex items-center gap-1 rounded-full border border-sky-500/60 px-3 py-1 text-xs text-sky-200">
            <Plus className="h-3 w-3" /> Custom tool
          </button>
        </div>
      )}

      {draft && (
        <div className="mt-3 space-y-3 rounded-lg border border-[#26262b] bg-[#111114] p-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Tool name</label>
            <input className={input} placeholder="e.g. Book site survey" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">When should the AI use it?</label>
            <input className={input} placeholder="e.g. Customer wants a site visit" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">What should the AI ask the customer?</label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {draft.fields.map((f) => (
                <span key={f} className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-1 text-xs text-sky-200">
                  {f}
                  <button type="button" aria-label={`Remove ${f}`} onClick={() => setDraft({ ...draft, fields: draft.fields.filter((x) => x !== f) })}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
            <input className={input} placeholder="Type a question topic, press Enter (e.g. Address)" value={fieldText}
              onChange={(e) => setFieldText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addField(); } }}
              onBlur={addField} />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={draft.askWhen} onChange={(e) => setDraft({ ...draft, askWhen: e.target.checked })} />
            Ask for a date &amp; time
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Move customer to stage (optional)</label>
              <select className={input} value={draft.stage} onChange={(e) => setDraft({ ...draft, stage: e.target.value })}>
                {STAGES.map((s) => <option key={s} value={s}>{s || "Don't change"}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Confirmation message (use {"{{ref}}"} for the ID)</label>
              <input className={input} value={draft.replyMessage} onChange={(e) => setDraft({ ...draft, replyMessage: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setDraft(null); setEditing(null); }} className="rounded-lg px-3 py-1.5 text-sm text-zinc-400">Cancel</button>
            <button type="button" onClick={save} disabled={!draft.title.trim() || !draft.description.trim()}
              className="rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-medium text-black disabled:opacity-40">Save tool</button>
          </div>
        </div>
      )}
    </div>
  );
}
