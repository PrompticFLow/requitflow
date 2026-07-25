"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Mail, Users, Check, RefreshCw, Save, AlertTriangle, CheckCircle2, X, Search, Pencil } from "lucide-react";

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const [activeTab, setActiveTab] = useState("Leads");
  const [loading, setLoading] = useState(true);
  const [campaignLeads, setCampaignLeads] = useState<any[]>([]);
  const [campaignData, setCampaignData] = useState<any>(null);

  // Gmail Sending Account State
  const [gmailAccounts, setGmailAccounts] = useState<any[]>([]);
  const [selectedGmailId, setSelectedGmailId] = useState("");
  const [gmailBusy, setGmailBusy] = useState(false);

  // Email Sequence State
  const [seqGenerating, setSeqGenerating] = useState(false);
  const [seqProgress, setSeqProgress] = useState("");
  const [regeneratingCells, setRegeneratingCells] = useState<string[]>([]);
  const [emailModal, setEmailModal] = useState<{ lead: any; step: number; email: any } | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [editLeadModal, setEditLeadModal] = useState<any | null>(null);

  // Offer editing state
  const [editingOffer, setEditingOffer] = useState(false);
  const [offerDraft, setOfferDraft] = useState("");
  const [savingOffer, setSavingOffer] = useState(false);

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

  const fetchCampaignData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [seqRes, campRes, gmailRes] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}/email-sequences`),
        fetch(`/api/campaigns/${campaignId}`),
        fetch(`/api/integrations/gmail/accounts`)
      ]);
      const seqData = await seqRes.json();
      if (seqData.campaignLeads) setCampaignLeads(seqData.campaignLeads);

      if (campRes.ok) {
        const campData = await campRes.json();
        setCampaignData(campData.campaign);
      }

      if (gmailRes.ok) {
        const gmailData = await gmailRes.json();
        setGmailAccounts(gmailData.accounts || []);
      }
    } catch(e) {
      console.error(e);
    }
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    fetchCampaignData();
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

  const handleAttachGmail = async (accountId: string | null) => {
    setGmailBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gmailAccountId: accountId })
      });
      if (res.ok) await fetchCampaignData(true);
      else {
        const data = await res.json();
        alert(data.error || "Failed to update sending account.");
      }
    } catch (e) { console.error(e); }
    setGmailBusy(false);
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

  const tabs = ["Overview", "Leads"];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Campaign Details</h2>
          <p className="text-slate-400">Review leads and their AI-generated email sequences.</p>
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
               <div className="flex space-x-3">
                 <button
                   onClick={async () => {
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
                       if (res.ok) alert("Campaign started! Email 1 is being sent.");
                       else {
                         const missing = data.missingRequirements || data.missing;
                         if (missing && missing.length > 0) {
                           alert(`Failed to start campaign. Missing Requirements:\n\n- ${missing.join('\n- ')}`);
                         } else {
                           alert(data.error || "Failed to start campaign.");
                         }
                       }
                     } catch(e) { console.error(e); }
                   }}
                   className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors font-bold shadow-lg shadow-green-500/20"
                 >
                   Start Campaign
                 </button>
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

             {/* Sending Account */}
             <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-6 mb-6">
               <h4 className="text-white font-bold mb-1 flex items-center gap-2">
                 <Mail size={18} className="text-purple-400" /> Sending Account
               </h4>
               <p className="text-xs text-slate-400 mb-4">Emails for this campaign are sent from your own connected Gmail account, with daily limits, open/reply/bounce tracking, and unsubscribe handling built in.</p>

               {(() => {
                 const connected = gmailAccounts.find(a => a.id === campaignData?.gmailAccountId);
                 if (connected) {
                   return (
                     <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg p-4">
                       <div>
                         <p className="text-white text-sm font-medium flex items-center gap-2">
                           {connected.email}
                           <span className={`text-[10px] px-1.5 py-0.5 rounded border ${connected.status === 'Active' ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                             {connected.status}
                           </span>
                         </p>
                         <p className="text-xs text-slate-500 mt-1">
                           Daily limit: {connected.dailyLimit} emails/day
                           {connected.lastSyncedAt ? ` · Last inbox sync: ${new Date(connected.lastSyncedAt).toLocaleString()}` : ''}
                         </p>
                         {connected.lastError && (
                           <p className="text-xs text-red-400 mt-1">Last error: {connected.lastError}</p>
                         )}
                       </div>
                       <button
                         onClick={() => handleAttachGmail(null)}
                         disabled={gmailBusy}
                         className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                       >
                         Detach from campaign
                       </button>
                     </div>
                   );
                 }
                 return (
                   <div className="flex flex-wrap items-center gap-3">
                     <button
                       onClick={() => window.location.href = `/api/integrations/gmail/connect?campaignId=${campaignId}`}
                       className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors text-sm font-bold flex items-center gap-2"
                     >
                       <Mail size={15} /> Connect Gmail
                     </button>
                     {gmailAccounts.length > 0 && (
                       <>
                         <span className="text-xs text-slate-500">or use an already connected account:</span>
                         <select
                           value={selectedGmailId}
                           onChange={e => setSelectedGmailId(e.target.value)}
                           className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                         >
                           <option value="">Select account...</option>
                           {gmailAccounts.map(a => (
                             <option key={a.id} value={a.id}>{a.email}</option>
                           ))}
                         </select>
                         <button
                           onClick={() => selectedGmailId && handleAttachGmail(selectedGmailId)}
                           disabled={!selectedGmailId || gmailBusy}
                           className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors text-sm font-bold disabled:opacity-50"
                         >
                           {gmailBusy ? "Attaching..." : "Use this account"}
                         </button>
                       </>
                     )}
                   </div>
                 );
               })()}
             </div>

             {campaignLeads.filter(cl => !cl.lead.email || cl.lead.emailStatus === 'Missing').length > 0 && (
               <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 p-4 rounded-xl flex items-start gap-3 mb-6">
                 <AlertTriangle size={20} className="mt-0.5 shrink-0" />
                 <div>
                   <p className="font-semibold">{campaignLeads.filter(cl => !cl.lead.email || cl.lead.emailStatus === 'Missing').length} leads are missing email addresses.</p>
                   <p className="text-sm opacity-90">Enrich contacts on the Person Leads Database page before starting an email campaign. Leads without emails will be skipped.</p>
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
                   {campaignData?.gmailAccountId ? <Check size={16} className="text-green-500" /> : <X size={16} className="text-red-500" />}
                   Connect a Gmail sending account
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
      ) : (
         <div className="space-y-6">
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
                 onClick={() => window.location.href = '/dashboard/person-leads'}
                 className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors shadow-lg shadow-purple-500/25 text-sm font-bold"
               >
                 Go to Person Leads Database
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
               </div>
             </div>
           )}

           {campaignLeads.length === 0 ? (
             <div className="glass p-12 rounded-2xl border border-slate-700/50 text-center">
               <h3 className="text-lg text-white mb-2">No leads added yet.</h3>
               <p className="text-slate-400 text-sm mb-4">Add person leads from the Person Leads Database.</p>
               <Link href="/dashboard/person-leads" className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2 mt-auto">
                    <Search size={16} /> Go to Person Leads Database
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
