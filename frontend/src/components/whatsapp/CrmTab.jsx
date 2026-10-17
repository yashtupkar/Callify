import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { SERVER_URL } from "@/lib/constants";
import {
  Badge,
  Button,
  Card,
  SelectField,
  TextField,
  cn,
} from "@/components/whatsapp/automationKit";
import {
  Search,
  ChevronRight,
  FileText,
  X,
  MessageSquare,
  Users,
  Terminal,
  ArrowRight,
  CheckCircle2,
  Clock,
  Phone,
  Send,
  Loader2,
  Check,
  AlertCircle,
  Tag,
} from "lucide-react";

export default function CrmTab({ automation, setTab, onInspectContact }) {
  const [activeSubView, setActiveSubView] = useState("records"); // "records" | "contacts"
  const [summary, setSummary] = useState(null);
  const [records, setRecords] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewRecord, setViewRecord] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (text, type = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchCrmData = useCallback(async () => {
    if (!automation?.id) return;
    setLoading(true);
    try {
      const statusParam = statusFilter === "all" ? "" : `?status=${statusFilter}`;
      const [sumRes, recRes, contRes] = await Promise.all([
        axios.get(
          `${SERVER_URL}/api/whatsapp-automation/${automation.id}/crm/summary`,
          { withCredentials: true }
        ),
        axios.get(
          `${SERVER_URL}/api/whatsapp-automation/${automation.id}/crm/records${statusParam}`,
          { withCredentials: true }
        ),
        axios.get(
          `${SERVER_URL}/api/whatsapp-automation/${automation.id}/crm/contacts?limit=100`,
          { withCredentials: true }
        ),
      ]);
      setSummary(sumRes.data);
      setRecords(recRes.data.records || []);
      setContacts(contRes.data.contacts || []);
    } catch (err) {
      console.error("CRM fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [automation?.id, statusFilter]);

  useEffect(() => {
    fetchCrmData();
  }, [fetchCrmData]);

  const updateStatus = async (status) => {
    if (!viewRecord) return;
    setActionPending(true);
    try {
      await axios.patch(
        `${SERVER_URL}/api/whatsapp-automation/${automation.id}/crm/records/${viewRecord.id}`,
        { status },
        { withCredentials: true }
      );
      setViewRecord({ ...viewRecord, status });
      showToast(`Record marked as ${status}`);
      fetchCrmData();
    } catch (err) {
      console.error("Failed to update status", err);
      showToast("Failed to update record status", "error");
    } finally {
      setActionPending(false);
    }
  };

  const updateContactStage = async (contactId, stage) => {
    setActionPending(true);
    try {
      await axios.patch(
        `${SERVER_URL}/api/whatsapp-automation/${automation.id}/crm/contacts/${contactId}`,
        { stage },
        { withCredentials: true }
      );
      showToast(`Contact moved to ${stage}`);
      fetchCrmData();
    } catch (err) {
      console.error("Failed to update contact stage", err);
      showToast("Failed to update stage", "error");
    } finally {
      setActionPending(false);
    }
  };

  const sendReply = async () => {
    if (!replyText.trim() || !viewRecord?.contactId) return;
    setActionPending(true);
    try {
      await axios.post(
        `${SERVER_URL}/api/whatsapp-automation/${automation.id}/crm/contacts/${viewRecord.contactId}/message`,
        { text: replyText },
        { withCredentials: true }
      );
      setReplyText("");
      showToast("WhatsApp message sent successfully!");
      fetchCrmData();
    } catch (err) {
      console.error("Failed to send reply", err);
      showToast(err.response?.data?.error || "Failed to send message", "error");
    } finally {
      setActionPending(false);
    }
  };

  const jumpToLogs = (waId) => {
    if (onInspectContact) {
      onInspectContact(waId);
    } else if (setTab) {
      setTab("logs");
    }
  };

  // Filtered records
  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      const contactStr = `${r.contact?.name || ""} ${r.contact?.waId || ""}`.toLowerCase();
      const fieldsStr = Object.values(r.fields || {}).join(" ").toLowerCase();
      return (
        r.reference?.toLowerCase().includes(q) ||
        r.title?.toLowerCase().includes(q) ||
        r.type?.toLowerCase().includes(q) ||
        contactStr.includes(q) ||
        fieldsStr.includes(q)
      );
    });
  }, [records, statusFilter, searchQuery]);

  // Filtered contacts
  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return contacts.filter((c) => {
      if (stageFilter !== "all" && c.stage !== stageFilter) return false;
      if (!q) return true;
      const tagsStr = (c.tags || []).join(" ").toLowerCase();
      return (
        (c.name || "").toLowerCase().includes(q) ||
        (c.waId || "").includes(q) ||
        tagsStr.includes(q)
      );
    });
  }, [contacts, stageFilter, searchQuery]);

  const totalLeads = useMemo(() => {
    return Object.values(summary?.stages || {}).reduce((a, b) => a + b, 0);
  }, [summary]);

  return (
    <div className="space-y-5">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          className={cn(
            "fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-2xl backdrop-blur transition animate-in fade-in slide-in-from-bottom-3",
            toastMessage.type === "error"
              ? "border-red-500/50 bg-red-950/90 text-red-100"
              : "border-emerald-500/50 bg-emerald-950/90 text-emerald-100"
          )}
        >
          {toastMessage.type === "error" ? (
            <AlertCircle className="h-4 w-4 text-red-400" />
          ) : (
            <Check className="h-4 w-4 text-emerald-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Top Banner: Overview Stats + Fast Switch to Live Logs */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#26262b] bg-[#111114] p-4">
        <div className="grid grid-cols-2 gap-4 sm:flex sm:items-center sm:gap-8">
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">
              Open Requests
            </div>
            <div className="mt-0.5 text-2xl font-bold tabular-nums text-sky-400">
              {summary?.openRecords ?? 0}
            </div>
          </div>
          <div className="h-8 w-px bg-[#26262b] hidden sm:block" />
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">
              Overdue
            </div>
            <div
              className={cn(
                "mt-0.5 text-2xl font-bold tabular-nums",
                (summary?.overdueRecords || 0) > 0
                  ? "text-red-400"
                  : "text-zinc-400"
              )}
            >
              {summary?.overdueRecords ?? 0}
            </div>
          </div>
          <div className="h-8 w-px bg-[#26262b] hidden sm:block" />
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">
              Total Captured Leads
            </div>
            <div className="mt-0.5 text-2xl font-bold tabular-nums text-emerald-400">
              {totalLeads}
            </div>
          </div>
        </div>

        {/* 1-Click Fast Switch to Logs */}
        {setTab && (
          <Button
            variant="default"
            size="sm"
            onClick={() => setTab("logs")}
            className="border-sky-500/30 bg-sky-500/10 text-sky-300 hover:border-sky-500/50 hover:bg-sky-500/20"
          >
            <Terminal className="h-3.5 w-3.5" />
            Switch to Live Logs
            <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* View Switcher & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-[#26262b] bg-[#0c0c0f] p-1">
          <button
            type="button"
            onClick={() => {
              setActiveSubView("records");
              setSearchQuery("");
            }}
            className={cn(
              "flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium transition",
              activeSubView === "records"
                ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <FileText className="h-3.5 w-3.5" />
            Customer Requests ({records.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveSubView("contacts");
              setSearchQuery("");
            }}
            className={cn(
              "flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium transition",
              activeSubView === "contacts"
                ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Contacts &amp; Leads ({contacts.length})
          </button>
        </div>

        {/* Filters and search */}
        <div className="flex flex-wrap items-center gap-2.5">
          {activeSubView === "records" ? (
            <div className="inline-flex rounded-lg border border-[#26262b] bg-[#0c0c0f] p-1 text-xs">
              {[
                ["all", "All"],
                ["open", "Open"],
                ["done", "Completed"],
                ["cancelled", "Cancelled"],
              ].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setStatusFilter(val)}
                  className={cn(
                    "rounded px-2.5 py-1 transition",
                    statusFilter === val
                      ? "bg-[#26262b] font-medium text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <div className="inline-flex rounded-lg border border-[#26262b] bg-[#0c0c0f] p-1 text-xs">
              {[
                ["all", "All"],
                ["new", "New"],
                ["contacted", "Contacted"],
                ["qualified", "Qualified"],
                ["won", "Won"],
                ["lost", "Lost"],
              ].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setStageFilter(val)}
                  className={cn(
                    "rounded px-2 py-1 capitalize transition",
                    stageFilter === val
                      ? "bg-[#26262b] font-medium text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Search bar */}
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeSubView === "records"
                  ? "Search reference, title, customer..."
                  : "Search customer name or phone..."
              }
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
      </div>

      {/* Main Table Content */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-[#26262b] bg-[#111114]">
          <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
        </div>
      ) : activeSubView === "records" ? (
        /* Records Table */
        <div className="overflow-hidden rounded-xl border border-[#26262b] bg-[#111114]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#26262b] bg-[#16161a] text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              <tr>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Title / Summary</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#202025]">
              {filteredRecords.length > 0 ? (
                filteredRecords.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setViewRecord(r)}
                    className="cursor-pointer transition hover:bg-[#16161c]"
                  >
                    <td className="px-4 py-3 font-mono font-medium text-sky-400">
                      {r.reference}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="sky" className="capitalize">
                        {r.type.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-zinc-200">
                      <div className="font-medium">
                        {r.contact?.name || "WhatsApp Customer"}
                      </div>
                      <div className="font-mono text-[11px] text-zinc-500">
                        +{r.contact?.waId}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-100 max-w-xs truncate">
                      {r.title}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          r.status === "open"
                            ? "amber"
                            : r.status === "done"
                            ? "green"
                            : "red"
                        }
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            r.status === "open"
                              ? "bg-amber-400"
                              : r.status === "done"
                              ? "bg-emerald-400"
                              : "bg-red-400"
                          )}
                        />
                        {r.status === "done" ? "Completed" : r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div
                        className="flex items-center justify-end gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => jumpToLogs(r.contact?.waId)}
                          title="Inspect live logs for this customer"
                          className="rounded-md border border-[#26262b] bg-[#16161a] p-1.5 text-zinc-400 transition hover:border-sky-500/50 hover:text-sky-300"
                        >
                          <Terminal className="h-3.5 w-3.5" />
                        </button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setViewRecord(r)}
                          className="hover:text-white"
                        >
                          View <ChevronRight className="ml-1 h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-zinc-500">
                    <FileText className="mx-auto mb-2 h-8 w-8 opacity-25" />
                    <p className="font-medium text-zinc-400">
                      {records.length
                        ? "No requests match the selected filters"
                        : "No customer requests recorded yet"}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-600">
                      When customers ask to book, register, or submit requests on
                      WhatsApp, the AI creates records here.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Contacts Table */
        <div className="overflow-hidden rounded-xl border border-[#26262b] bg-[#111114]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#26262b] bg-[#16161a] text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Tags</th>
                <th className="px-4 py-3">Active Requests</th>
                <th className="px-4 py-3">Last Message</th>
                <th className="px-4 py-3 text-right">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#202025]">
              {filteredContacts.length > 0 ? (
                filteredContacts.map((c) => (
                  <tr key={c.id} className="transition hover:bg-[#16161c]">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-zinc-100">
                        {c.name || "Unknown Name"}
                      </div>
                      <div className="font-mono text-[11px] text-sky-400">
                        +{c.waId}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={c.stage || "new"}
                        onChange={(e) =>
                          updateContactStage(c.id, e.target.value)
                        }
                        className="rounded border border-[#26262b] bg-[#0c0c0f] px-2 py-1 text-xs capitalize text-zinc-300 outline-none transition focus:border-sky-500"
                      >
                        {[
                          "new",
                          "contacted",
                          "qualified",
                          "proposal",
                          "won",
                          "lost",
                        ].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(c.tags || []).length > 0 ? (
                          c.tags.map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-[#1e1e24] px-2 py-0.5 text-[10px] text-zinc-400"
                            >
                              {t}
                            </span>
                          ))
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {c._count?.records ?? 0}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {c.lastMessageAt
                        ? new Date(c.lastMessageAt).toLocaleString([], {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          className="border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
                          onClick={() => jumpToLogs(c.waId)}
                        >
                          <Terminal className="h-3.5 w-3.5" />
                          View in Logs
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-zinc-500">
                    <Users className="mx-auto mb-2 h-8 w-8 opacity-25" />
                    <p className="font-medium text-zinc-400">
                      {contacts.length
                        ? "No contacts match your filters"
                        : "No contacts captured yet"}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-600">
                      Every customer who messages this WhatsApp automation will
                      automatically appear here.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Record Inspection & WhatsApp Reply Modal */}
      {viewRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#26262b] bg-[#0c0c0f] shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#26262b] bg-[#111114] px-6 py-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-sm font-semibold text-sky-400">
                    {viewRecord.reference}
                  </span>
                  <Badge
                    tone={
                      viewRecord.status === "open"
                        ? "amber"
                        : viewRecord.status === "done"
                        ? "green"
                        : "red"
                    }
                  >
                    {viewRecord.status === "done"
                      ? "Completed"
                      : viewRecord.status}
                  </Badge>
                  <span className="text-xs uppercase text-zinc-500">
                    {viewRecord.type.replace(/_/g, " ")}
                  </span>
                </div>
                <h3 className="mt-1 text-base font-semibold text-zinc-100">
                  {viewRecord.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewRecord(null)}
                className="rounded-lg p-2 text-zinc-400 transition hover:bg-[#1a1a20] hover:text-zinc-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {/* Customer Contact Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#26262b] bg-[#141418] p-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-sky-500/10 text-sky-400">
                    <Phone className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">
                      {viewRecord.contact?.name || "WhatsApp Customer"}
                    </div>
                    <div className="font-mono text-xs text-zinc-400">
                      +{viewRecord.contact?.waId}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
                    onClick={() => {
                      const wa = viewRecord.contact?.waId;
                      setViewRecord(null);
                      jumpToLogs(wa);
                    }}
                  >
                    <Terminal className="h-3.5 w-3.5" />
                    Inspect in Live Logs
                  </Button>
                </div>
              </div>

              {/* Collected Data / Fields */}
              <div>
                <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Collected Information
                </h4>
                {viewRecord.fields &&
                Object.keys(viewRecord.fields).length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(viewRecord.fields).map(([k, v]) => (
                      <div
                        key={k}
                        className="rounded-lg border border-[#26262b] bg-[#141418] p-3"
                      >
                        <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                          {k.replace(/_/g, " ")}
                        </div>
                        <div className="mt-1 break-words text-sm font-medium text-zinc-200">
                          {String(v)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-[#26262b] p-4 text-center text-xs text-zinc-500">
                    No custom fields collected.
                  </div>
                )}
              </div>

              {/* Status Update Actions */}
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Update Request Status
                </h4>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={viewRecord.status === "open" ? "primary" : "default"}
                    disabled={actionPending || viewRecord.status === "open"}
                    onClick={() => updateStatus("open")}
                  >
                    Mark Open
                  </Button>
                  <Button
                    size="sm"
                    variant={viewRecord.status === "done" ? "primary" : "default"}
                    className={
                      viewRecord.status === "done"
                        ? "border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700"
                        : ""
                    }
                    disabled={actionPending || viewRecord.status === "done"}
                    onClick={() => updateStatus("done")}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Mark Completed
                  </Button>
                  <Button
                    size="sm"
                    variant={viewRecord.status === "cancelled" ? "danger" : "default"}
                    disabled={actionPending || viewRecord.status === "cancelled"}
                    onClick={() => updateStatus("cancelled")}
                  >
                    Cancel Request
                  </Button>
                </div>
              </div>

              {/* Direct WhatsApp Reply */}
              <div className="rounded-xl border border-[#26262b] bg-[#141418] p-4">
                <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  <MessageSquare className="h-3.5 w-3.5 text-sky-400" />
                  Send WhatsApp Message to Customer
                </h4>
                <p className="mt-0.5 text-xs text-zinc-500">
                  This message will be dispatched directly to +
                  {viewRecord.contact?.waId} from this automation.
                </p>

                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your response to the customer..."
                  rows={4}
                  className="mt-3 w-full rounded-lg border border-[#26262b] bg-[#0c0c0f] p-3 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-sky-500"
                />

                <div className="mt-3 flex items-center justify-end">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!replyText.trim() || actionPending}
                    onClick={sendReply}
                  >
                    {actionPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Send on WhatsApp
                  </Button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end border-t border-[#26262b] bg-[#111114] px-6 py-3">
              <Button onClick={() => setViewRecord(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
