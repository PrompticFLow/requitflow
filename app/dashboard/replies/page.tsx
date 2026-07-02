"use client";
import { useState, useEffect } from "react";
import { Search, Filter, Loader2, MessageSquare, Reply as ReplyIcon, CheckCircle2, XCircle, AlertCircle, Calendar } from "lucide-react";

export default function RepliesPage() {
  const [loading, setLoading] = useState(true);
  const [replies, setReplies] = useState<any[]>([]);

  const fetchReplies = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/replies");
      const data = await res.json();
      if (data.replies) setReplies(data.replies);
    } catch(e) { console.error(e) }
    setLoading(false);
  };

  useEffect(() => {
    fetchReplies();
  }, []);

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

  const handleBookSlot = async (reply: any, slot: any) => {
    try {
      const res = await fetch('/api/integrations/google-calendar/book', {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: slot.start,
          end: slot.end,
          summary: `Discovery Call with ${reply.lead?.businessName || reply.lead?.email}`,
          description: `Booked from Funnelzen AI Campaign: ${reply.campaign?.name}`,
          attendeeEmail: reply.lead?.email,
          replyId: reply.id,
          leadId: reply.lead?.id,
          campaignId: reply.campaign?.id
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert('Meeting booked successfully on Google Calendar!');
        await fetchReplies();
      } else {
        alert(data.error || 'Failed to book meeting.');
      }
    } catch (e) {
      alert('An error occurred while booking the meeting.');
    }
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
        <button 
          onClick={async () => {
            const res = await fetch('/api/leads');
            const data = await res.json();
            const lead = data.leads?.[0];
            if (!lead) return alert('No leads available to simulate reply.');
            const sim = await fetch('/api/debug/simulate-reply', {
              method: 'POST', headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ leadId: lead.id, body: "Yes, I’m interested. Can we talk this week?" })
            });
            if (sim.ok) { alert('Reply simulated successfully!'); fetchReplies(); }
            else { const e = await sim.json(); alert(e.error || 'Failed to simulate'); }
          }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Simulate Demo Reply
        </button>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-start space-x-3 text-blue-400">
        <MessageSquare size={20} className="shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold mb-1">Human Handle Mode is Enabled</p>
          <p>AI automatically reads replies and categorizes them below, but it will not auto-send responses. You must manually review and action each reply.</p>
        </div>
      </div>

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
            {replies.map((reply) => (
              <div key={reply.id} className={`p-6 ${reply.status === 'Unread' ? 'bg-slate-800/30' : 'opacity-70'}`}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center space-x-3">
                      <span>{reply.lead?.businessName || 'Unknown Lead'}</span>
                      {getCategoryBadge(reply.aiCategory)}
                      {reply.status === 'Unread' && <span className="w-2 h-2 rounded-full bg-purple-500"></span>}
                    </h3>
                    <p className="text-sm text-slate-400 mt-1">
                      Campaign: {reply.campaign?.name || 'Unknown'} • {new Date(reply.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex space-x-2">
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
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 mb-4">
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{reply.emailBody}</p>
                </div>

                {reply.aiSuggestedReply && (
                  <div className="bg-purple-900/10 border border-purple-500/20 rounded-lg p-4">
                    <div className="flex items-center space-x-2 text-purple-400 mb-2 font-medium text-sm">
                      <ReplyIcon size={16} />
                      <span>AI Suggested Response</span>
                    </div>
                    <p className="text-sm text-purple-200/80 whitespace-pre-wrap">{reply.aiSuggestedReply}</p>
                    
                    {reply.suggestedCalendarSlots && reply.suggestedCalendarSlots.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-purple-500/20">
                        <p className="text-xs text-purple-300 mb-2 font-semibold">Suggested Meeting Times:</p>
                        <div className="space-y-2">
                          {reply.suggestedCalendarSlots.map((slot: any) => (
                            <div key={slot.id} className="flex justify-between items-center bg-purple-900/20 p-2 rounded border border-purple-500/30">
                              <span className="text-sm text-purple-200">{slot.label}</span>
                              <button 
                                onClick={() => handleBookSlot(reply, slot)}
                                disabled={slot.selected || reply.aiCategory === 'Booked'}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs rounded transition-colors"
                              >
                                {slot.selected ? 'Selected' : 'Book Manually'}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 flex space-x-2">
                       <button className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded transition-colors">
                         Edit & Send Reply (Coming Soon)
                       </button>
                       {reply.recommendedAction && <span className="text-xs text-slate-500 mt-2 italic">Recommendation: {reply.recommendedAction}</span>}
                    </div>
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
