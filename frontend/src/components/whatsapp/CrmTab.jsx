import React, { useEffect, useState } from "react";
import axios from "axios";
import { SERVER_URL } from "@/lib/constants";
import {
  Card,
  Badge,
  Button,
  SelectField,
  TextField,
  cn,
} from "@/components/whatsapp/automationKit";
import { Search, ChevronRight, FileText, X, MessageSquare } from "lucide-react";

export default function CrmTab({ automation }) {
  const [summary, setSummary] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("open");
  const [viewRecord, setViewRecord] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [actionPending, setActionPending] = useState(false);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const [sumRes, recRes] = await Promise.all([
        axios.get(`${SERVER_URL}/api/whatsapp-automation/${automation.id}/crm/summary`, { withCredentials: true }),
        axios.get(`${SERVER_URL}/api/whatsapp-automation/${automation.id}/crm/records?status=${statusFilter}`, { withCredentials: true })
      ]);
      setSummary(sumRes.data);
      setRecords(recRes.data.records);
    } catch (err) {
      console.error("CRM fetch error", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRecords();
  }, [automation.id, statusFilter]);

  const updateStatus = async (status) => {
    setActionPending(true);
    try {
      await axios.patch(`${SERVER_URL}/api/whatsapp-automation/${automation.id}/crm/records/${viewRecord.id}`, { status }, { withCredentials: true });
      setViewRecord({ ...viewRecord, status });
      fetchRecords();
    } catch (err) {
      console.error("Failed to update status", err);
    }
    setActionPending(false);
  };

  const sendReply = async () => {
    if (!replyText.trim()) return;
    setActionPending(true);
    try {
      // Mocked endpoint for sending messages from CRM
      await axios.post(`${SERVER_URL}/api/whatsapp-automation/${automation.id}/crm/contacts/${viewRecord.contactId}/message`, { text: replyText }, { withCredentials: true });
      setReplyText("");
      alert("Message sent successfully!");
    } catch (err) {
      console.error("Failed to send reply", err);
      alert("Failed to send message.");
    }
    setActionPending(false);
  };

  if (loading) {
    return <div className="text-zinc-500 animate-pulse p-4">Loading CRM Data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* CRM Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Open Records" className="bg-sky-500/10 border-sky-500/20">
          <div className="text-3xl font-bold text-sky-400">{summary?.openRecords || 0}</div>
          <p className="text-sm text-sky-500/60 mt-1">Total pending action</p>
        </Card>
        <Card title="Overdue" className="bg-red-500/10 border-red-500/20">
          <div className="text-3xl font-bold text-red-400">{summary?.overdueRecords || 0}</div>
          <p className="text-sm text-red-500/60 mt-1">Past due date</p>
        </Card>
        <Card title="Total Leads">
          <div className="text-3xl font-bold text-zinc-200">
            {Object.values(summary?.stages || {}).reduce((a, b) => a + b, 0)}
          </div>
          <p className="text-sm text-zinc-500 mt-1">Across all stages</p>
        </Card>
      </div>

      {/* Records Table */}
      <Card title="Active Requests & Records">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1">
            <TextField 
              placeholder="Search records or references..." 
              icon={<Search className="w-4 h-4 text-zinc-500" />} 
            />
          </div>
          <SelectField
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              ["open", "Open"],
              ["done", "Completed"],
              ["cancelled", "Cancelled"]
            ]}
          />
        </div>

        <div className="rounded-xl border border-[#26262b] overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#16161a] border-b border-[#26262b]">
              <tr>
                <th className="px-4 py-3 font-medium text-zinc-400">Reference</th>
                <th className="px-4 py-3 font-medium text-zinc-400">Type</th>
                <th className="px-4 py-3 font-medium text-zinc-400">Contact</th>
                <th className="px-4 py-3 font-medium text-zinc-400">Title</th>
                <th className="px-4 py-3 font-medium text-zinc-400">Status</th>
                <th className="px-4 py-3 font-medium text-zinc-400 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#26262b] bg-[#09090b]">
              {records.length > 0 ? records.map(r => (
                <tr key={r.id} className="hover:bg-[#111114] transition">
                  <td className="px-4 py-3 font-mono text-xs text-sky-400">{r.reference}</td>
                  <td className="px-4 py-3">
                    <Badge tone="indigo">{r.type}</Badge>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {r.contact?.name || r.contact?.waId}
                  </td>
                  <td className="px-4 py-3 font-medium text-zinc-200">
                    {r.title}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={r.status === 'open' ? 'amber' : r.status === 'done' ? 'green' : 'red'}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" className="text-zinc-400 hover:text-white" onClick={() => setViewRecord(r)}>
                      View <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-zinc-500">
                    <FileText className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    No records found for the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Record Details Modal / Drawer */}
      {viewRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl bg-[#09090b] rounded-xl border border-[#26262b] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#26262b] px-6 py-4 bg-[#111114]">
              <div>
                <h3 className="text-lg font-semibold text-zinc-100 flex items-center gap-3">
                  {viewRecord.title}
                  <Badge tone={viewRecord.status === 'open' ? 'amber' : viewRecord.status === 'done' ? 'green' : 'red'}>
                    {viewRecord.status}
                  </Badge>
                </h3>
                <p className="text-sm text-zinc-400 mt-1 flex items-center gap-2">
                  <span className="font-mono text-sky-400">{viewRecord.reference}</span>
                  &bull;
                  <span className="capitalize">{viewRecord.type.replace(/_/g, " ")}</span>
                </p>
              </div>
              <button 
                onClick={() => setViewRecord(null)}
                className="p-2 text-zinc-400 hover:text-zinc-100 bg-[#16161a] hover:bg-[#26262b] rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-[#09090b]">
              <div className="grid grid-cols-2 gap-6">
                {/* Left Col: Details */}
                <div className="space-y-6">
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-2">Collected Information</h4>
                    {viewRecord.fields && Object.keys(viewRecord.fields).length > 0 ? (
                      <div className="space-y-2">
                        {Object.entries(viewRecord.fields).map(([key, value]) => (
                          <div key={key} className="bg-[#16161a] rounded-lg p-3 border border-[#26262b]">
                            <div className="text-xs text-zinc-500 mb-1 capitalize">{key.replace(/_/g, " ")}</div>
                            <div className="text-sm text-zinc-200 font-medium break-words">{String(value)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-zinc-500 italic p-3 border border-dashed border-[#26262b] rounded-lg text-center">
                        No custom fields collected.
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Col: Messaging */}
                <div className="space-y-3 border-l border-[#26262b] pl-6">
                  <h4 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-sky-400" /> WhatsApp Reply
                  </h4>
                  <div className="bg-[#16161a] border border-[#26262b] rounded-lg overflow-hidden flex flex-col">
                    <textarea 
                      className="w-full bg-transparent p-3 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none resize-none"
                      rows={5}
                      placeholder="Type a message to send directly to the customer on WhatsApp..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                    />
                    <div className="bg-[#111114] border-t border-[#26262b] p-2 flex justify-end">
                      <Button size="sm" variant="primary" disabled={!replyText.trim() || actionPending} onClick={sendReply}>
                        Send message
                      </Button>
                    </div>
                  </div>
                  
                  <div className="mt-6">
                     <h4 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-2">Status</h4>
                     <div className="flex flex-wrap gap-2">
                        <Button 
                          size="sm" 
                          variant={viewRecord.status === 'open' ? 'primary' : 'default'} 
                          disabled={actionPending || viewRecord.status === 'open'} 
                          onClick={() => updateStatus('open')}
                        >
                          Open
                        </Button>
                        <Button 
                          size="sm" 
                          variant={viewRecord.status === 'done' ? 'primary' : 'default'} 
                          className={viewRecord.status === 'done' ? 'bg-green-600 hover:bg-green-700 text-white border-green-500' : ''}
                          disabled={actionPending || viewRecord.status === 'done'} 
                          onClick={() => updateStatus('done')}
                        >
                          Mark Done
                        </Button>
                        <Button 
                          size="sm" 
                          variant={viewRecord.status === 'cancelled' ? 'danger' : 'default'} 
                          disabled={actionPending || viewRecord.status === 'cancelled'} 
                          onClick={() => updateStatus('cancelled')}
                        >
                          Cancel
                        </Button>
                     </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer / Actions */}
            <div className="border-t border-[#26262b] bg-[#111114] px-6 py-4 flex justify-end">
              <Button onClick={() => setViewRecord(null)} variant="ghost" className="text-zinc-400 hover:text-white border border-[#26262b]">Close Window</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
