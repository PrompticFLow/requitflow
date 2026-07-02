"use client";
import { useState, useEffect } from "react";
import { TrendingUp, Target, Loader2, AlertCircle, MessageSquare } from "lucide-react";
import Link from "next/link";

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await fetch("/api/analytics/dashboard");
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.details || errData?.error || "Failed to load analytics");
        }
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-3xl font-bold text-white mb-2">Campaign Analytics</h2>
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 flex flex-col items-center justify-center text-center">
          <AlertCircle className="text-red-400 mb-4" size={32} />
          <h3 className="text-xl font-bold text-white mb-2">Analytics data could not be loaded.</h3>
          <p className="text-red-300 max-w-2xl font-mono text-sm bg-red-950/50 p-4 rounded-lg mt-2 whitespace-pre-wrap">{typeof error === 'string' ? error : "There was an issue connecting to the database."}</p>
        </div>
      </div>
    );
  }

  // Handle empty state: if clientLeadsFound == 0 && candidatesFound == 0 && campaigns == 0
  const isEmpty = data && data.clientLeadsFound === 0 && data.candidatesFound === 0 && data.activeCampaigns === 0 && data.emailsSent === 0;

  if (isEmpty) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Campaign Analytics</h2>
          <p className="text-slate-400">Deep dive into your AI outreach performance and client/candidate sourcing metrics.</p>
        </div>
        <div className="glass p-12 rounded-2xl border border-slate-700/50 flex flex-col items-center justify-center text-center min-h-[50vh]">
          <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mb-6">
            <TrendingUp size={36} className="text-blue-400" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-3">No campaign data yet.</h3>
          <p className="text-slate-400 max-w-md mb-8">Start by finding client leads or creating your first campaign to see your analytics.</p>
          <div className="flex space-x-4">
            <Link href="/generate-leads" className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-all shadow-lg shadow-blue-500/25">
              Find Client Leads
            </Link>
            <Link href="/campaigns" className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-lg font-medium transition-all">
              Create Campaign
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const metrics = [
    { name: "Client Leads Found", value: data?.clientLeadsFound || 0 },
    { name: "Candidates Found", value: data?.candidatesFound || 0 },
    { name: "Active Campaigns", value: data?.activeCampaigns || 0 },
    { name: "Emails Sent", value: data?.emailsSent || 0 },
    { name: "SMS Sent", value: data?.smsSent || 0 },
    { name: "Replies Received", value: data?.repliesReceived || 0 },
    { name: "Discovery Calls Booked", value: data?.discoveryCallsBooked || 0 },
    { name: "Screening Calls Booked", value: data?.screeningCallsBooked || 0 },
    { name: "Positive Reply Rate", value: data?.positiveReplyRate || "0.0%" },
    { name: "Call Booking Rate", value: data?.callBookingRate || "0.0%" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Campaign Analytics</h2>
          <p className="text-slate-400">Deep dive into your AI outreach performance and client/candidate sourcing metrics.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {metrics.map((metric, i) => (
          <div key={i} className="glass p-5 rounded-2xl border border-slate-700/50">
            <h3 className="text-slate-400 text-xs font-medium mb-2 uppercase tracking-wider">{metric.name}</h3>
            {loading ? (
              <div className="h-8 bg-slate-800 rounded animate-pulse w-1/2 mt-1"></div>
            ) : (
              <p className="text-2xl font-bold text-white">{typeof metric.value === 'number' ? metric.value.toLocaleString() : metric.value}</p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <div className="glass p-6 rounded-2xl border border-slate-700/50 lg:col-span-2 flex flex-col">
          <div className="flex items-center space-x-2 mb-6">
            <TrendingUp className="text-blue-400" size={20} />
            <h3 className="text-xl font-semibold text-white">Candidate & Client Sourcing Trend (Last 7 Days)</h3>
          </div>
          {loading ? (
             <div className="flex-1 flex items-center justify-center min-h-[300px]">
               <Loader2 className="animate-spin text-blue-500" size={32} />
             </div>
          ) : (
             <div className="flex-1 flex items-end justify-between h-[300px] mt-4 relative">
                {/* Y-axis rough lines */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
                   {[...Array(5)].map((_, i) => (
                     <div key={i} className="w-full border-t border-slate-400"></div>
                   ))}
                </div>
                {/* Bars */}
                {data?.trend?.map((item: any, i: number) => {
                  const maxVal = Math.max(...(data.trend.map((t: any) => t.count)), 10);
                  const height = `${(item.count / maxVal) * 100}%`;
                  const dateObj = new Date(item.date);
                  const shortDate = `${dateObj.getMonth()+1}/${dateObj.getDate()}`;
                  return (
                    <div key={i} className="flex flex-col items-center w-1/8 z-10 h-full justify-end group">
                      <div className="text-xs text-white mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 px-2 py-1 rounded">
                        {item.count} leads
                      </div>
                      <div className="w-12 bg-blue-500/80 hover:bg-blue-400 rounded-t-sm transition-all" style={{ height: height === '0%' ? '4px' : height }}></div>
                      <div className="text-xs text-slate-500 mt-3">{shortDate}</div>
                    </div>
                  );
                })}
             </div>
          )}
        </div>

        {/* Reply Analytics */}
        <div className="glass p-6 rounded-2xl border border-slate-700/50 flex flex-col">
          <div className="flex items-center space-x-2 mb-6">
            <MessageSquare className="text-green-400" size={20} />
            <h3 className="text-xl font-semibold text-white">Reply Analytics</h3>
          </div>
          {loading ? (
             <div className="flex-1 flex items-center justify-center">
               <Loader2 className="animate-spin text-green-500" size={32} />
             </div>
          ) : (
             <div className="space-y-6 flex-1 flex flex-col justify-center">
               <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                 <span className="text-slate-400">Total Replies</span>
                 <span className="text-white font-bold">{data?.repliesReceived || 0}</span>
               </div>
               <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                 <span className="text-slate-400">Interested Replies</span>
                 <span className="text-green-400 font-bold">{data?.interestedReplies || 0}</span>
               </div>
               <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                 <span className="text-slate-400">Negative Replies</span>
                 <span className="text-red-400 font-bold">{Math.max(0, (data?.repliesReceived || 0) - (data?.interestedReplies || 0))}</span>
               </div>
               <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                 <span className="text-slate-400">Unsubscribe Requests</span>
                 <span className="text-yellow-400 font-bold">{data?.unsubscribedCount || 0}</span>
               </div>
               <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                 <span className="text-slate-400">No Reply</span>
                 <span className="text-slate-500 font-bold">{data?.noReplyCount || 0}</span>
               </div>
             </div>
          )}
        </div>
      </div>

      {/* Funnel */}
      <div className="glass p-6 rounded-2xl border border-slate-700/50 min-h-[400px]">
        <div className="flex items-center space-x-2 mb-6">
          <Target className="text-purple-400" size={20} />
          <h3 className="text-xl font-semibold text-white">Campaign Conversion Funnel</h3>
        </div>
        {loading ? (
             <div className="flex-1 flex items-center justify-center min-h-[300px]">
               <Loader2 className="animate-spin text-purple-500" size={32} />
             </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 space-y-4 px-8 max-w-4xl mx-auto">
             <div className="w-[100%] bg-slate-800 rounded-lg h-12 flex items-center justify-center px-4 relative overflow-hidden shadow-md">
                <div className="absolute inset-y-0 left-0 bg-blue-500/20 w-full"></div>
                <div className="absolute inset-0 border border-blue-500/30 rounded-lg pointer-events-none"></div>
                <span className="relative z-10 text-white font-medium whitespace-nowrap">1. Client Leads Found ({data?.clientLeadsFound || 0})</span>
             </div>
             <div className="w-[90%] bg-slate-800 rounded-lg h-12 flex items-center justify-center px-4 relative overflow-hidden shadow-md">
                <div className="absolute inset-y-0 left-0 bg-indigo-500/20 w-full"></div>
                <div className="absolute inset-0 border border-indigo-500/30 rounded-lg pointer-events-none"></div>
                <span className="relative z-10 text-white font-medium whitespace-nowrap">2. Added to Campaign ({data?.funnel?.added || 0})</span>
             </div>
             <div className="w-[80%] bg-slate-800 rounded-lg h-12 flex items-center justify-center px-4 relative overflow-hidden shadow-md">
                <div className="absolute inset-y-0 left-0 bg-purple-500/20 w-full"></div>
                <div className="absolute inset-0 border border-purple-500/30 rounded-lg pointer-events-none"></div>
                <span className="relative z-10 text-white font-medium whitespace-nowrap">3. Emails Sent ({data?.funnel?.emailsSent || 0})</span>
             </div>
             <div className="w-[70%] bg-slate-800 rounded-lg h-12 flex items-center justify-center px-4 relative overflow-hidden shadow-md">
                <div className="absolute inset-y-0 left-0 bg-yellow-500/20 w-full"></div>
                <div className="absolute inset-0 border border-yellow-500/30 rounded-lg pointer-events-none"></div>
                <span className="relative z-10 text-white font-medium whitespace-nowrap">4. Replies Received ({data?.funnel?.replies || 0})</span>
             </div>
             <div className="w-[60%] bg-slate-800 rounded-lg h-12 flex items-center justify-center px-4 relative overflow-hidden shadow-md">
                <div className="absolute inset-y-0 left-0 bg-green-500/20 w-full"></div>
                <div className="absolute inset-0 border border-green-500/30 rounded-lg pointer-events-none"></div>
                <span className="relative z-10 text-white font-medium whitespace-nowrap">5. Interested ({data?.funnel?.interested || 0})</span>
             </div>
             <div className="w-[50%] bg-slate-800 rounded-lg h-12 flex items-center justify-center px-4 relative overflow-hidden shadow-md">
                <div className="absolute inset-y-0 left-0 bg-emerald-500/20 w-full"></div>
                <div className="absolute inset-0 border border-emerald-500/30 rounded-lg pointer-events-none"></div>
                <span className="relative z-10 text-white font-medium whitespace-nowrap">6. Calls Booked ({data?.funnel?.booked || 0})</span>
             </div>
             <div className="w-[40%] bg-slate-800 rounded-lg h-12 flex items-center justify-center px-4 relative overflow-hidden shadow-md">
                <div className="absolute inset-y-0 left-0 bg-teal-500/20 w-full"></div>
                <div className="absolute inset-0 border border-teal-500/30 rounded-lg pointer-events-none"></div>
                <span className="relative z-10 text-white font-medium whitespace-nowrap">7. Won Clients ({data?.funnel?.won || 0})</span>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
