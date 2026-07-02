"use client";
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, User, Building, Mail, Phone, Globe, Calendar, Clock, CheckCircle, AlertCircle, MessageSquare, Send } from 'lucide-react';
import Link from 'next/link';

export default function LeadDetailAndTimeline() {
  const params = useParams();
  const router = useRouter();
  const { id } = params;
  
  const [lead, setLead] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) fetchLeadDetails();
  }, [id]);

  const fetchLeadDetails = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${id}`);
      if (!res.ok) throw new Error('Failed to fetch lead details');
      const data = await res.json();
      setLead(data.lead);
    } catch (err: any) {
      setError('Lead details could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-1/4 bg-slate-800 rounded"></div>
        <div className="h-64 bg-slate-800 rounded-2xl border border-slate-700"></div>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="space-y-6">
        <button onClick={() => router.back()} className="flex items-center text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={16} className="mr-2" /> Back to Leads
        </button>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 flex flex-col items-center justify-center text-red-400 min-h-[300px]">
          <AlertCircle size={48} className="mb-4 text-red-500/50" />
          <h2 className="text-xl font-bold mb-2">Error Loading Data</h2>
          <p>{error || 'Lead not found'}</p>
        </div>
      </div>
    );
  }

  // Combine and sort timeline events (emails sent/queued, replies, calls)
  const timelineEvents: any[] = [];

  if (lead.emailSequences) {
    lead.emailSequences.forEach((seq: any) => {
      timelineEvents.push({
        type: 'email',
        date: new Date(seq.sentAt || seq.scheduledAt || seq.createdAt),
        title: `Email Step ${seq.sequenceStep}: ${seq.subject || 'Draft'}`,
        status: seq.status,
        content: seq.body,
        data: seq
      });
    });
  }

  if (lead.replies) {
    lead.replies.forEach((reply: any) => {
      timelineEvents.push({
        type: 'reply',
        date: new Date(reply.createdAt),
        title: `Lead Replied via ${reply.channel}`,
        status: reply.intent || 'Unknown Intent',
        content: reply.messageBody,
        data: reply
      });
    });
  }

  if (lead.bookedCalls) {
    lead.bookedCalls.forEach((call: any) => {
      timelineEvents.push({
        type: 'call',
        date: new Date(call.createdAt),
        title: `Call Booked`,
        status: call.status,
        content: `Scheduled for ${new Date(call.callDate).toLocaleString()}`,
        data: call
      });
    });
  }

  timelineEvents.sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <User className="text-blue-500" /> {lead.businessName}
            </h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-slate-400">
              {lead.email && <span className="flex items-center gap-1"><Mail size={14}/> {lead.email}</span>}
              {lead.phone && <span className="flex items-center gap-1"><Phone size={14}/> {lead.phone}</span>}
              {lead.status && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  lead.status === 'Call Booked' ? 'bg-green-500/20 text-green-400' :
                  lead.status === 'Unsubscribed' ? 'bg-red-500/20 text-red-400' :
                  lead.status === 'Replied' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-slate-500/20 text-slate-300'
                }`}>
                  {lead.status}
                </span>
              )}
            </div>
          </div>
        </div>
        {lead.campaign && (
          <Link href={`/dashboard/campaigns/${lead.campaignId}`}>
            <span className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-medium transition-colors border border-slate-700 cursor-pointer">
              View Campaign: {lead.campaign.name}
            </span>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-bold text-white mb-2">Conversation Timeline</h2>
          {timelineEvents.length === 0 ? (
            <div className="glass p-8 rounded-2xl border border-slate-800 text-center flex flex-col items-center">
              <MessageSquare size={48} className="text-slate-600 mb-4" />
              <p className="text-slate-400">No communication history yet.</p>
            </div>
          ) : (
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:ml-[2.2rem] md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-blue-500 before:via-slate-800 before:to-slate-800">
              {timelineEvents.map((event, idx) => (
                <div key={idx} className="relative flex items-start gap-4">
                  <div className="absolute left-0 mt-1 md:left-4 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-slate-900 border-2 border-slate-700 shadow-sm shrink-0">
                    {event.type === 'email' ? <Send size={16} className="text-blue-400" /> :
                     event.type === 'reply' ? <MessageSquare size={16} className="text-purple-400" /> :
                     <Calendar size={16} className="text-green-400" />}
                  </div>
                  
                  <div className="w-full ml-12 md:ml-20 glass p-5 rounded-2xl border border-slate-800 hover:border-slate-700 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-white text-lg">{event.title}</h3>
                      <span className="text-xs font-medium text-slate-500 whitespace-nowrap ml-4">
                        {event.date.toLocaleDateString()} {event.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                    <div className="mb-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${
                        ['Sent', 'Booked', 'Scheduled', 'Interested', 'Approved'].includes(event.status)
                          ? 'bg-green-500/10 text-green-400 border-green-500/20'
                          : ['Failed', 'Cancelled', 'Not Interested', 'Unsubscribed', 'Bounced'].includes(event.status)
                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}>
                        {event.status}
                      </span>
                    </div>
                    {event.content && (
                      <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800 text-sm text-slate-300 leading-relaxed overflow-hidden">
                        {event.type === 'email' ? (
                          <div dangerouslySetInnerHTML={{ __html: event.content }} />
                        ) : (
                          <p className="whitespace-pre-wrap">{event.content}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Lead Info Sidebar */}
        <div className="space-y-6">
          <div className="glass p-6 rounded-2xl border border-slate-800">
            <h2 className="text-lg font-bold text-white mb-4">Lead Details</h2>
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-slate-500 mb-1 flex items-center gap-1"><Building size={14} /> Company</p>
                <p className="font-medium text-slate-200">{lead.businessName || 'N/A'}</p>
              </div>
              <div>
                <p className="text-slate-500 mb-1 flex items-center gap-1"><Globe size={14} /> Website</p>
                <p className="font-medium text-blue-400">
                  {lead.website ? <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" className="hover:underline">{lead.website}</a> : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-slate-500 mb-1">Location</p>
                <p className="font-medium text-slate-200">{lead.city ? `${lead.city}, ` : ''}{lead.state ? `${lead.state}, ` : ''}{lead.country || 'N/A'}</p>
              </div>
              <div>
                <p className="text-slate-500 mb-1">Lead Score</p>
                <div className="flex items-center gap-2">
                  <div className="w-full bg-slate-800 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(100, Math.max(0, lead.leadScore || 0))}%` }}></div>
                  </div>
                  <span className="font-mono text-slate-300">{lead.leadScore || 0}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="glass p-6 rounded-2xl border border-slate-800">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Clock size={16} className="text-purple-400" />
              Activity Status
            </h2>
            <p className="text-sm text-slate-400 mb-2">Lead Added:</p>
            <p className="text-sm font-medium text-slate-200">{new Date(lead.createdAt).toLocaleDateString()}</p>
            <p className="text-sm text-slate-400 mt-4 mb-2">Last Updated:</p>
            <p className="text-sm font-medium text-slate-200">{new Date(lead.updatedAt).toLocaleDateString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
