"use client";
import { useState, useEffect } from "react";
import { Loader2, MessageSquare, Reply as ReplyIcon, CheckCircle2, XCircle, Calendar, RefreshCw, Trash2, X } from "lucide-react";
import { extractLatestReplyText } from "@/lib/email/strip-quoted-reply";

export default function RepliesPage() {
  const [loading, setLoading] = useState(true);
  const [replies, setReplies] = useState<any[]>([]);
  const [hasAiMode, setHasAiMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);

  // Manual reply state
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  const fetchReplies = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/replies");
      const data = await res.json();
      if (data.replies) setReplies(data.replies);
      setHasAiMode(data.hasAiModeEnabled || false);
      setSelectedIds(new Set());
    } catch(e) { console.error(e) }
    setLoading(false);
  };

  useEffect(() => {
    fetchReplies();
  }, []);

  const allSelected = replies.length > 0 && selectedIds.size === replies.length;
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(replies.map((r) => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAction = async (id: string, action: string) => {
    try {
      const res = await fetch(`/api/replies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      if (res.ok) await fetchReplies();
    } catch(e) { console.error(e) }
  };

  const handleDeleteOne = async (id: string) => {
    if (!confirm("Delete this message? This cannot be undone.")) return;
    setBulkWorking(true);
    try {
      const res = await fetch("/api/replies/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], action: "delete" }),
      });
      if (res.ok) await fetchReplies();
      else {
        const data = await res.json();
        alert(data.error || "Failed to delete message.");
      }
    } catch (e) {
      alert("An error occurred while deleting.");
    }
    setBulkWorking(false);
  };

  const handleBulkAction = async (action: string) => {
    if (selectedIds.size === 0) return;

    if (action === "delete") {
      if (!confirm(`Delete ${selectedIds.size} message${selectedIds.size === 1 ? "" : "s"}? This cannot be undone.`)) return;
    } else if (action === "unsubscribed") {
      if (!confirm(`Unsubscribe ${selectedIds.size} lead${selectedIds.size === 1 ? "" : "s"} from selected replies?`)) return;
    }

    setBulkWorking(true);
    try {
      const res = await fetch("/api/replies/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action }),
      });
      if (res.ok) await fetchReplies();
      else {
        const data = await res.json();
        alert(data.error || "Bulk action failed.");
      }
    } catch (e) {
      alert("An error occurred while performing the bulk action.");
    }
    setBulkWorking(false);
  };

  const handleSendReply = async (id: string) => {
    if (!replyText.trim()) return alert("Reply body cannot be empty.");
    setSendingReply(true);
    try {
      const res = await fetch(`/api/replies/${id}/send-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyText, subject: replySubject })
      });
      const data = await res.json();
      if (res.ok) {
        alert("Reply sent successfully!");
        setEditingReplyId(null);
        await fetchReplies();
      } else {
        alert(data.error || "Failed to send reply.");
      }
    } catch (e) {
      alert("An error occurred while sending.");
    }
    setSendingReply(false);
  };

  const getCategoryBadge = (category: string) => {
    switch(category) {
      case 'Interested':
        return <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded border border-green-500/30 font-medium">Interested</span>;
      case 'Book Call':
        return <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded border border-blue-500/30 font-medium">Book Call</span>;
      case 'Not Interested':
        return <span className="px-2 py-1 bg-slate-500/20 text-slate-400 text-xs rounded border border-slate-500/30 font-medium">Not Interested</span>;
      case 'Unsubscribe Request':
        return <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded border border-red-500/30 font-medium">Unsubscribe</span>;
      case 'Angry Reply':
        return <span className="px-2 py-1 bg-red-600/20 text-red-500 text-xs rounded border border-red-600/30 font-medium">Angry</span>;
      case 'Booked':
        return <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded border border-green-500/30 font-medium flex items-center space-x-1"><Calendar size={12}/><span>Call Booked</span></span>;
      default:
        return <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded border border-purple-500/30 font-medium">{category || 'Unknown'}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Replies Inbox</h2>
          <p className="text-slate-400">Review incoming replies triaged by AI.</p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={async () => {
              setLoading(true);
              try {
                const res = await fetch("/api/email/process-replies");
                const data = await res.json();
                if (res.ok) {
                  alert(`Processed successfully! Sent ${data.sent || 0} due AI replies.`);
                  fetchReplies();
                } else {
                  alert(data.error || "Failed to process AI replies");
                }
              } catch (err) {
                alert("Error processing AI replies");
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 rounded-lg font-medium transition-colors border border-purple-500/30 disabled:opacity-50"
            title="Locally trigger AI auto-replies that are scheduled"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            <span>Send Due Auto-Replies</span>
          </button>
          
          <button
            onClick={() => fetchReplies()}
            disabled={loading}
            title="Replies arrive automatically via Resend reply tracking"
            className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors border border-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>


      {hasAiMode ? (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 flex items-start space-x-3 text-purple-400">
          <MessageSquare size={20} className="shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold mb-1">AI Auto-Reply Mode is Active on some campaigns</p>
            <p>AI automatically reads replies, categorizes them, and queues responses. Highly confident responses will be sent automatically based on campaign settings.</p>
          </div>
        </div>
      ) : (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-start space-x-3 text-blue-400">
          <MessageSquare size={20} className="shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold mb-1">Human Handle Mode is Enabled globally</p>
            <p>AI automatically reads replies and categorizes them below, but it will not auto-send responses. You must manually review and action each reply.</p>
          </div>
        </div>
      )}

      {someSelected && (
        <div className="sticky top-4 z-30 bg-purple-900/40 border border-purple-500/50 rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 shadow-2xl backdrop-blur-md">
          <span className="text-sm text-white font-bold">
            {selectedIds.size} {selectedIds.size === 1 ? "message" : "messages"} selected
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleBulkAction("interested")}
              disabled={bulkWorking}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white text-xs rounded-md border border-green-500 flex items-center gap-1 font-medium transition-colors"
            >
              <CheckCircle2 size={13} /> Mark Interested
            </button>
            <button
              onClick={() => handleBulkAction("booked")}
              disabled={bulkWorking}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs rounded-md border border-blue-500 flex items-center gap-1 font-medium transition-colors"
            >
              <Calendar size={13} /> Mark Booked
            </button>
            <button
              onClick={() => handleBulkAction("unsubscribed")}
              disabled={bulkWorking}
              className="px-3 py-1.5 bg-red-600/80 hover:bg-red-500 disabled:opacity-60 text-white text-xs rounded-md border border-red-500 flex items-center gap-1 font-medium transition-colors"
            >
              <XCircle size={13} /> Unsubscribe
            </button>
            <button
              onClick={() => handleBulkAction("handled")}
              disabled={bulkWorking}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-slate-200 text-xs rounded-md border border-slate-600 flex items-center gap-1 font-medium transition-colors"
            >
              Dismiss
            </button>
            <button
              onClick={() => handleBulkAction("delete")}
              disabled={bulkWorking}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-xs rounded-md border border-red-500 flex items-center gap-1 font-medium transition-colors"
            >
              {bulkWorking ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Delete
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-md border border-slate-700 flex items-center gap-1"
            >
              <X size={13} /> Clear
            </button>
          </div>
        </div>
      )}

      <div className="glass rounded-2xl border border-slate-700/50 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
             <Loader2 className="animate-spin text-purple-500" size={32} />
          </div>
        ) : replies.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <MessageSquare size={48} className="mx-auto text-slate-600 mb-4 opacity-50" />
            <p>No replies received yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            <div className="px-6 py-3 bg-slate-900/50 flex items-center gap-3 border-b border-slate-800">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-slate-600 bg-slate-900 cursor-pointer accent-purple-600"
                aria-label="Select all messages"
              />
              <span className="text-xs text-slate-400">Select all</span>
            </div>
            {replies.map((reply) => (
              <div key={reply.id} className={`p-6 ${selectedIds.has(reply.id) ? "bg-purple-900/10" : reply.status === "Unread" ? "bg-slate-800/30" : "opacity-70"}`}>
                <div className="flex justify-between items-start mb-4 gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(reply.id)}
                      onChange={() => toggleSelect(reply.id)}
                      className="mt-1.5 w-4 h-4 rounded border-slate-600 bg-slate-900 cursor-pointer accent-purple-600 shrink-0"
                      aria-label={`Select reply from ${reply.lead?.businessName || "Unknown Lead"}`}
                    />
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-white flex items-center space-x-3 flex-wrap">
                        <span>{reply.lead?.businessName || 'Unknown Lead'}</span>
                        {getCategoryBadge(reply.aiCategory)}
                        {reply.status === 'Unread' && <span className="w-2 h-2 rounded-full bg-purple-500"></span>}
                      </h3>
                      <p className="text-sm text-slate-400 mt-1">
                        Campaign: {reply.campaign?.name || 'Unknown'} • {new Date(reply.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-2 flex-wrap justify-end shrink-0">
                    <button onClick={() => handleAction(reply.id, 'interested')} className="px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs rounded transition-colors border border-green-500/20 flex items-center space-x-1">
                      <CheckCircle2 size={14} /> <span>Mark Interested</span>
                    </button>
                    <button onClick={() => handleAction(reply.id, 'booked')} className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs rounded transition-colors border border-blue-500/20 flex items-center space-x-1">
                      <Calendar size={14} /> <span>Mark Booked</span>
                    </button>
                    <button onClick={() => handleAction(reply.id, 'unsubscribed')} className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs rounded transition-colors border border-red-500/20 flex items-center space-x-1">
                      <XCircle size={14} /> <span>Unsubscribe</span>
                    </button>
                    <button onClick={() => handleAction(reply.id, 'handled')} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded transition-colors border border-slate-600">
                      Dismiss
                    </button>
                    <button
                      onClick={() => handleDeleteOne(reply.id)}
                      disabled={bulkWorking}
                      className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded transition-colors border border-red-500/20"
                      title="Delete message"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 mb-4 ml-7">
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{extractLatestReplyText(reply.emailBody || '')}</p>
                </div>

                {reply.aiSuggestedReply && (
                  <div className="bg-purple-900/10 border border-purple-500/20 rounded-lg p-4 ml-7">
                    <div className="flex items-center space-x-2 text-purple-400 mb-2 font-medium text-sm">
                      <ReplyIcon size={16} />
                      <span>AI Suggested Response</span>
                    </div>
                    <p className="text-sm text-purple-200/80 whitespace-pre-wrap">{reply.aiSuggestedReply}</p>
                    {reply.recommendedAction && <span className="text-xs text-slate-500 mt-2 italic block">Recommendation: {reply.recommendedAction}</span>}
                  </div>
                )}

                {/* Manual Reply Editor */}
                {editingReplyId === reply.id ? (
                  <div className="mt-4 bg-slate-800 rounded-lg border border-slate-600 p-4 ml-7">
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-slate-400 mb-1">Subject</label>
                      <input 
                        type="text"
                        value={replySubject}
                        onChange={(e) => setReplySubject(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white"
                        placeholder="Re: Subject"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Message</label>
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-sm text-white h-32 resize-y"
                        placeholder="Type your reply here..."
                      />
                    </div>
                    <div className="mt-3 flex justify-end space-x-2">
                      <button 
                        onClick={() => setEditingReplyId(null)}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => handleSendReply(reply.id)}
                        disabled={sendingReply || !replyText.trim()}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded flex items-center space-x-2 transition-colors disabled:opacity-50"
                      >
                        {sendingReply && <Loader2 size={14} className="animate-spin" />}
                        <span>Send Reply</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 ml-7">
                    <button 
                      onClick={() => {
                        setEditingReplyId(reply.id);
                        setReplyText(reply.aiSuggestedReply || "");
                        setReplySubject(`Re: ${reply.campaign?.name || "Campaign"}`);
                      }}
                      className="px-4 py-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30 text-xs font-bold rounded transition-colors flex items-center space-x-2"
                    >
                      <ReplyIcon size={14} />
                      <span>{reply.aiSuggestedReply ? "Edit & Send AI Reply" : "Reply Manually"}</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
