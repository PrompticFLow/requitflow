"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Mail, Users, BarChart3, Settings, MessageSquare, Check, RefreshCw, Save, Send, AlertTriangle, Calendar, Clock, Edit3, BookOpen, CheckCircle2, X, Search } from "lucide-react";
import { buildLeadPersonalization } from "@/lib/lead-personalization";

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = params.id as string;
  
  const [activeTab, setActiveTab] = useState("Sequence");
  const [loading, setLoading] = useState(true);
  const [campaignLeads, setCampaignLeads] = useState<any[]>([]);
  const [campaignData, setCampaignData] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState("");
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [campaignReplies, setCampaignReplies] = useState<any[]>([]);
  
  // Knowledge Base State
  const [kbFiles, setKbFiles] = useState<any[]>([]);
  const [uploadingKb, setUploadingKb] = useState(false);
  const [selectedKbFileIds, setSelectedKbFileIds] = useState<string[]>([]);

  
  // Leads Tab State
  const [leadSearch, setLeadSearch] = useState("");
  const [leadFilter, setLeadFilter] = useState("All");
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  const fetchCampaignData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/email-sequences`);
      const data = await res.json();
      if (data.campaignLeads) {
        setCampaignLeads(data.campaignLeads);
      }
      
      const campRes = await fetch(`/api/campaigns`); // We need campaign details. Or maybe just use local state for settings
      
      const kbRes = await fetch(`/api/knowledge-base`);
      if (kbRes.ok) {
        const kbData = await kbRes.json();
        setKbFiles(kbData.files || []);
      }

      const repliesRes = await fetch(`/api/replies?campaignId=${campaignId}`);
      if (repliesRes.ok) {
        const repliesData = await repliesRes.json();
        setCampaignReplies(repliesData.replies || []);
      }
    } catch(e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleUploadKb = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('campaignId', campaignId);
    
    setUploadingKb(true);
    try {
      const res = await fetch('/api/knowledge-base/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        alert("Knowledge file uploaded and ready.");
        fetchCampaignData();
      } else {
        alert(data.error || "Upload failed");
      }
    } catch (err) {
      alert("We could not read this file. Please upload a text-based PDF, DOCX, TXT, CSV, Markdown, or JSON file.");
    }
    setUploadingKb(false);
  };


  useEffect(() => {
    fetchCampaignData();
  }, [campaignId]);

  const handleGenerateSequences = async () => {
    const validLeads = campaignLeads.filter(cl => cl.lead.email && cl.lead.emailStatus !== 'Missing');
    const leadsToGenerate = validLeads.filter(cl => !cl.lead.emailSequences || cl.lead.emailSequences.length < 25).map(cl => cl.leadId);
    
    if (validLeads.length === 0) {
      return alert("No leads with valid email addresses found. Please enrich your leads first.");
    }
    if (leadsToGenerate.length === 0) {
      return alert("All leads with email addresses already have 25-Step email sequences.");
    }

    setGenerating(true);
    
    const batchSize = 10;
    for (let i = 0; i < leadsToGenerate.length; i += batchSize) {
      const batch = leadsToGenerate.slice(i, i + batchSize);
      setGenProgress(`Generating 25-Step sequences for leads ${i + 1} to ${Math.min(i + batchSize, leadsToGenerate.length)} of ${leadsToGenerate.length}...`);
      
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/generate-email-sequence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadIds: batch })
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.error || "Generation failed for this batch.");
          break;
        }
      } catch (err: any) {
        console.error("Batch failed", err);
        alert(err.message || "Failed to generate sequence.");
        break;
      }
    }

    setGenProgress("Completed!");
    await fetchCampaignData();
    setGenerating(false);
  };

  const handleRegenerate = async (emailId: string) => {
    try {
      const res = await fetch(`/api/email-sequences/${emailId}/regenerate`, { method: "POST" });
      if (res.ok) await fetchCampaignData();
    } catch (e) { console.error(e); }
  };

  const handleSave = async (emailId: string, subject: string, body: string, delayAmount: number, delayUnit: string) => {
    try {
      const res = await fetch(`/api/email-sequences/${emailId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body, delayAmount, delayUnit })
      });
      if (res.ok) alert("Saved successfully!");
    } catch (e) { console.error(e); }
  };

  const handleApprove = async (emailId: string) => {
    try {
      const res = await fetch(`/api/email-sequences/${emailId}/approve`, { method: "POST" });
      if (res.ok) await fetchCampaignData();
    } catch (e) { console.error(e); }
  };

  const handleApproveAllForLead = async (leadId: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/approve-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId })
      });
      if (res.ok) await fetchCampaignData();
    } catch (e) { console.error(e); }
  };

  const filteredLeads = campaignLeads.filter(cl => {
    const lead = cl.lead;
    if (leadFilter === "Valid Email") {
      if (!lead.email || !lead.email.includes('@')) return false;
    } else if (leadFilter === "Invalid Email") {
      if (lead.email && lead.email.includes('@')) return false;
    } else if (leadFilter === "Unsubscribed") {
      if (lead.status !== "Unsubscribed") return false;
    }
    
    if (leadSearch) {
      const term = leadSearch.toLowerCase();
      return (lead.businessName?.toLowerCase().includes(term) || lead.email?.toLowerCase().includes(term) || lead.name?.toLowerCase().includes(term));
    }
    return true;
  });

  const toggleSelectAllLeads = (onlyValid = false) => {
    let toSelect = filteredLeads;
    if (onlyValid) {
       toSelect = filteredLeads.filter(cl => cl.lead.email && cl.lead.email.includes('@') && cl.lead.status !== 'Unsubscribed');
    }
    
    if (selectedLeadIds.length === toSelect.length && toSelect.length > 0) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(toSelect.map(cl => cl.leadId));
    }
  };

  const toggleSelectLead = (id: string) => {
    setSelectedLeadIds(prev => prev.includes(id) ? prev.filter(lId => lId !== id) : [...prev, id]);
  };
  
  const handleRemoveSelectedLeads = async () => {
    if (selectedLeadIds.length === 0) return;
    if (!confirm(`Are you sure you want to remove ${selectedLeadIds.length} leads from this campaign?`)) return;
    
    try {
      // Assuming endpoint exists for removal
      await fetch(`/api/campaigns/${campaignId}/leads`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: selectedLeadIds })
      });
      setSelectedLeadIds([]);
      fetchCampaignData();
    } catch(e) { console.error(e); }
  };

  const tabs = ["Overview", "Leads", "Sequence", "Knowledge Base", "Reviews", "Replies Inbox", "Timing", "Analytics", "Settings"];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Campaign Details</h2>
          <p className="text-slate-400">Review leads, manage AI 25-Step sequences, and track performance.</p>
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
               <h3 className="text-xl font-bold text-white flex items-center gap-2">Campaign Overview</h3>
               <div className="flex space-x-3">
                 <button 
                   onClick={async () => {
                     // Check Readiness
                     if (campaignLeads.length === 0) return alert("Add leads to this campaign before starting.");
                     const unapproved = campaignLeads.some(cl => {
                       const emails = cl.lead.emailSequences || [];
                       if (emails.length === 0) return true;
                       return emails.some((e: any) => e.sequenceStep === 1 && e.approvalStatus !== 'Approved');
                     });
                     if (unapproved) {
                       const noEmails = campaignLeads.some(cl => !cl.lead.emailSequences || cl.lead.emailSequences.length === 0);
                       if (noEmails) return alert("Generate emails for your campaign leads first.");
                       return alert("Approve Email 1 before starting this campaign.");
                     }
                     // Start campaign
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

             <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
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
               <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                 <p className="text-slate-400 text-sm mb-1">Replies</p>
                 <p className="text-2xl font-bold text-orange-400">
                   {campaignLeads.reduce((acc, cl) => acc + (cl.lead.replies?.length || 0), 0)}
                 </p>
               </div>
               <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                 <p className="text-slate-400 text-sm mb-1">Booked Calls</p>
                 <p className="text-2xl font-bold text-pink-400">
                   {campaignLeads.filter(cl => cl.lead.status === 'Booked').length}
                 </p>
               </div>
             </div>
           </div>
         </div>
      ) : activeTab === "Leads" ? (
         <div className="space-y-6">
           <div className="flex justify-between items-center bg-slate-900/50 p-6 rounded-2xl border border-slate-700/50">
             <div>
               <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                 <Users className="text-purple-400" size={20} /> Person Leads Database
               </h3>
               <p className="text-sm text-slate-400">Leads assigned to this campaign for AI email outreach.</p>
             </div>
             <div className="flex space-x-3 items-center">
               <button 
                 onClick={() => window.location.href = '/dashboard/person-leads'} 
                 className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors shadow-lg shadow-purple-500/25 text-sm font-bold"
               >
                 Go to Person Leads Database
               </button>
             </div>
           </div>

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
               <table className="w-full text-left border-collapse min-w-[1200px]">
                 <thead>
                   <tr className="bg-slate-900/80 border-b border-slate-800 text-slate-400 text-xs uppercase">
                     <th className="p-4 font-medium">Name & Role</th>
                     <th className="p-4 font-medium">Company / Business</th>
                     <th className="p-4 font-medium">Contact Data</th>
                     <th className="p-4 font-medium">Location & Industry</th>
                     <th className="p-4 font-medium">AI Fit Score</th>
                     <th className="p-4 font-medium">Email Status</th>
                     <th className="p-4 font-medium">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="text-sm divide-y divide-slate-800/50">
                   {campaignLeads.map((cl) => {
                     const lead = cl.lead;
                     return (
                       <tr key={lead.id} className="hover:bg-slate-800/50 transition-colors">
                         <td className="p-4">
                           <p className="font-bold text-white">{lead.fullName || lead.firstName || 'Unknown Name'}</p>
                           <p className="text-xs text-slate-400 mt-1">{lead.jobTitle || 'Role Unspecified'}</p>
                         </td>
                         <td className="p-4">
                           <p className="font-medium text-white">{lead.companyName || lead.businessName || 'No company detected'}</p>
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
                         <td className="p-4">
                           <span className="text-xs px-2 py-1 bg-slate-800 text-slate-300 rounded border border-slate-700">{cl.status || 'Pending'}</span>
                         </td>
                         <td className="p-4">
                           <button className="text-xs text-red-400 hover:text-red-300 transition-colors">Remove</button>
                         </td>
                       </tr>
                     );
                   })}
                 </tbody>
               </table>
             </div>
           )}
         </div>
      ) : activeTab === "Sequence" ? (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-slate-900/50 p-6 rounded-2xl border border-slate-700/50">
            <div>
              <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                <Mail className="text-purple-400" size={20} /> 25-Step AI Sequences
              </h3>
              <p className="text-sm text-slate-400">AI generates a full 25-Step sequence spanning 28 days.</p>
              <p className="text-xs text-purple-400 mt-2 font-medium bg-purple-500/10 inline-block px-2 py-1 rounded">
                Drafts Estimate: {campaignLeads.length} leads × 25 emails = {campaignLeads.length * 25} total drafts
              </p>
            </div>
            <div className="flex space-x-3 items-center">
              <button 
                onClick={() => alert("Coming soon")} 
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors border border-slate-700 text-sm"
              >
                View Default Sequence
              </button>
              <button 
                onClick={handleGenerateSequences} 
                disabled={generating}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors shadow-lg shadow-purple-500/25 flex items-center space-x-2 disabled:opacity-50"
              >
                {generating ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                <span>{generating ? "Generating Sequences..." : "Generate Missing 25-Step Sequences"}</span>
              </button>
            </div>
          </div>

          {generating && (
            <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl text-purple-300 text-sm font-medium animate-pulse text-center">
              {genProgress}
            </div>
          )}

          {campaignLeads.length === 0 ? (
            <div className="glass p-12 rounded-2xl border border-slate-700/50 text-center">
              <p className="text-slate-400 mb-4">No leads in this campaign yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {campaignLeads.map((cl, i) => {
                const lead = cl.lead;
                const emails = lead.emailSequences || [];
                const isExpanded = expandedLead === lead.id;
                const hasEmails = emails.length > 0;
                const personalization = buildLeadPersonalization(lead);

                return (
                  <div key={lead.id} className="glass rounded-xl border border-slate-700/50 overflow-hidden">
                    <div 
                      className="p-5 flex justify-between items-center cursor-pointer hover:bg-slate-800/30 transition-colors"
                      onClick={() => setExpandedLead(isExpanded ? null : lead.id)}
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 font-bold">
                          {i + 1}
                        </div>
                        <div>
                          <h4 className="text-lg font-bold text-white">
                            {personalization.safeCompanyMention !== "your team" ? personalization.safeCompanyMention : "No company detected"}
                          </h4>
                          <div className="text-sm text-purple-400">
                            {personalization.firstName ? `First name: ${personalization.firstName}` : "No first name detected"}
                          </div>
                          <div className="flex space-x-3 text-xs text-slate-400 mt-1">
                            <span>{lead.location || 'Unknown Location'}</span>
                            <span>•</span>
                            <span className="text-blue-400">Score: {lead.leadScore}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        {!hasEmails ? (
                          <span className="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-400">0 / 5 Steps</span>
                        ) : (
                          <span className="text-xs px-2.5 py-1 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                            {emails.filter((e: any) => e.approvalStatus === 'Approved').length} / {emails.length} Approved
                          </span>
                        )}
                        <button className="text-sm text-slate-400 hover:text-white px-3 py-1 rounded border border-slate-700">
                          {isExpanded ? 'Collapse' : 'Review Sequence'}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-6 border-t border-slate-800 bg-slate-900/30">
                        {!hasEmails ? (
                          <div className="text-center py-10">
                            <h3 className="text-lg text-white mb-2">No 25-Step sequence generated yet.</h3>
                            <p className="text-slate-400 text-sm">Click the "Generate Missing 25-Step Sequences" button.</p>
                          </div>
                        ) : (
                          <div className="space-y-8">
                            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                              <h4 className="text-white font-bold">Email Steps ({emails.length})</h4>
                              <button onClick={() => handleApproveAllForLead(lead.id)} className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded transition-colors flex items-center space-x-1">
                                <Check size={14} /> <span>Approve All for Lead</span>
                              </button>
                            </div>
                            
                            {emails.sort((a: any, b: any) => a.sequenceStep - b.sequenceStep).map((email: any, idx: number) => (
                              <EmailEditorBlock 
                                key={email.id} 
                                email={email} 
                                onSave={handleSave} 
                                onApprove={handleApprove} 
                                onRegenerate={handleRegenerate}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : activeTab === "Timing" ? (
         <div className="space-y-6">
            <div className="glass p-8 rounded-2xl border border-slate-700/50">
               <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Clock className="text-purple-400" /> AI Best Time Email Sending Settings</h3>
               <p className="text-slate-400 text-sm mb-6">
                 Configure how AI schedules emails for this campaign.
               </p>

               <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
                 <h4 className="text-white font-bold mb-4">Timing Settings</h4>
                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                     <label className="flex items-center text-slate-300 text-sm gap-2">
                       <input type="checkbox" checked={campaignData?.useAiBestTime ?? true} readOnly className="rounded border-slate-600 bg-slate-800 text-purple-600 focus:ring-purple-500" />
                       Use AI Best Send Time
                     </label>
                   </div>
                   <div className="space-y-2">
                     <label className="flex items-center text-slate-300 text-sm gap-2">
                       <input type="checkbox" checked={!(campaignData?.weekendsEnabled ?? false)} readOnly className="rounded border-slate-600 bg-slate-800 text-purple-600 focus:ring-purple-500" />
                       Avoid Weekends
                     </label>
                   </div>
                   <div className="space-y-2">
                     <label className="text-slate-400 text-sm block">Morning Window</label>
                     <input type="text" value={`${campaignData?.morningWindowStart ?? '09:30'} AM - ${campaignData?.morningWindowEnd ?? '11:30'} AM`} readOnly className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white text-sm w-full" />
                   </div>
                   <div className="space-y-2">
                     <label className="text-slate-400 text-sm block">Afternoon Window</label>
                     <input type="text" value={`${campaignData?.afternoonWindowStart ?? '02:00'} PM - ${campaignData?.afternoonWindowEnd ?? '04:00'} PM`} readOnly className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white text-sm w-full" />
                   </div>
                   <div className="space-y-2">
                     <label className="text-slate-400 text-sm block">Timezone Mode</label>
                     <select disabled className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white text-sm w-full">
                       <option>Lead location</option>
                       <option>Campaign location</option>
                       <option>Fixed timezone</option>
                     </select>
                   </div>
                   <div className="space-y-2">
                     <label className="text-slate-400 text-sm block">Daily Sending Limit</label>
                     <input type="number" value={campaignData?.dailyLimit || 100} readOnly className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white text-sm w-full" />
                   </div>
                 </div>
               </div>

               <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                 <h4 className="text-white font-bold mb-4">Upcoming Scheduled Deliveries</h4>
                 <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-4 text-sm text-amber-400">
                   <strong>Demo Mode:</strong> Connect SendGrid to send live emails. For this demo, you can review the sending queue below.
                 </div>
                 <div className="overflow-x-auto">
                   <table className="w-full text-left text-sm text-slate-300">
                     <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                       <tr>
                         <th className="px-4 py-3 font-medium">Step</th>
                         <th className="px-4 py-3 font-medium">Subject</th>
                         <th className="px-4 py-3 font-medium">Lead</th>
                         <th className="px-4 py-3 font-medium">Scheduled Time</th>
                         <th className="px-4 py-3 font-medium">Status</th>
                         <th className="px-4 py-3 font-medium">Best Send Reason</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-800">
                       <tr className="hover:bg-slate-800/30">
                         <td className="px-4 py-3">1</td>
                         <td className="px-4 py-3">Automate your follow-ups</td>
                         <td className="px-4 py-3">Tech Innovators Inc</td>
                         <td className="px-4 py-3 text-blue-400">Tomorrow 09:30 AM</td>
                         <td className="px-4 py-3"><span className="px-2 py-1 bg-yellow-500/10 text-yellow-500 rounded text-xs">Queued</span></td>
                         <td className="px-4 py-3 text-xs text-slate-400">High open rate historically</td>
                       </tr>
                       <tr className="hover:bg-slate-800/30">
                         <td className="px-4 py-3">1</td>
                         <td className="px-4 py-3">Quick question about your sales</td>
                         <td className="px-4 py-3">Global Systems LLC</td>
                         <td className="px-4 py-3 text-blue-400">Tomorrow 10:15 AM</td>
                         <td className="px-4 py-3"><span className="px-2 py-1 bg-yellow-500/10 text-yellow-500 rounded text-xs">Queued</span></td>
                         <td className="px-4 py-3 text-xs text-slate-400">Avoids local lunch hour</td>
                       </tr>
                     </tbody>
                   </table>
                 </div>
               </div>
            </div>
         </div>
      ) : activeTab === "Knowledge Base" ? (
         <div className="space-y-6">
            <div className="glass p-8 rounded-2xl border border-slate-700/50">
               <div className="flex justify-between items-center mb-6">
                 <div>
                   <h3 className="text-xl font-bold text-white flex items-center gap-2"><BookOpen className="text-purple-400" /> Knowledge Base</h3>
                   <p className="text-slate-400 text-sm">Upload documents about your offer, service, case studies, FAQs, or target audience. AI will use this information to write more accurate emails.</p>
                 </div>
                 <label className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors cursor-pointer inline-block whitespace-nowrap">
                   {uploadingKb ? "Uploading..." : "Upload Knowledge File"}
                   <input type="file" className="hidden" accept=".pdf,.docx,.txt,.csv,.md,.json" onChange={handleUploadKb} disabled={uploadingKb} />
                 </label>
               </div>
               
               {kbFiles.length === 0 ? (
                 <div className="text-center py-12 bg-slate-900/50 rounded-xl border border-slate-700 border-dashed">
                   <h4 className="text-lg text-white mb-2">No knowledge files yet</h4>
                   <p className="text-slate-400 text-sm mb-4">Upload offer documents, service details, FAQs, or case studies so AI can write more accurate emails.</p>
                 </div>
               ) : (
                 <div className="space-y-4">
                   {kbFiles.map(file => (
                     <div key={file.id} className="p-4 bg-slate-900 border border-slate-700 rounded-lg flex items-start justify-between">
                       <div className="flex items-start gap-4">
                         <input type="checkbox" checked={selectedKbFileIds.includes(file.id)} onChange={() => {
                           if (selectedKbFileIds.includes(file.id)) {
                             setSelectedKbFileIds(selectedKbFileIds.filter(id => id !== file.id));
                           } else {
                             setSelectedKbFileIds([...selectedKbFileIds, file.id]);
                           }
                         }} className="mt-1" />
                         <div>
                           <h4 className="text-white font-medium">{file.fileName}</h4>
                           <p className="text-slate-400 text-xs mt-1">{file.summary}</p>
                           <span className="inline-block mt-2 px-2 py-0.5 bg-slate-800 text-slate-300 text-xs rounded">{file.status}</span>
                         </div>
                       </div>
                       <button className="text-red-400 text-sm hover:text-red-300" onClick={async () => {
                         await fetch(`/api/knowledge-base/${file.id}`, { method: 'DELETE' });
                         fetchCampaignData();
                       }}>Delete</button>
                     </div>
                   ))}
                   <p className="text-sm text-slate-400">{selectedKbFileIds.length} files selected for this campaign</p>
                 </div>
               )}
            </div>
         </div>
      ) : activeTab === "Replies Inbox" ? (
         <div className="space-y-6">
            <div className="flex justify-between items-center bg-slate-900/50 p-6 rounded-2xl border border-slate-700/50">
               <div>
                  <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2"><MessageSquare className="text-purple-400" /> Replies Inbox</h3>
                  <p className="text-slate-400 text-sm">View all AI and Human replies for this campaign.</p>
               </div>
               <Link href={`/dashboard/replies`} className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors text-sm font-bold shadow-lg shadow-purple-500/25">
                 Open Full Replies Dashboard
               </Link>
            </div>
            
            {campaignReplies.length === 0 ? (
               <div className="text-center py-12 bg-slate-900/50 rounded-xl border border-slate-700">
                 <p className="text-slate-400">No replies received yet for this campaign.</p>
               </div>
            ) : (
               <div className="space-y-4">
                 {campaignReplies.map((reply: any) => (
                   <div key={reply.id} className="glass p-6 rounded-xl border border-slate-700/50">
                     <div className="flex justify-between items-start mb-4">
                       <div>
                         <h4 className="text-lg font-bold text-white flex items-center gap-2">
                           {reply.lead?.businessName || reply.lead?.email || 'Unknown Lead'}
                           <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded border border-purple-500/30">{reply.aiCategory || 'Unknown'}</span>
                         </h4>
                         <p className="text-xs text-slate-400 mt-1">{new Date(reply.createdAt).toLocaleString()}</p>
                       </div>
                     </div>
                     <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 mb-4">
                       <p className="text-sm text-slate-300 whitespace-pre-wrap">{reply.emailBody}</p>
                     </div>
                     {reply.aiSuggestedReply && (
                       <div className="bg-purple-900/10 border border-purple-500/20 rounded-lg p-4">
                         <p className="text-xs text-purple-400 font-semibold mb-2 flex items-center gap-1"><MessageSquare size={14} /> AI Suggested Response / Sent Reply</p>
                         <p className="text-sm text-purple-200/80 whitespace-pre-wrap">{reply.aiSuggestedReply}</p>
                       </div>
                     )}
                   </div>
                 ))}
               </div>
            )}
         </div>
      ) : activeTab === "Settings" ? (
         <div className="space-y-6">
            <div className="glass p-8 rounded-2xl border border-slate-700/50">
               <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Settings className="text-slate-400" /> Follow-Up & Call Booking Settings</h3>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="space-y-4">
                   <h4 className="text-white font-semibold">Timing Strategy</h4>
                   <label className="block text-sm text-slate-400">Timing Mode</label>
                   <select className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white">
                     <option>AI Recommended Timing</option>
                     <option>Custom Timing</option>
                     <option>Fixed Template</option>
                   </select>

                   <label className="block text-sm text-slate-400">B2B Sending Window</label>
                   <div className="flex gap-2">
                     <input type="time" defaultValue="09:00" className="w-1/2 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" />
                     <input type="time" defaultValue="16:00" className="w-1/2 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" />
                   </div>
                 </div>

                 <div className="space-y-4">
                   <h4 className="text-white font-semibold mt-6">Email Scheduling & Sending Limits</h4>
                   <label className="block text-sm text-slate-400 mt-2">Daily Sending Limit</label>
                   <input type="number" defaultValue={10} min={1} max={10} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" />
                   
                   <label className="block text-sm text-slate-400 mt-2">Delay Between Emails</label>
                   <select className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white">
                     <option value="1">1 minute</option>
                     <option value="2">2 minutes recommended</option>
                     <option value="5">5 minutes</option>
                     <option value="10">10 minutes</option>
                     <option value="15">15 minutes</option>
                   </select>
                 </div>

                 <div className="space-y-4">
                   <h4 className="text-white font-semibold">AI Reply & Automation</h4>
                   <label className="block text-sm text-slate-400">AI Reply Mode</label>
                   <select 
                     value={campaignData?.autoReplyMode || 'draft_first'}
                     onChange={async (e) => {
                       const mode = e.target.value;
                       try {
                         const res = await fetch(`/api/campaigns/${campaignId}`, {
                           method: 'PATCH',
                           headers: { 'Content-Type': 'application/json' },
                           body: JSON.stringify({ autoReplyMode: mode, autoReplyEnabled: mode !== 'manual_only' })
                         });
                         if (res.ok) fetchCampaignData();
                       } catch(err) { console.error(err); }
                     }}
                     className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
                   >
                     <option value="draft_first">Draft First (Recommended)</option>
                     <option value="auto_send_safe">Auto-send Safe Replies</option>
                     <option value="manual_only">Manual Only</option>
                   </select>
                   <p className="text-xs text-slate-500">In Draft First mode, AI creates a suggested reply for you to review and send.</p>

                   <label className="block text-sm text-slate-400 mt-4">Booking Goal</label>
                   <div className="flex items-center space-x-2">
                     <input type="checkbox" defaultChecked className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-purple-500" />
                     <span className="text-sm text-white">AI should try to book calls using your booking link</span>
                   </div>
                 </div>
               </div>
            </div>
         </div>
      ) : activeTab === "Leads" ? (
        <div className="space-y-6 animate-in fade-in">
          <div className="flex flex-col md:flex-row justify-between gap-4">
            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 w-full md:w-80">
              <input type="text" value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)} placeholder="Search leads by name, email..." className="bg-transparent border-none outline-none w-full text-sm text-white placeholder-slate-500" />
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-slate-400">Filters:</span>
              {["All", "Valid Email", "Invalid Email", "Unsubscribed"].map(filter => (
                <button key={filter} onClick={() => setLeadFilter(filter)} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${leadFilter === filter ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}>
                  {filter}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded-lg border border-slate-700">
             <div className="flex items-center gap-3">
               <input type="checkbox" checked={selectedLeadIds.length === filteredLeads.length && filteredLeads.length > 0} onChange={() => toggleSelectAllLeads()} className="w-4 h-4 rounded border-slate-600 bg-slate-900 focus:ring-purple-500 cursor-pointer" />
               <span className="text-sm text-slate-300">{selectedLeadIds.length} leads selected</span>
             </div>
             <div className="flex gap-2">
               <button onClick={() => toggleSelectAllLeads(true)} className="px-3 py-1.5 bg-blue-500/10 text-blue-400 text-xs font-medium rounded hover:bg-blue-500/20 border border-blue-500/20">Select All Valid Leads</button>
               <button onClick={() => setSelectedLeadIds([])} disabled={selectedLeadIds.length === 0} className="px-3 py-1.5 bg-slate-700 text-slate-300 text-xs font-medium rounded hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed">Clear Selection</button>
               <button onClick={handleRemoveSelectedLeads} disabled={selectedLeadIds.length === 0} className="px-3 py-1.5 bg-red-500/10 text-red-400 text-xs font-medium rounded hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed border border-red-500/20">Exclude Selected</button>
               <button onClick={() => window.location.href = '/dashboard/generate-leads'} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium rounded transition-colors shadow-lg shadow-purple-500/20">Generate More Leads</button>
             </div>
          </div>

          <div className="glass rounded-2xl border border-slate-700/50 overflow-hidden">
             {filteredLeads.length === 0 ? (
               <div className="p-12 text-center flex flex-col items-center justify-center">
                 <Users size={48} className="text-slate-600 mb-4" />
                 <h3 className="text-lg font-bold text-white mb-2">No leads found</h3>
                 <p className="text-slate-400 mb-6">There are no leads matching your filters in this campaign.</p>
                 <button onClick={() => window.location.href = '/dashboard/generate-leads'} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors">Generate Leads First</button>
               </div>
             ) : (
               <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm text-slate-300">
                   <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-800">
                     <tr>
                       <th className="px-4 py-4 w-12 text-center">
                         <input type="checkbox" checked={selectedLeadIds.length === filteredLeads.length && filteredLeads.length > 0} onChange={() => toggleSelectAllLeads()} className="w-4 h-4 rounded border-slate-600 bg-slate-900 focus:ring-purple-500 cursor-pointer" />
                       </th>
                       <th className="px-6 py-4 font-medium">Name / Business</th>
                       <th className="px-6 py-4 font-medium">Email</th>
                       <th className="px-6 py-4 font-medium">Status</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-800">
                     {filteredLeads.map(cl => (
                       <tr key={cl.lead.id} className="hover:bg-slate-800/30 transition-colors">
                         <td className="px-4 py-4 text-center">
                           <input type="checkbox" checked={selectedLeadIds.includes(cl.lead.id)} onChange={() => toggleSelectLead(cl.lead.id)} className="w-4 h-4 rounded border-slate-600 bg-slate-900 focus:ring-purple-500 cursor-pointer" />
                         </td>
                         <td className="px-6 py-4 font-medium text-white">{cl.lead.businessName || cl.lead.name}</td>
                         <td className="px-6 py-4 text-slate-400">{cl.lead.email || <span className="text-red-400 italic">No email</span>}</td>
                         <td className="px-6 py-4">
                           <span className={`px-2 py-1 rounded text-xs ${cl.lead.status === 'Unsubscribed' ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-300'}`}>
                             {cl.lead.status || 'Added'}
                           </span>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             )}
          </div>
        </div>
      ) : (
        <div className="glass p-12 rounded-2xl border border-slate-700/50 text-center min-h-[50vh] flex items-center justify-center">
          <p className="text-slate-400 text-lg">{activeTab} tab is under construction.</p>
        </div>
      )}
    </div>
  );
}

function EmailEditorBlock({ email, onSave, onApprove, onRegenerate }: { email: any, onSave: any, onApprove: any, onRegenerate: any }) {
  const [subject, setSubject] = useState(email.subject || '');
  const [body, setBody] = useState(email.body || '');
  const [delayAmount, setDelayAmount] = useState(email.delayAmount || 0);
  const [delayUnit, setDelayUnit] = useState(email.delayUnit || 'business_days');
  
  const [emailType, setEmailType] = useState(email.emailType || 'Standard');
  const [purpose, setPurpose] = useState(email.purpose || 'Follow-up');
  const [extraInstruction, setExtraInstruction] = useState(email.extraInstruction || '');
  const [enabled, setEnabled] = useState(email.enabled !== false);

  const isApproved = email.approvalStatus === "Approved";
  
  const kbSources = email.knowledgeBaseSources ? JSON.parse(email.knowledgeBaseSources) : [];

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
      <div className="bg-slate-800/80 px-4 py-3 flex justify-between items-center border-b border-slate-700">
        <div className="flex items-center space-x-3">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="w-4 h-4 rounded border-slate-600 bg-slate-900 focus:ring-purple-500 cursor-pointer" title="Enable/Disable Step" />
          <span className="w-6 h-6 rounded bg-purple-600 text-white flex items-center justify-center text-xs font-bold">{email.sequenceStep}</span>
          <span className="text-white font-medium">{email.name || `Step ${email.sequenceStep}`}</span>
          
          <div className="flex items-center space-x-1 ml-4 bg-slate-900 p-1 rounded border border-slate-700">
            <Clock size={12} className="text-slate-400 ml-1" />
            <input 
              type="number" 
              value={delayAmount} 
              onChange={e => setDelayAmount(parseInt(e.target.value))} 
              className="w-12 bg-transparent text-white text-xs border-none outline-none text-right"
              disabled={isApproved}
            />
            <select 
              value={delayUnit} 
              onChange={e => setDelayUnit(e.target.value)} 
              className="bg-transparent text-white text-xs border-none outline-none mr-1"
              disabled={isApproved}
            >
              <option value="hours">Hours</option>
              <option value="business_days">Business Days</option>
              <option value="calendar_days">Calendar Days</option>
              <option value="weeks">Weeks</option>
            </select>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {isApproved ? (
             <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded border border-green-500/30 flex items-center space-x-1">
               <Check size={12} /> <span>Approved</span>
             </span>
          ) : (
             <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded border border-yellow-500/30">
               Pending Approval
             </span>
          )}
        </div>
      </div>
      
      <div className="p-5 space-y-4">
        {(email.bestSendReason || email.timingReason) && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded p-3 text-xs text-blue-300 flex items-start gap-2">
            <Calendar size={14} className="mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold block mb-1 text-sm text-blue-200">Next follow-up: {new Date(email.scheduledAt || email.recommendedSendAt).toLocaleString()} {email.scheduledTimezone || ''}</span>
              <p className="mb-0.5"><span className="font-semibold text-blue-300">Scheduled Send Time:</span> {new Date(email.scheduledAt || email.recommendedSendAt).toLocaleString()}</p>
              <p className="mb-0.5"><span className="font-semibold text-blue-300">Lead Timezone:</span> {email.scheduledTimezone || 'Unknown'}</p>
              <p className="mb-0.5"><span className="font-semibold text-blue-300">Best Time Reason:</span> {email.bestSendReason || email.timingReason}</p>
              <p><span className="font-semibold text-blue-300">Sequence:</span> Day {email.delayAmount} of 28 (Step {email.sequenceStep} of 25)</p>
            </div>
          </div>
        )}
        
        {email.spamRisk && (
          <div className={`text-xs px-2 py-1 rounded inline-block ${email.spamRisk === 'High' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
            Spam Risk: {email.spamRisk}
          </div>
        )}
        {email.personalizationScore && (
          <div className="text-xs px-2 py-1 bg-purple-500/20 text-purple-400 rounded inline-block ml-2">
            Personalization Score: {email.personalizationScore}/100
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mt-2 mb-2">
           <div className="space-y-1">
             <label className="text-xs font-medium text-slate-400">Email Type</label>
             <input type="text" value={emailType} onChange={e => setEmailType(e.target.value)} disabled={isApproved} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-white text-xs focus:border-purple-500 outline-none disabled:opacity-50" />
           </div>
           <div className="space-y-1">
             <label className="text-xs font-medium text-slate-400">Purpose</label>
             <input type="text" value={purpose} onChange={e => setPurpose(e.target.value)} disabled={isApproved} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-white text-xs focus:border-purple-500 outline-none disabled:opacity-50" />
           </div>
           <div className="space-y-1 col-span-2">
             <label className="text-xs font-medium text-slate-400">Extra AI Instruction (for regeneration)</label>
             <input type="text" value={extraInstruction} onChange={e => setExtraInstruction(e.target.value)} disabled={isApproved} placeholder="e.g. Make it funnier, mention their recent post" className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-white text-xs focus:border-purple-500 outline-none disabled:opacity-50" />
           </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-400">Subject</label>
          <input 
            type="text" 
            value={subject} 
            onChange={e => setSubject(e.target.value)}
            disabled={isApproved}
            className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white text-sm focus:border-purple-500 outline-none disabled:opacity-50"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-400">Body</label>
          <textarea 
            value={body} 
            onChange={e => setBody(e.target.value)}
            disabled={isApproved}
            rows={7}
            className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white text-sm focus:border-purple-500 outline-none disabled:opacity-50"
          />
        </div>
        
        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-2">
            {!isApproved && (
               <>
                 <button onClick={() => onRegenerate(email.id)} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded transition-colors flex items-center space-x-1 border border-slate-700">
                   <RefreshCw size={12} /> <span>Regenerate</span>
                 </button>
                 <button className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded transition-colors flex items-center space-x-1 border border-slate-700">
                   <Edit3 size={12} /> <span>Make Shorter</span>
                 </button>
               </>
            )}
          </div>
          
          <div className="flex space-x-2">
            {!isApproved && (
              <>
                <button onClick={() => onSave(email.id, subject, body, delayAmount, delayUnit)} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded transition-colors flex items-center space-x-1 border border-slate-700">
                  <Save size={14} /> <span>Save Draft</span>
                </button>
                <button onClick={() => onApprove(email.id)} className="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded transition-colors shadow-lg shadow-green-500/20 flex items-center gap-1">
                  <Check size={14} /> Approve
                </button>
              </>
            )}
            <button disabled={!isApproved} className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded transition-colors flex items-center space-x-1">
              <Send size={14} /> <span>Send Now</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
