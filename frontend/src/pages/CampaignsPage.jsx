import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Megaphone, Plus, RefreshCw } from "lucide-react";
import { Badge, Button, Skeleton, apiError, ago } from "@/components/whatsapp/automationKit";
import { campaignApi, STATUS_TONE } from "@/lib/campaignApi";

export const StatusBadge = ({ status }) => (
  <Badge tone={STATUS_TONE[status] || "neutral"}>{status}</Badge>
);

export const ProgressBar = ({ value }) => (
  <div
    className="h-1.5 w-full overflow-hidden rounded-full bg-[#1b1b20]"
    role="progressbar"
    aria-valuenow={value}
    aria-valuemin={0}
    aria-valuemax={100}
  >
    <div className="h-full bg-sky-500 transition-all" style={{ width: `${value}%` }} />
  </div>
);

export default function CampaignsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setItems((await campaignApi.list()).items);
      setError("");
    } catch (err) {
      setError(apiError(err));
      setItems((prev) => prev || []);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="min-h-screen bg-[#09090b] text-sm text-zinc-100 antialiased">
      <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-7">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <Megaphone className="h-5 w-5 text-sky-400" /> WhatsApp Campaigns
            </h1>
            <p className="mt-1 text-zinc-500">
              Send approved templates to contacts who have opted in.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} aria-label="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="primary" onClick={() => navigate("/whatsapp/campaigns/new")}>
              <Plus className="h-4 w-4" /> New campaign
            </Button>
          </div>
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-200">
            {error}
          </div>
        )}

        {items === null ? (
          <Skeleton rows={4} />
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#26262b] p-10 text-center text-zinc-500">
            No campaigns yet. Create your first campaign.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#26262b] bg-[#111114]">
            <table className="w-full min-w-[820px] text-left">
              <thead className="border-b border-[#26262b] text-xs text-zinc-500">
                <tr>
                  {["Campaign", "Status", "Progress", "Recipients", "Sent", "Delivered", "Read", "Failed", "Created", ""].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr
                    key={c.id}
                    tabIndex={0}
                    onClick={() => navigate(`/whatsapp/campaigns/${c.id}`)}
                    onKeyDown={(e) => e.key === "Enter" && navigate(`/whatsapp/campaigns/${c.id}`)}
                    className="cursor-pointer border-b border-[#1b1b20] last:border-0 hover:bg-white/[0.03] focus-visible:bg-white/[0.05] focus-visible:outline-none"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-zinc-500">
                        {c.channel === "cloud_api" ? c.templateName : "Text message"}
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="w-40 px-4 py-3">
                      <ProgressBar value={c.progressPercent} />
                      <div className="mt-1 text-[11px] text-zinc-500">{c.progressPercent}%</div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{c.counts.total}</td>
                    <td className="px-4 py-3 tabular-nums">{c.counts.accepted}</td>
                    <td className="px-4 py-3 tabular-nums">{c.tracksDelivery ? c.counts.delivered + c.counts.read : "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{c.tracksDelivery ? c.counts.read : "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-red-300">{c.counts.failed}</td>
                    <td className="px-4 py-3 text-zinc-500">{ago(c.createdAt)}</td>
                    <td className="px-4 py-3">
                      {["draft", "paused"].includes(c.status) && (
                        <Button size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/whatsapp/campaigns/${c.id}?edit=1`); }}>Edit</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
