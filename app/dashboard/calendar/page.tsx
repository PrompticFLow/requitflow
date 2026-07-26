"use client";
import { Video, Clock, Loader2, Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function CalendarPage() {
  const [calendly, setCalendly] = useState<{
    connected: boolean;
    calendlyEmail?: string;
    schedulingUrl?: string | null;
  }>({ connected: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/integrations/calendly/status")
      .then((r) => r.json())
      .catch(() => ({ connected: false }))
      .then((c) => setCalendly(c))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-violet-500/10 rounded-xl">
            <Video className="text-violet-400" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Calendar & Scheduling</h1>
            <p className="text-slate-400 text-sm mt-1">
              Connect Calendly for booking links and meeting sync.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-violet-400" size={28} />
        </div>
      ) : (
        <div className="max-w-xl">
          <div className="glass p-6 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-500/10 rounded-lg">
                  <Video size={18} className="text-violet-400" />
                </div>
                <h3 className="text-lg font-bold text-white">Calendly</h3>
              </div>
              {calendly.connected ? (
                <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded border border-green-500/30 flex items-center gap-1">
                  <Check size={12} /> Connected
                </span>
              ) : (
                <span className="px-2 py-1 bg-slate-500/20 text-slate-400 text-xs rounded border border-slate-500/30">
                  Not connected
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400">
              Use your Calendly link in campaigns and sync bookings into Meetings booked.
            </p>
            {calendly.connected ? (
              <div className="space-y-2 text-sm">
                <p className="text-slate-300">
                  Account: <strong className="text-white">{calendly.calendlyEmail}</strong>
                </p>
                {calendly.schedulingUrl && (
                  <a
                    href={calendly.schedulingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 break-all inline-flex items-center gap-1"
                  >
                    <Clock size={12} /> {calendly.schedulingUrl}
                  </a>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch("/api/integrations/calendly/connect", {
                      headers: { Accept: "application/json" },
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      alert(data.error || "Calendly is not configured.");
                      return;
                    }
                    window.location.href = data.url || "/api/integrations/calendly/connect";
                  } catch {
                    window.location.href = "/api/integrations/calendly/connect";
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium"
              >
                Connect Calendly
              </button>
            )}
            <Link href="/dashboard/settings" className="text-xs text-slate-500 hover:text-slate-300 inline-flex items-center gap-1">
              Manage in Settings <ExternalLink size={12} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
