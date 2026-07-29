"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Mail, Users, Check, RefreshCw, Save, AlertTriangle, CheckCircle2, X, Search, Pencil, MessageSquare, Send, ArrowLeft, Calendar, ExternalLink } from "lucide-react";
import { extractLatestReplyText } from "@/lib/email/strip-quoted-reply";

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const [activeTab, setActiveTab] = useState("Overview");
  const [loading, setLoading] = useState(true);
  const [campaignLeads, setCampaignLeads] = useState<any[]>([]);
  const [campaignData, setCampaignData] = useState<any>(null);
  const [campaignReplies, setCampaignReplies] = useState<any[]>([]);
  const [bookedMeetings, setBookedMeetings] = useState<any[]>([]);

  // Calendly integration (Overview)
  const [calendlyStatus, setCalendlyStatus] = useState<{
    connected: boolean;
    calendlyEmail?: string;
    schedulingUrl?: string | null;
  }>({ connected: false });
  const [calendlyLoading, setCalendlyLoading] = useState(true);
  const [applyingCalendlyLink, setApplyingCalendlyLink] = useState(false);

  // Resend Sending Account State (one API key + sender email per campaign)
  const [resendKeyInput, setResendKeyInput] = useState("");
  const [resendFromInput, setResendFromInput] = useState("");
  const [resendEditing, setResendEditing] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);

  // Email Sequence State
  const [seqGenerating, setSeqGenerating] = useState(false);
  const [seqProgress, setSeqProgress] = useState("");
  const [regeneratingCells, setRegeneratingCells] = useState<string[]>([]);
  const [emailModal, setEmailModal] = useState<{ lead: any; step: number; email: any } | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [startingLeads, setStartingLeads] = useState(false);
  const [editLeadModal, setEditLeadModal] = useState<any | null>(null);

  // Offer editing state
  const [editingOffer, setEditingOffer] = useState(false);
  const [offerDraft, setOfferDraft] = useState("");
  const [savingOffer, setSavingOffer] = useState(false);

  // Booking link editing state
  const [editingBooking, setEditingBooking] = useState(false);
  const [bookingDraft, setBookingDraft] = useState("");
  const [savingBooking, setSavingBooking] = useState(false);

  const handleSaveBookingLink = async () => {
    const link = bookingDraft.trim();
    if (link && !/^https?:\/\//i.test(link)) {
      return alert("Please enter a full URL starting with https:// (e.g. your Calendly link).");
    }
    setSavingBooking(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingLink: link || null, ctaLink: link || null })
      });
      if (res.ok) {
        setEditingBooking(false);
        await fetchCampaignData(true);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save booking link.");
      }
    } catch (e) { console.error(e); }
    setSavingBooking(false);
  };

  const handleConnectCalendly = async () => {
    const returnTo = `/dashboard/campaigns/${campaignId}`;
    try {
      const res = await fetch(
        `/api/integrations/calendly/connect?returnTo=${encodeURIComponent(returnTo)}`,
        { headers: { Accept: "application/json" } }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Calendly is not configured. Add CALENDLY_* environment variables.");
        return;
      }
      window.location.href = data.url || `/api/integrations/calendly/connect?returnTo=${encodeURIComponent(returnTo)}`;
    } catch {
      window.location.href = `/api/integrations/calendly/connect?returnTo=${encodeURIComponent(returnTo)}`;
    }
  };

  const handleUseCalendlyLink = async () => {
    if (!calendlyStatus.schedulingUrl) {
      return alert("No Calendly scheduling URL available. Pick an event type in Settings.");
    }
    setApplyingCalendlyLink(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingLink: calendlyStatus.schedulingUrl,
          ctaLink: calendlyStatus.schedulingUrl,
        }),
      });
      if (res.ok) {
        await fetchCampaignData(true);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to apply Calendly link.");
      }
    } catch (e) {
      console.error(e);
    }
    setApplyingCalendlyLink(false);
  };

  const handleChangeReplyMode = async (mode: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoReplyMode: mode, autoReplyEnabled: mode !== 'manual_only' })
      });
      if (res.ok) await fetchCampaignData(true);
      else {
        const data = await res.json();
        alert(data.error || "Failed to update reply mode.");
      }
    } catch (e) { console.error(e); }
  };

  const handleSaveOffer = async () => {
    if (!offerDraft.trim()) return alert("Offer cannot be empty.");
    setSavingOffer(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer: offerDraft.trim() })
      });
      if (res.ok) {
        setEditingOffer(false);
        await fetchCampaignData(true);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save offer.");
      }
    } catch (e) { console.error(e); }
    setSavingOffer(false);
  };

  const seqStepCount = campaignData?.emailSequenceCount > 0 ? Math.min(campaignData.emailSequenceCount, 10) : 4;
  const SEQ_STEPS = Array.from({ length: seqStepCount }, (_, i) => i + 1);

  const fetchBookedMeetings = async () => {
    try {
      const bookedRes = await fetch(`/api/booked-calls?campaignId=${campaignId}`);
      if (bookedRes.ok) {
        const bookedData = await bookedRes.json();
        setBookedMeetings(bookedData.calls || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCampaignData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [seqRes, campRes, repliesRes, bookedRes, calendlyRes] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}/email-sequences`),
        fetch(`/api/campaigns/${campaignId}`),
        fetch(`/api/replies?campaignId=${campaignId}`),
        fetch(`/api/booked-calls?campaignId=${campaignId}`),
        fetch(`/api/integrations/calendly/status`),
      ]);
      const seqData = await seqRes.json();
      if (seqData.campaignLeads) setCampaignLeads(seqData.campaignLeads);

      if (campRes.ok) {
        const campData = await campRes.json();
        setCampaignData(campData.campaign);
      }

      if (repliesRes.ok) {
        const repliesData = await repliesRes.json();
        setCampaignReplies(repliesData.replies || []);
      }

      if (bookedRes.ok) {
        const bookedData = await bookedRes.json();
        setBookedMeetings(bookedData.calls || []);
      }

      if (calendlyRes.ok) {
        const cData = await calendlyRes.json();
        setCalendlyStatus(cData);
      }
    } catch(e) {
      console.error(e);
    }
    setCalendlyLoading(false);
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    fetchCampaignData();
  }, [campaignId]);

  // Pull Calendly → BookedCall when opening this tab (API sync only)
  useEffect(() => {
    if (activeTab !== 'Booked Meetings') return;
    let cancelled = false;
    (async () => {
      await fetchBookedMeetings();
      try {
        const res = await fetch('/api/integrations/calendly/sync', { method: 'POST' });
        if (res.ok && !cancelled) await fetchBookedMeetings();
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, campaignId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendly') === 'connected') {
      setActiveTab('Overview');
      fetchCampaignData(true);
      window.history.replaceState({}, '', `/dashboard/campaigns/${campaignId}`);
    }
  }, [campaignId]);

  const handleGenerateLeadSequences = async () => {
    const missing = campaignLeads.filter(cl => {
      const emails = cl.lead.emailSequences || [];
      return SEQ_STEPS.some(s => !emails.find((e: any) => e.sequenceStep === s));
    }).map(cl => cl.leadId);

    if (missing.length === 0) {
      return alert("All leads already have a full email sequence. Use the regenerate icon on a cell to rewrite an individual email.");
    }

    setSeqGenerating(true);
    const batchSize = 5;
    for (let i = 0; i < missing.length; i += batchSize) {
      const batch = missing.slice(i, i + batchSize);
      setSeqProgress(`Generating email sequences for leads ${i + 1}–${Math.min(i + batchSize, missing.length)} of ${missing.length}...`);
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/generate-lead-emails`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadIds: batch })
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.error || "Email generation failed.");
          break;
        }
      } catch (err: any) {
        alert(err.message || "Email generation failed.");
        break;
      }
      await fetchCampaignData(true);
    }
    await fetchCampaignData(true);
    setSeqGenerating(false);
    setSeqProgress("");
  };

  const handleRegenerateCell = async (lead: any, step: number) => {
    const cellKey = `${lead.id}-${step}`;
    setRegeneratingCells(prev => [...prev, cellKey]);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/generate-lead-emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, step })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Regeneration failed.");
      } else {
        await fetchCampaignData(true);
        if (data.email) {
          setEmailModal(prev => prev && prev.lead.id === lead.id && prev.step === step ? { ...prev, email: data.email } : prev);
        }
      }
    } catch (e) { console.error(e); }
    setRegeneratingCells(prev => prev.filter(k => k !== cellKey));
  };

  const toggleSelectLead = (leadId: string) => {
    setSelectedLeadIds(prev => prev.includes(leadId) ? prev.filter(id => id !== leadId) : [...prev, leadId]);
  };

  const toggleSelectAllLeads = () => {
    if (selectedLeadIds.length === campaignLeads.length && campaignLeads.length > 0) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(campaignLeads.map(cl => cl.leadId));
    }
  };

  const handleBulkApprove = async () => {
    if (selectedLeadIds.length === 0) return;
    setBulkApproving(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/approve-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allSelectedLeads: selectedLeadIds })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Approval failed.");
      } else {
        await fetchCampaignData(true);
        setSelectedLeadIds([]);
        alert(data.count > 0 ? `Approved ${data.count} emails.` : "No pending emails to approve for the selected leads.");
      }
    } catch (e) { console.error(e); }
    setBulkApproving(false);
  };

  const handleSaveResend = async () => {
    const apiKey = resendKeyInput.trim();
    const fromEmail = resendFromInput.trim();
    if (!fromEmail) return alert("Enter the email address you want to send from.");
    if (!campaignData?.resendConfigured && !apiKey) return alert("Enter your Resend API key (starts with re_).");

    setResendBusy(true);
    try {
      const payload: any = { resendFromEmail: fromEmail };
      if (apiKey) payload.resendApiKey = apiKey; // only replace the key when a new one was typed
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setResendKeyInput("");
        setResendFromInput("");
        setResendEditing(false);
        await fetchCampaignData(true);
        if (data.webhookAutoSetup === 'created') {
          alert("Sending account saved. Reply & bounce tracking was set up automatically in your Resend account.");
        } else if (data.webhookAutoSetup === 'skipped-localhost') {
          alert("Sending account saved. Note: reply tracking needs a public app URL — set NEXT_PUBLIC_APP_URL to your ngrok/deployed URL, restart, and re-save the API key so the webhook can be created.");
        } else if (data.webhookAutoSetup === 'failed') {
          alert("Sending account saved, but reply tracking could not be set up in Resend automatically. Add a webhook manually in Resend (events: email.received, email.bounced) pointing to /api/webhooks/resend.");
        }
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save sending account.");
      }
    } catch (e) { console.error(e); }
    setResendBusy(false);
  };

  const handleDisconnectResend = async () => {
    if (!confirm("Remove the Resend API key and sender email from this campaign? Sending will stop until you add them again.")) return;
    setResendBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resendApiKey: null, resendFromEmail: null })
      });
      if (res.ok) await fetchCampaignData(true);
      else {
        const data = await res.json();
        alert(data.error || "Failed to remove sending account.");
      }
    } catch (e) { console.error(e); }
    setResendBusy(false);
  };

  const handleStartCampaign = async () => {
    if (campaignLeads.length === 0) return alert("Add leads to this campaign before starting.");
    const unapproved = campaignLeads.some(cl => {
      const emails = cl.lead.emailSequences || [];
      if (emails.length === 0) return true;
      return emails.some((e: any) => e.sequenceStep === 1 && e.approvalStatus !== 'Approved');
    });
    if (unapproved) {
      const noEmails = campaignLeads.some(cl => !cl.lead.emailSequences || cl.lead.emailSequences.length === 0);
      if (noEmails) return alert("Generate emails for your campaign leads first.");
      return alert("Approve Email 1 for every lead before starting this campaign. Open an email cell and click Approve.");
    }
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/start-sending`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert(campaignData?.status === 'Paused' ? "Campaign restarted! Queued emails will resume sending." : "Campaign started! Email 1 is being sent.");
        await fetchCampaignData(true);
      } else {
        const missing = data.missingRequirements || data.missing;
        if (missing && missing.length > 0) {
          alert(`Failed to start campaign. Missing Requirements:\n\n- ${missing.join('\n- ')}`);
        } else {
          alert(data.error || "Failed to start campaign.");
        }
      }
    } catch(e) { console.error(e); }
  };

  const handlePauseCampaign = async () => {
    if (!confirm("Pause this campaign? Scheduled emails will stop sending until you restart it.")) return;
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/pause`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert("Campaign paused.");
        await fetchCampaignData(true);
      } else {
        alert(data.error || "Failed to pause campaign.");
      }
    } catch(e) { console.error(e); }
  };

  const handleStartSequenceForLeads = async () => {
    if (selectedLeadIds.length === 0) return;
    setStartingLeads(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/start-leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: selectedLeadIds })
      });
      const data = await res.json();
      if (res.ok) {
        await fetchCampaignData(true);
        setSelectedLeadIds([]);
        alert(
          data.requeued > 0
            ? `Started sequences for ${data.leadsStarted} lead${data.leadsStarted === 1 ? '' : 's'} (${data.requeued} emails queued).${data.campaignActivated ? ' Campaign is now Active.' : ''}`
            : "No approved, unsent emails found for the selected leads. Approve their emails first."
        );
      } else {
        alert(data.error || "Failed to start sequences for the selected leads.");
      }
    } catch (e) { console.error(e); }
    setStartingLeads(false);
  };

  const handleRemoveLead = async (leadId: string) => {
    if (!confirm("Remove this lead from the campaign? Its generated emails for this campaign will also be deleted.")) return;
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/leads`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: [leadId] })
      });
      if (res.ok) {
        await fetchCampaignData(true);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to remove lead.");
      }
    } catch (e) { console.error(e); }
  };

  const tabs = ["Overview", "Leads", "Replies", "Booked Meetings"];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/ai-email-agent"
          className="inline-flex items-center text-slate-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft size={16} className="mr-2" />
          Back to Campaigns
        </Link>
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Campaign Details</h2>
            <p className="text-slate-400">Review leads and their AI-generated email sequences.</p>
          </div>
        </div>
      </div>

      <div className="flex space-x-2 border-b border-slate-800 mb-6 overflow-x-auto pb-1">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 font-medium rounded-t-lg transition-colors whitespace-nowrap ${activeTab === tab ? 'bg-purple-600/20 text-purple-400 border-b-2 border-purple-500' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'}`}
          >
            {tab}
            {tab === 'Replies' && campaignReplies.length > 0 ? ` (${campaignReplies.length})` : ''}
            {tab === 'Booked Meetings' && bookedMeetings.length > 0 ? ` (${bookedMeetings.length})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-purple-500" size={40} />
        </div>
      ) : activeTab === "Overview" ? (
         <div className="space-y-6 animate-in fade-in">
           <div className="glass p-8 rounded-2xl border border-slate-700/50">
             <div className="flex justify-between items-center mb-6">
               <h3 className="text-xl font-bold text-white flex items-center gap-2">
                 {campaignData?.name || 'Campaign Overview'}
               </h3>
               <div className="flex items-center space-x-3">
                 <span className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${
                   campaignData?.status === 'Active' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                   campaignData?.status === 'Paused' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                   'bg-slate-500/10 text-slate-400 border-slate-500/30'
                 }`}>
                   {campaignData?.status === 'Paused' ? 'Stopped' : (campaignData?.status || 'Draft')}
                 </span>
                 {campaignData?.status === 'Active' ? (
                   <button
                     onClick={handlePauseCampaign}
                     className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors font-bold shadow-lg shadow-amber-500/20"
                   >
                     Pause Campaign
                   </button>
                 ) : (
                   <button
                     onClick={handleStartCampaign}
                     className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors font-bold shadow-lg shadow-green-500/20"
                   >
                     {campaignData?.status === 'Paused' ? 'Restart Campaign' : 'Start Campaign'}
                   </button>
                 )}
               </div>
             </div>

             {/* Offer */}
             <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-6 mb-6">
               <div className="flex justify-between items-start mb-2">
                 <h4 className="text-white font-bold">Offer</h4>
                 {!editingOffer && (
                   <button
                     onClick={() => { setOfferDraft(campaignData?.offer || ""); setEditingOffer(true); }}
                     className="text-slate-400 hover:text-purple-400 transition-colors flex items-center gap-1 text-xs"
                   >
                     <Pencil size={13} /> Edit Offer
                   </button>
                 )}
               </div>
               {editingOffer ? (
                 <div className="space-y-3">
                   <textarea
                     value={offerDraft}
                     onChange={e => setOfferDraft(e.target.value)}
                     rows={3}
                     placeholder="e.g. We place elite Senior Engineers in 14 days"
                     className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white text-sm focus:border-purple-500 outline-none"
                   />
                   <div className="flex justify-end gap-2">
                     <button
                       onClick={() => setEditingOffer(false)}
                       className="px-3 py-1.5 text-xs text-slate-300 hover:text-white transition-colors"
                     >
                       Cancel
                     </button>
                     <button
                       onClick={handleSaveOffer}
                       disabled={savingOffer || !offerDraft.trim()}
                       className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded transition-colors flex items-center gap-1.5"
                     >
                       {savingOffer ? <Loader2 className="animate-spin" size={13} /> : <Save size={13} />} Save Offer
                     </button>
                   </div>
                   <p className="text-xs text-slate-500">Note: already-generated emails keep their old wording — regenerate sequences (or individual emails) to reflect the new offer.</p>
                 </div>
               ) : (
                 <p className="text-sm text-slate-300">{campaignData?.offer || <span className="text-slate-500 italic">No offer set yet — click Edit Offer to add one. The AI uses it to write every email.</span>}</p>
               )}
             </div>

             {/* Booking Link & AI Reply Handling */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
               <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-6">
                 <div className="flex justify-between items-start mb-2">
                   <h4 className="text-white font-bold">Booking Link (Calendly)</h4>
                   {!editingBooking && (
                     <button
                       onClick={() => { setBookingDraft(campaignData?.bookingLink || campaignData?.ctaLink || ""); setEditingBooking(true); }}
                       className="text-slate-400 hover:text-purple-400 transition-colors flex items-center gap-1 text-xs"
                     >
                       <Pencil size={13} /> Edit
                     </button>
                   )}
                 </div>
                 <p className="text-xs text-slate-500 mb-3">Connect Calendly via OAuth or paste a scheduling link so AI can include it in emails.</p>

                 {calendlyLoading ? (
                   <div className="flex justify-center py-3"><Loader2 className="animate-spin text-purple-400" size={18} /></div>
                 ) : !calendlyStatus.connected ? (
                   <div className="space-y-3 mb-4">
                     <button
                       type="button"
                       onClick={handleConnectCalendly}
                       className="w-full px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                     >
                       <Calendar size={15} /> Connect Calendly
                     </button>
                     <p className="text-[11px] text-slate-500 text-center">Or paste a link manually below</p>
                   </div>
                 ) : (
                   <div className="mb-4 p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
                     <div className="flex items-center justify-between gap-2">
                       <div>
                         <span className="text-[10px] uppercase tracking-wide text-emerald-400 font-semibold">Connected</span>
                         <p className="text-sm text-white">{calendlyStatus.calendlyEmail}</p>
                       </div>
                       {calendlyStatus.schedulingUrl && (
                         <button
                           type="button"
                           onClick={handleUseCalendlyLink}
                           disabled={applyingCalendlyLink}
                           className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 flex items-center gap-1"
                         >
                           {applyingCalendlyLink ? <Loader2 size={12} className="animate-spin" /> : null}
                           Use Calendly link
                         </button>
                       )}
                     </div>
                     {calendlyStatus.schedulingUrl && (
                       <a href={calendlyStatus.schedulingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 break-all block">
                         {calendlyStatus.schedulingUrl}
                       </a>
                     )}
                   </div>
                 )}

                 {editingBooking ? (
                   <div className="space-y-3">
                     <input
                       type="url"
                       value={bookingDraft}
                       onChange={e => setBookingDraft(e.target.value)}
                       placeholder="e.g. https://calendly.com/yourname/30min"
                       className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white text-sm focus:border-purple-500 outline-none"
                     />
                     <div className="flex justify-end gap-2">
                       <button onClick={() => setEditingBooking(false)} className="px-3 py-1.5 text-xs text-slate-300 hover:text-white transition-colors">Cancel</button>
                       <button
                         onClick={handleSaveBookingLink}
                         disabled={savingBooking}
                         className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded transition-colors flex items-center gap-1.5"
                       >
                         {savingBooking ? <Loader2 className="animate-spin" size={13} /> : <Save size={13} />} Save Link
                       </button>
                     </div>
                   </div>
                 ) : (
                   (campaignData?.bookingLink || campaignData?.ctaLink) ? (
                     <div>
                       <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Campaign booking link</p>
                       <a href={campaignData.bookingLink || campaignData.ctaLink} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 break-all">
                         {campaignData.bookingLink || campaignData.ctaLink}
                       </a>
                     </div>
                   ) : (
                     <p className="text-sm text-slate-500 italic">No booking link set — connect Calendly or paste a link so the AI can book calls.</p>
                   )
                 )}
               </div>

               <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-6">
                 <h4 className="text-white font-bold mb-2">AI Reply Handling</h4>
                 <p className="text-xs text-slate-500 mb-3">When a prospect replies, AI classifies their intent (interested, pricing question, meeting request, not interested…) and writes a contextual response pushing toward a booked call.</p>
                 <select
                   value={campaignData?.autoReplyMode || 'draft_first'}
                   onChange={e => handleChangeReplyMode(e.target.value)}
                   className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white text-sm focus:border-purple-500 outline-none"
                 >
                   <option value="draft_first">Draft First — AI drafts a reply, you review &amp; send</option>
                   <option value="auto_send_safe">Auto-send Safe Replies — AI answers automatically when confident</option>
                   <option value="manual_only">Manual Only — AI classifies but never replies</option>
                 </select>
                 <p className="text-xs text-slate-500 mt-2">Drafts appear in the <Link href="/dashboard/replies" className="text-purple-400 hover:text-purple-300">Replies Inbox</Link>.</p>
               </div>
             </div>

             {/* Sending Account */}
             <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-6 mb-6">
               <h4 className="text-white font-bold mb-1 flex items-center gap-2">
                 <Mail size={18} className="text-purple-400" /> Sending Account (Resend)
               </h4>
               <p className="text-xs text-slate-400 mb-2">
                 Emails for this campaign are sent through <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">Resend</a> using your own API key — one key per campaign, with daily limits, open/click tracking, and unsubscribe handling built in. The sender address must be on a domain verified in your Resend account.
               </p>
               <p className="text-xs text-slate-500 mb-4">
                 <strong className="text-slate-400">Replies are captured automatically:</strong> when you save your API key, we set up reply &amp; bounce tracking (a webhook) in your Resend account for you. Just make sure your domain's DNS records from the Resend <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">Domains page</a> are added — including the receiving MX record. Replies then appear in the Replies tab within seconds and stop that lead's follow-ups.
               </p>

               {campaignData?.resendConfigured && campaignData?.resendFromEmail && !resendEditing ? (
                 <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg p-4">
                   <div>
                     <p className="text-white text-sm font-medium flex items-center gap-2">
                       {campaignData.resendFromEmail}
                       <span className="text-[10px] px-1.5 py-0.5 rounded border bg-green-500/10 text-green-400 border-green-500/30">
                         Connected
                       </span>
                     </p>
                     <p className="text-xs text-slate-500 mt-1">
                       Resend API key: ••••••••{campaignData.dailyLimit ? ` · Daily limit: ${campaignData.dailyLimit} emails/day` : ' · Daily limit: 50 emails/day'}
                       {campaignData.resendWebhookId ? ' · Reply tracking: active' : ''}
                     </p>
                     {!campaignData.resendWebhookId && (
                       <p className="text-xs text-amber-400/90 mt-1">
                         Reply tracking is not set up yet — click Edit and re-save your API key (the app URL must be public, e.g. your ngrok or deployed domain).
                       </p>
                     )}
                   </div>
                   <div className="flex items-center gap-3">
                     <button
                       onClick={() => {
                         setResendFromInput(campaignData.resendFromEmail || "");
                         setResendKeyInput("");
                         setResendEditing(true);
                       }}
                       disabled={resendBusy}
                       className="text-xs text-slate-300 hover:text-white transition-colors disabled:opacity-50"
                     >
                       Edit
                     </button>
                     <button
                       onClick={handleDisconnectResend}
                       disabled={resendBusy}
                       className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                     >
                       Remove
                     </button>
                   </div>
                 </div>
               ) : (
                 <div className="space-y-3">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                     <div>
                       <label className="block text-xs text-slate-400 mb-1.5">Resend API key {campaignData?.resendConfigured ? '(leave blank to keep current key)' : ''}</label>
                       <input
                         type="password"
                         value={resendKeyInput}
                         onChange={e => setResendKeyInput(e.target.value)}
                         placeholder="re_..."
                         className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 outline-none"
                       />
                     </div>
                     <div>
                       <label className="block text-xs text-slate-400 mb-1.5">Send emails from</label>
                       <input
                         type="email"
                         value={resendFromInput}
                         onChange={e => setResendFromInput(e.target.value)}
                         placeholder="you@yourdomain.com"
                         className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 outline-none"
                       />
                     </div>
                   </div>
                   <div className="flex items-center gap-3">
                     <button
                       onClick={handleSaveResend}
                       disabled={resendBusy}
                       className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors text-sm font-bold flex items-center gap-2 disabled:opacity-50"
                     >
                       {resendBusy ? <Loader2 className="animate-spin" size={15} /> : <Mail size={15} />}
                       {resendBusy ? "Saving..." : "Save Sending Account"}
                     </button>
                     {resendEditing && (
                       <button
                         onClick={() => { setResendEditing(false); setResendKeyInput(""); setResendFromInput(""); }}
                         disabled={resendBusy}
                         className="text-xs text-slate-400 hover:text-white transition-colors"
                       >
                         Cancel
                       </button>
                     )}
                     <a
                       href="https://resend.com/api-keys"
                       target="_blank"
                       rel="noopener noreferrer"
                       className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                     >
                       Get an API key from the Resend dashboard →
                     </a>
                   </div>
                 </div>
               )}
             </div>

             {campaignLeads.filter(cl => !cl.lead.email || cl.lead.emailStatus === 'Missing').length > 0 && (
               <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 p-4 rounded-xl flex items-start gap-3 mb-6">
                 <AlertTriangle size={20} className="mt-0.5 shrink-0" />
                 <div>
                   <p className="font-semibold">{campaignLeads.filter(cl => !cl.lead.email || cl.lead.emailStatus === 'Missing').length} leads are missing email addresses.</p>
                   <p className="text-sm opacity-90">Enrich contacts in the Client Lead Database before starting an email campaign. Leads without emails will be skipped.</p>
                 </div>
               </div>
             )}

             {/* Readiness Checklist */}
             <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-6 mb-6">
               <h4 className="text-white font-bold mb-3 flex items-center gap-2">
                 <CheckCircle2 size={18} className="text-blue-400" /> Campaign Readiness
               </h4>
               <ul className="space-y-2 text-sm text-slate-300">
                 <li className="flex items-center gap-2">
                   {campaignData?.resendConfigured && campaignData?.resendFromEmail ? <Check size={16} className="text-green-500" /> : <X size={16} className="text-red-500" />}
                   Add a Resend API key &amp; sender email
                 </li>
                 <li className="flex items-center gap-2">
                   {campaignLeads.length > 0 ? <Check size={16} className="text-green-500" /> : <X size={16} className="text-red-500" />}
                   Add leads to campaign
                 </li>
                 <li className="flex items-center gap-2">
                   {campaignLeads.some(cl => cl.lead.emailSequences && cl.lead.emailSequences.length > 0) ? <Check size={16} className="text-green-500" /> : <X size={16} className="text-red-500" />}
                   Generate AI Email Sequences
                 </li>
                 <li className="flex items-center gap-2">
                   {!campaignLeads.some(cl => {
                       const emails = cl.lead.emailSequences || [];
                       if (emails.length === 0) return true;
                       return emails.some((e: any) => e.sequenceStep === 1 && e.approvalStatus !== 'Approved');
                     }) && campaignLeads.length > 0 ? <Check size={16} className="text-green-500" /> : <X size={16} className="text-yellow-500" />}
                   Approve Email 1 for all leads
                 </li>
               </ul>
             </div>

             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                 <p className="text-slate-400 text-sm mb-1">Total Leads</p>
                 <p className="text-2xl font-bold text-white">{campaignLeads.length}</p>
               </div>
               <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                 <p className="text-slate-400 text-sm mb-1">Emails Drafted</p>
                 <p className="text-2xl font-bold text-purple-400">
                   {campaignLeads.reduce((acc, cl) => acc + (cl.lead.emailSequences?.length || 0), 0)}
                 </p>
               </div>
               <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                 <p className="text-slate-400 text-sm mb-1">Emails Approved</p>
                 <p className="text-2xl font-bold text-green-400">
                   {campaignLeads.reduce((acc, cl) => acc + (cl.lead.emailSequences?.filter((e: any) => e.approvalStatus === 'Approved').length || 0), 0)}
                 </p>
               </div>
               <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                 <p className="text-slate-400 text-sm mb-1">Emails Sent</p>
                 <p className="text-2xl font-bold text-blue-400">
                   {campaignLeads.reduce((acc, cl) => acc + (cl.lead.emailSequences?.filter((e: any) => e.status === 'Sent').length || 0), 0)}
                 </p>
               </div>
             </div>
           </div>
         </div>
      ) : activeTab === "Leads" ? (
         <div className="space-y-6 animate-in fade-in">
           <div className="flex justify-between items-center bg-slate-900/50 p-6 rounded-2xl border border-slate-700/50">
             <div>
               <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                 <Users className="text-purple-400" size={20} /> Campaign Leads
               </h3>
               <p className="text-sm text-slate-400">
                 AI writes a unique {seqStepCount}-step email sequence per lead — Track A for companies actively hiring, Track B nurture for future potential.
               </p>
             </div>
             <div className="flex space-x-3 items-center">
               <button
                 onClick={handleGenerateLeadSequences}
                 disabled={seqGenerating}
                 className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors shadow-lg shadow-green-500/25 text-sm font-bold flex items-center gap-2 disabled:opacity-50"
               >
                 {seqGenerating ? <Loader2 className="animate-spin" size={16} /> : <Mail size={16} />}
                 <span>{seqGenerating ? "Generating..." : "Generate Email Sequences"}</span>
               </button>
               <button
                 onClick={() => window.location.href = '/dashboard/leads'}
                 className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors shadow-lg shadow-purple-500/25 text-sm font-bold"
               >
                 Go to Client Lead Database
               </button>
             </div>
           </div>

           {seqGenerating && (
             <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-300 text-sm font-medium animate-pulse text-center">
               {seqProgress}
             </div>
           )}

           {campaignLeads.length > 0 && (
             <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded-lg border border-slate-700">
               <div className="flex items-center gap-3">
                 <input
                   type="checkbox"
                   checked={selectedLeadIds.length === campaignLeads.length && campaignLeads.length > 0}
                   onChange={toggleSelectAllLeads}
                   className="w-4 h-4 rounded border-slate-600 bg-slate-900 focus:ring-purple-500 cursor-pointer"
                 />
                 <span className="text-sm text-slate-300">{selectedLeadIds.length} leads selected</span>
               </div>
               <div className="flex gap-2">
                 <button
                   onClick={() => setSelectedLeadIds([])}
                   disabled={selectedLeadIds.length === 0}
                   className="px-3 py-1.5 bg-slate-700 text-slate-300 text-xs font-medium rounded hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   Clear Selection
                 </button>
                 <button
                   onClick={handleBulkApprove}
                   disabled={selectedLeadIds.length === 0 || bulkApproving}
                   className="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded transition-colors shadow-lg shadow-green-500/20 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   {bulkApproving ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
                   {bulkApproving ? "Approving..." : `Approve All Emails (${selectedLeadIds.length} leads)`}
                 </button>
                 <button
                   onClick={handleStartSequenceForLeads}
                   disabled={selectedLeadIds.length === 0 || startingLeads}
                   title="Queue the approved emails for the selected leads and start sending their sequence"
                   className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded transition-colors shadow-lg shadow-purple-500/20 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   {startingLeads ? <Loader2 className="animate-spin" size={13} /> : <Send size={13} />}
                   {startingLeads ? "Starting..." : `Start Sequence (${selectedLeadIds.length} leads)`}
                 </button>
               </div>
             </div>
           )}

           {campaignLeads.length === 0 ? (
             <div className="glass p-12 rounded-2xl border border-slate-700/50 text-center">
               <h3 className="text-lg text-white mb-2">No leads added yet.</h3>
               <p className="text-slate-400 text-sm mb-4">Add leads from the Client Lead Database.</p>
               <Link href="/dashboard/leads" className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2 mt-auto">
                    <Search size={16} /> Go to Client Lead Database
               </Link>
             </div>
           ) : (
             <div className="glass rounded-xl border border-slate-800 overflow-hidden overflow-x-auto">
               <table className="w-full text-left border-collapse min-w-[1700px]">
                 <thead>
                   <tr className="bg-slate-900/80 border-b border-slate-800 text-slate-400 text-xs uppercase">
                     <th className="p-4 w-12 text-center">
                       <input
                         type="checkbox"
                         checked={selectedLeadIds.length === campaignLeads.length && campaignLeads.length > 0}
                         onChange={toggleSelectAllLeads}
                         className="w-4 h-4 rounded border-slate-600 bg-slate-900 focus:ring-purple-500 cursor-pointer"
                       />
                     </th>
                     <th className="p-4 font-medium">Name & Role</th>
                     <th className="p-4 font-medium">Company / Business</th>
                     <th className="p-4 font-medium">Contact Data</th>
                     <th className="p-4 font-medium">Location & Industry</th>
                     <th className="p-4 font-medium">AI Fit Score</th>
                     {SEQ_STEPS.map(step => (
                       <th key={step} className="p-4 font-medium">Email Sequence {step}</th>
                     ))}
                     <th className="p-4 font-medium">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="text-sm divide-y divide-slate-800/50">
                   {campaignLeads.map((cl) => {
                     const lead = cl.lead;
                     return (
                       <tr key={lead.id} className="hover:bg-slate-800/50 transition-colors">
                         <td className="p-4 text-center">
                           <input
                             type="checkbox"
                             checked={selectedLeadIds.includes(lead.id)}
                             onChange={() => toggleSelectLead(lead.id)}
                             className="w-4 h-4 rounded border-slate-600 bg-slate-900 focus:ring-purple-500 cursor-pointer"
                           />
                         </td>
                         <td className="p-4">
                           <p className="font-bold text-white">{lead.fullName || lead.firstName || 'Unknown Name'}</p>
                           <p className="text-xs text-slate-400 mt-1">{lead.jobTitle || 'Role Unspecified'}</p>
                         </td>
                         <td className="p-4">
                           <p className="font-medium text-white">{lead.companyName || lead.businessName || 'No company detected'}</p>
                           <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border ${lead.hiringStatus === 'Hiring' ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                             {lead.hiringStatus === 'Hiring' ? 'Track A · Hiring' : 'Track B · Nurture'}
                           </span>
                         </td>
                         <td className="p-4 space-y-1">
                           <p className="text-xs text-slate-300">{lead.email || 'No email'}</p>
                           <p className="text-xs text-slate-300">{lead.phone || 'No phone'}</p>
                         </td>
                         <td className="p-4">
                           <p className="text-xs text-slate-300">{lead.location || 'Unknown'}</p>
                           <p className="text-xs text-slate-400">{lead.industry || 'General'}</p>
                         </td>
                         <td className="p-4">
                           <span className="text-xs font-bold text-slate-300">{lead.leadScore || 0}/100</span>
                         </td>
                         {SEQ_STEPS.map(step => {
                           const seqEmail = (lead.emailSequences || []).find((e: any) => e.sequenceStep === step);
                           const cellKey = `${lead.id}-${step}`;
                           const isRegen = regeneratingCells.includes(cellKey);
                           const isApproved = seqEmail?.approvalStatus === 'Approved';
                           const isSent = seqEmail?.status === 'Sent';
                           return (
                             <td key={step} className="p-4">
                               {isRegen ? (
                                 <span className="flex items-center gap-1.5 text-xs text-purple-400">
                                   <Loader2 className="animate-spin" size={14} /> Writing...
                                 </span>
                               ) : seqEmail ? (
                                 <div className="space-y-1">
                                   <div className="flex items-center gap-1.5">
                                     <button
                                       onClick={() => setEmailModal({ lead, step, email: seqEmail })}
                                       title={seqEmail.subject}
                                       className={`max-w-[150px] truncate text-left text-xs px-2 py-1.5 rounded border transition-colors ${isApproved ? 'bg-green-500/10 text-green-300 border-green-500/30 hover:bg-green-500/20' : 'bg-purple-500/10 text-purple-300 border-purple-500/30 hover:bg-purple-500/20'}`}
                                     >
                                       {seqEmail.subject}
                                     </button>
                                     {!isSent && (
                                       <button
                                         onClick={() => handleRegenerateCell(lead, step)}
                                         title="Regenerate this email"
                                         className="text-slate-500 hover:text-purple-400 transition-colors shrink-0"
                                       >
                                         <RefreshCw size={13} />
                                       </button>
                                     )}
                                   </div>
                                   <SendStatusLabel email={seqEmail} />
                                 </div>
                               ) : (
                                 <span className="text-xs text-slate-600">Not generated</span>
                               )}
                             </td>
                           );
                         })}
                         <td className="p-4">
                           <div className="flex items-center gap-3">
                             <button
                               onClick={() => setEditLeadModal(lead)}
                               title="Edit lead details"
                               className="text-slate-400 hover:text-purple-400 transition-colors"
                             >
                               <Pencil size={14} />
                             </button>
                             <button onClick={() => handleRemoveLead(lead.id)} className="text-xs text-red-400 hover:text-red-300 transition-colors">Remove</button>
                           </div>
                         </td>
                       </tr>
                     );
                   })}
                 </tbody>
               </table>
             </div>
           )}
         </div>
      ) : activeTab === "Booked Meetings" ? (
        <CampaignBookedMeetingsTab
          meetings={bookedMeetings}
          onRefresh={fetchBookedMeetings}
        />
      ) : (
        <CampaignRepliesTab
          campaignLeads={campaignLeads}
          replies={campaignReplies}
          onRefresh={() => fetchCampaignData(true)}
        />
      )}

      {editLeadModal && (
        <EditLeadModal
          lead={editLeadModal}
          onClose={() => setEditLeadModal(null)}
          onSaved={async () => {
            setEditLeadModal(null);
            await fetchCampaignData(true);
          }}
        />
      )}

      {emailModal && (
        <EmailSequenceModal
          key={`${emailModal.email.id}-${emailModal.email.updatedAt || ''}`}
          lead={emailModal.lead}
          step={emailModal.step}
          email={emailModal.email}
          regenerating={regeneratingCells.includes(`${emailModal.lead.id}-${emailModal.step}`)}
          onRegenerate={() => handleRegenerateCell(emailModal.lead, emailModal.step)}
          onApproved={() => fetchCampaignData(true)}
          onClose={() => setEmailModal(null)}
        />
      )}
    </div>
  );
}

