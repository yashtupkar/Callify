import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Download, Pause, Pencil, Play, XCircle } from "lucide-react";
import CampaignEditModal from "@/components/campaigns/CampaignEditModal";
import { Badge, Button, Card, ConfirmModal, Skeleton, TextField, apiError, cn } from "@/components/whatsapp/automationKit";
import { campaignApi } from "@/lib/campaignApi";
import { ProgressBar, StatusBadge } from "@/pages/CampaignsPage";
import { STATUS_TONE } from "@/lib/campaignApi";

const FILTERS = ["all", "pending", "queued", "sent", "delivered", "read", "failed", "skipped"];
const LIVE = ["running", "paused"];

const Stat = ({ label, value }) => (
  <div className="rounded-lg border border-[#26262b] bg-[#0c0c0f] px-4 py-3">
    <div className="text-xs text-zinc-500">{label}</div>
    <div className="text-lg font-semibold tabular-nums">{value}</div>
  </div>
);

export default function CampaignDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [recipients, setRecipients] = useState({ items: [], total: 0 });
  const [report, setReport] = useState(null);
  const [confirmCount, setConfirmCount] = useState("");
  const [acceptRisk, setAcceptRisk] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [searchParams] = useSearchParams();
  const [editing, setEditing] = useState(searchParams.get("edit") === "1");

  const load = useCallback(async () => {
    try {
      setCampaign(await campaignApi.get(id));
      setRecipients(await campaignApi.recipients(id, { status: filter === "all" ? undefined : filter, limit: 100 }));
    } catch (e) {
      setError(apiError(e));
    }
  }, [id, filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!campaign || !LIVE.includes(campaign.status)) return undefined;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [campaign, load]);

  const finished = campaign && ["completed", "cancelled", "failed"].includes(campaign.status);
  useEffect(() => {
    if (finished) campaignApi.report(id).then(setReport).catch((e) => setError(apiError(e)));
  }, [finished, id]);

  const act = async (fn) => {
    setBusy(true);
    setError("");
    try {
      setCampaign(await fn());
      await load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    try {
      const blob = await campaignApi.reportCsv(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `campaign-${id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(apiError(e));
    }
  };

  if (!campaign) return <div className="min-h-screen bg-[#09090b] p-8">{error ? <p className="text-red-300">{error}</p> : <Skeleton rows={3} />}</div>;
  const c = campaign.counts;
  const pending = c.pending;

  return (
    <div className="min-h-screen bg-[#09090b] text-sm text-zinc-100 antialiased">
      <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-7">
        <button onClick={() => navigate("/whatsapp/campaigns")} className="mb-4 inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-100">
          <ArrowLeft className="h-4 w-4" /> Campaigns
        </button>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-3 text-lg font-semibold">
              {campaign.name} <StatusBadge status={campaign.status} />
            </h1>
            <p className="mt-1 text-zinc-500">
              {campaign.channel === "cloud_api" ? `Template ${campaign.templateName}` : "Plain text (QR linked)"} · {campaign.concurrency} concurrent · {campaign.ratePerMinute}/min
            </p>
          </div>
          <div className="flex gap-2">
            {["draft", "paused"].includes(campaign.status) && <Button disabled={busy} onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
            {campaign.status === "running" && <Button disabled={busy} onClick={() => act(() => campaignApi.action(id, "pause"))}><Pause className="h-4 w-4" /> Pause</Button>}
            {campaign.status === "paused" && <Button variant="primary" disabled={busy} onClick={() => act(() => campaignApi.action(id, "resume"))}><Play className="h-4 w-4" /> Resume</Button>}
            {["draft", "running", "paused"].includes(campaign.status) && (
              <Button variant="danger" disabled={busy} onClick={() => setConfirmCancel(true)}><XCircle className="h-4 w-4" /> Cancel</Button>
            )}
          </div>
        </div>

        {error && <div role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-200">{error}</div>}
        {campaign.statusNote && campaign.status !== "draft" && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-200">{campaign.statusNote}</div>
        )}

        {campaign.status === "draft" && (
          <Card title="Confirm & send">
            <p className="mb-3 text-zinc-300">
              This will send to <strong>{pending}</strong> recipients (about {Math.ceil(pending / Math.max(1, campaign.ratePerMinute))} min).
              {c.skipped > 0 && ` ${c.skipped} entries are already skipped (invalid, opted out or missing data).`} This cannot be undone once messages are sent.
            </p>
            {campaign.channel === "baileys" && (
              <label className="mb-3 flex items-start gap-2 text-amber-200">
                <input type="checkbox" checked={acceptRisk} onChange={(e) => setAcceptRisk(e.target.checked)} className="mt-0.5" />
                I accept the risk of using an unofficial connection for bulk messaging.
              </label>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <TextField label={`Type ${pending} to confirm`} value={confirmCount} onChange={setConfirmCount} className="w-56" />
              <Button
                variant="primary"
                disabled={busy || Number(confirmCount) !== pending || (campaign.channel === "baileys" && !acceptRisk)}
                onClick={() => act(() => campaignApi.launch(id, { confirmRecipientCount: Number(confirmCount), acceptUnofficialRisk: acceptRisk }))}
              >
                Send campaign
              </Button>
            </div>
          </Card>
        )}

        <Card title="Progress">
          <div className="mb-2 flex justify-between text-xs text-zinc-400">
            <span>{campaign.progressPercent}% processed</span>
            {campaign.status === "running" && <span>~{campaign.estimatedMinutesRemaining} min remaining</span>}
          </div>
          <ProgressBar value={campaign.progressPercent} />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <Stat label="Total" value={c.total} />
            <Stat label="Queued" value={c.pending + c.queued} />
            <Stat label="Sent" value={c.accepted} />
            <Stat label="Delivered" value={campaign.tracksDelivery ? c.delivered + c.read : "n/a"} />
            <Stat label="Read" value={campaign.tracksDelivery ? c.read : "n/a"} />
            <Stat label="Failed" value={c.failed} />
            <Stat label="Skipped" value={c.skipped} />
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            {campaign.tracksDelivery
              ? "“Sent” means Meta accepted the message, not that it was delivered. Delivery and read states arrive via WhatsApp webhooks and require webhook setup."
              : "QR-linked accounts do not report delivery. “Sent” only means the message was handed to WhatsApp."}
          </p>
        </Card>

        {report && (
          <Card
            title="Final report"
            action={<Button size="sm" onClick={download}><Download className="h-3.5 w-3.5" /> Download CSV</Button>}
          >
            {Object.keys(report.failureReasons).length === 0 && Object.keys(report.skipReasons).length === 0 ? (
              <p className="text-zinc-400">No failures or skipped recipients.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {[["Failure reasons", report.failureReasons], ["Skipped reasons", report.skipReasons]].map(([title, map]) => (
                  <div key={title}>
                    <div className="mb-2 text-xs text-zinc-500">{title}</div>
                    {Object.entries(map).map(([k, v]) => (
                      <div key={k} className="flex justify-between border-b border-[#1b1b20] py-1"><span className="font-mono text-xs">{k}</span><span>{v}</span></div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {report.failures.length > 0 && (
              <details className="mt-4 text-xs text-zinc-300">
                <summary className="cursor-pointer text-red-300">Failure details ({report.failures.length})</summary>
                <ul className="mt-2 space-y-1">
                  {report.failures.map((f, i) => (
                    <li key={i}><span className="font-mono">+{f.phone}</span> — {f.errorCode}: {f.errorMessage}</li>
                  ))}
                </ul>
              </details>
            )}
            <p className="mt-3 text-xs text-zinc-500">{report.note}</p>
          </Card>
        )}

        <Card title="Recipients">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs capitalize",
                  filter === f ? "border-sky-500/50 bg-sky-500/10 text-sky-300" : "border-[#26262b] text-zinc-400 hover:text-zinc-100",
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="text-zinc-500">
                <tr><th className="py-2">Phone</th><th>Name</th><th>Status</th><th>Detail</th></tr>
              </thead>
              <tbody>
                {recipients.items.map((r) => (
                  <tr key={r.id} className="border-t border-[#1b1b20]">
                    <td className="py-2 font-mono">{r.phone ? `+${r.phone}` : r.rawPhone}</td>
                    <td>{r.name || "—"}</td>
                    <td><Badge tone={STATUS_TONE[r.status] || "neutral"}>{r.status}</Badge></td>
                    <td className="text-zinc-500">{r.errorMessage || r.skipReason || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recipients.items.length === 0 && <p className="py-4 text-center text-zinc-500">No recipients.</p>}
          </div>
          {recipients.total > recipients.items.length && <p className="mt-2 text-xs text-zinc-500">Showing first {recipients.items.length} of {recipients.total}. Download the CSV for the full list.</p>}
        </Card>
      </div>
      {editing && (
        <CampaignEditModal
          campaign={campaign}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setCampaign(updated);
            setEditing(false);
          }}
        />
      )}
      {confirmCancel && (
        <ConfirmModal
          title="Cancel campaign?"
          body="Unsent recipients will be skipped. Messages already being sent will still complete."
          confirmLabel="Cancel campaign"
          busy={busy}
          onClose={() => setConfirmCancel(false)}
          onConfirm={async () => {
            await act(() => campaignApi.action(id, "cancel"));
            setConfirmCancel(false);
          }}
        />
      )}
    </div>
  );
}
