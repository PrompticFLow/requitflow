"use client";
import { useState, useEffect } from "react";
import { Search, Calendar, ExternalLink, Loader2, RefreshCw, CheckCircle2 } from "lucide-react";

export default function BookedCallsPage() {
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);

  const fetchCalls = async () => {
    try {
      const res = await fetch('/api/booked-calls');
      const data = await res.json();
      if (data.calls) setCalls(data.calls);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      await fetchCalls();
      try {
        const res = await fetch('/api/integrations/calendly/sync', { method: 'POST' });
        if (res.ok) await fetchCalls();
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/integrations/calendly/sync', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Calendly sync failed. Connect Calendly in Settings first.');
      } else {
        await fetchCalls();
      }
    } catch (e) {
      console.error(e);
      alert('Calendly sync failed.');
    }
    setSyncing(false);
  };

  const handleMarkClosed = async (callId: string) => {
    setClosingId(callId);
    try {
      const res = await fetch(`/api/booked-calls/${callId}/close`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to mark as closed.');
        return;
      }
      setCalls((prev) =>
        prev.map((call) => (call.id === callId ? { ...call, status: 'Closed' } : call))
      );
    } catch (e) {
      console.error(e);
      alert('Failed to mark as closed.');
    } finally {
      setClosingId(null);
    }
  };

  const now = Date.now();
  const visibleCalls = calls.filter((call) => {
    if (!call.callDate) return true;
    return new Date(call.callDate).getTime() >= now;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Booked Discovery Calls</h2>
          <p className="text-slate-400">Track all client discovery calls booked through AI campaigns.</p>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-700 text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-50 flex items-center gap-1.5"
        >
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Sync from Calendly
        </button>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-start space-x-3 text-blue-400">
        <Calendar size={20} className="shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold mb-1">Booking Link Mode is active.</p>
          <p>Connect Calendly in Settings to sync meetings automatically, or mark bookings manually from replies.</p>
        </div>
      </div>

      <div className="glass rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/30">
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 w-80">
            <Search size={16} className="text-slate-400" />
            <input 
              type="text" 
              placeholder="Search booked calls..." 
              className="bg-transparent border-none outline-none ml-2 w-full text-sm text-white placeholder-slate-500"
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-6 py-4 font-medium">Lead Details</th>
                <th className="px-6 py-4 font-medium">Campaign Source</th>
                <th className="px-6 py-4 font-medium">Call Date</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center text-slate-500">
                    <Loader2 className="animate-spin mx-auto mb-2" size={24} />
                    Loading...
                  </td>
                </tr>
              ) : visibleCalls.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-slate-800/50 text-slate-500 flex items-center justify-center rounded-full mb-4">
                        <Calendar size={32} />
                      </div>
                      <h3 className="text-lg font-medium text-white mb-2">No booked calls</h3>
                      <p className="text-slate-400 max-w-sm">
                        No discovery calls booked yet.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                visibleCalls.map((call) => (
                  <tr key={call.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">{call.lead?.businessName || call.lead?.firstName || 'Unknown'}</div>
                      <div className="text-xs text-slate-500">{call.lead?.email || ''} • {call.lead?.phone || ''}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-300">{call.campaign?.name || 'Direct / CRM'}</td>
                    <td className="px-6 py-4 text-blue-400 flex items-center space-x-2 mt-2">
                      <Calendar size={14} />
                      <span>
                        {call.callDate
                          ? new Date(call.callDate).toLocaleString(undefined, {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                              second: '2-digit',
                              hour12: true,
                            })
                          : 'TBD'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-xs font-medium uppercase ${
                          call.status === 'Closed' ? 'text-slate-400' : 'text-green-400'
                        }`}
                      >
                        {call.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2 justify-end">
                        {call.status !== 'Closed' && (
                          <button
                            type="button"
                            onClick={() => handleMarkClosed(call.id)}
                            disabled={closingId === call.id}
                            className="p-2 bg-slate-800 text-slate-300 rounded hover:bg-emerald-900/40 hover:text-emerald-300 transition-colors inline-flex items-center space-x-2 disabled:opacity-50"
                          >
                            {closingId === call.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <CheckCircle2 size={14} />
                            )}
                            <span className="text-xs">Mark as closed</span>
                          </button>
                        )}
                        <a href={`/dashboard/leads/${call.leadId}`} className="p-2 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 transition-colors inline-flex items-center space-x-2">
                          <ExternalLink size={14} />
                          <span className="text-xs">View CRM</span>
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
