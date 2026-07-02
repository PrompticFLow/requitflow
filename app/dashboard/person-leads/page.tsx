"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Users, MapPin, Briefcase, Info, 
  ArrowRight, Search, CheckSquare, Square, 
  RefreshCw, CheckCircle2, XCircle, AlertCircle, Phone, Mail, Linkedin, Globe, Link as LinkIcon
} from 'lucide-react';
import { AiAgentWorking } from '@/components/ui/ai-agent-working';

function getCleanErrorMessage(err: any): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("prisma") || msg.includes("Can't reach database server")) {
    return "Database connection failed. Please check Supabase DATABASE_URL and DIRECT_URL.";
  }
  return msg;
}

export default function PersonLeadsPage() {
  const router = useRouter();

  // Search State
  const [targetAudience, setTargetAudience] = useState('');
  const [location, setLocation] = useState('');
  const [leadCount, setLeadCount] = useState('20');
  const [keywords, setKeywords] = useState('');
  const [autoEnrich, setAutoEnrich] = useState(true);


  // Execution State
  const [isSearching, setIsSearching] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [technicalError, setTechnicalError] = useState<any>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [progressDetails, setProgressDetails] = useState('');

  // Data State
  const [leads, setLeads] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [actionProgress, setActionProgress] = useState<string | null>(null);
  const [showInvalid, setShowInvalid] = useState(false);
  

  useEffect(() => {
    
    fetchLeads();
    fetchCampaigns();
  }, []);

  

  const fetchLeads = async () => {
    try {
      const res = await fetch('/api/leads');
      if (res.ok) {
        const data = await res.json();
        // Show person verification and linkedin leads, filter out fake/demo data
        const filtered = (data.leads || []).filter((l: any) => {
          const isPerson = l.source === 'Apify Person Verification' || l.source === 'LinkedIn';
          const isFake = (l.email && l.email.includes('example.com')) ||
                         (l.fullName && (l.fullName.includes('John Smith') || l.fullName.includes('Jane Doe'))) ||
                         (l.companyName && (l.companyName.includes('Demo') || l.companyName.includes('Example') || l.companyName.includes('Test'))) ||
                         (l.source && (l.source.includes('Demo') || l.source.includes('Mock') || l.source.includes('Sample')));
          return isPerson && !isFake;
        });
        setLeads(filtered);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/campaigns');
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSearch = async () => {
    if (!targetAudience) {
      setError('Please enter a target audience.');
      return;
    }
    if (!location) {
      setError('Please enter a location.');
      return;
    }
    if (!leadCount) {
      setError('Please select lead count.');
      return;
    }
    
    setIsSearching(true);
    setError(null);
    setTechnicalError(null);
    setStatusMessage('AI Agent is searching live person leads...');
    setProgressDetails(`Launching bulk search...`);
    
    try {
      console.log("Person Leads form payload", {
        targetAudience,
        location,
        leadCount: Number(leadCount),
        keywords,
      });

      const startUrl = "/api/apify/person-leads/start";
      console.log("PERSON LEADS FETCH URL:", startUrl);

      const startRes = await fetch(startUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          targetAudience,
          location,
          leadCount: Number(leadCount),
          keywords,
        }),
      });
      
      const contentType = startRes.headers.get("content-type") || "";
      const rawText = await startRes.text();
      let startData: any = null;

      if (contentType.includes("application/json")) {
        startData = JSON.parse(rawText);
      }

      if (!startRes.ok || !startData?.success) {
        if (startData) setTechnicalError(startData);
        throw new Error(
          startData?.technicalError ||
          startData?.error ||
          `Request failed: ${startRes.status} ${rawText.slice(0, 300)}`
        );
      }
      
      if (!startData.runId) {
        throw new Error("No runId returned from AI Agent search.");
      }
        
        console.log("PERSON SEARCH START DATA", startData);
        setRunId(startData.runId);
      pollRun(startData.runId);
      
    } catch (err: any) {
      setError(getCleanErrorMessage(err));
      setIsSearching(false);
      setStatusMessage('');
      setProgressDetails('');
    }
  };

  const pollRun = async (runId: string) => {
    const maxAttempts = 60; // 5 minutes if 5 sec interval
    let attempt = 0;

    const interval = setInterval(async () => {
      attempt++;

      try {
        setStatusMessage(`Checking results... attempt ${attempt}`);

        const checkUrl = `/api/apify/person-leads/check-run?runId=${encodeURIComponent(runId)}`;
        console.log("PERSON LEADS FETCH URL:", checkUrl);

        const res = await fetch(checkUrl, {
          method: "GET",
          credentials: "include",
        });

        const rawText = await res.text();
        const contentType = res.headers.get("content-type") || "";

        let data: any = null;
        if (contentType.includes("application/json")) {
          data = JSON.parse(rawText);
        } else {
          throw new Error(`Expected JSON but received ${contentType}: ${rawText.slice(0, 300)}`);
        }

        console.log("PERSON SEARCH CHECK DATA", data);

        if (!res.ok || !data.success) {
          throw new Error(data.technicalError || data.error || "AI Agent search failed.");
        }

        if (data.status === "RUNNING" || data.status === "READY") {
          return;
        }

        if (data.status === "SUCCEEDED") {
          // If enrichment started, switch to polling enrichment
          if (data.enrichment?.started && data.enrichment?.runId) {
            setStatusMessage("AI Agent is finding verified emails and phone numbers...");
            setProgressDetails("Enrichment started...");
            clearInterval(interval);
            pollEnrichment(data.enrichment.runId);
            return;
          }

          clearInterval(interval);
          setRunId(null);
          setIsSearching(false);
          setStatusMessage("Search complete.");

          setLeads(data.leads || []);

          if (!data.leads || data.leads.length === 0) {
             setStatusMessage(
              data.rawCount > 0
                ? "AI Agent found raw results, but they could not be converted into person leads."
                : "No live person leads found. Try changing your target audience, location, or lead count."
            );
          } else {
            if (data.warning) {
              setProgressDetails(data.warning);
            } else {
              setProgressDetails(`Raw records: ${data.rawCount || 0} | Processed: ${data.imported || 0}`);
            }
          }

          setTimeout(async () => {
            await fetchLeads();
          }, 2000);

          return;
        }

        if (data.status === "FAILED" || data.status === "ABORTED" || data.status === "TIMED-OUT") {
          clearInterval(interval);
          setIsSearching(false);
          setRunId(null);
          throw new Error(data.technicalError || `AI Agent run ended with status ${data.status}`);
        }

        if (attempt >= maxAttempts) {
          clearInterval(interval);
          setIsSearching(false);
          setRunId(null);
          setError("AI Agent search is still running. Please try checking again later.");
        }
      } catch (error) {
        clearInterval(interval);
        setIsSearching(false);
        setRunId(null);
        setError(getCleanErrorMessage(error));
        setTechnicalError({ technicalError: error instanceof Error ? error.message : String(error) });
        setStatusMessage('');
        setProgressDetails('');
      }
    }, 5000);
  };

  const pollEnrichment = async (enrichRunId: string) => {
    const maxAttempts = 60; // 5 mins
    let attempt = 0;

    const interval = setInterval(async () => {
      attempt++;
      try {
        setStatusMessage(`Finding contacts... attempt ${attempt}`);
        const res = await fetch(`/api/apify/person-leads/check-enrichment?runId=${encodeURIComponent(enrichRunId)}`);
        const data = await res.json();
        
        if (!res.ok || !data.success) {
          throw new Error(data.technicalError || data.error || "Contact enrichment failed.");
        }

        if (data.status === "RUNNING" || data.status === "READY") {
          return;
        }

        if (data.status === "SUCCEEDED") {
          clearInterval(interval);
          setRunId(null);
          setIsSearching(false);
          setStatusMessage("Search and enrichment complete.");
          setProgressDetails(`Enriched ${data.enrichedCount} leads. Emails found: ${data.emailsFound}, Phones found: ${data.phonesFound}`);
          setLeads(data.leads || []);
          setTimeout(async () => {
            await fetchLeads();
          }, 2000);
          return;
        }

        if (data.status === "FAILED" || data.status === "ABORTED" || data.status === "TIMED-OUT") {
          clearInterval(interval);
          setIsSearching(false);
          setRunId(null);
          throw new Error(data.technicalError || `Enrichment run ended with status ${data.status}`);
        }

        if (attempt >= maxAttempts) {
          clearInterval(interval);
          setIsSearching(false);
          setRunId(null);
          setError("Enrichment is still running. Please check again later.");
        }
      } catch (error) {
        clearInterval(interval);
        setIsSearching(false);
        setRunId(null);
        setError(getCleanErrorMessage(error));
        setTechnicalError({ technicalError: error instanceof Error ? error.message : String(error) });
        setStatusMessage('');
        setProgressDetails('');
      }
    }, 5000);
  };

  const handleManualEnrich = async () => {
    if (selectedIds.size === 0) return;
    
    setIsSearching(true);
    setError(null);
    setTechnicalError(null);
    setStatusMessage('AI Agent is starting contact enrichment...');
    setProgressDetails(`Launching enrichment...`);
    
    try {
      const res = await fetch('/api/apify/person-leads/enrich-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: Array.from(selectedIds) })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.technicalError || data.error || "Failed to start enrichment.");
      }
      pollEnrichment(data.runId);
    } catch (err: any) {
      setError(getCleanErrorMessage(err));
      setIsSearching(false);
      setStatusMessage('');
      setProgressDetails('');
    }
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === leads.length && leads.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(leads.map(c => c.id)));
  };

  const handleAddToCampaign = async (campaignId: string) => {
    setIsCampaignModalOpen(false);
    
    // Check for missing emails
    const selectedLeads = leads.filter(l => selectedIds.has(l.id));
    const missingEmailCount = selectedLeads.filter(l => !l.email).length;
    
    if (missingEmailCount > 0) {
      const proceed = window.confirm(
        `Warning: ${missingEmailCount} of the selected leads do not have email addresses. They can be added, but email sending will be skipped until enrichment is completed.\n\nDo you want to proceed?`
      );
      if (!proceed) return;
    }
    
    setActionProgress(`Adding ${selectedIds.size} leads to Campaign...`);
    
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/add-person-leads`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ leadIds: Array.from(selectedIds) })
      });
      const data = await res.json();
      
      if (res.ok) {
        alert(`${data.count || selectedIds.size} person leads added to campaign.`);
        setSelectedIds(new Set());
        fetchLeads();
      } else {
        alert(data.error || 'Failed to add to campaign');
      }
    } catch (e) { 
      alert('Failed to add to campaign');
    } finally {
      setActionProgress(null);
    }
  };

  // Stats calculation
  const totalFound = leads.length;
  const validEmails = leads.filter(l => l.email && l.emailStatus !== 'Invalid').length;
  const phoneNumbers = leads.filter(l => l.phone).length;
  const decisionMakers = leads.filter(l => l.aiFitScore >= 70).length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
            <Users className="text-purple-500" /> Person Leads
          </h1>
          <p className="text-slate-400">Search targeted people by audience, location, and lead count.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => router.push('/dashboard/ai-email-agent')} className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            Go to AI Email Agent <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* Search Panel */}
      <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-xl animate-in fade-in">
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <Search size={20} className="text-indigo-500" /> Person Search Form
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
             <div className="md:col-span-2">
               <label className="block text-sm font-medium text-slate-400 mb-1">Target Audience</label>
               <input type="text" placeholder="e.g. Recruitment agency owners, real estate brokers, business coaches" className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={targetAudience} onChange={e => setTargetAudience(e.target.value)} />
             </div>
             <div>
               <label className="block text-sm font-medium text-slate-400 mb-1">Location</label>
               <input type="text" placeholder="e.g. United States, New York, London, India" className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={location} onChange={e => setLocation(e.target.value)} />
             </div>
             <div>
               <label className="block text-sm font-medium text-slate-400 mb-1">Lead Count</label>
               <select className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={leadCount} onChange={e => setLeadCount(e.target.value)}>
                 <option value="10">10</option>
                 <option value="20">20</option>
                 <option value="50">50</option>
                 <option value="100">100</option>
               </select>
             </div>
             <div className="md:col-span-2">
               <label className="block text-sm font-medium text-slate-400 mb-1">Keywords</label>
               <input type="text" placeholder="e.g. Founder, CEO, Owner, Staffing, Hiring" className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={keywords} onChange={e => setKeywords(e.target.value)} />
             </div>
             <div className="md:col-span-2 flex items-center gap-2 mt-2">
               <input type="checkbox" id="autoEnrich" checked={autoEnrich} onChange={(e) => setAutoEnrich(e.target.checked)} className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500/20" />
               <label htmlFor="autoEnrich" className="text-sm font-medium text-slate-400 cursor-pointer">Find emails and phone numbers after search</label>
             </div>
          </div>

          
          <div className="pt-4 border-t border-slate-800 flex justify-end">
            <button 
              onClick={handleSearch}
              disabled={isSearching}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20"
            >
              {isSearching ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
              {isSearching ? 'AI Agent is searching...' : 'Search Person Leads'}
            </button>
          </div>
        </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle size={20} className="mt-0.5 shrink-0" />
          <div className="flex-1 overflow-hidden text-sm">
             <p className="font-semibold mb-1">AI Agent search failed.</p>
             <p className="break-words font-mono text-xs opacity-90 mb-2">{error}</p>
             {technicalError && (
               <details className="mt-3 bg-red-950/30 p-3 rounded-lg border border-red-500/20">
                 <summary className="cursor-pointer font-medium text-red-300 text-xs hover:text-red-200">Technical details</summary>
                 <div className="mt-2 text-xs font-mono text-red-300 space-y-2 overflow-x-auto whitespace-pre-wrap">
                   {technicalError.actorId && (
                     <p><strong>Actor ID:</strong> {technicalError.actorId}</p>
                   )}
                   {technicalError.technicalError && (
                     <p><strong>Error:</strong> {technicalError.technicalError}</p>
                   )}
                   {technicalError.inputSent && (
                     <div>
                       <strong>Input Sent:</strong>
                       <pre className="mt-1 p-2 bg-red-950/50 rounded">{JSON.stringify(technicalError.inputSent, null, 2)}</pre>
                     </div>
                   )}
                 </div>
               </details>
             )}
          </div>
        </div>
      )}

      {isSearching && (
        <div className="bg-slate-800/50 border border-slate-700 p-8 rounded-xl flex flex-col items-center justify-center text-center space-y-4">
          <AiAgentWorking text="AI Agent is searching live person leads…" />
          <div>
            <p className="text-slate-400 text-sm mt-2">{statusMessage}</p>
            {progressDetails && <p className="text-indigo-300 text-xs mt-2 font-mono">{progressDetails}</p>}
          </div>
        </div>
      )}

      {/* Analytics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
          <p className="text-slate-400 text-sm font-medium mb-1">Profiles Verified</p>
          <p className="text-2xl font-bold text-white">{totalFound}</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
          <p className="text-slate-400 text-sm font-medium mb-1">Valid Leads</p>
          <p className="text-2xl font-bold text-emerald-400">{leads.filter(l => l.validationStatus === 'Valid').length}</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
          <p className="text-slate-400 text-sm font-medium mb-1">Emails Found</p>
          <p className="text-2xl font-bold text-blue-400">{validEmails}</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
          <p className="text-slate-400 text-sm font-medium mb-1">Phones Found</p>
          <p className="text-2xl font-bold text-blue-400">{phoneNumbers}</p>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center space-x-4">
            <span className="text-slate-300 font-medium">{leads.length} Leads Available</span>
            {selectedIds.size > 0 && (
              <span className="text-indigo-400 text-sm bg-indigo-500/10 px-2 py-1 rounded-md">
                {selectedIds.size} selected
              </span>
            )}
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-400 ml-4">
              <input type="checkbox" checked={showInvalid} onChange={(e) => setShowInvalid(e.target.checked)} className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500/20" />
              <span>Show invalid</span>
            </label>
          </div>
          <div className="flex space-x-3">
            <button 
              onClick={handleManualEnrich}
              disabled={selectedIds.size === 0 || actionProgress !== null || isSearching}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border border-slate-700"
            >
              <Mail size={16} />
              Enrich Email & Phone
            </button>
            <button 
              onClick={() => setIsCampaignModalOpen(true)}
              disabled={selectedIds.size === 0 || actionProgress !== null}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {actionProgress ? <RefreshCw size={16} className="animate-spin" /> : <Users size={16} />}
              {actionProgress || 'Add to Campaign'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50">
                <th className="p-4 w-12 text-center">
                  <button onClick={toggleAll} className="text-slate-400 hover:text-white transition-colors">
                    {selectedIds.size === leads.length && leads.length > 0 ? <CheckSquare size={18} className="text-indigo-400" /> : <Square size={18} />}
                  </button>
                </th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name & Role</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Company</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Contact</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Social/Web</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Validation</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {leads.filter(lead => showInvalid || lead.validationStatus !== 'Invalid').map((lead) => (
                <tr 
                  key={lead.id} 
                  className={`hover:bg-slate-800/20 transition-colors ${selectedIds.has(lead.id) ? 'bg-indigo-500/5 border-l-2 border-l-indigo-500' : 'border-l-2 border-l-transparent'}`}
                >
                  <td className="p-4 text-center">
                    <button onClick={() => toggleSelection(lead.id)} className="text-slate-500 hover:text-indigo-400 transition-colors">
                      {selectedIds.has(lead.id) ? <CheckSquare size={18} className="text-indigo-400" /> : <Square size={18} />}
                    </button>
                  </td>
                  <td className="p-4">
                    <div className="font-medium text-white">{lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown'}</div>
                    <div className="text-sm text-slate-400 flex items-center gap-1 mt-1">
                      <Briefcase size={12} /> {lead.jobTitle || 'Unknown Role'}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-slate-300 font-medium">{lead.businessName || lead.companyName || 'No company found'}</div>
                    {lead.industry && <div className="text-xs text-slate-500 mt-1">{lead.industry}</div>}
                  </td>
                  <td className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Mail size={14} className={lead.email ? (lead.emailStatus === 'Valid' || lead.emailStatus === 'Verified' ? 'text-emerald-400' : lead.emailStatus === 'Needs Review' ? 'text-yellow-400' : 'text-slate-300') : 'text-slate-600'} />
                        <span className={`text-sm ${lead.email ? 'text-slate-300' : 'text-slate-500 italic'}`}>
                          {lead.email || (lead.emailStatus === 'Missing' ? 'No email found' : 'Not enriched yet')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone size={14} className={lead.phone ? 'text-blue-400' : 'text-slate-600'} />
                        <span className={`text-sm ${lead.phone ? 'text-slate-300' : 'text-slate-500 italic'}`}>
                          {lead.phone || (lead.phoneStatus === 'Missing' ? 'No phone found' : 'Not enriched yet')}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                     <div className="flex gap-2">
                        {lead.linkedinUrl ? (
                          <a href={lead.linkedinUrl} target="_blank" rel="noreferrer" className="p-1.5 bg-slate-800 text-blue-400 rounded hover:bg-slate-700" title="LinkedIn Profile">
                            <Linkedin size={14} />
                          </a>
                        ) : (
                          <div className="p-1.5 bg-slate-800/50 text-slate-600 rounded" title="No LinkedIn"><Linkedin size={14} /></div>
                        )}
                        {lead.website ? (
                          <a href={lead.website} target="_blank" rel="noreferrer" className="p-1.5 bg-slate-800 text-indigo-400 rounded hover:bg-slate-700" title="Company Website">
                            <Globe size={14} />
                          </a>
                        ) : (
                          <div className="p-1.5 bg-slate-800/50 text-slate-600 rounded" title="No Website"><Globe size={14} /></div>
                        )}
                     </div>
                  </td>
                  <td className="p-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                         {lead.validationStatus === 'Invalid' ? <XCircle size={14} className="text-red-400" /> : 
                          lead.validationStatus === 'Needs Review' ? <AlertCircle size={14} className="text-yellow-400" /> : 
                          <CheckCircle2 size={14} className="text-emerald-400" />}
                         <span className="text-xs font-medium text-slate-300">
                           {lead.validationStatus === 'Invalid' ? 'Invalid' : lead.validationStatus === 'Needs Review' ? 'Needs Review' : 'Valid'}
                         </span>
                      </div>
                      {lead.aiFitScore > 0 && (
                        <div className="text-xs font-medium text-purple-400 flex items-center gap-1">
                          Fit: {lead.aiFitScore}/100
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm text-slate-300 flex items-center gap-1">
                      <MapPin size={12} className="text-slate-500" /> {lead.location || lead.country || 'Unknown'}
                    </div>
                  </td>
                </tr>
              ))}
              {leads.length === 0 && !isSearching && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500">
                    <Users size={48} className="mx-auto mb-4 opacity-20" />
                    <h3 className="text-lg font-bold text-slate-300 mb-2">No person leads found yet</h3>
                    <p className="mb-2">Run a live search to find real person leads with the AI Agent.</p>
                    <p className="text-sm">Enter your search criteria and click Search Person Leads.</p>
                  </td>
                </tr>
              )}
              {leads.length === 0 && isSearching && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500">
                    <AiAgentWorking text="AI Agent is searching live person leads…" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Campaign Selector Modal */}
      {isCampaignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Add Leads to Campaign</h3>
              <button onClick={() => setIsCampaignModalOpen(false)} className="text-slate-400 hover:text-white">
                 <XCircle size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-400">
                Select a campaign to add these <strong className="text-white">{selectedIds.size}</strong> verified people to.
              </p>
              
              {leads.filter(l => selectedIds.has(l.id) && (!l.email || l.emailStatus === 'Missing')).length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 p-3 rounded-lg text-sm flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <p>Some selected leads do not have email addresses yet. Enrich them before starting an email campaign.</p>
                </div>
              )}
              
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {campaigns.length === 0 ? (
                  <div className="p-4 bg-slate-800/50 rounded-lg text-center text-sm text-slate-400 border border-slate-700/50">
                    No active campaigns found. Create one first!
                  </div>
                ) : (
                  campaigns.map(camp => (
                    <button 
                      key={camp.id}
                      onClick={() => handleAddToCampaign(camp.id)}
                      className="w-full text-left p-4 rounded-xl border border-slate-700 bg-slate-800/30 hover:bg-indigo-500/10 hover:border-indigo-500/50 transition-all group flex justify-between items-center"
                    >
                      <div>
                        <div className="font-bold text-slate-200 group-hover:text-indigo-300">{camp.name}</div>
                        <div className="text-xs text-slate-500 mt-1">{camp.status}</div>
                      </div>
                      <ArrowRight size={16} className="text-slate-600 group-hover:text-indigo-400 transition-colors" />
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
