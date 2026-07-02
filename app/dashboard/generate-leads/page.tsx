"use client";
import { useState } from "react";
import { Search, Loader2, Download, Plus, X } from "lucide-react";
import { AiAgentWorking } from "@/components/ui/ai-agent-working";

export default function GenerateLeadsPage() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [leads, setLeads] = useState<any[]>([]);

  const [businessType, setBusinessType] = useState("");
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("USA");
  const [maxResults, setMaxResults] = useState(50);
  const [error, setError] = useState("");

  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [adding, setAdding] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setProgress("AI Agent is searching live business leads...");
    setSelectedLeads([]);
    setLeads([]);
    
    try {
      const res = await fetch("/api/apify/start-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessType, location, country, maxResults })
      });
      const data = await res.json();
      
      if (!res.ok) {
        if (res.status === 401 || data.error === "Unauthorized") {
          window.location.href = "/login";
          return;
        }
        if (data.error && data.error.includes("Apify token missing")) {
          throw new Error("AI Agent data source is not connected. Please configure your integration settings.");
        }
        throw new Error(data.error || "Failed to start run");
      }

      setProgress(`Scraper running (Run ID: ${data.runId})... Please wait while leads are discovered.`);
      
      let isFinished = false;
      while (!isFinished) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const checkRes = await fetch("/api/apify/check-run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: data.runId, location, country })
        });
        
        const checkData = await checkRes.json();
        
        if (!checkRes.ok) {
           if (checkRes.status === 401 || checkData.error === "Unauthorized") {
             window.location.href = "/login";
             return;
           }
           throw new Error(checkData.error || "Failed to check run status");
        }

        if (checkData.status === 'SUCCEEDED') {
          isFinished = true;
          
          if (checkData.leads && checkData.leads.length > 0) {
            setLeads(checkData.leads.map((l: any) => ({
              id: l.id,
              name: l.businessName,
              phone: l.phone || 'N/A',
              email: l.email || null,
              website: l.website || null,
              address: l.address || 'N/A',
              rating: l.rating || 'N/A',
              url: l.googleMapsLink || 'N/A',
              score: l.leadScore || 0,
              tier: l.leadTier || "Cold",
              insight: l.aiInsight || "Potential client based on public business presence and available contact details.",
              status: l.status || "New"
            })));
          } else {
            setError("Scraper finished successfully, but no leads were found for this search.");
          }
          
          setProgress("Done");
          setLoading(false);
        } else if (checkData.status === 'FAILED' || checkData.status === 'ABORTED' || checkData.status === 'TIMED-OUT') {
          throw new Error(`Scraper failed with status: ${checkData.status}`);
        } else {
          setProgress(`Scraper running (Status: ${checkData.status})... This can take 1-3 minutes. Please wait.`);
        }
      }

    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedLeads(leads.map(l => l.id));
    } else {
      setSelectedLeads([]);
    }
  };

  const handleSelect = (id: string) => {
    if (selectedLeads.includes(id)) {
      setSelectedLeads(selectedLeads.filter(l => l !== id));
    } else {
      setSelectedLeads([...selectedLeads, id]);
    }
  };

  const handleExportCSV = () => {
    if (selectedLeads.length === 0) return alert("Please select at least one lead to export.");
    const dataToExport = leads.filter(l => selectedLeads.includes(l.id));
    const headers = "Business Name,Phone,Email,Website,Address,Rating,Google Maps Link,Lead Score,Lead Tier,AI Insight,Status\n";
    const rows = dataToExport.map(l => 
      `"${l.name.replace(/"/g, '""')}","${l.phone}","${l.email || ''}","${l.website || ''}","${l.address.replace(/"/g, '""')}","${l.rating}","${l.url}","${l.score}","${l.tier}","${l.insight.replace(/"/g, '""')}","${l.status}"`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'funnelzen_leads_export.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const openCampaignModal = async () => {
    if (selectedLeads.length === 0) return alert("Please select at least one lead to add to a campaign.");
    setShowModal(true);
    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch(e) {
      console.error(e);
    }
  };

  const handleAddToCampaign = async () => {
    if (!selectedCampaignId) return alert("Please select a campaign");
    setAdding(true);
    try {
      const res = await fetch("/api/campaigns/add-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: selectedCampaignId, leadIds: selectedLeads })
      });
      const data = await res.json();
      if(res.ok) {
        alert(`Successfully added ${data.addedCount} leads to the campaign! (${data.skippedCount} were already in it)`);
        setShowModal(false);
        setSelectedLeads([]);
      } else {
        alert(data.error || "Failed to add leads");
      }
    } catch(e) {
      console.error(e);
    }
    setAdding(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Find Client Leads</h2>
        <p className="text-slate-400">Find and generate potential B2B client leads instantly.</p>
      </div>

      <div className="glass p-8 rounded-2xl border border-slate-700/50">
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}
        <form onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Business Type</label>
            <input required type="text" value={businessType} onChange={e => setBusinessType(e.target.value)} placeholder="e.g. Software Company" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Location</label>
            <input required type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Austin, Texas" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Country</label>
            <input required type="text" value={country} onChange={e => setCountry(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Max Results</label>
            <input required type="number" value={maxResults} onChange={e => setMaxResults(parseInt(e.target.value))} max="200" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 outline-none" />
          </div>
          <div className="md:col-span-4 flex justify-end">
            <button 
              type="submit" 
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-8 py-3 rounded-lg font-medium transition-all shadow-lg shadow-blue-500/25 flex items-center space-x-2"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
              <span>{loading ? "Searching..." : "Find Client Leads"}</span>
            </button>
          </div>
        </form>

        {loading && !error && (
          <div className="mt-8 p-6 bg-slate-900/50 rounded-xl border border-blue-500/20 flex flex-col items-center justify-center space-y-4">
            <AiAgentWorking text={progress} />
          </div>
        )}
      </div>

      {leads.length > 0 && (
        <div className="glass rounded-2xl border border-slate-700/50 overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex justify-between items-center">
            <h3 className="text-xl font-semibold text-white">Results ({leads.length})</h3>
            <div className="flex space-x-3">
              <button onClick={handleExportCSV} className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors">
                <Download size={16} />
                <span>Export CSV ({selectedLeads.length})</span>
              </button>
              <button onClick={openCampaignModal} className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors shadow-lg shadow-purple-500/25">
                <Plus size={16} />
                <span>Add to Campaign ({selectedLeads.length})</span>
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4 font-medium w-12">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-600 bg-slate-800"
                      checked={selectedLeads.length === leads.length && leads.length > 0}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th className="px-6 py-4 font-medium">Business Name</th>
                  <th className="px-6 py-4 font-medium">Contact</th>
                  <th className="px-6 py-4 font-medium">Email</th>
                  <th className="px-6 py-4 font-medium">Score</th>
                  <th className="px-6 py-4 font-medium">Tier</th>
                  <th className="px-6 py-4 font-medium">AI Insight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-600 bg-slate-800"
                        checked={selectedLeads.includes(lead.id)}
                        onChange={() => handleSelect(lead.id)}
                      />
                    </td>
                    <td className="px-6 py-4 font-medium text-white">{lead.name}</td>
                    <td className="px-6 py-4">
                      <div>{lead.phone}</div>
                      <div className="text-xs text-slate-500">{lead.website || 'No website'}</div>
                    </td>
                    <td className="px-6 py-4">
                      {lead.email ? (
                        <a
                          href={`mailto:${lead.email}`}
                          className="text-blue-400 hover:text-blue-300 text-xs font-mono underline underline-offset-2 transition-colors"
                        >
                          {lead.email}
                        </a>
                      ) : (
                        <span className="text-slate-600 text-xs">Not found</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-blue-400">{lead.score}</span>/100
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        lead.tier === 'Hot' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                        lead.tier === 'Warm' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                        'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                        {lead.tier}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs max-w-xs truncate" title={lead.insight}>
                      {lead.insight}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal for adding to campaign */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 p-8 rounded-2xl max-w-md w-full shadow-2xl relative">
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
              <X size={20} />
            </button>
            <h3 className="text-2xl font-bold text-white mb-2">Add to Campaign</h3>
            <p className="text-slate-400 mb-6">Select a campaign to enroll {selectedLeads.length} leads.</p>
            
            <div className="space-y-4">
              <select 
                value={selectedCampaignId} 
                onChange={(e) => setSelectedCampaignId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-purple-500 outline-none"
              >
                <option value="">-- Select Campaign --</option>
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button 
                onClick={handleAddToCampaign}
                disabled={adding || !selectedCampaignId}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-4 py-3 rounded-lg font-medium transition-all shadow-lg shadow-purple-500/25 flex items-center justify-center space-x-2"
              >
                {adding ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
                <span>{adding ? "Adding..." : "Add Leads"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