function htmlToPlain(text: string): string {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/** Chat-friendly body: strip HTML and quoted email history. */
function chatMessageBody(text: string): string {
  return extractLatestReplyText(htmlToPlain(text));
}

function CampaignBookedMeetingsTab({
  meetings,
  onRefresh,
}: {
  meetings: any[];
  onRefresh: () => void;
}) {
  const [syncing, setSyncing] = useState(false);

  const contactName = (lead: any) => {
    if (!lead) return '—';
    if (lead.fullName?.trim()) return lead.fullName.trim();
    const parts = [lead.firstName, lead.lastName].filter(Boolean);
    return parts.length ? parts.join(' ') : lead.email || '—';
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/integrations/calendly/sync', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Calendly sync failed. Connect Calendly on the Overview tab first.');
      } else {
        await onRefresh();
      }
    } catch (e) {
      console.error(e);
      alert('Calendly sync failed.');
    }
    setSyncing(false);
  };

  const now = Date.now();
  const visibleMeetings = meetings.filter((call) => {
    const date = call.callDate || call.createdAt;
    if (!date) return true;
    return new Date(date).getTime() >= now;
  });

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="glass rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="p-4 border-b border-slate-800 bg-slate-900/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-emerald-400" />
            <h3 className="text-lg font-bold text-white">Booked Meetings</h3>
            <span className="text-sm text-slate-500">({visibleMeetings.length})</span>
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-50 flex items-center gap-1.5"
          >
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Sync from Calendly
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-6 py-4 font-medium">Contact</th>
                <th className="px-6 py-4 font-medium">Company</th>
                <th className="px-6 py-4 font-medium">Call Date</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {visibleMeetings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-slate-800/50 text-slate-500 flex items-center justify-center rounded-full mb-4">
                        <Calendar size={32} />
                      </div>
                      <h3 className="text-lg font-medium text-white mb-2">No booked meetings</h3>
                      <p className="text-slate-400 max-w-sm text-sm">
                        Meetings booked via Calendly or marked from replies will show up here. Use Sync from Calendly if a booking is missing.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                visibleMeetings.map((call) => (
                  <tr key={call.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">{contactName(call.lead)}</div>
                      {call.lead?.email && (
                        <div className="text-xs text-slate-500">{call.lead.email}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      {call.lead?.businessName || '—'}
                    </td>
                    <td className="px-6 py-4">
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
                        : new Date(call.createdAt).toLocaleString(undefined, {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: true,
                          })}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 text-xs rounded-full border bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                        {call.status || 'Scheduled'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {call.lead?.id && (
                        <Link
                          href={`/dashboard/leads/${call.lead.id}`}
                          className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
                        >
                          View lead <ExternalLink size={12} />
                        </Link>
                      )}
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

function CampaignRepliesTab({ campaignLeads, replies, onRefresh }: { campaignLeads: any[], replies: any[], onRefresh: () => void }) {
  const leadsById: Record<string, any> = {};
  campaignLeads.forEach(cl => { leadsById[cl.lead.id] = cl.lead; });

  // Group replies into conversations per lead, newest activity first
  const conversations: { leadId: string; lead: any; replies: any[] }[] = [];
  for (const reply of replies) {
    if (!reply.leadId) continue;
    let conv = conversations.find(c => c.leadId === reply.leadId);
    if (!conv) {
      conv = { leadId: reply.leadId, lead: leadsById[reply.leadId] || reply.lead, replies: [] };
      conversations.push(conv);
    }
    conv.replies.push(reply);
  }
  conversations.forEach(c => c.replies.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
  conversations.sort((a, b) => new Date(b.replies[b.replies.length - 1].createdAt).getTime() - new Date(a.replies[a.replies.length - 1].createdAt).getTime());

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Replies arrive automatically via the Resend webhook — this just refetches.
  const syncInbox = async () => {
    setSyncing(true);
    try {
      await onRefresh();
    } finally {
      setSyncing(false);
    }
  };

  const activeLeadId = selectedLeadId && conversations.some(c => c.leadId === selectedLeadId)
    ? selectedLeadId
    : conversations[0]?.leadId || null;
  const activeConv = conversations.find(c => c.leadId === activeLeadId) || null;
  const activeLead = activeConv?.lead;

  const latestInbound = activeConv ? activeConv.replies[activeConv.replies.length - 1] : null;
  const aiDraft = latestInbound && latestInbound.aiSuggestedReply && latestInbound.aiReplyStatus !== 'Sent'
    ? latestInbound.aiSuggestedReply
    : null;

  // Build the chat timeline: sent campaign emails + inbound replies
  const outbound = (activeLead?.emailSequences || [])
    .filter((e: any) => e.status === 'Sent' && e.sentAt)
    .map((e: any) => ({
      kind: 'out' as const,
      time: e.sentAt,
      subject: e.subject,
      body: chatMessageBody(e.body),
      label: e.sequenceStep >= 99 ? 'Reply' : `Email ${e.sequenceStep}`,
    }));
  const inbound = (activeConv?.replies || []).map((r: any) => ({
    kind: 'in' as const,
    time: r.createdAt,
    subject: r.subject,
    body: chatMessageBody(r.emailBody || r.body),
    classification: r.aiCategory || r.classification || 'Unknown',
  }));
  const messages = [...outbound, ...inbound].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  const handleSend = async () => {
    if (!replyText.trim() || !latestInbound) return;
    setSending(true);
    try {
      const res = await fetch(`/api/replies/${latestInbound.id}/send-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyText.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to send reply.');
      } else {
        setReplyText("");
        onRefresh();
      }
    } catch (e) { console.error(e); }
    setSending(false);
  };

  if (conversations.length === 0) {
    return (
      <div className="glass p-12 rounded-2xl border border-slate-700/50 text-center">
        <MessageSquare size={40} className="text-slate-600 mx-auto mb-4" />
        <h3 className="text-lg text-white mb-2">No replies yet.</h3>
        <p className="text-slate-400 text-sm max-w-md mx-auto mb-6">
          When a prospect replies to a campaign email, it arrives here automatically via your
          Resend reply tracking. AI classifies their intent and drafts a contextual response
          you can review and send.
        </p>
        <button
          onClick={syncInbox}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in">
      {/* Conversation list */}
      <div className="glass rounded-xl border border-slate-700/50 overflow-hidden lg:max-h-[650px] overflow-y-auto">
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between gap-2">
          <h4 className="text-white font-bold text-sm flex items-center gap-2">
            <MessageSquare size={15} className="text-purple-400" /> Conversations ({conversations.length})
          </h4>
          <button
            onClick={syncInbox}
            disabled={syncing}
            title="Refresh conversations"
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 px-2 py-1 rounded border border-slate-700 hover:border-slate-500 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
        {conversations.map(conv => {
          const last = conv.replies[conv.replies.length - 1];
          const isActive = conv.leadId === activeLeadId;
          return (
            <button
              key={conv.leadId}
              onClick={() => { setSelectedLeadId(conv.leadId); setReplyText(""); }}
              className={`w-full text-left p-4 border-b border-slate-800/50 transition-colors ${isActive ? 'bg-purple-500/10 border-l-2 border-l-purple-500' : 'hover:bg-slate-800/40'}`}
            >
              <div className="flex justify-between items-start mb-1">
                <p className="text-sm font-bold text-white truncate">
                  {conv.lead?.fullName || conv.lead?.firstName || conv.lead?.businessName || last.fromEmail}
                </p>
                <span className="text-[10px] text-slate-500 shrink-0 ml-2">{shortDate(last.createdAt)}</span>
              </div>
              <p className="text-xs text-slate-400 truncate mb-1.5">{conv.lead?.companyName || conv.lead?.businessName || last.fromEmail}</p>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/30">
                  {last.aiCategory || last.classification || 'Unknown'}
                </span>
                {last.status === 'Unread' && <span className="w-2 h-2 rounded-full bg-blue-400" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Chat thread */}
      <div className="lg:col-span-2 glass rounded-xl border border-slate-700/50 flex flex-col lg:max-h-[650px]">
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
          <div>
            <h4 className="text-white font-bold text-sm">
              {activeLead?.fullName || activeLead?.firstName || activeLead?.businessName || latestInbound?.fromEmail}
            </h4>
            <p className="text-xs text-slate-400">{latestInbound?.fromEmail}</p>
          </div>
          {latestInbound && (
            <span className="text-[10px] px-2 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/30">
              Intent: {latestInbound.aiCategory || latestInbound.classification || 'Unknown'}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-[300px]">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.kind === 'out' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-xl p-4 text-sm ${msg.kind === 'out' ? 'bg-purple-600/20 border border-purple-500/30 text-purple-100' : 'bg-slate-800 border border-slate-700 text-slate-200'}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wide ${msg.kind === 'out' ? 'text-purple-400' : 'text-slate-400'}`}>
                    {msg.kind === 'out' ? `You · ${(msg as any).label}` : 'Prospect'}
                  </span>
                  <span className="text-[10px] text-slate-500">{new Date(msg.time).toLocaleString()}</span>
                </div>
                {msg.subject && <p className="text-xs font-semibold mb-1 opacity-80">{msg.subject}</p>}
                <p className="whitespace-pre-wrap">{msg.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Composer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/40 space-y-2">
          {aiDraft && (
            <button
              onClick={() => setReplyText(htmlToPlain(aiDraft))}
              className="text-xs px-2.5 py-1.5 bg-purple-500/10 text-purple-300 border border-purple-500/30 rounded hover:bg-purple-500/20 transition-colors flex items-center gap-1.5"
            >
              <MessageSquare size={12} /> Use AI-suggested reply
            </button>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              rows={3}
              placeholder={`Reply to ${activeLead?.firstName || 'this prospect'}... (sent from your campaign's sender email)`}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 outline-none resize-none"
            />
            <button
              onClick={handleSend}
              disabled={sending || !replyText.trim()}
              className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 shrink-0"
            >
              {sending ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />} Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditLeadModal({ lead, onClose, onSaved }: { lead: any, onClose: () => void, onSaved: () => void }) {
  const [form, setForm] = useState({
    fullName: lead.fullName || '',
    jobTitle: lead.jobTitle || '',
    businessName: lead.companyName || lead.businessName || '',
    email: lead.email || '',
    phone: lead.phone || '',
    location: lead.location || '',
    industry: lead.industry || lead.category || '',
  });
  const [saving, setSaving] = useState(false);

  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.businessName.trim()) return alert('Business name is required.');
    setSaving(true);
    try {
      const nameParts = form.fullName.trim().split(/\s+/).filter(Boolean);
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: form.businessName.trim(),
          ...(lead.companyName ? { companyName: form.businessName.trim() } : {}),
          fullName: form.fullName.trim() || null,
          firstName: nameParts[0] || null,
          lastName: nameParts.length > 1 ? nameParts.slice(1).join(' ') : null,
          jobTitle: form.jobTitle.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          location: form.location.trim() || null,
          industry: form.industry.trim() || null,
        })
      });
      const data = await res.json();
      if (!res.ok) alert(data.error || 'Failed to update lead.');
      else onSaved();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const field = (label: string, key: keyof typeof form, placeholder: string, span2 = false) => (
    <div className={`space-y-1 ${span2 ? 'col-span-2' : ''}`}>
      <label className="text-xs font-medium text-slate-400">{label}</label>
      <input
        type="text"
        value={form[key]}
        onChange={e => set(key, e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white text-sm focus:border-purple-500 outline-none"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-6 border-b border-slate-800">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Pencil size={16} className="text-purple-400" /> Edit Lead
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          {field('Contact Person Name', 'fullName', 'e.g. John Doe')}
          {field('Role / Job Title', 'jobTitle', 'e.g. Founder, HR Manager')}
          {field('Business Name', 'businessName', 'e.g. Acme Corp', true)}
          {field('Email', 'email', 'e.g. john@acme.com')}
          {field('Phone', 'phone', 'e.g. +1 234 567 8900')}
          {field('Location', 'location', 'e.g. Texas')}
          {field('Industry', 'industry', 'e.g. Restaurants')}
        </div>
        <div className="p-4 border-t border-slate-800 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.businessName.trim()}
            className="px-5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Update Lead
          </button>
        </div>
      </div>
    </div>
  );
}

function shortDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function relativeDay(value: string | Date): string {
  const d = new Date(value);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86400000);
  if (diffDays <= 0) return `today at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  if (diffDays === 1) return 'tomorrow';
  return `in ${diffDays} days (${shortDate(d)})`;
}

function SendStatusLabel({ email }: { email: any }) {
  let text: string;
  let cls: string;

  if (email.status === 'Sent') {
    text = `✓ Sent ${shortDate(email.sentAt)}`;
    cls = 'text-green-400';
  } else if (email.status === 'Failed') {
    text = '✕ Send failed';
    cls = 'text-red-400';
  } else if (email.status === 'Cancelled') {
    text = 'Stopped';
    cls = 'text-slate-500';
  } else if (email.status === 'Queued') {
    text = email.scheduledAt ? `Sends ${relativeDay(email.scheduledAt)}` : 'Queued to send';
    cls = 'text-blue-400';
  } else if (email.approvalStatus === 'Approved') {
    text = email.delayAmount > 0 ? `Sends ~${email.delayAmount} days after start` : 'Sends when campaign starts';
    cls = 'text-blue-400';
  } else {
    text = 'Awaiting approval';
    cls = 'text-yellow-500';
  }

  return <p className={`text-[10px] font-medium ${cls}`}>{text}</p>;
}

function EmailSequenceModal({ lead, step, email, regenerating, onRegenerate, onApproved, onClose }: { lead: any, step: number, email: any, regenerating: boolean, onRegenerate: () => void, onApproved: () => void, onClose: () => void }) {
  const [subject, setSubject] = useState(email.subject || '');
  const [body, setBody] = useState(email.body || '');
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(email.approvalStatus === 'Approved');

  const isHiring = lead.hiringStatus === 'Hiring';

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/email-sequences/${email.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body })
      });
      const data = await res.json();
      if (!res.ok) alert(data.error || 'Save failed.');
      else alert('Email saved.');
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      const res = await fetch(`/api/email-sequences/${email.id}/approve`, { method: 'POST' });
      if (res.ok) {
        setApproved(true);
        onApproved();
      } else {
        const data = await res.json();
        alert(data.error || 'Approval failed.');
      }
    } catch (e) { console.error(e); }
    setApproving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start p-6 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Mail size={18} className="text-purple-400" /> Email Sequence {step}
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              {lead.fullName || lead.firstName || 'Unknown contact'} · {lead.companyName || lead.businessName || 'Unknown company'}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${isHiring ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                {isHiring ? 'Track A · Actively Hiring' : 'Track B · Future Potential'}
              </span>
              {email.emailType && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/30">{email.emailType}</span>
              )}
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
                Day {email.delayAmount ?? 0}
              </span>
              {approved && email.status !== 'Sent' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30 flex items-center gap-1">
                  <Check size={10} /> Approved
                </span>
              )}
              {email.status === 'Sent' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30 flex items-center gap-1">
                  <Check size={10} /> Sent {shortDate(email.sentAt)}
                </span>
              )}
              {email.status === 'Queued' && email.scheduledAt && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  Sends {relativeDay(email.scheduledAt)}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {regenerating ? (
            <div className="flex flex-col items-center justify-center py-16 text-purple-400">
              <Loader2 className="animate-spin mb-3" size={28} />
              <p className="text-sm">Writing a new version of this email...</p>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">Subject Line</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  disabled={approved}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white text-sm focus:border-purple-500 outline-none disabled:opacity-60"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">Body</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  disabled={approved}
                  rows={12}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white text-sm focus:border-purple-500 outline-none disabled:opacity-60"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={onRegenerate}
                  disabled={regenerating || approved || email.status === 'Sent'}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded transition-colors flex items-center gap-1.5 border border-slate-700 disabled:opacity-50"
                >
                  <RefreshCw size={13} /> Regenerate
                </button>
                <div className="flex gap-2">
                  <button onClick={onClose} className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded transition-colors border border-slate-700">
                    Close
                  </button>
                  {!approved && (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="animate-spin" size={13} /> : <Save size={13} />} Save
                      </button>
                      <button
                        onClick={handleApprove}
                        disabled={approving}
                        className="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {approving ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />} Approve
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
